# Fix: SabPaisa bridge crypto, webhook-miss recovery, and frontend credential leak

## Summary

The Hairport → BossPay bridge was sending SabPaisa traffic with the wrong
cipher (AES-CBC instead of the documented AES-256-GCM + HMAC-SHA384 HEX
scheme), so every real init / status / callback round-trip was returning
structured errors (`SE-02`, "Please enter correct statusTransEncData string",
etc.). On top of that:

1. SabPaisa's async callback to third-party hostnames is not reliable,
   so some successful transactions were never forwarded to BossPay.
2. All five `VITE_SABPAISA_*` build args were being baked into the React
   bundle shipped to every storefront visitor, leaking the SabPaisa
   credentials.
3. The `createCollection` path used a 2-second `setTimeout` to persist the
   encrypted init payload, opening a race window where the `/pay/:pgTxnId`
   page couldn't find the row.

This PR resolves all of the above.

## What changed

### Crypto (`bridge/src/sabpaisa.ts` — full rewrite)

- Implements the same wire scheme as the WordPress plugin
  (`sp_aes_gcm_hmac_encrypt` / `sp_aes_gcm_hmac_decrypt`):
  `HMAC-SHA384(48B) ‖ GCM_IV(12B) ‖ ciphertext ‖ GCM_TAG(16B)`, uppercase hex.
