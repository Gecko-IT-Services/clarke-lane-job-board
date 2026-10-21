# Code review: Clarke Lane Job Board (21 Oct 2026)

Scope: the whole app at `main` (branch `feat/sharepoint-files` is identical to main). Six focused reviews
(database and RLS, edge functions, core logic, frontend in two halves, docs versus code), each finding
below re-checked by the lead against the code, and the two highest-stakes ones probed against the live
project with the public key only (no writes). All 17 test files pass.

## Verdict

The product mostly does what the tin says. Stage derivation, call-off quantities, "next due", cancelled
notes counting nothing, DN/SO numbering, despatch quantity checks, Xero draft-only, email draft-only, notes
on all four surfaces and the "shop floor never sees prices" promise all hold, and prices are enforced at
three layers (RLS, the client, the edge function).

One finding is critical and must be fixed before anything else: the office-only database functions can be
called by anyone holding the public key, without signing in.

## Critical

### C1. Office-only RPCs are open to anonymous callers (confirmed live)
`is_office()` is `staff_role() in ('md','office')` (migrations/20261016170000_md_role.sql:8). For a caller
not on the staff list, `staff_role()` is NULL, so `is_office()` is NULL, and plpgsql treats `if not NULL`
as false: the guard never raises. Every function guarded this way is affected: `create_job`, `amend_job`,
`set_running_order`, `set_station_order`, `set_job_due`, `cancel_despatch`, `create_proforma`,
`add_line_codes`.

Second half of the problem: those functions were only `revoke ... from public`. Supabase's default
privileges grant EXECUTE on public functions to `anon` explicitly, so the revoke leaves anon's grant in
place. Only `set_job_due` and `create_proforma` also revoke from `anon`.

Probed with only the publishable key (no session):

| call | result |
|---|---|
| `rpc/is_office` | 200, `null` |
| `rpc/amend_job` id 0 | 400 "No such order." (guard skipped, failed on the id) |
| `rpc/cancel_despatch` id 0 | 400 "No such dispatch note." (guard skipped) |
| `rpc/set_job_due` | 401 permission denied (anon was revoked here) |

Job and despatch ids are sequential. So anyone with the key (it is in the public site) can rewrite quantities
and prices on any order, create fake orders, cancel uninvoiced dispatch notes and reorder the shop floor.
The auth settings endpoint also shows the email/password provider enabled with signups open, so a signed-in
non-staff session is easy to obtain as well; that reaches `create_proforma` (returns unit prices).

RLS table policies are not affected: a NULL policy result denies. Workshop users are not affected: their
role is non-null, so the guard raises correctly.

**Fixed, pending merge:** `supabase/migrations/20261021160000_anon_rpc.sql` makes `is_staff`, `is_office`
and `is_md` coalesce to false, revokes execute from anon on every public function, and changes the
default privileges so new functions are not granted to anon. `tests/rpc-anon.mjs` calls every RPC against
the live project with the publishable key and expects 42501; it fails (naming 15 open functions) until the
migration is applied on merge to main. `tests/supabase-migration.mjs` now also checks the helpers and the
revoke statically. Still to do in the Supabase dashboard: disable the email/password provider or turn off
signups, since a signed-in non-staff session reaches `create_proforma` (unit prices) and anything else
guarded only by role.

## High

All four fixed in PR 98 (branch fix/review-high).

### H1. pdf.js 3.11.174 parses customer PDFs with eval on (app.js:1952-1961)
CVE-2024-4367: pdf.js before 4.2.67 runs JavaScript embedded in a crafted font. "Attach drawings" and
"Check processes" feed every customer PDF to `getDocument` with no `isEvalSupported: false`. A malicious
drawing emailed in by a "customer" runs in the board's origin, where MSAL keeps Graph tokens
(Mail.ReadWrite, Sites.ReadWrite.All) and the Supabase session in localStorage.
Fix: upgrade to a current 4.x and pass `isEvalSupported: false`.

### H2. loadJobs reads whole tables with no range (data.js:26-31)
`job_lines`, `job_processes`, `despatches`, `despatch_lines`, `job_files` are fetched with `select('*')`
and no `.range()`. Supabase caps a request at 1000 rows by default. `job_processes` is 3 to 9 rows per
job, so this starts silently dropping rows at roughly 110 to 330 orders. A job with its process rows
missing becomes "ready to dispatch"; one with lines missing becomes "completed" and vanishes from the
floor and TV. No error is shown. Fix: page the reads, or load only jobs that are not completed plus a
recent window, and raise `max_rows` as a stopgap.

