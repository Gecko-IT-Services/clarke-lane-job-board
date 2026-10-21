-- The reorder round (Philip, 21 Oct): Mandy and Levi ask about repeat parts due again once a week, and the board
-- remembers who was asked and which were not needed, so the same 47 do not come back every Monday. Both are rows
-- in sales_actions (the office's already): 'reorder' = asked about the item (note: the item), 'reorder_snooze' =
-- not needed for now (note: 'until YYYY-MM-DD · the item'). No new table. Safe to run more than once.
alter table public.sales_actions drop constraint if exists sales_actions_kind_check;
alter table public.sales_actions add constraint sales_actions_kind_check
  check (kind in ('email', 'call', 'note', 'lost', 'reopen', 'visit', 'reorder', 'reorder_snooze'));
