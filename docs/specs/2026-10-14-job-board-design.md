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

- **Xero read is automatic** (15 Oct): on opening the board (office) and every 10 minutes while it is
  visible; "Refresh now" on the Xero tab. Xero sales orders not on the board appear on the Quotes tab
  (titled "New orders") beside Levi's ordered quotes, each with Make job; the tab badge counts both.

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
