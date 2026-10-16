// Smoke-test stand-in for src/data.js: made-up orders held in memory. Not real customers.
const role = new URLSearchParams(location.search).get('role') || 'office';
let jobs = [
  { id: 1, so: 'SO-9781', quote: 'Q-0301', spQuoteId: 301, customer: 'Example Customer Ltd', contactName: 'A Buyer', contactEmail: '', po: 'PO-1',
    ordered: '2026-10-14', due: '2026-10-30', notes: '', address: 'Unit 4, Example Park\nSouthampton SO14 3TJ', status: 'open',
    lines: [{ id: 11, lineNo: 1, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-16' },
            { id: 12, lineNo: 2, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-23' },
            { id: 13, lineNo: 3, part: 'Bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-30' }],
    procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T09:00:00Z' }, 'Fold': { done: false } },
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null, deliveredOn: '2026-10-14' },
      { id: 5, dn: 'DN-0005', date: '2026-10-15', lines: { 12: 10 }, xero: null, emailedAt: '2026-10-15T09:30:00Z' }] },
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
export const updateJob = async (id, patch) => { if ('contact_email' in patch) find(id).contactEmail = patch.contact_email; };
let nextLine = 100;
export const createJob = async p => {
  const id = jobs.length + 1, so = p.so_number || 'SO-97' + (82 + id);
  jobs.push({ id, so, quote: p.quote_no, spQuoteId: p.sp_quote_id, xeroQuoteId: p.xero_quote_id, customer: p.customer, contactName: p.contact_name, contactEmail: '',
    po: p.customer_po, ordered: '2026-10-15', due: p.due_date, notes: p.notes, address: p.delivery_address, status: 'open',
    lines: p.lines.map((l, i) => ({ id: nextLine++, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date, po: l.customer_po || '' })),
    procs: Object.fromEntries(p.processes.map(x => [x, { done: false }])), despatches: [] });
  return { id, so_number: so };
};
export const amendJob = async (id, p) => {
  const j = find(id);
  Object.assign(j, { po: p.customer_po, contactName: p.contact_name, address: p.delivery_address, notes: p.notes });
  j.lines = p.lines.map((l, i) => ({ id: l.id || nextLine++, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date, po: l.customer_po || '' }));
};
export const setJobStatus = async (id, status) => { find(id).status = status; };
let dn = 6;
export const createDespatch = async (jobId, lines) => { const j = find(jobId); if (j.status !== 'open') throw new Error(`${j.so} is on hold.`); const d = { id: dn, dn: 'DN-000' + dn++, date: '2026-10-15', lines: Object.fromEntries(lines.map(l => [l.job_line_id, l.qty])), xero: null }; j.despatches.push(d); return { id: d.id, dn_number: d.dn }; };
export const markInvoiced = async (id, no) => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) d.xero = { no }; };
export const onChange = async () => {};
export const orderedQuotes = async () => [
  { spId: 301, quoteNo: 'Q-0301', customer: 'Example Customer Ltd', status: 'Ordered', carriage: 0, sellTotal: 393, deliveryDays: 10, quoteDate: '2026-10-13' },
  { spId: 303, quoteNo: 'Q-0303', customer: 'Third Example Ltd', status: 'Ordered', carriage: 12.5, sellTotal: 290.25, deliveryDays: 0, quoteDate: '2026-10-12' },
  { spId: 305, quoteNo: 'Q-0305', customer: 'Ninth Example Ltd', contactName: 'Sam Buyer', status: 'Ordered', carriage: 0, sellTotal: 210, deliveryDays: 10, quoteDate: '2026-10-07' },
  { spId: 306, quoteNo: 'Q-0306', customer: 'Tenth Example Ltd', contactName: 'A Buyer', status: 'Ordered', carriage: 0, sellTotal: 1994, deliveryDays: 15, quoteDate: '2026-10-14' }];
export const quoteLines = async () => [{ lineNo: 1, qty: 10, sellTotal: 290.25, desc: 'Valve guard', thickness: 2, material: 'Zintec', process: 'Laser', folds: 3, weld: 0, inserts: 0, paint: true, plating: 0, holes: 0 }];
let dismissed = [];
export const loadDismissed = async () => [...dismissed];
export const dismissQuote = async id => { dismissed.push(id); };
export const restoreQuote = async id => { dismissed = dismissed.filter(x => x !== id); };
export const deleteJob = async id => { const j = find(id); if (j.despatches.length) throw new Error('This order has despatch notes, so it cannot be deleted.'); jobs = jobs.filter(x => x !== j); };
export const setJobDue = async (jobId, from, to) => { const j = find(jobId); let n = 0;
  for (const l of j.lines) if (l.due === from) { const sent = j.despatches.reduce((a, d) => a + (d.lines[l.id] || 0), 0); if (l.qty > sent) { l.due = to; n++; } }
  if (!n) throw new Error('Nothing still to dispatch is due on that date. Use Amend on Sales orders instead.'); return n; };
