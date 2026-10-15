# Won Quotes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Won quotes tab like the new Home: header with actions, four summary cards, and one table switching between Waiting (oldest first, age-flagged), Made into orders and Not a job.

**Architecture:** Splitting, ordering, ages and totals are pure functions in `src/core/jobs.js` beside `quoteStates`, tested in `tests/jobs.mjs`. A new `src/won.js` draws the tab, reusing Home's card helper (exported from `src/home.js`) and Home's CSS (widened from `#v-home` to `:is(#v-home,#v-quotes)`). `src/app.js` keeps building the rows (`inboxRows()`) and wires the switch.

**Tech Stack:** Static site, no build step, vanilla ES modules, Node `node:assert` tests, Python `http.server` for the smoke page.

**Spec:** `docs/specs/2026-10-15-won-quotes-redesign.md`

## Global Constraints

- No build step, no new dependencies. Plain ES modules, as the rest of `src/`.
- Colours only through existing CSS tokens; nothing hard-coded in `won.js`. No new colours.
- Do not use bare `.warn`, `.bad` or `.ok` classes on page elements (`.warn` is a global callout style). Age chips use `.chip`, `.chip.soon`, `.chip.late`.
- Escape every customer-supplied string (customer, number, contact/ref, SO) with `esc` before it reaches HTML — including inside card labels.
- The repo is public: made-up customer names only ("… Example Ltd") in fixtures and fake data.
- Run every test before each commit: `for t in tests/*.mjs; do node $t; done` — every line must end `ok`.
- After any change to `index.html`, rebuild the smoke page: `python3 dev/make-smoke.py`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only; do not push. Stay on branch `feature/won-quotes-redesign`.

---

### Task 1: Won quotes numbers (pure logic)

**Files:**
- Modify: `src/core/jobs.js` — add three exports directly after the `quoteStates` function (~line 182)
- Test: `tests/jobs.mjs` — new block at the end of the file

**Interfaces:**
- Consumes: existing in `src/core/jobs.js`: `weekStart(isoDate)`, `round2(n)`, and the module-private `plusDays(isoDate, n)` (a `const` defined near `dayNo`, ~line 211; safe to call at run time from a function defined earlier in the file).
- Produces:
  - `workingDaysSince(from: string|null, today: string) → number|null` — Mon–Fri days after `from` (its first 10 chars) up to and including `today`; `null` when `from` is empty.
  - `quoteAgeTone(days: number|null) → 'late'|'soon'|''` — `'late'` when > 5, `'soon'` when > 2, else `''`.
  - `wonQuotes(rows, today) → { waiting, made, gone, waitingValue, oldest, madeThisWeek, wonMonth, wonMonthValue }` where `rows` are the app's inbox rows (newest first) with at least `{ ref, date, net, state: 'waiting'|'job'|'dismissed', madeOn }`.
    - `waiting`: waiting rows each with an added `age` (`workingDaysSince(date, today)`), oldest first, undated last.
    - `made`: `state === 'job'` rows, input order (newest first). `gone`: `state === 'dismissed'` rows, input order.
    - `waitingValue`: sum of waiting `net` (missing counts 0), rounded to pence.
    - `oldest`: the first waiting row if it has an age, else `null`.
    - `madeThisWeek`: made rows with `madeOn` from `weekStart(today)` to `today`.
    - `wonMonth` / `wonMonthValue`: count / summed `net` of non-dismissed rows dated from the 1st of `today`'s month to `today`.

- [ ] **Step 1: Write the failing tests**

Append to the end of `tests/jobs.mjs`:

```js
// — Won quotes: ages in working days, flags, and the tab's lists and totals. —
{
  const { workingDaysSince, quoteAgeTone, wonQuotes } = await import('../src/core/jobs.js');
  const today = '2026-10-15';   // a Thursday
  assert.equal(workingDaysSince('2026-10-07', today), 6, 'Wed 7 → Thu 15 is six working days');
  assert.equal(workingDaysSince('2026-10-12', today), 3);
  assert.equal(workingDaysSince('2026-10-14', today), 1);
  assert.equal(workingDaysSince(today, today), 0, 'won today');
  assert.equal(workingDaysSince('2026-10-10', today), 4, 'won on a Saturday: Mon–Thu');
  assert.equal(workingDaysSince('2026-10-12T09:30:00Z', today), 3, 'a timestamp counts by its date');
  assert.equal(workingDaysSince(null, today), null);
  assert.deepEqual([0, 2, 3, 5, 6, null].map(quoteAgeTone), ['', '', 'soon', 'soon', 'late', '']);

  const rows = [   // newest first, as the app builds them
    { ref: 'Q1', date: '2026-10-14', net: 100, state: 'waiting' },
    { ref: 'Q3', date: '2026-10-13', net: 50, state: 'job', madeOn: '2026-10-14' },
    { ref: 'Q2', date: '2026-10-07', net: 200, state: 'waiting' },
    { ref: 'Q5', date: '2026-10-02', net: 999, state: 'dismissed' },
    { ref: 'Q4', date: '2026-09-30', net: 70, state: 'job', madeOn: '2026-10-09' },
    { ref: 'X1', date: null, net: null, state: 'waiting' },
  ];
  const w = wonQuotes(rows, today);
  assert.deepEqual(w.waiting.map(r => [r.ref, r.age]), [['Q2', 6], ['Q1', 1], ['X1', null]], 'oldest first, undated last');
  assert.deepEqual(w.made.map(r => r.ref), ['Q3', 'Q4'], 'newest first');
  assert.deepEqual(w.gone.map(r => r.ref), ['Q5']);
  assert.equal(w.waitingValue, 300, 'a missing value counts as nothing');
  assert.equal(w.oldest.ref, 'Q2'); assert.equal(w.oldest.age, 6);
  assert.equal(w.madeThisWeek, 1, 'made Wed 14 is this week; Fri 9 is not');
  assert.equal(w.wonMonth, 3, 'October, not marked not a job');
  assert.equal(w.wonMonthValue, 350);
  const none = wonQuotes([], today);
  assert.deepEqual([none.waiting, none.made, none.gone, none.oldest, none.madeThisWeek, none.wonMonth, none.wonMonthValue], [[], [], [], null, 0, 0, 0]);
  assert.equal(wonQuotes([{ ref: 'X', date: null, net: 5, state: 'waiting' }], today).oldest, null, 'no age, no oldest');
  console.log('jobs won quotes: ok');
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/jobs.mjs`
Expected: FAIL with `TypeError: workingDaysSince is not a function`.

- [ ] **Step 3: Implement**

In `src/core/jobs.js`, directly after the closing `}` of `export function quoteStates(...)`, add:

