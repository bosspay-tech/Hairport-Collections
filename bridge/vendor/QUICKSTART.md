# Quick start

## 1. Verify the tarball

**macOS**

```bash
shasum -a 256 -c SHA256.txt
```

**Linux**

```bash
sha256sum -c SHA256.txt
```

If verification fails, do not install — request a fresh package from BossPay.

## 2. Install

This folder includes `bosspay-bridge-node-<version>.tgz`. Adjust the filename if your version differs.

```bash
npm install ./bosspay-bridge-node-1.0.0.tgz
```

Or in `package.json`:

```json
{
  "dependencies": {
    "@bosspay/bridge-node": "file:./bosspay-bridge-node-1.0.0.tgz"
  }
}
```

## 3. Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `BOSSPAY_BRIDGE_SECRET` | Yes | Must match the secret BossPay gives you for this integration. Never commit. |
| `BOSSPAY_API_BASE` | No | Defaults to `https://api.bosspay24.com`. |

**Supabase Edge:** also set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the txn mapping table — see `starters-reference/supabase-edge/README.md`.

## 4. Implement your gateway

Replace the mocks in `starters-reference/` with calls to your real SabPaisa / AirPay (or other) APIs. BossPay sends amounts in **paisa** (integer).

### Payer identity (`payer_first_name` / `payer_last_name`)

BossPay generates and **sanitizes** the payer name on the orchestrator side
(strips `.`, spaces, and every non-alpha character; caps at 24 chars; title-
cases the result) and sends it to your bridge on every `/collect` request.

```ts
// In your createCollection handler
async createCollection(req) {
  // BossPay (≥backend 2026-04) sends pre-sanitized [A-Za-z]+ names.
  // Pass them STRAIGHT into your PG payload — do NOT re-sanitize, do
  // NOT randomize a name locally. SabPaisa silently parks transactions
  // when payer names contain dots / spaces / specials.
  const payerFirst = req.payer_first_name ?? 'Aarav';
  const payerLast  = req.payer_last_name  ?? 'Sharma';

  const sabpaisaPayload = {
    // ...
    payerFirstName: payerFirst,
    payerLastName:  payerLast,
    payerEmail:     req.customer_email,
    payerMobile:    req.customer_phone,
  };
  // ...
}
```

Why this contract:
- `@bosspay/bridge-node` already validates these fields at the wire boundary
  (`[A-Za-z]+`, ≤24 chars). If anything else slips through, the request 400s
  before reaching your handler — you never see dirty data.
- `payer_first_name` / `payer_last_name` may be **absent** when an older
  BossPay backend talks to this bridge. In that case fall back to the safe
  default identity (`Aarav` / `Sharma`) — never invent a randomizer of your
  own, the orchestrator owns that responsibility.

## 5. HTTPS only (production)

Deploy the bridge behind **HTTPS**. BossPay calls your public URL from its servers.

## 6. What BossPay calls

After BossPay registers your bridge, their servers request (HMAC-signed):

- `{your-base-url}/wp-json/bosspay/v1/collect`
- `{your-base-url}/wp-json/bosspay/v1/payout`
- `{your-base-url}/wp-json/bosspay/v1/status/{id}`
- `{your-base-url}/wp-json/bosspay/v1/health`

Your **base URL** has no trailing slash. Examples:

- Supabase: `https://<project>.supabase.co/functions/v1/bosspay`
- Your own host: `https://bridge.example.com`

## 7. What you send BossPay

When your bridge is ready:

1. Your **public base URL** (as above).
2. Confirmation that **`BOSSPAY_BRIDGE_SECRET`** on your side matches the secret BossPay configured for you (they may send you the secret first, or ask you to set a specific value).

## 8. Payment gateway webhooks → BossPay

When your PG notifies you of payment success or failure, verify the PG’s own signature first, then call `bridge.forwardCallback(...)` from this package so BossPay receives the callback. Details: `node_modules/@bosspay/bridge-node/README.md` after install.

## Support

Use the integration channel BossPay gave you for this project.
