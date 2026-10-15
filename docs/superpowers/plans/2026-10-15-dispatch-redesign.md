# Dispatch Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Dispatch tab into Home's pattern: four cards, the dispatch note form when a job is picked, then one table with a switch Ready / Out for delivery / Waiting for Xero / All notes, each row with its next step.

**Architecture:** One pure, tested helper in `src/core/jobs.js` (`dispatchLists`) sorts jobs and notes into the lists. A new view module `src/dispatch.js` draws the tab as an HTML string (like `src/orders.js`). `src/app.js` keeps what needs its state (the note form, the Xero contact rows) and passes them in; the old panels and the sortable-heading machinery go.

**Tech Stack:** Static site, vanilla ES modules, no build step. Tests: `for t in tests/*.mjs; do node $t || exit 1; done`. Smoke page: `python3 dev/make-smoke.py` after any `index.html` change, then `http://localhost:8080/dev/smoke.html#dispatch` (floor: `?role=floor#dispatch`). A server is already running on 8080.

## Global Constraints

- Spec: `docs/specs/2026-10-15-dispatch-redesign.md` — source of truth for wording, columns, order and behaviour.
- Mockup it came from: `.superpowers/brainstorm/23318-1792063699/content/dispatch.html`. Match its look.
- Nothing that works today is taken away: the note form (`#mkdn`, `data-dq` inputs, `deliveryRow`), part-dispatching via `#dsel`, Email (`data-dn` opens the note), Mark delivered (`form.inv[data-deliver]`) and `data-undeliver`, View, Cancel a note (`data-cancdn` / `data-cancdnyes` / `data-cancdnno`), Xero contacts (`data-xcpick`, `data-xcchange`, `data-xcreload`), `data-sendpick`, `data-sendxero`, invoiced by hand (`form.inv[data-inv]`).
- The shop floor (`office()` false) never sees £, the Waiting for Xero view, the Xero column/chips, or Cancel.
- Colours only from the existing tokens; works in light and dark. Home's card helper `card()` from `src/home.js`.
- `var MODULES = [...]` in `index.html` must list every `src/*.js` file (`tests/site.mjs`).
- Write code that reads like the surrounding code: terse, comment density as in `src/orders.js`.

---

### Task 1: dispatchLists (core, tested)

**Files:**
- Modify: `src/core/jobs.js` (after `floorStations`, before `dayNo`; it uses `weekStart`, a function declaration further down, which is fine)
- Test: `tests/jobs.mjs` (append a block; add `dispatchLists` to the import from `../src/core/jobs.js`)

**Interfaces:**
- Produces: `dispatchLists(jobs, today)` → `{ ready, open, held, out, notEmailed, toXero, toXeroValue, notes, thisWeek }`. `ready`/`open`/`held` are job arrays in the running order. `out`/`notEmailed`/`toXero`/`notes` are arrays of `{ job, d }` (`d` = a dispatch note). `toXeroValue` is a number or `null`. `thisWeek` is a number.

- [ ] **Step 1: Write the failing test** — append to `tests/jobs.mjs`:

