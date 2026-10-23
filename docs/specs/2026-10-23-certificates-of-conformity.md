# Certificates of conformity (23 Oct)

**Why.** A purchase order (Three things today) asked for "a Certificate of Conformity and Country of Origin" with
the goods. Clarke Lane is ISO 9001, so these will keep coming. The board already knows the customer, PO, order,
delivery note, parts and quantities, and reads material grades from the descriptions.

## What it is

One certificate per dispatch note, beside the delivery note (Levi and Mandy only):

- Customer and address; date; their PO (the note's call-off PO, else the order's); our order; the delivery note.
- Each part on the note: part no., description, quantity, **material** (read from the description, "S275", "304",
  until someone types one) and **certificate / batch no.** (typed in, from the front sheet or the mill certificate).
- The statement: the goods were manufactured, inspected and supplied to the purchase order, drawings and
  specifications, and conform in all respects.
- **Country of origin:** United Kingdom unless changed.
- ISO 9001:2015, certificate GB2005189.
- Signed for Clarke Lane: a line to sign by hand, the name and position typed (remembered per browser), the date.

## Where

- **Dispatch:** a **C of C** button on every note (**C of C ✓** once one is saved), and an orange **C of C needed**
  flag when the customer is marked for one with every delivery, or the order's notes mention a C of C.
- **The delivery note** has a **C of C** button too.
- The form above the certificate: material and batch per part, origin, signed by, position, and *wants one with
  every delivery*. **Save the certificate** keeps it; Save PDF, Print and Email save it first.
- **Email to customer:** an Outlook draft (never sent by the board) to the orders contact, else the order's
  contact, with the certificate and the delivery note attached.

## Storage

`public.despatch_cocs` (one row per dispatch note: the lines' material and batch as JSON, origin, signed by,
position, issued, emailed) and `public.customer_cocs` (customers who want one every time). Both office only (RLS).
Migration `20261023090000_certificates.sql`.

Not done: attaching the mill certificates from SharePoint's Mat Certs to the email (the board links the folders on
the order already), and a scanned signature.

## Check

```sql
select exists (select 1 from information_schema.tables where table_name = 'despatch_cocs') as certificates_ready;
```
