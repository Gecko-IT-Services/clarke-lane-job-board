-- Supabase can create a Microsoft user with auth.users.email empty (the address then
-- only reaches the JWT's user_metadata, which the user could edit themselves). Read the
-- address from the Azure identity instead: it is written from Microsoft's ID token and
-- cannot be changed by the user. Single tenant (Supabase's Azure provider is pinned to
-- Clarke Lane's tenant), so only clarke-lane.co.uk accounts reach this at all.
create function public.current_email() returns text
  language sql stable security definer set search_path = ''
as $$
  select lower(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select i.identity_data ->> 'email' from auth.identities i
      where i.user_id = auth.uid() and i.provider = 'azure' order by i.updated_at desc limit 1),
    ''));
$$;
revoke all on function public.current_email() from public;
grant execute on function public.current_email() to authenticated;

create or replace function public.staff_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select role from public.staff where email = public.current_email();
$$;

-- Who is signed in, as the board shows it. Empty row set = not on the staff list.
create function public.me() returns table (email text, name text, role text)
  language sql stable security definer set search_path = ''
as $$
  select public.current_email(), s.name, s.role
  from (select 1) one left join public.staff s on s.email = public.current_email();
$$;
revoke all on function public.me() from public;
grant execute on function public.me() to authenticated;

alter table public.jobs alter column created_by set default public.current_email();
alter table public.despatches alter column despatched_by set default public.current_email();
