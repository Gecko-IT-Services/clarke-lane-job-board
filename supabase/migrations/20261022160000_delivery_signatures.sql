-- The driver's screen (Philip, 22 Oct): the driver marks a delivery on the phone and the customer signs on it.
-- The signature is a small PNG data URL kept on the dispatch note (refused over 80,000 characters), with the exact
-- time and, when nobody signs, where the goods were left. It prints in the Received by block of the delivery note.
-- Re-runnable. Robbie (owner) is added to the staff list: he delivers, with his own Microsoft login.
alter table public.despatches add column if not exists delivered_at timestamptz;                -- exact time it was marked delivered
alter table public.despatches add column if not exists signature text not null default '';      -- data:image/png;base64,… or ''
alter table public.despatches add column if not exists delivery_note text not null default '';  -- e.g. Left at goods-in, nobody to sign

drop function if exists public.mark_despatch(bigint, text, text);
create or replace function public.mark_despatch(p_despatch_id bigint, p_what text, p_received_by text default '',
  p_signature text default '', p_note text default '') returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
  if exists (select 1 from public.despatches where id = p_despatch_id and cancelled_at is not null) then
    raise exception 'That dispatch note is cancelled.'; end if;
  if coalesce(p_signature, '') <> '' and (length(p_signature) > 80000 or left(p_signature, 22) <> 'data:image/png;base64,') then
    raise exception 'Not a signature.'; end if;
  if p_what = 'emailed' then
    update public.despatches set emailed_at = now(), emailed_by = public.current_email() where id = p_despatch_id;
  elsif p_what = 'delivered' then
    update public.despatches set delivered_on = current_date, delivered_at = now(), delivered_by = public.current_email(),
      received_by = coalesce(nullif(trim(p_received_by), ''), received_by),
      signature = case when coalesce(p_signature, '') <> '' then p_signature else signature end,
      delivery_note = coalesce(nullif(left(trim(coalesce(p_note, '')), 500), ''), delivery_note)
    where id = p_despatch_id;
  elsif p_what = 'undelivered' then
    if exists (select 1 from public.despatches where id = p_despatch_id and xero_invoice_no is not null) then
      raise exception 'This delivery is already invoiced in Xero.'; end if;
    update public.despatches set delivered_on = null, delivered_at = null, delivered_by = null, received_by = '',
      signature = '', delivery_note = '' where id = p_despatch_id;
  else
    raise exception 'Unknown action %.', p_what;
  end if;
  if not found then raise exception 'No such despatch.'; end if;
end;
$$;
revoke all on function public.mark_despatch(bigint, text, text, text, text) from public;
grant execute on function public.mark_despatch(bigint, text, text, text, text) to authenticated;

-- Robbie: the owner; delivers, sometimes with Judy using his login.
insert into public.staff (email, name, role) values ('robert.clarke@clarke-lane.co.uk', 'Robbie', 'md') on conflict (email) do nothing;
