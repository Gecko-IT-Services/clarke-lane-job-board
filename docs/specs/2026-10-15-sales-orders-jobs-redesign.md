# Sales orders and Jobs redesign — design note (15 Oct 2026)

## Why
Home and Won quotes now follow one pattern: problems first, four summary cards, one clean table
with a switch, plain wording (`2026-10-15-home-redesign.md`, `2026-10-15-won-quotes-redesign.md`).
Sales orders and Jobs are still the older Sage-style tables: a "Show" dropdown, sortable headings,
and on Jobs eleven process columns. Agreed from the `sales-jobs` mockup on 15 Oct. Nothing that
works today is taken away: New order / Amend, row click to open, process ticks, the running order
and its arrows, "Put everything back in date order", search.

## Sales orders (office only, as today)
1. **Header.** "Sales orders", sub "Every order, with what has been dispatched and invoiced. Click
   one to open it." Right: **New order** (primary, `data-neworder`), hidden while the order form is
   open (as today). The order form (New / Amend) still opens above everything else on this tab.
2. **Four cards** (Home's `card()`; tinted only when "on"):
   | Card | Tint | Number | Label | On when |
   |---|---|---|---|---|
   | Late | bad | late count | "Late · £remaining" (just "Late" when none) | count > 0 |
   | On hold | warn | held count | "On hold · £remaining" (just "On hold" when none) | count > 0 |
   | Not invoiced | warn | £ value of dispatches not yet in Xero | "Dispatched, not invoiced · N orders" | value > 0 |
   | Outstanding | info | £ still to dispatch | "Outstanding · N orders" | N > 0 |
   Late = outstanding, next due before today (held included). £remaining = value still to dispatch.
   Not invoiced counts every dispatch with no Xero invoice on an order that is not cancelled.
3. **One table, a four-way switch and a search box:** **Outstanding (n)** | **Dispatched (n)** |
   **On hold (n)** | **Cancelled (n)**, remembered in `localStorage` `clj.orderview` (try/catch;
   default Outstanding). Replaces the "Show" dropdown (and its "All" option).
   - Outstanding = not fully dispatched and not cancelled (held included), **soonest due first**.
   - Dispatched = fully dispatched, newest last-dispatch first, latest 50.
   - On hold = held, soonest due first. Cancelled = newest order first.
   - **Searching** looks through every order whatever the switch says; the heading becomes
     "Search results" and the rows are newest order first. Search box placeholder "Search order,
     customer or PO" (`#osearch`, as today, focus kept while typing).
   - Columns: **Customer** (bold; below in mono: `SO-… · PO` or `SO-… · no PO`), **Ordered** (date),
     **Next due** (the existing due chip; blank for dispatched and cancelled), **Progress** (despatch
     status chip + invoice status chip, plus "On hold" / "Cancelled" chips as today), **Net** (order
     value). Whole row opens the order (`tr[data-open]`). No sortable headings.
   - Empty: Outstanding "Nothing outstanding — every order has gone out." (green); others "No orders
     here."; search "No orders match that search."

## Jobs (office and shop floor; the floor sees no £)
1. **Header.** "Jobs", sub "What is being made, in the running order. Tick a process when it is
   finished." Right: **Dispatch** (`data-tab="dispatch"`).
2. **Four cards:**
   | Card | Tint | Number | Label | On when |
   |---|---|---|---|---|
   | Late | bad | late count | office "Late · £remaining", floor "Late" | count > 0 |
   | Not started | — | upcoming count | "Not started" | never (always plain) |
   | In progress | info | current count | "In progress" | count > 0 |
   | Ready | ok | ready count | "Ready to dispatch" | count > 0 |
   Late and Ready are Home's (`dashboard()` `late` / `ready`).
3. **One table, a three-way switch and a search box:** **Not started (n)** | **In progress (n)** |
   **Finished (n)** (the stages upcoming / current / completed renamed; `data-stage` as today; still
   opens on the first stage with something in it). Note beside the heading: "running order" plus,
   office, "· £x still to dispatch"; Finished: "latest 50, newest first".
   - Not started / In progress: running order (`byRunningOrder`). Finished: newest last-dispatch
     first, latest 50 (search covers all of them).
   - Search (`#search`, "Search customer, SO, PO or part") filters the current stage, as today.
   - Columns: **Order** (rank number; office, not Finished, no search: ⤒ ▲ ▼ as today; on Finished
     the column is not shown), **Customer** (bold; mono `SO-… · PO`; below, the status chips as
     today), **Due** (due chip; Finished: "Dispatched" with the last dispatch date), **Processes**
     (one tick pill per process the job needs, in Levi's order, label = `SHORT[p]`; a done pill is
     green with a tick; clicking toggles it, `data-proc`/`data-job`, title as today),
     **Outstanding** (office; Finished: "Value").
   - A job with every process ticked and status open has a green row tint, as today.
   - Under the table, as today: the tick/arrows note and "Put everything back in date order".
   - Empty: as today ("No jobs match that search.", "No jobs here.", the no-jobs-yet lines).

## What goes
The "Show" dropdown (`#ofilter`, `S.orderFilter`), sortable headings on these two tabs (the `board`,
`boardDone` and `orders` sort keys; the sort machinery stays for Dispatch's `dn`), the eleven process
columns on Jobs. `table.jobs` styles stay: the Shop floor and Help pictures still use them.

## Code
- `src/core/jobs.js`: `salesSummary(jobs, today)` → `{ outstanding, dispatched, held, cancelled,
  late, lateValue, heldValue, outstandingValue, uninvoiced, uninvoicedValue }` (lists sorted as
  above) and `boardLists(jobs)` → `{ upcoming, current, completed }` (sorted as above). Pure, tested.
- New `src/orders.js` `renderOrders(...)` and `src/board.js` `renderBoard(...)`: draw the tabs with
  Home's `card()` (new icons for hold, invoice, not started, in progress). Listed in `MODULES`.
- `src/app.js`: wire both in, `data-orderview` click branch and `clj.orderview` restore; remove
  `salesOrders()`, `jobBoard()` and the `#ofilter` handler.
- `index.html`: Home's block applies to `#v-orders` and `#v-jobs` too; tick pill styles; phone
  layout (≤560px): the switches fill the width; Sales orders hides Ordered and Net, Jobs hides the Order column and Outstanding.
- `src/help.js`: Jobs text and picture use the new stage names and the one Processes column; drop
  the "click a heading to sort" step on Jobs; Sales orders text mentions the switch.

## Testing
`tests/jobs.mjs`: `salesSummary` split / order / sums / held-in-outstanding / not-invoiced, and
`boardLists` order. Browser check of `dev/smoke.html#orders` and `#jobs` (office and `?role=floor`),
light and dark, desktop / 768px / 375px, every switch view, search, ticking and moving a job.
