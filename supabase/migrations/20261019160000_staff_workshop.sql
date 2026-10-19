-- The shop floor's own Microsoft 365 account (Philip, 19 Oct): ticks processes, dispatches and opens
-- drawings; never sees prices or business figures.
insert into public.staff (email, name, role) values
  ('workshop@clarke-lane.co.uk', 'Shop Floor', 'floor')
on conflict (email) do update set role = 'floor';
