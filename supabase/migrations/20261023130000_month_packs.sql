-- Keith's monthly pack (Philip, 23 Oct): the AI's analysis of a month's management accounts, kept so the pack reads
-- the same next time and is not paid for twice. Written only by the sales-ai function (service role); read only by
-- the accounts login. The AI call is logged with its cost like every other (sales_emails kind 'monthpack').
-- Re-runnable.
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

alter table public.sales_emails drop constraint if exists sales_emails_kind_check;
alter table public.sales_emails add constraint sales_emails_kind_check
  check (kind in ('quote', 'checkin', 'enquiry', 'reply', 'summary', 'news', 'research', 'ideas', 'quotepack', 'digest', 'monthpack'));
