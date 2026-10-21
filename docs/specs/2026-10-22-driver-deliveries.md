# The driver's screen: mark delivered and get it signed on the phone (22 Oct)

Philip, for Clarke Lane: "On the delivery side, can there be a mobile app that the driver can open up, select the job and on his phone mark as delivered and grab a signature on the phone?"

## Who
- **Robbie** (owner) delivers with his own Microsoft login, `robert.clarke@clarke-lane.co.uk`. He is added to the staff list as `md` by the migration (he owns the business, so he sees what Levi sees).
- **Judy** sometimes delivers using Robbie's login. Nothing else to set up.
- **Levi** (`levi@`, already `md`) delivers too.
- The shop floor login (`workshop@`, `floor`) can open it as well, so a phone signed in as the workshop works. It never shows prices.

## Not an app-store app
It is a phone-sized **Deliveries** screen on the existing website (`#deliveries`). The driver adds the site to the phone's home screen, so it opens full screen with its own icon like an app. Sign-in is the usual Microsoft sign-in.
- `manifest.webmanifest`: name "Clarke Lane Jobs", short name "CL Jobs", standalone, black (#111), icons `icons/icon-192.png`, `icons/icon-512.png` (white "CL" on black) and `favicon.svg`.
- `index.html` head: the manifest link, the Apple touch icon, theme colour, `apple-mobile-web-app-capable` and the title "CL Jobs".
- **start_url is `./`**, not `./#deliveries`. The same icon is used by Levi and Mandy, who should land on Home as now; the shop floor login lands on the Shop floor tiles, which now have a **Deliveries** button. `./#deliveries` would save drivers one tap, but would open the office on the driver's screen. Also, Microsoft's sign-in comes back to the page without the `#`, so after a first sign-in everyone lands on their usual start screen anyway. If drivers would rather, a second manifest could be served for them later.
- On an iPhone the home-screen app keeps its own sign-in, separate from Safari: sign in once inside it.

## The screen (`src/deliveries.js`, logic in `src/core/deliveries.js`, tests in `tests/deliveries.mjs`)
- Header: **Deliveries** and today's date; **← Shop floor** for the shop floor login, **← Dispatch** for Levi, Mandy and Robbie.
- One big card per note out for delivery (not delivered, not cancelled, not invoiced), oldest dispatched first, then by customer: customer, first line of the address, DN and SO numbers, how many parts. Below: **Delivered today** (customer, time, who signed). "Nothing out for delivery" when empty.
- Tap a card: customer, full address, contact name, **Navigate** (Google Maps directions; opens the Maps app on a phone), **Call** when the contact book has a phone for that site or the customer's goods-in person (the contact book is read by Levi's, Mandy's and Robbie's logins only, so the shop floor login has no Call button), the parts (qty × part) and the customer's PO.
- **Delivered** form: "Who signed", the signature pad (finger, stylus or mouse; **Clear**), "Nobody to sign" (then "Where it was left" is asked for instead), **Save delivery**. A name needs a signature ("Ask them to sign in the box"); Nobody to sign needs where it was left, so the note always says something as proof. On success: "Delivered. Mandy will see it on Waiting for Xero." with Undo, and back to the list.
- Reached from the Shop floor tiles (**Deliveries**), the Dispatch tab (**Driver's screen**) or `#deliveries`. The tabs row and the global search are unchanged.
- Realtime keeps working: the screen redraws on every change, and the signature so far is kept (as a picture) and drawn back. A redraw that arrives mid-stroke waits for the finger to lift.

## Storage
Migration `20261022160000_delivery_signatures.sql` (re-runnable):
- `despatches.delivered_at timestamptz` (exact time), `signature text` (a PNG data URL, `''` when none), `delivery_note text` (where it was left).
- `mark_despatch(p_despatch_id, p_what, p_received_by, p_signature, p_note)` replaces the three-argument version (same rules: staff only, not on a cancelled note, undo refused once invoiced). On `delivered` it also stamps `delivered_at` and keeps the signature and note; on `undelivered` it clears them. It refuses a signature that is not `data:image/png;base64,…` or is over 80,000 characters ("Not a signature.").
- The pad is drawn at its on-screen size (at most 600 × 200), not the phone's pixel density, so a signature is typically 5 to 20 KB.
- The board does not load signatures with the jobs (they would be re-read every minute by every screen): a signature is read when its delivery note is opened, saved as PDF or emailed. RLS is unchanged: `despatches_read` lets staff read; changes only go through `mark_despatch`.
- The board only sends the new arguments when there is a signature or a note, so **Mark delivered** on the Dispatch tab keeps working if the site is published before the migration runs.

## Proof of delivery on the note
A delivered note with a name, a signature or a "where it was left" prints a filled **Received by** block instead of the blank lines: the name (or "Nobody to sign" and where it was left), the signature, the date and time, and "Delivered by" (the staff name, else the email). Notes not yet delivered, and older delivered notes with nothing recorded, keep the blank lines. Emailing a signed note says it was delivered and attaches "the signed delivery note". The Dispatch list's Delivered chip shows the time when it is known. Undoing a delivery marked on the phone asks first, because it removes the signature.

## Not done yet
- An offline queue: with no signal, Save delivery shows the error and the driver tries again when back in signal (the signature and name stay on screen).
- A photo of the goods where they were left.
- Emailing the signed note to the customer automatically: Mandy presses **Email to customer** as now.

## Check
After running the migration in the Supabase SQL editor:

```sql
select exists (select 1 from information_schema.columns where table_name = 'despatches' and column_name = 'signature') as delivery_signatures_ready;
```
