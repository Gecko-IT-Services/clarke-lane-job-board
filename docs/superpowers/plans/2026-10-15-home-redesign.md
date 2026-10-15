# Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home's eight tiles and stacked panels with a problems-first page: header with actions, four summary cards, a station snapshot, and one table that switches between "Needs attention" and "Going out".

**Architecture:** All counting, filtering and row ordering lives in pure functions in `src/core/jobs.js` (`dashboard()` gains `atRisk`, `stationLate`, `goingOut`; new `attention()` builds the ordered rows), tested under Node in `tests/jobs.mjs`. `src/home.js` only turns those into HTML. Styles live in `index.html` under `/* home */`, using the existing colour tokens plus a new `--info` pair. `src/app.js` gets one click branch for the table switch.

**Tech Stack:** Static site, no build step, vanilla ES modules, Node's `node:assert` for tests, Python's `http.server` for the smoke page.

**Spec:** `docs/specs/2026-10-15-home-redesign.md`

## Global Constraints

- No build step, no new dependencies. Plain ES modules, as the rest of `src/`.
- Colours only through CSS tokens in `index.html` `:root` (light) and both dark blocks (`@media (prefers-color-scheme: dark){:root:not([data-theme="light"])…}` and `:root[data-theme="dark"]`). Nothing hard-coded in `home.js`.
- Do not use bare `.warn`, `.bad` or `.ok` classes on Home elements: `.warn` is already a global callout style in `index.html`. Use the existing `.chip.late` / `.chip.soon` / `.chip.ok` / `.chip` for status pills.
- The repo is public: made-up customer names only ("Example …") in fixtures and fake data.
- Run every test before each commit: `for t in tests/*.mjs; do node $t; done` — every line must end `ok`.
- After any change to `index.html`, rebuild the smoke page: `python3 dev/make-smoke.py`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only; do not push.

---

### Task 1: Home numbers and row order (pure logic)

**Files:**
- Modify: `src/core/jobs.js` (the `dayNo` helper at ~line 210 and `dashboard()` at ~lines 221-245; add `attention()` after `dashboard()`)
- Test: `tests/jobs.mjs` (the `// — Home screen numbers. —` block, ~lines 110-139)

**Interfaces:**
- Consumes: existing `PROCESSES`, `allDone(job)`, `nextDue(job)`, `addWorkingDays(isoDate, n)`, `weekStart(isoDate)` from `src/core/jobs.js`.
- Produces:
  - `dashboard(jobs, today)` return value gains
    - `atRisk: Job[]` — open jobs with `status === 'open'`, not `allDone`, next due from `today` to `addWorkingDays(today, 3)` inclusive, soonest first.
    - `stationLate: { [process: string]: number }` — for every name in `PROCESSES`, how many late jobs still need it.
    - `goingOut: Job[]` — open jobs (held included, cancelled/completed excluded) with next due from `today` to `weekStart(today) + 11 days` inclusive, soonest first.
  - `attention(d, { office = false, wonQuotes = 0 } = {})` → `Row[]` where `Row` is one of
    `{ kind: 'late', job, days }`, `{ kind: 'risk', job }`, `{ kind: 'held', job }`, `{ kind: 'ready', job }`,
    `{ kind: 'quotes', count }` (office only, only when `wonQuotes > 0`),
    `{ kind: 'invoice', job, despatch }` (office only, one per `d.toXero` entry).
    Order: late (as `d.late`), risk, held, ready, quotes, invoice. A job appears in at most one of late/risk/held/ready (its first match).

- [ ] **Step 1: Write the failing tests**

In `tests/jobs.mjs`, change the import line of the Home block from

```js
  const { dashboard, weekStart } = await import('../src/core/jobs.js');
```

to

```js
  const { dashboard, weekStart, attention } = await import('../src/core/jobs.js');
```

Then, in the same block, insert these lines directly before `console.log('jobs dashboard: ok');`:

