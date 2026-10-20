-- Copy a previous PO (Philip, 20 Oct): a copy brings the supplier, the parts and the Xero account code,
-- so each PO now keeps the account it was raised with ('' = left for Keith to code in Xero).
alter table public.purchase_orders add column account_code text not null default '';
