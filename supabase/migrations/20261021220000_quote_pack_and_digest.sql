-- The quote pack and Three things today (Philip, 21 Oct: help win more work each month). Safe to run more than once.

-- The quote pack: an enquiry and its drawings read by AI into the parts, the questions to ask before quoting and what
-- to watch out for ({ summary, parts, questions, watchOut, files }). Kept on the enquiry so it is read once, not every
-- visit. No prices in it. The enquiries policy (office: Levi and Mandy) already covers these columns.
alter table public.enquiries add column if not exists quote_pack jsonb, add column if not exists quote_pack_at timestamptz;

-- Three things today: Home's three picks and the AI's sentence on each, built when Levi or Mandy first open the board
-- that day and kept for the day, one row per person (Levi's may carry a quote's or an order's value; Mandy's never
-- do, and each person can read only their own row).
create table if not exists public.daily_digests (
  user_email  text not null,
  day         date not null,
  picks       jsonb not null,                  -- [{ kind, id, title, facts, open: { attrs } }]
  greeting    text not null default '',
  lines       jsonb not null default '[]',     -- [sentence], one per pick, same order
  model       text not null default '',
  created_at  timestamptz not null default now(),
  primary key (user_email, day)
);
alter table public.daily_digests enable row level security;
drop policy if exists daily_digests_own on public.daily_digests;
create policy daily_digests_own on public.daily_digests for all to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email', '')) and public.is_office())
  with check (user_email = lower(coalesce(auth.jwt() ->> 'email', '')) and public.is_office());

-- Both are logged with their cost like every other AI call (sales-ai inserts its kind into sales_emails).
alter table public.sales_emails drop constraint if exists sales_emails_kind_check;
alter table public.sales_emails add constraint sales_emails_kind_check
  check (kind in ('quote', 'checkin', 'enquiry', 'reply', 'summary', 'news', 'research', 'ideas', 'quotepack', 'digest'));
