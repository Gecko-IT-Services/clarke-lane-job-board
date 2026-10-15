-- Xero sales orders are a one-off import at changeover (Philip, 15 Oct), not a live feed.
-- The office presses Import once on the Xero tab; the open sales orders are kept here and
-- offered on New orders until each is made into a job or marked not a job. Xero itself is
-- never changed. Running the import again only adds orders not already here.
create table public.xero_orders (
  xero_id      text primary key,
  so_number    text not null,
  customer     text not null default '',
  reference    text not null default '',
  xero_status  text not null default '',
  order_date   date,
  expiry       date,
  sub_total    numeric(14,2),
  lines        jsonb not null default '[]',      -- [{ description, qty, unit, amount }], prices: office only
  imported_by  text not null default public.current_email(),
  imported_at  timestamptz not null default now(),
  dismissed_by text,
  dismissed_at timestamptz
);
alter table public.xero_orders enable row level security;
create policy xero_orders_office on public.xero_orders
  for all to authenticated using (public.is_office()) with check (public.is_office());

alter publication supabase_realtime add table public.xero_orders;
