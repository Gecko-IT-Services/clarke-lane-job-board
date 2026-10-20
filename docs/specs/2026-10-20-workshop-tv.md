# Workshop TV — 20 Oct 2026

## Why
A large TV is going in the workshop. Philip asked for something like the whiteboard by the machines (customer,
job no., a column per process, due date, notes; ticks when done, stars when still to do), shown to the workers.
Display only, in addition to the touch Shop floor screen.

## What
- `#tv` (Shop floor › TV board): full screen, no header, nothing to press. Works with the shop floor login.
- One row per open job in the running order (the same as the Shop floor); columns are the processes
  (Rolling only when a job needs it). Blue tick = done, orange star = still to do, filled star = the job's next
  step, OUT = at another company (red when overdue back). Due date red when late, orange within 3 days.
  Notes: on hold, ready to dispatch, at <company> and back date, delivery n of m.
- 14 rows a page; more jobs turn the page every 15 seconds. Updates by itself (realtime, plus the 60-second
  reload). Asks the browser to keep the screen awake. Always the whiteboard's colours, whatever the TV's theme.
- Never shows prices (the shop floor login has none). Esc goes back to the Shop floor.
- Logic `src/core/tv.js` (tests `tests/tv.mjs`), drawing `src/tv.js`.

## Not done
- Which TV or stick runs the browser is Philip's choice; it needs a browser that stays signed in (a mini PC or
  Chromecast/Fire TV browser).
