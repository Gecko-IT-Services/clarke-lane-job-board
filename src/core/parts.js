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

/** Does a line's text name this part number (as a whole token, ignoring case and spacing)? */
export function namesPart(text, partNo) {
  const want = normPartNo(partNo); if (want.length < 3) return false;
  const esc = want.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${esc}($|[^A-Z0-9])`).test(normPartNo(text));
}

/** The customer's library parts named on any of a job's lines. */
export function partsOnJob(parts, job) {
  const key = normName(job.customer);
  return (parts || []).filter(p => p.customerKey === key && job.lines.some(l => namesPart(l.part, p.partNo)));
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
  (jobs || []).filter(j => normName(j.customer) === part.customerKey && j.lines.some(l => namesPart(l.part, part.partNo)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id - a.id);
