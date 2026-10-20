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
export const PROCESSES = ['Laser', 'Fold', 'Cut & Drill', 'Tap & C/Sink', 'Insert', 'Weld',
  'P/Coat Paint', 'Plating / Anodising', 'Rolling'];

export const SHORT = { 'Laser': 'Laser', 'Fold': 'Fold', 'Cut & Drill': 'Cut & drill', 'Tap & C/Sink': 'Tap & C/Sink',
  'Insert': 'Insert', 'Weld': 'Weld', 'P/Coat Paint': 'P/Coat',
  'Plating / Anodising': 'Plating', 'Rolling': 'Rolling' };

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
 * Processes to pre-tick from the quote lines (Mandy checks them). Tap & C/Sink is
 * not in the quote data, so they are never suggested.
 * line: { process, folds, weld, inserts, paint, plating, holes }
 */
export function suggestProcesses(lines) {
  const s = new Set();
  for (const l of lines) {
    if (/laser/i.test(l.process || '') || !l.process) s.add('Laser');
    if (l.folds > 0) s.add('Fold');
    if (l.holes > 0) s.add('Cut & Drill');
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
  // ponytail: bank holidays and shutdowns count as working days; add a holiday list if Christmas flags annoy.
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
    .sort((a, b) => (!a.date) - (!b.date) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const made = rows.filter(r => r.state === 'job');
  const gone = rows.filter(r => r.state === 'dismissed');
  const wk = weekStart(today), monthStart = today.slice(0, 8) + '01';
  const month = rows.filter(r => r.state !== 'dismissed' && r.date && r.date.slice(0, 10) >= monthStart && r.date.slice(0, 10) <= today);
  const madeWeek = made.filter(r => r.madeOn && r.madeOn >= wk && r.madeOn <= today);
  const age = r => (r.state === 'waiting' ? { ...r, age: workingDaysSince(r.date, today) } : r);
  return {
    waiting, made, gone,
    waitingValue: net(waiting),
    oldest: waiting[0] && waiting[0].age != null ? waiting[0] : null,
    madeWeek, madeThisWeek: madeWeek.length,
    month: month.map(age), wonMonth: month.length,
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

/** The next process a job needs, in Levi's order, or null when all are done. */
export const nextStep = job => needed(job).find(p => !job.procs[p].done) || null;

/** Quantity still to make per distinct part (first-seen order) and how much of it is due by the next delivery. */
export function partsLeft(job) {
  const by = new Map(), nd = nextDue(job);
  for (const l of job.lines) { const r = by.get(l.part) || { part: l.part, left: 0, next: 0 }; r.left += left(job, l); if (l.due <= nd) r.next += left(job, l); by.set(l.part, r); }
  return [...by.values()].filter(r => r.left > 0);
}

/** Shop floor: open jobs (not started or in progress, held included) in the running order; for a
 *  station, only those that still need it. */
export function floorQueue(jobs, station) {
  const open = jobs.filter(j => ['upcoming', 'current'].includes(stage(j))).sort(byRunningOrder);
  if (station === 'all') return open;
  // A station's own order (Levi, 20 Oct): jobs placed there first, by place; the rest in the running order.
  const at = j => j.procs[station].place ?? Infinity;
  return open.filter(j => j.procs[station] && !j.procs[station].done).sort((a, b) => (at(a) === at(b) ? 0 : at(a) - at(b)));
}
/** Moves a job within one station's queue (list = floorQueue for that station) to index `to`;
 *  returns the ids that must hold a place there, as moveInOrder does for the running order. */
export const moveInStation = (list, station, id, to) =>
  moveInOrder(list.map(j => ({ id: j.id, priority: j.procs[station]?.place ?? null })), id, to);

/** Shop floor tiles: per station, how many jobs wait for it and how many of those are late. */
export function floorStations(jobs, today) {
  return PROCESSES.map(p => {
    const q = floorQueue(jobs, p);
    return { p, waiting: q.length, late: q.filter(j => nextDue(j) && nextDue(j) < today).length };
  });
}

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

export const dayNo = s => Math.round(new Date(s.slice(0, 10) + 'T12:00:00Z') / 864e5);
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
 * This month against Levi's target (net £): what has been dispatched since the 1st (cancelled notes
 * left out) and what is still to send on lines due by the month end (late lines included). Values are
 * null when prices are not loaded (the shop floor).
 */
/**
 * Xero's sales this month that the board did not raise (xero: rows from the xero function's month
 * read: { id, reference, date, net }). The board's own invoices are left out by their ID on a dispatch
 * note and by the DN- number in their reference, so nothing is counted twice; credit notes come in
 * with a minus net. Returns { value, invoices } or null when Xero was not read.
 */
export function xeroOutsideBoard(jobs, xero, start, end) {
  if (!xero) return null;
  const ours = new Set(jobs.flatMap(j => j.despatches.map(d => d.xero?.id).filter(Boolean)));
  const list = xero.filter(x => x.date >= start && x.date <= end && !ours.has(x.id) && !/\bDN-\d+/i.test(x.reference || ''));
  return { value: round2(list.reduce((a, x) => a + (Number(x.net) || 0), 0)), invoices: list };
}

export function monthProgress(jobs, today, xero = null) {
  const start = today.slice(0, 7) + '-01';
  const [y, m] = today.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const money = jobs.every(j => j.lines.every(l => l.price != null));
  const live = jobs.filter(j => j.status !== 'cancelled');
  const dispatched = live.reduce((a, j) => a + j.despatches.filter(d => d.date >= start && d.date <= today).reduce((b, d) => b + despatchValue(j, d), 0), 0);
  const dueByEnd = live.filter(j => ['upcoming', 'current'].includes(stage(j)))
    .reduce((a, j) => a + j.lines.filter(l => l.due && l.due <= end).reduce((b, l) => b + left(j, l) * l.price, 0), 0);
  // Work on order but due after this month (or with no date): what could be brought forward to close a gap.
  const dueLater = live.filter(j => ['upcoming', 'current'].includes(stage(j)))
    .reduce((a, j) => a + j.lines.filter(l => !l.due || l.due > end).reduce((b, l) => b + left(j, l) * l.price, 0), 0);
  // Pace: working days (Mon–Fri) gone, today included, out of the month's working days.
  const wd = (from, to) => { let n = 0; for (let d = new Date(from + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) n++; return n; };
  const pace = wd(start, today) / Math.max(1, wd(start, end));
  // Sales invoiced in Xero outside the board this month (before changeover, or raised there by hand) count as done.
  const outside = xeroOutsideBoard(live, xero, start, today);
  const fromXero = outside ? outside.value : 0;
  return { start, end, pace, dispatched: money ? round2(dispatched + fromXero) : null, dueByEnd: money ? round2(dueByEnd) : null, dueLater: money ? round2(dueLater) : null,
    onBoard: money ? round2(dispatched) : null, fromXero, xeroCount: outside ? outside.invoices.length : 0, xeroRead: !!outside };
}

/** Xero invoice IDs the board should ask Xero about: every note sent to Xero, less those already known
 *  to be approved, paid or voided (settled: a Set of IDs). */
export const invoiceIdsToCheck = (jobs, settled = new Set()) =>
  [...new Set(jobs.flatMap(j => j.despatches.map(d => d.xero?.id).filter(Boolean)))].filter(id => !settled.has(id));
/** Xero statuses that are final: once seen, the board never asks about that invoice again. */
export const SETTLED = ['AUTHORISED', 'PAID', 'VOIDED', 'DELETED'];

/**
 * Dispatch notes sent to Xero whose draft invoice is still waiting to be approved there (DRAFT, or
 * SUBMITTED "awaiting approval"), oldest first. statuses: Map invoiceId → { status, number } from Xero;
 * a note Xero has not answered for is left out rather than guessed. value is null without prices.
 */
export function awaitingApproval(jobs, statuses) {
  const list = jobs.flatMap(j => j.despatches.map(d => ({ job: j, d, x: d.xero?.id && statuses.get(d.xero.id) })))
    .filter(r => r.x && ['DRAFT', 'SUBMITTED'].includes(r.x.status))
    .map(r => ({ job: r.job, d: r.d, status: r.x.status, number: r.x.number || r.d.xero.no || '' }))
    .sort((a, b) => String(a.d.xero.at || '').localeCompare(String(b.d.xero.at || '')));
  const money = list.every(r => r.job.lines.every(l => l.price != null));
  return { list, value: money ? round2(list.reduce((a, r) => a + despatchValue(r.job, r.d), 0)) : null };
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

/**
 * What the order form's Part box offers: parts this customer has ordered on the board (latest price
 * first), then parts other customers have ordered, then Xero's Products and services not already
 * listed. Text matching ignores case and spacing. jobs: the app's jobs (with prices for the office);
 * items: [{ code, description, price }] from Xero (may be empty).
 */
export function partSuggestions(jobs, items, customer) {
  const key = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cust = key(customer), seen = new Map();
  const lines = jobs.flatMap(j => j.lines.map(l => ({ part: l.part, price: l.price, so: j.so, date: j.ordered || '', mine: key(j.customer) === cust })))
    .filter(l => l.part && l.part.trim())
    .sort((a, b) => (b.mine - a.mine) || (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
  for (const l of lines) {
    const k = key(l.part); if (seen.has(k)) continue;
    seen.set(k, { part: l.part.trim(), price: l.price, from: l.mine ? 'customer' : 'board', so: l.so, date: l.date });
  }
  for (const i of items || []) {
    const k = key(i.description); if (!k || seen.has(k)) continue;
    seen.set(k, { part: i.description.trim(), price: i.price, from: 'xero', code: i.code || '' });
  }
  return [...seen.values()];
}

/**
 * Earlier purchase orders worth copying for a job (Philip, 20 Oct: "copy a previous PO with supplier and
 * same parts"). pos: [{ id, jobId, lines: [{ description }], at }]; jobs: every job. Groups, newest first:
 * samePart (the earlier job had one of this job's parts, or a PO line names one), sameCustomer, other.
 * The job's own POs are included (a second batch of the same order is the commonest repeat).
 */
export function poSuggestions(job, jobs, pos) {
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const parts = new Set(job.lines.map(l => norm(l.part)).filter(p => p.length >= 3));
  const byId = new Map(jobs.map(j => [j.id, j]));
  const cust = norm(job.customer);
  const out = { samePart: [], sameCustomer: [], other: [] };
  for (const p of [...pos].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id))) {
    const from = byId.get(p.jobId);
    const hit = (from && from.lines.some(l => parts.has(norm(l.part))))
      || p.lines.some(l => { const d = norm(l.description); return [...parts].some(x => d.includes(x)); });
    (hit ? out.samePart : from && norm(from.customer) === cust ? out.sameCustomer : out.other).push({ ...p, so: from?.so || '', customer: from?.customer || '' });
  }
  return out;
}

/**
 * Back-to-back PO lines for a job: one per part still to send (description = part, qty = left), each
 * costed from the newest earlier PO line that names that part. supplierId/account come from those POs
 * when they all agree; delivery = the earliest due date still open. pos as loadPurchaseOrders().
 */
export function backToBackLines(job, pos) {
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const newest = [...pos].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
  const open = job.lines.map(l => ({ l, left: left(job, l) })).filter(x => x.left > 0);
  const use = open.length ? open : job.lines.map(l => ({ l, left: l.qty }));
  const from = [];
  const lines = use.map(({ l, left: qty }) => {
    const part = norm(l.part);
    for (const p of newest) {
      const hit = part.length >= 3 && p.lines.find(x => { const d = norm(x.description); return d === part || d.includes(part); });
      if (hit) { from.push(p); return { description: l.part, qty, unit: Number(hit.unit) }; }
    }
    return { description: l.part, qty, unit: null };
  });
  const one = (k) => { const v = [...new Set(from.map(p => p[k] ?? ''))]; return from.length && v.length === 1 ? v[0] : null; };
  const dues = use.map(x => x.l.due).filter(Boolean).sort();
  return { lines, supplierId: one('supplierId'), account: one('account'), delivery: dues[0] || '', costed: lines.filter(l => l.unit != null).length };
}