```js
  // At risk: not ready, due within 3 working days. Going out: today to Friday of next week.
  const withSoon = [...jobs, mk(7, '2026-10-16'), mk(8, '2026-10-21')];
  const thu = dashboard(withSoon, '2026-10-15');
  assert.deepEqual(thu.atRisk.map(j => j.id), [7], 'Thu: due Fri at risk; Wed 21 is 4 working days away; ready job 3 is not at risk');
  assert.deepEqual(thu.goingOut.map(j => j.id), [7, 3, 8], 'Thu 15 → Fri 23, soonest first; late and later jobs left out');
  assert.equal(thu.stationLate.Laser, 2, 'jobs 1 and 2 are late and still need Laser');
  assert.equal(thu.stationLate.Weld, 0, 'every process has a count');
  const fri = dashboard(withSoon, '2026-10-16');
  assert.deepEqual(fri.atRisk.map(j => j.id), [7, 8], 'Fri: three working days reach Wed 21');
  assert.deepEqual(dashboard(withSoon, '2026-10-17').goingOut.map(j => j.id), [3, 8], 'Sat: window still ends Fri 23');

  // Needs attention: worst first, each job once, office-only rows hidden from the floor.
  const rows = attention(thu, { office: true, wonQuotes: 2 });
  const tag = r => r.kind + (r.job ? ':' + r.job.id : '') + (r.count ? ':' + r.count : '');
  assert.deepEqual(rows.map(tag), ['late:1', 'late:2', 'risk:7', 'ready:3', 'quotes:2', 'invoice:5'],
    'held job 2 is late, so it is listed once, as late');
  assert.equal(rows[0].days, 5);
  assert.equal(rows.at(-1).despatch.id, 9);
  assert.deepEqual(attention(thu, { office: false, wonQuotes: 2 }).map(tag), ['late:1', 'late:2', 'risk:7', 'ready:3']);
  assert.ok(!attention(thu, { office: true, wonQuotes: 0 }).some(r => r.kind === 'quotes'), 'no quotes row when none are waiting');
  assert.deepEqual(attention(dashboard([mk(9, '2026-10-30', { status: 'held' })], '2026-10-15')).map(tag), ['held:9']);
  assert.deepEqual(attention(dashboard([], '2026-10-15'), { office: true }), [], 'all clear');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/jobs.mjs`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'map')` (from `thu.atRisk`).

- [ ] **Step 3: Implement**

In `src/core/jobs.js`, directly below the existing line

```js
const dayNo = s => Math.round(new Date(s.slice(0, 10) + 'T12:00:00Z') / 864e5);
```

add

```js
const plusDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
```

Replace the doc comment and `dashboard()` (from `/**\n * The Home screen's numbers.` to the closing `}` of the function) with:

```js
/**
 * The Home screen's numbers. today: YYYY-MM-DD. Money is null when prices are hidden (shop floor).
 * Open = not completed or cancelled. Late = open with its next delivery before today.
 * At risk = open, not on hold, not every process ticked, due within the next 3 working days.
 * Going out = open (held included) and due from today to the Friday of next week.
 */
export function dashboard(jobs, today) {
  const open = jobs.filter(j => ['upcoming', 'current'].includes(stage(j)) && j.status !== 'cancelled');
  const lateBy = j => dayNo(today) - dayNo(nextDue(j));
  const bySoonest = (a, b) => (nextDue(a) < nextDue(b) ? -1 : nextDue(a) > nextDue(b) ? 1 : 0);
  const due = (from, to) => open.filter(j => nextDue(j) >= from && nextDue(j) <= to).sort(bySoonest);
  const late = open.filter(j => nextDue(j) && nextDue(j) < today).map(j => ({ job: j, days: lateBy(j) })).sort((a, b) => b.days - a.days);
  const soonEnd = dayNo(today) + 7;
  const soon = open.filter(j => nextDue(j) >= today && dayNo(nextDue(j)) <= soonEnd).sort(bySoonest);
  const atRisk = due(today, addWorkingDays(today, 3)).filter(j => j.status === 'open' && !allDone(j));
  const goingOut = due(today, plusDays(weekStart(today), 11));
  const ready = open.filter(j => j.status === 'open' && allDone(j));
  const held = open.filter(j => j.status === 'held');
  const waiting = (list, p) => list.filter(j => j.procs[p] && !j.procs[p].done).length;
  const stations = Object.fromEntries(PROCESSES.map(p => [p, waiting(open, p)]));
  const stationLate = Object.fromEntries(PROCESSES.map(p => [p, waiting(late.map(x => x.job), p)]));
  const dn = jobs.flatMap(j => j.despatches.map(d => ({ job: j, d })));
  const out = dn.filter(x => !x.d.deliveredOn && !x.d.xero);
  const toXero = dn.filter(x => x.d.deliveredOn && !x.d.xero);
  const wk = weekStart(today);
  const thisWeek = dn.filter(x => x.d.date >= wk && x.d.date <= today);
  const money = jobs.every(j => j.lines.every(l => l.price != null));
  const sum = (xs, f) => (money ? round2(xs.reduce((a, x) => a + (f(x) || 0), 0)) : null);
  const ticksToday = jobs.reduce((a, j) => a + Object.values(j.procs).filter(s => s.done && s.at && s.at.slice(0, 10) === today).length, 0);
  return {
    open, late, soon, atRisk, goingOut, ready, held, stations, stationLate, out, toXero, thisWeek, ticksToday,
    orderBook: sum(open, j => value(j, { remaining: true })),
    lateValue: sum(late, x => value(x.job, { remaining: true })),
    toXeroValue: sum(toXero, x => despatchValue(x.job, x.d)),
    thisWeekValue: sum(thisWeek, x => despatchValue(x.job, x.d)),
  };
}

