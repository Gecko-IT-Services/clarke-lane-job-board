# Sales orders and Jobs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the Sales orders and Jobs tabs the Home way: four summary cards, then one table with a switch and a search box, keeping every existing action.

**Architecture:** Two pure, tested functions in `src/core/jobs.js` (`salesSummary`, `boardLists`) decide the lists, order and sums. Two new view modules (`src/orders.js`, `src/board.js`) only draw HTML strings with Home's `card()`, exactly like `src/won.js`. `src/app.js` wires them in and drops the old `salesOrders()` / `jobBoard()`.

**Tech Stack:** Static site, vanilla ES modules, no build step. Tests are `node:assert` scripts: `for t in tests/*.mjs; do node $t; done`. Smoke page: `python3 dev/make-smoke.py` after any change to `index.html`, then `http://localhost:8080/dev/smoke.html#orders` / `#jobs` (`?role=floor` for the shop floor; a server is already running on 8080).

## Global Constraints

- Spec: `docs/specs/2026-10-15-sales-orders-jobs-redesign.md` (read it; it is the source of truth for wording, cards, views, columns and empty states).
- Same component and colour rule as Home: a card is tinted only when "on" (`card(tone, ic, shown, label, on)` from `src/home.js`). No new colours; use the existing tokens.
- Sales orders is office only. On Jobs the shop floor (`office` false) sees no £ anywhere.
- Nothing that works today is taken away: New order / Amend form, row click opens the order (`tr[data-open]`), process ticks (`data-proc` + `data-job`, click must not open the row), running order arrows (`data-move` top/up/down, and `data-move="reset"` "Put everything back in date order"), search with focus kept while typing (`#search`, `#osearch`).
- `table.jobs` CSS stays: the Shop floor (`table.jobs.floor`) and Help pictures use it.
- The sort machinery (`sortTh`, `sortRows`, `setSort`, `SORT_DEFAULT`) stays for Dispatch's `dn` table; only the `board`, `boardDone` and `orders` keys go.
- `var MODULES = [...]` in `index.html` must list every `src/*.js` file (`tests/site.mjs` checks it).
- View switches are remembered in `localStorage` inside try/catch, like `clj.wonview`.
- Write code that reads like the surrounding code: terse, comment density as in `src/won.js`.

---

### Task 1: salesSummary and boardLists (core, tested)

**Files:**
- Modify: `src/core/jobs.js` (add after `byRunningOrder` / `compareValues`)
- Test: `tests/jobs.mjs` (add a block at the end, import the two new names)

**Interfaces:**
- Produces: `salesSummary(jobs, today)` → `{ outstanding, dispatched, held, cancelled, late, lateValue, heldValue, outstandingValue, uninvoiced, uninvoicedValue }` (arrays of jobs; values are numbers, 0 when none). `boardLists(jobs)` → `{ upcoming, current, completed }` (arrays of jobs).

- [ ] **Step 1: Write the failing test** — append to `tests/jobs.mjs` (add `salesSummary, boardLists` to the import from `../src/core/jobs.js`):

