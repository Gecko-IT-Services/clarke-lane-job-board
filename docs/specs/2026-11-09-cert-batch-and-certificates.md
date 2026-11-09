# Cert / batch numbers on the line, and certificates filed on the order (9 Nov)

Mandy: can Keiron (laser) type the cert batch number on the front sheet / SO from his PC instead of writing it on the
sheet, which gets lost; customers ask for a cert weeks later. And the Aalco certificates arrive by email and sit in an
Outlook folder: can the board link them like drawings?

- `job_lines.cert_batch` (text, 80 chars). Set through `set_line_batch(line, batch)`, a security-definer function
  open to staff (the shop floor included) that touches only that column: job_lines has no update policy.
- Every line on an open order (the drawer, which is also the shop floor's Job details) has a Cert / batch no. box,
  saved on change. It prints on the front sheet's Certificate batch no. box, pre-fills the C of C (what the office
  types on the certificate still wins; core/coc.js cocRows), and Search finds the order by it (core/search.js).
- `job_files.kind`: 'drawing' (default, everything before today) or 'cert'. Certificates go to SharePoint under
  Factory Jobs › Documents › Certificates › SO (uploadDrawing with kind 'cert'), load into `job.certs`, show in a
  Certificates panel on the order (drop zone and Attach certificates for the office; open in SharePoint for all;
  Remove for the office) and are named on the C of C.
- The Company Data › Mat Certs grade folders stay as they were.
