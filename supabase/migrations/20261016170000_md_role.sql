-- MD level (Philip, 16 Oct): business figures are for Levi's eyes only, not the admin office.
-- Roles: 'md' (Levi) sees everything the office does plus the business figures (monthly target,
-- order book and other totals); 'office' (Mandy, Gecko IT) keeps prices on orders for order entry
-- and Xero; 'floor' never sees money. is_office() stays true for the MD, so nothing he could do is lost.
alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('md', 'office', 'floor'));

create or replace function public.is_office() returns boolean
  language sql stable set search_path = ''
as $$ select public.staff_role() in ('md', 'office'); $$;
create function public.is_md() returns boolean
  language sql stable set search_path = ''
as $$ select public.staff_role() = 'md'; $$;
revoke all on function public.is_md() from public;
grant execute on function public.is_md() to authenticated;

update public.staff set role = 'md' where email = 'levi@clarke-lane.co.uk';
