# Home redesign — design note (15 Oct 2026)

## Why
Home today is eight equal tiles plus late / due-soon tables and station bars. Problems and
background figures look the same, empty panels take full space, and zeros are as loud as real
issues. Levi (MD) opens Home first thing; Mandy and the shop floor use it too. He wants to see
**problems and risks first**, then what's going out and where work is queuing. Agreed with Jack
from mockup v3 (light, airy, modelled on a "Chrono desk" dashboard reference he supplied).

## Layout, top to bottom
1. **Header.** "Good morning, Levi" (large, body font, not condensed) and below it the long date
   and "N processes ticked off today". Right-hand buttons:
   office: **Dispatch** (`data-tab="dispatch"`) and **New order** (primary, `data-neworder`);
   shop floor: **Shop floor** (primary, `data-tab="floor"`) only.
2. **Four summary cards**, soft tinted background, white icon square, big number, one-line label.
   Not links (the table below holds the detail).
   | Card | Tint | Number | Label (office) | Label (floor) |
   |---|---|---|---|---|
   | Late | bad | `late.length` | "Running late · £x" | "Running late" |
   | Due soon | warn | `soon.length` | "Due in the next 7 days" | same |
   | Ready | ok | `ready.length` | "Ready to dispatch" | same |
   | Book | info | office `£orderBook`, floor `open.length` | "Order book · N open" | "Open jobs" |
   A card whose number is 0 drops its tint to the neutral surface so only real issues are coloured.
3. **Station snapshot.** Heading + "open jobs still needing each process" + link
   "Open shop floor →" (`data-tab="floor"`). One small card per station with work waiting,
   busiest first: name, "N jobs", a pill (**"N late"** in bad if any of its jobs are late, else
   **"On time"** in ok), and a thin bar (width = count / busiest count, bad or ok colour).
   Each card is a button with `data-gostation`. Stations with nothing waiting are left out; if
   none have work: one muted line "Nothing waiting at any station."
   Grid: `repeat(auto-fill, minmax(170px, 1fr))` so it wraps on the tablet.
4. **One table with a two-way switch:** **Needs attention (n)** | **Going out (n)**.
   Columns: Customer (name bold, SO / quote / DN number in mono below), Due, Still to do
   (process chips), Status (pill), Value (office only, remaining value), Action (one button).
   Clicking a job row opens it (`data-open`), as today. The chosen switch is remembered in
   `localStorage` key `clj.homeview` (try/catch, defaults to Needs attention).

### Needs attention rows, in this order
| Kind | Which | Status pill | Action |
|---|---|---|---|
| Late | `late`, most days late first | bad "N days late" | Open (`data-open`) |
| At risk | open, not ready, not held, due within the next 3 working days (not late) | warn "At risk" | Open |
| On hold | `held` | warn "On hold" | Open |
| Ready | `ready` | ok "Ready" | **Dispatch** (primary, `data-desp`) |
| Won quotes (office) | one summary row when `wonQuotes > 0`: "N won quotes waiting" | grey "Won quote" | Make order (`data-tab="quotes"`) |
| To invoice (office) | one row per `toXero` despatch: DN number, "Delivered d Mon" | grey "To invoice" | Send to Xero (`data-tab="dispatch"`) |

A job appears once, in its first matching kind. Empty list: a single green line
"All clear — nothing late, at risk or waiting." in place of the table body.

### Going out rows
Open, not cancelled jobs whose next due date falls from today to the Friday of next week
(`weekStart(today)` + 11 days; on a weekend that is the coming Friday),
soonest first (late jobs are left out: they are at the top of Needs attention). Status pill: ok
"Ready" or warn "Being made"; held jobs inside the window show warn "On hold". Action: Dispatch if
ready, else Open. Empty: muted line "Nothing due out before next Friday."

## What goes
The eight tiles, the separate late / due-soon / on-hold panels and the station bar chart.
"Dispatched this week" and "Waiting for Xero £" drop off Home (Dispatch tab still has them);
the to-invoice rows carry the same information.

## Code
- `src/core/jobs.js` `dashboard()` gains, all pure and tested:
  `atRisk` (jobs, rule above, using `addWorkingDays`), `stationLate` (`{process: lateCount}`),
  `goingOut` (jobs, window above).
- `src/core/jobs.js` new `attention(d, { office, wonQuotes })` builds the ordered Needs-attention
  rows (`{ kind, job?, despatch?, days?, count? }`) so ordering and de-duplication are tested
  without HTML.
- `src/home.js` only draws: header, cards, snapshot, table + switch. Same `h` helpers.
- `index.html`: replace the `#v-home .tile/.homegrid/.bars` rules with styles for `.hcards`,
  `.snap`, `.seg`, status pills. Add `--info` / `--info-soft` tokens to light and both dark
  blocks. Light and dark both follow the existing tokens; nothing hard-coded.
- `app.js`: one new click branch, `data-homeview` → set `S.homeView`, save to `clj.homeview`, render.
- Rebuild `dev/smoke.html` (`python3 dev/make-smoke.py`); add fake jobs to `dev/fake-data.js`
  if needed so the smoke view shows late, at risk, held, ready and going-out rows.

## Testing
- `tests/jobs.mjs`: extend the dashboard test for `atRisk`, `stationLate`, `goingOut`
  (edges: today Friday → window ends next Friday; at-risk on a Friday reaches Wednesday), and
  `attention()` order, de-duplication, office-only rows hidden for the floor.
- `tests/site.mjs` already checks the page loads; run all tests before commit.
- Look at `dev/smoke.html` and `?role=floor` in light and dark at desktop and 768px width.

## Not in this change
Left sidebar navigation like the reference (changes every page; separate step). Activity feed
and money trends (not wanted, 15 Oct).
