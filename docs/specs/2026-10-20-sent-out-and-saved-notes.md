# Sent out (powder coat, plating) and saved delivery notes — 20 Oct 2026

## Why
- Powder coating (and plating) is done by another company. The workshop keeps a whiteboard of where each
  job's items are, the job, when it went and when it is due back. Philip asked for the board to manage it.
- The office saves delivery notes to use again later; the saved file should carry the customer's name.

## What
- Table `outwork`: one row per send (job, process, company, what went, colour/finish, went on, due back,
  back on, note, who). Anyone on the board sends and takes back (the shop floor does most of it); only Levi
  and Mandy remove a send. RLS on every operation; realtime so every screen updates.
- Shop floor: a **Sent out** tile (out, overdue back, ready to go) opens the whiteboard grouped by company,
  most overdue first, plus "Ready to go out" (next step is P/Coat or Plating, not out) and "Back in the last
  2 weeks". A job card at P/Coat or Plating has **Send out**, or shows where it is with **Back in** / **Change**.
- **Back in** closes the send and ticks the process done; Undo takes both back.
- Due back defaults to five working days after it went (weekends skipped); the date it went cannot be in the future.
- Office: a Sent out card on Home (opens the whiteboard) and the sends on the job's details.
- Delivery notes, order acknowledgements and pro formas: **Save PDF** downloads
  `Customer - Delivery note - DN-0012 - SO-9781.pdf`; Print sets the same name for "Save as PDF".
- Logic in `src/core/outwork.js`, tests `tests/outwork.mjs`.

## Not done (ask first)
- No purchase order is made from a send (the PO form already covers subcontract work).
- Saved notes go to the browser's Downloads, not SharePoint.
- No reminder emails to the coater.
