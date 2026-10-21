// Smoke-test stand-in for src/data.js: made-up orders held in memory. Not real customers.
const role = new URLSearchParams(location.search).get('role') || 'md';   // md = Levi, office = Mandy, floor = the shop floor
// A made-up scribble standing in for a signature drawn on the driver's phone.
const FAKE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAA8CAYAAADPLpCHAAACmklEQVR42u2cW07DMBBFicUGQOx/hYguoXxVqio3je153EnP+aJI1PO4nowf4eMDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwJKNEEAWX98/19vPl79fEy02wgrZYu59nuUzwth7rGaieoKUfP76/rmqxv3y97tZidml5Rgxrrq4ZxIR7bPHY93DptvvVm3cvJK7Z5hikL2FkumzlVg842ZlY/Mw8pVRj45YPnJUq14veRWeKJ6tRu/zqo0tI7k94VcR9UqlzfJXJc4RY7es5KoFO8PfrIqYEecjsbOo0i0zuZX6aA9/o4WlEGdvG7bs5KouXrxty1okWox7dCL2Ju7IAnrGvqY429RaD4+JVq2fvi3eZ/4mcuJuCslVqFxZ9mRXau8tx5HtXAudtRXjztrnRYpNabHmLebVdsW0QkdXkux++h38fXXIseL/3mng0e+diUlbqSjvQJS/GTsfPRGPHpKNjDF69jATk6ZaPZQfw2ca/5nAVnJ9VKgevspeH1U4cImewCr7xFZi3vue+3H2dlBGq3SLcLKSqFX2wqP9tR535I6LZazlL/hHilph/ztqAXpfEa1EtRK/vUo8UqVLvLESucugUJ0fE9hbsFn52fN1ZhzL+K3cwCy1Y+HZDqgdu1u/AXN0y2xWmJbxe2brkTFKvlNo3Roo3iF5dl94poKNbMXNtHjW+VjJw1ZVzO90KerRrlkBeVRctQOosm99W1UF9TvYvcTNvFgQdbMuIh57Y73F+3wVFoIV46wYv5IVenUrL+NaY/U4VykG7QzBXukpEfNa66EWv9L/OWlm5a+8AKxSOJTXHadJ6iuhWlyJpEJrV+dTCfpo5UDI+YtxWo6ARQ4A0HoAAAAAAAAAAAAAAAAAAAjwD2RVpx4eWdBqAAAAAElFTkSuQmCC';
let jobs = [
  { id: 1, so: 'SO-9781', quote: 'Q-0301', spQuoteId: 301, customer: 'Example Customer Ltd', contactName: 'A Buyer', contactEmail: '', po: 'PO-1',
    ordered: '2026-10-14', due: '2026-10-30', notes: '', address: 'Unit 4, Example Park\nSouthampton SO14 3TJ', status: 'open',
    // Lines 1–2 use the Part no. box (22 Oct); line 3 is an older line with the number in its text: both looks show.
    // Lines 1–2 have their own processes (22 Oct); line 3 is from before, procs [] = every process on the order.
    lines: [{ id: 11, lineNo: 1, partNo: 'BRK-1001', part: 'Mounting bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-16', procs: ['Laser', 'Fold'] },
            { id: 12, lineNo: 2, partNo: 'BRK-1001', part: 'Mounting bracket — 3mm S275', qty: 10, price: 13.1, due: '2026-10-23', procs: ['Laser', 'Fold'] },
            { id: 13, lineNo: 3, part: 'Bracket BRK-1001 — 3mm S275, 304 stainless cover', qty: 10, price: 13.1, due: '2026-10-30', procs: [] }],
    procs: { 'Laser': { done: true, by: 'Shop Floor', at: '2026-10-14T09:00:00Z' }, 'Fold': { done: false } },
    // DN-0001 was marked on the driver's screen (22 Oct): signed for on the phone, so its delivery note shows the signature.
    despatches: [{ id: 1, dn: 'DN-0001', date: '2026-10-14', lines: { 11: 10 }, xero: null, deliveredOn: '2026-10-14', deliveredAt: '2026-10-14T14:35:00Z',
        deliveredBy: 'levi@clarke-lane.example', receivedBy: 'A Buyer', signature: FAKE_SIGNATURE, deliveryNote: 'Signed at goods-in' },
      { id: 5, dn: 'DN-0005', date: '2026-10-15', lines: { 12: 10 }, xero: null, emailedAt: '2026-10-15T09:30:00Z' }] },
  { id: 2, so: 'SO-9782', quote: '', spQuoteId: null, customer: 'Second Example Ltd', contactName: '', contactEmail: '', po: '',
    ordered: '2026-10-14', due: '2026-11-04', notes: 'Rush', address: 'Unit 9, Sample Trading Estate\nExampletown EX1 2AB', status: 'open',
    // Each part its own route (Levi, 22 Oct): the cabinet is welded, its door and shelf are not.
    lines: [{ id: 21, lineNo: 1, partNo: 'CAB-2040', part: 'Cabinet', qty: 5, price: 310, due: '2026-11-04', procs: ['Laser', 'Fold', 'Weld', 'P/Coat Paint'] },
            { id: 22, lineNo: 2, partNo: 'CAB-2041', part: 'Cabinet door', qty: 5, price: 25, due: '2026-11-04', procs: ['Laser', 'Fold', 'P/Coat Paint'] },
            { id: 23, lineNo: 3, partNo: 'CAB-2042', part: 'Shelf', qty: 10, price: 12, due: '2026-11-04', procs: ['Laser', 'Fold'] }],
    procs: { 'Laser': { done: false }, 'Fold': { done: false }, 'Weld': { done: false }, 'P/Coat Paint': { done: false } }, despatches: [] },
];
const hide = j => role !== 'floor' ? j : { ...j, lines: j.lines.map(l => ({ ...l, price: null })) };
const find = id => jobs.find(j => j.id === id);
const whoEmail = () => role === 'md' ? 'levi@clarke-lane.example' : role === 'office' ? 'mandy@clarke-lane.example' : 'workshop@clarke-lane.example';
export const whoAmI = async () => ({ email: whoEmail(), name: role === 'md' ? 'Levi' : role === 'office' ? 'Mandy' : 'Shop Floor', role });
const files = new Map(); let fileNo = 1; const blobs = new Map();   // drawings: kept in this page only
export const loadJobs = async () => structuredClone(jobs).map(hide).map(j => ({ ...j, files: structuredClone(files.get(j.id) || []) }));
export const uploadDrawing = async (job, file, onProgress = () => {}) => { const f = { id: fileNo++, name: file.name, driveId: 'd', itemId: 'i' + fileNo, url: '#', size: file.size, mime: file.type, by: 'levi@example.com', at: new Date().toISOString() };
  blobs.set(f.itemId, file); files.set(job.id, [...(files.get(job.id) || []), f]); onProgress(1); return f; };
