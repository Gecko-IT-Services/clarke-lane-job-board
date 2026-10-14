-- Unit prices come from the quote's line total ÷ quantity (Q-0078: £12,041.76 / 4000 =
-- £3.01044). At 4dp that loses 16p on the order. 6dp keeps qty × unit = the quoted total
-- for any line the quote calculator produces (its totals are to the penny).
alter table public.job_line_prices alter column unit_price type numeric(14,6);
