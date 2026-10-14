-- Orders the way Sage 50 Sales Order Processing works (Philip, 15 Oct: "as similar to Sage
-- sales order as possible"). Each line carries its own due date, so a call-off schedule is
-- simply the same part on several lines with different dates and quantities, as it was
-- keyed in Sage. Orders can be amended, put on hold and cancelled; part despatches leave
-- the outstanding quantity on the order. Replaces jobs.calloff_dates (no live jobs yet).

alter table public.job_lines add column due_date date;
update public.job_lines l set due_date = j.due_date from public.jobs j where j.id = l.job_id;
alter table public.job_lines alter column due_date set not null;

alter table public.jobs drop column calloff_dates;
alter table public.jobs add column delivery_address text not null default '';
alter table public.jobs add column status text not null default 'open'
  check (status in ('open', 'held', 'cancelled'));
alter table public.jobs add column status_note text not null default '';

-- New order. payload: { so_number?, sp_quote_id?, xero_quote_id?, quote_no?, customer,
--   contact_name?, contact_email?, customer_po?, delivery_address?, notes?, due_date,
--   processes: [text], lines: [{ part, qty, unit_price, due_date? }] }
create or replace function public.create_job(payload jsonb) returns public.jobs
  language plpgsql security definer set search_path = ''
as $$
declare
  n   integer; j public.jobs; l jsonb; i integer := 0; lid bigint;
  so  text := upper(nullif(trim(coalesce(payload ->> 'so_number', '')), ''));
  def date := (payload ->> 'due_date')::date;
begin
  if not public.is_office() then raise exception 'Only the office can create orders.'; end if;
  if jsonb_array_length(coalesce(payload -> 'lines', '[]')) = 0 then raise exception 'An order needs at least one line.'; end if;
  if jsonb_array_length(coalesce(payload -> 'processes', '[]')) = 0 then raise exception 'Tick at least one process.'; end if;
  if so is null then
    update public.counters set next = next + 1 where name = 'sales_order' returning next - 1 into n;
    so := 'SO-' || n;
  else
    if so !~ '^(SO|SAGE)-[0-9]+$' then raise exception 'An order number must look like SO-9726 or SAGE-9701.'; end if;
    if exists (select 1 from public.jobs where so_number = so) then raise exception '% is already on the board.', so; end if;
    if so like 'SO-%' then
      update public.counters set next = greatest(next, substr(so, 4)::integer + 1) where name = 'sales_order';
    end if;
  end if;

  insert into public.jobs (so_number, quote_no, sp_quote_id, xero_quote_id, customer, contact_name, contact_email,
                           customer_po, delivery_address, due_date, notes)
  values (so, coalesce(payload ->> 'quote_no', ''), (payload ->> 'sp_quote_id')::integer, nullif(payload ->> 'xero_quote_id', ''),
          payload ->> 'customer', coalesce(payload ->> 'contact_name', ''), coalesce(payload ->> 'contact_email', ''),
          coalesce(payload ->> 'customer_po', ''), coalesce(payload ->> 'delivery_address', ''),
          def, coalesce(payload ->> 'notes', ''))
  returning * into j;

  for l in select * from jsonb_array_elements(payload -> 'lines') loop
    i := i + 1;
    insert into public.job_lines (job_id, line_no, part, qty, due_date)
    values (j.id, i, l ->> 'part', (l ->> 'qty')::integer, coalesce((l ->> 'due_date')::date, def)) returning id into lid;
    insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric);
  end loop;
  -- The order's due date is its last delivery.
  update public.jobs set due_date = (select max(due_date) from public.job_lines where job_id = j.id) where id = j.id
  returning * into j;

  insert into public.job_processes (job_id, process) select j.id, p from jsonb_array_elements_text(payload -> 'processes') p;
  return j;
end;
$$;

-- Amend an order (Sage: Amend). payload: { customer_po, contact_name, delivery_address, notes,
--   lines: [{ id?, part, qty, unit_price, due_date }] }. A line's quantity can never go below
-- what has already been despatched; a line with despatches can't be removed.
create function public.amend_job(p_job_id bigint, payload jsonb) returns public.jobs
  language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs; l jsonb; lid bigint; shipped integer; nxt integer; keep bigint[] := '{}';
