# Delivery map and contact book (15 Oct 2026)

## Why
- Levi wants to see where deliveries are going, to fit a second drop into a run in the same area.
- Xero's contacts are usually the customer's accounts people; operations deal with buyers and goods-in.

## Map (tab "Map", everyone; no money shown)
- One pin per postcode, coloured by the most urgent job there (late > out for delivery > ready >
  due in 7 days > later). Popup: the jobs there (click opens the job) and the other pins within N miles
  (5/10/15/25, default 10), straight-line (`nearbyStops`, src/core/geo.js, tested).
- Postcode: order delivery address → customer's usual address (contact book) → Xero contact postcode
  (the `contacts` route now returns each contact's postcode; office only). Jobs with none are listed.
- Leaflet 1.9.4 (cdnjs) + OpenStreetMap tiles (attribution shown); postcodes.io places postcodes
  (free, no key; only postcodes are sent, never names). Lookups cached in localStorage per computer.
- Rejected for now: live van position. Philip: "No live van yet". Options when wanted: driver's phone
  sharing location from the board, or the van tracker's API.

## Contact book (tab "Customers", office only)
- `customer_people` (role orders / deliveries / accounts / other, name, email, phone, notes, main per
  role) and `customer_sites` (label, address, site contact, phone, main) keyed by normName(customer).
  RLS office only. Xero is never written.
- Order form: picking/typing a customer fills contact + email from the main Orders person and the address
  from the usual site, over Xero's (never over what was typed). Saved people in the Contact list, saved
  addresses in a picker; "Save contact and address to the contact book".
- Delivery note emails go to the main Goods in / deliveries person if set, else the order's contact.