/**
 * Home's "Needs attention" rows from dashboard()'s result, worst first: late, at risk, on hold,
 * ready to dispatch, then (office only) won quotes waiting and deliveries to invoice.
 * A job is listed once, under the first of late / at risk / on hold / ready it matches.
 */
export function attention(d, { office = false, wonQuotes = 0 } = {}) {
  const rows = [], seen = new Set();
  const add = (kind, job, more = {}) => { if (seen.has(job.id)) return; seen.add(job.id); rows.push({ kind, job, ...more }); };
  d.late.forEach(x => add('late', x.job, { days: x.days }));
  d.atRisk.forEach(j => add('risk', j));
  d.held.forEach(j => add('held', j));
  d.ready.forEach(j => add('ready', j));
  if (office && wonQuotes > 0) rows.push({ kind: 'quotes', count: wonQuotes });
  if (office) d.toXero.forEach(x => rows.push({ kind: 'invoice', job: x.job, despatch: x.d }));
  return rows;
}
```

Note: the old `soon` sort `(nextDue(a) < nextDue(b) ? -1 : 1)` becomes `bySoonest`; the existing `d.soon` assertion still holds.

- [ ] **Step 4: Run all tests to verify they pass**

Run: `for t in tests/*.mjs; do node $t; done`
Expected: every line ends `ok`, including `jobs dashboard: ok`.

- [ ] **Step 5: Commit**

```bash
git add src/core/jobs.js tests/jobs.mjs
git commit -m "Home: at-risk, going-out and per-station late counts; Needs attention rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Draw the new Home

**Files:**
- Modify (rewrite): `src/home.js`
- Modify: `index.html` — tokens at lines ~14-27 (add `--info`, `--info-soft`); replace the whole `/* home */` block (~lines 276-299, from `/* home */` to the `@media (max-width:560px){ #v-home .bar…}` line inclusive)
- Modify: `src/app.js` — renderHome call (~line 1272), click handler (~line 1296, before `if (d.tab)`), sign-in setup (~line 92)
- Modify: `src/help.js` line ~223 (Home help text)
- Modify: `dev/fake-data.js` (more made-up jobs so every row type shows)
- Regenerate: `dev/smoke.html` via `python3 dev/make-smoke.py`

**Interfaces:**
- Consumes: `dashboard(jobs, today)` with `atRisk`, `goingOut`, `stationLate` and `attention(d, { office, wonQuotes })` from Task 1; existing `PROCESSES`, `needed`, `allDone`, `nextDue`, `deliveryLabel`, `value`, `despatchValue`.
- Produces: `renderHome({ jobs, me, office, today, wonQuotes, view }, { esc, fmt, gbp, … })` → HTML string. `view` is `'out'` for Going out, anything else for Needs attention. Buttons use existing click data attributes: `data-open`, `data-desp`, `data-neworder`, `data-tab`, `data-gostation`; new `data-homeview="attention" | "out"`.

- [ ] **Step 1: Rewrite `src/home.js`**

Replace the whole file with:

```js
/**
 * Home: problems first. Four summary cards, the stations with work waiting, then one table that
 * switches between "Needs attention" and "Going out". The numbers and the row order come from
 * dashboard() and attention() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js.
 */
import { dashboard, attention, PROCESSES, needed, allDone, deliveryLabel, nextDue, value, despatchValue } from './core/jobs.js';

const ICON = {
  late: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  soon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ready: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  book: '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>',
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderHome({ jobs, me, office, today, wonQuotes, view }, h) {
  const { esc, fmt, gbp } = h;
  const d = dashboard(jobs, today);
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${me?.name ? ', ' + esc(me.name.split(' ')[0]) : ''}`;
  const longDate = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const btns = office
    ? '<button class="btn" type="button" data-tab="dispatch">Dispatch</button><button class="btn pri" type="button" data-neworder>New order</button>'
    : '<button class="btn pri" type="button" data-tab="floor">Shop floor</button>';

  // A card only takes its colour when there is something to see.
  const card = (tone, ic, shown, label, on) =>
    `<div class="hcard${on ? ' t-' + tone : ''}"><span class="ic">${icon(ic)}</span><div><b>${shown}</b><span>${label}</span></div></div>`;
  const cards = [
    card('bad', 'late', d.late.length, office && d.late.length ? `Running late · ${gbp(d.lateValue)}` : 'Running late', d.late.length > 0),
    card('warn', 'soon', d.soon.length, 'Due in the next 7 days', d.soon.length > 0),
    card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0),
    office ? card('info', 'book', gbp(d.orderBook), `Order book · ${d.open.length} open`, d.open.length > 0)
      : card('info', 'book', d.open.length, 'Open jobs', d.open.length > 0),
  ].join('');

  const busy = PROCESSES.filter(p => d.stations[p]).sort((a, b) => d.stations[b] - d.stations[a]);
  const most = Math.max(1, ...busy.map(p => d.stations[p]));
  const snap = busy.length
    ? `<div class="snap">${busy.map(p => {
      const n = d.stations[p], late = d.stationLate[p];
      return `<button type="button" class="st" data-gostation="${esc(p)}" title="Open the shop floor at ${esc(p)}">
        <span class="r1"><b>${esc(p)}</b><span>${n} <small>${n === 1 ? 'job' : 'jobs'}</small></span></span>
        ${late ? `<span class="chip late">${late} late</span>` : '<span class="chip ok">On time</span>'}
        <span class="sbar${late ? ' late' : ''}"><span style="width:${Math.round(100 * n / most)}%"></span></span></button>`;
    }).join('')}</div>`
    : '<p class="note">Nothing waiting at any station.</p>';

  const todo = j => { const l = needed(j).filter(p => !j.procs[p].done); return l.length ? l.map(p => `<span class="chip">${esc(p)}</span>`).join(' ') : 'Nothing left'; };
  const who = (name, ref) => `<b>${esc(name)}</b><span class="ref mono">${esc(ref)}</span>`;
  const money = v => (office ? `<td class="num">${gbp(v, 2)}</td>` : '');
  const ref = j => j.so + (deliveryLabel(j) ? ' · ' + deliveryLabel(j).toLowerCase() : '');
  const openBtn = j => `<button class="btn sm" type="button" data-open="${j.id}">Open</button>`;
  const dispatchBtn = j => `<button class="btn sm pri" type="button" data-desp="${j.id}">Dispatch</button>`;
  const jobRow = (j, status, action) => `<tr data-open="${j.id}"><td>${who(j.customer, ref(j))}</td><td>${fmt(nextDue(j))}</td>
    <td>${todo(j)}</td><td>${status}</td>${money(value(j, { remaining: true }))}<td class="act">${action}</td></tr>`;
  const heldChip = j => (j.status === 'held' ? ' <span class="chip soon">On hold</span>' : '');

  const ROW = {
    late: r => jobRow(r.job, `<span class="chip late">${plural(r.days, 'day')} late</span>${heldChip(r.job)}`, openBtn(r.job)),
    risk: r => jobRow(r.job, '<span class="chip soon">At risk</span>', openBtn(r.job)),
    held: r => jobRow(r.job, '<span class="chip soon">On hold</span>', openBtn(r.job)),
    ready: r => jobRow(r.job, '<span class="chip ok">Ready</span>', dispatchBtn(r.job)),
    quotes: r => `<tr><td>${who(`${plural(r.count, 'won quote')} waiting`, 'Won quotes tab')}</td><td></td>
      <td>Make ${r.count === 1 ? 'it a sales order' : 'them sales orders'}</td><td><span class="chip">Won quote</span></td>${money(null)}
      <td class="act"><button class="btn sm" type="button" data-tab="quotes">Make order</button></td></tr>`,
    invoice: r => `<tr data-open="${r.job.id}"><td>${who(r.job.customer, r.despatch.dn)}</td><td>Delivered ${fmt(r.despatch.deliveredOn)}</td>
      <td>Invoice it</td><td><span class="chip">To invoice</span></td>${money(despatchValue(r.job, r.despatch))}
      <td class="act"><button class="btn sm" type="button" data-tab="dispatch">Send to Xero</button></td></tr>`,
  };
  const outRow = j => {
    const ready = j.status === 'open' && allDone(j);
    const status = j.status === 'held' ? '<span class="chip soon">On hold</span>' : ready ? '<span class="chip ok">Ready</span>' : '<span class="chip soon">Being made</span>';
    return jobRow(j, status, ready ? dispatchBtn(j) : openBtn(j));
  };

  const rows = attention(d, { office, wonQuotes: wonQuotes || 0 });
  const isOut = view === 'out';
  const body = isOut ? d.goingOut.map(outRow) : rows.map(r => ROW[r.kind](r));
  const head = `<thead><tr><th>Customer</th><th>Due</th><th>Still to do</th><th>Status</th>${office ? '<th class="num">Value</th>' : ''}<th class="act"><span class="sr">Action</span></th></tr></thead>`;
  const table = body.length
    ? `<div class="tbl-wrap"><table class="lines home">${head}<tbody>${body.join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${isOut ? '' : ' ok'}">${isOut ? 'Nothing due out before next Friday.' : 'All clear — nothing late, at risk or waiting.'}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Show">
    <button type="button" data-homeview="attention" aria-pressed="${!isOut}">Needs attention <em>${rows.length}</em></button>
    <button type="button" data-homeview="out" aria-pressed="${isOut}">Going out <em>${d.goingOut.length}</em></button></div>`;

  return `<div class="home">
    <div class="hhead"><div><h2>${hello}</h2><p class="sub">${longDate} · ${d.ticksToday} process${d.ticksToday === 1 ? '' : 'es'} ticked off today</p></div><div class="hbtns">${btns}</div></div>
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>Station snapshot</h3><span class="note">open jobs still needing each process</span><a href="#floor" data-tab="floor">Open shop floor →</a></div>${snap}</section>
    <section><div class="hsec-h"><h3>${isOut ? 'Going out this week and next' : 'Needs attention'}</h3>${seg}</div>${table}</section>
  </div>`;
}
```

- [ ] **Step 2: Add the `--info` tokens to `index.html`**

In the light `:root{…}` block, change the line

```css
  --ok:#25744A; --ok-soft:#E0F1E7; --warn:#B45309; --warn-soft:#FDEED9; --bad:#B4321F; --bad-soft:#FBE4E0;
