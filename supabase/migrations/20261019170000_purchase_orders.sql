-- Purchase orders (Levi, 19 Oct): raised from a sales order for bought-in parts or outside work, sent to
-- Xero as a DRAFT purchase order with the SO number as its reference, for Keith to match against the
-- supplier's invoice. Written only by the xero edge function (service role) once Xero has accepted it.
create table public.purchase_orders (
  id            bigint generated always as identity primary key,
  job_id        bigint not null references public.jobs on delete cascade,
  xero_id       text not null unique,
  po_number     text not null default '',
  supplier_id   text not null,
  supplier_name text not null,
  delivery_date date,
  lines         jsonb not null,               -- [{ description, qty, unit }]
  net           numeric(12, 2) not null,
  created_by    text not null,
  created_at    timestamptz not null default now()
);
create index purchase_orders_job on public.purchase_orders (job_id);
alter table public.purchase_orders enable row level security;
create policy purchase_orders_office on public.purchase_orders for select to authenticated using (public.is_office());
alter publication supabase_realtime add table public.purchase_orders;