```js
// — Dispatch tab: what is ready, and where each dispatch note is. —
{
  const L = [{ id: 10, lineNo: 1, part: 'Bracket', qty: 20, price: 13.1, due: '2026-10-30' }];
  const done = { 'Laser': { done: true } }, todo = { 'Laser': { done: false } };
  const a = job({ id: 1, so: 'SO-1', lines: L, procs: done, despatches: [
    { id: 1, dn: 'DN-1', date: '2026-10-05', lines: { 10: 2 }, deliveredOn: '2026-10-06', xero: { no: 'INV-1' } },
    { id: 3, dn: 'DN-3', date: '2026-10-13', lines: { 10: 2 }, deliveredOn: '2026-10-14', xero: null },
    { id: 5, dn: 'DN-5', date: '2026-10-14', lines: { 10: 2 }, emailedAt: '2026-10-14T10:00:00Z', deliveredOn: null, xero: null }],
    cancelledDespatches: [{ id: 4, dn: 'DN-4', date: '2026-10-13', lines: { 10: 1 }, cancelled: { at: '2026-10-14T09:00:00Z', by: 'Levi' } }] });
  const b = job({ id: 2, so: 'SO-2', lines: L, procs: todo, despatches: [
    { id: 2, dn: 'DN-2', date: '2026-10-12', lines: { 10: 1 }, deliveredOn: '2026-10-13', xero: null },
    { id: 6, dn: 'DN-6', date: '2026-10-15', lines: { 10: 1 }, deliveredOn: null, xero: null }] });
  const c = job({ id: 3, so: 'SO-3', lines: L, procs: done, status: 'held' });
  const gone = job({ id: 4, so: 'SO-4', lines: L, procs: done, despatches: [{ id: 7, dn: 'DN-7', date: '2026-10-15', lines: { 10: 20 }, deliveredOn: null, xero: null }] });
  const off = job({ id: 5, so: 'SO-5', lines: L, procs: done, status: 'cancelled' });
  const s = dispatchLists([b, a, c, gone, off], '2026-10-15');
  const ids = xs => xs.map(x => (x.d || x).id);
  assert.deepEqual(ids(s.ready), [1], 'ready: open, every process ticked; held, finished and cancelled out');
  assert.deepEqual(ids(s.open), [1, 2], 'open: every open job, running order');
  assert.deepEqual(ids(s.held), [3]);
  assert.deepEqual(ids(s.out), [7, 6, 5], 'out for delivery: newest first, finished jobs included');
  assert.deepEqual(ids(s.notEmailed), [7, 6]);
  assert.deepEqual(ids(s.toXero), [2, 3], 'waiting for Xero: oldest first');
  assert.equal(s.toXeroValue, 39.3);
  assert.deepEqual(ids(s.notes), [7, 6, 5, 4, 3, 2, 1], 'all notes newest first, cancelled included');
  assert.equal(s.thisWeek, 5, 'live notes dated Monday 12 Oct to today');
  const hidden = j => ({ ...j, lines: j.lines.map(l => ({ ...l, price: null })) });
  assert.equal(dispatchLists([hidden(a), hidden(b)], '2026-10-15').toXeroValue, null, 'no £ without prices');
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node tests/jobs.mjs`
Expected: FAIL — `dispatchLists` is not exported (SyntaxError on import).

- [ ] **Step 3: Write the implementation** — in `src/core/jobs.js`, after `floorStations`:

```js
/** Dispatch tab: jobs that could go (ready = every process ticked) in the running order, and the
 *  dispatch notes by where they are: out for delivery newest first, waiting for Xero oldest first,
 *  all (cancelled included) newest first. */
export function dispatchLists(jobs, today) {
  const live = jobs.filter(j => ['upcoming', 'current'].includes(stage(j))).sort(byRunningOrder);
  const open = live.filter(j => j.status === 'open');
  const dn = jobs.flatMap(j => j.despatches.map(d => ({ job: j, d }))).sort((a, b) => b.d.id - a.d.id);
  const out = dn.filter(x => !x.d.deliveredOn && !x.d.xero);
  const toXero = dn.filter(x => x.d.deliveredOn && !x.d.xero).reverse();
  const money = jobs.every(j => j.lines.every(l => l.price != null));
  const wk = weekStart(today);
  return {
    ready: open.filter(allDone), open, held: live.filter(j => j.status === 'held'),
    out, notEmailed: out.filter(x => !x.d.emailedAt), toXero,
    toXeroValue: money ? round2(toXero.reduce((a, x) => a + (despatchValue(x.job, x.d) || 0), 0)) : null,
    notes: dn.concat(jobs.flatMap(j => (j.cancelledDespatches || []).map(d => ({ job: j, d })))).sort((a, b) => b.d.id - a.d.id),
    thisWeek: dn.filter(x => x.d.date >= wk && x.d.date <= today).length,
  };
}
```

