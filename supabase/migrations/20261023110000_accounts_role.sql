-- Keith's Accounts page (Philip, 23 Oct): accounts@clarke-lane.co.uk signs in as 'accounts'. Keith only reads:
-- invoices to approve with their proof of delivery, the month-end cut-off, purchase orders against bills, and
-- money coming in. "Staff" are the people who work the board, so is_staff() now leaves accounts out: his login
-- can tick nothing, dispatch nothing and post no notes. He gets read-only policies on exactly the tables his page
-- needs. Nobody else's access changes (is_staff() is the same for md, office and floor). Re-runnable.

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('md', 'office', 'floor', 'accounts'));

create or replace function public.is_staff() returns boolean
  language sql stable set search_path = ''
as $$ select coalesce(public.staff_role() in ('md', 'office', 'floor'), false); $$;

create or replace function public.is_accounts() returns boolean
  language sql stable set search_path = ''
as $$ select coalesce(public.staff_role() = 'accounts', false); $$;
revoke all on function public.is_accounts() from public;
revoke execute on function public.is_accounts() from anon;
grant execute on function public.is_accounts() to authenticated;

-- Read only, and only these.
drop policy if exists jobs_accounts_read on public.jobs;
create policy jobs_accounts_read on public.jobs for select to authenticated using (public.is_accounts());
drop policy if exists job_lines_accounts_read on public.job_lines;
create policy job_lines_accounts_read on public.job_lines for select to authenticated using (public.is_accounts());
drop policy if exists job_line_prices_accounts_read on public.job_line_prices;
create policy job_line_prices_accounts_read on public.job_line_prices for select to authenticated using (public.is_accounts());
drop policy if exists despatches_accounts_read on public.despatches;
create policy despatches_accounts_read on public.despatches for select to authenticated using (public.is_accounts());
drop policy if exists despatch_lines_accounts_read on public.despatch_lines;
create policy despatch_lines_accounts_read on public.despatch_lines for select to authenticated using (public.is_accounts());
drop policy if exists outwork_accounts_read on public.outwork;
create policy outwork_accounts_read on public.outwork for select to authenticated using (public.is_accounts());
drop policy if exists debt_chases_accounts_read on public.debt_chases;
create policy debt_chases_accounts_read on public.debt_chases for select to authenticated using (public.is_accounts());

insert into public.staff (email, name, role) values ('accounts@clarke-lane.co.uk', 'Keith', 'accounts')
on conflict (email) do update set role = 'accounts', name = 'Keith';
