-- Keith rings overdue customers (Philip, 24 Oct): his page shows each one's accounts contact from the board's contact
-- book (kept by Mandy) beside Xero's details. Read only, the people only (not delivery sites). Re-runnable.
drop policy if exists customer_people_accounts_read on public.customer_people;
create policy customer_people_accounts_read on public.customer_people for select to authenticated using (public.is_accounts());
