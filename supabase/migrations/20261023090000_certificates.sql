-- Certificates of conformity (Philip, 23 Oct: a customer's PO asked for "a Certificate of Conformity and Country of
-- Origin"). One per dispatch note: each part's material and certificate or batch number, the country of origin and who
-- signed it, so it prints the same every time. customer_cocs: customers who want one with every delivery.
-- Office only (Levi and Mandy). Re-runnable.
create table if not exists public.despatch_cocs (
  despatch_id bigint primary key references public.despatches on delete cascade,
  lines       jsonb not null default '{}'::jsonb,          -- { "<job_line_id>": { "material": "S275", "batch": "H123456" } }
  origin      text not null default 'United Kingdom',
  signed_by   text not null default '',
  position    text not null default '',
  issued_at   timestamptz not null default now(),
  issued_by   text not null default public.current_email(),
  emailed_at  timestamptz
);
alter table public.despatch_cocs enable row level security;
drop policy if exists despatch_cocs_office on public.despatch_cocs;
create policy despatch_cocs_office on public.despatch_cocs
  for all to authenticated using (public.is_office()) with check (public.is_office());

create table if not exists public.customer_cocs (
  customer_key text primary key,                            -- the customer name normalised (src/core/xero.js normName)
  set_by       text not null default public.current_email(),
  set_at       timestamptz not null default now()
);
alter table public.customer_cocs enable row level security;
drop policy if exists customer_cocs_office on public.customer_cocs;
create policy customer_cocs_office on public.customer_cocs
  for all to authenticated using (public.is_office()) with check (public.is_office());
