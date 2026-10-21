# Search everything, and Customers at a glance (21 Oct)

Philip: "a global search box on every key page, they should be able to search on anything key".

## Search (top bar, every screen; `/` jumps to it)
- `src/core/search.js` `searchAll(q, src, { office })` (tests `tests/search.mjs`) searches what the board already has loaded, so results come as you type: orders (SO, customer, customer PO, quote number, contact, line text and line POs), delivery notes, and for the office also customers, contact book people (name, email, phone), quotes from the quote calculator, Xero invoices (number, reference), Parts, enquiries and open tasks.
- Every word must appear; spaces, dashes, dots and slashes inside codes are ignored ("so 9781" = "SO-9781"). Two characters at least. Up to 6 a group, best group first.
- Opening: an order or delivery note opens the order; a quote opens its order if it became one, else the customer's Quotes tab; a customer, person, invoice or task opens the customer page at Overview, Contacts, Orders and invoices or Tasks; a part opens it in Parts; an enquiry opens it under Enquiries.
- The shop floor login: orders and delivery notes only. No prices are in what is searched or shown.
- SharePoint files are not searched yet (each search would have to ask SharePoint); the customer Files tab covers them.

## Customers at a glance
CRM › Customers with nobody picked shows: **Worth a call** (quotes to chase, repeat items due, customers gone quiet), **Your tasks** (overdue, today, next 7 days), **Lately** (the last customers with an order, quote or email to info@), and **Open orders with no contact saved**. No money.
