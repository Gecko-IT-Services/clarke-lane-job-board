/**
 * Pure job logic: no window, no network, so it runs under Node in tests/jobs.mjs.
 *
 * A job, as the app holds it:
 * { id, so, quote, spQuoteId, customer, contactName, contactEmail, po, ordered, due, notes,
 *   address, status: 'open' | 'held' | 'cancelled',
 *   lines: [{ id, lineNo, part, qty, price, due }],       price is null for the floor role;
 *                                                          each line has its own due date (Sage)
 *   procs: { 'Laser': { done, by, at }, … },               only the processes the job needs
 *   despatches: [{ id, dn, date, by, lines: { [lineId]: qty }, xero: { no, at } | null }] }
 */

// Levi's nine, in the order of his Jobs List.
export const PROCESSES = ['Laser', 'Fold', 'Roll Drill', 'Tap', 'Insert', 'C/Sink', 'Weld',
  'P/Coat Paint', 'Plating / Anodising'];

export const SHORT = { 'Laser': 'Laser', 'Fold': 'Fold', 'Roll Drill': 'Roll drill', 'Tap': 'Tap',
  'Insert': 'Insert', 'C/Sink': 'C/Sink', 'Weld': 'Weld', 'P/Coat Paint': 'P/Coat',
  'Plating / Anodising': 'Plating' };

export const sent = (job, line) => job.despatches.reduce((a, d) => a + (d.lines[line.id] || 0), 0);
export const left = (job, line) => Math.max(0, line.qty - sent(job, line));
export const needed = job => PROCESSES.filter(p => job.procs[p]);
export const doneCount = job => needed(job).filter(p => job.procs[p].done).length;
export const allDone = job => needed(job).every(p => job.procs[p].done);

/** Net value of the whole order, or of what is still to send. null when prices are hidden. */
export function value(job, { remaining = false } = {}) {
  if (job.lines.some(l => l.price == null)) return null;
  return round2(job.lines.reduce((a, l) => a + round2((remaining ? left(job, l) : l.qty) * l.price), 0));
}
export const despatchValue = (job, d) =>
  job.lines.some(l => l.price == null) ? null
    : round2(job.lines.reduce((a, l) => a + round2((d.lines[l.id] || 0) * l.price), 0));

/** upcoming: nothing ticked or sent · current: something ticked or part sent · completed: all sent.
 *  Cancelled orders are off the board altogether (they stay in the Sales orders list). */
export function stage(job) {
  if (job.status === 'cancelled') return 'cancelled';
  if (job.lines.every(l => left(job, l) === 0)) return 'completed';
  return (doneCount(job) || job.despatches.length) ? 'current' : 'upcoming';
}

/** The date that matters next: the earliest due date of a line not yet fully despatched. */
export function nextDue(job) {
  const open = job.lines.filter(l => left(job, l) > 0).map(l => l.due).sort();
  return open[0] || job.lines.map(l => l.due).sort().pop() || job.due;
}

/** The order's delivery dates (one per distinct line due date), earliest first. */
export const deliveryDates = job => [...new Set(job.lines.map(l => l.due))].sort();

/** "Delivery 2 of 5" for an order delivered on several dates; '' for a single delivery. */
export function deliveryLabel(job) {
  const dates = deliveryDates(job);
  if (dates.length < 2) return '';
  const i = Math.max(0, dates.indexOf(nextDue(job)));
  return `Delivery ${i + 1} of ${dates.length}`;
}

/** Sage's despatch status for the order. */
export function despatchStatus(job) {
  const sentAny = job.lines.some(l => sent(job, l) > 0);
  if (job.lines.every(l => left(job, l) === 0)) return 'Dispatched';
  return sentAny ? 'Part dispatched' : 'Not dispatched';
}

/** Sage's invoice status: by despatch, since only what went out is invoiced. */
export function invoiceStatus(job) {
  const ds = job.despatches;
  if (!ds.length || ds.every(d => !d.xero)) return 'Not invoiced';
  return ds.every(d => d.xero) && despatchStatus(job) === 'Dispatched' ? 'Invoiced' : 'Part invoiced';
}

export const lastDespatch = job => job.despatches.length ? job.despatches[job.despatches.length - 1].date : '';

/** Call-off dates from the first date: every 7 or 14 days, or monthly ('m'). */
export function calloffDates(first, count, every) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(first + 'T12:00:00Z');
    if (every === 'm') d.setUTCMonth(d.getUTCMonth() + i);
    else d.setUTCDate(d.getUTCDate() + i * Number(every));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Default quantity for the next despatch: everything outstanding on lines due by the next
 *  delivery date; later deliveries stay at 0 until their turn (Mandy can still change it). */
export function defaultDespatchQty(job, line) {
  const l = left(job, line);
  return l > 0 && line.due <= nextDue(job) ? l : 0;
}

/**
 * Split lines into call-offs the Sage way: each line becomes one line per delivery date,
 * the quantity shared as evenly as whole numbers allow (any remainder on the earliest).
 * lines: [{ part, qty, price, ... }] → [{ ...line, qty, due }]
 */
