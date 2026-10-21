-- SharePoint files (Philip, 21 Oct): a customer's folders in the Company Data site (their client folder and their
-- laser drawings folder). Most are found by name; this keeps the ones linked by hand where the names differ,
-- and "none" (item_id null) so a wrong near-match is not offered again. Only the link: no file is copied.
create table public.customer_folders (
  customer_key   text not null,
  kind           text not null check (kind in ('client', 'laser')),
  customer       text not null default '',
  name           text not null default '',
  drive_id       text,
  item_id        text,                          -- null: this customer has no folder of this kind
  web_url        text not null default '',
  linked_by      text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  linked_at      timestamptz not null default now(),
  primary key (customer_key, kind)
);
alter table public.customer_folders enable row level security;
create policy customer_folders_office on public.customer_folders for all to authenticated using (public.is_office()) with check (public.is_office());
