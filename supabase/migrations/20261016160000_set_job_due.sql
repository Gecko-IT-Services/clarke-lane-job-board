-- Jobs tab (Philip, 16 Oct): change a job's due date straight from the list. Moves the job's lines due
-- on p_from that still have something left to dispatch to p_to; lines already sent keep their date.
-- The order's own due date follows its lines, as amend_job does.
create function public.set_job_due(p_job_id bigint, p_from date, p_to date) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not public.is_office() then raise exception 'Only the office can change due dates.'; end if;
  if p_to is null then raise exception 'Pick a date.'; end if;
  perform 1 from public.jobs where id = p_job_id and status <> 'cancelled' for update;
  if not found then raise exception 'That order is cancelled or no longer exists.'; end if;
  update public.job_lines jl set due_date = p_to
   where jl.job_id = p_job_id and jl.due_date is not distinct from p_from
     and jl.qty > coalesce((select sum(dl.qty) from public.despatch_lines dl where dl.job_line_id = jl.id), 0);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing still to dispatch is due on that date. Use Amend on Sales orders instead.'; end if;
  update public.jobs set due_date = (select max(due_date) from public.job_lines where job_id = p_job_id) where id = p_job_id;
  return n;
end;
$$;
revoke all on function public.set_job_due(bigint, date, date) from public, anon;
grant execute on function public.set_job_due(bigint, date, date) to authenticated;