export const xeroStatus = async () => sessionStorage.getItem('fakeXero') ? { tenant_name: 'Clarke Lane Engineering Ltd', connected_by: 'levi@clarke-lane.co.uk', connected_at: '2026-10-15T09:00:00Z' } : null;
export const xero = async (route, body) => {
  if (route === 'connect') { sessionStorage.setItem('fakeXero', '1'); return { url: location.pathname + '?xero=connected#xero' }; }
  if (route === 'read') return { organisation: 'Clarke Lane Engineering Ltd', highestSo: 9780, counterNext: 9783,
    quotes: [{ id: 'q1', number: 'SO-9776', status: 'ACCEPTED', customer: 'Example Customer Ltd', reference: 'P31614', date: '2026-10-01', expiry: '2026-11-07', subTotal: 113.27,
      lines: [{ description: 'Bracket 2mm', qty: 10, unit: 11.327, amount: 113.27 }] }],
    invoices: [] };
  if (route === 'contacts') return { contacts: [{ id: 'c1', name: 'Example Customer Limited', postcode: 'SO14 3TJ' }, { id: 'c2', name: 'Second Example Ltd', postcode: 'SO50 6FR' }, { id: 'c3', name: 'Third Example Engineering', postcode: 'PO1 2NH' }],
    defaults: { accountCode: '200', taxType: 'OUTPUT2', from: 'your last 100 invoices' } };
  if (route === 'contact') return { id: body.id, name: 'Example Customer Limited', email: 'buyer@example.com', person: 'Sam Buyer', address: 'Unit 4, Example Park\nSouthampton\nSO1 1AA' };
  if (route === 'send') return { results: body.items.map((it, i) => { for (const j of jobs) for (const d of j.despatches) if (d.id === it.despatchId) d.xero = { no: 'INV-3200' + i };
    return { despatchId: it.despatchId, ok: true, invoiceNo: 'INV-3200' + i }; }) };
  if (route === 'items') return { items: fakeItems };
  if (route === 'invoices') return { invoices: body.ids.map(id => ({ id, number: 'INV-0001', status: 'DRAFT' })) };
  if (route === 'disconnect') { sessionStorage.removeItem('fakeXero'); return {}; }
};
let cmap = new Map();
export const loadContactMap = async () => new Map(cmap);
export const saveContact = async (k, c) => { cmap.set(k, c); };
export const markDespatch = async (id, what, receivedBy) => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) {
  if (what === 'emailed') d.emailedAt = new Date().toISOString();
  if (what === 'delivered') { d.deliveredOn = '2026-10-15'; d.receivedBy = receivedBy; }
  if (what === 'undelivered') { d.deliveredOn = null; d.receivedBy = ''; } } };
