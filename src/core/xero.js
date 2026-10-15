/**
 * Pure helpers for Send to Xero, shared by the board (contact matching) and the edge
 * function (building the draft invoice). No window, no network: tested in tests/xero.mjs.
 */

/** "BSA Regal Group LTD" and "BSA Regal Group Limited" are the same customer. */
export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|plc|llp|uk|co|company|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * The Xero contact for a board customer: the one saved by the office, else the single
 * contact whose name normalises the same. null = Mandy must choose (never guessed).
 * saved: Map(customer_key → { id, name }); contacts: [{ id, name }]
 */
export function matchContact(customer, contacts, saved) {
  const key = normName(customer);
  if (saved.has(key)) return { ...saved.get(key), how: 'saved' };
  const hits = contacts.filter(c => normName(c.name) === key);
  return hits.length === 1 ? { id: hits[0].id, name: hits[0].name, how: 'auto' } : null;
}

const round2 = n => Math.round(n * 100) / 100;

/**
 * One Xero invoice line for qty × exact unit price. Xero keeps unit prices to 4dp; when that
 * would change the line total (Q-0078: 4000 × £3.01044), the line goes as 1 × the exact total
 * with the real quantity and unit price in the description, so the money is never altered.
 */
export function invoiceLine(part, qty, unit, accountCode, taxType) {
  const total = round2(qty * unit);
  const u4 = Math.round(unit * 10000) / 10000;
  const base = { AccountCode: accountCode, ...(taxType ? { TaxType: taxType } : {}) };
  if (round2(qty * u4) === total) return { Description: part, Quantity: qty, UnitAmount: u4, ...base };
  return { Description: `${part} (${qty} @ £${unit})`, Quantity: 1, UnitAmount: total, ...base };
}

/**
 * The draft invoice for one despatch. Exactly what went out on that despatch note.
 * d: { dn, date, so, po, calloff: 'n of m' | '', lines: [{ part, qty, unit }] }
 */
export function buildInvoice(d, contactId, accountCode, taxType) {
  return {
    Type: 'ACCREC', Status: 'DRAFT', LineAmountTypes: 'Exclusive',
    Contact: { ContactID: contactId },
    Date: d.date,
    Reference: [d.so, d.po ? `PO ${d.po}` : '', d.dn].filter(Boolean).join(' / ').slice(0, 255),
    LineItems: d.lines.filter(l => l.qty > 0).map(l =>
      invoiceLine(d.calloff ? `${l.part} (call-off ${d.calloff})` : l.part, l.qty, l.unit, accountCode, taxType)),
  };
}

/** Net of the invoice as Xero will total it (lines are rounded to the penny each). */
export const invoiceNet = inv => round2(inv.LineItems.reduce((a, l) => a + round2(l.Quantity * l.UnitAmount), 0));

/**
 * The sales account and VAT rate Clarke Lane's own invoices use most, so drafts land where
 * Keith expects. invoices: Xero invoices with LineItems.
 */
export function salesDefaults(invoices) {
  const count = new Map();
  for (const i of invoices) for (const l of i.LineItems || []) {
    if (!l.AccountCode) continue;
    const k = l.AccountCode + '|' + (l.TaxType || '');
    count.set(k, (count.get(k) || 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [accountCode, taxType] = best[0].split('|');
  return { accountCode, taxType: taxType || null, seen: best[1] };
}

/**
 * The customer PO(s) for one dispatch: the POs on the delivery lines it sends (call-offs can each
 * have their own), else the order's PO. linePos: the customer_po of each line on the dispatch.
 */
export function dispatchPo(orderPo, linePos) {
  const own = [...new Set((linePos || []).map(p => String(p || '').trim()).filter(Boolean))];
  return own.length ? own.join(', ') : String(orderPo || '').trim();
}