```

to

```css
  --ok:#25744A; --ok-soft:#E0F1E7; --warn:#B45309; --warn-soft:#FDEED9; --bad:#B4321F; --bad-soft:#FBE4E0; --info:#2B5BD7; --info-soft:#E6EEFF;
```

In **both** dark blocks, change

```css
  --ok:#5CC48A; --ok-soft:#173526; --warn:#F0A54B; --warn-soft:#3A2812; --bad:#F07B66; --bad-soft:#3D1C17; color-scheme:dark}
```

to

```css
  --ok:#5CC48A; --ok-soft:#173526; --warn:#F0A54B; --warn-soft:#3A2812; --bad:#F07B66; --bad-soft:#3D1C17; --info:#8FADFF; --info-soft:#1A2440; color-scheme:dark}
```

(The first dark block ends with `color-scheme:dark}}` — keep its second closing brace.)

- [ ] **Step 3: Replace the `/* home */` CSS block in `index.html`**

Delete everything from the line `/* home */` through the line `@media (max-width:560px){ #v-home .bar{grid-template-columns:100px minmax(0,1fr) 30px} }` and put in its place:

```css
/* home */
#v-home .home{display:flex;flex-direction:column;gap:26px}
#v-home .hhead{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap}
#v-home .hhead h2{font-family:var(--body);font-weight:500;font-size:32px;letter-spacing:-.01em}
#v-home .hhead .sub{margin:2px 0 0;color:var(--muted);font-size:14px}
#v-home .hbtns{margin-left:auto;display:flex;gap:8px}
#v-home .hcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px}
#v-home .hcard{display:flex;align-items:center;gap:14px;padding:18px;border-radius:14px;background:var(--surface);border:1px solid var(--line)}
#v-home .hcard .ic{width:44px;height:44px;border-radius:10px;background:var(--field);color:var(--muted);display:grid;place-items:center;flex:none}
#v-home .hcard svg{width:22px;height:22px}
#v-home .hcard b{display:block;font-size:26px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
#v-home .hcard div span{font-size:14px;color:var(--muted)}
#v-home .hcard.t-bad{background:var(--bad-soft);border-color:transparent} #v-home .hcard.t-bad .ic{color:var(--bad)}
#v-home .hcard.t-warn{background:var(--warn-soft);border-color:transparent} #v-home .hcard.t-warn .ic{color:var(--warn)}
#v-home .hcard.t-ok{background:var(--ok-soft);border-color:transparent} #v-home .hcard.t-ok .ic{color:var(--ok)}
#v-home .hcard.t-info{background:var(--info-soft);border-color:transparent} #v-home .hcard.t-info .ic{color:var(--info)}
#v-home .hcard[class*="t-"] .ic{background:var(--surface)}
#v-home .hsec-h{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;margin-bottom:12px}
#v-home .hsec-h h3{font-family:var(--body);font-weight:600;font-size:20px}
#v-home .hsec-h > a{margin-left:auto;font-weight:600;font-size:14px;color:var(--info);text-decoration:none}
#v-home .snap{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,170px),1fr));gap:10px}
#v-home .st{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:flex-start;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
#v-home .st:hover{border-color:var(--muted)}
#v-home .st:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
#v-home .st .r1{display:flex;justify-content:space-between;align-items:baseline;gap:8px;width:100%;font-size:14.5px}
#v-home .st .r1 small{color:var(--muted)}
#v-home .sbar{display:block;width:100%;height:6px;border-radius:3px;background:var(--field);overflow:hidden}
#v-home .sbar span{display:block;height:100%;border-radius:3px;min-width:4px;background:var(--ok)}
#v-home .sbar.late span{background:var(--bad)}
#v-home .seg{display:inline-flex;margin-left:auto;background:var(--field);border-radius:10px;padding:3px}
#v-home .seg button{border:0;background:none;border-radius:8px;padding:7px 14px;min-height:38px;font-weight:600;font-size:14px;color:var(--muted);cursor:pointer}
#v-home .seg button[aria-pressed="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
#v-home .seg em{font-style:normal;font-weight:500;margin-left:4px}
#v-home table.home th,#v-home table.home td{text-align:left;padding:12px 14px;vertical-align:middle}
#v-home table.home th{text-transform:none;letter-spacing:0;font-size:13px;background:var(--field)}
#v-home table.home .num,#v-home table.home .act{text-align:right;white-space:nowrap}
#v-home table.home .ref{display:block;font-size:12.5px;color:var(--muted)}
#v-home table.home tbody tr[data-open]{cursor:pointer}
#v-home table.home tbody tr[data-open]:hover td{background:var(--field)}
#v-home .allclear{margin:0;padding:18px;color:var(--muted)}
#v-home .allclear.ok{color:var(--ok);font-weight:600}
#v-home .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:560px){ #v-home .hbtns,#v-home .seg,#v-home .hsec-h > a{margin-left:0} #v-home table.home th:nth-child(3),#v-home table.home td:nth-child(3){display:none} }
```

- [ ] **Step 4: Wire the switch in `src/app.js`**

a) Restore the remembered view at sign-in. Directly after the existing line

