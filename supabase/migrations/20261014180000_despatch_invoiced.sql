-- Until the Xero connection (phase 2), Mandy keys each despatch into Xero by hand and
-- records the invoice number here so the "Waiting for Xero" list empties.
-- Office only; the floor can never mark anything invoiced.
create policy despatches_office_invoiced on public.despatches
  for update to authenticated using (public.is_office()) with check (public.is_office());
