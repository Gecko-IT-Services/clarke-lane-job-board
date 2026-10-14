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
export const setJobProcesses = async () => {}; export const updateJob = async () => {};
export const createJob = async p => { const id = jobs.length + 1; jobs.push({ id, so: 'SO-97' + (29 + id), quote: p.quote_no, spQuoteId: p.sp_quote_id, customer: p.customer, contactName: '', contactEmail: '', po: p.customer_po, ordered: '2026-10-14', due: p.due_date, calloffs: p.calloff_dates, notes: p.notes, lines: p.lines.map((l, i) => ({ id: id * 100 + i, lineNo: i + 1, part: l.part, qty: l.qty, price: l.unit_price })), procs: Object.fromEntries(p.processes.map(x => [x, { done: false }])), despatches: [] }); return { id, so_number: 'SO-97' + (29 + id) }; };
let dn = 2;
export const createDespatch = async (jobId, lines) => { const j = jobs.find(x => x.id === jobId); const d = { id: dn, dn: 'DN-000' + dn++, date: '2026-10-14', lines: Object.fromEntries(lines.map(l => [l.job_line_id, l.qty])), xero: null }; j.despatches.push(d); return { id: d.id, dn_number: d.dn }; };
export const markInvoiced = async (id, no) => { for (const j of jobs) for (const d of j.despatches) if (d.id === id) d.xero = { no }; };
export const onChange = async () => {};
export const orderedQuotes = async () => [
  { spId: 301, quoteNo: 'Q-0301', customer: 'Example Customer Ltd', status: 'Ordered', carriage: 0, sellTotal: 393, deliveryDays: 10 },
  { spId: 303, quoteNo: 'Q-0303', customer: 'Third Example Ltd', status: 'Ordered', carriage: 12.5, sellTotal: 290.25, deliveryDays: 0, quoteDate: '2026-10-12' }];
export const quoteLines = async () => [{ lineNo: 1, qty: 10, sellTotal: 290.25, desc: 'Valve guard', thickness: 2, material: 'Zintec', process: 'Laser', folds: 3, weld: 0, inserts: 0, paint: true, plating: 0, holes: 0 }];
