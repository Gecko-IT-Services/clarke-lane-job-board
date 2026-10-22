/**
 * Pure helpers for Send to Xero, shared by the board (contact matching) and the edge
 * function (building the draft invoice). No window, no network: tested in tests/xero.mjs.
 */

/** "Example Group LTD" and "Example Group Limited" are the same customer. */
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
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].name, how: 'auto' };
  if (hits.length > 1) return null;
  // Clarke Lane's Xero contacts end in an account code, "Haig Engineering Ltd (HAI1)" (22 Oct): match without it.
  const base = normName(withoutCode(customer));
  const near = base ? contacts.filter(c => normName(withoutCode(c.name)) === base) : [];
  return near.length === 1 ? { id: near[0].id, name: near[0].name, how: 'auto' } : null;
}

/**
 * A name without the account code Clarke Lane's Xero contacts end in: "Sample (Hampshire) Ltd (SAM1)" →
 * "Sample (Hampshire) Ltd". Only a last bracket of 2–10 letters and digits with a digit in it, so
 * "(Hampshire)" or "(UK)" stay.
 */
export const withoutCode = s => String(s || '').replace(/\s*\((?=[A-Za-z0-9]{2,10}\))(?=[^)]*\d)[A-Za-z0-9]+\)\s*$/, '').trim();

// Words that say nothing about which company it is.
const GENERIC = new Set(['and', 'the', 'of', 'ltd', 'limited', 'plc', 'llp', 'uk', 'co', 'company', 'group', 'services', 'service',
  'engineering', 'international', 'solutions', 'systems', 'technologies', 'products', 'industries', 'holdings', 'trading', 'enterprises']);
/** The words that tell one company from another: "Haig Engineering Ltd" → ['haig']. */
export const nameWords = s => [...new Set(withoutCode(s).toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/)
  .filter(w => w.length >= 2 && !GENERIC.has(w)))];

/**
 * Could this Xero contact be this customer? The same name (ignoring Ltd, punctuation and the account code), or at
 * least one telling word in common. "Haig Engineering Ltd" and "Ice Cool Servicing Ltd" share none: the board
 * asks before linking them (Mandy, 22 Oct, sent a Haig delivery to Ice Cool).
 */
export function looksSame(customer, contactName) {
  if (normName(withoutCode(customer)) && normName(withoutCode(customer)) === normName(withoutCode(contactName))) return true;
  const theirs = new Set(nameWords(contactName));
  return nameWords(customer).some(w => theirs.has(w));
}

/**
 * Xero contacts to offer for a customer, likeliest first: with no search, those sharing a telling word with the
 * customer's name; with a search, every contact whose name has all its words. [{ id, name, score }], at most n.
 */
export function rankContacts(customer, contacts, q = '', n = 8) {
  const mine = new Set(nameWords(customer)), base = normName(withoutCode(customer));
  const ws = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  // The same name (but for Ltd or the account code) first, then the most telling words in common.
  const scored = (contacts || []).map(c => ({ id: c.id, name: c.name,
    score: (base && normName(withoutCode(c.name)) === base ? 10 : 0) + nameWords(c.name).filter(w => mine.has(w)).length }));
  const list = ws.length ? scored.filter(c => ws.every(w => c.name.toLowerCase().includes(w))) : scored.filter(c => c.score > 0);
  return list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, n);
}

const round2 = n => (n < 0 ? -1 : 1) * Math.round(Math.round(Math.abs(n) * 1e8) / 1e6) / 100;   // to the penny, half up, after flattening float noise (7 × 0.145 is 1.0149999…)

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
 * d: { dn, date, so, po, calloff: 'n of m' | '', lines: [{ part, qty, unit }], prepaid: ['PF-0003'] }
 * prepaid: pro formas paid in advance on this order, named in the reference and on a note line so
 * Keith can allocate the money already received.
 */
export function buildInvoice(d, contactId, accountCode, taxType) {
  return {
    Type: 'ACCREC', Status: 'DRAFT', LineAmountTypes: 'Exclusive',
    Contact: { ContactID: contactId },
    Date: d.date,
    Reference: [d.so, d.po ? `PO ${d.po}` : '', d.dn, d.prepaid?.length ? `paid in advance ${d.prepaid.join(', ')}` : ''].filter(Boolean).join(' / ').slice(0, 255),
    LineItems: d.lines.filter(l => l.qty > 0).map(l =>
      invoiceLine(d.calloff ? `${l.part} (call-off ${d.calloff})` : l.part, l.qty, l.unit, accountCode, taxType))
      .concat(d.prepaid?.length ? [{ Description: `Paid in advance: pro forma ${d.prepaid.join(', ')}` }] : []),
  };
}

/** Net of the invoice as Xero will total it (lines are rounded to the penny each). */
export const invoiceNet = inv => round2(inv.LineItems.reduce((a, l) => a + (l.Quantity == null ? 0 : round2(l.Quantity * l.UnitAmount)), 0));

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

/**
 * A DRAFT purchase order for Xero, raised from a sales order. d: { date, deliveryDate, so, customer, accountCode, lines: [{ description, qty, unit }] }.
 * The SO number is the reference so Keith can see which job the bill belongs to; tax follows the supplier/account in Xero.
 * accountCode (Keith, 19 Oct: materials are 5000, one account per PO) goes on every line; left off, Keith codes it in Xero.
 */
export function buildPurchaseOrder(d, contactId) {
  return {
    Contact: { ContactID: contactId }, Date: d.date, ...(d.deliveryDate ? { DeliveryDate: d.deliveryDate } : {}),
    Reference: [d.so, d.customer ? `for ${d.customer}` : ''].filter(Boolean).join(' ').slice(0, 255),
    Status: 'DRAFT', LineAmountTypes: 'Exclusive',
    LineItems: d.lines.filter(l => l.qty > 0 && String(l.description || '').trim())
      .map(l => {   // like invoiceLine: 4dp unit prices, else 1 × the exact total so the PO never differs from the quote
        const unit = Number(l.unit) || 0, u4 = Math.round(unit * 10000) / 10000, total = round2(l.qty * unit), desc = String(l.description).trim();
        const line = round2(l.qty * u4) === total ? { Description: desc.slice(0, 4000), Quantity: l.qty, UnitAmount: u4 }
          : { Description: `${desc} (${l.qty} @ £${unit})`.slice(0, 4000), Quantity: 1, UnitAmount: total };
        return { ...line, ...(d.accountCode ? { AccountCode: String(d.accountCode) } : {}) };
      }),
  };
}