```js
// — Sales orders tab: lists, order and sums. —
{
  const L = due => [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due }, { id: 11, lineNo: 2, part: 'Plate', qty: 5, price: 2, due }];
  const all = { lines: { 10: 20, 11: 5 } };
  const a = job({ id: 1, so: 'SO-1', lines: L('2026-10-10') });
  const b = job({ id: 2, so: 'SO-2', status: 'held', lines: L('2026-10-20') });
  const c = job({ id: 3, so: 'SO-3', lines: L('2026-10-17') });
  const d = job({ id: 4, so: 'SO-4', lines: L('2026-10-01'), despatches: [{ ...all, date: '2026-10-12', xero: null }] });
  const e = job({ id: 5, so: 'SO-5', lines: L('2026-10-01'), despatches: [{ ...all, date: '2026-10-14', xero: { no: 'INV-1' } }] });
  const f = job({ id: 6, so: 'SO-6', status: 'cancelled', ordered: '2026-10-01', lines: L('2026-10-01'), despatches: [{ lines: { 10: 1 }, date: '2026-10-02', xero: null }] });
  const g = job({ id: 7, so: 'SO-7', status: 'cancelled', ordered: '2026-10-05', lines: L('2026-10-01') });
  const h = job({ id: 8, so: 'SO-8', lines: L('2026-10-16'), despatches: [{ lines: { 10: 10 }, date: '2026-10-13', xero: null }] });
  const ids = xs => xs.map(x => x.id);
  const s = salesSummary([a, b, c, d, e, f, g, h], '2026-10-15');
  assert.deepEqual(ids(s.outstanding), [1, 8, 3, 2], 'soonest due first, held included');
  assert.deepEqual(ids(s.late), [1]);
  assert.deepEqual(ids(s.held), [2]);
  assert.deepEqual(ids(s.dispatched), [5, 4], 'newest dispatch first');
  assert.deepEqual(ids(s.cancelled), [7, 6], 'newest order first');
  assert.equal(s.outstandingValue, 957, '272 × 3 + 141 still to send on SO-8');
  assert.equal(s.lateValue, 272);
  assert.equal(s.heldValue, 272);
  assert.equal(s.uninvoiced, 2, 'SO-4 and SO-8; cancelled SO-6 and invoiced SO-5 do not count');
  assert.equal(s.uninvoicedValue, 403, '272 for SO-4 + 131 for SO-8');
  const none = salesSummary([], '2026-10-15');
  assert.deepEqual([none.outstanding, none.late, none.uninvoiced, none.uninvoicedValue, none.outstandingValue], [[], [], 0, 0, 0]);

  // — Jobs tab: running order for the open stages, newest dispatch first for finished. —
  const up1 = job({ id: 11, so: 'SO-11', lines: L('2026-10-20') });
  const up2 = job({ id: 12, so: 'SO-12', lines: L('2026-10-18') });
  const up3 = job({ id: 13, so: 'SO-13', lines: L('2026-10-25'), priority: 1 });
  const cur = job({ id: 14, so: 'SO-14', lines: L('2026-10-19'), procs: { 'Laser': { done: true }, 'Fold': { done: false } } });
  const bl = boardLists([up1, up2, up3, cur, d, e, g]);
  assert.deepEqual(ids(bl.upcoming), [13, 12, 11], 'brought forward first, then by due date');
  assert.deepEqual(ids(bl.current), [14]);
  assert.deepEqual(ids(bl.completed), [5, 4]);
  assert.ok(!Object.values(bl).flat().includes(g), 'cancelled is off the board');
  console.log('jobs sales orders and board: ok');
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tests/jobs.mjs`
Expected: FAIL — `salesSummary` is not exported (SyntaxError on the import).

- [ ] **Step 3: Implement** — add to `src/core/jobs.js` after `compareValues`:

