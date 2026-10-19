-- Go-live (Philip, 19 Oct): clear the board before the changeover import from Xero. Nobody worked from
-- the orders on the board (SO-9782, SO-9786, SO-9787 and tests), so every order goes, with its dispatch
-- notes, ticks, pro formas, purchase order links and drawing links (the files stay in SharePoint, and
-- nothing in Xero is touched). The Won quotes import list and "not a job" marks go too, so the import
-- starts fresh. Kept: staff, Levi's figures, office settings, the contact book and Xero contact matches.
delete from public.despatches;          -- their lines go with them
delete from public.jobs;                -- lines, prices, ticks, pro formas, purchase orders, drawings go with them
delete from public.xero_orders;
delete from public.quote_dismissals;

-- Numbers: notes and pro formas start again; sales orders go back to just after the last one Clarke Lane
-- raised in Xero before the board (the board's own check moves it past Xero's highest SO on the next read).
update public.counters set next = 1 where name in ('despatch_note', 'pro_forma');
update public.counters set next = 9782 where name = 'sales_order' and next > 9782;
