# Keith's monthly pack (23 Oct)

**Why.** Keith presents the month to Rob, the owner. Xero has the ledgers; the board has the orders and deliveries.
The pack puts both on one page, with an AI-written commentary to start from, and prints as the month's management
accounts. On Keith's Accounts page: **Checks** (the four lists from before) and **Monthly pack**.

## What it shows (for a complete month, the last 12 to choose from)

- **Four figures:** sales (against the same month last year), gross margin (against last year's), net profit, cash
  at the month end (and the change in the month).
- **Profit and loss:** the month, the same month last year, the year to date, the same period last year: sales,
  cost of sales, gross profit and margin, overheads, other income, net profit and margin. The year runs from the
  organisation's year end in Xero.
- **Sales, last 12 months:** bars (one series; the month and value on hover) with the table of sales, gross
  margin and net profit by month under it.
- **Biggest costs this month:** cost of sales and overhead lines.
- **Cash and the balance sheet:** bank opening, in, out, closing; debtors with debtor days (last 3 months' sales)
  and the change on the month before; creditors with creditor days; VAT owed; current ratio (bank included);
  net assets.
- **From the board:** orders booked in the month, the order book now and how many months of sales it covers,
  on-time deliveries in the month, and the biggest customers invoiced in Xero that month.
- **Analysis:** *Write the analysis* sends the figures on the page (and only those) to the AI, which writes a
  headline, summary, points on sales, margins, overheads, cash and the order book, risks, actions for next month
  and questions to check before presenting. Kept per month (`month_packs`), so it is paid for once and reads the
  same next time; *Write it again* replaces it.
- **Print or save PDF:** the pack on A4, "Management accounts, September 2026", unaudited.

Wages: payroll moves into Xero in April 2027. Until then a month can look light or heavy on wages; the page says so
and the AI is told to mention it only when wages look odd.

## How

- Xero function, route `pack` (accounts only, kept 6 hours): the profit and loss for the month and the 11 before
  (`periods=11&timeframe=MONTH`), the year to date and the same span a year earlier, the same month a year
  earlier, the balance sheet at the month end against the month before, the bank summary for the month; the year
  from `Organisation.FinancialYearEndMonth`. Returned as Xero lays them out. The accounts login may also call
  `month` (the month's sales invoices, for the top customers).
- New Xero permissions (granular names): `accounting.reports.profitandloss.read`,
  `accounting.reports.balancesheet.read`, `accounting.reports.banksummary.read`. **Levi presses Reconnect on the
  Xero tab once** so the connection gets them; until then the pack says so.
- `src/core/pack.js` reads the reports without relying on exact headings (Trading Income or Turnover, Operating
  Expenses or Administrative Costs; Xero's own Gross and Net Profit rows when present). Tests: `tests/pack.mjs`.
- AI: sales-ai kind `monthpack` (accounts only). The function keeps the result and its cost in `month_packs` (read
  by accounts only; written only by the function). It is **not** written to the shared AI log (`sales_emails`),
  so no other login can see even that a pack was written.

## Keith only: every layer

| Layer | Who |
| --- | --- |
| The Accounts page (Checks and Monthly pack) | accounts login only; anyone else typing `#accounts` lands on their own Home |
| Xero `pack` and `purchases` routes | accounts only (403 for everyone else) |
| AI kind `monthpack` | accounts only |
| `month_packs` table (analysis, figures, cost) | read: accounts only; write: the AI function only |
| `xero_cache` (where Xero's answers are kept) | no login can read it; only the Xero function |

## Check

```sql
select exists (select 1 from information_schema.tables where table_name = 'month_packs') as month_packs_ready;
```
