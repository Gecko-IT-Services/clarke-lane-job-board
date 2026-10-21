-- A part number box on each order line (Mandy, 22 Oct: "a 'part number' box and a separate 'description' box,
-- like Xero and Sage"). part stays the description and stays required; part_no is optional ('' = none).
-- Lines already on the board keep their whole text in part with part_no empty, so they read as before.
-- The Parts library and the drawings matching use part_no first and only look in part when it is empty.
-- Re-runnable: the column is added only if missing and the functions are replaced.
alter table public.job_lines add column if not exists part_no text not null default '';

-- Same as before (20261016100000_po_per_line), plus each line's part_no (trimmed; empty allowed).
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
    insert into public.job_lines (job_id, line_no, part, qty, due_date, customer_po, part_no)
    values (j.id, i, l ->> 'part', (l ->> 'qty')::integer, coalesce((l ->> 'due_date')::date, def),
            coalesce(trim(l ->> 'customer_po'), ''), coalesce(trim(l ->> 'part_no'), '')) returning id into lid;
    insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric);
  end loop;
  -- The order's due date is its last delivery.
  update public.jobs set due_date = (select max(due_date) from public.job_lines where job_id = j.id) where id = j.id
  returning * into j;

  insert into public.job_processes (job_id, process) select j.id, p from jsonb_array_elements_text(payload -> 'processes') p;
  return j;
end;
$$;

-- Same as before (20261016100000_po_per_line), plus part_no. A line sent without part_no keeps the one it has
-- (as customer_po does), so an older open tab amending an order never wipes a part number.
create or replace function public.amend_job(p_job_id bigint, payload jsonb) returns public.jobs
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
      insert into public.job_lines (job_id, line_no, part, qty, due_date, customer_po, part_no)
      values (p_job_id, nxt, l ->> 'part', (l ->> 'qty')::integer, (l ->> 'due_date')::date,
              coalesce(trim(l ->> 'customer_po'), ''), coalesce(trim(l ->> 'part_no'), '')) returning id into lid;
      insert into public.job_line_prices values (lid, (l ->> 'unit_price')::numeric);
    else
      select coalesce(sum(dl.qty), 0) into shipped from public.despatch_lines dl where dl.job_line_id = lid;
      if (l ->> 'qty')::integer < shipped then
        raise exception '"%" has % despatched already, so it cannot go below that.', l ->> 'part', shipped; end if;
      update public.job_lines set part = l ->> 'part', qty = (l ->> 'qty')::integer, due_date = (l ->> 'due_date')::date,
        customer_po = coalesce(trim(l ->> 'customer_po'), customer_po),
        part_no = coalesce(trim(l ->> 'part_no'), part_no)
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
