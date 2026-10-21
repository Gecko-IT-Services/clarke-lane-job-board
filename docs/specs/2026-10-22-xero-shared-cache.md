# One shared memory for Xero's answers (22 Oct)

The office saw this on the Dispatch tab: "Xero's daily limit for the board is used up. It frees up in about 4 hour(s)." Xero allows the app 5,000 API calls per organisation in a rolling 24 hours, plus 60 a minute and 5 at once. The board used far more than it needed, because nothing Xero said was remembered between browsers or page loads:
- `history` (24 months of sales invoices with their lines, plus credit notes) was read again on every page load of an office tab: dozens of calls each time (100 invoices a call).
- `debts`, `month` (Levi only) and invoice status were asked every 15 minutes per open tab, from the board's refresh that runs every minute and on every change.
- `contacts` (30 minutes per browser), `items` (every page load), `read` for the SO-number check (15 minutes per browser) and `bills` (every visit).

## 1. The table
Migration `20261022140000_xero_cache.sql` (re-runnable): `public.xero_cache (key text primary key, body jsonb, at timestamptz)`. RLS is on and the only policy refuses every signed-in read, so only the Xero edge function (service role) reads or writes it. Some of it is Levi-only money (the month's invoices), so nothing reads it from the browser.

## 2. What is kept, and for how long
The edge function (`supabase/functions/xero/index.ts`, `cached()`) keeps each read answer under a key. Within the time below everyone, on every device, gets the kept answer; after it, the next request reads Xero and saves the new answer.

| Route | Key | Kept for |
|---|---|---|
| history (customer pages, CRM, Home's lists) | `history` | 6 hours |
| bills (metal prices) | `bills` | 6 hours |
| items (Products and services) | `items` | 1 hour |
| contacts | `contacts` | 30 minutes |
| debts (over 60 days) | `debts` | 15 minutes |
| month (Levi only; the role check comes first) | `month:<from>:<to>` | 15 minutes |
| read (sales orders, SO-number check) | `read` | 15 minutes |

Not kept: `invoices` (status by ids), `contact` (one contact), `online`, `send`, `po`, `connect`, `disconnect`.

The board still keeps a few answers in the browser for a short while as before (debts and month for the tab, 15 minutes). The customer list kept on each computer is now 5 minutes, so a fresh read on one computer reaches the others quickly.

## 3. Reading Xero again
A request body of `{ fresh: true }` skips the kept answer. It is sent by:
- **Read the customers again** (Xero tab, and the order form's Try again): contacts.
- **Read them again** under Xero's Products and services: items.
- **Import open sales orders** / **Import again**: read (the quiet SO-number check on opening the board uses the kept one).
- The CRM's reload: history. A forced debts or month read (`loadDebts(true)`, `loadMonthSales(true)`).

## 4. Calls left today
Xero sends `X-DayLimit-Remaining` and `X-MinLimit-Remaining` on every call. The edge function remembers the last ones it saw and adds `xero_left: { day, minute, at }` to every answer; `src/data.js` copies it into `xeroLeft`. The Xero tab's Connection panel shows "Xero allows the board 5,000 calls a day. Left today: N (as of 14:05)", or "Calls left today: not known yet" until the first read. A fresh edge-function instance knows nothing until it has called Xero, and a kept answer reports what that instance last saw. Under 200 left, each call writes a warning to the Supabase function logs.

## 5. When the limit is used up anyway
If reading Xero fails on the daily limit and a kept answer exists (however old), the kept one is returned with `stale: true`. The board then shows a quiet note: "Xero's figures from 14:05 (Xero's daily limit is used up for now)" on the Over 60 days list, the month panel's Xero line, customer pages' Xero invoices and the CRM's Customers to get back in touch with. The error message itself now ends: "Nothing is lost: dispatches waiting for Xero stay on the list; send them then." Help has a question on it.

## 6. Checks
What is kept, how old and how big:
```sql
select key, at, pg_size_pretty(pg_column_size(body)::bigint) as size from public.xero_cache order by at desc;
```
Is the table there (before the edge function is deployed)?
```sql
select exists (select 1 from information_schema.tables where table_name = 'xero_cache') as xero_cache_ready;
```
If the table is missing, the function logs "xero_cache read …" and reads Xero every time, as before.