export const drawingBlob = async f => blobs.get(f.itemId) || (f.itemId.startsWith('sp') ? (await fetch('/dev/example-drawing.pdf')).blob() : undefined);
// Parts library, in this page only (made-up).
const parts = []; let partNo = 1;
export const loadParts = async () => structuredClone(parts);
export const addPart = async ({ customer, customerKey, partNo: no, description }) => {
  if (parts.some(p => p.customerKey === customerKey && p.partNo.toUpperCase() === no.toUpperCase())) throw new Error(`${no} is already in the parts list for ${customer}`);
  const id = partNo++; parts.push({ id, customer, customerKey, partNo: no, description: description || '', by: 'mandy@example.com', at: new Date().toISOString(), files: [] }); return id; };
export const updatePart = async (id, patch) => { Object.assign(parts.find(p => p.id === id), patch); };
export const deletePart = async id => { parts.splice(parts.findIndex(p => p.id === id), 1); };
export const addPartFile = async (partId, f) => { const id = fileNo++; parts.find(p => p.id === partId).files.unshift({ ...f, id, partId, by: 'mandy@example.com', at: new Date().toISOString() }); return id; };
export const uploadPartDrawing = async (part, file, onProgress = () => {}) => { const itemId = 'i' + (fileNo + 1000); blobs.set(itemId, file); onProgress(1);
  return addPartFile(part.id, { name: file.name, driveId: 'd', itemId, url: '#', size: file.size, mime: file.type }); };