```js
/** Working days (Mon–Fri) after `from` up to and including `today`. null when there is no date. */
export function workingDaysSince(from, today) {
  if (!from) return null;
  let n = 0;
  for (let d = plusDays(from.slice(0, 10), 1); d <= today; d = plusDays(d, 1)) {
    const w = new Date(d + 'T12:00:00Z').getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** How a won quote's wait looks: red after 5 working days, amber after 2. */
export const quoteAgeTone = days => (days > 5 ? 'late' : days > 2 ? 'soon' : '');

/**
 * The Won quotes tab from the app's inbox rows (newest first; { ref, date, net, state, madeOn }).
 * Waiting oldest first (undated last); made and not-a-job keep the newest-first order.
 */
export function wonQuotes(rows, today) {
  const net = xs => round2(xs.reduce((a, r) => a + (r.net || 0), 0));
  const waiting = rows.filter(r => r.state === 'waiting').map(r => ({ ...r, age: workingDaysSince(r.date, today) }))
    .sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
  const made = rows.filter(r => r.state === 'job');
  const gone = rows.filter(r => r.state === 'dismissed');
  const wk = weekStart(today), monthStart = today.slice(0, 8) + '01';
  const month = rows.filter(r => r.state !== 'dismissed' && r.date && r.date.slice(0, 10) >= monthStart && r.date.slice(0, 10) <= today);
  return {
    waiting, made, gone,
    waitingValue: net(waiting),
    oldest: waiting[0] && waiting[0].age != null ? waiting[0] : null,
    madeThisWeek: made.filter(r => r.madeOn && r.madeOn >= wk && r.madeOn <= today).length,
    wonMonth: month.length,
    wonMonthValue: net(month),
  };
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `for t in tests/*.mjs; do node $t; done`
Expected: every line ends `ok`, including the new `jobs won quotes: ok`.

- [ ] **Step 5: Commit**

```bash
git add src/core/jobs.js tests/jobs.mjs
git commit -m "Won quotes: working-day ages, age flags, and the tab's lists and totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Draw the new Won quotes tab

**Files:**
- Create: `src/won.js`
- Modify: `src/home.js` (export the card helper, add a `quote` icon)
- Modify: `src/app.js` — import (~line 10), sign-in restore (~line 93), `inboxRows()` (~line 841), remove `inboxRow` + `inboxTable`, replace `renderQuotes()` (~line 872), click handler (~line 1302)
- Modify: `index.html` — `MODULES` list (~line 485) and the `/* home */` CSS block (~lines 290-327)
- Modify: `src/help.js` line ~30
- Modify: `dev/fake-data.js` (`orderedQuotes`)
- Regenerate: `dev/smoke.html`

**Interfaces:**
- Consumes (Task 1): `wonQuotes(rows, today)`, `quoteAgeTone(days)` from `src/core/jobs.js`.
- Consumes (existing click handlers in `src/app.js`, unchanged): `data-start` (spId), `data-fromxero` (xero id), `data-dismiss` (spId), `data-xdismiss` (xero id), `data-restore` (spId), `data-xrestore` (xero id), `data-open` (job id), `data-reloadquotes`, `data-neworder`.
- Produces:
  - `src/home.js`: `export const card = (tone, ic, shown, label, on) => string` with icons `late`, `soon`, `ready`, `book`, `quote`. `label` and `shown` are inserted as HTML — callers escape.
  - `src/won.js`: `export function renderWon({ rows, today, view, reading, error, converting }, { esc, fmt, gbp }) → string`. `view` is `'made'`, `'gone'`, or anything else for Waiting; `reading` true while quotes load; `error` the SharePoint error message or null; `converting` the spId whose lines are loading, or undefined.
  - New click attribute `data-wonview="waiting"|"made"|"gone"`, saved to `localStorage` key `clj.wonview`.

- [ ] **Step 1: Export the card helper from `src/home.js`**

a) In the `ICON` object, after the `book:` line, add:

```js
  quote: '<path d="M4 4h16v12H5l-1 4z"/><path d="M8 9h8M8 12h5"/>',
```

b) Directly after the line `const plural = (n, word) => …;` add:

```js
/** A summary card. It only takes its colour when there is something to see. label/shown are HTML: escape before passing. */
export const card = (tone, ic, shown, label, on) =>
  `<div class="hcard${on ? ' t-' + tone : ''}"><span class="ic">${icon(ic)}</span><div><b>${shown}</b><span>${label}</span></div></div>`;
```

c) Inside `renderHome`, delete the now-duplicate local definition (the comment line `// A card only takes its colour when there is something to see.` and the two-line `const card = …` below it). The calls `card('bad', …)` etc. stay as they are.

- [ ] **Step 2: Create `src/won.js`**

