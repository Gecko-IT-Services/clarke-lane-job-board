# The quote pack and Three things today — 21 Oct 2026

## Why
Philip wants the AI to help win noticeably more work each month. Two places it helps most:
- The slowest step between an enquiry and an order is reading the drawings and working out what is being asked.
  The **quote pack** makes that a button.
- The extra work comes from doing the right few things every day. The board already knows them; **Three things
  today** puts three at the top of Home with one AI sentence each on why.

## What
### The quote pack (Levi and Mandy)
- In an opened enquiry (CRM › Customers, the enquiries list): **Prepare for quoting** (busy: "Reading the drawings…").
- `data.enquiryText(mailbox, graphId)` reads the email's text again (the enquiries table keeps only what the AI
  made of it). `data.enquiryAttachments(mailbox, graphId)` lists the attachments and fetches the PDFs and pictures
  (png, jpg, webp) chosen by `attachmentsToRead()`: real file attachments, 4 MB or less each, at most 4 and 12 MB in
  all, PDFs first. Each PDF's text is also read in the browser with pdf.js (`pdfText`, shared with drawing hints).
- `sales-ai` kind `quotepack` (medium effort, max 6000 tokens): the facts (`packFacts()`: who, subject, email text
  capped at 6,000 characters, what they want, each attachment's name and text; money amounts taken out) as text,
  then each file as a `document` (PDF) or `image` block. The documents go in the body as `documents`, beside the
  facts, so the 20,000-character check on facts does not count them; the function refuses more than 4 files or
  12 MB. Output: `{ summary, parts: [{ partNo, description, material, thickness, qty, finish, processes, notes }],
  questions, watchOut }`; processes only from Levi's nine (an enum in the schema). Never prices; never invented
  sizes, quantities or materials: anything unclear is a question.
- Kept on the enquiry: `enquiries.quote_pack` (jsonb, with the file names read) and `quote_pack_at`.
- Shown as: summary, parts table (processes as chips), **Questions to ask**, **Watch out**, "Read by AI on … from
  …", and **Copy for the quote calculator** (`quotePackText()`: one line per part, then the questions), **Ask these
  questions** (the AI reply, with `questions` in the `reply` facts, asks exactly those), **Read again**. A **quote
  pack** chip on the enquiry row. About 10p each. No attachments: it reads the email alone.

### Three things today (Levi and Mandy)
- `digestPicks()` (core/digest.js): up to 3, one of each kind unless there is nothing else, ranked: an enquiry
  waiting over 24 hours (oldest first), my overdue task, the first quote in `chaseList()` (follow-up due, then most
  likely), the job running latest, the due repeat part most worth asking about. Each has a title, facts and the
  attributes Home's tiles already use to open it (an enquiry opens itself on the enquiries list). Levi's facts may
  carry the quote's value and the late order's value still to send; Mandy's never carry money.
- `sales-ai` kind `digest` (low effort, max 1200 tokens): `{ name, role, picks: [{ kind, title, facts }] }` →
  `{ greeting, lines }`, one sentence per pick in the same order. Under 1p.
- Built when Home is first opened each day, once the enquiries, tasks, quotes and Xero are read (or after 8 seconds
  with whatever is there); never blocks Home. Kept per person per day in `daily_digests` (RLS: your own row, office
  only); a reload reuses it while the picks are the same things (`samePicks()`). AI unreachable: the picks show with
  plain lines (`fallbackLine()`), no toast, nothing saved. **Refresh** picks again; **Not today** hides it until
  tomorrow (localStorage `clj.digest.<day>`). The shop floor never sees it.
- `src/digest.js` draws it: first on both Homes, three numbered tiles, black, silver and white.

### Also
- `sales_emails` kind check now allows `quotepack` and `digest` (each call is logged with its cost, as before).
- Migration `20261021220000_quote_pack_and_digest.sql`, safe to run more than once.
- Tests: `tests/quotepack.mjs`, `tests/digest.mjs`; `tests/supabase-migration.mjs` now also checks tables made with
  `create table if not exists`.

## Not done (ask first)
- The digest cannot be built at 8.30 with nobody signed in: SharePoint's quotes need the person's own Microsoft
  token. It is built when Levi or Mandy first open the board.
- DXF, DWG and STEP files are not read (the AI reads PDFs and pictures only); the pack asks for a PDF if needed.
- The quote pack does not fill in the quote calculator itself; it is copied across by hand.
