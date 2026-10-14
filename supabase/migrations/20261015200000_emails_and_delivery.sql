-- Emailing documents and confirming delivery (Philip, 15 Oct): the order acknowledgement and
-- each delivery note are emailed to the customer (as an Outlook draft with the PDF attached),
-- and a despatch only goes to Xero once it is marked delivered.

alter table public.jobs add column ack_emailed_at timestamptz;
alter table public.jobs add column ack_emailed_by text;

alter table public.despatches add column emailed_at timestamptz;
alter table public.despatches add column emailed_by text;
alter table public.despatches add column delivered_on date;
alter table public.despatches add column delivered_by text;      -- who marked it delivered
alter table public.despatches add column received_by text not null default '';   -- who signed for it, if known

-- Anyone on the staff list (office or the shop floor driver) can record the email and the delivery;
-- nothing else on a despatch changes this way (quantities and invoice fields stay put).
create function public.mark_despatch(p_despatch_id bigint, p_what text, p_received_by text default '') returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
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
revoke all on function public.mark_despatch(bigint, text, text) from public;
grant execute on function public.mark_despatch(bigint, text, text) to authenticated;

create function public.mark_ack_emailed(p_job_id bigint) returns void
  language sql security definer set search_path = ''
as $$
  update public.jobs set ack_emailed_at = now(), ack_emailed_by = public.current_email()
  where id = p_job_id and public.is_office();
$$;
revoke all on function public.mark_ack_emailed(bigint) from public;
grant execute on function public.mark_ack_emailed(bigint) to authenticated;

-- Only delivered despatches can be invoiced: the edge function checks too, but this makes it a rule.
create or replace function public.xero_mark_sent(p_despatch_id bigint, p_invoice_id text, p_invoice_no text) returns boolean
  language sql security definer set search_path = ''
as $$
  with u as (
    update public.despatches set xero_invoice_id = p_invoice_id, xero_invoice_no = p_invoice_no, sent_to_xero_at = now()
    where id = p_despatch_id and xero_invoice_id is null and xero_invoice_no is null and delivered_on is not null
    returning 1)
  select exists (select 1 from u);
$$;
