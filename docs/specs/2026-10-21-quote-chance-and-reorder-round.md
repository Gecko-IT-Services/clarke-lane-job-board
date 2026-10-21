# Quote chance fixed, and the reorder round (21 Oct)

Philip: on the live CRM every open quote shows a 1–3% chance, even one sent a week ago, and "Likely from open quotes" is tiny. And 47 repeat parts are due a reorder: the biggest easy win, if someone asks.

## 1. The quote chance

**Why it was wrong.** The quote calculator has no ordered date, so a won quote's date falls back to SharePoint's `lastModifiedDateTime` (`toQuote` in `core/quotes.js`), which for most won quotes is the day it was quoted. `winStats` then saw every won quote ordered on day 0, concluded that no quote still open after day 7 is ever won, and its curve fell to the 0.01 floor at every age: 1% × the customer factor (up to 2.5, so 3%).

- `winStats` (`core/sales.js`): with enough history (15 decided quotes) but unusable timing (80% of won quotes in a day or less, or fewer than 5 won quotes with a gap over 0 days) it returns `timingUnknown: true`, keeps his own win rate, value rate, average order and per-customer rates, uses `GENERAL_CURVE` for timing, and sets `medianDays` and `p80Days` to null.
- A curve from his own history never falls under half the general curve at the same age, so a thin history cannot declare every older quote dead.
- `pipeline`: with the timing unknown, a quote counts as likely dead after the 60-day default.
- **What your quotes say**: when the timing is unknown it says, in plain English, that the quote calculator does not record when a quote was ordered, so timing uses a general curve, and that adding an **Ordered Date** column to the Quotes list in SharePoint (the board already reads `OrderedDate`, `Ordered Date`, `DateOrdered` or `Date Ordered`) makes it use his own history. With his own timing it gives the curve in words: "Of quotes still open after 7 days, X% are ordered later; after 30 days, Y%; after 60, Z%."
- Who sees what is unchanged: the month's totals Levi only, each quote's own value and chance for Mandy too.
- Tests (`tests/sales.mjs`): won date = quote date gives `timingUnknown`, about 30% at 7 days before the customer factor and dead only after 60 days; the normal history unchanged apart from the half-of-general floor (6% at 30 days, not 1%).

## 2. The reorder round

`reordersDue` (`core/crm.js`) already finds repeat items past their usual gap from Xero's invoices. It is now a weekly routine for Mandy and Levi (office), with tracking.

- `core/reorders.js` (tested in `tests/reorders.mjs`):
  - `reorderRound(reorders, actions, jobs, today)`: each due item with `asked` (date of the last ask), `askedBy`, `snoozedUntil` and `state`: **won** (asked, and an order for that customer on or after the ask has a line naming the item), **snoozed** (marked not needed, until a date still ahead), **asked** (in the last 30 days, then it is due again), else **due**. Items match order lines on the first 3 meaningful words of the invoice description, ignoring sizes (2mm, 1000x500) and little words. Items asked about that have since dropped off the due list (ordered and invoiced) stay in only when their order is found, so the tally counts them. Due first by the customer's worth, then asked, not needed, won.
  - `reorderTally(round, today, jobValue)`: due now, and this month's asks and wins; the won value only when a value function is passed (Levi).
  - `reorderAngle(r)`: the line given to the AI email (was inline in `sales.js`).
  - `roundNudge(round, actions, today)`: on Mondays, or when nobody has asked for a week, how many are waiting.
- Stored as `sales_actions` rows, no new table: `reorder` (note `Reorder: <item>`) and `reorder_snooze` (note `until YYYY-MM-DD · <item>`). Migration `20261021200000_reorder_actions.sql` widens the `kind` check; safe to run again.
- `src/reorders.js` draws the **Reorder round** panel: "N to ask this week · this month asked N · won N" (the won value Levi only), the due list (customer, item, usually every N days, last ordered and how long ago) with **Write an email** (the AI email; once it is in Outlook Drafts the item is noted as asked), **Asked** (after a call), **Not needed** (90 days) and **Customer page**. Asked and not-needed items show below, greyed, with their date; won ones as "Came back in: …".
- **Home** (office): under Today, compact (top 5, "See all N on the CRM") with the one-line **Monday reorder round: N to ask this week.** The Today tile "repeat parts due a reorder" counts only those still to ask.
- **CRM › Follow-ups**: the full panel replaces "Due a reorder".
- Customer page timeline: the two kinds show as "Reorder asked" and "Not needed".
- Practice page: three made-up repeat parts due (Second, Fifth and Tenth Example), Tenth already asked by Mandy.
- Help: a new question, *The reorder round (repeat parts due again)?*, and the CRM entry updated.
