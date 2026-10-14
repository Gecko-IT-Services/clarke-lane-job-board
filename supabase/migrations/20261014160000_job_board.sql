-- Clarke Lane Job Board, phase 1 (docs/specs/2026-10-14-job-board-design.md).
--
-- Who gets in: a row in public.staff. Sign-in is Microsoft (Entra app
-- "Clarke Lane Job Board", single tenant clarke-lane.co.uk), handed to Supabase
-- as an ID token. Two roles: 'office' (Levi, Mandy) sees prices and creates jobs;
-- 'floor' (the shop-floor tablet) ticks processes and despatches, never sees prices.
-- No table is ever created here without RLS on and a policy.

create table public.staff (
  email      text primary key check (email = lower(email)),
  name       text not null,
  role       text not null check (role in ('office', 'floor')),
  created_at timestamptz not null default now()
);

-- ponytail: Mandy's and the shop floor's addresses are added once known, e.g.
-- insert into public.staff values ('mandy@clarke-lane.co.uk', 'Mandy', 'office');
insert into public.staff (email, name, role) values
  ('levi@clarke-lane.co.uk', 'Levi', 'office');

alter table public.staff enable row level security;

create function public.staff_role() returns text
  language sql stable security definer set search_path = ''
as $$
  select role from public.staff
  where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
revoke all on function public.staff_role() from public;
grant execute on function public.staff_role() to authenticated;

create function public.is_staff() returns boolean
  language sql stable set search_path = ''
as $$ select public.staff_role() is not null; $$;
create function public.is_office() returns boolean
  language sql stable set search_path = ''
as $$ select public.staff_role() = 'office'; $$;
revoke all on function public.is_staff(), public.is_office() from public;
grant execute on function public.is_staff(), public.is_office() to authenticated;

create policy staff_read on public.staff
  for select to authenticated using (public.is_staff());

create function public.touch_modified_at() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.modified_at := now();
  return new;
end;
$$;

-- Next sales order / despatch note number. Taken only inside create_job and
-- create_despatch, so two people can never get the same number.
create table public.counters (
  name  text primary key check (name in ('sales_order', 'despatch_note')),
  next  integer not null check (next > 0)
);
-- ponytail: SO start to be confirmed with Mandy (last Sage SO 9724; Xero quotes
-- used SO-9725..9728). Change with an update before the first job is created.
insert into public.counters values ('sales_order', 9729), ('despatch_note', 1);
alter table public.counters enable row level security;
create policy counters_read on public.counters
  for select to authenticated using (public.is_staff());

-- A job is an ordered quote. From creation on it lives only here; the quote in
-- SharePoint is never written back to (sp_quote_id only traces where it came from).
create table public.jobs (
  id            bigint generated always as identity primary key,
  so_number     text not null unique,
  quote_no      text not null default '',
  sp_quote_id   integer unique,
  customer      text not null check (customer <> ''),
  contact_name  text not null default '',
  contact_email text not null default '',
  customer_po   text not null default '',
  ordered_on    date not null default current_date,
  due_date      date not null,
  -- Empty = one delivery on due_date. Otherwise the call-off dates in order.
  calloff_dates date[] not null default '{}',
  notes         text not null default '',
  created_by    text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  created_at    timestamptz not null default now(),
  modified_at   timestamptz not null default now()
);
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_modified_at();
alter table public.jobs enable row level security;
create policy jobs_read on public.jobs
  for select to authenticated using (public.is_staff());
create policy jobs_office_write on public.jobs
  for update to authenticated using (public.is_office()) with check (public.is_office());

create table public.job_lines (
  id       bigint generated always as identity primary key,
  job_id   bigint not null references public.jobs on delete cascade,
  line_no  integer not null,
  part     text not null check (part <> ''),
  qty      integer not null check (qty > 0),
  unique (job_id, line_no)
);
alter table public.job_lines enable row level security;
create policy job_lines_read on public.job_lines
  for select to authenticated using (public.is_staff());

-- Prices in their own table so the floor role cannot read them at all.
create table public.job_line_prices (
  job_line_id bigint primary key references public.job_lines on delete cascade,
  unit_price  numeric(12,4) not null check (unit_price >= 0)
);
alter table public.job_line_prices enable row level security;
create policy job_line_prices_office on public.job_line_prices
  for select to authenticated using (public.is_office());

-- Levi's nine processes, as on his Jobs List.
create table public.job_processes (
  job_id   bigint not null references public.jobs on delete cascade,
  process  text not null check (process in ('Laser', 'Fold', 'Roll Drill', 'Tap', 'Insert',
                 'C/Sink', 'Weld', 'P/Coat Paint', 'Plating / Anodising')),
  done_by  text,
  done_at  timestamptz,
  primary key (job_id, process),
  check ((done_by is null) = (done_at is null))
);
alter table public.job_processes enable row level security;
create policy job_processes_read on public.job_processes
  for select to authenticated using (public.is_staff());
-- Anyone may tick or untick; only office adds or removes a process from a job.
create policy job_processes_tick on public.job_processes
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy job_processes_office_add on public.job_processes
  for insert to authenticated with check (public.is_office());
