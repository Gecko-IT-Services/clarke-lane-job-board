/**
 * Metal prices (Philip, 20 Oct): ask several suppliers for the same metal, compare their prices side by side,
 * and see what each has charged before (earlier quotes here, and metal bills in Xero). Trade prices are
 * not published, so the board never guesses one: every price is one a supplier gave.
 * Pure: no window. Tested in tests/metal.mjs.
 * line: { material, grade, form, thickness, size, qty, unit }
 * quote: { supplier, supplierId, email, askedAt, prices: [unit|null], carriage, leadDays, validUntil, note }
 */
export const MATERIALS = ['Aluminium', 'Stainless steel', 'Mild steel', 'Zintec', 'Galvanised steel', 'Other'];
export const FORMS = ['Sheet', 'Plate', 'Flat bar', 'Round bar', 'Box section', 'Tube', 'Angle', 'Channel', 'Other'];
export const UNITS = ['sheets', 'lengths', 'pieces', 'kg', 'm'];

const r2 = n => Math.round(n * 100) / 100;
const lower = s => String(s || '').trim().toLowerCase();

export const rfqRef = id => 'RFQ-' + String(id).padStart(4, '0');

/** "3mm 5083 aluminium sheet, 2500 × 1250" (what is asked for, and the PO line). */
export function lineText(l) {
  const t = String(l.thickness ?? '').trim();
  const what = [t ? (/[a-z]/i.test(t) ? t : t + 'mm') : '', String(l.grade || '').trim(), lower(l.material === 'Other' ? '' : l.material), lower(l.form === 'Other' ? '' : l.form)]
    .filter(Boolean).join(' ');
  const size = String(l.size || '').trim().replace(/\s*[x×*]\s*/gi, ' × ');
  return [what, size].filter(Boolean).join(', ');
}
export const qtyText = l => `${l.qty} ${l.unit || 'pieces'}`;

/** The same metal however it was typed: for price history. */
export const metalKey = l => [lower(l.material), lower(l.grade).replace(/\s+/g, ''), lower(l.form), String(l.thickness ?? '').replace(/mm$/i, '').trim(),
  lower(l.size).replace(/\s*[x×*]\s*/g, 'x').replace(/\s+/g, '')].join('|');

/** Problems with an enquiry before the emails are drafted, or ''. */
export function checkRfq({ lines, suppliers }) {
  if (!lines.length) return 'Add at least one line of metal.';
  const bad = lines.findIndex(l => !l.material || !(Number(l.qty) > 0) || !(String(l.thickness || '').trim() || String(l.size || '').trim()));
  if (bad >= 0) return `Line ${bad + 1} needs the material, a thickness or size, and a quantity.`;
  if (!suppliers.length) return 'Tick at least one supplier to ask.';
  const noMail = suppliers.find(s => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s.email || '').trim()));
  if (noMail) return `${noMail.supplier} needs an email address.`;
  return '';
}

/** A quote's total: every line's unit price × quantity, plus carriage. complete: every line was priced. */
export function quoteTotal(lines, q) {
  const p = q.prices || [];
  const priced = lines.map((l, i) => p[i] == null || p[i] === '' ? null : Number(p[i]));
  const complete = priced.length > 0 && priced.every(x => x != null && Number.isFinite(x));
  const goods = r2(lines.reduce((a, l, i) => a + (priced[i] != null ? r2(priced[i] * Number(l.qty)) : 0), 0));
  return { goods, total: r2(goods + (Number(q.carriage) || 0)), complete, any: priced.some(x => x != null) };
}

/**
 * Side by side: each priced quote's total, the cheapest complete one, and the cheapest supplier per line.
 * Quotes not priced yet are "waiting".
 */
export function compare(lines, quotes) {
  const rows = quotes.map(q => ({ ...q, ...quoteTotal(lines, q) }));
  const priced = rows.filter(r => r.any);
  const complete = priced.filter(r => r.complete).sort((a, b) => a.total - b.total || (a.leadDays ?? 99) - (b.leadDays ?? 99));
  const lineBest = lines.map((_, i) => {
    const xs = priced.filter(r => r.prices?.[i] != null && r.prices[i] !== '').map(r => ({ s: r.supplier, p: Number(r.prices[i]) }));
    if (!xs.length) return null;
    const lo = Math.min(...xs.map(x => x.p));
    return { price: lo, suppliers: xs.filter(x => x.p === lo).map(x => x.s) };
  });
  const best = complete[0] || null, next = complete[1] || null;
  return { rows, priced, waiting: rows.filter(r => !r.any), best, saving: best && next ? r2(next.total - best.total) : null, lineBest };
}