```js
/** Sales orders tab: outstanding (held included) and on hold soonest due first, dispatched newest
 *  dispatch first, cancelled newest order first; with the sums the cards show. */
export function salesSummary(jobs, today) {
  const soonest = (a, b) => compareValues(nextDue(a), nextDue(b)) || compareValues(a.so, b.so);
  const newest = f => (a, b) => compareValues(f(a), f(b), -1) || compareValues(a.so, b.so, -1);
  const outstanding = jobs.filter(j => !['completed', 'cancelled'].includes(stage(j))).sort(soonest);
  const late = outstanding.filter(j => nextDue(j) && nextDue(j) < today);
  const held = outstanding.filter(j => j.status === 'held');
  const uninv = jobs.filter(j => j.status !== 'cancelled').flatMap(j => j.despatches.filter(d => !d.xero).map(d => ({ job: j, d })));
  const toSend = xs => round2(xs.reduce((a, j) => a + (value(j, { remaining: true }) || 0), 0));
  return {
    outstanding, late, held,
    dispatched: jobs.filter(j => stage(j) === 'completed').sort(newest(lastDespatch)),
    cancelled: jobs.filter(j => j.status === 'cancelled').sort(newest(j => j.ordered)),
    outstandingValue: toSend(outstanding), lateValue: toSend(late), heldValue: toSend(held),
    uninvoiced: new Set(uninv.map(x => x.job.id)).size,
    uninvoicedValue: round2(uninv.reduce((a, x) => a + (despatchValue(x.job, x.d) || 0), 0)),
  };
}

/** Jobs tab: not started and in progress in the running order; finished newest dispatch first. */
export function boardLists(jobs) {
  const at = st => jobs.filter(j => stage(j) === st);
  return {
    upcoming: at('upcoming').sort(byRunningOrder), current: at('current').sort(byRunningOrder),
    completed: at('completed').sort((a, b) => compareValues(lastDespatch(a), lastDespatch(b), -1) || compareValues(a.so, b.so, -1)),
  };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: every file passes, including `jobs sales orders and board: ok`.

- [ ] **Step 5: Commit**

```bash
git add src/core/jobs.js tests/jobs.mjs
git commit -m "Core: salesSummary and boardLists for the Sales orders and Jobs tabs"
```

---

### Task 2: Sales orders tab

**Files:**
- Create: `src/orders.js`
- Modify: `src/home.js` (four new icons), `src/app.js`, `index.html` (CSS scope, phone rule, `MODULES`), `src/help.js` (Sales orders paragraph), then `python3 dev/make-smoke.py`

**Interfaces:**
- Consumes: `salesSummary` (Task 1); `card` from `src/home.js`; from app.js via `h`: `esc, fmt, gbp, dueChip, match` where `match(job, q)` is true when the lower-cased query `q` is in the SO, customer, PO, quote number or any line PO.
- Produces: `renderSalesOrders({ jobs, today, view, search, form }, h)` → HTML string. Icons `hold`, `invoice`, `start`, `making` in `src/home.js`'s ICON (Task 3 uses `start` and `making`).

- [ ] **Step 1: Icons** — add to `ICON` in `src/home.js`:

```js
  hold: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  invoice: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  start: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
  making: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
```

- [ ] **Step 2: `src/orders.js`**

```js
/**
 * Sales orders: every order with what has been dispatched and invoiced. Home's cards, then one table
 * switching Outstanding / Dispatched / On hold / Cancelled; a search looks through every order. The
 * lists and sums come from salesSummary() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js.
 */
import { salesSummary, stage, nextDue, value, despatchStatus, invoiceStatus, compareValues } from './core/jobs.js';
import { card } from './home.js';

const orders = n => `${n} order${n === 1 ? '' : 's'}`;

