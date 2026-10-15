# Clarke Lane Job Board — design note (14 Oct 2026)

## Why
Clarke Lane Engineering moved from Sage Line 50 to Xero on 1 Oct 2026. Xero has no sales
order processing. Levi (MD) wants a simple sales order system and a job board the whole team
keeps up to date themselves: Levi, Mandy (office) and the Shop Floor (tablet or touch screen).
Keith (accountant) approves invoices in Xero.

Mockup agreed with Philip: https://claude.ai/artifact/AG5aXVQL7FPDu9AFNZFEeY (private; not kept in this public repo because it holds Clarke Lane customer names).

## What it does
1. **Quote → job.** Levi keeps quoting in the CLE Quote Calculator (Power App). Pressing
   *Mark as Ordered* there already sets `Quotes.Status = Ordered` and creates a `Jobs List` row
   (Customer, Quote No, Description). The board shows those rows as "Ordered, ready to become a
   job". Mandy adds the customer PO, delivery date and any call-off schedule; processes are
   pre-ticked from QuoteLines and she checks them. Saving gives the job its sales order number.
2. **Sales order acknowledgement** for each job (print / PDF / Outlook draft to the customer).
3. **Jobs** shown as Upcoming / Current / Completed with Customer, Sales Order No., Customer PO,
   due date and one tick box per process. Stage is derived, never typed:
   upcoming = nothing ticked and nothing despatched; current = something ticked or part
   despatched; completed = every line fully despatched.
4. **Shop floor** view: big buttons, pick a station, see only jobs still needing that process,
   soonest first. Each tick records who and when. Undo is one tap.
5. **Despatch**, whole or part, including call-offs. Each despatch is a numbered despatch note
   (ordered / previously sent / this delivery / still to come, signature boxes, no prices).
6. **Waiting for Xero (until phase 2).** Office sees every despatch not yet invoiced, with its
   net value and reference; Mandy raises it in Xero by hand and types the invoice number in.
7. **Send to Xero (phase 2).** Each despatch not yet sent becomes a **draft** sales invoice in Xero for
   exactly what went out, referenced SO / customer PO / DN. Keith approves in Xero as usual.
   The board never approves, emails or deletes anything in Xero.

## Processes (Levi's 9, decided 14 Oct)
Laser, Fold, Roll Drill, Tap, Insert, C/Sink, Weld, P/Coat Paint, Plating / Anodising — the
existing choice columns on `Jobs List`. Pre-tick from QuoteLines:
Process = Laser → Laser; FoldCount > 0 → Fold; HoleQty1-3 > 0 → Roll Drill; InsertCount > 0 →
Insert; WeldLength > 0 → Weld; PaintRequired → P/Coat Paint; PlatingCost > 0 → Plating / Anodising.
Tap and C/Sink are not in the quote data; Mandy ticks them.
**To confirm:** the choice values on those columns (expected something like blank / Yes / Done).
The board needs "not needed", "needed" and "done".

## Data (decided 14 Oct: quotes stay in SharePoint, the board's own data in Supabase)
Quotes are owned by Levi's CLE Quote Calculator (Power App) on SharePoint site FactoryJobs and
stay there. Everything the board owns lives in a Supabase project **in Clarke Lane's own
Supabase account** (Philip, 14 Oct), with Gecko invited to manage it.

- **Quotes**, **QuoteLines** (SharePoint) — read only, via Graph as the signed-in person.
  The board lists quotes with `Status = Ordered` that have no job yet.
- **Hand-off is one-way, once.** "Create job" copies the quote header and lines into Supabase.
  From then on the job lives only in Supabase; nothing is written back to SharePoint.
- **Jobs List** (SharePoint) is not used by the board. It is maintained by the app's
  Mark as Ordered button and by the automated flow "CLE - Quote Status Changed", which on
  every quote edit recreates/overwrites the row (Completed? → No, Invoice Status → Not ready) or
  deletes it when the quote is no longer Ordered. Nobody uses Jobs List today (Philip, 14 Oct).
  Leave both alone until the board is trusted; switching the flow off is a later tidy-up.