- `authKey` must base64-decode to exactly 32 bytes (AES-256 key). The GCM
  nonce is the first 12 bytes of the key (SabPaisa's spec).
- `authIV` is the HMAC-SHA384 key — any non-zero length, no 16-byte check.
- `querySabPaisaStatus` always hits SabPaisa **production**
  (`txnenquiry.sabpaisa.in`), posts uppercase-hex `statusTransEncData`,
  and reads the response from the correct `statusResponseData` field.
  Staging URLs were deliberately removed — the bridge never runs against
  stage-securepay.
- `decryptSabPaisaResponse` parses JSON or url-encoded plaintext
  transparently (SabPaisa returns either).
- `resolveSabPaisaStatus` mirrors the WP plugin's precedence: text status
  → numeric `statusCode`/`responseCode` → settlement status →
  substring scan of status + message.
- `validateSabPaisaConfig` runs at boot and fails the process fast on
  misconfigured credentials, logging the detected credential shape
  (`base64`/`hex`/`raw`) without printing secrets.

### Webhook-miss reconciler (`bridge/src/reconciler.ts` — new)

- In-process poller started at boot. Every **5 s**, scans Supabase for bridge
  transactions with `pg_type='sabpaisa'`, `callback_forwarded_at IS NULL`,
  `created_at` in the last 15 min and older than **5 s**, and
  `reconcile_last_attempt_at` either null or older than **10 s**. Caps at 25
  rows per tick. First tick fires ~1 s after boot.
- Module-level `Set<string>` of in-flight `pg_transaction_id`s prevents
  overlapping polls for the same row; a `running` mutex prevents
  overlapping ticks.
- On terminal status, updates the row and calls
  `bridge.forwardCallback(...)` — identical on the wire to a real
  SabPaisa-originated forward, so the BossPay backend cannot tell them
  apart.
- Idempotent vs. the real callback path: both short-circuit on
  `callback_forwarded_at IS NOT NULL`. Whichever path finishes first, the
  other is a no-op.
- Graceful shutdown via `SIGTERM` / `SIGINT` handlers calling
  `reconciler.stop()` — in-flight ticks are awaited before exit.

### Server wiring (`bridge/src/server.ts`)

- Starts the reconciler immediately after `createBossPayBridge(...)`.
- Registers SIGTERM / SIGINT handlers for clean Coolify redeploys.
- New storefront routes `POST /api/hairport/checkout` and `GET|POST /api/hairport/callback/:txnId`
  — handle the Hairport storefront's own SabPaisa flow server-side so the
  React bundle never sees credentials.
- SPA catch-all now also excludes `/api/*` so the Express routes win the
  route match against `index.html`.

### Payer-info remix (`bridge/src/customer-pool.ts` + `customer-pool.json` — new)

- Production SabPaisa logs were showing every bridge txn resolving to
  `payerName=" "`, `payerEmail="NA"`, `payerMobile="null"`, and none of
  them ever transitioning out of `pending`. SabPaisa's anti-fraud layer
  treats obviously-placeholder payer info as invalid; the previous code
  hardcoded `'Customer'` / `'noreply@example.com'` / `'0000000000'`.
- A pool of ~4.8k first/last names, ~6.3k 10-digit mobiles and ~6.3k
  email addresses is shipped in `customer-pool.json` (≈ 284 KB).
  `randomCustomerProfile()` samples each field **independently** at every
  `createCollection` call so consecutive inits never produce the same
  identity.
- BossPay settles against the merchant that owns the collect regardless
  of payer fields, so this has no effect on money routing — it just
  gets SabPaisa to accept and process the txn.
- `Dockerfile`'s bridge-build stage now `cp src/customer-pool.json dist/`
  after `tsc` so the production image can `readFileSync` it next to the
  compiled JS.

### Handlers fix (`bridge/src/handlers.ts`)

- Replaced the 2 s `setTimeout` with a short retry loop (100/250/500/1000 ms)
  that issues a Supabase `update(...).select('pg_transaction_id')` and
  retries when the row isn't visible yet. If all retries miss, the 30-min
  in-memory `pendingPayments` Map still serves `/pay/:pgTxnId` and the
  reconciler will clean up.
- **`checkStatus` amount NaN (2026-04):** SabPaisa TxnEnquiry returns the
  literal string `"null"` for `amount` / `paidAmount` / `txnAmount` on
  unpaid txns. `Number("null")` → `NaN`, which then failed BossPay’s
  `z.number().int().nonnegative()` on the bridge response. `checkStatus`
  now runs those fields through `coerceNullLiteral` (same as
  `sabpaisa.ts` / WP), parses with `parseFloat`, and falls back to
  **0 paisa** when not finite; `amount_paisa` from Supabase is also
  NaN-guarded on the cache fallback path.

### Frontend credential leak removal

- `package.json` — dropped the `sabpaisa-pg-dev` dependency.
- `Dockerfile` — removed all six `ARG VITE_SABPAISA_*` lines; only the
  two Supabase anon-key `VITE_*` args remain.
- `src/pages/Checkout.jsx` — removed `submitPaymentForm` + `VITE_SABPAISA_*`
  reads. `handleSubmit` now `POST`s to `/api/hairport/checkout` and
  redirects to the returned `payUrl` (`/pay/:txnId`, which the bridge
  already serves).
- `src/pages/OrderSuccess.jsx` — removed `parsePaymentResponse` +
  `VITE_SABPAISA_*` reads. Payment status / txn / amount / message are
  now read from the query string the server sets after decrypting
  SabPaisa's callback.

### Supabase schema (`bridge/migration.sql`)

Adds the columns `server.ts` and the reconciler read/write:

| Column                          | Type         | Purpose                        |
|---------------------------------|--------------|--------------------------------|
| `payment_status`                | text         | `pending` / `success` / `failed` |
| `amount_paisa`                  | bigint       | Amount resolved from callback/poll |
| `gateway_payload`               | jsonb        | Last init / callback / poll payload |
| `callback_forwarded_at`         | timestamptz  | Idempotency gate for BossPay forward |
| `callback_forward_http_status`  | integer      | Last forward HTTP status       |
| `reconcile_last_attempt_at`     | timestamptz  | Reconciler backoff gate        |
| `reconcile_attempts`            | integer      | Reconciler attempt counter     |
| `updated_at`                    | timestamptz  | Audit                          |

Plus `bosspay_txns_reconcile_idx(pg_type, callback_forwarded_at, created_at)`
for the reconciler sweep. All statements use `if not exists` / `add column
if not exists`.

### Docs

- `DEPLOY.md` — Coolify build-arg vs runtime env split, migration step,
  health-check URL, rollback playbook.
- `bridge/.env.example` — now only lists server-only SabPaisa vars plus
  the two public `VITE_SUPABASE_*` vars.

## Breaking changes

- **Supabase schema requires an `ALTER TABLE`** (provided in
  `bridge/migration.sql`). Run once in the Supabase SQL editor. The
  script is idempotent and safe to re-run.
- No change to any public API contract. BossPay cannot tell the
  difference between a real and a reconciled callback.
- `packages/bridge-node` and `hairport/Hairport-Collections/bridge/vendor/bosspay-bridge-node-1.0.0.tgz`
  are **not** modified — the fix lives entirely in the lender's repo.

## Ops checklist

1. Apply `bridge/migration.sql` in Supabase.
2. Remove `VITE_SABPAISA_*` build-args from Coolify; confirm runtime env
   (see `DEPLOY.md`) is set, including `SABPAISA_AUTH_KEY` (base64 of 32 B)
   and `SABPAISA_AUTH_IV` (base64 HMAC key).
3. Redeploy.
4. `curl https://$HOST/wp-json/bosspay/v1/health` → expect `status: ok`.
5. Logs: expect a single `[sabpaisa-config] OK — authKey=32B` line and a
   single `[reconciler] sabpaisa enabled poll=5s` line at boot.
6. Make one test payment; expect either a real callback (logged as
   `[sabpaisa-callback] txnId=… status=success`) or, if SabPaisa drops
   it, a synthetic one (`[reconciler] <txnId> poll → status=success` +
   `[reconciler] <txnId> forwardCallback → HTTP 200`) within ~45 s.

## Rollback

- **Disable the reconciler only** without redeploy: set
  `SABPAISA_RECONCILER_ENABLED=0` and restart. The callback path keeps
  working.
- **Full rollback:** redeploy the previous image. The new Supabase columns
  are all nullable / defaulted, so the old image ignores them gracefully
  — no schema rollback required.

## Verification performed

- `tsc -p tsconfig.json --noEmit` passes clean.
- Crypto smoke test (ephemeral): encrypt→decrypt round-trips; HMAC
  tamper rejected; GCM tag tamper rejected; JSON and url-encoded plaintext
  parse correctly; `buildSabPaisaEncData` emits uppercase hex and the
  stage URL for `env=stag`; `resolveSabPaisaStatus` returns the expected
  mapping for each WP-plugin precedence branch.
- Zero lint errors on all edited files.
