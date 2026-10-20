-- Sales (Philip, 20 Oct): Levi's follow-ups on his open quotes and on customers gone quiet, and every sales
-- email drafted (AI-written ones with their cost). His quotes stay in his quote calculator (SharePoint, read
-- only); only the board's own notes live here. Levi only (md): these are sales figures and his target.
create table public.quote_follow (
  sp_quote_id  integer primary key,            -- the Quotes list item in Factory Jobs
  quote_no     text not null default '',
  customer     text not null default '',
  state        text not null default 'open' check (state in ('open', 'lost')),
  lost_reason  text not null default '',
  next_on      date,                           -- follow up on
  note         text not null default '',
  updated_by   text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  updated_at   timestamptz not null default now()
);
create table public.sales_actions (
  id           bigint generated always as identity primary key,
  sp_quote_id  integer,                        -- a quote, or null for a customer
  customer     text not null,
  kind         text not null check (kind in ('email', 'call', 'note', 'lost', 'reopen')),
  note         text not null default '',
  created_by   text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at   timestamptz not null default now()
);
create index sales_actions_quote on public.sales_actions (sp_quote_id);
create index sales_actions_customer on public.sales_actions (customer, created_at desc);
create table public.sales_emails (
  id             bigint generated always as identity primary key,
  customer       text not null,
  kind           text not null check (kind in ('quote', 'checkin')),
  ai             boolean not null default false,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  cost_usd       numeric(10, 4),
  ok             boolean not null default true,
  error          text,
  created_by     text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at     timestamptz not null default now()
);
create index sales_emails_day on public.sales_emails (created_at desc) where ai;
alter table public.quote_follow enable row level security;
alter table public.sales_actions enable row level security;
alter table public.sales_emails enable row level security;
create policy quote_follow_md on public.quote_follow for all to authenticated using (public.is_md()) with check (public.is_md());
create policy sales_actions_md on public.sales_actions for all to authenticated using (public.is_md()) with check (public.is_md());
create policy sales_emails_md on public.sales_emails for select to authenticated using (public.is_md());
create policy sales_emails_md_add on public.sales_emails for insert to authenticated with check (public.is_md());
alter publication supabase_realtime add table public.quote_follow, public.sales_actions;
