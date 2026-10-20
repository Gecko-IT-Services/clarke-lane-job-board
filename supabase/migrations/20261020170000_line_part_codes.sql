-- Xero item codes (Mandy, 20 Oct: VFS part 01-11-1696 did not come over). The changeover import kept each
-- Xero line's description but not its item code, which is where some customers' part numbers live. This
-- puts the code in front of the line's part text on orders already made from an import. Office only;
-- a line whose text already has the code, or a cancelled order's line, is left alone.
create function public.add_line_codes(p_lines jsonb) returns integer
  language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if not public.is_office() then raise exception 'Only the office can change order lines.'; end if;
  update public.job_lines l set part = left(trim(x.code) || ' ' || l.part, 500)
    from jsonb_to_recordset(coalesce(p_lines, '[]')) as x(id bigint, code text), public.jobs j
    where l.id = x.id and j.id = l.job_id and j.status <> 'cancelled'
      and length(trim(coalesce(x.code, ''))) >= 3 and position(upper(trim(x.code)) in upper(l.part)) = 0;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.add_line_codes(jsonb) from public;
grant execute on function public.add_line_codes(jsonb) to authenticated;
