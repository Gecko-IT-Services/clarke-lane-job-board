-- Metal prices (Philip, 20 Oct): Clarke Lane buys aluminium and stainless from Aalco; this asks several
-- suppliers for the same metal at once (one Outlook draft each, never sent by the board), keeps the prices
-- they reply with side by side, and keeps every price so the next quote can be compared with the last.
-- Prices are office only (Levi and Mandy), like every other cost.
create table public.metal_rfqs (
  id            bigint generated always as identity primary key,
  job_id        bigint references public.jobs on delete set null,   -- the sales order it is for, if any
  lines         jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
                -- [{ material, grade, form, thickness, size, qty, unit }]
  note          text not null default '',
  status        text not null default 'open' check (status in ('open', 'ordered', 'closed')),
  ordered_from  text,
  ordered_po    text,
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now()
);
create table public.metal_quotes (
  id            bigint generated always as identity primary key,
  rfq_id        bigint not null references public.metal_rfqs on delete cascade,
  supplier_id   text not null default '',          -- the Xero contact, so the PO can go to them
  supplier      text not null check (length(trim(supplier)) > 0),
  email         text not null default '',
  asked_at      timestamptz,
  prices        jsonb,                             -- unit price per line, in line order (null = not quoted)
  carriage      numeric(12, 2),
  lead_days     integer check (lead_days is null or lead_days >= 0),
  valid_until   date,
  note          text not null default '',
  entered_by    text,
  entered_at    timestamptz,
  unique (rfq_id, supplier)
);
create index metal_quotes_rfq on public.metal_quotes (rfq_id);
alter table public.metal_rfqs enable row level security;
alter table public.metal_quotes enable row level security;
create policy metal_rfqs_office on public.metal_rfqs for all to authenticated using (public.is_office()) with check (public.is_office());
create policy metal_quotes_office on public.metal_quotes for all to authenticated using (public.is_office()) with check (public.is_office());
alter publication supabase_realtime add table public.metal_rfqs, public.metal_quotes;
