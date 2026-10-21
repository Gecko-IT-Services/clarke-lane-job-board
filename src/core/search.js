/**
 * Search everything (Philip, 21 Oct: "a global search box on every key page"): orders, delivery notes,
 * customers and their people, quotes, Xero invoices, parts, enquiries and tasks, from what the board already
 * has loaded, so results come as you type. The shop floor gets orders and delivery notes only. Prices are
 * never searched or shown. Pure: tested in tests/search.mjs.
 */
import { normName } from './xero.js';

const low = s => String(s ?? '').toLowerCase();
const flat = s => low(s).replace(/[\s\-_/.,]+/g, '');   // "so 9781", "SO-9781" and "so9781" are the same
const words = q => low(q).split(/\s+/).filter(Boolean);

/** Does every word of the search appear in the text (ignoring spaces and dashes inside codes)? */
export function matches(q, ...texts) {
  const ws = words(q); if (!ws.length) return false;
  const hay = low(texts.join(' ')), flatHay = flat(hay);
  return ws.every(w => hay.includes(w) || (flat(w).length >= 2 && flatHay.includes(flat(w))));
}
/** Higher is better: the title starting with the search, then containing it, then anything else. */
function rank(q, title) {
  const t = flat(title), f = flat(q);
  return t.startsWith(f) ? 3 : t.includes(f) ? 2 : 1;
}

export const GROUPS = { job: 'Orders', dn: 'Delivery notes', customer: 'Customers', person: 'Contacts', quote: 'Quotes', invoice: 'Xero invoices', part: 'Parts', enquiry: 'Enquiries', task: 'Tasks' };

/**
 * src: { jobs, customers: [{ key, name }], people, quotes, invoices, parts, enquiries, tasks }. office: false for the
 * shop floor. Returns [{ kind, title, items: [{ kind, id, title, sub, key, name }] }], best groups first, at most
 * `per` items a group: the best match, then the newest.
 */
export function searchAll(q, src, { office = false, per = 6 } = {}) {
  q = String(q || '').trim(); if (q.length < 2) return [];
  const out = { job: [], dn: [], customer: [], person: [], quote: [], invoice: [], part: [], enquiry: [], task: [] };
  const add = (kind, item) => out[kind].push({ kind, ...item, r: rank(q, item.title) });
  for (const j of src.jobs || []) {
    if (j.preview) continue;
    const line = (j.lines || []).find(l => matches(q, l.part, l.po));
    if (matches(q, j.so, j.customer, j.po, j.quote, j.contactName, ...(j.lines || []).map(l => `${l.part} ${l.po || ''}`)))
      add('job', { at: j.ordered || j.createdAt || '', id: j.id, title: `${j.so} · ${j.customer}`, sub: [j.po && `PO ${j.po}`, line?.part || j.lines?.[0]?.part, j.status === 'cancelled' && 'cancelled'].filter(Boolean).join(' · '), key: normName(j.customer), name: j.customer });
    for (const d of j.despatches || []) if (d.dn && matches(q, d.dn)) add('dn', { at: d.date || '', id: j.id, title: `${d.dn} · ${j.customer}`, sub: `for ${j.so}${d.date ? `, ${d.date}` : ''}` });
  }
  if (office) {
    for (const c of src.customers || []) if (matches(q, c.name)) add('customer', { id: c.key, title: c.name, sub: '', key: c.key, name: c.name });
    for (const p of src.people || []) if (matches(q, p.name, p.email, p.phone)) add('person', { id: p.id, title: p.name || p.email, sub: [p.customer, p.email, p.phone].filter(Boolean).join(' · '), key: p.key, name: p.customer });
    for (const x of src.quotes || []) if (matches(q, x.quoteNo, x.customer, x.contactName)) add('quote', { at: x.quoteDate || '', id: x.spId, title: `${x.quoteNo} · ${x.customer}`, sub: [x.status === 'Ordered' ? 'ordered' : 'quote', x.quoteDate].filter(Boolean).join(' · '), key: normName(x.customer), name: x.customer });
    for (const x of src.invoices || []) if (x.number && matches(q, x.number, x.reference)) add('invoice', { at: x.date || '', id: x.number, title: `${x.number} · ${x.customer}`, sub: [x.reference, x.date].filter(Boolean).join(' · '), key: normName(x.customer), name: x.customer });
    for (const p of src.parts || []) if (matches(q, p.partNo, p.description)) add('part', { id: p.id, title: `${p.partNo} · ${p.customer}`, sub: p.description || '', key: p.customerKey, name: p.customer });
    for (const e of src.enquiries || []) if (matches(q, e.company, e.fromName, e.fromEmail, e.subject, e.wants)) add('enquiry', { id: e.id, title: e.company || e.fromName || e.fromEmail, sub: e.wants || e.subject || '', key: e.customerKey || '', name: e.company || '' });
    for (const t of src.tasks || []) if (!t.doneAt && matches(q, t.title, t.customer)) add('task', { at: t.dueOn || '', id: t.id, title: t.title, sub: [t.customer, t.dueOn && `due ${t.dueOn}`].filter(Boolean).join(' · '), key: t.customerKey || '', name: t.customer || '' });
  }
  return Object.entries(out).filter(([, v]) => v.length)
    .map(([kind, v]) => ({ kind, title: GROUPS[kind], best: Math.max(...v.map(x => x.r)),
      items: v.sort((a, b) => b.r - a.r || String(b.at || '').localeCompare(String(a.at || '')) || String(b.id).localeCompare(String(a.id), 'en', { numeric: true })).slice(0, per).map(({ r, at, ...x }) => x), more: Math.max(0, v.length - per) }))
    .sort((a, b) => b.best - a.best);
}
