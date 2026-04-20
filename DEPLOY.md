# Deploying Hairport + BossPay bridge on Coolify

Two processes ship from the same image:

1. **React storefront** (static, served by the same Node server from `/`)
2. **BossPay bridge** (Express, handles `/wp-json/bosspay/v1/*`, `/pay/:pgTxnId`,
   `/webhooks/sabpaisa`, `/api/hairport/*`)

## 1. Coolify build arguments

These are baked into the frontend JS bundle and are fine to expose to browsers:

| Name                          | Source      |
|-------------------------------|-------------|
| `VITE_SUPABASE_URL`           | Supabase    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase — **anon** key, not service role |

**Do not** add `VITE_SABPAISA_*` build args. Any `VITE_*` variable ends up
hard-coded in every `.js` file shipped to customers' browsers. SabPaisa
credentials must never be exposed that way. The fix set all of SabPaisa's
init + decrypt work server-side; the frontend only calls `/api/hairport/*`.

## 2. Coolify runtime environment

Set these under "Environment Variables" (runtime — **not** build-args):

### BossPay bridge
- `BOSSPAY_BRIDGE_SECRET` — provided by BossPay ops
- `BRIDGE_BASE_URL` — public HTTPS URL of the deployed site (no trailing slash)
- `BOSSPAY_API_BASE` — optional, defaults to `https://api.bosspay24.com`

### Supabase (service role, server-side only)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### SabPaisa
- `SABPAISA_CLIENT_CODE`
- `SABPAISA_USERNAME`
- `SABPAISA_PASSWORD`
- `SABPAISA_AUTH_KEY` — base64 of **exactly 32 raw bytes** (AES-256 key)
- `SABPAISA_AUTH_IV` — base64 of any non-zero length (HMAC-SHA384 key)
- `SABPAISA_ENV` — informational only; the bridge always calls SabPaisa
  production (`securepay.sabpaisa.in` / `txnenquiry.sabpaisa.in`). Set to `prod`.

### Reconciler
- `SABPAISA_RECONCILER_ENABLED` — `1` (default). Set to `0` to disable polling
  without redeploying (e.g. during a SabPaisa outage that is returning bad data).

### Server
- `PORT` — default `3000`

## 3. Database migration

Run `bridge/migration.sql` in the Supabase SQL editor **once**. Every statement
is idempotent (`create table if not exists`, `add column if not exists`,
`create index if not exists`) so it is safe to re-run on every deploy.

## 4. Verifying the deploy

After Coolify restarts the container, check:

```
curl https://<BRIDGE_BASE_URL>/wp-json/bosspay/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "pg_status": { "sabpaisa": true },
  "version": "1.0.0"
}
```

Then tail the application logs for one of each of these lines:

- `[sabpaisa-config] OK — authKey=32B (base64) authIV=…B (…) cipher=aes-256-gcm+hmac-sha384`
  — confirms credentials decoded to the expected shapes.
- `[reconciler] sabpaisa enabled poll=5s window=15m minAge=5s backoff=10s maxPerRun=25`
  — confirms the callback-miss poller is running.
- On the first tick you should see either `[reconciler] tick picked 0 row(s)`
  (nothing in-flight, expected) or a `[reconciler] <txnId> poll → status=…` line.

## 5. Rollback

- **Disable the reconciler only:** set `SABPAISA_RECONCILER_ENABLED=0` and
  redeploy the same image. The callback path keeps working; only the
  "webhook-miss recovery" polling pauses.
- **Full rollback:** redeploy the previous image tag. The new Supabase columns
  are all nullable / defaulted, so the old image ignores them gracefully — no
  schema rollback needed.
