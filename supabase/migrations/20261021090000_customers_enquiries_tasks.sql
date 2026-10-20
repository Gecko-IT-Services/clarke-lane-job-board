-- Customers, enquiries and tasks (Philip, 20 Oct): Clarke Lane has no CRM, sales team or marketing. Each
-- customer gets one page (orders, invoices, quotes, emails, tasks and notes); website enquiries to info@ are
-- read and sorted by AI into a list with how long each has waited; tasks and follow-ups show on Home.
-- Emails themselves are never copied here: the board reads them live from Outlook. Office (Levi and Mandy).

-- Tasks and follow-ups, for Levi or Mandy, usually about a customer.
create table public.tasks (
  id            bigint generated always as identity primary key,
  title         text not null check (length(trim(title)) > 0),
  customer      text not null default '',
  customer_key  text not null default '',
  due_on        date not null,
  assigned_to   text not null,                 -- staff email
  source        text not null default '',      -- 'enquiry', 'email', 'quote' or ''
  source_ref    text not null default '',
  note          text not null default '',
  done_at       timestamptz,
  done_by       text,
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now(),
  check ((done_at is null) = (done_by is null))
);
create index tasks_open on public.tasks (due_on) where done_at is null;
create index tasks_customer on public.tasks (customer_key);
alter table public.tasks enable row level security;
create policy tasks_office on public.tasks for all to authenticated using (public.is_office()) with check (public.is_office());

-- Emails to info@ the board has looked at: one row per message (the message id stops two people reading it
-- twice), with what the AI made of it and what was done about it. The email stays in Outlook.
create table public.enquiries (
  id            bigint generated always as identity primary key,
  message_id    text not null unique,          -- Outlook's internetMessageId
  graph_id      text not null default '',
  mailbox       text not null,
  received_at   timestamptz not null,
  from_name     text not null default '',
  from_email    text not null default '',
  subject       text not null default '',
  web_link      text not null default '',
  kind          text check (kind in ('enquiry', 'customer', 'other')),   -- null while it is being read
  summary       text not null default '',
  company       text not null default '',
  person        text not null default '',
  phone         text not null default '',
  wants         text not null default '',
  has_drawings  boolean not null default false,
  customer_key  text not null default '',
  status        text not null default 'new' check (status in ('new', 'replied', 'quoted', 'won', 'lost', 'ignored')),
  handled_by    text,
  handled_at    timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);
create index enquiries_received on public.enquiries (received_at desc);
alter table public.enquiries enable row level security;
create policy enquiries_office on public.enquiries for all to authenticated using (public.is_office()) with check (public.is_office());

-- A customer's AI summary (Levi only), kept so it is not rewritten every visit.
create table public.customer_insights (
  customer_key  text primary key,
  customer      text not null,
  summary       text not null,
  next_step     text not null default '',
  model         text not null default '',
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now()
);
alter table public.customer_insights enable row level security;
create policy customer_insights_md on public.customer_insights for all to authenticated using (public.is_md()) with check (public.is_md());

-- Calls and notes now show on the customer page for Mandy too (no money in them).
drop policy sales_actions_md on public.sales_actions;
create policy sales_actions_office on public.sales_actions for all to authenticated using (public.is_office()) with check (public.is_office());
alter table public.sales_actions drop constraint sales_actions_kind_check;
alter table public.sales_actions add constraint sales_actions_kind_check check (kind in ('email', 'call', 'note', 'lost', 'reopen', 'visit'));

-- Every AI email or reading is logged with its cost.
alter table public.sales_emails drop constraint sales_emails_kind_check;
alter table public.sales_emails add constraint sales_emails_kind_check check (kind in ('quote', 'checkin', 'enquiry', 'reply', 'summary', 'news'));

alter publication supabase_realtime add table public.tasks, public.enquiries;
