-- Running order (Philip, 15 Oct): the office can bring a job forward. Jobs with a priority come
-- first (1 = top), in that order; every other job follows by due date. The shop floor screen and
-- the job board both follow it. Clearing every priority puts the board back to plain date order.
alter table public.jobs add column priority integer check (priority > 0);

-- p_ids: the jobs that hold a place, top first. Every job not listed goes back to date order.
create function public.set_running_order(p_ids bigint[]) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_office() then raise exception 'Only the office can change the running order.'; end if;
  update public.jobs set priority = null
    where priority is not null and not (id = any(coalesce(p_ids, '{}')));
  update public.jobs j set priority = o.n
    from unnest(coalesce(p_ids, '{}')) with ordinality as o(id, n)
    where j.id = o.id and j.priority is distinct from o.n;
end;
$$;
revoke all on function public.set_running_order(bigint[]) from public;
grant execute on function public.set_running_order(bigint[]) to authenticated;
