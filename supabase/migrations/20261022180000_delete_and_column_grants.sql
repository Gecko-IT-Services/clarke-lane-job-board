-- Two findings from the 21 Oct review.
--
-- 1. Deleting a job cascaded through its pro formas, purchase orders and send-outs. Delete is for an
--    order made by mistake; once any paperwork exists the order is cancelled (status), never deleted,
--    so the PF and PO numbers and the Xero drafts they refer to keep their records on the board.
--
-- 2. The browser updates four tables directly (not through a function), and the policies on them
--    allowed every column: a cancelled dispatch note could be marked invoiced, or un-cancelled by hand;
--    a tick could be moved to another job. Column privileges now limit the browser to the columns the
--    board actually writes; everything else goes through the SECURITY DEFINER functions, which are
--    unaffected (they run as the owner). A trigger keeps the one rule a column list cannot express.

create function public.job_can_delete(p_job_id bigint) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.despatches      where job_id = p_job_id)
     and not exists (select 1 from public.proformas       where job_id = p_job_id)
     and not exists (select 1 from public.purchase_orders where job_id = p_job_id)
     and not exists (select 1 from public.outwork         where job_id = p_job_id);
$$;
revoke all on function public.job_can_delete(bigint) from public, anon;
grant execute on function public.job_can_delete(bigint) to authenticated;

drop policy jobs_office_delete on public.jobs;
create policy jobs_office_delete on public.jobs
  for delete to authenticated using (public.is_office() and public.job_can_delete(id));

-- jobs: Hold / Release / Cancel, and the contact email corrected on an amend. Everything else
-- (numbers, dates, lines, priority, acknowledgement) is set by create_job, amend_job, set_job_due,
-- set_running_order and mark_ack_emailed.
revoke update on public.jobs from authenticated;
grant update (status, status_note, contact_email) on public.jobs to authenticated;

-- despatches: the invoice number typed in by hand on "Waiting for Xero". Delivered / emailed /
-- cancelled go through mark_despatch and cancel_despatch.
revoke update on public.despatches from authenticated;
grant update (xero_invoice_no, sent_to_xero_at) on public.despatches to authenticated;

-- job_processes: the tick. The place at a station is set by set_station_order.
revoke update on public.job_processes from authenticated;
grant update (done_by, done_at) on public.job_processes to authenticated;

-- outwork: the send-out's details and its return. Never the job or who sent it.
revoke update on public.outwork from authenticated;
grant update (supplier, items, finish, sent_on, due_back, note, back_on, back_by) on public.outwork to authenticated;

-- A dispatch note is invoiced only once it is delivered and not cancelled (the same rule
-- xero_mark_sent applies when the edge function records a draft).
create function public.despatch_invoice_check() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if (new.xero_invoice_no is distinct from old.xero_invoice_no or new.xero_invoice_id is distinct from old.xero_invoice_id)
     and (new.xero_invoice_no is not null or new.xero_invoice_id is not null) then
    if new.cancelled_at is not null then raise exception '% is cancelled, so it cannot be invoiced.', new.dn_number; end if;
    if new.delivered_on is null then raise exception '% is not marked delivered yet.', new.dn_number; end if;
  end if;
  return new;
end;
$$;
create trigger despatches_invoice_check before update on public.despatches
  for each row execute function public.despatch_invoice_check();