create policy job_processes_office_remove on public.job_processes
  for delete to authenticated using (public.is_office());

create table public.despatches (
  id              bigint generated always as identity primary key,
  dn_number       text not null unique,
  job_id          bigint not null references public.jobs,
  despatched_on   date not null default current_date,
  despatched_by   text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  -- Phase 2: set by the Xero edge function when the draft invoice exists.
  xero_invoice_id text,
  xero_invoice_no text,
  sent_to_xero_at timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.despatches enable row level security;
create policy despatches_read on public.despatches
  for select to authenticated using (public.is_staff());

create table public.despatch_lines (
  despatch_id bigint not null references public.despatches on delete cascade,
  job_line_id bigint not null references public.job_lines,
  qty         integer not null check (qty > 0),
  primary key (despatch_id, job_line_id)
);
alter table public.despatch_lines enable row level security;
create policy despatch_lines_read on public.despatch_lines
  for select to authenticated using (public.is_staff());

-- Creating a job: one call, one transaction, number allocated inside it.
-- payload: { sp_quote_id, quote_no, customer, contact_name, contact_email, customer_po,
--   due_date, calloff_dates: [date], notes, processes: [text],
--   lines: [{ part, qty, unit_price }] }
create function public.create_job(payload jsonb) returns public.jobs
  language plpgsql security definer set search_path = ''
as $$
declare
  n   integer;
  j   public.jobs;
  l   jsonb;
  i   integer := 0;
  lid bigint;
begin
  if not public.is_office() then raise exception 'Only the office can create jobs.'; end if;
  if jsonb_array_length(coalesce(payload -> 'lines', '[]')) = 0 then
    raise exception 'A job needs at least one line.'; end if;
  if jsonb_array_length(coalesce(payload -> 'processes', '[]')) = 0 then
    raise exception 'Tick at least one process.'; end if;

  update public.counters set next = next + 1 where name = 'sales_order' returning next - 1 into n;
  insert into public.jobs (so_number, quote_no, sp_quote_id, customer, contact_name, contact_email,
                           customer_po, due_date, calloff_dates, notes)
  values ('SO-' || n, coalesce(payload ->> 'quote_no', ''), (payload ->> 'sp_quote_id')::integer,
          payload ->> 'customer', coalesce(payload ->> 'contact_name', ''),
          coalesce(payload ->> 'contact_email', ''), coalesce(payload ->> 'customer_po', ''),
          (payload ->> 'due_date')::date,
          coalesce((select array_agg(d::date order by d::date)
                    from jsonb_array_elements_text(payload -> 'calloff_dates') d), '{}'),
          coalesce(payload ->> 'notes', ''))
  returning * into j;

  for l in select * from jsonb_array_elements(payload -> 'lines') loop
    i := i + 1;
    insert into public.job_lines (job_id, line_no, part, qty)
    values (j.id, i, l ->> 'part', (l ->> 'qty')::integer) returning id into lid;
    insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric);
  end loop;

  insert into public.job_processes (job_id, process)
  select j.id, p from jsonb_array_elements_text(payload -> 'processes') p;
  return j;
end;
$$;
revoke all on function public.create_job(jsonb) from public;
grant execute on function public.create_job(jsonb) to authenticated;

-- Despatching: never more than is left on a line; DN number allocated inside.
-- lines: [{ job_line_id, qty }]
create function public.create_despatch(p_job_id bigint, lines jsonb) returns public.despatches
  language plpgsql security definer set search_path = ''
as $$
declare
  n    integer;
  d    public.despatches;
  l    jsonb;
  left_qty integer;
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
  perform 1 from public.jobs where id = p_job_id for update;
  if not found then raise exception 'No such job.'; end if;
  if not exists (select 1 from jsonb_array_elements(lines) x where (x ->> 'qty')::integer > 0) then
    raise exception 'Enter a quantity for at least one part.'; end if;

  update public.counters set next = next + 1 where name = 'despatch_note' returning next - 1 into n;
  insert into public.despatches (dn_number, job_id)
  values ('DN-' || lpad(n::text, 4, '0'), p_job_id) returning * into d;

  for l in select * from jsonb_array_elements(lines) where (value ->> 'qty')::integer > 0 loop
    select jl.qty - coalesce(sum(dl.qty), 0) into left_qty
      from public.job_lines jl left join public.despatch_lines dl on dl.job_line_id = jl.id
      where jl.id = (l ->> 'job_line_id')::bigint and jl.job_id = p_job_id
      group by jl.qty;
    if left_qty is null then raise exception 'That part is not on this job.'; end if;
    if (l ->> 'qty')::integer > left_qty then
      raise exception 'Only % left to send on one of the parts.', left_qty; end if;
    insert into public.despatch_lines values (d.id, (l ->> 'job_line_id')::bigint, (l ->> 'qty')::integer);
  end loop;
  return d;
end;
$$;
revoke all on function public.create_despatch(bigint, jsonb) from public;
grant execute on function public.create_despatch(bigint, jsonb) to authenticated;

-- A tick on the tablet shows on every open board at once.
alter publication supabase_realtime add table public.jobs, public.job_processes, public.despatches;