### H3. Half of the frontend forms are wiped by background re-renders (app.js:2417-2431)
`snapshotInputs` keeps `#views input/select/textarea` and `#drawer input`, so the job-note textarea in the
drawer (`note-body`) is not kept, and nothing restores focus or caret. `render()` runs on realtime changes
(400 ms debounce, ~20 tables) and on the 60 s poll. On a busy floor, a note being typed is lost whenever
anyone ticks anything. Date pickers on the Jobs board are destroyed mid-pick the same way.

### H4. Contact book: editing one person copies the open form's values into the other (app.js:2525-2526)
`editperson`/`editsite` set `S.bookEdit` and `render()` without `keepInputs = false`, so the snapshot of
`bk-name`, `bk-email`, etc. from form A is restored into form B. Save then writes A's details over B.

## Medium

M1, M2, M3, M7 and the pro forma half of M10 fixed in PR 99 (branch fix/review-medium).
M4, M5, M6, the rest of M10, M11, M12, M13, M14, M17, M18, M19 and M21 fixed in PR 100 (branch fix/review-medium-2).
M8 and M9 fixed in PR 101 (branch fix/review-schema: a job with any paperwork cannot be deleted; column privileges on the
four tables the browser updates directly; a trigger keeps cancelled or undelivered notes from being invoiced).
Left open on purpose: M15 wants the amend made one RPC, M16 and M20 and M22 are product decisions (count cancelled orders' shipped goods;
who may connect Xero and read history; whether floor ticks ask for a name).

### M1. Enquiry sync permanently skips mail when more than 8 arrive between runs (app.js:1090-1093)
`since` is the newest stored `receivedAt` minus 1 h, and each run reads only the newest 8. Twelve emails
over a weekend: eight stored, four never fetched again. The first-ever run (14-day window) loses everything
beyond the newest 8. Fix: page until `since`, or walk oldest-first.

### M2. Monthly call-offs from the 29th to 31st skip a month (core/jobs.js:81-86)
`setUTCMonth` overflows: `calloffDates('2026-01-31', 4, 'm')` gives 31 Jan, 3 Mar, 31 Mar, 1 May (confirmed
by running it). Only 7 and 14 day call-offs are tested. Fix: clamp to the last day of the target month.

### M3. Xero: invoice created but "recorded" flag ignored (xero/index.ts:253-259, app.js:1670-1678)
`xero_mark_sent`'s error is discarded and the client never reads `recorded` for invoices (only for POs).
If the mark fails, Xero holds a draft the board does not know about and the despatch stays pending. The
idempotency key saves the ordinary retry, but not after Keith deletes the draft or the key expires.

### M4. Xero refresh-token rotation is unlocked and its write unchecked (xero/index.ts:109-113)
Xero refresh tokens are single-use. The DB write of the new pair is not error-checked, and the client fires
several routes in parallel at load, so two calls inside the 60 s window can both refresh. Any failure maps
to "connection lapsed, reconnect".

### M5. Purchase-order unit prices rounded to 2dp before sending (xero-core.js:99)
`UnitAmount: round2(unit)` while `net` uses the unrounded unit. £1.2345/kg × 800 kg: Xero gets £984.00,
the board stores £987.60, no mismatch warning (invoices handle this; POs do not).

### M6. Half-penny rounding differs between JS and Postgres
`round2 = Math.round(n*100)/100` is binary-float: `7 × 0.145` gives 1.01 where Postgres `round(..., 2)`
gives 1.02. The `mismatch` check compares Xero's subtotal to the JS net, so it can warn falsely or hide a
real 1p difference. One shared `round2` with a decimal-safe implementation would fix five copies.

### M7. Xero contact name goes into innerHTML unescaped (app.js:534, rendered at 495)
`customerNote` returns `✓ Xero contact: ${m.name}` and `'Could not read ...: ' + S.xcErr` without `esc`. A
contact named `<img src=x onerror=...>` in Xero runs script for the office user on the order form. Low
likelihood, trivial fix.

