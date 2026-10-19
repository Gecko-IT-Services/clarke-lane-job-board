-- Drawings on a job (Levi, 19 Oct). The files themselves live in Clarke Lane's SharePoint (Factory Jobs
-- site, Documents › Job drawings › <SO number>); this table only records which files belong to which
-- job, so everyone on the board, the shop floor included, can open them. Removing one here leaves the
-- file in SharePoint.
create table public.job_files (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.jobs on delete cascade,
  name        text not null,
  drive_id    text not null,
  item_id     text not null,
  web_url     text not null default '',
  size        bigint,
  mime        text not null default '',
  uploaded_by text not null default public.current_email(),
  uploaded_at timestamptz not null default now()
);
create index job_files_job on public.job_files (job_id);
alter table public.job_files enable row level security;
create policy job_files_read on public.job_files for select to authenticated using (public.is_staff());
create policy job_files_add on public.job_files for insert to authenticated with check (public.is_office());
create policy job_files_remove on public.job_files for delete to authenticated using (public.is_office());
alter publication supabase_realtime add table public.job_files;
