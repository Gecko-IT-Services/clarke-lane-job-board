// Smoke-test stand-in for src/data.js: made-up jobs held in memory.
const role = new URLSearchParams(location.search).get('role') || 'office';
let jobs = [
  { id: 1, so: 'SO-9729', quote: 'Q-0301', spQuoteId: 301, customer: 'Example Customer Ltd', contactName: 'A Buyer', contactEmail: '', po: 'PO-1', ordered: '2026-10-14', due: '2026-10-30',
    calloffs: ['2026-10-16', '2026-10-23', '2026-10-30'], notes: '', lines: [{ id: 11, lineNo: 1, part: 'Bracket — 3mm S275', qty: 30, price: 13.1 }],
    procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T09:00:00Z' }, 'Fold': { done: false } },
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null }] },
  { id: 2, so: 'SO-9730', quote: 'Q-0302', spQuoteId: 302, customer: 'Second Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-14', due: '2026-11-04',
    calloffs: [], notes: 'Rush', lines: [{ id: 21, lineNo: 1, part: 'Cabinet', qty: 5, price: 310 }, { id: 22, lineNo: 2, part: 'Carriage', qty: 1, price: 25 }],
    procs: { 'Laser': { done: false }, 'Weld': { done: false }, 'P/Coat Paint': { done: false } }, despatches: [] },
];
const hide = j => role === 'office' ? j : { ...j, lines: j.lines.map(l => ({ ...l, price: null })) };
export const whoAmI = async () => ({ email: 'x', name: role === 'office' ? 'Levi' : 'Shop Floor', role });
export const loadJobs = async () => structuredClone(jobs).map(hide);
export const setProcess = async (id, p, done, by) => { jobs.find(j => j.id === id).procs[p] = done ? { done, by, at: new Date().toISOString() } : { done: false }; };
export const setJobProcesses = async () => {};
export const createJob = async p => { const id = jobs.length + 1; const so = p.so_number || 'SO-97' + (29 + id); jobs.push({ id, so, xeroQuoteId: p.xero_quote_id, quote: p.quote_no, spQuoteId: p.sp_quote_id, customer: p.customer, contactName: '', contactEmail: '', po: p.customer_po, ordered: '2026-10-14', due: p.due_date, calloffs: p.calloff_dates, notes: p.notes, lines: p.lines.map((l, i) => ({ id: id * 100 + i, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price })), procs: Object.fromEntries(p.processes.map(x => [x, { done: false }])), despatches: [] }); return { id, so_number: so }; };
let dn = 2;
export const createDespatch = async (jobId, lines) => { const j = jobs.find(x => x.id === jobId); const d = { id: dn, dn: 'DN-000' + dn++, date: '2026-10-14', lines: Object.fromEntries(lines.map(l => [l.job_line_id, l.qty])), xero: null }; j.despatches.push(d); return { id: d.id, dn_number: d.dn }; };
export const markInvoiced = async (id, no) => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) d.xero = { no }; };
export const onChange = async () => {};
let dismissed = [];
export const loadDismissed = async () => [...dismissed];
export const dismissQuote = async id => { dismissed.push(id); };
export const restoreQuote = async id => { dismissed = dismissed.filter(x => x !== id); };
export const deleteJob = async id => { const j = jobs.find(x => x.id === id); if (j.despatches.length) throw new Error('This job has despatch notes, so it cannot be cancelled.'); jobs = jobs.filter(x => x !== j); };
export const updateJob = async (id, patch) => { const j = jobs.find(x => x.id === id); if (patch.calloff_dates) j.calloffs = patch.calloff_dates; if (patch.due_date) j.due = patch.due_date; if ('customer_po' in patch) j.po = patch.customer_po; if ('notes' in patch) j.notes = patch.notes; };
export const orderedQuotes = async () => [
  { spId: 301, quoteNo: 'Q-0301', customer: 'Example Customer Ltd', status: 'Ordered', carriage: 0, sellTotal: 393, deliveryDays: 10 },
  { spId: 303, quoteNo: 'Q-0303', customer: 'Third Example Ltd', status: 'Ordered', carriage: 12.5, sellTotal: 290.25, deliveryDays: 0, quoteDate: '2026-10-12' }];
export const quoteLines = async () => [{ lineNo: 1, qty: 10, sellTotal: 290.25, desc: 'Valve guard', thickness: 2, material: 'Zintec', process: 'Laser', folds: 3, weld: 0, inserts: 0, paint: true, plating: 0, holes: 0 }];
export const xeroStatus = async () => sessionStorage.getItem('fakeXero') ? { tenant_name: 'Clarke Lane Engineering Ltd', connected_by: 'levi@clarke-lane.co.uk', connected_at: '2026-10-15T09:00:00Z' } : null;
export const xero = async (route, body) => {
  if (route === 'connect') { sessionStorage.setItem('fakeXero', '1'); return { url: location.pathname + '?xero=connected#xero' }; }
  if (route === 'read') return { organisation: 'Clarke Lane Engineering Ltd', highestSo: 9728, counterNext: 9729,
    quotes: [{ id: 'q1', number: 'SO-9726', status: 'ACCEPTED', customer: 'Example Customer Ltd', reference: 'P31614', date: '2026-10-01', expiry: '2026-11-07', subTotal: 113.27,
      lines: [{ description: 'Bracket 2mm', qty: 10, unit: 11.327, amount: 113.27 }] },
      { id: 'q2', number: 'SO-9725', status: 'DRAFT', customer: 'Second Example Ltd', reference: 'P31608', date: '2026-10-01', expiry: '', subTotal: 526.29, lines: [] }],
    invoices: [{ id: 'i1', number: 'INV-31933', status: 'PAID', customer: 'Example Customer Ltd', reference: '9724', date: '2026-10-01', subTotal: 71.4 }] };
  if (route === 'contacts') return { contacts: [{ id: 'c1', name: 'Example Customer Limited' }, { id: 'c2', name: 'Second Example Ltd' }, { id: 'c3', name: 'Second Example (Old)' }],
    defaults: { accountCode: '200', taxType: 'OUTPUT2', from: 'your last 100 invoices' } };
  if (route === 'send') return { results: body.items.map((it, i) => { for (const j of jobs) for (const d of j.despatches) if (d.id === it.despatchId) d.xero = { no: 'INV-3200' + i };
    return { despatchId: it.despatchId, ok: true, invoiceNo: 'INV-3200' + i }; }) };
  if (route === 'disconnect') { sessionStorage.removeItem('fakeXero'); return {}; }
};
let cmap = new Map();
export const loadContactMap = async () => new Map(cmap);
export const saveContact = async (k, c) => { cmap.set(k, c); };
