/**
 * The driver's screen (Philip, 22 Oct): what is out for delivery, and what was delivered today. Pure: no window,
 * no network, so it runs under Node in tests/deliveries.mjs. Never prices: the driver sees parts and quantities only.
 */
import { dispatchPo } from './xero.js';

/** Biggest signature the board keeps (characters of the data URL); the database refuses anything over 80,000. */
export const SIGNATURE_MAX = 80000;
const PNG = 'data:image/png;base64,';

/** The address as its lines, blank lines and stray commas trimmed. */
export const addressLines = address => String(address || '').split(/\r?\n/).map(s => s.trim().replace(/,$/, '').trim()).filter(Boolean);

/** Google Maps directions to the address (it opens the Maps app on a phone), or '' when there is no address. */
export function mapsUrl(address) {
  const a = addressLines(address).join(', ');
  return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : '';
}

/** What is on one dispatch note, in order-line order: [{ qty, partNo, part }]. No prices. */
export function noteParts(job, d) {
  return job.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => ({ qty: d.lines[l.id], partNo: l.partNo || '', part: l.part || '' }));
}

/**
 * The notes out for delivery (not delivered, not cancelled, not invoiced), oldest dispatched first, then by
 * customer. Each: { job, d, po, parts, addressLines, firstLine, mapsUrl, daysOut }.
 */
export function deliveryRuns(jobs, today) {
  const day = s => Math.round(new Date(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
  return jobs.flatMap(job => job.despatches.filter(d => !d.deliveredOn && !d.cancelled && !d.xero).map(d => {
    const lines = addressLines(job.address);
    return { job, d, po: dispatchPo(job.po, job.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => l.po)),
      parts: noteParts(job, d), addressLines: lines, firstLine: lines[0] || '', mapsUrl: mapsUrl(job.address),
      daysOut: today && d.date ? Math.max(0, day(today) - day(d.date)) : 0 };
  })).sort((a, b) => (a.d.date || '').localeCompare(b.d.date || '') || a.job.customer.localeCompare(b.job.customer) || a.d.id - b.d.id);
}

/** Notes delivered today, newest first: [{ job, d }]. */
export function deliveredToday(jobs, today) {
  const when = d => d.deliveredAt || '';
  return jobs.flatMap(job => job.despatches.filter(d => d.deliveredOn === today && !d.cancelled).map(d => ({ job, d })))
    .sort((a, b) => when(b.d).localeCompare(when(a.d)) || b.d.id - a.d.id);
}

/** A signature the board will keep: a PNG data URL under 80 KB. */
export function signatureOk(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith(PNG) && dataUrl.length > PNG.length && dataUrl.length <= SIGNATURE_MAX;
}

/**
 * What stops Save delivery, in plain words, or '' when it can be saved. f: { name, nobody, signature, note }.
 * Someone signed: their name and their signature. Nobody to sign: where it was left instead, so the delivery
 * note still says something as proof.
 */
export function deliveryProblem({ name = '', nobody = false, signature = '', note = '' }) {
  if (nobody) return note.trim() ? '' : 'Say where it was left, for example Left at goods-in.';
  if (!name.trim()) return 'Type who signed for it, or tick Nobody to sign.';
  if (!signature) return 'Ask them to sign in the box.';
  if (!signatureOk(signature)) return 'The signature is too big to save. Press Clear and ask them to sign again.';
  return '';
}