export const removePartFile = async id => { for (const p of parts) p.files = p.files.filter(f => f.id !== id); };
export const linkPartFile = async (jobId, pf) => { files.set(jobId, [...(files.get(jobId) || []), { id: fileNo++, name: pf.name, driveId: pf.driveId, itemId: pf.itemId, url: '#', size: pf.size, mime: pf.mime, by: 'mandy@example.com', at: new Date().toISOString(), partFileId: pf.id }]); };
export const markJobFileFromPart = async (jobFileId, pfId) => { for (const v of files.values()) for (const f of v) if (f.id === jobFileId) f.partFileId = pfId; };
export const removeDrawing = async id => { for (const [k, v] of files) files.set(k, v.filter(f => f.id !== id)); };
export const setProcess = async (id, p, done, by) => { find(id).procs[p] = done ? { done, by, at: new Date().toISOString() } : { done: false }; };
export const setJobProcesses = async (id, add, remove) => { const j = find(id); add.forEach(p => { j.procs[p] = { done: false }; }); remove.forEach(p => delete j.procs[p]); };
export const updateJob = async (id, patch) => { if ('contact_email' in patch) find(id).contactEmail = patch.contact_email; };
let nextLine = 100;
export const createJob = async p => {
  const id = jobs.length + 1, so = p.so_number || 'SO-97' + (82 + id);
  jobs.push({ id, so, quote: p.quote_no, spQuoteId: p.sp_quote_id, xeroQuoteId: p.xero_quote_id, customer: p.customer, contactName: p.contact_name, contactEmail: p.contact_email || '',
    po: p.customer_po, ordered: '2026-10-15', due: p.due_date, notes: p.notes, address: p.delivery_address, status: 'open',
    lines: p.lines.map((l, i) => ({ id: nextLine++, lineNo: i + 1, partNo: (l.part_no || '').trim(), part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date, po: l.customer_po || '', procs: l.processes || [] })),
    // As create_job: the order's processes are those sent plus every process a line needs.
    procs: Object.fromEntries([...new Set([...p.processes, ...p.lines.flatMap(l => l.processes || [])])].map(x => [x, { done: false }])), despatches: [] });
  return { id, so_number: so };
};
export const amendJob = async (id, p) => {
  const j = find(id);
  Object.assign(j, { po: p.customer_po, contactName: p.contact_name, address: p.delivery_address, notes: p.notes });
  // As amend_job: a line sent without part_no or processes keeps the one it had; a process a line now needs is added.
  const was = id => j.lines.find(x => x.id === id);
  j.lines = p.lines.map((l, i) => ({ id: l.id || nextLine++, lineNo: i + 1, partNo: l.part_no != null ? String(l.part_no).trim() : (was(l.id)?.partNo || ''), part: l.part, qty: l.qty, price: l.unit_price, due: l.due_date, po: l.customer_po || '',
    procs: Array.isArray(l.processes) ? l.processes : (was(l.id)?.procs || []) }));
  for (const x of j.lines.flatMap(l => l.procs)) j.procs[x] ??= { done: false };
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
const pfs = []; let pfNo = 1; const office = {}; const pos = [];
export const loadPurchaseOrders = async () => structuredClone(pos);
const chases = [];
export const loadChases = async () => structuredClone(chases);
export const addChase = async c => { chases.unshift({ id: chases.length + 1, ...c, at: new Date().toISOString() }); };
export const loadProformas = async () => structuredClone(pfs);
export const createProforma = async (jobId, lines) => { const j = find(jobId);
  const ls = lines.filter(l => l.qty > 0).map(l => { const x = j.lines.find(y => y.id === l.job_line_id); return { job_line_id: x.id, part: x.part, qty: l.qty, unit_price: x.price, net: Math.round(l.qty * x.price * 100) / 100 }; });
  if (!ls.length) throw new Error('Enter a quantity for at least one part.');
  const net = ls.reduce((a, l) => a + l.net, 0), p = { id: pfNo, pf: 'PF-' + String(pfNo++).padStart(4, '0'), jobId, lines: ls, net, vat: Math.round(net * 20) / 100, at: new Date().toISOString() };
  pfs.push(p); return { id: p.id, pf_number: p.pf }; };
export const markProforma = async (id, what) => { const p = pfs.find(x => x.id === id);
  if (what === 'emailed') p.emailedAt = new Date().toISOString(); if (what === 'paid') p.paidOn = '2026-10-19'; if (what === 'unpaid') p.paidOn = null;
  if (what === 'cancel') p.cancelledAt = new Date().toISOString(); if (what === 'uncancel') p.cancelledAt = null; };
export const loadOfficeSettings = async () => ({ ...office });
export const saveOfficeSetting = async (k, v) => { if (v == null || v === '') delete office[k]; else office[k] = v; };
const settings = {};
export const loadSettings = async () => ({ ...settings });
export const saveSetting = async (k, v) => { if (v == null) delete settings[k]; else settings[k] = v; };
export const dismissQuote = async id => { dismissed.push(id); };
export const restoreQuote = async id => { dismissed = dismissed.filter(x => x !== id); };
export const deleteJob = async id => { const j = find(id); if (j.despatches.length) throw new Error('This order has despatch notes, so it cannot be deleted.'); jobs = jobs.filter(x => x !== j); };
export const setJobDue = async (jobId, from, to) => { const j = find(jobId); let n = 0;
  for (const l of j.lines) if (l.due === from) { const sent = j.despatches.reduce((a, d) => a + (d.lines[l.id] || 0), 0); if (l.qty > sent) { l.due = to; n++; } }
  if (!n) throw new Error('Nothing still to dispatch is due on that date. Use Amend on Sales orders instead.'); return n; };
export const xeroStatus = async () => sessionStorage.getItem('fakeXero') ? { tenant_name: 'Clarke Lane Engineering Ltd', connected_by: 'levi@clarke-lane.co.uk', connected_at: '2026-10-15T09:00:00Z' } : null;
export const xeroLeft = { day: 4321, minute: 58, at: new Date().toISOString() };   // made up
export const xero = async (route, body) => {
  if (route === 'connect') { sessionStorage.setItem('fakeXero', '1'); return { url: location.pathname + '?xero=connected#xero' }; }
  if (route === 'debts') return { invoices: [   // made-up customers and figures
    { id: 'd1', number: 'INV-30811', reference: 'PO 4471', contactId: 'cx1', customer: 'Example Customer Ltd', date: '2026-07-14', due: '2026-08-31', total: 1840, owed: 1840 },
    { id: 'd2', number: 'INV-30902', reference: '', contactId: 'cx1', customer: 'Example Customer Ltd', date: '2026-08-04', due: '2026-09-30', total: 655.2, owed: 655.2 },
    { id: 'd3', number: 'INV-30950', reference: 'P-77', contactId: 'cx2', customer: 'Fourth Example Ltd', date: '2026-08-12', due: '2026-09-30', total: 420, owed: 210 },
    { id: 'd4', number: 'INV-31990', reference: '', contactId: 'cx1', customer: 'Example Customer Ltd', date: '2026-10-02', due: '2026-11-30', total: 300, owed: 300 }] };
  if (route === 'online') return { links: { d1: 'https://in.xero.com/example' } };
  if (route === 'month') return { from: body.from, to: body.to, creditsRead: true, invoices: [   // made-up figures
    { id: 'xm1', number: 'INV-31901', reference: 'P31600', customer: 'Example Customer Ltd', date: body.from, net: 2600 },
    { id: 'xm2', number: 'INV-31902', reference: 'Sage SO 9600', customer: 'Sample Works Ltd', date: body.from, net: 1550 },
    { id: 'xm3', number: 'CN-0101', reference: '', customer: 'Sample Works Ltd', date: body.from, net: -150, credit: true }] };
  if (route === 'read') return { organisation: 'Clarke Lane Engineering Ltd', highestSo: 9780, counterNext: 9783,
    quotes: [{ id: 'q1', number: 'SO-9776', status: 'ACCEPTED', customer: 'Example Customer Ltd', reference: 'P31614', date: '2026-10-01', expiry: '2026-11-07', subTotal: 113.27,
      lines: [{ description: 'Bracket 2mm', qty: 10, unit: 11.327, amount: 113.27 }] }],
    invoices: [] };
  if (route === 'contacts') return { contacts: [{ id: 'c1', name: 'Example Customer Limited', postcode: 'SO14 3TJ' }, { id: 'c2', name: 'Second Example Ltd', postcode: 'SO50 6FR' }, { id: 'c3', name: 'Third Example Engineering', postcode: 'PO1 2NH' }, { id: '00000000-0000-0000-0000-0000000000a1', name: 'Example Powder Coaters Ltd', postcode: 'SO15 1AA', supplier: true }, { id: '00000000-0000-0000-0000-0000000000a2', name: 'Example Steel Supplies', postcode: 'SO16 2BB', supplier: true }, { id: '00000000-0000-0000-0000-0000000000a3', name: 'Example Metals Ltd', postcode: 'SO17 3CC', supplier: true }, { id: '00000000-0000-0000-0000-0000000000a4', name: 'Sample Alloys Ltd', postcode: 'SO18 4DD', supplier: true }],
    defaults: { accountCode: '200', taxType: 'OUTPUT2', from: 'your last 100 invoices' } };
  if (route === 'contact' && /a\d$/.test(body.id)) return { id: body.id, name: 'Supplier', email: 'sales' + body.id.slice(-1) + '@example.com', person: '', address: '' };
  if (route === 'history') return salesHistory();
  if (route === 'bills') return { from: '2025-10-20', bills: [   // made-up suppliers and prices
    { number: 'B-1001', supplier: 'Example Steel Supplies', date: '2026-08-12', description: 'ALU SHEET 5083 H111 3.0MM 2500X1250', qty: 5, unit: 74.2, amount: 371 },
    { number: 'B-1044', supplier: 'Example Metals Ltd', date: '2026-09-03', description: 'Stainless 304 2B 1.5mm sheet 2500 x 1250', qty: 2, unit: 51.8, amount: 103.6 }] };
  if (route === 'contact') return { id: body.id, name: 'Example Customer Limited', email: 'buyer@example.com', person: 'Sam Buyer', address: 'Unit 4, Example Park\nSouthampton\nSO1 1AA' };
  if (route === 'send') return { results: body.items.map((it, i) => { for (const j of jobs) for (const d of j.despatches) if (d.id === it.despatchId) d.xero = { no: 'INV-3200' + i };
    return { despatchId: it.despatchId, ok: true, invoiceNo: 'INV-3200' + i }; }) };
  if (route === 'items') return { total: fakeItems.length + 1, items: [...fakeItems, ...(new URLSearchParams(location.search).has('many') ? [...Array(8000)].map((_, i) => ({ code: `EXA0${i}-11-${i}`, description: `Made-up part ${i}`, price: 1 + i % 50, sold: false })) : []), { code: 'EXA01-11-1234', name: 'Post', description: 'Post - Rear LH - Support (made up)', price: 42.5, sold: false }] };
  if (route === 'po') { const no = 'PO-' + String(pos.length + 1).padStart(4, '0'), sup = body.contactId.endsWith('a1') ? 'Example Powder Coaters Ltd' : 'Example Steel Supplies';
    pos.push({ id: pos.length + 1, jobId: body.jobId, xeroId: 'x' + pos.length, no, supplier: sup, supplierId: body.contactId, account: body.accountCode || '', delivery: body.deliveryDate || null, lines: body.lines, net: body.lines.reduce((a, l) => a + l.qty * l.unit, 0), at: new Date().toISOString() });
    return { id: 'x', number: no, supplier: sup, recorded: true }; }
  if (route === 'invoices') return { invoices: body.ids.map(id => ({ id, number: 'INV-0001', status: 'DRAFT' })) };
  if (route === 'disconnect') { sessionStorage.removeItem('fakeXero'); return {}; }
};
let cmap = new Map();
export const loadContactMap = async () => new Map(cmap);
export const saveContact = async (k, c) => { cmap.set(k, c); };
export const markDespatch = async (id, what, receivedBy = '', signature = '', note = '') => {
  if (signature && (signature.length > 80000 || !signature.startsWith('data:image/png;base64,'))) throw new Error('Not saved: Not a signature.');
  for (const j of jobs) for (const d of j.despatches) if (d.id === id) {
  if (what === 'emailed') d.emailedAt = new Date().toISOString();
  if (what === 'delivered') { const now = new Date(); Object.assign(d, { deliveredOn: now.toLocaleDateString('en-CA'), deliveredAt: now.toISOString(), deliveredBy: whoEmail(),
    receivedBy: receivedBy.trim() || d.receivedBy || '', signature: signature || d.signature || '', deliveryNote: note.trim() || d.deliveryNote || '' }); }
  if (what === 'undelivered') Object.assign(d, { deliveredOn: null, deliveredAt: null, deliveredBy: null, receivedBy: '', signature: '', deliveryNote: '' }); } };
export const loadSignature = async id => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) return d.signature || ''; return ''; };
export const markAckEmailed = async id => { find(id).ackEmailedAt = new Date().toISOString(); };
export let lastDraft = null;
export const draftEmail = async m => { lastDraft = { ...m, pdfBytes: Math.round((m.pdfBase64 || "").length * 0.75) }; window.__lastDraft = lastDraft; return null; };
let xorders = [];
export const loadXeroOrders = async () => structuredClone(xorders);
export const importXeroOrders = async qs => { let n = 0; for (const q of qs) if (!xorders.some(x => x.id === q.id)) { xorders.push({ ...q, importedAt: new Date().toISOString(), importedBy: 'levi@clarke-lane.co.uk', dismissed: false }); n++; } return n; };
export const dismissXeroOrder = async (id, d) => { xorders.find(x => x.id === id).dismissed = d; };
export const setStationOrder = async (p, ids) => { for (const j of jobs) if (j.procs[p]) { const n = ids.indexOf(j.id); j.procs[p].place = n < 0 ? null : n + 1; } };
export const setRunningOrder = async ids => { for (const j of jobs) { const n = ids.indexOf(j.id); j.priority = n < 0 ? null : n + 1; } };
jobs.push(
  { id: 3, so: 'SO-9783', quote: '', spQuoteId: null, customer: 'Fourth Example Ltd', contactName: '', contactEmail: '', po: 'PO-77', ordered: '2026-10-15', due: '2026-11-12', notes: '', address: '', status: 'open',
    lines: [{ id: 31, lineNo: 1, partNo: 'GP-4410', part: 'Guard plate', qty: 40, price: 8.5, due: '2026-11-12' }], procs: { 'Laser': { done: false }, 'Fold': { done: false } }, despatches: [{ id: 3, dn: 'DN-0003', date: '2026-10-15', lines: { 31: 10 }, xero: null }] },
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
let book = { people: [{ id: 1, key: 'fourthexample', customer: 'Fourth Example Ltd', role: 'deliveries', name: 'Goods In Team', email: 'goodsin@example.com', phone: '07700 900123', notes: '', main: true }],
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

// Work sent out: one job out at a made-up coater, a few days overdue.
const outwork = [{ id: 1, jobId: 2, process: 'P/Coat Paint', supplier: 'Example Coaters Ltd', items: '5 × Cabinet', finish: 'RAL 7035', sentOn: '2026-10-12', dueBack: '2026-10-16', backOn: null, note: '', sentBy: 'Shop Floor', backBy: null }];
let outNo = 2;
let notes = [{ id: 1, jobId: 1, body: 'Customer has asked for these to be packed in boxes of 10, not bagged.', byName: 'Mandy', fromFloor: false, seenBy: null, seenAt: null, at: new Date(Date.now() - 3 * 36e5).toISOString() },
  { id: 2, jobId: 3, body: 'Short of 3mm sheet for the last 20. Can we get more in by Thursday?', byName: 'Dave', fromFloor: true, seenBy: null, seenAt: null, at: new Date(Date.now() - 50 * 6e4).toISOString() }];
let noteNo = 3;
export const loadNotes = async () => structuredClone(notes);
export const addNote = async ({ jobId, body, by, fromFloor }) => { notes.push({ id: noteNo++, jobId, body: body.trim(), byName: by.trim(), fromFloor: !!fromFloor, seenBy: null, seenAt: null, at: new Date().toISOString() }); };
export const seenNote = async (id, by) => { const n = notes.find(x => x.id === id); if (n && !n.seenBy && n.fromFloor === (role !== 'floor')) Object.assign(n, { seenBy: by, seenAt: new Date().toISOString() }); };
export const deleteNote = async id => { if (role === 'floor') throw new Error('The note was not removed. Only Levi and Mandy can remove notes.'); notes = notes.filter(x => x.id !== id); };
let research = [{ key: 'examplecustomer', customer: 'Example Customer Ltd', website: 'example.com', about: 'Example Customer makes outdoor electrical enclosures and kiosks for councils and utilities, from a works in Hampshire.',
  news: [{ text: 'Opened a second assembly unit in the spring and is hiring two fitters.', url: 'https://example.com/news' }, { text: 'Won a framework to supply EV charging kiosks.', url: 'https://example.com/ev' }],
  openings: [{ idea: 'Offer to quote the kiosk frames and doors for the EV contract', why: 'They won an EV kiosk framework; they already buy brackets from us.', angle: 'Congratulate them on the EV framework and offer to quote the frames and doors, laser cut, folded, welded and powder coated in one place.' },
    { idea: 'Ask about the new assembly unit', why: 'A second unit usually means more parts.', angle: 'Ask whether the new unit will need its own regular parts and whether we could hold stock for call-off.' }],
  sources: ['https://example.com'], at: new Date(Date.now() - 864e5).toISOString() }];
let ideas = [];
let ideaNo = 1;
export const loadResearch = async () => structuredClone(research);
export const saveResearch = async (key, customer, website, x) => { research = [{ key, customer, website, about: x.about, news: x.news, openings: x.openings, sources: x.sources, at: new Date().toISOString() }, ...research.filter(r => r.key !== key)]; };
export const loadIdeas = async () => structuredClone(ideas);
export const saveIdeas = async list => { const at = new Date().toISOString(); list.forEach(i => ideas.push({ id: ideaNo++, title: i.title, why: i.why, action: i.action, angle: i.angle, key: i.key || null, customer: i.customer || '', status: 'new', batchAt: at })); };
export const setIdea = async (id, status) => { ideas.find(x => x.id === id).status = status; };
export const loadOutwork = async () => structuredClone(outwork);
export const sendOut = async f => { const id = outNo++; outwork.push({ id, ...f, supplier: f.supplier.trim(), dueBack: f.dueBack || null, backOn: null, sentBy: f.by, backBy: null }); return id; };
export const updateOutwork = async (id, f) => { const r = outwork.find(x => x.id === id); Object.assign(r, f); if ('backOn' in f && !f.backOn) { r.backOn = null; r.backBy = null; } };
export const deleteOutwork = async id => { if (role === 'floor') throw new Error('It was not removed. Only Levi and Mandy can remove a send.'); outwork.splice(outwork.findIndex(x => x.id === id), 1); };

// Metal prices: one made-up enquiry already priced, so the history has something in it.
const rfqs = [{ id: 1, jobId: null, lines: [{ material: 'Aluminium', grade: '5083', form: 'Sheet', thickness: '3', size: '2500 × 1250', qty: 4, unit: 'sheets' }], note: '', status: 'ordered',
  orderedFrom: 'Example Steel Supplies', orderedPo: 'PO-0001', by: 'mandy@example.com', createdAt: '2026-09-28T09:00:00Z',
  quotes: [{ id: 1, rfqId: 1, supplierId: '00000000-0000-0000-0000-0000000000a2', supplier: 'Example Steel Supplies', email: 'sales2@example.com', askedAt: '2026-09-28T09:05:00Z', prices: [76.5], carriage: 0, leadDays: 2, validUntil: null, note: '', enteredAt: '2026-09-29T10:00:00Z' },
    { id: 2, rfqId: 1, supplierId: '00000000-0000-0000-0000-0000000000a3', supplier: 'Example Metals Ltd', email: 'sales3@example.com', askedAt: '2026-09-28T09:05:00Z', prices: [79], carriage: 15, leadDays: 3, validUntil: null, note: '', enteredAt: '2026-09-29T11:00:00Z' }] }];
let rfqNo = 2, mqNo = 3;
export const loadMetal = async () => structuredClone(rfqs).sort((a, b) => b.id - a.id);
export const createRfq = async ({ jobId, lines, note, suppliers }) => { const id = rfqNo++; rfqs.push({ id, jobId: jobId || null, lines, note: note || '', status: 'open', orderedFrom: null, orderedPo: null, by: 'mandy@example.com', createdAt: new Date().toISOString(),
  quotes: suppliers.map(x => ({ id: mqNo++, rfqId: id, supplierId: x.supplierId || '', supplier: x.supplier.trim(), email: x.email.trim(), askedAt: null, prices: null, carriage: null, leadDays: null, validUntil: null, note: '' })) }); return id; };
export const markAsked = async qid => { for (const r of rfqs) for (const q of r.quotes) if (q.id === qid) q.askedAt = new Date().toISOString(); };
export const saveQuote = async (qid, f) => { for (const r of rfqs) for (const q of r.quotes) if (q.id === qid) Object.assign(q, { prices: f.prices, carriage: f.carriage, leadDays: f.leadDays, validUntil: f.validUntil || null, note: f.note || '', enteredBy: f.by, enteredAt: new Date().toISOString() }); };
export const setRfq = async (id, p) => { Object.assign(rfqs.find(r => r.id === id), p); };

// Sales: made-up quote history (won and not) and invoice history, so every part of the Sales screen has something in it.
const ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const CUSTS = ['Example Customer Ltd', 'Second Example Ltd', 'Third Example Ltd', 'Fourth Example Ltd', 'Fifth Example Ltd', 'Sample Works Ltd'];
const pastQuotes = Array.from({ length: 36 }, (_, i) => { const won = i % 5 < 2, d = 40 + i * 6;
  return { spId: 400 + i, quoteNo: 'Q-' + String(200 + i).padStart(4, '0'), customer: CUSTS[i % CUSTS.length], contactName: 'Sam Buyer', contactEmail: 'buyer@example.com', status: won ? 'Ordered' : 'Quote',
    quoteDate: ago(d), wonDate: won ? ago(d - 3 - (i % 9)) : '', sellTotal: 300 + (i * 137) % 2400, carriage: i % 3 ? 0 : 15, deliveryDays: 10 }; });
const openQuotes = [[2, 'Example Customer Ltd', 1850], [9, 'Second Example Ltd', 4200], [13, 'Sample Works Ltd', 960], [21, 'Fourth Example Ltd', 2750], [33, 'Third Example Ltd', 640], [75, 'Fifth Example Ltd', 3100]]
  .map(([d, c, v], i) => ({ spId: 500 + i, quoteNo: 'Q-' + String(320 + i).padStart(4, '0'), customer: c, contactName: 'Sam Buyer', contactEmail: 'buyer@example.com', status: 'Quote', quoteDate: ago(d), wonDate: '', sellTotal: v, carriage: 0, deliveryDays: 10 }));
export const allQuotes = async () => [...(await orderedQuotes()).map(q => ({ ...q, wonDate: q.quoteDate })), ...pastQuotes, ...openQuotes];
function salesHistory() {
  const inv = [];
  const add = (c, id, every, from, n, item, net) => { for (let k = 0; k < n; k++) inv.push({ contactId: id, customer: c, date: ago(from + k * every), number: 'INV-' + (5000 + inv.length), net,
    lines: [{ description: item, code: '', qty: 10, amount: net }, { description: 'Carriage', code: '', qty: 1, amount: 15 }] }); };
  add('Example Customer Ltd', 'cx1', 14, 5, 30, 'Bracket BRK-1 3mm S275', 640);
  add('Sample Works Ltd', 'cx6', 21, 95, 16, 'Control box enclosure, powder coated RAL 7035', 1450);   // usually every 3 weeks; quiet for 3 months
  add('Fourth Example Ltd', 'cx2', 30, 12, 20, 'Guard plate 2mm Zintec', 520);
  add('Old Example Ltd', 'cx9', 45, 260, 8, 'Stainless hopper 304', 2200);                            // lapsed
  add('Tenth Example Ltd', 'cx7', 20, 30, 6, 'Shelf bracket 2mm Zintec', 380);                          // usually every 20 days: due a reorder
  add('Second Example Ltd', 'cx3', 28, 40, 5, 'Mounting plate 3mm aluminium 5083', 290);                // usually every 4 weeks: due a reorder
  add('Fifth Example Ltd', 'cx5', 35, 50, 4, 'Cable tray lid 1.5mm galvanised', 460);                    // usually every 5 weeks: due a reorder
  return { invoices: inv, earliest: inv.reduce((m, x) => (!m || x.date < m ? x.date : m), '') };
}
const follow = {}; let actNo = 1;
// The reorder round: Mandy asked Tenth Example about its brackets on the phone three days ago, so it shows as asked.
const salesActs = [{ id: actNo++, spId: null, customer: 'Tenth Example Ltd', kind: 'reorder', note: 'Reorder: Shelf bracket 2mm Zintec', by: 'mandy@clarke-lane.example', at: ago(3) + 'T10:00:00Z' }];
export const loadSales = async () => ({ follow: structuredClone(follow), actions: structuredClone(salesActs) });
export const setFollow = async (q, p) => { follow[q.spId] = { ...(follow[q.spId] || { state: 'open' }), ...p }; };
export const addSalesAction = async a => { salesActs.unshift({ id: actNo++, spId: a.spId ?? null, customer: a.customer, kind: a.kind, note: a.note || '', by: 'levi@example.com', at: new Date().toISOString() }); };
export const logSalesEmail = async () => {};
export const salesAiCheckin = async facts => ({ subject: `Next batch of ${facts.theyBuy?.[0]?.item || 'parts'}?`, greeting: facts.contactFirstName ? `Hi ${facts.contactFirstName},` : 'Hello,',
  paragraphs: ['Made-up AI text for the practice page: it has been a little while since your last order, so I thought I would check in.', 'If you have drawings for the next batch, send them over and we will get a price back to you quickly.'], model: 'practice', costUsd: 0 });

// Customers, enquiries and tasks: made-up people and emails only.
export const practice = true;   // the board skips what would cost real AI calls here (the topic backfill, 21 Oct)
const noRefs = { so: '', po: '', quote: '' };
export const salesAi = async (facts, kind = 'checkin') => {
  // Customers' emails (21 Oct): a complaint, a PO against a quote and a delivery question, with their topic and numbers.
  if (kind === 'enquiry' && /arrived bent/i.test(facts.text)) return { kind: 'customer', summary: 'The brackets on SO-9782 arrived bent; they need 10 re-made urgently.', company: 'Second Example Ltd', person: facts.fromName, phone: '', wants: '10 brackets re-made', hasDrawings: false, topic: 'complaint', refs: { ...noRefs, so: 'SO-9782' } };
  if (kind === 'enquiry' && /PO-4471/.test(facts.text)) return { kind: 'customer', summary: 'Sends their PO-4471 for quote Q-0320.', company: 'Example Customer Ltd', person: facts.fromName, phone: '', wants: '', hasDrawings: true, topic: 'po', refs: { so: '', po: 'PO-4471', quote: 'Q-0320' } };
  if (kind === 'enquiry') return /laser|quote|price/i.test(facts.subject + facts.text)
    ? { kind: 'enquiry', summary: 'Asks for a price on laser cut and folded brackets.', company: 'Newco Fabrications Ltd', person: facts.fromName, phone: '01234 567890', wants: '50 brackets, 3mm mild steel, laser cut and folded, powder coated black', hasDrawings: true, topic: 'other', refs: noRefs }
    : /delivery|order/i.test(facts.subject) ? { kind: 'customer', summary: 'Asks when SO-9781 will be delivered.', company: 'Example Customer Ltd', person: facts.fromName, phone: '', wants: '', hasDrawings: false, topic: 'delivery', refs: { ...noRefs, so: 'SO-9781' } }
    : { kind: 'other', summary: 'A sales pitch.', company: '', person: facts.fromName, phone: '', wants: '', hasDrawings: false, topic: 'other', refs: noRefs };
  if (kind === 'reply' && facts.topic) return { subject: 'Re: ' + facts.subject, greeting: 'Hi ' + String(facts.fromName || '').split(' ')[0] + ',', model: 'practice',
    paragraphs: [facts.topic === 'complaint' ? 'Made-up AI reply for the practice page: I am sorry the parts were not right. We will look at it today.' : 'Made-up AI reply for the practice page: thank you for your email.',
      facts.topic === 'complaint' ? 'Could you send a couple of photos and the delivery note number, so we can put it right quickly?' : 'We will check it and come back to you with any effect on the price or the date.'] };
  if (kind === 'reply') return { subject: 'Re: ' + facts.subject, greeting: 'Hi ' + String(facts.fromName || '').split(' ')[0] + ',', paragraphs: ['Made-up AI reply for the practice page: thank you for your enquiry about ' + facts.wants + '.', facts.questions?.length ? 'We will price this and come back to you. To quote it properly, could you tell us:\n' + facts.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'We will price this and come back to you. Could you confirm when you need them and the delivery address?'], model: 'practice' };
  if (kind === 'summary') return { summary: 'Made-up AI summary: a regular customer for brackets, ordering about every two weeks and steady on last year.', nextStep: 'Ask whether they would like their brackets powder coated by us next time.', model: 'practice' };
  if (kind === 'research') return { found: true, about: `Made-up research for the practice page: ${facts.customer} designs and builds equipment from a works in the south of England.`,
    news: [{ text: 'Posted on LinkedIn about a new product range launching next spring.', url: 'https://www.linkedin.com/company/example' }],
    openings: [{ idea: 'Offer to prototype parts for the new range', why: 'A new range is launching and they already buy laser cut parts from us.', angle: 'Mention their new range and offer quick prototypes, cut, folded and finished in one place.' }],
    sources: ['https://example.com'], model: 'practice', costUsd: 0.12 };
  if (kind === 'ideas') return { ideas: (facts.customers || []).slice(0, 4).map((c, i) => ({ title: ['Ask about their next batch', 'Offer powder coating', 'Book a visit', 'Send a short catch-up'][i] + ': ' + c.customer,
    why: `Made-up idea for the practice page: they are ${c.trend} and buy ${(c.theyBuy || []).join(', ') || 'parts'}.`, action: ['call', 'email', 'visit', 'email'][i], customer: c.customer,
    angle: 'Made-up angle: a short, friendly note about what they usually order.' })).concat([{ title: 'Ask your three best customers who else they know', why: 'Made-up: referrals from happy regulars.', action: 'other', customer: '', angle: '' }]), model: 'practice', costUsd: 0.03 };
  // The quote pack and Three things today (21 Oct): made-up answers in the real shape.
  if (kind === 'quotepack') return { summary: `Made-up quote pack for the practice page: ${facts.company || facts.fromName || 'they'} want brackets, laser cut, folded and powder coated.`,
    parts: [{ partNo: 'BRK-100 rev B', description: 'Mounting bracket', material: 'S275 mild steel', thickness: '3mm', qty: '50', finish: 'Powder coat RAL 9005 black', processes: ['Laser', 'Fold', 'P/Coat Paint'], notes: 'Two folds at 90°' },
      { partNo: 'PLT-20', description: 'Backing plate', material: 'S275 mild steel', thickness: '3mm', qty: '', finish: 'Powder coat RAL 9005 black', processes: ['Laser', 'Tap & C/Sink'], notes: '4 × M6 tapped' }],
    questions: ['How many backing plates do you need?', 'Is revision B of the bracket the latest?', 'When do you need them, and where should they be delivered?'],
    watchOut: ['Hole positions are toleranced at ±0.1mm on the bracket.'], model: 'practice', costUsd: 0.1 };
  if (kind === 'digest') return { greeting: `Morning ${facts.name || 'there'}, three things worth doing first.`,
    lines: (facts.picks || []).map(p => ({ enquiry: 'Made-up: a new customer has waited over a day, and a quick reply wins most first orders.', task: 'Made-up: it is overdue and the customer is expecting to hear back.',
      quote: 'Made-up: the follow-up is due, and a call this morning is the best chance to win it.', late: 'Made-up: ring the customer before they ring you, with a new date.',
      reorder: 'Made-up: their usual gap has passed, so they are probably about to order again.', email: 'Made-up: a customer has written about an order, and an answer today keeps them.' })[p.kind] || ''), model: 'practice', costUsd: 0.004 };
  return salesAiCheckin(facts);
};
export const enquiryAttachments = async () => [];
export const enquiryText = async () => 'Hello, could you quote for 50 brackets, 3mm mild steel, laser cut and folded, powder coated black? Drawing attached. Thanks, Jo';
const digests = new Map();   // in memory, like the daily_digests table (one row per person per day)
export const loadDigest = async day => structuredClone(digests.get(day) || null);
export const saveDigest = async (day, x) => { digests.set(day, structuredClone({ ...x, at: new Date().toISOString() })); };
const staffRows = [{ email: 'levi@clarke-lane.example', name: 'Levi', role: 'md' }, { email: 'mandy@clarke-lane.example', name: 'Mandy', role: 'office' }, { email: 'workshop@clarke-lane.example', name: 'Shop Floor', role: 'floor' }];
export const loadStaff = async () => structuredClone(staffRows);
const tasks = [{ id: 1, title: 'Call Sam about the next bracket batch', customer: 'Example Customer Ltd', customerKey: 'examplecustomer', dueOn: ago(1), assignedTo: 'levi@clarke-lane.example', source: '', sourceRef: '', note: '', doneAt: null, doneBy: null, by: 'levi@clarke-lane.example', createdAt: ago(5) + 'T09:00:00Z' },
  { id: 2, title: 'Send Fourth Example the revised drawing', customer: 'Fourth Example Ltd', customerKey: 'fourthexample', dueOn: ago(-2), assignedTo: 'mandy@clarke-lane.example', source: '', sourceRef: '', note: '', doneAt: null, doneBy: null, by: 'levi@clarke-lane.example', createdAt: ago(2) + 'T09:00:00Z' }];
let taskNo = 3;
export const loadTasks = async () => structuredClone(tasks);
export const addTask = async t => { tasks.push({ id: taskNo++, title: t.title, customer: t.customer || '', customerKey: t.customerKey || '', dueOn: t.dueOn, assignedTo: t.assignedTo, source: t.source || '', sourceRef: String(t.sourceRef || ''), note: '', doneAt: null, doneBy: null, by: 'levi@example.com', createdAt: new Date().toISOString() }); };
export const setTask = async (id, p, by) => { const t = tasks.find(x => x.id === id); if ('done' in p) { t.doneAt = p.done ? new Date().toISOString() : null; t.doneBy = p.done ? by : null; } if ('dueOn' in p) t.dueOn = p.dueOn; };
export const deleteTask = async id => { tasks.splice(tasks.findIndex(x => x.id === id), 1); };
const enqs = []; let enqNo = 1;
export const loadEnquiries = async () => structuredClone(enqs).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
export const claimEnquiry = async m => { if (enqs.some(e => e.messageId === m.messageId)) return null; const id = enqNo++; enqs.push({ id, ...m, kind: null, summary: '', company: '', person: '', phone: '', wants: '', hasDrawings: false, customerKey: '', status: 'new', handledBy: null, handledAt: null, error: null, topic: '', refs: {}, quoteSpId: null, jobId: null }); return id; };
export const setEnquiry = async (id, p) => { const e = enqs.find(x => x.id === id); Object.assign(e, p); if ('quotePack' in p) e.quotePackAt = p.quotePack ? new Date().toISOString() : null; if ('status' in p) { e.handledBy = p.by || null; e.handledAt = p.status === 'new' ? null : new Date().toISOString(); } };
const insights = {};
export const loadInsight = async k => insights[k] || null;
export const saveInsight = async (k, c, x) => { insights[k] = { ...x }; };
export const inboxMessages = async () => [
  { graphId: 'g1', messageId: '<m1@example.net>', subject: 'Quote for laser cut brackets', fromEmail: 'jo@newco.example', fromName: 'Jo Bloggs', receivedAt: new Date(Date.now() - 26 * 36e5).toISOString(), text: 'Hello, could you quote for 50 brackets, 3mm mild steel, laser cut and folded, powder coated black? Drawing attached. Thanks, Jo', webLink: '', hasAttachments: true },
  { graphId: 'g2', messageId: '<m2@example.net>', subject: 'Delivery of our order', fromEmail: 'buyer@example.com', fromName: 'Sam Buyer', receivedAt: new Date(Date.now() - 5 * 36e5).toISOString(), text: 'When will SO-9781 be delivered?', webLink: '', hasAttachments: false },
  { graphId: 'g4', messageId: '<m4@example.net>', subject: 'Bent brackets', fromEmail: 'buyer@second.example', fromName: 'Alex Example', receivedAt: new Date(Date.now() - 2 * 36e5).toISOString(), text: 'Hello, the brackets on SO-9782 arrived bent, need 10 re-made urgently. Alex', webLink: '', hasAttachments: false },
  { graphId: 'g5', messageId: '<m5@example.net>', subject: 'Our purchase order', fromEmail: 'buyer@example.com', fromName: 'Sam Buyer', receivedAt: new Date(Date.now() - 4 * 36e5).toISOString(), text: 'Hi, please find our PO-4471 for Q-0320. Thanks, Sam', webLink: '', hasAttachments: true },
  { graphId: 'g3', messageId: '<m3@example.net>', subject: 'Boost your SEO today', fromEmail: 'sales@spammy.example', fromName: 'Spammy', receivedAt: new Date(Date.now() - 3 * 36e5).toISOString(), text: 'We can get you to page one.', webLink: '', hasAttachments: false }];
export const attachmentNames = async () => ['bracket-rev-B.pdf'];
export const searchMail = async (boxes, terms) => ({ consent: false, noAccess: [], errors: [], messages: [
  { id: 'e1', mailbox: 'me', subject: 'Next batch of brackets', from: 'buyer@example.com', fromName: 'Sam Buyer', to: ['levi@clarke-lane.example'], at: new Date(Date.now() - 3 * 864e5).toISOString(), preview: 'Hi Levi, we will need another 100 next month, can you hold the price?', webLink: '', internetMessageId: '<e1>' },
  { id: 'e2', mailbox: 'info@example.com', subject: 'Re: Quote Q-0320', from: 'levi@clarke-lane.example', fromName: 'Levi', to: ['buyer@example.com'], at: new Date(Date.now() - 6 * 864e5).toISOString(), preview: 'Hi Sam, please find our quote attached.', webLink: '', internetMessageId: '<e2>' }] });
export const loadActions = async () => structuredClone(salesActs);

// SharePoint Company Data (read only in the real board): made-up folders and files.
const spf = (id, name, path = '', at = '2024-01-01T00:00:00Z', size = 120000) => ({ id, itemId: id, driveId: 'd', name, path, url: '#', size, at, mime: '', folder: false });
const spFolderLists = {
  clients: ['Example Customer', 'Second Example', 'Sample Works', 'Fourth Example Engineering', 'MISCELLANEOUS'].map((n, i) => ({ ...spf('spc' + i, n, 'Company Data/01 Client Folder'), folder: true })),
  laser: ['Example Customer Ltd', 'Sample Works'].map((n, i) => ({ ...spf('spl' + i, n, 'Bystronic Drawings/Customers'), folder: true })),
  certs: ['304', 'S355', '316', '6082 T6', '1050', '6063 T6'].map((n, i) => ({ ...spf('spm' + i, n, 'Company Data/Mat Certs'), folder: true })) };
const spFiles = {
  spc0: [spf('sp1', 'QCLE01204 Brackets.xlsx', '', '2016-03-04T00:00:00Z'), spf('sp2', 'QCLE04410.pdf', 'Quotes', '2021-06-01T00:00:00Z'), spf('sp3', 'QCLE06120 Bracket repeat.xlsx', 'Quotes', '2025-09-12T00:00:00Z'),
    spf('sp4', 'BRK-1001 Issue 01.pdf', '01-PDF Files', '2019-02-01T00:00:00Z'), spf('sp5', 'BRK-1001 Issue 02.pdf', '01-PDF Files', '2024-05-20T00:00:00Z'), spf('sp6', 'BRK-1001 Issue 02.dxf', '04-DFX Files', '2024-05-20T00:00:00Z'),
    spf('sp7', 'Delivery Note 3310.pdf', '', '2025-10-01T00:00:00Z'), spf('sp8', 'Declaration of Conformity.pdf', '', '2025-10-02T00:00:00Z'), spf('sp9', 'Pro Forma 118.pdf', '', '2025-08-01T00:00:00Z')],
  spl0: [spf('sp20', '03-1111-0000 Issue 03.pdf', '', '2023-11-11T00:00:00Z'), spf('sp21', '03-1111-0000 Issue 04.pdf', '', '2025-01-15T00:00:00Z')],
  spc4: [spf('sp30', 'QCLE00950 - Second Example Ltd.xlsx', '', '2013-05-05T00:00:00Z'), spf('sp31', 'QCLE03000 - Someone Else.xlsx', '', '2019-05-05T00:00:00Z')],
  spc2: [spf('sp40', 'Control box Rev B.pdf', '', '2024-02-02T00:00:00Z')] };
let custFolders = [];
export const companyFolders = async which => structuredClone(spFolderLists[which]);
export const filesIn = async folder => { await new Promise(r => setTimeout(r, 300)); return structuredClone(spFiles[folder.itemId] || []); };
export const loadCustomerFolders = async () => structuredClone(custFolders);
export const setCustomerFolder = async (key, customer, kind, folder) => { custFolders = custFolders.filter(x => !(x.key === key && x.kind === kind));
  custFolders.push({ key, kind, customer, name: folder?.name || '', driveId: folder?.driveId || null, itemId: folder?.itemId || null, url: folder?.url || '' }); };
export const clearCustomerFolder = async (key, kind) => { custFolders = custFolders.filter(x => !(x.key === key && x.kind === kind)); };
export const linkSpFile = async (jobId, f) => { files.set(jobId, [...(files.get(jobId) || []), { id: fileNo++, name: f.name, driveId: f.driveId, itemId: f.itemId, url: '#', size: f.size, mime: f.mime, by: 'mandy@example.com', at: new Date().toISOString() }]); };
