-- MD-only settings (Philip, 16 Oct): first, Levi's monthly target for Jobs
-- ("monthly_target", net £). Kept here, not in the code, because the repository is public.
create table public.board_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text not null default public.current_email(),
  updated_at timestamptz not null default now()
);
alter table public.board_settings enable row level security;
create policy board_settings_md on public.board_settings
  for all to authenticated using (public.is_md()) with check (public.is_md());
alter publication supabase_realtime add table public.board_settings;