- If an ordered quote is reverted after its job exists, the board flags the job ("quote no longer
  Ordered") and changes nothing.
- Supabase tables (schema only in `supabase/migrations/`, RLS on every table):
  `jobs` (so_number, quote_no, sp_quote_id, customer, customer_po, ordered_on, due_date,
  calloff_dates, notes), `job_lines` (part, qty, unit_price, from quote line),
  `job_processes` (job, process, needed, done_by, done_at), `despatches` (dn_number, job, date,
  xero_invoice_id, xero_invoice_no, sent_to_xero_at), `despatch_lines` (despatch, job_line, qty),
  `counters` (next SO / DN number, taken in a transaction), `staff` (who may sign in, role).
- Realtime on `job_processes` and `despatches` so a tick on the tablet shows everywhere at once.

## Shape
- Static site, no build step, same pattern as the Gecko intranet. Hosting:
  GitHub Pages, repo `Gecko-IT-Services/clarke-lane-job-board` (proposed).
- Supabase sign-in uses the Microsoft ID token (as Gecko's `src/core/supabase.js`); only the
  publishable key is in the site.
- Sign-in: MSAL.js against Clarke Lane's tenant, Entra app "Clarke Lane Job Board",
  single tenant, SPA redirect. Delegated Graph scopes `User.Read`, `Sites.ReadWrite.All`
  (limited to what the signed-in person can already reach). No client secret.
- Roles: Levi and Mandy see prices, Quotes and Send to Xero. Shop Floor sees no prices and can
  tick processes and despatch. Shop Floor needs its own Microsoft 365 sign-in for the tablet.
- **Xero (phase 2)** needs OAuth with a client secret and refresh token, so it runs in a
  Supabase Edge Function with the secret in its environment, never in the browser. Contact names must match Xero
  contacts; unknown names surface as "not matched" rather than being guessed.

## Sign-in setup (done 14 Oct)
Entra app "Clarke Lane Job Board" (client 5b796cc6-c5c9-4500-a84c-07e7952c421f, tenant
d59ce9e8-b410-44cb-894e-9e65dfe021f4): SPA redirects for the Pages URL and http://localhost:8080/,
delegated User.Read + Sites.ReadWrite.All with admin consent, optional claim `email` on the ID token.
Supabase › Authentication › Azure is on with that client ID and tenant URL. **The client secret in
Supabase's Azure form expires October 2028 — renew it in Entra and paste the new value into Supabase
before then.** The board itself never uses the secret.

## Testing without a Clarke Lane sign-in
`dev/smoke.html` loads the real app with `dev/fake-auth.js` and `dev/fake-data.js` (made-up jobs,
no network). `?role=floor` shows the shop-floor view. Serve with
`python3 -m http.server 8080` and open http://localhost:8080/dev/smoke.html.

## Orders the Sage 50 way (15 Oct, Philip: "as similar to Sage sales order as possible")
- **Each line has its own due date.** Call-offs are the same part on several lines with their own
  dates and quantities, as keyed in Sage. "Split into call-offs…" in the order form turns lines into
  n deliveries (weekly / 2-weekly / monthly), sharing the quantity out (remainder on the earliest);
  every quantity and date can then be changed. `jobs.calloff_dates` is gone.
- Order form (New / Amend) has Sage's header: customer, order number, customer order no., contact,
  delivery address, notes; lines with qty, unit price, due, net; Net / VAT / Total.
- **Amend** (`amend_job`): any line can change, new lines can be added; a line can't go below what has
  been despatched and a despatched line can't be removed.
- **Hold / Release / Cancel**: held and cancelled orders cannot be despatched (`create_despatch`
  refuses). Cancel keeps the order (and anything already despatched/invoiced) in the Sales orders
  list; "Delete (made by mistake)" only while nothing has been despatched.
- **Statuses** as Sage shows them: Not despatched / Part despatched / Despatched; Not invoiced /
  Part invoiced / Invoiced (by despatch). Office has a **Sales orders** list beside the job board.
- **Despatch** defaults to everything outstanding on lines due by the next due date; a short delivery
  leaves the rest outstanding on that line. The despatch note lists this delivery and what is still
  to come; the board shows "Delivery 2 of 5".

- **Customer from Xero** (15 Oct): the order form's customer box lists Clarke Lane's Xero contacts.
  Picking one fills the contact person and delivery address (if empty) from Xero (`xero/contact`) and
  saves the customer→contact match, so Send to Xero never asks for that customer. A name not in Xero
  is allowed but flagged.

- **Xero sales orders: a one-off import at changeover** (Philip, 15 Oct; replaces the automatic
  10-minute read). Xero tab › "Import open sales orders" copies every open SO-… quote (not declined,
  deleted or invoiced, not already on the board) into `xero_orders` (office-only RLS). New orders then
  offers them ("Xero import") with Make job / Not a job / Put back until each is dealt with. Running it
  again adds only orders not already imported. Nothing reads Xero's orders by itself.
  Until the import is done, opening the board does a quiet read only to keep the SO counter past
  Xero's highest (Mandy may still raise SOs in Xero until changeover); after the import that stops.

## Spelling (15 Oct)
On screen it is **Dispatch** (Philip: UK). Database names (`despatches`, `create_despatch`, …) are
unchanged; `data.js` turns "despatch" into "dispatch" in any database or Xero error message shown.
The old `#despatch` link still opens the Dispatch tab.

## Repeat order (15 Oct)
Office › any order › **Repeat order**: a new order with the same customer, contact, address, notes,
processes, parts, quantities and prices; new SO number, customer PO left blank, and every due date
moved by the same amount so the first is 10 working days out (call-off spacing kept,
`repeatLines`). The form warns to check prices. Nothing links the two orders beyond the note.

## Purchase orders (open, Philip to decide)
Proposed: raise a draft PO in Xero from the job (supplier from Xero contacts, lines pre-filled from
quote material/paint/plating costs, reference = SO), Xero keeps approval, sending and bill matching;
the job shows its POs' status. They buy both per job and for stock. Waiting on Philip/Levi.

## Emailing documents and confirming delivery (15 Oct)
- Order acknowledgement (office) and delivery note (anyone) have **Email to customer**: the page is
  drawn with html2canvas, made into an A4 PDF with jsPDF, and created as an **Outlook draft** in the
  signed-in person's mailbox (Graph `/me/messages`, delegated `Mail.ReadWrite`, asked for only when
  emailing so it can never block sign-in). The draft opens in Outlook; the person checks and sends.
  The board never sends email itself. Recipient = the order's contact email (from Xero).
- Flow: despatch → **Out for delivery** (email the delivery note) → **Mark delivered** (optional
  "signed by") → **Waiting for Xero** → draft invoice. `xero_mark_sent` and the edge function both
  refuse a despatch that is not delivered. "undo" a delivery only before it is invoiced.
- Printed heading is "Delivery note" (the despatch number stays DN-xxxx).

## Quotes that are not jobs, and cancelling
- **Not a job** (office): an Ordered quote that should never become a job here (e.g. finished in
  Sage) is recorded in `quote_dismissals` and leaves the Ordered list; the quote itself is never
  touched. "Put back" removes the row. Quote state (waiting / job / not a job) is derived every
  render from jobs + dismissals (`quoteStates`), so other screens update live.
- Superseded 15 Oct by Hold / Cancel / Delete (see "Orders the Sage 50 way").
- Delivery date defaults to the quote's DeliveryDays in **working** days (10 if none).

## Xero (built 15 Oct, read side first)
- Edge function `supabase/functions/xero` (verify_jwt off; checks the caller is office itself).
  Xero app at developer.xero.com, Web app, redirect
  `https://rdvkkftgjyrmraotcrfz.supabase.co/functions/v1/xero/callback`. Secrets in Supabase:
  `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (optional `XERO_SCOPES`). App created 15 Oct (after 2 Mar 2026), so
  granular scopes only: `accounting.invoices accounting.contacts.read` plus openid/profile/email/offline_access.
- Tokens live in `private.xero_tokens` (schema not exposed), reached only through
  service-role functions. The board sees only `xero_status()` (organisation, who, when).
- Connect: office presses Connect → Xero consent → callback checks a one-use state (15 min),
  stores tokens, insists the organisation is Clarke Lane. Refresh tokens rotate and lapse after
  60 days unused; then the board says to reconnect.
- Read: Xero quotes since 1 Oct (Mandy's SO-97xx sales orders) and sales invoices. The SO counter
  is raised past the highest SO in Xero on every read, so the two never clash. Each sales order not
  on the board can be made a job ("Make job") keeping its number and the Xero quote id.
- **New job** (office): jobs not from a quote — phone orders, Sage carry-over (number SAGE-9701),
  Xero sales orders (SO-9726). A typed SO number moves the counter past it.
- **Send to Xero (built 15 Oct):** Despatch › Waiting for Xero. One DRAFT ACCREC invoice per
  despatch, built server-side from the database (never from the browser): lines = exactly what went
  out, reference `SO / PO x / DN`, call-off number in the line text, account + VAT code = the pair
  Clarke Lane's own recent invoices use most (override with `XERO_ACCOUNT_CODE`/`XERO_TAX_TYPE`).
  Xero's 4dp unit price: a line whose total would change goes as 1 × the exact total with qty @ unit
  in the description. Idempotency-Key `clj-despatch-<id>` and `xero_mark_sent` (fills only an empty
  slot) stop a despatch being invoiced twice. Contacts: auto-matched when exactly one Xero contact
  normalises to the same name (`normName`), otherwise Mandy picks once; kept in `customer_contacts`.
  The board never approves, emails or deletes an invoice. "Invoiced by hand?" stays as a fallback.

## Money
Unit price = quote line total ÷ quantity, kept to 6dp so qty × unit gives back the quoted total
(Q-0078: 4000 × £3.01044 = £12,041.76; at 4dp it would be £12,041.60). Values are summed per line
rounded to the penny, as an invoice does. Xero takes unit prices to 4dp only: phase 2 must send
such lines so the Xero line amount equals qty × exact unit to the penny (e.g. override the line
amount), and the Waiting for Xero list shows the exact net to type in until then.

## Phases
1. Board: jobs, ticks, shop floor, quote → job, SOA, despatch notes, call-offs.
2. Send to Xero (draft invoices), phone orders without a quote.
3. Monthly target gauge and report from the earlier Netlify mockup, fed from Xero.

## Non-goals
- Replacing the quote calculator. Stock, purchasing, costing actuals, scheduling by machine.
- Retiring the "Export Quote to Sage CSV" flow is Levi's call; it is no longer useful.

## Failure states
- Signed out / no access to the site: say so, never show an empty board.
- Missing column: toast names the list and column to add.
- Two people ticking at once: last write wins per process; done_by/done_at shows who.
- Xero send fails for one despatch: that row stays "not sent" with the reason; others proceed.

## Tab order and the shop floor screen (15 Oct)
Tabs run left to right in the order work flows: **New orders → Jobs → Shop floor → Dispatch → Xero**
(the floor account sees Jobs, Shop floor, Dispatch, and opens on Shop floor). Shop floor is now
Sage-style rows like the rest of the board, not cards: Due, Sales order, Customer and parts still to
make, then the nine process columns as 48px touch boxes (tap = done, tap again = undo, with the
time it was ticked underneath and an Undo toast). Station buttons along the top filter to jobs
waiting for that process and highlight its column. Rows don't open on tap (too easy to hit by
accident on a touch screen); the SO number opens the job. Under 820px wide the process columns
fold into labelled buttons under each job.

## Sorting and the running order (15 Oct)
- **Sortable headings** on the office tables (job board, Sales orders, New orders, dispatch notes):
  click a heading to sort, click again to reverse (▲/▼). Each list opens in date order; each computer
  remembers its last choice (localStorage `clj.sort`, a convenience only). Empty values sort last.
  Waiting for Xero keeps its fixed order (it has pickers in each row). Shop floor is never sortable.
- **Running order** (`jobs.priority`, `set_running_order(ids)`, office only): on the job board, sorted
  by Order, each open job has ⤒ (to the top) ▲ ▼. Jobs given a place come first, in that order; every
  other job follows by due date. Moving a job fixes the places of the jobs down to where it moved,
  so everything below stays in date order (`moveInOrder`, tested). "Put everything back in date
  order" clears it. Shop floor and the Dispatch job picker follow the running order; a job sitting
  above one due sooner shows "Brought forward" on the shop floor. The Order number is the job's
  place on the shop floor, across Upcoming and Current together. A new job, even one due sooner,
  goes below the jobs given a place (that is what a running order means).

## Ready to dispatch (15 Oct)
When every process on an open job is ticked: the shop floor row and the job board row turn green with
"Ready to dispatch"; the Dispatch tab shows a green "N ready" badge (everyone, floor included); and
the Dispatch tab opens with a **Ready to dispatch** panel (running order: order, customer, PO, due,
parts to send, Dispatch button that opens the dispatch form for that job). Held jobs are not listed.

## Help (15 Oct)
A **Help** tab (last tab, everyone) in `src/help.js`: the journey left to right as five linked steps,
then one section per step with a small illustration of that screen and numbered pointers that match
the numbered instructions underneath. Illustrations are built from the board's own CSS with made-up
customers (never real ones; the repo is public), are aria-hidden and not clickable. Office sees all
sections (New orders, the order form, job board, shop floor, dispatch, Xero, emails, questions); the
shop floor sees only Shop floor, Dispatch and questions. When a screen changes, update its section.

## Sales orders tab (15 Oct)
Sales orders is its own tab (office only, it shows values), second after New orders:
**New orders → Sales orders → Jobs → Shop floor → Dispatch → Xero → Help**. New order, Make job, Amend
and Repeat open the order form there. Jobs is the job board only. Each tab has its own search box.
- (15 Oct) The New orders button is **Create sales order** (was "Make job"): an order and its job are
  one record, shown with prices on Sales orders and without on Jobs (Upcoming until started). No
  separate "release to the floor" step, by design.

## Job sheet (15 Oct)
Clarke Lane still keep a paper folder per job (drawing, correspondence) for now, so the board prints a
**Job sheet**: SO number large, customer, PO, quote, ordered and due dates, notes, parts with qty / due /
sent, one row per needed process with a Done box, By and Date (filled in if already ticked on the
board), "not needed" processes listed, and blank lines for drawing no./revision, material and notes.
No prices, so the shop floor can print it too. From the job (drawer) and from the order
acknowledgement's toolbar; the "created" message points to it. No email option (internal only).
Expected to fall away once the board is used on its own.
- (15 Oct) The first tab is **Won quotes** (was "New orders"): quotes Levi has marked Ordered, waiting
  to become sales orders (plus the one-off Xero import). Phone orders start at Sales orders › New order.

## Cancel a dispatch note (15 Oct)
Office only, before it is invoiced in Xero (`cancel_despatch`): the note stays, marked cancelled
(`cancelled_at/by`), its DN number is never reused, and its lines move to `cancelled_lines` so every
"already sent" sum (create_despatch, amend_job, the board) treats them as outstanding again without
those functions changing. A cancelled note can't be emailed, delivered or invoiced (`mark_despatch`,
`xero_mark_sent`, the edge function all refuse). Dispatch › Cancel → confirm row → Yes. No hard delete
(it would leave unexplained gaps in DN numbers); test data is cleaned up by Gecko directly.

## Call-off PO per line (15 Oct)
`job_lines.customer_po` (blank = the order's PO). Order form has a Call-off PO column; Amend fills it
when the customer's call-off PO arrives. `dispatchPo(orderPo, linePos)` (src/core/xero.js, tested)
gives a dispatch its lines' own POs, else the order's: used on the delivery note, its email subject
and text, Waiting for Xero, and the Xero invoice Reference (edge function). The acknowledgement shows a
line's PO when it differs; the job sheet adds a Call-off PO column when any line has one. Search
finds line POs. Repeat order does not copy line POs.

## Stale modules after a deploy (15 Oct)
GitHub Pages lets browsers cache each file ~10 minutes, so after a deploy a new app.js can meet an old
module and fail to load. index.html has a small guard: on a module load error it refetches every
module with cache: 'reload' and reloads once (sessionStorage guard). `tests/site.mjs` keeps its
MODULES list in step with src/.
- (15 Oct) **Job sheet quantities** (call-off customers such as VFS and Wessex make part of an order at
  a time): Job sheet opens "What is this sheet for?" above the sheet, one To make box per line,
  defaulting to the next delivery (`defaultDespatchQty`), with Next delivery / Everything outstanding /
  Clear. The printed sheet lists only lines with a quantity, their due dates, which call-off(s) and
  their POs. Screen-only (S.sheet); the order is never changed, and the editor doesn't print.

## Home (15 Oct)
First tab; the office opens on it (the floor tablet still opens on Shop floor but can see it).
`src/home.js` draws `dashboard(jobs, today)` (src/core/jobs.js, tested): tiles for Running late
(next delivery before today; with £ still to send for the office), Due in the next 7 days, Ready to
dispatch, Out for delivery, and office-only Waiting for Xero (£), Won quotes waiting, Order book (£ still
to send on open orders) and Dispatched this week (£ since Monday). Panels: Running late (worst first,
days late, processes still to do), Due in the next 7 days, Waiting at each station (bars; tap opens the
shop floor at that station), On hold. Open = upcoming or current and not cancelled; held jobs count.
