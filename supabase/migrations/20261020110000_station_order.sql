-- Station order (Philip, 20 Oct): Levi can put the jobs at one station (Laser, say) in his own order,
-- without changing the running order elsewhere. place = that job's position at that station (1 = top);
-- jobs with no place follow in the running order. Clearing a station's places puts it back.
alter table public.job_processes add column place integer check (place > 0);

-- p_ids: the jobs that hold a place at p_process, top first. Every other job there goes back to the running order.
create function public.set_station_order(p_process text, p_ids bigint[]) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_office() then raise exception 'Only the office can change a station''s order.'; end if;
  update public.job_processes set place = null
    where process = p_process and place is not null and not (job_id = any(coalesce(p_ids, '{}')));
  update public.job_processes jp set place = o.n
    from unnest(coalesce(p_ids, '{}')) with ordinality as o(id, n)
    where jp.process = p_process and jp.job_id = o.id and jp.place is distinct from o.n;
end;
$$;
revoke all on function public.set_station_order(text, bigint[]) from public;
grant execute on function public.set_station_order(text, bigint[]) to authenticated;
