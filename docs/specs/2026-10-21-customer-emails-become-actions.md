# Enquiries sorted better, and customers' emails become actions — 21 Oct 2026

## Why
Philip wants the AI to help win noticeably more work each month. On the live board, "Customers writing about their orders"
held a purchase order sent in reply to a quote, a request for a breakdown of a price increase, a complaint that
plates arrived at half the quoted size and needed an urgent re-cut, a "can the 6–8 week lead time be shortened" and
a "does the quoted price include folding". The only button was **Mark all seen**. Each one is money won or kept,
if someone acts on it the same day. Before that, some of them were not even in that list: a known customer's
"quantity change, amended PO to follow" was filed as a new enquiry from a new customer.

## What
### 1. Enquiries sorted better (the first commit)
- `sortEmail(kind, { known, text })` in `src/core/crm.js`: the AI's sort is kept, unless the sender is a known
  customer AND the email refers to an order or quote that already exists (`refersToExisting`: SO, DN, PF, PO and
  quote numbers, QCLE files, words like "amended", "quoted price", "our order", "re-cut", "arrived"). Then it is a
  customer's email, not a new enquiry. Nothing a stranger sends is moved.
- `emailCustomer(index, email, company, names)`: who it is from, by the address, then the company's email domain,
  then the company name the AI read.
- `syncEnquiries`: new mail is sorted this way; emails filed before are re-sorted on the next check.

### 2. The AI names the topic (sales-ai, kind `enquiry`)
- Two more required fields in the schema: `topic` (enum `po`, `quote_question`, `order_change`, `delivery`,
  `complaint`, `lead_time`, `invoice`, `other`) and `refs` (`{ so, po, quote }`, strings exactly as written, empty
  when not mentioned). The system prompt says what each topic means, decides it for customer emails (and enquiries
  from existing customers about something they already have), and extracts the numbers. Everything else unchanged.
- The `reply` kind gains one paragraph: when `topic` is given, reply to the order or quote (a change or a question:
  it will be checked and we come back with any effect on price or date; a complaint: apologise once, looked at
  today, ask for photos or the delivery note number if not given; lead time: checked with the workshop; a PO:
  booked in). Never a date or a price.

### 3. Stored
`supabase/migrations/20261021230000_email_topics.sql`: `enquiries.topic` (text, default ''), `refs` (jsonb,
default {}), `quote_sp_id` (bigint), `job_id` (bigint). Idempotent; the existing office-only policy covers them.
`src/data.js` maps them as `topic`, `refs`, `quoteSpId`, `jobId`.

### 4. Linked and turned into buttons (`src/core/inbox.js`, tested in `tests/inbox.mjs`)
- `linkEmail(e, { jobs, quotes })` → `{ jobId, quoteSpId }`: `refs.so` to a job's SO (digits; "SO-" optional; "S0"
  typo tolerated), `refs.quote` to a quote's number (Q-0312, Q0312, 0312; old QCLE file numbers ignored),
  `refs.po` to a job's PO or one of its lines' (3+ characters). A matched order brings its quote. Preview orders
  are ignored. Emails read before the quotes were loaded are linked on screen at once and saved on the next check.
- `emailActions(e)` → the buttons, in order:
  | Topic | Buttons |
  |---|---|
  | PO received | **Won quotes** (when it names one of our quotes: "mark Q-xxxx as Ordered in the calculator") or **Make the order**; **Add a task** |
  | Question on a quote | **Put on the chase list** (when the quote is known, else **Add a task**); **Draft a reply with AI** |
  | Order change, Delivery, Lead time | **Open the order** (when linked); **Draft a reply with AI**; **Add a task** |
  | Complaint | **Make a task** ("Sort out SO-…: what they said", due today, customer filled in); **Open the order** (when linked); **Draft a reply with AI** |
  | Invoice | **Customer page** (Orders and invoices tab); **Add a task** |
  | Other | **Add a task** |
  Every row also has **Open** (the email in Outlook) and **Done** (status `ignored`, which the list already treats
  as dealt with; Undo on the toast). **Mark all seen** is now **All done**.
- `topicChip`/`topicTone`: "PO received" (green, `ok`), "Question on a quote", "Order change", "Delivery",
  "Complaint" (red, `late`), "Lead time", "Invoice". `sortEmails`: complaints first, then POs.
- `emailTaskTitle(e, so)`, `needTopic(rows)`, `cleanTopic(x)` for the task form and the backfill.

### 5. Chase list
**Put on the chase list** records a sales action (`kind: 'note'`, the quote's `spId`, "Customer asked: <summary>"),
sets the quote's follow-up to today (so it is in **Chase these today**), and marks the email done.
`customerQuestion(actions, spId, today)` finds the newest such note in the last 14 days; the chase card and the
open-quotes list show a **Customer asked** chip with the question, so Levi has it in front of him when he rings.

### 6. Screen
`renderEnquiries` (`src/customer.js`): each customer email shows its chip, who, the linked order's SO as a small
link that opens it, what they said and when, then its buttons, Open and Done. A reply draft opens under the row.
Up to 12 rows. Styles in the `.enquiries .ecust` rules (black, silver and white; a complaint has a black left edge).

### 7. Home
`digestPicks` (`src/core/digest.js`): a pick of kind `'email'` for a new customer email whose topic is a
complaint (outranks everything), a PO (everything but a complaint) or a question on a quote (just below an
enquiry waiting). `open.attrs` = `data-tab="customers" data-goenq data-goenqid="<id>"` (the existing handler needs
`data-goenq`; it now scrolls to the email's own row and highlights it). Facts: who, the topic in words, what they
said (for Mandy with any £ figure taken out by `noMoney`), the order and quote numbers, hours waiting. Fallback
lines for each. Today and Sales tiles: unchanged (customer emails were never counted as enquiries waiting).

### 8. Backfill
In `syncEnquiries`, after new mail: up to 10 saved rows (`status = 'new'`, `topic = ''`, kind customer or enquiry)
are read again by the `enquiry` AI from the saved subject, wants and summary (the body is not stored), at low
effort, and saved with their topic, numbers and links. It stops at the first AI failure and tries again next
check. Skipped on the practice page (`data.practice`).

### 9. Practice page
`dev/fake-data.js`: `practice = true`; the fake `enquiry` AI returns topics and refs ("Delivery of our order" →
delivery, SO-9781); two more made-up inbox messages: a complaint ("the brackets on SO-9782 arrived bent, need 10
re-made urgently") and a PO against a quote ("please find our PO-4471 for Q-0320"); the fake reply answers a
customer's topic; Three things today has a line for an email.

### 10. Help
New FAQ "Customers' emails about orders and quotes?"; the enquiries and Three things today answers updated.

## Money
No prices are sent to the AI. Customer emails' buttons and chips carry no money. Mandy's Home picks have any £
figure the customer wrote taken out of what is sent to the AI. The shop floor never sees enquiries.

## Not verified here
The edge function deploys on merge and cannot be run in this environment: the new schema fields and prompt text
were checked by reading, not by a live call.

## Publishing note (21 Oct)
The site is published by GitHub Pages on every merge to `main` ("pages build and deployment" under Actions, usually about a minute). Once the `deploy` step sat in GitHub's queue for half an hour; cancelling it left the run marked as running, so it could not be re-run. Any new merge to `main` starts a fresh publish, which is the simplest fix. The Supabase migrations and the `sales-ai` function deploy separately and were not affected.