begin
  if not public.is_office() then raise exception 'Only the office can amend orders.'; end if;
  select * into j from public.jobs where id = p_job_id for update;
  if not found then raise exception 'No such order.'; end if;
  if j.status = 'cancelled' then raise exception '% is cancelled.', j.so_number; end if;
  if jsonb_array_length(coalesce(payload -> 'lines', '[]')) = 0 then raise exception 'An order needs at least one line.'; end if;

  select coalesce(max(line_no), 0) into nxt from public.job_lines where job_id = p_job_id;
  for l in select * from jsonb_array_elements(payload -> 'lines') loop
    if (l ->> 'qty')::integer is null or (l ->> 'qty')::integer <= 0 then raise exception 'Every line needs a quantity.'; end if;
    if nullif(trim(l ->> 'part'), '') is null then raise exception 'Every line needs a part.'; end if;
    lid := (l ->> 'id')::bigint;
    if lid is null then
      nxt := nxt + 1;
      insert into public.job_lines (job_id, line_no, part, qty, due_date)
      values (p_job_id, nxt, l ->> 'part', (l ->> 'qty')::integer, (l ->> 'due_date')::date) returning id into lid;
      insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric);
    else
      select coalesce(sum(dl.qty), 0) into shipped from public.despatch_lines dl where dl.job_line_id = lid;
      if (l ->> 'qty')::integer < shipped then
        raise exception '"%" has % despatched already, so it cannot go below that.', l ->> 'part', shipped; end if;
      update public.job_lines set part = l ->> 'part', qty = (l ->> 'qty')::integer, due_date = (l ->> 'due_date')::date
      where id = lid and job_id = p_job_id;
      if not found then raise exception 'A line does not belong to this order.'; end if;
      insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric)
      on conflict (job_line_id) do update set unit_price = excluded.unit_price;
    end if;
    keep := keep || lid;
  end loop;

  if exists (select 1 from public.job_lines jl join public.despatch_lines dl on dl.job_line_id = jl.id
             where jl.job_id = p_job_id and not (jl.id = any (keep))) then
    raise exception 'A line that has been despatched cannot be removed. Reduce its quantity instead.'; end if;
  delete from public.job_lines where job_id = p_job_id and not (id = any (keep));

  update public.jobs set customer_po = coalesce(payload ->> 'customer_po', customer_po),
    contact_name = coalesce(payload ->> 'contact_name', contact_name),
    delivery_address = coalesce(payload ->> 'delivery_address', delivery_address),
    notes = coalesce(payload ->> 'notes', notes),
    due_date = (select max(due_date) from public.job_lines where job_id = p_job_id)
  where id = p_job_id returning * into j;
  return j;
end;
$$;
revoke all on function public.amend_job(bigint, jsonb) from public;
grant execute on function public.amend_job(bigint, jsonb) to authenticated;

-- A held or cancelled order cannot be despatched (Sage behaves the same).
create or replace function public.create_despatch(p_job_id bigint, lines jsonb) returns public.despatches
  language plpgsql security definer set search_path = ''
as $$
declare
  n integer; d public.despatches; l jsonb; left_qty integer; st text; so text;
begin
  if not public.is_staff() then raise exception 'Not on the staff list.'; end if;
  select status, so_number into st, so from public.jobs where id = p_job_id for update;
  if not found then raise exception 'No such order.'; end if;
  if st = 'held' then raise exception '% is on hold. Release it before despatching.', so; end if;
  if st = 'cancelled' then raise exception '% is cancelled.', so; end if;
  if not exists (select 1 from jsonb_array_elements(lines) x where (x ->> 'qty')::integer > 0) then
    raise exception 'Enter a quantity for at least one part.'; end if;

  update public.counters set next = next + 1 where name = 'despatch_note' returning next - 1 into n;
  insert into public.despatches (dn_number, job_id) values ('DN-' || lpad(n::text, 4, '0'), p_job_id) returning * into d;

  for l in select * from jsonb_array_elements(lines) where (value ->> 'qty')::integer > 0 loop
    select jl.qty - coalesce(sum(dl.qty), 0) into left_qty
      from public.job_lines jl left join public.despatch_lines dl on dl.job_line_id = jl.id
      where jl.id = (l ->> 'job_line_id')::bigint and jl.job_id = p_job_id group by jl.qty;
    if left_qty is null then raise exception 'That part is not on this order.'; end if;
    if (l ->> 'qty')::integer > left_qty then raise exception 'Only % left to send on one of the lines.', left_qty; end if;
    insert into public.despatch_lines values (d.id, (l ->> 'job_line_id')::bigint, (l ->> 'qty')::integer);
  end loop;
  return d;
end;
$$;

alter publication supabase_realtime add table public.job_lines;
