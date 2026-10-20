# Customers, enquiries and tasks — 21 Oct 2026

## Why
Clarke Lane has no sales department, no marketing and no CRM (Philip, 20 Oct). The board should make sure no
enquiry, quote or regular customer slips through, and tell Levi each day who is worth a call, without anyone
keeping a CRM up to date. Philip asked for all of it at once; he adds the Microsoft 365 permission and the AI key.

## What
- **Customer page** (Customers, office): Overview (orders on record, usual gap, last order, what they buy,
  open orders and quotes, unpaid invoices, Worth a call prompts, tasks, latest), Orders and invoices (board +
  Xero, paid/owed/overdue), Quotes (quote calculator), Emails (live Graph search by domain or webmail address
  across your mailbox, colleagues' and the enquiries mailbox; nothing stored), Tasks and notes (timeline of
  orders, invoices, quotes, calls, notes, tasks, enquiries), Contacts (the contact book). Money totals and the
  AI summary (`customer_insights`, kind `summary`) are Levi only.
- **Tasks** (`tasks`, office): title, customer, due, for whom; from Home, a customer, an enquiry or an email.
  Home › Today shows mine: overdue, today, next 7 days. Tick to finish (Undo).
- **Enquiries** (`enquiries`, office): the board reads the enquiries mailbox (office setting `enquiry_mailbox`,
  default info@clarke-lane.co.uk) while open, every 15 minutes, last 14 days, max 8 a run, skipping our own domain
  and automatic senders. AI (`sales-ai` kind `enquiry`, low effort) sorts each: enquiry / customer / other, with
  company, person, phone, what they want, drawings. One row per message id (`claimEnquiry`, ignore duplicates).
  List with time waiting; Draft a reply with AI (kind `reply`) → edited → Outlook draft; Add a task; Add as a
  customer (contact book); status Replied/Quoted/Won/Lost/Not an enquiry; 90-day funnel.
- **Smart prompts** (Levi): Due a reorder (`reordersDue`: an item ordered 3+ times, past 1.25× its usual gap and
  under 4×), Could give us more (`couldBuyMore`: 4+ orders, sheet metal work but never finishing/folding/welding
  from us, from ticked processes and invoice words), Email your customers (monthly news: Levi's words + each
  customer's facts → one AI draft each, sequential, confirmed first). Home › Today counts all of these.
- `sales_actions` now office (notes and calls on customer pages); Xero `history` route now office (per-invoice
  amounts, as Mandy sees on orders; totals drawn for Levi only).
- Graph: `graph(..., { quiet: true })` never redirects for consent (background reads); `Mail.Read.Shared`
  (`CONFIG.SHARED_MAIL_SCOPES`) is asked for only by enquiries and customer emails, never at sign-in.
- Logic `src/core/crm.js` (tests `tests/crm.mjs`), screens `src/customer.js`, `src/sales.js`.

## Setup (Philip)
1. Entra › App registrations › Clarke Lane Job Board › API permissions: add Microsoft Graph delegated
   **Mail.Read.Shared**, then Grant admin consent.
2. Exchange admin: give Levi and Mandy **Read and manage (Full Access)** on the info@ mailbox (and on each other's
   mailbox if each should see the other's customer emails).
3. Supabase › Edge Functions › Secrets: **ANTHROPIC_API_KEY** (also turns on Sales' AI emails).

## Not done (ask first)
- Replying from info@ itself (drafts go in the person's own mailbox), reading attachments' contents.
- Bulk sending, campaigns tracking, a website form straight to the board (the form already emails info@).
