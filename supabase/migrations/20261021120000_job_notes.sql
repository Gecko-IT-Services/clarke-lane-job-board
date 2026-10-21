-- Notes on a job (Philip, 21 Oct): Levi and Mandy leave notes for the shop floor, and the shop floor answers,
-- on the job itself. Shown on the job's details, the shop floor cards and the workshop TV.
-- Anyone on the board reads and adds; a note says honestly whether it came from the shop floor; "Got it"
-- (seen) goes through job_note_seen() so nobody can change what someone else wrote; Levi and Mandy delete.
create table public.job_notes (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.jobs on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 1000),
  by_name     text not null check (length(trim(by_name)) > 0),   -- the shop floor shares one login, so the name typed
  by_email    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  from_floor  boolean not null,
  seen_by     text,
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  check ((seen_by is null) = (seen_at is null))
);
create index job_notes_job on public.job_notes (job_id, created_at);
alter table public.job_notes enable row level security;
create policy job_notes_read on public.job_notes for select to authenticated using (public.is_staff());
create policy job_notes_add on public.job_notes for insert to authenticated
  with check (public.is_staff() and from_floor = not public.is_office() and seen_by is null
    and by_email = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy job_notes_remove on public.job_notes for delete to authenticated using (public.is_office());

-- "Got it": the other side marks a note seen. Only seen_by and seen_at change.
create function public.job_note_seen(note_id bigint, who text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Sign in to the job board first.'; end if;
  if length(trim(coalesce(who, ''))) = 0 then raise exception 'Say who has seen it.'; end if;
  update public.job_notes set seen_by = trim(who), seen_at = now()
   where id = note_id and seen_by is null and from_floor = public.is_office();
end;
$$;
revoke all on function public.job_note_seen(bigint, text) from public;
grant execute on function public.job_note_seen(bigint, text) to authenticated;

alter publication supabase_realtime add table public.job_notes;
