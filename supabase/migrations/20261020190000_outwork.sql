-- Work sent out (Philip, 20 Oct): powder coating (and plating) is done by another company. Replaces the
-- whiteboard that says where each job's items are, when they went and when they are due back.
-- Anyone on the board records a send or a return (the shop floor does most of it); only Levi and Mandy delete.
create table public.outwork (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.jobs on delete cascade,
  process     text not null check (process in ('P/Coat Paint', 'Plating / Anodising')),
  supplier    text not null check (length(trim(supplier)) > 0),
  items       text not null default '',       -- what went, e.g. "40 × Bracket"
  finish      text not null default '',       -- colour or finish, e.g. RAL 9005 satin
  sent_on     date not null default current_date,
  due_back    date,
  back_on     date,
  note        text not null default '',
  sent_by     text not null,
  back_by     text,
  created_at  timestamptz not null default now(),
  check (due_back is null or due_back >= sent_on),
  check (back_on is null or back_on >= sent_on),
  check ((back_on is null) = (back_by is null))
);
create index outwork_job on public.outwork (job_id);
create index outwork_open on public.outwork (sent_on) where back_on is null;
alter table public.outwork enable row level security;
create policy outwork_read on public.outwork for select to authenticated using (public.is_staff());
create policy outwork_add on public.outwork for insert to authenticated with check (public.is_staff());
create policy outwork_change on public.outwork for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy outwork_remove on public.outwork for delete to authenticated using (public.is_office());
alter publication supabase_realtime add table public.outwork;