export function splitIntoCalloffs(lines, dates) {
  const out = [];
  for (const l of lines) {
    const q = Number(l.qty) || 0, n = dates.length, base = Math.floor(q / n), extra = q - base * n;
    dates.forEach((due, i) => {
      const qty = base + (i < extra ? 1 : 0);
      if (qty > 0) out.push({ ...l, qty, due });
    });
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * Processes to pre-tick from the quote lines (Mandy checks them). Tap and C/Sink are
 * not in the quote data, so they are never suggested.
 * line: { process, folds, weld, inserts, paint, plating, holes }
 */
export function suggestProcesses(lines) {
  const s = new Set();
  for (const l of lines) {
    if (/laser/i.test(l.process || '') || !l.process) s.add('Laser');
    if (l.folds > 0) s.add('Fold');
    if (l.holes > 0) s.add('Roll Drill');
    if (l.inserts > 0) s.add('Insert');
    if (l.weld > 0) s.add('Weld');
    if (l.paint) s.add('P/Coat Paint');
    if (l.plating > 0) s.add('Plating / Anodising');
  }
  return PROCESSES.filter(p => s.has(p));
}

/** The part name a job line carries, built the way Levi's app describes a line. */
export function describeLine(l) {
  const desc = String(l.desc || '').trim() || 'Part';
  const spec = [l.thickness ? `${l.thickness}mm` : '', l.material || ''].filter(Boolean).join(' ');
  return spec ? `${desc} — ${spec}` : desc;
}

/** Unit price from the quote line's sell total, to 6dp (the column's precision), so qty × unit
 *  gives back the quoted total to the penny. */
export const unitPrice = (sellTotal, qty) => qty > 0 ? Math.round((sellTotal / qty) * 1e6) / 1e6 : 0;

export const round2 = n => Math.round(n * 100) / 100;

/** A date n working days (Mon–Fri) after `from`. The quote calculator's DeliveryDays are working days. */
export function addWorkingDays(from, n) {
  const d = new Date(from + 'T12:00:00Z');
  let left = Math.max(0, Math.round(n));
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

/**
 * Lines for a repeat of an order: same parts, quantities and prices, with every due date moved
 * by the same number of days so the first lands on `firstDue` (a call-off schedule keeps its
 * spacing). Returns [{ part, qty, price, due }] with qty/price as strings for the form.
 */
export function repeatLines(lines, firstDue) {
  const days = s => Math.round(new Date(s + 'T12:00:00Z') / 864e5);
  const start = Math.min(...lines.map(l => days(l.due)));
  const shift = days(firstDue) - start;
  return [...lines].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.lineNo - b.lineNo)).map(l => {
    const d = new Date(l.due + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + shift);
    return { part: l.part, qty: String(l.qty), price: l.price == null ? '' : String(l.price), due: d.toISOString().slice(0, 10) };
  });
}

/**
 * Where each Ordered quote stands, worked out fresh from the jobs and the dismissals every
 * time (so a job created or cancelled on another screen shows straight away).
 * Returns the quotes with { state: 'waiting' | 'job' | 'dismissed', jobId, so }.
 */
export function quoteStates(quotes, jobs, dismissedIds) {
  const bySp = new Map(jobs.filter(j => j.spQuoteId).map(j => [j.spQuoteId, j]));
  const gone = new Set(dismissedIds);
  return quotes.map(q => {
    const j = bySp.get(q.spId);
    if (j) return { ...q, state: 'job', jobId: j.id, so: j.so };
    return { ...q, state: gone.has(q.spId) ? 'dismissed' : 'waiting', jobId: null, so: null };
  });
}

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

/** Running order: jobs given a place (priority 1 = top) first, in that order; the rest by due date. */
export function byRunningOrder(a, b) {
  const pa = a.priority ?? Infinity, pb = b.priority ?? Infinity;
  if (pa !== pb) return pa - pb;
  const da = nextDue(a) || '9999', db = nextDue(b) || '9999';
  return da < db ? -1 : da > db ? 1 : (a.so < b.so ? -1 : 1);
}
/** Moves one job within the running order (list = jobs already in running order) to index `to`.
 *  Returns the ids that must hold a place: everything down to the lower of where it was and where
 *  it went, so jobs below that point stay in plain date order. */
export function moveInOrder(list, id, to) {
  const ids = list.map(j => j.id);
  const from = ids.indexOf(id); if (from < 0) return null;
  to = Math.max(0, Math.min(ids.length - 1, to));
  ids.splice(from, 1); ids.splice(to, 0, id);
  const lastPinned = list.reduce((m, j, i) => (j.priority != null ? i : m), -1);
  return ids.slice(0, Math.max(from, to, lastPinned) + 1);
}

/** Column sorting for the office tables: empty values always last, numbers as numbers, text ignoring case. */
export function compareValues(a, b, dir = 1) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' }) * dir;
}

const dayNo = s => Math.round(new Date(s.slice(0, 10) + 'T12:00:00Z') / 864e5);
const plusDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Monday of the week containing `today` (YYYY-MM-DD). */
export function weekStart(today) {
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
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
