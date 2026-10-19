-- One-off clean-up after the end-to-end test (Philip, 19 Oct): remove the practice order SO-9788
-- (Miscellaneous, PO "TEST GECKO") with its dispatch note DN-0004, pro forma PF-0001, purchase order
-- link (PO-4349) and drawing link. The draft invoice INV-31978 and PO-4349 were deleted in Xero by
-- Philip, and the drawing's folder is removed from SharePoint by hand. Then give the numbers back so the
-- first real ones use them. Guarded: does nothing unless SO-9788 is that practice order.
do $$
declare jid bigint;
begin
  select id into jid from public.jobs where so_number = 'SO-9788' and customer ilike 'misc%' and customer_po = 'TEST GECKO';
  if jid is null then raise notice 'Practice order SO-9788 not found: nothing removed.'; return; end if;
  delete from public.despatches where job_id = jid;             -- its lines go with it
  delete from public.jobs where id = jid;                        -- lines, prices, ticks, pro formas, POs, drawings go with it
  raise notice 'Removed the practice order SO-9788.';

  update public.counters set next = 9788
   where name = 'sales_order' and next = 9789
     and not exists (select 1 from public.jobs where so_number ~ '^SO-[0-9]+$' and substr(so_number, 4)::integer >= 9788);
  update public.counters set next = 4
   where name = 'despatch_note' and next = 5
     and not exists (select 1 from public.despatches where dn_number ~ '^DN-[0-9]+$' and substr(dn_number, 4)::integer >= 4);
  update public.counters set next = 1
   where name = 'pro_forma' and next = 2 and not exists (select 1 from public.proformas);
end;
$$;