### M8. Deleting a job cascades to pro formas, purchase orders, notes, files (migrations: pro_forma.sql:12, purchase_orders.sql:6)
Only despatches block the delete. A job with a paid PF and a draft PO in Xero loses both records on the
board; the PF number is gone from the sequence. A `cancelled` status already exists; the hard delete should
be refused once anything has been issued.

### M9. Direct table updates bypass the RPC rules (data.js:80, 123, 171)
`markInvoiced`, `setJobStatus`, `updateJob` update `despatches`/`jobs` directly under policies that allow
every column. A cancelled or undelivered note can be marked invoiced; `cancelled_at` could be nulled via
REST, leaving a live note with no lines. Prefer column-limited policies or RPCs.

### M10. Pro forma has no double-submit guard (app.js:2166); `create_proforma` has no idempotency key
A double tap makes PF-0001 and PF-0002 for the same goods. `saveTask`, `sendEnquiryReply`, `chaseQuote`,
`saveBookForm`, `newsEmails` have the same gap (duplicate rows or Outlook drafts).

### M11. Opening a drawing: race shows the wrong drawing (app.js:2006-2025)
Header is written, then the blob is awaited, then the viewer. Tap A then B: if A finishes last the header
says B and the iframe shows A, on the shop floor. The earlier object URL also leaks.

### M12. graph()/graphRaw() redirect the whole page on any silent-token failure (auth.js:104-105, 123-126)
The catch is not limited to `interaction_required`; a network blip at boot redirects to Microsoft and the
returned promise never resolves. On a floor tablet, tapping "Drawing" with an expired token loses kiosk
state and any half-typed note. There is no redirect-loop guard.

### M13. Supabase `signOut()` uses global scope (auth.js:67, 95)
Signing out a stale session on a shared tablet signs that person out on every device.

### M14. Drag reorder during a reload drops the job to the bottom (app.js:255-285)
Captured rows are detached by the re-render, `getBoundingClientRect` returns zeros, drop index becomes the
end. Also, a stale client's prefix sent to `set_running_order` nulls priorities another user set.

### M15. Amend is three non-atomic calls (app.js:595-599)
`amendJob` → `setJobProcesses` → `updateJob`. If the second fails, the form stays open with its id-less
new lines, and Save again duplicates them.

### M16. Cancelled orders vanish from the month gauge (core/jobs.js:401-406)
Goods shipped and invoiced on a later-cancelled order count nowhere in `monthProgress`, but do count in
Home's `thisWeekValue`. The test at tests/jobs.mjs:367 locks the exclusion in. The spec says cancel keeps
what was despatched/invoiced.

### M17. Dismissed Ordered quotes count as booked this month (core/sales.js:99)
`!q.jobId` is the only exclusion; dismissals are not passed to `monthGap`. `wonDate` falls back to
`lastModifiedDateTime`, so an old quote edited this month counts too. Gap to target is understated.

### M18. CRM "never match by webmail domain" holds only for a short hard-coded list (core/crm.js:10-39)
btopenworld.com, blueyonder, talk21, gmx, outlook.co.uk and others are missing, and the firm's own domain
is not excluded from `customerIndex`, so a colleague's email can resolve to a customer.

### M19. Part-number match on any hyphen boundary (core/parts.js:19-24)
`namesPart('UL-PR-10448 bracket', '10448')` is true, so the wrong drawing can be linked to an order.

### M20. "Levi only" is looser than the comments say (sales-ai/index.ts:66, 76; xero/index.ts:410, 427)
`enquiry` and `reply` accept office; `connect`/`disconnect` Xero are open to any office user; per-customer
invoice history (`history`, `debts`) is served to office. Only `month` is md-only. Decide which is intended
and align config.toml's comment.

### M21. AI-supplied URLs not scheme-checked (ideas.js:29)
`href="${esc(n.url)}"` where the URL came from an LLM reading customer websites. Allow `^https?://` only.

### M22. Shop floor ticks record "Shop Floor", not who (app.js:298)
Spec: "each tick records who and when". The shared login makes `done_by` always "Shop Floor"; `done_at` is
the tablet's clock; undo loses the original time. Notes ask for a name; ticks could too.

## Low and documentation

