/**
 * Parts library (Philip, 20 Oct): a customer's part number and its drawings, so a repeat part's drawing
 * comes onto each new order by itself. Matching is by part number within the same customer, because two
 * customers can use the same number. Pure: tested in tests/parts.mjs.
 * part: { id, customer, customerKey, partNo, description, files: [{ id, name, driveId, itemId, at }] }
 */
import { normName } from './xero.js';

/** "ul-pr 10448" and "UL-PR-10448" are the same part number. */
export const normPartNo = s => String(s || '').toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** The drawing new orders get: the newest. */
export const currentFile = part => [...(part.files || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '') || b.id - a.id)[0] || null;

/** Does a line's text name this part number? As a whole word of the text, ignoring case, spacing and
 *  surrounding punctuation: "10448" is not named by "UL-PR-10448", nor "ABC-100" by "ABC-100-2". */
export function namesPart(text, partNo) {
  const want = normPartNo(partNo); if (want.length < 3) return false;
  const pat = want.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/-/g, '[- ]');   // the number's own dashes may be spaces in the text
  const t = String(text || '').toUpperCase().replace(/[\s_]+/g, ' ').replace(/-+/g, '-');
  return new RegExp(`(^|[^A-Z0-9-])${pat}($|[^A-Z0-9-])`).test(t);
}

/**
 * Does an order line name this part number? Its Part no. box first (Mandy, 22 Oct: a box of its own, like Xero
 * and Sage): when filled, that is the line's part number and nothing in the description is guessed at. Lines
 * without one (all of them before 22 Oct) are matched by their text, as before.
 */
const boxNo = l => String(l?.partNo ?? l?.part_no ?? '').trim();
export function lineNamesPart(l, partNo) {
  const no = boxNo(l);
  if (!no) return namesPart(l.part, partNo);
  const want = normPartNo(partNo);
  return want.length > 0 && normPartNo(no) === want;
}
/** The part numbers an order line carries: its Part no. box, else those spotted in its text (partNumbersIn). */
export const lineNumbers = l => boxNo(l) ? [boxNo(l)] : partNumbersIn(l.part);

/** The customer's library parts named on any of a job's lines. */
export function partsOnJob(parts, job) {
  const key = normName(job.customer);
  return (parts || []).filter(p => p.customerKey === key && job.lines.some(l => lineNamesPart(l, p.partNo)));
}

/**
 * Part drawings to link to a job: each named part's current drawing, unless the job already has that
 * SharePoint file. Returns [{ part, file }].
 */
export function drawingsToLink(parts, job) {
  const have = new Set((job.files || []).map(f => f.itemId));
  return partsOnJob(parts, job).map(part => ({ part, file: currentFile(part) })).filter(x => x.file && !have.has(x.file.itemId));
}

/** The library part for a customer and part number, or null. */
export const findPart = (parts, customer, partNo) =>
  (parts || []).find(p => p.customerKey === normName(customer) && normPartNo(p.partNo) === normPartNo(partNo)) || null;

/** Orders a part has been on, newest first. */
export const ordersForPart = (jobs, part) =>
  (jobs || []).filter(j => normName(j.customer) === part.customerKey && j.lines.some(l => lineNamesPart(l, part.partNo)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id - a.id);

/**
 * Things in a line's text that look like part numbers: a run of letters, digits and - / . with at least one
 * digit and either a letter-and-digit mix with a separator (UL-PR-10448, 3/SP1006/30065) or 6+ digits
 * (361200245). Sizes, threads, colours and quantities (2.5mm, M8, RAL9005, x40, 300N) are not part numbers.
 */
const NOT_PART = /^(?:\d+(?:\.\d+)?(?:MM|CM|M|KG|G|N|NM|DEG|°)|M\d+(?:X[\d.]+)?|RAL-?\d{4}|X\d+|\d+X\d+(?:X\d+)?|SO-?\d+|PO-?\d+|DN-?\d+|PF-?\d+|INV-?\d+|Q-?\d+|\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|REV-?\w{1,3}|ISS-?\w{1,3}|S\d{3}(?:JR|J0|J2|MC)?|DC0\d|DX5\dD?|CR\d|HR\d|EN\d{1,3}[A-Z]?|AISI-?\d{3}L?|\d{4}-[HT]\d{1,2}|[HT]\d{1,2}|GR-?\d+)$/;   // material grades, not parts
export function partNumbersIn(text) {
  const out = [];
  for (const raw of String(text || '').toUpperCase().match(/[A-Z0-9][A-Z0-9\-/.]*[A-Z0-9]/g) || []) {
    const t = raw.replace(/\.$/, '');
    if (t.length < 4 || !/\d/.test(t) || NOT_PART.test(t)) continue;
    const mixed = /[A-Z]/.test(t) && /[-/]/.test(t) && /\d{2,}/.test(t);
    const longDigits = /^\d{6,}$/.test(t.replace(/[-/.]/g, '')) && !/[.]/.test(t);
    const code = /^[A-Z]{1,4}\d{3,}[A-Z]?$/.test(t);   // e.g. BRK7731, AB12345
    if (mixed || longDigits || code) out.push(t);
  }
  return [...new Set(out)];
}

/**
 * Part numbers on the board's orders that are not in Parts yet, per customer, most-ordered first:
 * [{ customer, customerKey, partNo, description, orders: [job] }]. A line with its Part no. box filled gives that
 * number and its Description box; one without gives the numbers in its text, description = the text without it.
 */
export function suggestedParts(jobs, parts) {
  const by = new Map();
  for (const j of jobs || []) {
    if (j.status === 'cancelled' || j.preview) continue;
    const key = normName(j.customer);
    for (const l of j.lines) for (const no of lineNumbers(l)) {
      if (findPart(parts, j.customer, no)) continue;
      const k = key + '|' + normPartNo(no);
      const s = by.get(k) || { customer: j.customer, customerKey: key, partNo: no, description: '', orders: [] };
      if (!s.orders.includes(j)) s.orders.push(j);
      if (!s.description) s.description = boxNo(l) ? String(l.part || '').trim() : l.part.replace(new RegExp(no.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i'), '').replace(/\s{2,}/g, ' ').replace(/^[\s,:\-–]+|[\s,:\-–]+$/g, '');
      by.set(k, s);
    }
  }
  return [...by.values()].sort((a, b) => b.orders.length - a.orders.length || a.customer.localeCompare(b.customer) || a.partNo.localeCompare(b.partNo));
}

/** Open orders (not cancelled, something still to send) that name a part and do not have its current drawing. */
export function openOrdersNeeding(jobs, part, isOpen) {
  const f = currentFile(part); if (!f) return [];
  return (jobs || []).filter(j => isOpen(j) && normName(j.customer) === part.customerKey && j.lines.some(l => lineNamesPart(l, part.partNo))
    && !(j.files || []).some(x => x.itemId === f.itemId));
}
