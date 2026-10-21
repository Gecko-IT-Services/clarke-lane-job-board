# SharePoint files from Company Data (21 Oct)

Clarke Lane's older files live in the **Company Data** SharePoint site (`/sites/CompanyData`, library Documents). The board now reads them, **read only**: it never writes, moves or copies a file there. The only thing stored in Supabase is which folder belongs to which customer, where it had to be linked by hand.

Folders used (set in `src/config.js`):
- `Company Data/01 Client Folder`: one folder per customer, with drawings, old quotes (`QCLE01234…`), delivery notes, pro formas and declarations of conformity, sometimes in subfolders. `MISCELLANEOUS` holds one-off customers' quotes, named `QCLE01234 - Customer.xlsx`.
- `Bystronic Drawings/Customers`: laser drawings per customer, e.g. `03-1111-0000 Issue 04.pdf`.
- `Company Data/Mat Certs`: material certificates in one folder per grade (`304`, `S355`, `6082 T6`…).

Graph, delegated, as the signed-in person: `Sites.ReadWrite.All` is already consented, so no new permission. Each person needs read access to the Company Data site in SharePoint.

## 1. Customer page › Files (office)
- The client folder and laser folder are matched by `normName` (Ltd = Limited), or the only folder whose name starts with the other's. Otherwise **Link a folder** (a type-to-find list) saves the link in `customer_folders` (migration `20261021160000_customer_folders.sql`, RLS: office only). **has none** saves a row with no folder so a near match is not offered again; **Find it by name again** removes the row.
- Files from both folders (subfolders up to 4 deep, up to 4000 files; read once per visit), newest first, searchable, grouped Drawings / Old quotes / Delivery notes / Certificates / Other. Each opens in SharePoint. Old quotes are never shown to the shop floor (customer pages are office only anyway).

## 2. Old quote history
- From the file names: different `QCLE` numbers, with the first and last year (the earlier of created and modified, as files moved into SharePoint carry the move date as created). One-off quotes in `MISCELLANEOUS` count when the name after the number is the customer's.
- Shown on the customer's Overview and Files tab, and sent to the Ideas AI as `quotesSentOverTheYears` for the top 30 customers (their folders are read when Levi presses **Think of ideas**, up to about 20 seconds).

## 3. Drawings found by part number (office)
- When an order's lines name a part number (`partNumbersIn`, or a Parts part of that customer), the customer's folders are searched for drawings whose names contain it as a whole token. Best first: highest issue / revision, a PDF before DXF, newest. **Attach** adds it to the order as a `job_files` row pointing at the same SharePoint item, like a Parts drawing.
- In **Parts › Found on your orders**, a suggestion with a drawing in the customer's folders shows **Use it**: the part is added with that file as its drawing and attached to the open orders naming it.
- For the shop floor to open these on the tablets, the workshop login needs read access to Company Data (or at least the client and Bystronic folders).

## 4. Material certificates (office)
- `gradesIn()` reads grades from the order's lines and notes: S235/S275/S355, 304/316 (only with stainless words, `L`, `SS` or 1.4301/1.4401), and 1050/5083/5251/6061/6063/6082 (only with aluminium words or a temper such as T6/H32). A quantity like "304 off" is not a grade.
- Each grade links to its folder in Mat Certs; a grade with no folder says so.

Logic: `src/core/spfiles.js` (tests `tests/spfiles.mjs`). Drawing: `src/spfiles.js`. Reading SharePoint: `src/data.js` (Company Data section).
