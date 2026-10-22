# Choosing the Xero contact more safely (22 Oct)

**Why.** A Haig delivery was sent to Xero as a draft invoice for Ice Cool Servicing. Two causes:
Clarke Lane's Xero contacts end in an account code, "Haig Engineering Ltd (HAI1)", so the board's
exact-name match failed for almost every customer; and Mandy then picked from one long alphabetical
dropdown of every Xero contact, where a neighbouring name is one slip away, and the pick was remembered
for good.

## What changed

1. **Matching ignores the account code.** A last bracket of 2–10 letters and digits containing a digit
   is dropped before comparing: "(HAI1)", "(WES4)", "(1111)". A place in brackets, "(Hampshire)", or
   "(UK)" stays. Two contacts that match the same way still mean Mandy chooses; nothing is guessed.
   (`withoutCode`, `matchContact` in `src/core/xero.js`; the Xero function keeps an identical copy.)
2. **A search box instead of the dropdown.** Under it, up to six likely contacts as buttons: the same
   name first, marked *best match*, then those sharing a telling word. Typing finds any contact.
   (`rankContacts`.)
3. **Asked before linking, and before sending.** If the customer and the contact share no telling word
   (ignoring Ltd, Engineering, Services, Group and the like), linking asks "These don't look like the
   same company. Link them anyway?", and **Create draft invoices** asks again for any such link.
   Waiting for Xero marks it **Check: a different name**. (`looksSame`.)
4. **The links on the Xero tab.** *Customers and their Xero contacts* lists every remembered link, the
   doubtful ones first, each with **Remove**. Removing one makes the board match that customer by name
   again, or ask, on their next delivery. No more SQL to fix a wrong pick.

No database change: the links stay in `public.customer_contacts`, which the office can already read,
write and delete.

## Check

Nothing to run in Supabase. On the board: Xero tab, *Customers and their Xero contacts*. Each line
should pair a customer with its own company; any marked *Check: a different name* deserves a look.