```js
  try { const t = localStorage.getItem('clj.station'); if (t && (t === 'all' || PROCESSES.includes(t))) S.station = t; } catch { /* none kept */ }
```

add

```js
  try { if (localStorage.getItem('clj.homeview') === 'out') S.homeView = 'out'; } catch { /* none kept */ }
```

b) In the click handler, directly before the line `if (d.tab) { e.preventDefault(); …`, add

```js
  if (d.homeview) { S.homeView = d.homeview; try { localStorage.setItem('clj.homeview', d.homeview); } catch { /* not kept */ } return render(); }
```

c) In the render table, change

```js
  ({ home: () => { $('v-home').innerHTML = renderHome({ jobs: S.jobs, me: S.me, office: office(), today: todayIso(),
      wonQuotes: S.quotesRaw ? (quotes() || []).filter(q => q.state === 'waiting').length + xeroWaiting().length : null }, { esc, fmt, fmtLong, gbp, dueChip }); },
```

to

```js
  ({ home: () => { $('v-home').innerHTML = renderHome({ jobs: S.jobs, me: S.me, office: office(), today: todayIso(), view: S.homeView,
      wonQuotes: S.quotesRaw ? (quotes() || []).filter(q => q.state === 'waiting').length + xeroWaiting().length : null }, { esc, fmt, gbp }); },
```

