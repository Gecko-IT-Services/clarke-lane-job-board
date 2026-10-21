# A part number box on sales order lines (22 Oct)

Mandy asked: "On the sales orders, is it possible to have a 'part number' box and a separate 'description' box, like Xero and Sage?" Until now each line had one **Part** box holding everything ("Bracket BRK-1001 — 3mm S275"), and the board guessed the part number out of that text for Parts and the drawings.

## 1. Storage
- Migration `20261022090000_line_part_no.sql`: `job_lines.part_no text not null default ''` (added only if missing). `part` stays the description and stays required (`check (part <> '')` as before).
- `create_job` and `amend_job` are replaced with the same code plus `part_no` per line in the jsonb (trimmed; empty allowed). On amend, a line sent without `part_no` keeps the one it has (as `customer_po` does), so an older tab never wipes one. Every other check, the price table and RLS are unchanged; `job_lines` still carries no price.
- Lines already on the board keep their whole text in `part` with `part_no` empty, so they read exactly as before. Nothing is split or guessed.
- The app's line: `{ id, lineNo, partNo, part, qty, price, due, po }` (`src/data.js` `loadJobs`).

## 2. How a line reads
- `lineLabel(l)` in `src/core/jobs.js`: "BRK-1001 · Mounting bracket" when both are there, just the one that is there otherwise (a description that only repeats the number is not said twice). `lineHtml(l, esc)` for screens: the part number in `<span class="mono">`, then the description.
- Used on the job drawer's lines, the dispatch form and lists, the order acknowledgement, delivery note (and its "still to come"), job sheet, pro forma (a saved pro forma keeps only the description, so its order line's part number is looked up by `job_line_id`), the shop floor cards and station lists, won quotes' lines, search results and the purchase order "copy this order's parts" lines. Home and the TV do not quote parts.

## 3. The order form
- Each line: **Part no.** (narrow, mono, optional) then **Description** (required). Both boxes use the same suggestions list; picking from either fills both: the suggestion's part number into Part no. and its description into Description, plus the price as before.
- Suggestions (`partSuggestions`): an earlier order's line gives its own part number and description; a Parts part gives `partNo` and `description`; a Xero product gives its `Code` and `Description` (`xeroLineFields`: the code taken off the front of the description if it is repeated there; a code with no description gives the code as the description).
- Repeat order, Amend, an order from a won quote and an order from a Xero sales order carry `part_no` through. The quote calculator's QuoteLines list has no part number column, so quote lines leave Part no. empty. A Xero line with no item code leaves it empty too: never guessed.

## 4. Matching uses the part number first
- `lineNamesPart(l, partNo)` and `lineNumbers(l)` in `src/core/parts.js`: when a line has `part_no`, that is its part number (`normPartNo`, so spacing and case do not matter) and its description is not searched; only when it is empty does the board fall back to `namesPart` / `partNumbersIn` on the text, as before.
- Used by `partsOnJob`, `drawingsToLink`, `ordersForPart`, `openOrdersNeeding`, `suggestedParts` (a line's box gives the number and its Description as the description) and `foundDrawings` (SharePoint drawings). "Keep for this part" on a drawing prefers the line with that number in its box. `searchAll` and the board's search look in `part_no` too. Same-part history (`processesFromHistory`), reorder wins and back-to-back PO costing compare `lineLabel`.
- `missingLineCodes` (Xero item codes to add to imported orders) skips a line whose Part no. already holds the code. The existing `add_line_codes` function is unchanged: it still puts the code in front of the description for those older lines.

## 5. Xero
- Draft invoices (`supabase/functions/xero/index.ts`, `send`): an invoice line's description is `part_no + ' ' + part` when `part_no` is set (one space, as Xero shows code and description), otherwise `part` as before. `ItemCode` is not set: the send path does not read Xero's items, so it cannot know the code exists in Xero, and an unknown ItemCode would be refused. Nothing else in the invoice changes.

## 6. Practice page and help
- `dev/fake-data.js`: some made-up lines have part numbers (BRK-1001, CAB-2040, GP-4410), others are plain, and one older-style line has the number in its text, so every look shows. Fake `createJob`/`amendJob` keep `part_no` as the database does.
- Help: the order form's numbered pointers explain the two boxes; the Parts and SharePoint drawings wording says the part number box is used first.

Tests: `tests/jobs.mjs` (`lineLabel`, `lineHtml`, `xeroLineFields`, suggestions filling both boxes, repeat), `tests/parts.mjs` (the box first), `tests/spfiles.mjs`, `tests/search.mjs`.