export function renderSalesOrders({ jobs, today, view, search, form }, h) {
  const { esc, fmt, gbp, dueChip, match } = h;
  const s = salesSummary(jobs, today);
  const cards = [
    card('bad', 'late', s.late.length, s.late.length ? `Late · ${gbp(s.lateValue)}` : 'Late', s.late.length > 0),
    card('warn', 'hold', s.held.length, s.held.length ? `On hold · ${gbp(s.heldValue)}` : 'On hold', s.held.length > 0),
    card('warn', 'invoice', gbp(s.uninvoicedValue), `Dispatched, not invoiced${s.uninvoiced ? ' · ' + orders(s.uninvoiced) : ''}`, s.uninvoicedValue > 0),
    card('info', 'book', gbp(s.outstandingValue), `Outstanding · ${orders(s.outstanding.length)}`, s.outstanding.length > 0),
  ].join('');

  const VIEWS = {
    outstanding: { list: s.outstanding, tab: 'Outstanding', title: 'Outstanding orders', sub: 'soonest due first', empty: 'Nothing outstanding — every order has gone out.' },
    dispatched: { list: s.dispatched.slice(0, 50), n: s.dispatched.length, tab: 'Dispatched', title: 'Dispatched', sub: 'latest 50, newest first', empty: 'No orders here.' },
    held: { list: s.held, tab: 'On hold', title: 'On hold', sub: 'soonest due first', empty: 'No orders here.' },
    cancelled: { list: s.cancelled, tab: 'Cancelled', title: 'Cancelled', sub: 'newest first', empty: 'No orders here.' },
  };
  const v = VIEWS[view] ? view : 'outstanding', V = VIEWS[v];
  const q = (search || '').trim().toLowerCase();
  const list = q ? jobs.filter(j => match(j, q)).sort((a, b) => compareValues(a.ordered, b.ordered, -1) || compareValues(a.so, b.so, -1)) : V.list;

  const chip = (t, ok) => `<span class="chip${ok ? ' ok' : ''}">${t}</span>`;
  const progress = j => [j.status === 'cancelled' ? chip('Cancelled') : chip(despatchStatus(j), despatchStatus(j) === 'Dispatched'),
    chip(invoiceStatus(j), invoiceStatus(j) === 'Invoiced'), j.status === 'held' ? '<span class="chip late">On hold</span>' : ''].join(' ');
  const row = j => `<tr data-open="${j.id}"><td><b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span></td>
    <td>${fmt(j.ordered)}</td><td>${stage(j) === 'completed' || j.status === 'cancelled' ? '' : dueChip(nextDue(j))}</td>
    <td>${progress(j)}</td><td class="num">${gbp(value(j), 2)}</td></tr>`;
  const head = '<thead><tr><th>Customer</th><th>Ordered</th><th>Next due</th><th>Progress</th><th class="num">Net</th></tr></thead>';
  const table = list.length
    ? `<div class="tbl-wrap"><table class="lines home orders">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${!q && v === 'outstanding' ? ' ok' : ''}">${q ? 'No orders match that search.' : V.empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Which sales orders to show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-orderview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n ?? x.list.length}</em></button>`).join('')}</div>`;
  const find = `<input type="search" id="osearch" placeholder="Search order, customer or PO" aria-label="Search sales orders" value="${esc(search || '')}">`;

  return `<div class="home">
    <div class="hhead"><div><h2>Sales orders</h2><p class="sub">Every order, with what has been dispatched and invoiced. Click one to open it.</p></div>
      ${form ? '' : '<div class="hbtns"><button class="btn pri" type="button" data-neworder>New order</button></div>'}</div>
    ${form || ''}
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>${q ? 'Search results' : V.title}</h3><span class="note">${q ? `${orders(list.length)} found` : V.sub}</span>${seg}${find}</div>${table}</section>
  </div>`;
}
```

- [ ] **Step 3: Wire into `src/app.js`**
  - `import { renderSalesOrders } from './orders.js';` next to the `renderWon` import.
  - In `S`, replace `orderFilter: 'outstanding'` with `orderView: 'outstanding'`.
  - Next to the `clj.wonview` restore: `try { const v = localStorage.getItem('clj.orderview'); if (['dispatched', 'held', 'cancelled'].includes(v)) S.orderView = v; } catch { /* none kept */ }`
  - Add near `linePos`: `const orderMatch = (j, q) => [j.so, j.customer, j.po, j.quote, ...linePos(j)].some(s => (s || '').toLowerCase().includes(q));`
  - Replace the body of `renderOrders()` with:
    ```js
    $('v-orders').innerHTML = renderSalesOrders({ jobs: S.jobs, today: todayIso(), view: S.orderView, search: S.osearch, form: S.form ? orderForm() : '' },
      { esc, fmt, gbp, dueChip, match: orderMatch });
    ```
  - Delete `function salesOrders()` and the `#ofilter` change handler; delete `orders: {...}` from `SORT_DEFAULT`.
  - Click handler, next to `d.wonview`: `if (d.orderview) { S.orderView = d.orderview; try { localStorage.setItem('clj.orderview', d.orderview); } catch { /* not kept */ } return render(); }`
  - `grep -n "orderFilter\|ofilter\|salesOrders" src/*.js` must return nothing afterwards.

