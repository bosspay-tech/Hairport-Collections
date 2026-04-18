-- Run this in your Supabase SQL Editor to create the bosspay_txns table.
-- The bridge's SupabaseTxnStore uses this table to map BossPay txn IDs
-- to payment gateway transaction IDs.

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