- [ ] **Step 5: Update the Home help text in `src/help.js`**

Replace the line starting `    <p class="hkey">The <b>Home</b> tab is the place to start each day:` with

```js
    <p class="hkey">The <b>Home</b> tab is the place to start each day. The cards at the top count what is late, due in the next 7 days and ready to dispatch${office ? ', and the order book' : ''}. <b>Station snapshot</b> shows how many jobs are waiting at each station and how many of those are late; tap one to open the shop floor there. <b>Needs attention</b> lists what is late, at risk (due within 3 working days with processes still to do), on hold or ready to go${office ? ', plus won quotes waiting and deliveries to invoice' : ''}, worst first, each with one button for the next step. Switch to <b>Going out</b> to see everything due from today to the Friday of next week.</p>
```

- [ ] **Step 6: Give the smoke page every row type (`dev/fake-data.js`)**

a) On job 1's despatch, mark it delivered so a "To invoice" row shows. Change

```js
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null }] },
```

to

```js
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null, deliveredOn: '2026-10-14' }] },
```

b) In the `jobs.push(` call, after the `SO-9784` job object (before the closing `);`), add a held job and a ready job:

```js
  ,{ id: 5, so: 'SO-9785', quote: '', spQuoteId: null, customer: 'Sixth Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-12', due: '2026-10-22', notes: '', address: '', status: 'held',
    lines: [{ id: 51, lineNo: 1, part: 'Bracket', qty: 12, price: 9.5, due: '2026-10-22' }], procs: { 'Laser': { done: false } }, despatches: [] },
  { id: 6, so: 'SO-9786', quote: '', spQuoteId: null, customer: 'Seventh Example Ltd', contactName: '', contactEmail: '', po: 'PO-90', ordered: '2026-10-10', due: '2026-10-20', notes: '', address: '', status: 'open',
    lines: [{ id: 61, lineNo: 1, part: 'Cover', qty: 8, price: 22, due: '2026-10-20' }], procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T10:00:00Z' } }, despatches: [] }
```