- [ ] **Step 4: `index.html`**
  - In the `/* home */` CSS block, change every `:is(#v-home,#v-quotes)` to `:is(#v-home,#v-quotes,#v-orders,#v-jobs)` (sed over that block only).
  - Add in that block: `:is(#v-home,#v-quotes,#v-orders,#v-jobs) .hsec-h input[type=search]{flex:0 1 260px;min-width:0}`
  - The phone rule that hides column 3 must not hit the new tables. Change its column-3 selector to `table.home:not(.orders):not(.board) th:nth-child(3)` / `td:nth-child(3)`, and add in the same `@media (max-width:560px)`: `table.home.orders th:nth-child(2),table.home.orders td:nth-child(2){display:none}` and `table.home.board td.ord .mv{display:none}`. Also let the search box take a full row there: `.hsec-h input[type=search]{flex:1 1 100%}`.
  - Add `'src/orders.js'` to `var MODULES`.
  - Run `python3 dev/make-smoke.py`.

- [ ] **Step 5: `src/help.js`** — in the Sales orders paragraph replace "Use <b>Show</b> to see outstanding, dispatched, on hold, cancelled or all orders, and click any heading to sort." with "The switch above the list shows <b>Outstanding</b> (soonest due first), <b>Dispatched</b>, <b>On hold</b> or <b>Cancelled</b>; the search looks through every order."

- [ ] **Step 6: Run the tests**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass (site.mjs confirms `MODULES`).

- [ ] **Step 7: Check in the browser** at `http://localhost:8080/dev/smoke.html#orders`: four cards, switch views, typing in search keeps focus and shows "Search results", a row click opens the order, **New order** opens the form between the header and the cards and the button hides, the form still saves/cancels. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/orders.js src/home.js src/app.js src/help.js index.html dev/smoke.html
git commit -m "Sales orders: summary cards and one table switching Outstanding / Dispatched / On hold / Cancelled, search across all orders"
```

---

### Task 3: Jobs tab

**Files:**
- Create: `src/board.js`
- Modify: `src/app.js`, `index.html` (tick pill CSS, `MODULES`), `src/help.js` (Jobs section + "moves to Completed"), then `python3 dev/make-smoke.py`

**Interfaces:**
- Consumes: `boardLists` (Task 1), `dashboard`, `byRunningOrder`, `needed`, `allDone`, `nextDue`, `value`, `lastDespatch`, `SHORT`, `stage` from core; `card` (icons `late`, `start`, `making`, `ready` exist after Task 2); from app.js via `h`: `esc, fmt, fmtTime, gbp, dueChip, statusChips, match, TICK` where `match(job, q)` also searches line part names.
- Produces: `renderBoard({ jobs, today, office, stageKey, search, anyPlaced }, h)` → `{ html, list }`; `list` is the visible rows, which app.js keeps in `S.boardList` for `moveJob`.

- [ ] **Step 1: `src/board.js`**

```js
/**
 * Jobs: what is being made, in the running order. Home's cards, then one table switching Not started /
 * In progress / Finished, with one tick pill per process the job needs. The lists come from
 * boardLists() and dashboard() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js. Returns the visible rows too, for moving jobs.
 */
import { boardLists, dashboard, byRunningOrder, needed, allDone, nextDue, value, lastDespatch, SHORT } from './core/jobs.js';
import { card } from './home.js';

