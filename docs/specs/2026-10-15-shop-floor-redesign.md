# Shop floor redesign — design note (15 Oct 2026)

## Why
The Shop floor tab is what the factory sees on one shared, walk-up touchscreen (a TV or large
monitor; landscape). Today it is a wide table with nine small tick columns: correct, but hard to
read from a step away and fiddly to tap. Jack wants it obvious, clear and touch-first, like a
kiosk. Ticking a process is also the job's status: Laser done, Weld still to do; when every
process is done the job is ready to dispatch and goes back to the office. Agreed from the
`shop-floor-v2` mockup on 15 Oct (screen 1 station tiles, screens 2–4).

## Screen 1 — station tiles (what you see when you walk up)
- Big heading "Shop floor", sub "Tap your station". A large clock (time, then "Thursday
  15 October") at the top right, kept current.
- One tile per process (Levi's nine, in his order), 3 across on a landscape screen (2 on a tablet,
  1 on a phone). Each tile: the station name (display font, uppercase), the number of jobs
  waiting for it ("3 jobs waiting"), and either "N late" (red) or "On time" (green); a station with
  nothing waiting says "Nothing waiting" and is faded. A tile with late work has a red border.
  Tapping a tile opens that station (screen 2).
- Under the tiles: **All jobs (n)** (opens screen 3), **Full screen** (hidden where the browser
  cannot do it; reads "Exit full screen" while full screen), and the note "Updates by itself.
  Goes back to this screen after 2 minutes untouched."

"Waiting for a station" = an open job (not started or in progress, held included, not cancelled)
that needs that process and has not had it ticked. Late = its next due date is before today.

## Screen 2 — one station
- **← Stations** (large, top left), the station name as the heading, sub "N jobs waiting for
  Laser · do them in this order", the clock.
- The station's jobs in the office's running order, one card each, numbered 1, 2, 3.
- Empty: "Nothing waiting for Laser." (green).

## Screen 3 — All jobs
- **← Stations**, heading "All jobs", sub "Tap any step when it is finished · tap a green step to
  undo it", the clock. Every open job in the running order, same cards. Empty: "No open jobs."

## The job card (screens 2 and 3)
- Top row: position number; customer (large, bold) with the SO number in mono beside it; under
  it what to make: "**20** × Bracket", one entry per part with quantity still to make, and
  "(10 for the next delivery)" as today. Right side: chips (due: "N days late" red / "Due 23 Oct",
  amber within 7 days; "Delivery 2 of 3"; "Brought forward" when above a job due sooner, as today)
  and a **Job details** button (opens the order panel, as the SO link does today).
- **The route:** every process the job needs, in Levi's order, as large steps joined by arrows.
  A step is a button at least 76px tall: grey "To do", or green with a tick and "Done 15 Oct 11:41".
  On a station screen that station's step is outlined ("Tap when done"). Tapping a step ticks it;
  tapping a green step undoes it (as today, with the Undo message).
- Status line under the route: "2 of 3 done · next: Weld"; when all done the card turns green:
  "✓ Ready to dispatch — All processes done, back to the office".
- Late jobs have a red card border. **On hold** jobs are faded, their steps cannot be tapped, and
  the status line reads "On hold — don't start · The office has paused this job".
- On a station screen a job leaves the list once that station's step is ticked.

## Behaviour
- After a tap, the existing message shows for 5 seconds with a large **Undo**: "Laser done on
  SO-9784 · next: Fold" (or "… · ready to dispatch").
- The station picked is no longer remembered between visits (`clj.station` goes): the shared
  screen always starts at the tiles. Home's station snapshot still opens a station directly.
- **2-minute reset:** on the Shop floor tab, two minutes without a touch, click or key returns to
  the tiles, closes the job panel and scrolls to the top.
- Live updates as today (jobs refresh by themselves).
- Every touch target on this tab is at least 56px tall (tiles, steps, Back, buttons).

## Code
- `src/core/jobs.js`: `nextStep(job)`, `floorQueue(jobs, station)` (`'all'` or a process),
  `floorStations(jobs, today)` → `[{ p, waiting, late }]`. Pure, tested.
- New `src/floor.js` `renderShopFloor({ jobs, today, station, office, now }, h)` draws all three
  screens; listed in `MODULES`.
- `src/app.js`: `renderFloor()` calls it; `S.station` is `null` for the tiles; `data-station`
  opens a station or `all`, `data-stations` goes back; the idle reset, the clock tick and the
  full-screen button; the toast wording; drop `floorTick`, `floorParts` moves into floor.js;
  `procButtons` (order panel) stays.
- `index.html`: kiosk styles under `#v-floor`; remove floor table / station-button styles that no
  longer have users (check Help first).
- `src/help.js`: Shop floor text and picture match the new screens.

## Testing
`tests/jobs.mjs`: `nextStep`, `floorQueue` (running order, held in, finished/cancelled out,
per station), `floorStations` (waiting and late). Browser: `dev/smoke.html?role=floor#floor` at
1280×800, 768 and 375; light and dark; tiles → station → tick → undo → back; All jobs; held job
cannot be ticked; idle reset (shortened by hand in the console); full screen.