- No CSP and no SRI on msal, supabase-js, pdf.js, html2canvas, jspdf, Leaflet (index.html:817, auth.js:11, app.js:1952, 2339).
- `tests/supabase-migration.mjs` only regex-scans SQL text; it checks a stale process list (first occurrence) and would not catch C1. No CI runs the tests at all.
- `clear_for_go_live` migration is unguarded; replaying it on a restored DB wipes every job.
- "Emailed" is marked when only an Outlook draft exists (app.js:2391); a discarded draft still shows "Emailed".
- `emailDoc` for a delivery note is reachable by the floor role via the drawer's View button.
- Floor can update any column of `job_processes` and `outwork` via REST (policies have no column limits).
- `toggleProc` has no in-flight guard; a fast double-tap can end in either state.
- `setDue` undo moves every unsent line now on `to` back to `from`, including ones that were already there.
- Several `.catch(() => {})` leave a wrong state looking saved: `saveContact`, `addChase`, `setRfq`, `seenNote`.
- Sign-out leaves `clj.invstatus`, `clj.xc*`, `clj.postcodes`, `clj.debts` behind (customer data in storage).
- Rounding: `byRunningOrder` tie-break is non-numeric (SO-10000 before SO-9784) and inconsistent on ties.
- UTC `slice(0,10)` vs local today in `ticksToday`, `markProforma 'paid'`, several display dates: wrong between midnight and 01:00 BST.
- `metalKey`: "3.0" ≠ "3", so price history splits; `billMatches` builds a RegExp from free text (throws on "3mm (approx)").
- `drawing.js`: "SHEET 1 OF 1" in a title block defeats bar-stock detection; `processesFromHistory` matches hyphenated words like "laser-cut" as part numbers.
- `reordersDue` ignores "steady gap"; `pct` p80 is the max for small samples.
- Docs: Help's "within a minute the quote appears" is wrong (SharePoint is read at sign-in and on Refresh only); Help sections for the shop floor describe tabs that login cannot open (and Help itself is unreachable for it); Help says values are only on Sales orders but Jobs shows an Outstanding £ column to office; "copied to Keith" depends on the accounts email setting; the 14 Oct and 20 Oct specs are overtaken on tabs, sort, AI cap (30 vs 120), and `is_md()` RLS. README says "schema only" but several migrations insert staff and clear data.
- The role is named `floor` in the database, `workshop` in docs.

## Checked and sound

- Every table has RLS; anon has no table policies; office/md-only tables (prices, proformas, POs, parts, metal, CRM, tasks, enquiries, sales, settings) are not readable by the floor. Xero tokens live in a revoked `private` schema, service-role only.
- Edge functions: every route except the OAuth callback verifies the caller via the user's own JWT and `me()`, with role checks; OAuth state is random, single-use, 15-minute; redirect target is fixed; org name is checked; CORS is an exact allowlist; no secrets in responses or logs.
- `create_despatch` locks the job, refuses held/cancelled, rejects over-quantity, zero and negative; DN/SO/PF numbers are atomic and race-free; `cancel_despatch` refuses invoiced notes; `amend_job` refuses dropping or shrinking shipped lines; `set_job_due` moves only unsent lines.
- Core: stage, sent/left, nextDue, call-off split, defaultDespatchQty, floorQueue, station order, at-risk/going-out windows, month-end maths, aged-debt rule, quote tones all match the specs; cancelled notes count nothing.
- XSS: with the one exception in M7 and the href scheme in M21, every interpolation in app.js and the view modules goes through `esc`, including attribute round-trips, email bodies and map popups. Documents show no prices on delivery notes or job sheets.
- Preview mode cannot write: `previewData` blocks every non-read function.
- Hash gating is real, not cosmetic: `render()` forces non-office roles to floor/tv before dispatching.
- Uploads: per-segment `encodeURIComponent(spSafe())`, 4 MB simple PUT then 5 MB chunked session, `job_files` row written after a successful upload.

## Suggested order

1. C1 (one migration plus dashboard settings), then a test that calls each RPC as anon.
2. H1 pdf.js upgrade with `isEvalSupported: false`.
3. H2 pagination of loadJobs before the order count grows.
4. H3/H4 snapshotInputs: include `#drawer textarea`, restore focus, and reset `keepInputs` on every form switch.
5. M1, M2, M3, M7, M10 are each a few lines.
6. The rest as time allows; the doc drift is a Help edit.
