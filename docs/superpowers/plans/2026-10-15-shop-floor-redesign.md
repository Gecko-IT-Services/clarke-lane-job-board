# Shop floor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Shop floor tab into a walk-up touchscreen kiosk: station tiles first, then one big card per job showing its whole route of processes as large steps to tap.

**Architecture:** Three pure, tested helpers in `src/core/jobs.js` (`nextStep`, `floorQueue`, `floorStations`) decide what waits where. A new view module `src/floor.js` only draws HTML strings (like `src/won.js`, `src/board.js`). `src/app.js` wires it in and adds the kiosk behaviour (back to tiles, clock, full screen, 2-minute reset).

**Tech Stack:** Static site, vanilla ES modules, no build step. Tests: `for t in tests/*.mjs; do node $t || exit 1; done`. Smoke page: `python3 dev/make-smoke.py` after any `index.html` change, then `http://localhost:8080/dev/smoke.html?role=floor#floor` (office: drop `role=floor`). A server is already running on 8080.

## Global Constraints

- Spec: `docs/specs/2026-10-15-shop-floor-redesign.md` — source of truth for wording, screens, card contents and behaviour.
- Mockup it came from: `.superpowers/brainstorm/23318-1792063699/content/shop-floor-v2.html` (screen 1 tiles; screens 2–4 cards, All jobs, message). Match its look.
- One shared walk-up touchscreen, landscape. Every touch target on this tab at least 56px tall; route steps at least 76px; no hover-only affordances; visible focus rings.
- The shop floor never sees prices. Nothing on this tab shows £.
- Ticking stays the existing `data-proc` + `data-job` → `toggleProc()` path (with its Undo message). Held jobs: steps disabled on this tab.
- Colours only from the existing tokens (`--ok`, `--ok-soft`, `--bad`, `--bad-soft`, `--warn`, `--warn-soft`, `--info`, `--ink`, `--muted`, `--line`, `--field`, `--surface`, `--bg`); works in light and dark.
- `var MODULES = [...]` in `index.html` must list every `src/*.js` file (`tests/site.mjs`).
- `procButtons()` in app.js (the order panel's process buttons) stays.
- Write code that reads like the surrounding code: terse, comment density as in `src/won.js`.

---

### Task 1: nextStep, floorQueue, floorStations (core, tested)

**Files:**
- Modify: `src/core/jobs.js` (after `boardLists`)
- Test: `tests/jobs.mjs` (append a block; add the three names to the import from `../src/core/jobs.js`)

**Interfaces:**
- Produces: `nextStep(job)` → process name or `null`; `floorQueue(jobs, station)` → jobs (`station` is `'all'` or a process name); `floorStations(jobs, today)` → `[{ p, waiting, late }]`, one per `PROCESSES` entry in order.

- [ ] **Step 1: Write the failing test** — append to `tests/jobs.mjs`:

```js
// — Shop floor: what waits at each station, in the running order. —
{
  const L = due => [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due }];
  const a = job({ id: 1, so: 'SO-1', lines: L('2026-10-10'), procs: { 'Laser': { done: true }, 'Fold': { done: false }, 'Weld': { done: false } } });
  const b = job({ id: 2, so: 'SO-2', status: 'held', lines: L('2026-10-20'), procs: { 'Laser': { done: false }, 'Weld': { done: false } } });
  const c = job({ id: 3, so: 'SO-3', lines: L('2026-10-18'), procs: { 'Laser': { done: true }, 'Fold': { done: true } } });
  const d = job({ id: 4, so: 'SO-4', lines: L('2026-10-01'), procs: { 'Laser': { done: false } }, despatches: [{ lines: { 10: 20 }, date: '2026-10-02' }] });
  const e = job({ id: 5, so: 'SO-5', status: 'cancelled', lines: L('2026-10-01'), procs: { 'Laser': { done: false } } });
  const all = [a, b, c, d, e], ids = xs => xs.map(x => x.id);
  assert.equal(nextStep(a), 'Fold', "the first not done, in Levi's order");
  assert.equal(nextStep(c), null);
  assert.deepEqual(ids(floorQueue(all, 'all')), [1, 3, 2], 'running order; held in; finished and cancelled out');
  assert.deepEqual(ids(floorQueue(all, 'Laser')), [2], 'only jobs still needing Laser');
  assert.deepEqual(ids(floorQueue(all, 'Weld')), [1, 2]);
  const st = floorStations(all, '2026-10-15'), t = Object.fromEntries(st.map(s => [s.p, s]));
  assert.equal(st.length, 9);
  assert.deepEqual(st.map(s => s.p), PROCESSES);
  assert.deepEqual([t['Laser'].waiting, t['Laser'].late, t['Weld'].waiting, t['Weld'].late, t['Fold'].waiting, t['Tap'].waiting], [1, 0, 2, 1, 1, 0]);
  console.log('jobs shop floor: ok');
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tests/jobs.mjs`
Expected: FAIL — `nextStep` is not exported.

- [ ] **Step 3: Implement** — add to `src/core/jobs.js` after `boardLists`:

```js
/** The next process a job needs, in Levi's order, or null when all are done. */
export const nextStep = job => needed(job).find(p => !job.procs[p].done) || null;

/** Shop floor: open jobs (not started or in progress, held included) in the running order; for a
 *  station, only those that still need it. */
export function floorQueue(jobs, station) {
  const open = jobs.filter(j => ['upcoming', 'current'].includes(stage(j))).sort(byRunningOrder);
  return station === 'all' ? open : open.filter(j => j.procs[station] && !j.procs[station].done);
}

/** Shop floor tiles: per station, how many jobs wait for it and how many of those are late. */
export function floorStations(jobs, today) {
  return PROCESSES.map(p => {
    const q = floorQueue(jobs, p);
    return { p, waiting: q.length, late: q.filter(j => nextDue(j) && nextDue(j) < today).length };
  });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass, including `jobs shop floor: ok`.

- [ ] **Step 5: Commit**

```bash
git add src/core/jobs.js tests/jobs.mjs
git commit -m "Core: nextStep, floorQueue and floorStations for the shop floor kiosk"
```

---

### Task 2: The kiosk screens (tiles, station, All jobs) and their wiring

**Files:**
- Create: `src/floor.js`
- Modify: `src/app.js`, `index.html` (kiosk CSS, `MODULES`), then `python3 dev/make-smoke.py`

**Interfaces:**
- Consumes: Task 1's `nextStep`, `floorQueue`, `floorStations`; core's `needed`, `allDone`, `nextDue`, `left`, `deliveryLabel`, `SHORT`; from app.js via `h`: `esc, fmt, fmtTime, TICK`.
- Produces: `renderShopFloor({ jobs, today, station, now, canFull, isFull }, h)` → HTML string (station `null` = tiles, `'all'`, or a process name) and `clockHtml(now)` → HTML. Markup is wrapped in `<div class="kiosk">`; Task 3's Help picture reuses the `.kiosk` classes.

- [ ] **Step 1: `src/floor.js`**

```js
/**
 * Shop floor: the shared walk-up touchscreen. Station tiles first; a station (or All jobs) shows one
 * card per job with its whole route of processes as big steps to tap. What waits where comes from
 * floorQueue() / floorStations() in core/jobs.js (tested); this file only draws it.
 * h: the formatting helpers from app.js. Never shows prices.
 */
import { floorQueue, floorStations, nextStep, needed, allDone, nextDue, left, deliveryLabel, SHORT } from './core/jobs.js';

const dayNo = s => Math.round(new Date(s.slice(0, 10) + 'T12:00:00Z') / 864e5);
const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const clockHtml = now => `<b>${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;

export function renderShopFloor({ jobs, today, station, now, canFull, isFull }, h) {
  const { esc, fmt, fmtTime, TICK } = h;
  const bar = inner => `<div class="kbar">${inner}<div class="clock" id="fclock">${clockHtml(now)}</div></div>`;

  if (!station) {
    const tiles = floorStations(jobs, today).map(s => `<button type="button" class="tile${s.late ? ' hot' : ''}${s.waiting ? '' : ' idle'}" data-station="${esc(s.p)}">
      <span class="nm">${esc(s.p)}</span><span><span class="ct"><b>${s.waiting}</b>${s.waiting === 1 ? 'job' : 'jobs'} waiting</span>
      ${s.late ? `<span class="tag late">${s.late} late</span>` : s.waiting ? '<span class="tag ok">On time</span>' : '<span class="tag">Nothing waiting</span>'}</span></button>`).join('');
    return `<div class="kiosk">${bar('<div><h2>Shop floor</h2><p class="sub">Tap your station</p></div>')}
      <div class="tiles">${tiles}</div>
      <div class="kfoot"><button type="button" class="btn" data-station="all">All jobs <em>${floorQueue(jobs, 'all').length}</em></button>
        ${canFull ? `<button type="button" class="btn" data-fullscreen="1">${isFull ? 'Exit full screen' : 'Full screen'}</button>` : ''}
        <span class="note">Updates by itself. Goes back to this screen after 2 minutes untouched.</span></div></div>`;
  }

  const isAll = station === 'all', list = floorQueue(jobs, station), open = isAll ? list : floorQueue(jobs, 'all');
  const parts = j => {
    const by = new Map();
    for (const l of j.lines) { const r = by.get(l.part) || { left: 0, next: 0 }; r.left += left(j, l); if (l.due <= nextDue(j)) r.next += left(j, l); by.set(l.part, r); }
    return [...by.entries()].filter(([, r]) => r.left > 0).map(([part, r]) =>
      `<span><b>${r.left}</b> × ${esc(part)}${r.next && r.next !== r.left ? ` (${r.next} for the next delivery)` : ''}</span>`).join('');
  };
  const card = (j, i) => {
    const held = j.status === 'held', ready = !held && allDone(j), due = nextDue(j);
    const late = due && due < today, days = late ? dayNo(today) - dayNo(due) : 0, soon = !late && due && dayNo(due) - dayNo(today) <= 7;
    const ahead = j.priority != null && open.slice(open.indexOf(j) + 1).some(o => nextDue(o) < due);   // above a job due sooner
    const chips = [late ? `<span class="tag late">${count(days, 'day')} late</span>` : due ? `<span class="tag${soon ? ' soon' : ''}">Due ${fmt(due)}</span>` : '',
      deliveryLabel(j) ? `<span class="tag">${deliveryLabel(j)}</span>` : '', ahead ? '<span class="tag late">Brought forward</span>' : ''].join('');
    const steps = needed(j).map(p => {
      const s = j.procs[p], label = s.done ? `${p} done ${fmtTime(s.at)}. Tap to undo.` : `Tap when ${p} is done`;
      return `<button type="button" class="step${s.done ? ' done' : ''}${p === station ? ' here' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" aria-label="${esc(label)} on ${esc(j.so)}"${held ? ' disabled' : ''}>
        <span class="bx">${s.done ? TICK : ''}</span><span><b>${esc(SHORT[p])}</b><small>${s.done ? `Done ${esc(fmtTime(s.at))}` : p === station ? 'Tap when done' : 'To do'}</small></span></button>`;
    }).join('<span class="arrow" aria-hidden="true">→</span>');
    const n = needed(j), done = n.filter(p => j.procs[p].done).length;
    const status = held ? '<span class="tag late">On hold — don’t start</span> The office has paused this job'
      : ready ? '<span class="tag ok">✓ Ready to dispatch</span> All processes done, back to the office'
      : `${done} of ${n.length} done · next: <b>${esc(nextStep(j))}</b>`;
    return `<article class="fcard${late ? ' late' : ''}${held ? ' held' : ''}${ready ? ' ready' : ''}">
      <div class="ftop"><span class="pos">${i + 1}</span><div><div class="cu">${esc(j.customer)}<span class="so">${esc(j.so)}</span></div><div class="parts">${parts(j)}</div></div>
        <div class="side">${chips}<button type="button" class="btn" data-open="${j.id}">Job details</button></div></div>
      <div class="route">${steps}</div><p class="fstat">${status}</p></article>`;
  };
  const sub = isAll ? 'Tap any step when it is finished · tap a green step to undo it' : `${count(list.length, 'job')} waiting for ${esc(station)} · do them in this order`;
  const empty = isAll ? 'No open jobs.' : `Nothing waiting for ${esc(station)}.`;
  return `<div class="kiosk">${bar(`<button type="button" class="back" data-stations="1">← Stations</button><div><h2>${isAll ? 'All jobs' : esc(station)}</h2><p class="sub">${sub}</p></div>`)}
    <div class="fq">${list.length ? list.map(card).join('') : `<p class="allclear ok">${empty}</p>`}</div></div>`;
}
```

- [ ] **Step 2: Wire into `src/app.js`**
  - `import { renderShopFloor, clockHtml } from './floor.js';`
  - In `S`, `station: 'all'` becomes `station: null` (the tiles).
  - Delete the `clj.station` restore line in sign-in, and the `localStorage.setItem('clj.station', …)` calls in the `d.gostation` and `d.station` branches (the shared screen always starts at the tiles; Home's snapshot still opens a station).
  - `d.station` branch: `if (d.station) { S.station = d.station; render(); window.scrollTo(0, 0); return; }`. Add next to it: `if (d.stations) { S.station = null; render(); window.scrollTo(0, 0); return; }` and `if (d.fullscreen) { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); return; }`.
  - Replace `renderFloor()`'s body with:
    ```js
    $('v-floor').innerHTML = renderShopFloor({ jobs: S.jobs, today: todayIso(), station: S.station, now: new Date(),
      canFull: !!document.fullscreenEnabled, isFull: !!document.fullscreenElement }, { esc, fmt, fmtTime, TICK });
    ```
  - Near the other top-level listeners: `document.addEventListener('fullscreenchange', () => { if (S.tab === 'floor') renderFloor(); });` and the clock: `setInterval(() => { const c = $('fclock'); if (c) c.innerHTML = clockHtml(new Date()); }, 15000);`
  - Delete `floorParts()` and `floorTick()` (grep: nothing else may use them). Keep `procButtons()`.
  - `grep -n "clj.station\|floorTick\|floorParts" src/*.js` returns nothing.

- [ ] **Step 3: Kiosk CSS in `index.html`** — add a `/* shop floor kiosk */` block after the existing `/* shop floor */` rules (leave those for Task 3 to clean up):

```css
/* shop floor kiosk: one shared touchscreen; everything big, nothing hover-only */
.kiosk{display:flex;flex-direction:column;gap:22px}
.kiosk .kbar{display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap}
.kiosk .kbar h2{font-family:var(--display);font-size:40px;letter-spacing:.04em;text-transform:uppercase;line-height:1.05}
.kiosk .kbar .sub{margin:2px 0 0;color:var(--muted);font-size:17px}
.kiosk .clock{margin-left:auto;text-align:right;color:var(--muted);font-size:15px}
.kiosk .clock b{display:block;color:var(--ink);font-size:30px;font-weight:600;line-height:1.1;font-variant-numeric:tabular-nums}
.kiosk .back{display:inline-flex;align-items:center;border:2px solid var(--line);background:var(--surface);color:var(--ink);border-radius:14px;padding:0 22px;min-height:64px;font:700 20px var(--body);cursor:pointer}
.kiosk .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.kiosk .tile{all:unset;box-sizing:border-box;cursor:pointer;border:2px solid var(--line);background:var(--surface);color:var(--ink);border-radius:18px;padding:22px 24px;min-height:150px;display:flex;flex-direction:column;justify-content:space-between;gap:12px}
.kiosk .tile .nm{font-family:var(--display);font-size:34px;letter-spacing:.04em;text-transform:uppercase;font-weight:700;line-height:1.05}
.kiosk .tile .ct{display:block;color:var(--muted);font-size:18px}
.kiosk .tile .ct b{font-size:52px;font-weight:600;line-height:1;color:var(--ink);margin-right:8px;font-variant-numeric:tabular-nums}
.kiosk .tile.idle{opacity:.5}
.kiosk .tile.hot{border-color:var(--bad)}
.kiosk :is(.tile,.step,.back,.btn):focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.kiosk .tag{display:inline-block;border-radius:8px;padding:4px 12px;font-weight:700;font-size:16px;background:var(--field);color:var(--muted);margin:4px 8px 0 0}
.kiosk .tag.late{background:var(--bad-soft);color:var(--bad)}
.kiosk .tag.soon{background:var(--warn-soft);color:var(--warn)}
.kiosk .tag.ok{background:var(--ok-soft);color:var(--ok)}
.kiosk .kfoot{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.kiosk :is(.kfoot,.side) .btn{min-height:56px;font-size:17px;padding:0 20px;border-radius:12px}
.kiosk .kfoot em{font-style:normal;font-weight:500;margin-left:6px}
.kiosk .fq{display:flex;flex-direction:column;gap:14px}
.kiosk .fcard{background:var(--surface);border:2px solid var(--line);border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.kiosk .fcard.late{border-color:var(--bad)}
.kiosk .fcard.held{opacity:.6}
.kiosk .fcard.ready{border-color:var(--ok);background:var(--ok-soft)}
.kiosk .ftop{display:flex;align-items:flex-start;gap:16px}
.kiosk .pos{width:52px;height:52px;border-radius:14px;background:var(--field);display:grid;place-items:center;font-size:24px;font-weight:700;flex:none}
.kiosk .cu{font-size:25px;font-weight:700;line-height:1.2}
.kiosk .cu .so{font-family:var(--mono);color:var(--muted);font-size:16px;margin-left:10px;font-weight:500}
.kiosk .parts{display:flex;flex-wrap:wrap;gap:2px 18px;font-size:18px;color:var(--muted);margin-top:4px}
.kiosk .parts b{color:var(--ink);font-size:20px}
.kiosk .side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:none}
.kiosk .route{display:flex;align-items:center;flex-wrap:wrap;row-gap:10px}
.kiosk .step{all:unset;box-sizing:border-box;cursor:pointer;min-width:170px;min-height:76px;border:2px solid var(--line);background:var(--field);color:var(--ink);border-radius:14px;padding:10px 16px;display:flex;align-items:center;gap:12px}
.kiosk .step .bx{width:34px;height:34px;border-radius:9px;border:3px solid var(--muted);display:grid;place-items:center;flex:none}
.kiosk .step .bx svg{width:22px;height:22px}
.kiosk .step b{display:block;font-family:var(--display);font-size:20px;letter-spacing:.04em;text-transform:uppercase}
.kiosk .step small{display:block;font-size:14px;color:var(--muted)}
.kiosk .step.done{background:var(--ok-soft);border-color:transparent}
.kiosk .step.done .bx{background:var(--ok);border-color:var(--ok);color:var(--surface)}
.kiosk .step.done small{color:var(--ok)}
.kiosk .step.here{border:3px solid var(--ink);background:var(--surface)}
.kiosk .step.here .bx{border-color:var(--ink)}
.kiosk .step:disabled{cursor:not-allowed}
.kiosk .arrow{width:34px;text-align:center;color:var(--muted);font-size:22px}
.kiosk .fstat{margin:0;font-size:18px;color:var(--muted)}
.kiosk .fstat b{color:var(--ink)}
.kiosk .allclear{margin:0;padding:24px;font-size:20px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:14px}
.kiosk .allclear.ok{color:var(--ok);font-weight:600}
@media (max-width:1000px){ .kiosk .tiles{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:640px){ .kiosk .tiles{grid-template-columns:minmax(0,1fr)} .kiosk .tile{min-height:110px} .kiosk .kbar h2{font-size:32px}
  .kiosk .ftop{flex-wrap:wrap} .kiosk .side{margin-left:0;align-items:flex-start;flex-direction:row;flex-wrap:wrap;width:100%}
  .kiosk .arrow{display:none} .kiosk .route{gap:10px} .kiosk .step{flex:1 1 100%} }
```

  - Add `'src/floor.js'` to `var MODULES` (alphabetical, like the others). Run `python3 dev/make-smoke.py`.

- [ ] **Step 4: Run the tests**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass.

- [ ] **Step 5: Check in the browser** at `http://localhost:8080/dev/smoke.html?role=floor#floor` (load the Claude_Browser tools via ToolSearch if deferred), at desktop width and 375px, dark and light:
  - tiles show counts / late / faded empty stations; the clock shows;
  - tap a tile → that station's cards, its step outlined; tap the step → it ticks, the Undo message shows, the job leaves the list; Undo brings it back;
  - ← Stations returns; All jobs shows every open job, a fully ticked job's card is green;
  - a held job's steps cannot be tapped; Job details opens the order panel; no £ anywhere;
  - office (`#floor` without `role=floor`) works the same; Home's station snapshot opens a station;
  - no console errors, no sideways page scroll at 375px.

- [ ] **Step 6: Commit**

```bash
git add src/floor.js src/app.js index.html dev/smoke.html
git commit -m "Shop floor: station tiles, then big job cards with the whole route of processes to tap"
```

---

### Task 3: Kiosk behaviour, message, Help, dead CSS

**Files:**
- Modify: `src/app.js`, `index.html`, `src/help.js`, then `python3 dev/make-smoke.py`

**Interfaces:**
- Consumes: Task 2's `.kiosk` markup and classes; `nextStep` from core.

- [ ] **Step 1: Two-minute reset** — in `src/app.js` near the other top-level listeners:

```js
/* The shop floor screen is shared: two minutes untouched, it goes back to the station tiles. */
let idleT;
function nudge() {
  clearTimeout(idleT);
  idleT = setTimeout(() => { if (S.tab !== 'floor' || (S.station == null && S.open == null)) return; S.station = null; S.open = null; render(); window.scrollTo(0, 0); }, 120000);
}
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, nudge, { passive: true }));
nudge();
```

  Check that setting `S.open = null` and calling `render()` closes the order panel (see the `'close' in d` branch).

- [ ] **Step 2: The message after a tap** — in `toggleProc()` the done message becomes
  `` `${p} done on ${j.so}` + (allDone(j) ? ' · ready to dispatch' : ` · next: ${nextStep(j)}`) `` (import `nextStep`); the undo message stays. On the Shop floor tab make the message kiosk-sized: in `render()` add `document.body.classList.toggle('on-floor', S.tab === 'floor');` and in `index.html`:

```css
body.on-floor .toast{font-size:20px;padding:14px 16px 14px 24px;gap:20px}
body.on-floor .toast button{min-height:56px;padding:0 24px;border-radius:12px;background:var(--bg);color:var(--ink);text-decoration:none;font-size:19px}
```

- [ ] **Step 3: Help** — `src/help.js` `shopFloor(office)`: text and picture match the new screens. Text: the screen starts on the station tiles; tap your station; each job shows its route; tap your step when it's finished (tap a green step to undo, or press Undo on the message); when every step is green the job is ready to dispatch and goes back to the office; on hold jobs can't be ticked; it goes back to the tiles after 2 minutes untouched; All jobs shows everything; Full screen hides the browser bars. Picture: wrap in `<div class="kiosk">` and draw two or three tiles plus one card with a route (one step done, the station's step outlined), reusing the Task 2 classes; keep the numbered `n(…)` pointers pattern the other help sections use. Check it in the browser in `#help`.

- [ ] **Step 4: Dead CSS** — after the Help picture no longer uses them, delete the rules nothing uses any more: grep each selector from the old `/* shop floor */` block (`.stations`, `table.floor …`, `.tick.big …`, `#v-help .hframe .stations`), the `.pin` rules, and the `table.jobs` phone rules, across `src/*.js` and `index.html` markup. Keep anything still used (e.g. `table.jobs` base rules are used by Help's call-off picture; `.tick` may be used elsewhere — check).

- [ ] **Step 5: Run the tests**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass.

- [ ] **Step 6: Check in the browser**: tick on the floor → large message "Laser done on SO-… · next: Fold" with a big Undo; in the console set the timeout short (e.g. run `nudge` after temporarily editing, or wait) to confirm the reset returns to the tiles and closes an open order panel; Help › Shop floor picture looks right in light and dark; Jobs, Home and Dispatch tabs unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/app.js src/help.js index.html dev/smoke.html
git commit -m "Shop floor: back to the tiles after 2 minutes, kiosk-sized message with next step, Help redrawn, old floor CSS removed"
```