export function renderBoard({ jobs, today, office, stageKey, search, anyPlaced }, h) {
  const { esc, fmt, fmtTime, gbp, dueChip, statusChips, match, TICK } = h;
  const L = boardLists(jobs), d = dashboard(jobs, today);
  const rank = new Map([...L.upcoming, ...L.current].sort(byRunningOrder).map((j, i) => [j.id, i + 1]));
  const cards = [
    card('bad', 'late', d.late.length, office && d.late.length && d.lateValue != null ? `Late · ${gbp(d.lateValue)}` : 'Late', d.late.length > 0),
    card('info', 'start', L.upcoming.length, 'Not started', false),
    card('info', 'making', L.current.length, 'In progress', L.current.length > 0),
    card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0),
  ].join('');

  const STAGES = { upcoming: 'Not started', current: 'In progress', completed: 'Finished' };
  const st = STAGES[stageKey] ? stageKey : 'current', done = st === 'completed';
  const q = (search || '').trim().toLowerCase();
  const all = L[st].filter(j => !q || match(j, q));
  const list = done && !q ? all.slice(0, 50) : all;
  const canMove = office && !done && !q;
  const toSend = list.reduce((a, j) => a + (value(j, { remaining: true }) || 0), 0);

  const pill = (j, p) => {
    const s = j.procs[p], title = s.done ? `${p} done by ${s.by}, ${fmtTime(s.at)}` : `Mark ${p} done`;
    return `<button type="button" class="pt${s.done ? ' done' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" title="${esc(title)}"><span class="bx">${s.done ? TICK : ''}</span>${esc(SHORT[p])}</button>`;
  };
  const mv = (j, how, sym, label, off) => `<button type="button" class="btn sm" data-move="${how}" data-job="${j.id}" title="${label}" aria-label="${label}: ${esc(j.so)}" ${off ? 'disabled' : ''}>${sym}</button>`;
  const ord = j => (done ? '' : `<td class="ord"><span class="n ${j.priority != null ? 'placed' : ''}" title="${j.priority != null ? 'Brought forward' : 'In date order'}">${rank.get(j.id) ?? ''}</span>${canMove
    ? `<span class="mv">${mv(j, 'top', '⤒', 'Bring to the top')}${mv(j, 'up', '▲', 'Up one', list[0] === j)}${mv(j, 'down', '▼', 'Down one', list[list.length - 1] === j)}</span>` : ''}</td>`);
  const row = j => `<tr data-open="${j.id}" class="${!done && allDone(j) && j.status === 'open' ? 'ready' : ''}">${ord(j)}
    <td><b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span><div class="chips">${statusChips(j)}</div></td>
    <td>${done ? `<span class="chip">sent ${fmt(lastDespatch(j))}</span>` : dueChip(nextDue(j))}</td>
    <td>${needed(j).map(p => pill(j, p)).join('') || '<span class="note">No processes</span>'}</td>
    ${office ? `<td class="num">${gbp(done ? value(j) : value(j, { remaining: true }), 2)}</td>` : ''}</tr>`;
  const head = `<thead><tr>${done ? '' : '<th>Order</th>'}<th>Customer</th><th>${done ? 'Dispatched' : 'Due'}</th><th>Processes</th>${office ? `<th class="num">${done ? 'Value' : 'Outstanding'}</th>` : ''}</tr></thead>`;
  const empty = jobs.length ? (q ? 'No jobs match that search.' : 'No jobs here.')
    : (office ? 'No jobs yet. Make one from Won quotes, or press New order on Sales orders.' : 'No jobs yet. They appear here once the office creates them.');
  const table = list.length
    ? `<div class="tbl-wrap"><table class="lines home board">${head}<tbody>${list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear">${empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Job stage">${Object.entries(STAGES).map(([k, t]) =>
    `<button type="button" data-stage="${k}" aria-pressed="${k === st}">${t} <em>${L[k].length}</em></button>`).join('')}</div>`;
  const find = `<input type="search" id="search" placeholder="Search customer, SO, PO or part" aria-label="Search jobs" value="${esc(search || '')}">`;
  const sub = done ? (q ? `${list.length} found` : 'latest 50, newest first') : `running order${office && list.length ? ` · ${gbp(toSend)} still to dispatch` : ''}`;
  const note = `Click a process to tick it. Click a row for the full order.${office && !done
    ? (canMove ? ' Use ⤒ ▲ ▼ to bring a job forward; the shop floor follows this order.' : ' Clear the search to move jobs.') : ''}${office && anyPlaced && !done
    ? ' <button type="button" class="btn link sm" data-move="reset">Put everything back in date order</button>' : ''}`;

  return { list, html: `<div class="home">
    <div class="hhead"><div><h2>Jobs</h2><p class="sub">What is being made, in the running order. Tick a process when it is finished.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="dispatch">Dispatch</button></div></div>
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>${STAGES[st]}</h3><span class="note">${sub}</span>${seg}${find}</div>${table}<p class="note">${note}</p></section>
  </div>` };
}
```

- [ ] **Step 2: Wire into `src/app.js`**
  - `import { renderBoard } from './board.js';`
  - Add next to `orderMatch`: `const jobMatch = (j, q) => orderMatch(j, q) || j.lines.some(l => (l.part || '').toLowerCase().includes(q));`
  - Replace the body of `renderJobs()` with:
    ```js
    const { html, list } = renderBoard({ jobs: S.jobs, today: todayIso(), office: office(), stageKey: S.stage, search: S.search,
      anyPlaced: S.jobs.some(j => j.priority != null && onBoardStage(j)) }, { esc, fmt, fmtTime, gbp, dueChip, statusChips, match: jobMatch, TICK });
    S.boardList = list;
    $('v-jobs').innerHTML = html;
    ```
  - Delete `function jobBoard()` and `procCell()` if nothing else uses it (grep first); delete `board` and `boardDone` from `SORT_DEFAULT`. Keep `TICK`, `SHORT`, `onBoardStage`, `runningOrder`, `moveJob`, `boardVisible`.
  - Check `moveJob` still works with `S.boardList` (visible rows, running order) and `data-move="reset"` still works.

- [ ] **Step 3: `index.html`**
  - Tick pills, global (Help pictures use them too), next to `.tick`:
    ```css
    .pt{display:inline-flex;align-items:center;gap:6px;min-height:34px;border:1px solid var(--line);border-radius:999px;padding:3px 12px 3px 8px;margin:2px 4px 2px 0;background:var(--surface);color:var(--muted);font:600 13px var(--body);cursor:pointer}
    .pt .bx{width:16px;height:16px;border-radius:4px;border:2px solid currentColor;display:inline-grid;place-items:center}
    .pt svg{width:12px;height:12px}
    .pt.done{background:var(--ok-soft);border-color:transparent;color:var(--ok)}
    .pt:hover{border-color:var(--muted)}
    .pt:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
    ```
  - In the home block: `#v-jobs table.home.board tr.ready td{background:var(--ok-soft)}` and `#v-jobs table.home .chips:not(:empty){margin-top:4px;display:flex;gap:4px;flex-wrap:wrap}` (statusChips emits `.chip` spans; check they look like the mockup).
  - Add `'src/board.js'` to `var MODULES`. Run `python3 dev/make-smoke.py`.

