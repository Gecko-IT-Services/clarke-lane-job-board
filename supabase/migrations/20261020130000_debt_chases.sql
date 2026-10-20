-- Aged debt chases (Philip, 20 Oct): when Levi or Mandy drafts a chase email for a customer with
-- invoices over 60 days, the board notes it so nobody chases twice in the same week. The email itself
-- is only ever an Outlook draft; the invoices and amounts come from Xero, read only.
create table public.debt_chases (
  id          bigint generated always as identity primary key,
  customer    text not null,
  contact_id  text not null default '',
  invoices    jsonb not null,                 -- [{ number, owed }]
  owed        numeric(12, 2) not null,
  chased_by   text not null,
  chased_at   timestamptz not null default now()
);
create index debt_chases_customer on public.debt_chases (customer, chased_at desc);
alter table public.debt_chases enable row level security;
create policy debt_chases_read on public.debt_chases for select to authenticated using (public.is_office());
create policy debt_chases_add on public.debt_chases for insert to authenticated with check (public.is_office());