/**
 * Earlier prices for the same metal, newest first: [{ date, supplier, unit, ref, rfqId }]. rfqs: every enquiry
 * with its quotes ({ id, createdAt, lines, quotes }); the one being looked at (skipId) is left out.
 */
export function priceHistory(line, rfqs, skipId = null) {
  const k = metalKey(line), out = [];
  for (const r of rfqs || []) {
    if (r.id === skipId) continue;
    r.lines.forEach((l, i) => {
      if (metalKey(l) !== k) return;
      for (const q of r.quotes || []) {
        const p = q.prices?.[i];
        if (p != null && p !== '' && Number.isFinite(Number(p))) out.push({ date: (q.enteredAt || r.createdAt || '').slice(0, 10), supplier: q.supplier, unit: Number(p), ref: rfqRef(r.id), rfqId: r.id });
      }
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.unit - b.unit);
}

/** A price against the last time the same metal was priced (by anyone): { last, pct } or null. */
export function vsLast(price, history) {
  if (price == null || price === '' || !history.length) return null;
  const last = history[0];
  return { last, pct: last.unit ? Math.round((Number(price) - last.unit) / last.unit * 100) : null };
}

/**
 * Xero bill lines (account 5000, materials) that look like this metal: the thickness and the grade if given,
 * and the material named. bills: [{ number, supplier, date, description, qty, unit, amount }].
 */
export function billMatches(line, bills) {
  const t = String(line.thickness ?? '').replace(/mm$/i, '').trim(), g = lower(line.grade).replace(/\s+/g, '');
  const mat = { 'Aluminium': /\balu|\bally\b|\b(?:1050|5083|5251|5754|6061|6082)\b/i, 'Stainless steel': /stainless|\bs\/s\b|\b(?:304|316|430)l?\b/i,
    'Mild steel': /mild|\bs275|\bs355|\bhr\b|\bcr\b|\bdc01\b/i, 'Zintec': /zintec|\bdc01\s*ze/i, 'Galvanised steel': /galv/i }[line.material];
  return (bills || []).filter(b => {
    const d = String(b.description || ''), flat = d.toLowerCase().replace(/\s+/g, '');
    if (t && !new RegExp(`(^|[^0-9.])${t.replace('.', '\\.')}(\\.0+)?\\s*mm`, 'i').test(d)) return false;
    if (g && !flat.includes(g)) return false;
    return mat ? mat.test(d) : true;
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The enquiry email to one supplier. Never sent by the board: it becomes an Outlook draft to check. */
export function rfqEmail({ id, lines, note = '', supplier, from, needBy = '', company = 'Clarke Lane Engineering Ltd' }) {
  const ref = rfqRef(id);
  const kinds = [...new Set(lines.map(l => lower(l.material)).filter(x => x && x !== 'other'))];
  const subject = `Price request ${ref}${kinds.length ? ': ' + kinds.join(' and ') : ''}`;
  const rows = lines.map((l, i) => `<tr><td style="padding:4px 12px 4px 0">${i + 1}</td><td style="padding:4px 12px 4px 0">${esc(lineText(l))}</td><td style="padding:4px 12px 4px 0;text-align:right">${esc(qtyText(l))}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>Hello${supplier ? ' ' + esc(supplier) : ''},</p>
<p>Could you please quote for the following, delivered to ${esc(company)}:</p>
<table style="border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:4px 12px 4px 0">#</th><th style="text-align:left;padding:4px 12px 4px 0">Material</th><th style="text-align:right;padding:4px 12px 4px 0">Quantity</th></tr></thead><tbody>${rows}</tbody></table>
${note ? `<p>${esc(note)}</p>` : ''}<p>Please include the price for each line, any delivery charge, and your lead time${needBy ? ` (we need it by ${esc(needBy)})` : ''}. Please quote <b>${ref}</b> in your reply.</p>
<p>Many thanks,<br>${esc(from)}<br>${esc(company)}</p></div>`;
  return { subject, html };
}
