-- Where the van is (Philip, 22 Oct): the driver's phone sends its position while the Deliveries screen is
-- open and sharing is switched on there; the office sees the van on the Dispatch map with how long ago it
-- was last heard from. One row per person sharing, overwritten each time, so no history of movements is
-- kept: only where the van is now. Switching sharing off removes the row.
create table if not exists public.driver_positions (
  email    text primary key,
  name     text not null,
  lat      double precision not null,
  lng      double precision not null,
  accuracy real,            -- metres, as the phone reports it
  heading  real,            -- degrees from north, if moving
  speed    real,            -- metres a second, if moving
  at       timestamptz not null default now()
);
alter table public.driver_positions enable row level security;
drop policy if exists driver_positions_office on public.driver_positions;
create policy driver_positions_office on public.driver_positions
  for select to authenticated using (public.is_office());

create or replace function public.set_my_position(p_lat double precision, p_lng double precision, p_accuracy real default null, p_heading real default null, p_speed real default null) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Not a position.'; end if;
  insert into public.driver_positions (email, name, lat, lng, accuracy, heading, speed, at)
  select email, name, p_lat, p_lng, p_accuracy, p_heading, p_speed, now() from public.staff where email = public.current_email()
  on conflict (email) do update set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
    heading = excluded.heading, speed = excluded.speed, at = now();
end;
$$;
create or replace function public.clear_my_position() returns void
  language sql security definer set search_path = ''
as $$ delete from public.driver_positions where email = public.current_email(); $$;
revoke all on function public.set_my_position(double precision, double precision, real, real, real) from public;
revoke all on function public.clear_my_position() from public;
grant execute on function public.set_my_position(double precision, double precision, real, real, real) to authenticated;
grant execute on function public.clear_my_position() to authenticated;
alter publication supabase_realtime add table public.driver_positions;