- [ ] **Step 4: Run all tests**

Run: `for t in tests/*.mjs; do node $t || exit 1; done`
Expected: all pass, no output errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/jobs.js tests/jobs.mjs
git commit -m "Dispatch: dispatchLists — ready jobs and dispatch notes by where they are (tested)"
```

---

### Task 2: The Dispatch view and its wiring

**Files:**
- Create: `src/dispatch.js`
- Modify: `src/home.js` (two icons in `ICON`)
- Modify: `src/app.js` (import, `renderDespatch`, `waitingForXero`, new `despatchForm`, remove `despatchTable` and the sort machinery, click/input handlers, `S` defaults)
- Modify: `index.html` (MODULES, CSS)
- Test: `tests/site.mjs` already checks MODULES; run the whole suite.

**Interfaces:**
- Consumes: `dispatchLists(jobs, today)` from Task 1.
- Produces: `renderDispatch({ lists, office, view, chosen, search, desp, form, cancelDn, xero }, h)` → HTML string. `xero` is `null` or `{ table, how, send }` (HTML strings). `h` = `{ esc, fmt, gbp, dueChip, parts }` where `parts(job)` is app.js's `dispatchParts`.
- Click data attributes added: `data-dispview="ready|out|xero|all"`, `data-despclose`. Input id: `#dsearch`. State: `S.dispView`, `S.dispChosen`, `S.dsearch`.

- [ ] **Step 1: Add two icons** — in `src/home.js` `ICON`, after `making`:

```js
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
```

- [ ] **Step 2: Create `src/dispatch.js`:**

