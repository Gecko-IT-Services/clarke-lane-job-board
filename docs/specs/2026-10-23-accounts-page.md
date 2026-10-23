# Keith's Accounts page (23 Oct)

**Who.** Keith, the accountant, signs in with **accounts@clarke-lane.co.uk**. The page is his alone: Levi, Mandy and
the shop floor cannot open it (typing its address sends them to their own Home). Keith sees only this page: no
tabs, no other screens. Read only: nothing on it changes Xero or the board.

**Why.** Keith works in Xero, which cannot see the workshop: what was delivered and signed for, what was ordered
from suppliers, what went out to the coaters. The page puts that beside Xero's figures.

## The four sections

1. **Draft invoices to approve.** Every draft the board made in Xero that is not approved yet: customer, order and
   PO, delivery note, when it was delivered and who signed, the board's net. **Delivery note** opens the note as
   signed for (no Email button for Keith). Checks: *Xero says £x, the board £y* (the draft was changed in Xero),
   *In Xero for …* (the Xero customer has no word in common with the order's), *Nobody recorded as signing*.
2. **Purchase orders against bills** (Xero, last 120 days). A bill belongs to a PO when it is from the same supplier
   and its reference or number quotes the PO number; otherwise the one bill for the same amount within 60 days is
   marked *likely*. Checks: *Bill £x vs order £y* (more than £1 and 1% apart), *n prices changed* (line by line, by
   item code or description: "ordered at £50.00, billed at £53.00 × 10"), *No bill yet* (approved, over 3 weeks),
   *Billed in Xero, no bill quotes it*. Drafts are not checked. Also: bills from these suppliers with no PO, and work
   sent out for coating or plating with no bill from that company since. *Needs a look* / *All*.
3. **Month-end cut-off**, as at today: delivered not invoiced (the accrual, with the list), dispatched not yet
   delivered, and the order book still to make (late, rest of the month, next month, later). Net, board prices.
4. **Money coming in.** Approved unpaid invoices by due date (overdue, 7 days, 8–30 days, later), the overdue ones
   with the last chase from the board, and what the order book should invoice in the next 4 weeks.

Logic in `src/core/accounts.js` (tests in `tests/accounts.mjs`); the page is `src/accounts.js`.

## Access

Migration `20261023110000_accounts_role.sql`: the role `accounts`; `is_staff()` now means md, office and floor only,
so the accounts login can tick, dispatch or post nothing; `is_accounts()`; read-only policies for accounts on jobs,
job_lines, job_line_prices, despatches, despatch_lines, outwork and debt_chases; Keith added to the staff list.
Nobody else's access changes.

Xero function: the accounts login may call `invoices` (with net and contact, for him only), `debts` and the new
`purchases` (POs and supplier bills with lines, kept 30 minutes, accounts only), and nothing that writes.

## Check

```sql
select role from public.staff where email = 'accounts@clarke-lane.co.uk';   -- accounts
select exists (select 1 from pg_proc where proname = 'is_accounts') as accounts_ready;   -- true
```
