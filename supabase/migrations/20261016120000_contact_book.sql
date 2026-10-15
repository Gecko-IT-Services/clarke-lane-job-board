-- The board's own contact book (Philip, 15 Oct): Xero's contacts are often the customer's accounts
-- people, not who operations deal with. Per customer: the people (orders/buyer, goods in/deliveries,
-- accounts, other) and the delivery addresses. Xero is never changed; it stays the fallback.
-- customer_key = the customer name normalised (src/core/xero.js normName), as in customer_contacts.

create table public.customer_people (
  id            bigint generated always as identity primary key,
  customer_key  text not null,
  customer_name text not null,
  role          text not null check (role in ('orders', 'deliveries', 'accounts', 'other')),
  name          text not null default '',
  email         text not null default '',
  phone         text not null default '',
  notes         text not null default '',
  main          boolean not null default false,          -- the one to use first for this role
  updated_by    text not null default public.current_email(),
  updated_at    timestamptz not null default now()
);
create index customer_people_key on public.customer_people (customer_key);
alter table public.customer_people enable row level security;
create policy customer_people_office on public.customer_people
  for all to authenticated using (public.is_office()) with check (public.is_office());

create table public.customer_sites (
  id            bigint generated always as identity primary key,
  customer_key  text not null,
  customer_name text not null,
  label         text not null default '',                 -- e.g. "Goods in, Unit 4"
  address       text not null,
  site_contact  text not null default '',
  phone         text not null default '',
  main          boolean not null default false,           -- the usual delivery address
  updated_by    text not null default public.current_email(),
  updated_at    timestamptz not null default now()
);
create index customer_sites_key on public.customer_sites (customer_key);
alter table public.customer_sites enable row level security;
create policy customer_sites_office on public.customer_sites
  for all to authenticated using (public.is_office()) with check (public.is_office());

alter publication supabase_realtime add table public.customer_people;
alter publication supabase_realtime add table public.customer_sites;
