-- Parts library (Philip, 20 Oct): many customers order the same parts again and again. A part is a
-- customer's part number with its drawings (files in SharePoint, Factory Jobs › Documents › Part drawings ›
-- customer › part number). A new order whose line names a library part number for that customer gets the
-- part's current drawing linked automatically (job_files.part_file_id: the same SharePoint file, never a copy).
create table public.parts (
  id            bigint generated always as identity primary key,
  customer      text not null,
  customer_key  text not null,                 -- normName(customer), as the board matches customers
  part_no       text not null check (length(trim(part_no)) >= 3),
  description   text not null default '',
  created_by    text not null default public.current_email(),
  created_at    timestamptz not null default now()
);
create unique index parts_customer_part on public.parts (customer_key, upper(part_no));
alter table public.parts enable row level security;
create policy parts_read on public.parts for select to authenticated using (public.is_office());
create policy parts_add on public.parts for insert to authenticated with check (public.is_office());
create policy parts_edit on public.parts for update to authenticated using (public.is_office()) with check (public.is_office());
create policy parts_remove on public.parts for delete to authenticated using (public.is_office());

-- A part's drawings: the newest is the one new orders get; older ones are kept as history.
create table public.part_files (
  id          bigint generated always as identity primary key,
  part_id     bigint not null references public.parts on delete cascade,
  name        text not null,
  drive_id    text not null,
  item_id     text not null,
  web_url     text not null default '',
  size        bigint,
  mime        text not null default '',
  uploaded_by text not null default public.current_email(),
  uploaded_at timestamptz not null default now()
);
create index part_files_part on public.part_files (part_id, uploaded_at desc);
alter table public.part_files enable row level security;
create policy part_files_read on public.part_files for select to authenticated using (public.is_office());
create policy part_files_add on public.part_files for insert to authenticated with check (public.is_office());
create policy part_files_remove on public.part_files for delete to authenticated using (public.is_office());

-- Which part drawing a job's file came from (shown as "from Parts"); kept when the part drawing is removed.
alter table public.job_files add column part_file_id bigint references public.part_files on delete set null;
create policy job_files_edit on public.job_files for update to authenticated using (public.is_office()) with check (public.is_office());

alter publication supabase_realtime add table public.parts, public.part_files;