```js
/**
 * Won quotes: quotes Levi has marked Ordered (and Xero sales orders imported at changeover) waiting
 * to become sales orders, oldest first, with the ones already made and the ones marked not a job a
 * switch away. The lists, ages and totals come from wonQuotes() in core/jobs.js (tested); this file
 * only draws them, with Home's cards and table. h: the formatting helpers from app.js.
 */
import { wonQuotes, quoteAgeTone } from './core/jobs.js';
import { card } from './home.js';

const days = n => `${n} day${n === 1 ? '' : 's'}`;

export function renderWon({ rows, today, view, reading, error, converting }, h) {
  const { esc, fmt, gbp } = h;
  const w = wonQuotes(rows, today);
  const oldTone = w.oldest ? quoteAgeTone(w.oldest.age) : '';
  const cards = [
    card('warn', 'quote', w.waiting.length, w.waiting.length ? `Waiting · ${gbp(w.waitingValue)}` : 'Waiting', w.waiting.length > 0),
    card(oldTone === 'late' ? 'bad' : 'warn', 'late', w.oldest ? days(w.oldest.age) : '—',
      w.oldest ? `Oldest waiting · ${esc(w.oldest.customer)}` : 'Oldest waiting', oldTone !== ''),
    card('ok', 'ready', w.madeThisWeek, 'Made into orders this week', w.madeThisWeek > 0),
    card('info', 'book', gbp(w.wonMonthValue), `Won this month · ${w.wonMonth} quote${w.wonMonth === 1 ? '' : 's'}`, w.wonMonth > 0),
  ].join('');

  const who = r => `<b>${esc(r.customer)}</b><span class="ref mono">${esc(r.ref)} · ${r.kind === 'xero' ? 'Xero import' : 'quote'}</span>`;
  const won = r => `${r.date ? fmt(r.date) : '—'}${r.age != null ? ` <span class="chip ${quoteAgeTone(r.age)}">${days(r.age)}</span>` : ''}`;
  const act = r => {
    if (r.state === 'job') return `<button class="btn sm" type="button" data-open="${r.jobId}">Open ${esc(r.so)}</button>`;
    if (r.state === 'dismissed') return r.kind === 'xero'
      ? `<button class="btn sm" type="button" data-xrestore="${esc(r.xeroId)}">Put back</button>`
      : `<button class="btn sm" type="button" data-restore="${r.spId}">Put back</button>`;
    if (r.kind !== 'xero' && converting === r.spId) return '<span class="note">Reading the lines…</span>';
    const make = r.kind === 'xero' ? `data-fromxero="${esc(r.xeroId)}"` : `data-start="${r.spId}"`;
    const drop = r.kind === 'xero'
      ? `data-xdismiss="${esc(r.xeroId)}" title="Stop offering this sales order here. Xero is not changed."`
      : `data-dismiss="${r.spId}" title="Stop offering this quote here. The quote itself is not changed."`;
    return `<button class="btn sm pri" type="button" ${make}>Create sales order</button> <button class="btn sm" type="button" ${drop}>Not a job</button>`;
  };
  const row = r => `<tr><td>${who(r)}</td><td>${won(r)}</td><td>${esc(r.who || '')}</td>
    <td class="num">${r.net != null ? gbp(r.net, 2) : ''}</td><td class="act">${act(r)}</td></tr>`;

  const VIEWS = {
    waiting: { list: w.waiting, n: w.waiting.length, tab: 'Waiting', title: 'Waiting to become sales orders', sub: 'oldest first',
      empty: 'All clear — every won quote is a sales order.' },
    made: { list: w.made.slice(0, 20), n: w.made.length, tab: 'Made into orders', title: 'Made into orders', sub: 'latest 20',
      empty: 'No won quotes have been made into orders yet.' },
    gone: { list: w.gone, n: w.gone.length, tab: 'Not a job', title: 'Marked not a job', sub: 'the quotes themselves are unchanged',
      empty: 'Nothing marked not a job.' },
  };
  const v = VIEWS[view] ? view : 'waiting', V = VIEWS[v];
  const head = '<thead><tr><th>Customer</th><th>Won</th><th>Contact</th><th class="num">Value</th><th class="act"><span class="sr">Action</span></th></tr></thead>';
  const table = !reading && V.list.length
    ? `<div class="tbl-wrap"><table class="lines home">${head}<tbody>${V.list.map(row).join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${!reading && v === 'waiting' ? ' ok' : ''}">${reading ? 'Reading the quotes…' : V.empty}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-wonview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n}</em></button>`).join('')}</div>`;
  const err = error ? `<div class="err"><b>Could not read the quotes from SharePoint.</b> ${esc(error)} <button class="btn sm" type="button" data-reloadquotes>Try again</button></div>` : '';

  return `<div class="home">
    <div class="hhead"><div><h2>Won quotes</h2><p class="sub">Quotes Levi has marked Ordered in the quote calculator, and sales orders brought in from Xero</p></div>
      <div class="hbtns"><button class="btn" type="button" data-reloadquotes>Refresh</button><button class="btn pri" type="button" data-neworder>New order</button></div></div>
    ${err}
    <div class="hcards">${cards}</div>
    <section><div class="hsec-h"><h3>${V.title}</h3><span class="note">${V.sub}</span>${seg}</div>${table}</section>
  </div>`;
}
```

- [ ] **Step 3: Wire it into `src/app.js`**

a) Imports: directly after the line `import { renderHome } from './home.js';` add

```js
import { renderWon } from './won.js';
```

b) Sign-in restore: directly after the line

```js
  try { if (localStorage.getItem('clj.homeview') === 'out') S.homeView = 'out'; } catch { /* none kept */ }
