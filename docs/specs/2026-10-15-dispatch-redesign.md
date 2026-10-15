# Dispatch redesign — design note (15 Oct 2026)

## Why
Dispatch is the last main tab still in the older style: four stacked panels (Ready to dispatch,
Dispatch goods with a dropdown, Out for delivery, Waiting for Xero) and a folded "All dispatch
notes" with sortable headings. Home, Won quotes, Sales orders, Jobs and the Shop floor now share
one pattern: four summary cards, one table with a switch, plain wording, one next step per row.
Agreed from the `dispatch` mockup on 15 Oct. Nothing that works today is taken away: the
dispatch note form, part-dispatching, email, mark delivered (with who signed) and its undo, view,
cancel a note, Xero contacts, draft invoices, invoiced by hand.

## Layout
1. **Header.** "Dispatch", sub "Send all of a job or part of it. Each dispatch gets its own note,
   and only what went out is invoiced." No header button.
2. **The dispatch note form** (when a job is picked, `S.desp`) is a panel between the cards and the table (as in the mockup), heading
   "Dispatch SO-… · Customer", under it "PO … · Delivery 2 of 3" (as known) and "The quantities
   start at everything due by {next due}. Anything not sent stays outstanding on the order."; the
   existing "Not ticked yet" warning, call-off row (`deliveryRow`) and parts table (Part, Due,
   Ordered, Sent, Left, This dispatch; inputs `data-dq` as today); **Create dispatch note (delivery
   2 of 3)** (`#mkdn`, as today) and **Close** (`data-despclose`, sets `S.desp = null`). `#dn-msg`
   stays for the "Enter a quantity" message.
3. **Four cards** (Home's `card()`; tinted only when "on"):
   | Card | Tint | Number | Label | On when |
   |---|---|---|---|---|
   | Ready | ok | ready jobs | "Ready to dispatch" | n > 0 |
   | Not emailed | warn | out-for-delivery notes not emailed | "Not emailed to the customer" | n > 0 |
   | Out for delivery | info | notes not delivered and not in Xero | "Out for delivery" | n > 0 |
   | office: Waiting for Xero | warn | £ value of delivered notes not in Xero | "Waiting for Xero · N notes" | N > 0 |
   | floor: Sent this week | — | notes dated Monday this week to today | "Sent this week" | never |
4. **One table with a switch:** **Ready (n)** | **Out for delivery (n)** | **Waiting for Xero (n)**
   (office only) | **All notes (n)** (`data-dispview`). It opens on the first of Ready / Out for
   delivery / Waiting for Xero with something in it (else All notes) until a switch is pressed on
   this visit (`S.dispView`, `S.dispChosen`, like Jobs' stage). Not kept in `localStorage`.
   - **Ready** — heading "Ready to dispatch", note "every process ticked · running order".
     Columns: Customer (bold; mono `SO-… · PO` or `· no PO`), Due (due chip, plus
     "Delivery 2 of 3" note), To send (`dispatchParts`), Next step (**Dispatch**, `data-desp`).
     The job open in the form is left out of this list, as today. Under the table: "Sending part
     of a job that isn't finished?" and the job chooser (`#dsel`, every open job in the running
     order, as today), plus "On hold, so not listed: SO-…" when any are held.
     Empty: "Nothing ready yet. Jobs show here once every process is ticked." (the chooser stays).
   - **Out for delivery** — note "email the note, then mark it delivered when it arrives · only
     delivered notes go to Xero". Columns: Note (mono), Customer (bold; mono SO · PO), Dispatched,
     Emailed (green date chip, or amber "Not emailed"), Next step: **Email note…** (`data-dn`,
     primary) when not emailed; then the "Signed by (optional)" box and **Mark delivered**
     (`form.inv[data-deliver]`, primary once emailed, plain before); **View** (`data-dn`).
     Newest note first. Empty: "Nothing out for delivery." (green).
   - **Waiting for Xero** (office) — note "delivered, not invoiced yet"; the **Create N draft
     invoices in Xero** button sits in the heading row (connected and contacts read). Table as
     today (tick box, Note, Customer with the error under it, Xero contact, Reference, Delivered,
     Net, Invoiced by hand?); the "how" note under the table (not connected / error / reading /
     draft invoice wording, as today). Oldest first. Empty: "Nothing waiting. Every delivered
     note is in Xero." (green).
   - **All notes** — note "newest first, latest 100"; search box `#dsearch` "Search note, order
     or customer" (looks through every note, cancelled included; heading "Search results", note
     "N found"). Columns: Note, Customer (bold; mono SO · PO), Dispatched, Progress (chips:
     "Not emailed" amber / "Emailed 14 Oct" green; "Out for delivery" or "Delivered 14 Oct ·
     J Smith" green with an **undo** link (`data-undeliver`) while not in Xero; office:
     "Waiting for Xero" amber or the invoice number green), and **View** plus, office and not in
     Xero, **Cancel** (`data-cancdn`) with the confirm row as today. Cancelled notes are faded and
     struck through with "Cancelled 14 Oct by Levi". Empty: "No dispatch notes yet." / search
     "No notes match that search."
