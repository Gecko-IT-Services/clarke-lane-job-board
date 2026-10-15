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
  if (job.lines.every(l => left(job, l) === 0)) return 'Despatched';
  return sentAny ? 'Part despatched' : 'Not despatched';
}

/** Sage's invoice status: by despatch, since only what went out is invoiced. */
export function invoiceStatus(job) {
  const ds = job.despatches;
  if (!ds.length || ds.every(d => !d.xero)) return 'Not invoiced';
  return ds.every(d => d.xero) && despatchStatus(job) === 'Despatched' ? 'Invoiced' : 'Part invoiced';
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
