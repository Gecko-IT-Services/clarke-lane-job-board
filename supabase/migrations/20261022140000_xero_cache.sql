-- One shared memory for Xero's read answers (22 Oct). Xero allows the board 5,000 calls a day; each
-- browser and page load was asking again, and the limit ran out. The Xero edge function keeps each
-- answer here (history, debts, contacts, items, ...) for a while so one read serves everyone.
-- Re-runnable. Only the Xero connection (service role) reads or writes it.
create table if not exists public.xero_cache (
  key  text primary key,
  body jsonb not null,
  at   timestamptz not null default now()
);
alter table public.xero_cache enable row level security;
-- Only the Xero connection (service role) reads or writes it; nobody reads it from the browser
-- (some of it is Levi-only money, e.g. the month's invoices).
drop policy if exists xero_cache_nobody on public.xero_cache;
create policy xero_cache_nobody on public.xero_cache for select to authenticated using (false);
