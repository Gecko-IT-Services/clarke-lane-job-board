-- Cancel a dispatch note (Philip, 15 Oct): office only, and only before it is invoiced in Xero.
-- The note stays (marked cancelled, its number never reused); its quantities go back to outstanding.
-- Its lines are moved into cancelled_lines, so every existing "what has been sent" sum (create_despatch,
-- amend_job, the board) leaves them out without being rewritten.
alter table public.despatches add column cancelled_at timestamptz;
alter table public.despatches add column cancelled_by text;
alter table public.despatches add column cancelled_lines jsonb;   -- [{ job_line_id, qty }] as it was

create function public.cancel_despatch(p_despatch_id bigint) returns void
  language plpgsql security definer set search_path = ''
as $$
declare d public.despatches;
begin
  if not public.is_office() then raise exception 'Only the office can cancel a dispatch note.'; end if;
  select * into d from public.despatches where id = p_despatch_id for update;
  if not found then raise exception 'No such dispatch note.'; end if;
  if d.cancelled_at is not null then raise exception '% is already cancelled.', d.dn_number; end if;
  if d.xero_invoice_id is not null or d.xero_invoice_no is not null then
    raise exception '% is invoiced in Xero (%), so it cannot be cancelled here. Credit it in Xero instead.', d.dn_number, coalesce(d.xero_invoice_no, 'draft'); end if;
  update public.despatches set cancelled_at = now(), cancelled_by = public.current_email(),
    cancelled_lines = (select coalesce(jsonb_agg(jsonb_build_object('job_line_id', job_line_id, 'qty', qty)), '[]')
                       from public.despatch_lines where despatch_id = p_despatch_id)
  where id = p_despatch_id;
  delete from public.despatch_lines where despatch_id = p_despatch_id;
end;
$$;
revoke all on function public.cancel_despatch(bigint) from public;
grant execute on function public.cancel_despatch(bigint) to authenticated;

-- A cancelled note can't be emailed, delivered or invoiced.
create or replace function public.mark_despatch(p_despatch_id bigint, p_what text, p_received_by text default '') returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
  if exists (select 1 from public.despatches where id = p_despatch_id and cancelled_at is not null) then
    raise exception 'That dispatch note is cancelled.'; end if;
  if p_what = 'emailed' then
    update public.despatches set emailed_at = now(), emailed_by = public.current_email() where id = p_despatch_id;
  elsif p_what = 'delivered' then
    update public.despatches set delivered_on = current_date, delivered_by = public.current_email(),
      received_by = coalesce(nullif(trim(p_received_by), ''), received_by) where id = p_despatch_id;
  elsif p_what = 'undelivered' then
    if exists (select 1 from public.despatches where id = p_despatch_id and xero_invoice_no is not null) then
      raise exception 'This delivery is already invoiced in Xero.'; end if;
    update public.despatches set delivered_on = null, delivered_by = null, received_by = '' where id = p_despatch_id;
  else
    raise exception 'Unknown action %.', p_what;
  end if;
  if not found then raise exception 'No such despatch.'; end if;
end;
$$;

create or replace function public.xero_mark_sent(p_despatch_id bigint, p_invoice_id text, p_invoice_no text) returns boolean
  language sql security definer set search_path = ''
as $$
  with u as (
    update public.despatches set xero_invoice_id = p_invoice_id, xero_invoice_no = p_invoice_no, sent_to_xero_at = now()
    where id = p_despatch_id and xero_invoice_id is null and xero_invoice_no is null and delivered_on is not null
      and cancelled_at is null
    returning 1)
  select exists (select 1 from u);
$$;