```

add

```js
  try { const v = localStorage.getItem('clj.wonview'); if (v === 'made' || v === 'gone') S.wonView = v; } catch { /* none kept */ }
```

c) In `inboxRows()`, give each row the date its sales order was made. Change

```js
    who: q.contactName, net: q.sellTotal != null ? q.sellTotal + (q.carriage || 0) : null, state: q.state, so: q.so, jobId: q.jobId, spId: q.spId });
```

to

```js
    who: q.contactName, net: q.sellTotal != null ? q.sellTotal + (q.carriage || 0) : null, state: q.state, so: q.so, jobId: q.jobId, spId: q.spId,
    madeOn: q.jobId ? job(q.jobId)?.ordered : null });
```

and change

```js
      net: x.subTotal, state: j ? 'job' : x.dismissed ? 'dismissed' : 'waiting', so: j?.so, jobId: j?.id, xeroId: x.id });
```

to

```js
      net: x.subTotal, state: j ? 'job' : x.dismissed ? 'dismissed' : 'waiting', so: j?.so, jobId: j?.id, xeroId: x.id, madeOn: j?.ordered });
```

d) Delete the whole `function inboxRow(r) { … }` and `function inboxTable(rows, empty) { … }` (they sit between `inboxRows()` and `renderQuotes()`; nothing else calls them — confirm with `grep -n "inboxRow(\|inboxTable(" src/*.js` returning nothing after the deletion).

e) Replace the whole `function renderQuotes() { … }` with:

```js
function renderQuotes() {
  $('v-quotes').innerHTML = renderWon({ rows: inboxRows(), today: todayIso(), view: S.wonView, reading: !S.quotesRaw && !S.quotesErr,
    error: S.quotesErr, converting: S.conv?.spId }, { esc, fmt, gbp });
}
```

f) Click handler: directly after the line beginning `  if (d.homeview) {`, add

```js
  if (d.wonview) { S.wonView = d.wonview; try { localStorage.setItem('clj.wonview', d.wonview); } catch { /* not kept */ } return render(); }
```

- [ ] **Step 4: `index.html` — module list and shared styles**

a) In `var MODULES = [...]`, add `'src/won.js'` after `'src/map.js'`:

```js
  var MODULES = ['src/app.js', 'src/auth.js', 'src/config.js', 'src/data.js', 'src/help.js', 'src/home.js', 'src/map.js', 'src/won.js', 'src/core/geo.js', 'src/core/jobs.js', 'src/core/preview.js', 'src/core/quotes.js', 'src/core/xero.js'];
