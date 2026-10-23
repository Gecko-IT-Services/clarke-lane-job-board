/**
 * Certificates of conformity (Philip, 23 Oct: a customer's purchase order asked for "a Certificate of Conformity
 * and Country of Origin"). One per dispatch note: what went out, the material and its certificate or batch number
 * for each part, the country of origin, and who signed it for Clarke Lane. Pure: tested in tests/coc.mjs.
 */
import { normName } from './xero.js';
import { gradesIn } from './spfiles.js';

/** The words above the signature. */
export const COC_STATEMENT = 'We certify that the goods listed above have been manufactured, inspected and supplied in accordance with the requirements of the purchase order, drawings and specifications, and that they conform in all respects.';
export const DEFAULT_ORIGIN = 'United Kingdom';

/** An order or a customer's email asking for one: "Certificate of Conformity", "C of C", "CoC", "certificate of conformance". */
export const asksForCoc = text => /certificates? of conform(ity|ance)|\bC\s?of\s?C\b|\bCoCs?\b|\bCofC\b/i.test(String(text || ''));

/**
 * The certificate's lines: the parts on this dispatch note, each with its material (as saved, else the grades the
 * description names, "S275", "304") and its certificate or batch number (as saved, else blank to fill in).
 * saved: { [lineId]: { material, batch } } from the certificate already issued, or the one being filled in.
 */
export function cocRows(job, despatch, saved = {}) {
  return (job.lines || []).filter(l => (despatch.lines?.[l.id] || 0) > 0).map(l => {
    const s = saved[l.id] || {};
    return { lineId: l.id, partNo: String(l.partNo || '').trim(), desc: String(l.part || '').trim(), qty: despatch.lines[l.id],
      material: s.material ?? gradesIn(l.part).join(', '), batch: s.batch ?? '' };
  });
}

/**
 * Does this dispatch note want a certificate that has not been made yet? Yes when the customer is marked for one
 * with every delivery, or the order's notes ask for one. customers: Set of customer keys; issued: Set or Map of
 * dispatch ids that already have one.
 */
export function cocNeeded(job, despatch, customers, issued) {
  if (!despatch || despatch.cancelled || issued?.has?.(despatch.id)) return false;
  return !!(customers?.has?.(normName(job.customer)) || asksForCoc(job.notes));
}
