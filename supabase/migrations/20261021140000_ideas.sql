-- Ideas (Philip, 21 Oct): AI suggestions for winning more work, from what the board knows about each customer
-- and from reading the customer's own website and public pages. Levi only, like the rest of the CRM tab.
-- customer_research: the latest reading of one customer's website and public pages (replaced each time).
create table public.customer_research (
  customer_key   text primary key,
  customer       text not null,
  website        text not null default '',
  about          text not null default '',
  news           jsonb not null default '[]',   -- [{ text, url }]
  openings       jsonb not null default '[]',   -- [{ idea, why, angle }]
  sources        jsonb not null default '[]',   -- [url]
  model          text not null default '',
  cost_usd       numeric(8,4),
  created_by     text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at     timestamptz not null default now()
);
alter table public.customer_research enable row level security;
create policy customer_research_md on public.customer_research for all to authenticated using (public.is_md()) with check (public.is_md());

-- sales_ideas: each idea from "Think of ideas", and what Levi did with it.
create table public.sales_ideas (
  id             bigint generated always as identity primary key,
  title          text not null check (length(trim(title)) > 0),
  why            text not null default '',
  action         text not null default 'other' check (action in ('email', 'call', 'visit', 'other')),
  angle          text not null default '',      -- what an email about it should say
  customer_key   text,
  customer       text not null default '',
  status         text not null default 'new' check (status in ('new', 'doing', 'done', 'no')),
  batch_at       timestamptz not null default now(),
  updated_by     text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at     timestamptz not null default now()
);
create index sales_ideas_batch on public.sales_ideas (batch_at desc);
alter table public.sales_ideas enable row level security;
create policy sales_ideas_md on public.sales_ideas for all to authenticated using (public.is_md()) with check (public.is_md());

alter table public.sales_emails drop constraint sales_emails_kind_check;
alter table public.sales_emails add constraint sales_emails_kind_check check (kind in ('quote', 'checkin', 'enquiry', 'reply', 'summary', 'news', 'research', 'ideas'));
