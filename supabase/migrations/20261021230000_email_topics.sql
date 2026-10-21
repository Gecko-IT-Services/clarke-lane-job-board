-- Customers' emails become actions (Philip, 21 Oct: a PO, a complaint, a question on a price and a "can it be sooner"
-- sat in "Customers writing about their orders" with only Mark all seen). Safe to run more than once.
--   topic        what the email is about, read by AI: po, quote_question, order_change, delivery, complaint,
--                lead_time, invoice, other ('' while not read yet)
--   refs         the numbers it quotes, exactly as written: { so, po, quote } (empty strings when not mentioned)
--   quote_sp_id  the quote in the quote calculator it was matched to (SharePoint item id), if any
--   job_id       the order on the board it was matched to, if any
-- No money in any of them. The enquiries policy (office: Levi and Mandy) already covers these columns.
alter table public.enquiries
  add column if not exists topic text not null default '',
  add column if not exists refs jsonb not null default '{}',
  add column if not exists quote_sp_id bigint,
  add column if not exists job_id bigint;
