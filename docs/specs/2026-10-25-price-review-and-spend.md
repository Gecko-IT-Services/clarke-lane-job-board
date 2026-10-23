# Price review, and customers spending less than last year (25 Oct)

Philip asked what else the board can do towards £20k a month more. The September pack: £892k of sales in the
year to 30 September 2026 at a 31% gross margin, £325k of overheads, a £45k loss. Break-even is about £86k a
month against £74k. The two cheapest places to look are the prices on repeat work and the customers who are
still ordering but spending less. Both on **CRM › Follow-ups**, from Xero's 24 months of invoice lines
(`history`), no new data, no database change.

## Price review (Levi and Mandy)
- `priceReview(base, actions, today)` in core/sales.js: for each customer and part (by item code, else the first
  line of the description; carriage left out), the invoice lines with unit = amount ÷ qty. A part is listed when
  it has 3+ lines, one in the last 12 months, and the price now has run (within ½%) for over a year. Rows: price
  now, the date it started and how long, the last 12 months' quantity and value, 5% of that value; biggest first.
- The line at the top adds them up. The note says where the prices come from and that the next order's price is
  what the board remembers (the part picker offers the last price charged).
- **Reviewed**: a sales_actions row, kind `note`, note `Price reviewed: <item>` (no new kind, so no migration);
  off the list for a year and on the customer's timeline. **Page** opens the customer.

## Spending less than last year (Levi only: customer spend)
- `spendChanges(base, today, earliest)`: regular customers (£1,000+ the year before) still ordering, not quiet or
  lapsed (those are under Customers to get back in touch with), down 15% or more on the 12 months before; and the
  ones up, in a line at the bottom. `partial` when Xero's history is under 700 days: the screen says the year
  before is not all there.
- Write an email (AI, with an angle that forbids figures), Log a call, Page.

Tests in tests/sales.mjs. Help: the CRM section line and two questions.
