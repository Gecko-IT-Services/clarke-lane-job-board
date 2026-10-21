# Home layouts: Levi's and Mandy's (21 Oct)

Philip (21 Oct): "remove the areas that don't matter and make the ones that do aligned and presentable". The two office
logins now get different Homes because they do different jobs: **Levi (`md`) = the money and what to chase; Mandy
(`office`) = the day's work.** The shop floor login has no Home (it opens on the Shop floor). Home is styled
black, silver and white for both.

## Levi's Home (`md`)

Done first, unchanged by this work:

1. Header: greeting, date, processes ticked today, Dispatch and New order.
2. The month panel (invoiced, work in progress, break-even and target) beside **Sales this week**: quotes to chase,
   repeat parts to ask about, customers gone quiet, enquiries waiting, then his tasks and Add a task.
3. Four cards: order book (£), running late (£), due in 7 days, owed over 60 days.
4. From the shop floor (only when there are notes), the reorder round (compact), Needs attention / Going out.

Dispatch, invoicing and the station snapshot are not on his Home; they are Mandy's and the shop floor's.

## Mandy's Home (`office`)

Top to bottom, every box on the same 16px gutters, nothing half-empty:

1. Header, as Levi's.
2. Two panels side by side at the same height (the `.hmd` grid; stacked at 1000px and below):
   - **Today**: 2×2 tiles: new enquiries to answer (→ Customers › enquiries), tasks due today (overdue counted in the
     label), won quotes waiting to become orders (→ Won quotes; "—" until SharePoint's quotes are read), open orders with
     no drawing (→ a list in the table below, `homeView = 'nodrawing'`). Then her tasks (overdue, today, next 7 days)
     and Add a task.
   - **Sales this week**: 2×2 tiles: quotes to chase (→ CRM), repeat parts to ask about (→ CRM reorder round),
     customers gone quiet (→ CRM), open orders with no contact saved (→ Customers). No task list.
3. Eight cards on one grid, so both rows are the same height: Running late, Due in the next 7 days, Ready to dispatch,
   Open jobs; then Delivered not invoiced, In Xero not approved, Over 60 days, Sent out. Sent out always shows (0,
   "nothing at other companies", silver) and Over 60 days says "Xero not connected" rather than leaving a gap.
4. From the shop floor, full width, only when there are notes.
5. Reorder round (compact).
6. Station snapshot, boxed like the reorder round, its stations filling one row and wrapping when there are many.
7. Needs attention / Going out.

Removed: the old five-tile Today row (its tiles moved into the two panels).

Money: Mandy sees counts and each order's own value in the tables, never the month's totals; the existing `md` guards
are unchanged.

## Where the numbers come from

- `homeGaps(jobs, people)` in `src/core/jobs.js` (tested in `tests/jobs.mjs`): open orders (on the board, not cancelled,
  held included, Xero preview orders left out) with no files attached, and those whose customer has nobody in the
  contact book (`customer_people`, by `normName`). Soonest due first.
- `morning()` in `src/core/crm.js` (tested in `tests/crm.mjs`) turns the lists into the tile counts, now with `won`,
  `noDrawing` and `noContact`.
- `renderToday` in `src/customer.js` draws the panels; `renderHome` in `src/home.js` lays out the page.
