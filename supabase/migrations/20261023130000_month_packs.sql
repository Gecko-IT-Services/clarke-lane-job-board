-- Keith's monthly pack (Philip, 23 Oct): the AI's analysis of a month's management accounts, kept so the pack reads
-- the same next time and is not paid for twice. Written only by the sales-ai function (service role); read only by
-- the accounts login, and by nobody else: its cost is kept here too, not in the shared AI log (sales_emails), so not
-- even a line saying a pack was written is visible to another login. Re-runnable.
create table if not exists public.month_packs (
  month     text primary key check (month ~ '^\d{4}-\d{2}$'),   -- '2026-09'
  facts     jsonb not null,                                      -- the figures the analysis was written from
  analysis  jsonb not null,
  model     text not null default '',
  cost_usd  numeric not null default 0,
  made_at   timestamptz not null default now(),
  made_by   text not null default ''
);
alter table public.month_packs enable row level security;
drop policy if exists month_packs_accounts_read on public.month_packs;
create policy month_packs_accounts_read on public.month_packs for select to authenticated using (public.is_accounts());

