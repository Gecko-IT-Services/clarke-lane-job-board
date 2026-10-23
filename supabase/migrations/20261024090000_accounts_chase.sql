-- Keith chases overdue invoices from his Accounts page (Philip, 24 Oct). The email is only ever an Outlook draft in
-- his own mailbox; the board notes the chase, as it does for Levi and Mandy, so nobody chases the same customer twice
-- in a week. This is the one thing the accounts login may write: a new chase note, nothing else. Re-runnable.
drop policy if exists debt_chases_accounts_add on public.debt_chases;
create policy debt_chases_accounts_add on public.debt_chases for insert to authenticated with check (public.is_accounts());
