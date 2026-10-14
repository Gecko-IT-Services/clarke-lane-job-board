-- Xero connection (design note: "Xero"). The OAuth tokens are secrets: they live in a
-- schema the API does not expose, and only the edge function (service role) can reach
-- them, through the functions below. Nothing in the browser ever sees a token.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.xero_tokens (
  id            integer primary key default 1 check (id = 1),   -- one Xero organisation
  tenant_id     text not null,
  tenant_name   text not null,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  connected_by  text not null,
  connected_at  timestamptz not null default now(),
  refreshed_at  timestamptz not null default now()
);

-- One-use "state" values for the connect redirect, so a callback can only finish a
-- connect that an office user started in the last 15 minutes.
create table private.xero_oauth_states (
  state      text primary key,
  email      text not null,
  created_at timestamptz not null default now()
);

create function public.xero_save_state(p_state text, p_email text) returns void
  language sql security definer set search_path = ''
as $$
  delete from private.xero_oauth_states where created_at < now() - interval '1 day';
  insert into private.xero_oauth_states (state, email) values (p_state, p_email);
$$;

create function public.xero_take_state(p_state text) returns text
  language sql security definer set search_path = ''
as $$
  delete from private.xero_oauth_states
  where state = p_state and created_at > now() - interval '15 minutes'
  returning email;
$$;

create function public.xero_save_tokens(p_tenant_id text, p_tenant_name text, p_access text,
  p_refresh text, p_expires_at timestamptz, p_by text) returns void
  language sql security definer set search_path = ''
as $$
  insert into private.xero_tokens (id, tenant_id, tenant_name, access_token, refresh_token, expires_at, connected_by)
  values (1, p_tenant_id, p_tenant_name, p_access, p_refresh, p_expires_at, p_by)
  on conflict (id) do update set tenant_id = excluded.tenant_id, tenant_name = excluded.tenant_name,
    access_token = excluded.access_token, refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at, connected_by = excluded.connected_by,
    connected_at = now(), refreshed_at = now();
$$;

create function public.xero_update_tokens(p_access text, p_refresh text, p_expires_at timestamptz) returns void
  language sql security definer set search_path = ''
as $$
  update private.xero_tokens set access_token = p_access, refresh_token = p_refresh,
    expires_at = p_expires_at, refreshed_at = now() where id = 1;
$$;

create function public.xero_get_tokens() returns table (tenant_id text, tenant_name text,
  access_token text, refresh_token text, expires_at timestamptz)
  language sql stable security definer set search_path = ''
as $$
  select tenant_id, tenant_name, access_token, refresh_token, expires_at from private.xero_tokens where id = 1;
$$;

create function public.xero_disconnect() returns void
  language sql security definer set search_path = ''
as $$ delete from private.xero_tokens; $$;

-- Raise the sales order counter so it is always past the highest SO number Xero has used.
create function public.bump_sales_order_counter(p_min integer) returns integer
  language sql security definer set search_path = ''
as $$
  update public.counters set next = greatest(next, p_min) where name = 'sales_order' returning next;
$$;

-- The token functions are for the edge function only (service role), never for a browser.
revoke all on function public.xero_save_state(text, text), public.xero_take_state(text),
  public.xero_save_tokens(text, text, text, text, timestamptz, text),
  public.xero_update_tokens(text, text, timestamptz), public.xero_get_tokens(),
  public.xero_disconnect(), public.bump_sales_order_counter(integer)
  from public, anon, authenticated;
grant execute on function public.xero_save_state(text, text), public.xero_take_state(text),
  public.xero_save_tokens(text, text, text, text, timestamptz, text),
  public.xero_update_tokens(text, text, timestamptz), public.xero_get_tokens(),
  public.xero_disconnect(), public.bump_sales_order_counter(integer)
  to service_role;

-- What the board may know about the connection: which organisation, since when, by whom.
create function public.xero_status() returns table (tenant_name text, connected_by text,
  connected_at timestamptz, refreshed_at timestamptz)
  language sql stable security definer set search_path = ''
as $$
  select tenant_name, connected_by, connected_at, refreshed_at from private.xero_tokens
  where id = 1 and public.is_office();
$$;
revoke all on function public.xero_status() from public, anon;
grant execute on function public.xero_status() to authenticated;

-- Jobs made from a Xero sales order (Mandy's SO-97xx quotes since 1 Oct) or carried over
-- from Sage keep the number they already have. xero_quote_id traces the Xero quote.
alter table public.jobs add column xero_quote_id text unique;

create or replace function public.create_job(payload jsonb) returns public.jobs
  language plpgsql security definer set search_path = ''
as $$
declare
  n    integer;
  j    public.jobs;
  l    jsonb;
  i    integer := 0;
  lid  bigint;
  so   text := upper(nullif(trim(coalesce(payload ->> 'so_number', '')), ''));
begin
  if not public.is_office() then raise exception 'Only the office can create jobs.'; end if;
  if jsonb_array_length(coalesce(payload -> 'lines', '[]')) = 0 then
    raise exception 'A job needs at least one line.'; end if;
  if jsonb_array_length(coalesce(payload -> 'processes', '[]')) = 0 then
    raise exception 'Tick at least one process.'; end if;

  if so is null then
    update public.counters set next = next + 1 where name = 'sales_order' returning next - 1 into n;
    so := 'SO-' || n;
  else
    if so !~ '^(SO|SAGE)-[0-9]+$' then
      raise exception 'An order number must look like SO-9726 or SAGE-9701.'; end if;
    if exists (select 1 from public.jobs where so_number = so) then
      raise exception '% is already on the board.', so; end if;
    -- An SO number typed in moves the counter past it, so it is never handed out twice.
    if so like 'SO-%' then
      update public.counters set next = greatest(next, substr(so, 4)::integer + 1) where name = 'sales_order';
    end if;
  end if;

  insert into public.jobs (so_number, quote_no, sp_quote_id, xero_quote_id, customer, contact_name,
                           contact_email, customer_po, due_date, calloff_dates, notes)
  values (so, coalesce(payload ->> 'quote_no', ''), (payload ->> 'sp_quote_id')::integer,
          nullif(payload ->> 'xero_quote_id', ''),
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