5. The table uses Home's table style (`table.lines.home.dispatch`), no sortable headings.

## What goes
The four stacked panels, the "Dispatch goods" panel, the folded "All dispatch notes", and the
sortable-heading machinery (`SORT`, `sortTh`, `sortRows`, `setSort`, `data-sort`, `clj.sort`,
`.sorth` CSS) which only Dispatch still used. `table.dtable` styles go if nothing else uses them.

## Links in
Home's "Send to Xero" button opens Dispatch on Waiting for Xero (`data-dispview="xero"`); a
`data-dispview` click on another tab switches to Dispatch first. `data-desp` (Home, Jobs drawer)
opens the form as today.

## Code
- `src/core/jobs.js`: `dispatchLists(jobs, today)` → `{ ready, open, held, out, notEmailed,
  toXero, toXeroValue, notes, thisWeek }`. `ready`/`open`/`held` are jobs (stage not started or
  in progress; status open+all done / open / held; running order). `out`, `toXero`, `notes` are
  `{ job, d }`: out = not delivered and not in Xero, newest first; notEmailed = out without
  `emailedAt`; toXero = delivered, not in Xero, oldest first; notes = every note plus
  `cancelledDespatches`, newest first (by id); thisWeek = count of live notes dated Monday this
  week to today. `toXeroValue` = sum of `despatchValue` (null when prices are hidden). Pure, tested.
- New `src/dispatch.js` `renderDispatch({ lists, office, view, chosen, search, desp, form, cancelDn, xero }, h)`
  draws the tab; listed in `MODULES`. The form HTML and the Waiting for Xero rows still need
  app.js state (contacts), so app.js builds the form and passes the helpers it needs.
- `src/app.js`: `renderDespatch()` calls it; `data-dispview`, `data-despclose`, `#dsearch`
  wiring; remove `despatchTable`, `waitingForXero`'s panel shell, the sort machinery.
- `index.html`: dispatch table styles under the Home block; phone (≤560px) hides Dispatched and
  the Reference and Delivered columns (the Xero contact stays: it is picked there); remove unused `.sorth` / `dtable` / `.panel.ready` CSS
  (check Help first).
- `src/help.js`: the Dispatch and Xero pictures use the new switch and table.

## Testing
`tests/jobs.mjs`: `dispatchLists` (ready vs held vs open, out/notEmailed/toXero split and order,
cancelled notes in `notes`, thisWeek, toXeroValue null without prices). Browser check of
`dev/smoke.html#dispatch` (office and `?role=floor`), light and dark, 1280 / 768 / 375: every
switch view, dispatch a job (form, Close, create note), email view, mark delivered and undo,
cancel a note, search, Home's Send to Xero link.
