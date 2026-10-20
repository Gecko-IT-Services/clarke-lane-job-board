/**
 * Aged debt (Philip, 20 Oct): customers with invoices over 60 days, for Home, the sales order form and
 * Won quotes, and the chase email. Clarke Lane's terms are 30 days from the end of the month, so every
 * invoice falls due 30 to 61 days after its date: an invoice counts once it is more than 60 days old
 * AND past the due date Xero holds (so a customer on longer terms in Xero is not flagged early).
 * Invoices come from the xero function's debts read: { id, number, reference, contactId, customer,
 * date, due, total, owed }. No window, no fetch: tested in tests/debts.mjs.
 */
import { normName } from './xero.js';

export const DEBT_DAYS = 60;
const dayNo = s => Math.round(Date.parse(s + 'T12:00:00Z') / 864e5);
const round2 = n => Math.round(n * 100) / 100;

/** Customers owing money on invoices over `days`, most owed first. */
export function agedDebt(invoices, today, days = DEBT_DAYS) {
  const by = new Map();
  for (const x of invoices || []) {
    if (!(x.owed > 0) || !x.date) continue;
    const age = dayNo(today) - dayNo(x.date);
    const key = normName(x.customer);
    const c = by.get(key) || { key, customer: x.customer, contactId: x.contactId, owedAll: 0, over: 0, invoices: [] };
    c.owedAll = round2(c.owedAll + x.owed);
    if (age > days && (!x.due || x.due < today)) { c.over = round2(c.over + x.owed); c.invoices.push({ ...x, age }); }
    by.set(key, c);
  }
  return [...by.values()].filter(c => c.over > 0)
    .map(c => ({ ...c, invoices: c.invoices.sort((a, b) => b.age - a.age), oldest: null }))
    .map(c => ({ ...c, oldest: c.invoices[0] }))
    .sort((a, b) => b.over - a.over || a.customer.localeCompare(b.customer));
}

/** The aged-debt entry for a customer name as typed on an order or quote, or null. */
export const debtFor = (list, name) => (name ? (list || []).find(c => c.key === normName(name)) || null : null);

/** The newest chase for a customer within `withinDays`, or null. chases: loadChases() rows. */
export function recentChase(chases, customer, today, withinDays = 7) {
  const key = normName(customer);
  const c = (chases || []).find(x => normName(x.customer) === key);
  return c && dayNo(today) - dayNo(c.at.slice(0, 10)) < withinDays ? c : null;
}

const gbp = n => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * A polite chase email for one customer's invoices over 60 days. links: { invoiceId: Xero pay-online URL }.
 * from: who signs it. Never sent by the board: it becomes an Outlook draft to check.
 */
export function chaseEmail({ debt, person = '', links = {}, from, company = 'Clarke Lane Engineering' }) {
  const n = debt.invoices.length;
  const subject = `${company}: ${n === 1 ? `invoice ${debt.invoices[0].number}` : `${n} invoices`} overdue (${gbp(debt.over)})`;
  const rows = debt.invoices.map(x => `<tr><td style="padding:4px 12px 4px 0">${esc(x.number)}${x.reference ? ` <span style="color:#666">(${esc(x.reference)})</span>` : ''}</td>
    <td style="padding:4px 12px 4px 0">${esc(longDate(x.date))}</td><td style="padding:4px 12px 4px 0;text-align:right">${esc(gbp(x.owed))}</td>
    <td style="padding:4px 0">${links[x.id] ? `<a href="${esc(links[x.id])}">View and pay online</a>` : ''}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>${person ? `Dear ${esc(person.split(' ')[0])},` : 'Hello,'}</p>
<p>I hope you are well. According to our records, the following ${n === 1 ? 'invoice is' : 'invoices are'} now overdue for payment:</p>
<table style="border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:4px 12px 4px 0">Invoice</th><th style="text-align:left;padding:4px 12px 4px 0">Date</th><th style="text-align:right;padding:4px 12px 4px 0">Amount due</th><th></th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="2" style="padding:6px 12px 0 0"><b>Total overdue</b></td><td style="padding:6px 12px 0 0;text-align:right"><b>${esc(gbp(debt.over))}</b></td><td></td></tr></tfoot></table>
<p>Our terms are 30 days from the end of the month of invoice. If payment has already been made, thank you, and please let us know the date so we can match it. Otherwise, could you let us know when we can expect it?</p>
<p>If there is a problem with any of these invoices, please get in touch and we will sort it out.</p>
<p>Kind regards,<br>${esc(from)}<br>${esc(company)}</p></div>`;
  return { subject, html };
}
