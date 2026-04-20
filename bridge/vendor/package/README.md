# `@bosspay/bridge-node`

Private Node.js / Deno / Edge runtime toolkit that exposes the BossPay
bridge contract — four HMAC-signed HTTP endpoints + a callback forwarder —
so lenders running Supabase or plain Node can integrate their existing
SabPaisa / AirPay / … gateways with BossPay **without** changing anything
on the BossPay backend or rewriting their PG integrations.

Wire protocol is byte-for-byte identical to the
[BossPay WordPress bridge plugin](../../plugins/bosspay-bridge/), which
means BossPay's [`WordPressBridgeAdapter`](../pg-adapters/src/adapters/wordpress-bridge.ts)
talks to this package unchanged — admins just point
`lender_pgs.credentials.wp_base_url` at your Node server.

## Prerequisites (your 6-item checklist)

Before wiring this in, your own PG integration must be able to:

1. Accept an externally-provided `txn_id` (BossPay's UUID) and use it as the
   merchant order reference.
2. Honor an externally-provided `redirect_url` — the PG must send the
   customer back there after payment.
3. Work in **paisa** (integer). If your PG needs rupees, convert at your
   handler's boundary.
4. Pick PG credentials per `merchant_id` (no hardcoded single-account
   deployments — BossPay's multi-tenant routing requires this).
5. Forward the PG's async webhook to BossPay via
   `bridge.forwardCallback(...)` after verifying the PG's own signature.
6. Return the PG's native transaction status (`success` / `failed` /
   `pending`) on demand via `checkStatus`.

If any of these is not true today, plan that refactor first — the bridge
cannot paper over it.

## Install (from tarball — private distribution)

BossPay will hand you a tarball out-of-band:

```bash
# The filename encodes the version; check the SHA-256 against what BossPay shared.
sha256sum bosspay-bridge-node-1.0.0.tgz

# Install directly from the tarball:
npm install /absolute/path/to/bosspay-bridge-node-1.0.0.tgz
# ...or pin in your package.json:
#   "@bosspay/bridge-node": "file:./vendor/bosspay-bridge-node-1.0.0.tgz"
```

No npm registry, no git URL, no private registry. Upgrades = new tarball.

## Environment variables

| Variable                       | Required | Purpose                                                                 |
| ------------------------------ | -------- | ----------------------------------------------------------------------- |
| `BOSSPAY_BRIDGE_SECRET`        | Yes      | Shared HMAC secret. Matches `lender_pgs.credentials.bridge_secret` on BossPay. |
| `BOSSPAY_API_BASE`             | No       | Defaults to `https://api.bosspay24.com`. Override for staging.          |
| `SUPABASE_URL`                 | Supabase | Your project URL, for `SupabaseTxnStore`.                               |
| `SUPABASE_SERVICE_ROLE_KEY`    | Supabase | Service role key (server-side only, never expose to clients).           |

## Wire it up

### 1. Implement handlers (30-50 LOC per PG)

```ts
// your-app/bosspay-handlers.ts
import type { BridgeHandlers } from '@bosspay/bridge-node';
import { createSabPaisaOrder, getSabPaisaStatus } from './lib/sabpaisa';

export const handlers: BridgeHandlers = {
  sabpaisa: {
    createCollection: async (r) => {
      const out = await createSabPaisaOrder({
        orderId: r.txn_id,
        amountPaise: r.amount,
        customer: { email: r.customer_email, phone: r.customer_phone },
        returnUrl: r.redirect_url,
      });
      return {
        payment_url: out.url,
        pg_transaction_id: out.spTxnId,
        mode: 'redirect',
      };
    },
    checkStatus: async (r) => {
      const s = await getSabPaisaStatus(r.pg_txn_id);
      return { status: s.status, pg_transaction_id: r.pg_txn_id, amount: s.amountPaise };
    },
    isAvailable: async () => true,
  },
};
```

### 2. Host the bridge

**Supabase Edge Function** — see [`starters/supabase-edge/`](starters/supabase-edge/):

```ts
import { createBossPayBridge } from '@bosspay/bridge-node';
import { SupabaseTxnStore } from '@bosspay/bridge-node/txnStore/supabase';
import { createClient } from '@supabase/supabase-js';
import { handlers } from './_handlers.ts';

const bridge = createBossPayBridge({
  bridgeSecret: Deno.env.get('BOSSPAY_BRIDGE_SECRET')!,
  bosspayApiBase: 'https://api.bosspay24.com',
  handlers,
  txnStore: new SupabaseTxnStore({
    client: createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  }),
});
Deno.serve(bridge.fetch);
```

Apply `starters/supabase-edge/supabase/migrations/0001_bosspay_txns.sql`.
Deploy with `supabase functions deploy bosspay --no-verify-jwt`.

**Plain Node + Express** — see [`starters/express/`](starters/express/):

```ts
import express from 'express';
import { createBossPayBridge, MemoryTxnStore, toExpress } from '@bosspay/bridge-node';
import { handlers } from './handlers.js';

const bridge = createBossPayBridge({
  bridgeSecret: process.env.BOSSPAY_BRIDGE_SECRET!,
  bosspayApiBase: 'https://api.bosspay24.com',
  handlers,
  txnStore: new MemoryTxnStore(),
});

const app = express();
app.all('/wp-json/bosspay/v1/*', toExpress({
  ctx: { handlers, txnStore: new MemoryTxnStore(), bosspayApiBase: 'https://api.bosspay24.com', version: '1.0.0' },
  bridgeSecret: process.env.BOSSPAY_BRIDGE_SECRET!,
}));
app.listen(3000);
```

> **Do not put `express.json()` in front of the bridge route.** The bridge
> needs raw bytes to verify the HMAC signature.

### 3. Forward the PG's webhook to BossPay

In your existing PG webhook handler, after you verify the PG's own
signature, call `bridge.forwardCallback(...)`:

```ts
app.post('/webhooks/sabpaisa', express.raw({ type: '*/*' }), async (req, res) => {
  const parsed = parseSabPaisaWebhook(req.body, req.headers); // your existing verifier
  await bridge.forwardCallback({
    pgType: 'sabpaisa',
    pgTransactionId: parsed.spTxnId,
    payload: {
      status: parsed.status,
      pg_transaction_id: parsed.spTxnId,
      amount: parsed.amountPaise,
      metadata: parsed.raw,
    },
  });
  res.sendStatus(200);
});
```

The forwarder:

- Looks up the `pg_transaction_id` → `{ txn_id, pg_type, callback_url }`
  mapping that was persisted at `/collect` time.
- POSTs an HMAC-signed JSON body to
  `{BOSSPAY_API_BASE}/callbacks/{pg_type}/{txn_id}`.
- Retries on 5xx / network errors (exponential backoff, 3 attempts default).

## Tell BossPay admin

Ask BossPay to configure your lender PG row like:

```json
{
  "pg_type": "sabpaisa",
  "credentials": {
    "wp_base_url": "https://<your-public-host>",
    "bridge_secret": "<shared-secret>"
  }
}
```

- For Supabase Edge: `wp_base_url = https://<project>.supabase.co/functions/v1/bosspay`
- For Node / Express: `wp_base_url = https://bridge.yourdomain.com` (no trailing slash)

BossPay will hit `{wp_base_url}/wp-json/bosspay/v1/{collect|payout|status|health}`.
The bridge matches any path ending in `/bosspay/v1/...`, so both
`/wp-json/bosspay/v1/...` and bare `/bosspay/v1/...` work.

## Smoke test

```bash
ts="$(date +%s%3N)"
sig="$(printf '%s' "$ts" | openssl dgst -sha256 -hmac "$BOSSPAY_BRIDGE_SECRET" -hex | awk '{print $2}')"
curl -v \
  -H "X-BossPay-Timestamp: $ts" \
  -H "X-BossPay-Bridge-Signature: $sig" \
  "$YOUR_PUBLIC_URL/wp-json/bosspay/v1/health"
```

Expected: `200 { "status": "ok", ..., "enabled_pgs": ["sabpaisa"], "pg_status": { "sabpaisa": true } }`.

## Troubleshooting

| Response                                    | Likely cause                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `403 {"error":"Invalid signature"}`         | `BOSSPAY_BRIDGE_SECRET` mismatch. Whitespace counts — the bridge `trim()`s the secret, but double-check your env var. |
| `404 {"error":"Not found"}`                 | URL does not end in `/bosspay/v1/{route}`. Recheck the admin-configured `wp_base_url`. |
| `400 {"error":"PG_NOT_CONFIGURED"}`         | `pg_type` in the request has no matching key in your `BridgeHandlers`.   |
| `400 {"error":"INVALID_REQUEST"}`           | Body failed Zod validation — check field names, types, amount in paisa.  |
| `501 {"error":"PAYOUT_NOT_IMPLEMENTED"}`    | You didn't implement `createPayout`; BossPay will mark the payout failed. |
| `CALLBACK_FORWARD_FAILED`                   | BossPay backend unreachable or returning 5xx. Check `BOSSPAY_API_BASE`. |
| `TXN_MAPPING_NOT_FOUND` on forward          | The PG webhook arrived before (or without) a matching `/collect`. Common in test harnesses — send an actual `/collect` first. |

## Upgrading

1. BossPay sends a new tarball (`bosspay-bridge-node-<version>.tgz`).
2. Verify SHA-256 against the hash BossPay shared.
3. `npm install /path/to/new.tgz` — replaces the old one.
4. Rebuild / redeploy.

## What this package does NOT do

- No public npm publishing, no git-URL installs, no private registry.
- No bundled PG clients — you keep your SabPaisa / AirPay code as-is.
- No refunds (not in the BossPay bridge contract yet).
- No payout defaults — lender must implement `createPayout` if the PG supports it.
- No React checkout widget — hosted by BossPay separately on roadmap.
