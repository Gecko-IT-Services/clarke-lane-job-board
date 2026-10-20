# Metal prices — 20 Oct 2026

## Why
Clarke Lane buys aluminium and stainless from Aalco. Philip asked for a way to get prices from other suppliers
and find the best. Trade prices are account prices, quoted on request and not published, so an automatic
search of the web would only find retail prices and break when sites change. Agreed instead: ask several
suppliers at once, compare what they quote, order from the chosen one, and keep every price.

## What
- Sales orders › Metal prices (`#metal`, office only), and Ask for metal prices on an order.
- An enquiry (`metal_rfqs`, RFQ-0001…): lines of metal (material, grade, form, thickness, size, qty, unit),
  optional sales order, note. One `metal_quotes` row per supplier asked (Xero contact when known, email).
- Draft the emails: one Outlook draft per supplier from `rfqEmail` (never sent by the board), noted as asked.
- Enter prices per supplier: unit price per line, delivery, lead time, valid until, note. Side by side with the
  cheapest complete quote and the cheapest per line highlighted, the saving on the next, the change on the
  last price for the same metal (`priceHistory`/`vsLast`), and the last price paid on a Xero bill (`billMatches`).
- Order: the existing PO form, filled with that supplier, account 5000 and their prices (plus delivery), against
  the enquiry's order or one chosen; the enquiry is marked ordered with the PO number.
- Xero route `bills` (read only): approved and paid bills in the last 12 months, lines on account 5000.
- Price history search across quotes and bill lines (3.0mm = 3mm; 3mm is not 13mm).
- RLS: both tables office only. Logic `src/core/metal.js`, tests `tests/metal.mjs`, screen `src/metal.js`.

## Not done (ask first)
- Reading suppliers' reply emails automatically: prices are typed in.
- A PO for stock not tied to a sales order (purchase orders need an order today).
- Adding a supplier to an enquiry after it is sent.