```js
/**
 * Dispatch: Home's cards, the note form when a job is picked, then one table switching Ready / Out
 * for delivery / Waiting for Xero (office) / All notes, each row with its next step. The lists come
 * from dispatchLists() in core/jobs.js (tested). The note form and the Xero rows need app.js's
 * state, so app.js draws those and passes them in. h: the formatting helpers from app.js.
 */
import { allDone, deliveryLabel, nextDue } from './core/jobs.js';
import { card } from './home.js';

const notes = n => `${n} note${n === 1 ? '' : 's'}`;
const noteMatch = ({ job: j, d }, q) => [d.dn, j.so, j.po, j.customer].some(v => (v || '').toLowerCase().includes(q));

export function renderDispatch({ lists: s, office, view, chosen, search, desp, form, cancelDn, xero }, h) {
  const { esc, fmt, gbp, dueChip, parts } = h;
  const cards = [
    card('ok', 'ready', s.ready.length, 'Ready to dispatch', s.ready.length > 0),
    card('warn', 'mail', s.notEmailed.length, 'Not emailed to the customer', s.notEmailed.length > 0),
    card('info', 'truck', s.out.length, 'Out for delivery', s.out.length > 0),
    office ? card('warn', 'invoice', gbp(s.toXeroValue), `Waiting for Xero · ${notes(s.toXero.length)}`, s.toXero.length > 0)
      : card('', 'soon', s.thisWeek, 'Sent this week', false),
  ].join('');

  const ready = s.ready.filter(j => j.id !== desp);   // the job in the form is not listed twice
  const VIEWS = {
    ready: { list: ready, tab: 'Ready', title: 'Ready to dispatch', sub: 'every process ticked · running order', empty: 'Nothing ready yet. Jobs show here once every process is ticked.' },
    out: { list: s.out, tab: 'Out for delivery', title: 'Out for delivery', sub: 'email the note, then mark it delivered when it arrives · only delivered notes go to Xero', empty: 'Nothing out for delivery.', ok: true },
    ...(office ? { xero: { list: s.toXero, tab: 'Waiting for Xero', title: 'Waiting for Xero', sub: 'delivered, not invoiced yet', empty: 'Nothing waiting. Every delivered note is in Xero.', ok: true } } : {}),
    all: { list: s.notes.slice(0, 100), n: s.notes.length, tab: 'All notes', title: 'All dispatch notes', sub: 'newest first, latest 100', empty: 'No dispatch notes yet.' },
  };
  const v = chosen && VIEWS[view] ? view : Object.keys(VIEWS).find(k => k !== 'all' && VIEWS[k].list.length) || 'all', V = VIEWS[v];
  const q = v === 'all' ? (search || '').trim().toLowerCase() : '';
  const list = q ? s.notes.filter(x => noteMatch(x, q)) : V.list;

  const chip = (t, tone) => `<span class="chip${tone ? ' ' + tone : ''}">${t}</span>`;
  const who = j => `<b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span>`;
  const emailed = d => d.emailedAt ? chip(`Emailed ${fmt(d.emailedAt.slice(0, 10))}`, 'ok') : chip('Not emailed', 'soon');
  const viewBtn = (j, d, label = 'View', pri = false) => `<button class="btn sm${pri ? ' pri' : ''}" type="button" data-dn="${d.id}" data-job="${j.id}">${label}</button>`;
  const deliver = (d, pri) => `<form class="inv" data-deliver="${d.id}"><input type="text" id="rcv-${d.id}" placeholder="Signed by (optional)" aria-label="Who signed for ${esc(d.dn)}"><button class="btn sm${pri ? ' pri' : ''}" type="submit">Mark delivered</button></form>`;
  const progress = d => d.cancelled ? chip(`Cancelled ${fmt(d.cancelled.at.slice(0, 10))}${d.cancelled.by ? ' by ' + esc(d.cancelled.by) : ''}`)
    : [emailed(d),
      d.deliveredOn ? chip(`Delivered ${fmt(d.deliveredOn)}${d.receivedBy ? ' · ' + esc(d.receivedBy) : ''}`, 'ok') + (d.xero ? '' : ` <button class="btn link sm" type="button" data-undeliver="${d.id}">undo</button>`) : chip('Out for delivery'),
      office ? (d.xero ? chip(esc(d.xero.no), 'ok') : d.deliveredOn ? chip('Waiting for Xero', 'soon') : '') : ''].join(' ');
  const confirm = (j, d) => cancelDn !== d.id ? '' : `<tr class="confirmrow"><td colspan="5"><div class="warn" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <span><b>Cancel ${esc(d.dn)}?</b> It stays on the list marked cancelled, its number is not reused, and everything on it goes back to outstanding on ${esc(j.so)}. Use this when the goods did not go, or came back.</span>
    <button class="btn sm pri" type="button" data-cancdnyes="${d.id}">Yes, cancel ${esc(d.dn)}</button><button class="btn sm" type="button" data-cancdnno>Keep it</button></div></td></tr>`;

  const HEAD = {
    ready: '<th>Customer</th><th>Due</th><th>To send</th><th class="act">Next step</th>',
    out: '<th>Note</th><th>Customer</th><th class="wide">Dispatched</th><th>Emailed</th><th class="act">Next step</th>',
    all: '<th>Note</th><th>Customer</th><th class="wide">Dispatched</th><th>Progress</th><th class="act"></th>',
  };
  const ROW = {
    ready: j => `<tr><td>${who(j)}</td><td>${dueChip(nextDue(j))}${deliveryLabel(j) ? ` <span class="note">${deliveryLabel(j)}</span>` : ''}</td>
      <td>${parts(j)}</td><td class="act"><button class="btn sm pri" type="button" data-desp="${j.id}">Dispatch</button></td></tr>`,
    out: ({ job: j, d }) => `<tr><td class="mono">${esc(d.dn)}</td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td>${emailed(d)}</td>
      <td class="act"><div class="next">${d.emailedAt ? deliver(d, true) + viewBtn(j, d) : viewBtn(j, d, 'Email note…', true) + deliver(d, false)}</div></td></tr>`,
    all: ({ job: j, d }) => d.cancelled
      ? `<tr class="muted"><td class="mono"><s>${esc(d.dn)}</s></td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td>${progress(d)}</td><td class="act"></td></tr>`
      : `<tr><td class="mono">${esc(d.dn)}</td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td>${progress(d)}</td>
        <td class="act">${viewBtn(j, d)}${office && !d.xero ? ` <button class="btn link sm" type="button" data-cancdn="${d.id}">Cancel</button>` : ''}</td></tr>${confirm(j, d)}`,
  };
  const table = !list.length ? `<div class="tbl-wrap"><p class="allclear${!q && V.ok ? ' ok' : ''}">${q ? 'No notes match that search.' : V.empty}</p></div>`
    : v === 'xero' ? `<div class="tbl-wrap">${xero.table}</div>${xero.how}`
    : `<div class="tbl-wrap"><table class="lines home dispatch"><thead><tr>${HEAD[v]}</tr></thead><tbody>${list.map(ROW[v]).join('')}</tbody></table></div>`;
  const chooser = v !== 'ready' ? '' : `<div class="dfoot"><label class="note" for="dsel">Sending part of a job that isn't finished?</label>
    <select class="f" id="dsel"><option value="">Choose any open job…</option>${s.open.map(x => `<option value="${x.id}" ${x.id === desp ? 'selected' : ''}>${esc(x.so)} · ${esc(x.customer)}${x.po ? ' · PO ' + esc(x.po) : ''}${allDone(x) ? ' · ready' : ''}</option>`).join('')}</select>
    ${s.held.length ? `<span class="note">On hold, so not listed: ${s.held.map(j => esc(j.so)).join(', ')}.</span>` : ''}</div>`;
  const seg = `<div class="seg" role="group" aria-label="Which dispatch list to show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-dispview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n ?? x.list.length}</em></button>`).join('')}</div>`;
  const find = v === 'all' ? `<input type="search" id="dsearch" placeholder="Search note, order or customer" aria-label="Search dispatch notes" value="${esc(search || '')}">` : '';

  return `<div class="home">
    <div class="hhead"><div><h2>Dispatch</h2><p class="sub">Send all of a job or part of it. Each dispatch gets its own note, and only what went out is invoiced.</p></div></div>
    <div class="hcards">${cards}</div>
    ${form || ''}
    <section><div class="hsec-h"><h3>${q ? 'Search results' : V.title}</h3><span class="note">${q ? `${notes(list.length)} found` : V.sub}</span>${seg}${find}${v === 'xero' && xero ? xero.send : ''}</div>${table}${chooser}</section>
  </div>`;
}
```

- [ ] **Step 3: Rewire `src/app.js`.**

3a. Imports: add `dispatchLists` to the `./core/jobs.js` import; add `import { renderDispatch } from './dispatch.js';` next to the other view imports (`renderSalesOrders`, `renderBoard`, …).

3b. `S` defaults (line ~71): add `dispView: 'ready', dispChosen: false, dsearch: '',`.

3c. Replace the whole `renderDespatch()` function (and delete `despatchTable()`, which nothing else uses) with:

```js
/** The dispatch note form for the picked job: what is outstanding, with this dispatch's quantities. */
function despatchForm(j) {
  const missing = needed(j).filter(p => !j.procs[p].done), del = deliveryLabel(j);
  return `<div class="panel dform"><h3>Dispatch ${esc(j.so)} · ${esc(j.customer)}</h3>
    <p class="note">${[j.po ? 'PO ' + esc(j.po) : 'No PO', del].filter(Boolean).join(' · ')}. The quantities start at everything due by ${fmt(nextDue(j))}. Anything not sent stays outstanding on the order.</p>
    ${missing.length ? `<div class="warn">Not ticked yet: ${esc(missing.join(', '))}. Check the parts are finished before they go.</div>` : ''}
    ${deliveryRow(j)}
    <div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Sent</th><th>Left</th><th>This dispatch</th></tr></thead><tbody>
    ${j.lines.filter(l => left(j, l) > 0 || sent(j, l) > 0).map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td>${esc(l.part)}${l.po ? ` <span class="note">PO ${esc(l.po)}</span>` : ''}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td>${left(j, l)}</td><td>${left(j, l) ? `<input type="number" min="0" max="${left(j, l)}" value="${defaultDespatchQty(j, l)}" id="dq-${l.id}" data-dq="${l.id}" aria-label="Quantity of ${esc(l.part)} due ${fmt(l.due)} this dispatch">` : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="actions"><button class="btn pri" type="button" id="mkdn" ${S.busy ? 'disabled' : ''}>Create dispatch note${del ? ` (${del.toLowerCase()})` : ''}</button><button class="btn" type="button" data-despclose>Close</button></div>
    <p class="note" id="dn-msg"></p></div>`;
}
function renderDespatch() {
  const lists = dispatchLists(S.jobs, todayIso());
  if (S.desp && !lists.open.some(j => j.id === S.desp)) S.desp = null;
  const money = office();
  $('v-dispatch').innerHTML = renderDispatch({ lists, office: money, view: S.dispView, chosen: S.dispChosen, search: S.dsearch, desp: S.desp,
    form: S.desp ? despatchForm(job(S.desp)) : '', cancelDn: S.cancelDn, xero: money && lists.toXero.length ? waitingForXero(lists.toXero) : null },
    { esc, fmt, gbp, dueChip, parts: dispatchParts });
}
```

3d. `waitingForXero(pend)` now takes `{ job, d }` items and returns `{ table, how, send }` instead of a panel:
- First lines: drop the `if (!pend.length) return …` line (renderDispatch handles empty). Change `pend.map(([x, d]) =>` to `pend.map(({ job: x, d }) =>` and `pend.filter(([x, d]) =>` to `pend.filter(({ job: x, d }) =>`, and `ready.reduce((a, [x, d]) =>` to `ready.reduce((a, { job: x, d }) =>`.
- In each row: the Reference cell gets `class="mono wide"` (drop its inline style), the date cell becomes `<td class="wide">${fmt(d.deliveredOn)}</td>`.
- Replace the final `return \`<div class="panel">…\`` with:

```js
  return {
    table: `<table class="lines home xero"><thead><tr>${connected ? '<th></th>' : ''}<th>Note</th><th>Customer</th>${connected ? '<th>Xero contact</th>' : ''}<th class="wide">Reference</th><th class="wide">Delivered</th><th class="num">Net</th><th class="act">Invoiced by hand?</th></tr></thead><tbody>${rows}</tbody></table>`,
    how,
    send: connected && S.xc ? `<div class="hbtns"><button class="btn pri" type="button" data-sendxero ${ready.length && !S.busy ? '' : 'disabled'}>${S.busy ? 'Sending…' : `Create ${ready.length} draft invoice${ready.length === 1 ? '' : 's'} in Xero`}</button>${ready.length ? `<span class="note">${gbp(total, 2)} net</span>` : ''}</div>` : '',
  };
```
  The Net cell in the row gets `class="num"`; the Invoiced-by-hand cell `class="act"`.

3e. In `sendToXero()`, `pend` is built inline from `S.jobs` as `[x, d]` pairs — leave that function alone (it does not call `waitingForXero`).

3f. Remove the sortable-heading machinery: the block from `/* ---------- sortable column headings` through `setSort` (`SORT_DEFAULT`, `SORT`, `sortOf`, `sortTh`, `sortRows`, `setSort`) and the click branch `if (d.sort) { … }`. Drop `compareValues` from the import if nothing else in app.js uses it (`grep -n compareValues src/app.js`).

3g. Click handler — next to the `d.orderview` branch add:

```js
  if (d.dispview) { S.dispView = d.dispview; S.dispChosen = true; if (S.tab !== 'dispatch') { S.tab = 'dispatch'; history.replaceState(null, '', '#dispatch'); window.scrollTo(0, 0); } return render(); }
```
and next to the `d.desp` branch:
```js
  if ('despclose' in d) { S.desp = null; return render(); }
```

3h. Input handler — the search branch becomes:

```js
  if (['search', 'osearch', 'dsearch'].includes(e.target.id)) {
    const id = e.target.id; S[id] = e.target.value; const pos = e.target.selectionStart;
    if (id === 'search') renderJobs(); else if (id === 'dsearch') render(); else { if (S.form) collectForm(); renderOrders(); }
    const el = $(id); el.focus(); el.setSelectionRange(pos, pos);
  }
```
(`render()` for `dsearch` so typed quantities in an open note form are kept by `restoreInputs`.)

- [ ] **Step 4: `index.html`.**
- MODULES: add `'src/dispatch.js'` in alphabetical place (after `'src/data.js'`).
- In the Home CSS block, every `:is(#v-home,#v-quotes,#v-orders,#v-jobs)` becomes `:is(#v-home,#v-quotes,#v-orders,#v-jobs,#v-dispatch)` (`sed -i '' 's/:is(#v-home,#v-quotes,#v-orders,#v-jobs)/:is(#v-home,#v-quotes,#v-orders,#v-jobs,#v-dispatch)/g' index.html`), then in the phone rule change `table.home:not(.orders):not(.board)` (both places) to `table.home:not(.orders):not(.board):not(.dispatch):not(.xero)`.
- After the Home block's phone rule add:

```css
#v-dispatch .act .next{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
#v-dispatch .dfoot{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:12px}
#v-dispatch .dfoot select{max-width:420px}
#v-dispatch .dform{border-color:var(--ink)}
#v-dispatch .dform h3{font-family:var(--body);font-weight:600;font-size:20px;text-transform:none;letter-spacing:0}
#v-dispatch .hsec-h .hbtns{margin-left:12px;align-items:center}
@media (max-width:560px){ #v-dispatch .wide{display:none} #v-dispatch .seg{width:100%} #v-dispatch .seg button{flex:1 1 0;min-width:0;padding:6px 6px;font-size:13px} #v-dispatch .hsec-h .hbtns{margin-left:0} }
```
- Delete the `.sorth` rules and `table.dtable form.inv input{…}`.
- Run `python3 dev/make-smoke.py`.

- [ ] **Step 5: Run all tests and check in the browser**

Run: `for t in tests/*.mjs; do node $t || exit 1; done` — all pass.
Open `http://localhost:8080/dev/smoke.html?v=t2#dispatch`: cards show, table opens on Ready, Dispatch opens the form between the cards and the table, Close hides it, each switch view draws, no console errors. `?role=floor#dispatch`: no £, no Waiting for Xero tab, no Cancel.

- [ ] **Step 6: Commit**

```bash
git add src/dispatch.js src/home.js src/app.js index.html dev/smoke.html
git commit -m "Dispatch: Home's cards and one table switching Ready / Out for delivery / Waiting for Xero / All notes; note form between; sortable headings gone"
```

---

### Task 3: Smoke data, Home link, Help, dead CSS

**Files:**
- Modify: `dev/fake-data.js`, `src/home.js`, `src/help.js`, `index.html`, `dev/smoke.html` (regenerated)

**Interfaces:**
- Consumes: `data-dispview="xero"` from Task 2.

- [ ] **Step 1: Smoke data, so every view has rows.** In `dev/fake-data.js`:
  - SO-9781 (id 1) `despatches` gets a second note after DN-0001: `{ id: 5, dn: 'DN-0005', date: '2026-10-15', lines: { 12: 10 }, xero: null, emailedAt: '2026-10-15T09:30:00Z' }` (emailed, out for delivery).
  - SO-9783 (id 3) `despatches: [{ id: 3, dn: 'DN-0003', date: '2026-10-15', lines: { 31: 10 }, xero: null }]` (not emailed).
  - SO-9784 (id 4) gets `cancelledDespatches: [{ id: 4, dn: 'DN-0004', date: '2026-10-13', lines: { 41: 1 }, xero: null, cancelled: { at: '2026-10-14T09:00:00Z', by: 'Levi' } }]`.
  - `let dn = 3;` becomes `let dn = 6;`.
  Check the existing note ids (`grep -n "dn: 'DN-" dev/fake-data.js`) first; if any of ids 3–5 are taken, use the next free ids and set `dn` one above the highest.

- [ ] **Step 2: Home's "Send to Xero" opens the Xero view.** In `src/home.js`, the invoice row's button `data-tab="dispatch"` becomes `data-dispview="xero"`.

- [ ] **Step 3: Help.** In `src/help.js` `dispatch(office)`:
  - Replace the picture with the new layout: a `seg` with `Ready 2 | Out for delivery 1 | Waiting for Xero 1 | All notes 6` (office; floor drops Waiting for Xero) and a `table.lines.home.dispatch` Ready row (Demo Metals Ltd, `SO-9781 · PO-1`, due chip 24 Oct, `<b>12</b> × Cabinet`, Dispatch button with `n(1)`), then a second small table for Out for delivery with one row (DN-0007, Demo Metals Ltd, `Not emailed` chip, `Email note…` button `n(2)`, Signed by box + Mark delivered `n(3)`). Wrap pictures as the other Help sections do (`pic(...)`, `.hframe`), so the Home table CSS applies (check how `jobsBoard()` / the Sales orders picture get `.home` styles and copy that).
  - Text: "The <b>Dispatch</b> tab shows <span class="badge go">2 ready</span> when jobs are finished. The cards count what is ready, not emailed, out for delivery and (office) waiting for Xero. The switch shows <b>Ready</b>, <b>Out for delivery</b>, <b>Waiting for Xero</b> and <b>All notes</b>; it opens on the first with something in it."
  - Steps: keep the three numbered steps' meaning; step 1 adds "It opens above the list; <b>Close</b> puts it away. To send part of a job that isn't finished, choose it under the Ready list." Step 2: "<b>Email note…</b> opens the delivery note…". The office Cancel step says "On <b>All notes</b> press <b>Cancel</b> beside it…".
  - In `xero()`: "Every delivered note waits under <b>Dispatch › Waiting for Xero</b>." stays; its picture's `<div class="panel"><h3>Waiting for Xero</h3>` becomes the `seg` (Waiting for Xero pressed) above a `table.lines.home.xero`, with the Create button beside it.
  - FAQ line about cancelling: "On the Dispatch tab, under All notes, press Cancel beside the note, then Yes. …".

- [ ] **Step 4: Dead CSS.** `grep -n "panel ready\|panel.ready\|dtable\|sorth" index.html src/*.js`; delete `.panel.ready{…}` from `index.html` if nothing uses it any more, and any leftover `dtable`/`sorth` rule. Run `python3 dev/make-smoke.py`.

- [ ] **Step 5: Tests and browser.** `for t in tests/*.mjs; do node $t || exit 1; done` — all pass. In `http://localhost:8080/dev/smoke.html?v=t3#dispatch` every view has rows; Home's Send to Xero lands on Waiting for Xero; Help › Dispatch shows the new picture in light and dark.

- [ ] **Step 6: Commit**

```bash
git add dev/fake-data.js dev/smoke.html src/home.js src/help.js index.html
git commit -m "Dispatch: smoke data for every view, Home's Send to Xero opens Waiting for Xero, Help redrawn, dead CSS removed"
```
