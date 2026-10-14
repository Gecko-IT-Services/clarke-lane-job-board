// Smoke-test stand-in for src/data.js: made-up orders held in memory. Not real customers.
const role = new URLSearchParams(location.search).get('role') || 'office';
let jobs = [
  { id: 1, so: 'SO-9781', quote: 'Q-0301', spQuoteId: 301, customer: 'Example Customer Ltd', contactName: 'A Buyer', contactEmail: '', po: 'PO-1',
    ordered: '2026-10-14', due: '2026-10-30', notes: '', address: 'Unit 4, Example Park\nSouthampton SO1 1AA', status: 'open',
    lines: [{ id: 11, lineNo: 1, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-16' },
            { id: 12, lineNo: 2, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-23' },
            { id: 13, lineNo: 3, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-30' }],
    procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T09:00:00Z' }, 'Fold': { done: false } },
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null }] },
  { id: 2, so: 'SO-9782', quote: '', spQuoteId: null, customer: 'Second Example Ltd', contactName: '', contactEmail: '', po: '',
    ordered: '2026-10-14', due: '2026-11-04', notes: 'Rush', address: '', status: 'open',
    lines: [{ id: 21, lineNo: 1, part: 'Cabinet', qty: 5, price: 310, due: '2026-11-04' }, { id: 22, lineNo: 2, part: 'Carriage', qty: 1, price: 25, due: '2026-11-04' }],
    procs: { 'Laser': { done: false }, 'Weld': { done: false }, 'P/Coat Paint': { done: false } }, despatches: [] },
];
const hide = j => role === 'office' ? j : { ...j, lines: j.lines.map(l => ({ ...l, price: null })) };
const find = id => jobs.find(j => j.id === id);
export const whoAmI = async () => ({ email: 'x', name: role === 'office' ? 'Levi' : 'Shop Floor', role });
export const loadJobs = async () => structuredClone(jobs).map(hide);
export const setProcess = async (id, p, done, by) => { find(id).procs[p] = done ? { done, by, at: new Date().toISOString() } : { done: false }; };
export const setJobProcesses = async (id, add, remove) => { const j = find(id); add.forEach(p => { j.procs[p] = { done: false }; }); remove.forEach(p => delete j.procs[p]); };
export const updateJob = async () => {};
let nextLine = 100;
export const createJob = async p => {
  const id = jobs.length + 1, so = p.so_number || 'SO-97' + (82 + id);
  jobs.push({ id, so, quote: p.quote_no, spQuoteId: p.sp_quote_id, xeroQuoteId: p.xero_quote_id, customer: p.customer, contactName: p.contact_name, contactEmail: '',
    po: p.customer_po, ordered: '2026-10-15', due: p.due_date, notes: p.notes, address: p.delivery_address, status: 'open',
    lines: p.lines.map((l, i) => ({ id: nextLine++, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date })),
    procs: Object.fromEntries(p.processes.map(x => [x, { done: false }])), despatches: [] });
  return { id, so_number: so };
};
export const amendJob = async (id, p) => {
  const j = find(id);
  Object.assign(j, { po: p.customer_po, contactName: p.contact_name, address: p.delivery_address, notes: p.notes });
  j.lines = p.lines.map((l, i) => ({ id: l.id || nextLine++, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date }));
};
export const setJobStatus = async (id, status) => { find(id).status = status; };
let dn = 2;
export const createDespatch = async (jobId, lines) => { const j = find(jobId); if (j.status !== 'open') throw new Error(`${j.so} is on hold.`); const d = { id: dn, dn: 'DN-000' + dn++, date: '2026-10-15', lines: Object.fromEntries(lines.map(l => [l.job_line_id, l.qty])), xero: null }; j.despatches.push(d); return { id: d.id, dn_number: d.dn }; };
export const markInvoiced = async (id, no) => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) d.xero = { no }; };
export const onChange = async () => {};
export const orderedQuotes = async () => [
  { spId: 301, quoteNo: 'Q-0301', customer: 'Example Customer Ltd', status: 'Ordered', carriage: 0, sellTotal: 393, deliveryDays: 10 },
  { spId: 303, quoteNo: 'Q-0303', customer: 'Third Example Ltd', status: 'Ordered', carriage: 12.5, sellTotal: 290.25, deliveryDays: 0, quoteDate: '2026-10-12' }];
export const quoteLines = async () => [{ lineNo: 1, qty: 10, sellTotal: 290.25, desc: 'Valve guard', thickness: 2, material: 'Zintec', process: 'Laser', folds: 3, weld: 0, inserts: 0, paint: true, plating: 0, holes: 0 }];
let dismissed = [];
export const loadDismissed = async () => [...dismissed];
export const dismissQuote = async id => { dismissed.push(id); };
export const restoreQuote = async id => { dismissed = dismissed.filter(x => x !== id); };
export const deleteJob = async id => { const j = find(id); if (j.despatches.length) throw new Error('This order has despatch notes, so it cannot be deleted.'); jobs = jobs.filter(x => x !== j); };
export const xeroStatus = async () => sessionStorage.getItem('fakeXero') ? { tenant_name: 'Clarke Lane Engineering Ltd', connected_by: 'levi@clarke-lane.co.uk', connected_at: '2026-10-15T09:00:00Z' } : null;
export const xero = async (route, body) => {
  if (route === 'connect') { sessionStorage.setItem('fakeXero', '1'); return { url: location.pathname + '?xero=connected#xero' }; }
  if (route === 'read') return { organisation: 'Clarke Lane Engineering Ltd', highestSo: 9780, counterNext: 9783,
    quotes: [{ id: 'q1', number: 'SO-9776', status: 'ACCEPTED', customer: 'Example Customer Ltd', reference: 'P31614', date: '2026-10-01', expiry: '2026-11-07', subTotal: 113.27,
      lines: [{ description: 'Bracket 2mm', qty: 10, unit: 11.327, amount: 113.27 }] }],
    invoices: [] };
  if (route === 'contacts') return { contacts: [{ id: 'c1', name: 'Example Customer Limited' }, { id: 'c2', name: 'Second Example Ltd' }],
    defaults: { accountCode: '200', taxType: 'OUTPUT2', from: 'your last 100 invoices' } };
  if (route === 'send') return { results: body.items.map((it, i) => { for (const j of jobs) for (const d of j.despatches) if (d.id === it.despatchId) d.xero = { no: 'INV-3200' + i };
    return { despatchId: it.despatchId, ok: true, invoiceNo: 'INV-3200' + i }; }) };
  if (route === 'disconnect') { sessionStorage.removeItem('fakeXero'); return {}; }
};
let cmap = new Map();
export const loadContactMap = async () => new Map(cmap);
export const saveContact = async (k, c) => { cmap.set(k, c); };
