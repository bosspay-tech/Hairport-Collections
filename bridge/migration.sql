-- Run this in your Supabase SQL Editor to create (and/or extend) the
-- `bosspay_txns` table. The base 5 columns are what `@bosspay/bridge-node`
-- (`SupabaseTxnStore`) reads/writes; the remaining columns are what this
-- bridge's `server.ts` and SabPaisa reconciler need for webhook-miss recovery.
--
-- Safe to re-run — every statement uses `if not exists` / `add column if not exists`.

create table if not exists public.bosspay_txns (
  pg_transaction_id text primary key,
  txn_id           text not null,
  pg_type          text not null,
  callback_url     text not null,
  created_at       timestamptz not null default now()
);

create index if not exists bosspay_txns_txn_id_idx
  on public.bosspay_txns (txn_id);

create index if not exists bosspay_txns_created_at_idx
  on public.bosspay_txns (created_at);

-- ── Webhook-delivery + reconciler columns ────────────────────────────

alter table public.bosspay_txns
  add column if not exists payment_status                text,
  add column if not exists amount_paisa                  bigint,
  add column if not exists gateway_payload               jsonb,
  add column if not exists callback_forwarded_at         timestamptz,
  add column if not exists callback_forward_http_status  integer,
  add column if not exists reconcile_last_attempt_at     timestamptz,
  add column if not exists reconcile_attempts            integer not null default 0,
  add column if not exists updated_at                    timestamptz not null default now();

-- Index supports the reconciler's per-tick sweep:
--   SELECT ... WHERE pg_type='sabpaisa' AND callback_forwarded_at IS NULL
--   AND created_at BETWEEN (now() - 15m) AND (now() - 10s)
create index if not exists bosspay_txns_reconcile_idx
  on public.bosspay_txns (pg_type, callback_forwarded_at, created_at);

-- ── UPI-intent direct-mint cache columns ────────────────────────────
-- Added for @bosspay/bridge-node 1.1.0. The `SupabaseTxnStore.setUpiIntent`
-- writes the cached `upi_qr_value` + `intent_tr` into `upi_intent` (as JSONB)
-- and the mint timestamp into `upi_minted_at` (epoch seconds). The bridge's
-- `handleUpiIntent` reads these back on every `/bosspay/v1/upi/:txnId` visit
-- and re-mints only when the cache is older than 10 minutes. The original
-- mint payload (encData / endpoint JSON / etc.) is also stored in the same
-- `upi_intent` JSONB under `inputs`, so a pod restart doesn't force a re-mint.
alter table public.bosspay_txns
  add column if not exists upi_intent     jsonb,
  add column if not exists upi_minted_at  bigint;

-- Partial index so cache-hit lookups on `/bosspay/v1/upi/:txnId` visits skip
-- the historical majority of rows that never opted into the UPI-intent path.
create index if not exists bosspay_txns_upi_minted_at_idx
  on public.bosspay_txns (upi_minted_at)
  where upi_minted_at is not null and upi_minted_at > 0;