(Put the comma directly after the `SO-9784` object's closing `}` as shown, so the array stays valid.)

- [ ] **Step 7: Rebuild the smoke page and run all tests**

Run:

```bash
python3 dev/make-smoke.py
for t in tests/*.mjs; do node $t; done
```

Expected: every test line ends `ok` (`site: ok` confirms no module was added or removed).

- [ ] **Step 8: Look at it**

Serve and open the smoke page:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/dev/smoke.html` and check, against the spec:
- Header: greeting, long date with weekday, "N processes ticked off today", Dispatch + New order buttons (New order opens the order form).
- Four cards; a card with 0 is plain (no tint). Late card shows "Running late · £280".
- Station snapshot: busiest first, Weld / P/Coat Paint show "1 late", others "On time"; clicking a card opens Shop floor at that station.
- Needs attention: SO-9784 late first, then any at-risk rows, SO-9785 on hold, SO-9786 ready (Dispatch button opens the dispatch form for it), a won-quotes row, a DN-0001 to-invoice row. Clicking a row opens the job.
- Switch to Going out: rows due up to next Friday; reload the page — Going out is still selected.
- `?role=floor`: only Shop floor button, "Open jobs" card, no Value column, no quotes/invoice rows.
- Dark mode (browser/OS dark) and a 768px-wide and 375px-wide window: nothing overlaps, no sideways scroll, the third column hides at phone width.

Stop the server when done.

- [ ] **Step 9: Commit**

```bash
git add src/home.js src/app.js src/help.js index.html dev/fake-data.js dev/smoke.html
git commit -m "Home: problems-first layout with summary cards, station snapshot and Needs attention / Going out table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
