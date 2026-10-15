-- One-off clean-up (Philip, 15 Oct): remove Gecko's test order SO-9781 for VFS and its dispatch note
-- DN-0001, and give those numbers back so the first real order and note use them.
-- Guarded: does nothing unless SO-9781 is a VFS order whose dispatch notes are not invoiced in Xero;
-- counters are only wound back when the test order was the last thing to take a number.
do $$
declare
  jid bigint; n_dn integer; n_inv integer;
begin
  select id into jid from public.jobs where so_number = 'SO-9781' and customer ilike 'VFS%';
  if jid is null then raise notice 'SO-9781 for VFS not found: nothing removed.'; return; end if;
  select count(*), count(*) filter (where xero_invoice_id is not null or xero_invoice_no is not null)
    into n_dn, n_inv from public.despatches where job_id = jid;
  if n_inv > 0 then raise notice 'SO-9781 has a dispatch invoiced in Xero: nothing removed.'; return; end if;

  delete from public.despatches where job_id = jid;          -- its despatch_lines go with it
  delete from public.jobs where id = jid;                     -- lines, prices and processes go with it
  raise notice 'Removed SO-9781 and % dispatch note(s).', n_dn;

  -- Numbers: only wind back what the test took, and never below anything still in use.
  update public.counters set next = 9781
    where name = 'sales_order' and next = 9782
      and not exists (select 1 from public.jobs where so_number ~ '^SO-[0-9]+$' and substr(so_number, 4)::integer >= 9781);
  update public.counters set next = 1
    where name = 'despatch_note' and next <= n_dn + 1
      and not exists (select 1 from public.despatches);
end;
$$;
