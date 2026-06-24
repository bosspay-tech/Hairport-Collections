-- Hairport storefront schema (run once in Supabase SQL Editor)

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id text not null default 'all-store',
  title text not null,
  description text,
  base_price numeric(12, 2) not null default 0,
  mrp numeric(12, 2),
  image_url text,
  categories text[] default '{}',
  badge text,
  rating numeric(3, 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id text not null default 'all-store',
  user_id uuid references auth.users (id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total numeric(12, 2) not null default 0,
  transaction_id text,
  status text not null default 'pending',
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_address text,
  customer_city text,
  customer_state text,
  customer_pincode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_store_active_idx
  on public.products (store_id, is_active, created_at desc);

create index if not exists orders_user_store_idx
  on public.orders (user_id, store_id, created_at desc);

alter table public.products enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
  on public.products for select
  using (is_active = true);

drop policy if exists "Users can read own orders" on public.orders;
create policy "Users can read own orders"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own orders" on public.orders;
create policy "Users can create own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access products" on public.products;
create policy "Service role full access products"
  on public.products for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role full access orders" on public.orders;
create policy "Service role full access orders"
  on public.orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