- [ ] **Step 4: `src/help.js`**
  - Jobs section (`jobsBoard()`): text becomes "Every open order, one row each. <b>Not started</b> has nothing ticked or sent, <b>In progress</b> has something ticked or sent, <b>Finished</b> is all dispatched." Redraw the picture as the new table (Order, Customer with `SO · PO` under it, Due, Processes as `.pt` pills, one done) inside `table.lines.home.board`-like markup that renders correctly in `#v-help` (check it in the browser; the home block CSS is not scoped to `#v-help`, so use classes that are styled there or add `#v-help` to the scope of what you need). Drop the "${n(2)} Sort: click any heading…" step and renumber; the ⤒ ▲ ▼ step stays.
  - "then moves to <b>Completed</b>" → "then moves to <b>Finished</b>".
  - `grep -n "Upcoming\|Current\b\|Completed\|sort" src/help.js` and fix any Jobs-tab mention left.

- [ ] **Step 5: Run the tests**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass.

- [ ] **Step 6: Check in the browser** `http://localhost:8080/dev/smoke.html#jobs` (office) and `?role=floor#jobs`: four cards; switch Not started / In progress / Finished; clicking a pill ticks it (and does not open the order); ⤒ ▲ ▼ move a job and the numbers change; search filters and hides the arrows; floor sees no £ and no arrows; Help › Jobs picture looks right. No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/board.js src/app.js src/help.js index.html dev/smoke.html
git commit -m "Jobs: summary cards, Not started / In progress / Finished switch, one Processes column of tick pills"
```
