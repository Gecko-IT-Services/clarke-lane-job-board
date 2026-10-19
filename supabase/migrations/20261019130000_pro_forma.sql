-- Pro forma invoices (Levi, 19 Oct): a priced request for payment before goods go, PF-0001 onwards.
-- Not a VAT invoice and never sent to Xero; once marked paid, the order's later draft invoices in
-- Xero say "Paid in advance, pro forma PF-…" so Keith can allocate the money already received.
-- Prices come from the order (job_line_prices), never from the browser. Office only (prices).
alter table public.counters drop constraint counters_name_check;
alter table public.counters add constraint counters_name_check check (name in ('sales_order', 'despatch_note', 'pro_forma'));
insert into public.counters values ('pro_forma', 1) on conflict (name) do nothing;

create table public.proformas (
  id           bigint generated always as identity primary key,
  pf_number    text not null unique,
  job_id       bigint not null references public.jobs on delete cascade,
  lines        jsonb not null,                 -- [{ job_line_id, part, qty, unit_price, net }]
  net          numeric(12, 2) not null,
  vat          numeric(12, 2) not null,
  created_by   text not null default public.current_email(),
  created_at   timestamptz not null default now(),
  emailed_at   timestamptz,
  paid_on      date,
  paid_by      text,
  cancelled_at timestamptz
);
create index proformas_job on public.proformas (job_id);
alter table public.proformas enable row level security;
create policy proformas_office on public.proformas
  for all to authenticated using (public.is_office()) with check (public.is_office());
alter publication supabase_realtime add table public.proformas;

create function public.create_proforma(p_job_id bigint, p_lines jsonb) returns public.proformas
  language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs; n integer; l jsonb; q integer; r record; out_lines jsonb := '[]'; tot numeric := 0; pf public.proformas;
begin
  if not public.is_office() then raise exception 'Only the office can make a pro forma.'; end if;
  select * into j from public.jobs where id = p_job_id;
  if not found or j.status = 'cancelled' then raise exception 'That order is cancelled or no longer exists.'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    q := (l ->> 'qty')::integer;
    if q is null or q <= 0 then continue; end if;
    select jl.id, jl.part, jl.qty, p.unit_price into r
      from public.job_lines jl join public.job_line_prices p on p.job_line_id = jl.id
     where jl.id = (l ->> 'job_line_id')::bigint and jl.job_id = p_job_id;
    if not found then raise exception 'A line does not belong to this order.'; end if;
    if q > r.qty then raise exception '"%" has only % on the order.', r.part, r.qty; end if;
    out_lines := out_lines || jsonb_build_object('job_line_id', r.id, 'part', r.part, 'qty', q, 'unit_price', r.unit_price,
                                                 'net', round(q * r.unit_price, 2));
    tot := tot + round(q * r.unit_price, 2);
  end loop;
  if jsonb_array_length(out_lines) = 0 then raise exception 'Enter a quantity for at least one part.'; end if;
  update public.counters set next = next + 1 where name = 'pro_forma' returning next - 1 into n;
  insert into public.proformas (pf_number, job_id, lines, net, vat)
  values ('PF-' || lpad(n::text, 4, '0'), p_job_id, out_lines, tot, round(tot * 0.2, 2)) returning * into pf;
  return pf;
end;
$$;
revoke all on function public.create_proforma(bigint, jsonb) from public, anon;
grant execute on function public.create_proforma(bigint, jsonb) to authenticated;

-- Office settings everyone in the office uses (not the MD's figures): the accounts address copied
-- into every pro forma email, and the payment details printed on pro formas. Typed in on the board.
create table public.office_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by text not null default public.current_email(),
  updated_at timestamptz not null default now()
);
alter table public.office_settings enable row level security;
create policy office_settings_office on public.office_settings
  for all to authenticated using (public.is_office()) with check (public.is_office());
