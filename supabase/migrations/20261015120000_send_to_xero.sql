-- Send to Xero: which Xero contact each board customer is invoiced to (chosen once by the
-- office, or matched automatically when the names clearly agree), and the service-role
-- step that records a draft invoice against its despatch.

create table public.customer_contacts (
  customer_key      text primary key,       -- the board's customer name, normalised (src/core/xero.js)
  xero_contact_id   text not null,
  xero_contact_name text not null,
  set_by            text not null default public.current_email(),
  set_at            timestamptz not null default now()
);
alter table public.customer_contacts enable row level security;
create policy customer_contacts_office on public.customer_contacts
  for all to authenticated using (public.is_office()) with check (public.is_office());

-- Only fills an empty slot, so a despatch can never be pointed at a second invoice.
create function public.xero_mark_sent(p_despatch_id bigint, p_invoice_id text, p_invoice_no text) returns boolean
  language sql security definer set search_path = ''
as $$
  with u as (
    update public.despatches set xero_invoice_id = p_invoice_id, xero_invoice_no = p_invoice_no, sent_to_xero_at = now()
    where id = p_despatch_id and xero_invoice_id is null and xero_invoice_no is null
    returning 1)
  select exists (select 1 from u);
$$;
revoke all on function public.xero_mark_sent(bigint, text, text) from public, anon, authenticated;
grant execute on function public.xero_mark_sent(bigint, text, text) to service_role;
