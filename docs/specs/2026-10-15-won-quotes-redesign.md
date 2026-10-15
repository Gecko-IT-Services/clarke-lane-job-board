# Won quotes redesign — design note (15 Oct 2026)

## Why
Won quotes is the office's inbox of quotes Levi has marked Ordered in the quote calculator (and
Xero sales orders imported at changeover) that still need to become sales orders. Today it is one
sortable table, newest first, with "Already sales orders" and "Marked not a job" folded away below.
Jack wants it to follow the new Home (`2026-10-15-home-redesign.md`): problems first, summary
cards, one clean table with a switch, plain wording, one next step per row. Agreed from the
`won-quotes` mockup on 15 Oct. Office only, as today (the floor does not see this tab).

## Layout, top to bottom
1. **Header.** "Won quotes", sub "Quotes Levi has marked Ordered in the quote calculator, and
   sales orders brought in from Xero". Right: **Refresh** (`data-reloadquotes`) and **New order**
   (primary, `data-neworder`). The SharePoint error banner (with Try again) shows under it, as today.
2. **Four cards** (same component and colour rule as Home: a card is tinted only when "on"):
   | Card | Tint | Number | Label | On when |
   |---|---|---|---|---|
   | Waiting | warn | waiting count | "Waiting · £value" (just "Waiting" when none) | count > 0 |
   | Oldest waiting | bad if > 5 working days, else warn | "N days", or "—" | "Oldest waiting · customer" | age > 2 working days |
   | Made this week | ok | quotes made into orders since Monday | "Made into orders this week" | count > 0 |
   | Won this month | info | £ value | "Won this month · N quotes" | N > 0 |
   "Made this week" uses the sales order's ordered date. "Won this month" counts every quote or
   Xero order dated from the 1st of this month to today that is not marked not a job.
3. **One table with a three-way switch:** **Waiting (n)** | **Made into orders (n)** | **Not a job (n)**,
   remembered in `localStorage` `clj.wonview` (try/catch; default Waiting). Heading changes with it.
   Columns: Customer (bold; below in mono: number · "quote" or "Xero import"), Won (date; on Waiting
   an age chip "N days": plain ≤ 2, amber 3–5, red > 5 working days), Contact (contact name or
   "Ref …" for Xero), Value, Action.
   - **Waiting:** oldest first (undated last). Actions exactly as today: **Create sales order**
     (primary; `data-start` / `data-fromxero`) and **Not a job** (`data-dismiss` / `data-xdismiss`,
     same tooltips); "Reading the lines…" while a quote's lines load. Empty: green
     "All clear — every won quote is a sales order."
   - **Made into orders:** newest first, latest 20 (as today). Action **Open SO-…** (`data-open`).
     Empty: "No won quotes have been made into orders yet."
   - **Not a job:** newest first. Action **Put back** (`data-restore` / `data-xrestore`).
     Empty: "Nothing marked not a job."
   While the quotes are still being read: "Reading the quotes…" in place of the table body.

Age is counted in working days (Mon–Fri) after the date won, up to and including today.

## What goes
The sortable column headers on this tab (its order is now fixed: oldest waiting first), the
folded "Already sales orders" / "Marked not a job" sections, and `inboxRow` / `inboxTable`.

## Code
- `src/core/jobs.js` (next to `quoteStates`): `workingDaysSince(from, today)`,
  `quoteAgeTone(days)` → `'late' | 'soon' | ''`, and `wonQuotes(rows, today)` → `{ waiting, made,
  gone, waitingValue, oldest, madeThisWeek, wonMonth, wonMonthValue }`. Pure and tested.
- `src/home.js`: export the card helper so Won quotes uses the same component; add a quote icon.
- New `src/won.js`: `renderWon(...)` draws the tab (listed in index.html's `MODULES`).
- `src/app.js`: `inboxRows()` adds `madeOn` (the job's ordered date); `renderQuotes()` calls
  `renderWon`; `data-wonview` click branch and `clj.wonview` restore; remove `inboxRow` /
  `inboxTable`.
- `index.html`: Home's styles apply to both views (`#v-home` → `:is(#v-home,#v-quotes)` in the
  home block). No new colours.
- `src/help.js`: Won quotes now lists the oldest waiting first.
- `dev/fake-data.js`: more made-up quotes so the smoke page shows red, amber and plain ages and a
  made-this-week order.

## Testing
`tests/jobs.mjs`: working-day ages (weekend start, same day, missing date), the tone thresholds,
and `wonQuotes` split/order/sums/this-week/this-month. Browser check of `dev/smoke.html#quotes` in
light and dark, desktop / 768px / 375px, every switch view and empty state.

## Drill-down (Philip, 15 Oct)
Every card opens the list behind its number: **Waiting** → the Waiting view; **Oldest waiting** → the
Waiting view with that quote's row opened on its lines; **Made into orders this week** and **Won this
month** → their own lists (`wonQuotes().madeWeek` / `.month`, tested) under the switch, with "✕ Close
this list" back to Waiting. Cards are buttons (`card(..., attrs)` in home.js; plain cards unchanged).
Every row has **Lines**: a quote's lines from the quote calculator (read on demand, cached for the
visit), a Xero import's lines, or, once made, the sales order's lines with a link to open it.
