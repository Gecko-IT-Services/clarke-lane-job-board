-- "Not a job": an Ordered quote in the quote calculator that should never become a job
-- here (e.g. finished in Sage before the board existed). The quote itself is untouched;
-- the board just stops offering it. Office only, and reversible (delete the row).
create table public.quote_dismissals (
  sp_quote_id  integer primary key,
  quote_no     text not null default '',
  dismissed_by text not null default public.current_email(),
  dismissed_at timestamptz not null default now()
);
alter table public.quote_dismissals enable row level security;
create policy quote_dismissals_office on public.quote_dismissals
  for all to authenticated using (public.is_office()) with check (public.is_office());

-- Cancelling a job created by mistake: office only. A job with any despatch cannot be
-- deleted (despatches.job_id has no cascade), so paperwork already issued is never lost.
-- Its sales order number is not reused.
create policy jobs_office_delete on public.jobs
  for delete to authenticated using (public.is_office());

alter publication supabase_realtime add table public.quote_dismissals;
