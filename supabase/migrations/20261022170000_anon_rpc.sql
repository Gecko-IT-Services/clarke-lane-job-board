-- Office-only functions were open to anyone with the public key (code review, 21 Oct).
--
-- Two things let that happen. First, is_office() and is_md() returned NULL (not false) for a caller
-- who is not on the staff list, and plpgsql treats "if not NULL" as "do nothing", so the
-- "Only the office can …" guards never fired for them. Second, those functions were only
-- "revoke … from public"; Supabase's default privileges grant EXECUTE on public functions to anon
-- separately, so the publishable key alone could call create_job, amend_job, cancel_despatch,
-- set_running_order, set_station_order and add_line_codes with no sign-in at all.
--
-- Now: the role helpers are never NULL, no public function is callable by anon, and functions
-- made from here on are not granted to anon by default either.

create or replace function public.is_staff() returns boolean
  language sql stable set search_path = ''
as $$ select coalesce(public.staff_role() is not null, false); $$;
create or replace function public.is_office() returns boolean
  language sql stable set search_path = ''
as $$ select coalesce(public.staff_role() in ('md', 'office'), false); $$;
create or replace function public.is_md() returns boolean
  language sql stable set search_path = ''
as $$ select coalesce(public.staff_role() = 'md', false); $$;

-- Nothing the board does happens before sign-in, so anon needs no function at all.
revoke execute on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