export const markAckEmailed = async id => { find(id).ackEmailedAt = new Date().toISOString(); };
export let lastDraft = null;
export const draftEmail = async m => { lastDraft = { ...m, pdfBytes: Math.round(m.pdfBase64.length * 0.75) }; window.__lastDraft = lastDraft; return null; };
let xorders = [];
export const loadXeroOrders = async () => structuredClone(xorders);
export const importXeroOrders = async qs => { let n = 0; for (const q of qs) if (!xorders.some(x => x.id === q.id)) { xorders.push({ ...q, importedAt: new Date().toISOString(), importedBy: 'levi@clarke-lane.co.uk', dismissed: false }); n++; } return n; };
export const dismissXeroOrder = async (id, d) => { xorders.find(x => x.id === id).dismissed = d; };
export const setRunningOrder = async ids => { for (const j of jobs) { const n = ids.indexOf(j.id); j.priority = n < 0 ? null : n + 1; } };
jobs.push(
  { id: 3, so: 'SO-9783', quote: '', spQuoteId: null, customer: 'Fourth Example Ltd', contactName: '', contactEmail: '', po: 'PO-77', ordered: '2026-10-15', due: '2026-11-12', notes: '', address: '', status: 'open',
    lines: [{ id: 31, lineNo: 1, part: 'Guard plate', qty: 40, price: 8.5, due: '2026-11-12' }], procs: { 'Laser': { done: false }, 'Fold': { done: false } }, despatches: [{ id: 3, dn: 'DN-0003', date: '2026-10-15', lines: { 31: 10 }, xero: null }] },
  { id: 4, so: 'SO-9784', quote: '', spQuoteId: null, customer: 'Fifth Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-15', due: '2026-11-20', notes: '', address: '', status: 'open',
    lines: [{ id: 41, lineNo: 1, part: 'Frame', qty: 2, price: 140, due: '2026-10-09' }], procs: { 'Weld': { done: false }, 'P/Coat Paint': { done: false } }, despatches: [],
    cancelledDespatches: [{ id: 4, dn: 'DN-0004', date: '2026-10-13', lines: { 41: 1 }, xero: null, cancelled: { at: '2026-10-14T09:00:00Z', by: 'Levi' } }] }
  ,{ id: 5, so: 'SO-9785', quote: '', spQuoteId: null, customer: 'Sixth Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-12', due: '2026-10-22', notes: '', address: '', status: 'held',
    lines: [{ id: 51, lineNo: 1, part: 'Bracket', qty: 12, price: 9.5, due: '2026-10-22' }], procs: { 'Laser': { done: false } }, despatches: [] },
  { id: 6, so: 'SO-9786', quote: '', spQuoteId: null, customer: 'Seventh Example Ltd', contactName: '', contactEmail: '', po: 'PO-90', ordered: '2026-10-10', due: '2026-10-20', notes: '', address: '', status: 'open',
    lines: [{ id: 61, lineNo: 1, part: 'Cover', qty: 8, price: 22, due: '2026-10-20' }], procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T10:00:00Z' } }, despatches: [] }
  ,{ id: 7, so: 'SO-9787', quote: '', spQuoteId: null, customer: 'Eighth Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-13', due: '2026-10-19', notes: '', address: '', status: 'open',
    lines: [{ id: 71, lineNo: 1, part: 'Tray', qty: 6, price: 18, due: '2026-10-19' }], procs: { 'Fold': { done: false } }, despatches: [] }
  ,{ id: 8, so: 'SO-9788', quote: '', spQuoteId: null, customer: 'Ninth Example Ltd', contactName: '', contactEmail: '', po: 'PO-55', ordered: '2026-10-01', due: '2026-10-12', notes: '', address: '', status: 'open',
    lines: [{ id: 81, lineNo: 1, part: 'Shelf', qty: 4, price: 30, due: '2026-10-12' }], procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-09T10:00:00Z' }, 'Fold': { done: true, by: 'Shop Floor', at: '2026-10-10T10:00:00Z' } },
    despatches: [{ id: 2, dn: 'DN-0002', date: '2026-10-12', lines: { 81: 4 }, xero: { no: 'INV-0001', id: '00000000-0000-0000-0000-000000000001', at: '2026-10-13T10:00:00Z' }, deliveredOn: '2026-10-12' }] }
  ,{ id: 9, so: 'SO-9789', quote: '', spQuoteId: null, customer: 'Tenth Example Ltd', contactName: '', contactEmail: '', po: '', ordered: '2026-10-05', due: '2026-10-25', notes: '', address: '', status: 'cancelled',
    lines: [{ id: 91, lineNo: 1, part: 'Panel', qty: 3, price: 45, due: '2026-10-25' }], procs: { 'Laser': { done: false } }, despatches: [] });
export const cancelDespatch = async id => { for (const j of jobs) { const d = j.despatches.find(x => x.id === id); if (d) {
  if (d.xero) throw new Error(`${d.dn} is invoiced in Xero, so it cannot be cancelled here.`);
  j.despatches = j.despatches.filter(x => x !== d); (j.cancelledDespatches ||= []).push({ ...d, cancelled: { at: new Date().toISOString(), by: 'levi@clarke-lane.co.uk' } }); } } };
let book = { people: [{ id: 1, key: 'fourthexample', customer: 'Fourth Example Ltd', role: 'deliveries', name: 'Goods In Team', email: 'goodsin@example.com', phone: '', notes: '', main: true }],
  sites: [{ id: 1, key: 'fourthexample', customer: 'Fourth Example Ltd', label: 'Main works', address: 'Example Road\nChandlers Ford SO53 2FE', contact: '', phone: '', main: true },
          { id: 2, key: 'fifthexample', customer: 'Fifth Example Ltd', label: '', address: 'Example Lane\nWinchester SO23 7BW', contact: '', phone: '', main: true }] };
let bookId = 10;
export const loadContactBook = async () => structuredClone(book);
export const savePerson = async p => { if (p.main) book.people.forEach(x => { if (x.key === p.key && x.role === p.role) x.main = false; });
  if (p.id) Object.assign(book.people.find(x => x.id === p.id), p); else book.people.push({ ...p, id: bookId++ }); };
export const deletePerson = async id => { book.people = book.people.filter(x => x.id !== id); };
export const saveSite = async x => { if (x.main) book.sites.forEach(y => { if (y.key === x.key) y.main = false; });
  if (x.id) Object.assign(book.sites.find(y => y.id === x.id), x); else book.sites.push({ ...x, id: bookId++ }); };
export const deleteSite = async id => { book.sites = book.sites.filter(x => x.id !== id); };
// Xero Products and services for the Part box (made up).
const fakeItems = [{ code: 'BR3', description: 'Bracket — 3mm S275', price: 12.1 }, { code: 'PL6', description: 'Base plate 6mm S275, 4 holes', price: 31.5 }, { code: 'GU2', description: 'Guard 2mm Zintec, powder coat RAL 9005', price: 18 }];