```

b) Make Home's styles apply to Won quotes too: in the `/* home */` block only (from the line `/* home */` down to the last line starting `@media (max-width:560px){ #v-home` before `/* help */`), replace every `#v-home` with `:is(#v-home,#v-quotes)`. Run exactly:

```bash
python3 - <<'EOF'
from pathlib import Path
p = Path('index.html'); s = p.read_text()
a = s.index('/* home */'); b = s.index('/* help */', a)
p.write_text(s[:a] + s[a:b].replace('#v-home', ':is(#v-home,#v-quotes)') + s[b:])
EOF
```

Then check: `grep -c '#v-home' index.html` should print the count of `#v-home` uses outside that block (it may be 0), and `grep -c ':is(#v-home,#v-quotes)' index.html` should be > 30.

- [ ] **Step 5: Help text (`src/help.js`)**

In the line containing `Within a minute the quote appears on <b>Won quotes</b>, newest first.`, change `newest first.` to `with the one waiting longest at the top. It turns amber after 2 working days and red after 5.`

- [ ] **Step 6: Smoke data (`dev/fake-data.js`)**

Replace the whole `export const orderedQuotes = async () => [ … ];` statement (two quote objects today) with:

```js
export const orderedQuotes = async () => [
  { spId: 301, quoteNo: 'Q-0301', customer: 'Example Customer Ltd', status: 'Ordered', carriage: 0, sellTotal: 393, deliveryDays: 10, quoteDate: '2026-10-13' },
  { spId: 303, quoteNo: 'Q-0303', customer: 'Third Example Ltd', status: 'Ordered', carriage: 12.5, sellTotal: 290.25, deliveryDays: 0, quoteDate: '2026-10-12' },
  { spId: 305, quoteNo: 'Q-0305', customer: 'Ninth Example Ltd', contactName: 'Sam Buyer', status: 'Ordered', carriage: 0, sellTotal: 210, deliveryDays: 10, quoteDate: '2026-10-07' },
  { spId: 306, quoteNo: 'Q-0306', customer: 'Tenth Example Ltd', contactName: 'A Buyer', status: 'Ordered', carriage: 0, sellTotal: 1994, deliveryDays: 15, quoteDate: '2026-10-14' }];
```

- [ ] **Step 7: Rebuild the smoke page and run all tests**

```bash
python3 dev/make-smoke.py
for t in tests/*.mjs; do node $t; done
```

Expected: every line ends `ok` (`site: ok` confirms `src/won.js` is in `MODULES`).

- [ ] **Step 8: Headless render check (do not start a server)**

Write a throwaway script in your scratchpad (not committed) that imports `src/won.js`, builds rows like those `inboxRows()` makes (a waiting quote 6 working days old, one 3 days, one 1 day, a Xero import, a made one with `madeOn` this week, a dismissed one) and calls `renderWon({ rows, today: '2026-10-15', view, reading: false, error: null, converting: undefined }, { esc, fmt, gbp })` for `view` = `undefined`, `'made'`, `'gone'`, plus once with `rows: []` and once with `reading: true`, using simple `esc/fmt/gbp` stand-ins. Check: the waiting view has `chip late`, `chip soon` and a plain `chip`, `data-start` and `data-dismiss` buttons, and `data-fromxero` / `data-xdismiss` for the Xero row; `made` shows `Open SO-`; `gone` shows `Put back`; empty shows "All clear"; reading shows "Reading the quotes…"; a customer name containing `<b>` comes out escaped in both the row and the Oldest card.

- [ ] **Step 9: Commit**

```bash
git add src/won.js src/home.js src/app.js src/help.js index.html dev/fake-data.js dev/smoke.html
git commit -m "Won quotes: summary cards and one table switching Waiting / Made into orders / Not a job, oldest first with age flags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
