/**
 * Everything the board reads and writes. Jobs, ticks and despatches: Supabase.
 * Ordered quotes: Levi's SharePoint lists, read only.
 */
import { CONFIG } from './config.js';
import { getSupabase, graph, graphRaw } from './auth.js';
import { emailList } from './core/jobs.js';
import { QUOTE_FIELDS, LINE_FIELDS, resolveColumns, quoteLookupColumn, toQuote, toLine } from './core/quotes.js';

/** UK spelling on screen: the database names and older messages say despatch. */
const uk = m => String(m ?? '').replace(/espatch/g, 'ispatch');
const fail = (what, error) => { const e = new Error(uk(`${what}: ${error.message}`)); e.cause = error; throw e; };

/** Who is signed in, from the staff table. null role = not on the list. */
export async function whoAmI() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('me');
  if (error) fail('Could not read the staff list', error);
  const r = (data && data[0]) || {};
  return { email: r.email || '', name: r.name || '', role: r.role || null };
}

/** All jobs in the app's shape (see src/core/jobs.js). */
export async function loadJobs({ office }) {
  const sb = await getSupabase();
  const q = t => sb.from(t).select('*');
  const [jobs, lines, prices, procs, desps, dlines, files] = await Promise.all([
    q('jobs').order('id'), q('job_lines').order('line_no'),
    office ? q('job_line_prices') : Promise.resolve({ data: [] }),
    q('job_processes'), q('despatches').order('id'), q('despatch_lines'), q('job_files').order('id'),
  ]);
  for (const r of [jobs, lines, prices, procs, desps, dlines]) if (r.error) fail('Could not load the jobs', r.error);
  const price = new Map(prices.data.map(p => [p.job_line_id, Number(p.unit_price)]));
  const byJob = new Map(jobs.data.map(j => [j.id, {
    id: j.id, so: j.so_number, quote: j.quote_no, spQuoteId: j.sp_quote_id, xeroQuoteId: j.xero_quote_id, customer: j.customer,
    contactName: j.contact_name, contactEmail: j.contact_email, po: j.customer_po,
    ordered: j.ordered_on, due: j.due_date, notes: j.notes, address: j.delivery_address, status: j.status,
    createdBy: j.created_by, createdAt: j.created_at, ackEmailedAt: j.ack_emailed_at, priority: j.priority ?? null,
    lines: [], procs: {}, despatches: [], cancelledDespatches: [], files: [],
  }]));
  for (const l of lines.data) byJob.get(l.job_id)?.lines.push(
    { id: l.id, lineNo: l.line_no, part: l.part, qty: l.qty, due: l.due_date, po: l.customer_po || '', price: office ? (price.get(l.id) ?? null) : null });
  for (const p of procs.data) { const j = byJob.get(p.job_id); if (j) j.procs[p.process] = { done: !!p.done_at, by: p.done_by, at: p.done_at, place: p.place ?? null }; }
  const dById = new Map();
  for (const d of desps.data) {
    const o = { id: d.id, dn: d.dn_number, date: d.despatched_on, by: d.despatched_by, lines: {},
      xero: d.xero_invoice_no || d.xero_invoice_id ? { no: d.xero_invoice_no || '', id: d.xero_invoice_id || null, at: d.sent_to_xero_at } : null,
      emailedAt: d.emailed_at, deliveredOn: d.delivered_on, deliveredBy: d.delivered_by, receivedBy: d.received_by };
    if (d.cancelled_at) {   // kept for the record only: none of its quantities count as sent
      o.cancelled = { at: d.cancelled_at, by: d.cancelled_by };
      for (const x of d.cancelled_lines || []) o.lines[x.job_line_id] = x.qty;
      byJob.get(d.job_id)?.cancelledDespatches.push(o); continue;
    }
    dById.set(d.id, o); byJob.get(d.job_id)?.despatches.push(o);
  }
  for (const dl of dlines.data) { const d = dById.get(dl.despatch_id); if (d) d.lines[dl.job_line_id] = dl.qty; }
  // Drawings: a missing table (before the migration) just means none yet.
  for (const f of files.data || []) byJob.get(f.job_id)?.files.push({ id: f.id, name: f.name, driveId: f.drive_id, itemId: f.item_id,
    url: f.web_url, size: f.size, mime: f.mime, by: f.uploaded_by, at: f.uploaded_at, partFileId: f.part_file_id ?? null });
  return [...byJob.values()];
}

export async function setProcess(jobId, process, done, by) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('job_processes')
    .update(done ? { done_by: by, done_at: new Date().toISOString() } : { done_by: null, done_at: null }, { count: 'exact' })
    .match({ job_id: jobId, process });
  if (error) fail('The tick was not saved', error);
  if (!count) throw new Error('The tick was not saved. Your account may not be allowed to change this job.');
}

export async function setJobProcesses(jobId, add, remove) {
  const sb = await getSupabase();
  if (add.length) { const { error } = await sb.from('job_processes').insert(add.map(process => ({ job_id: jobId, process }))); if (error) fail('Processes not saved', error); }
  if (remove.length) { const { error } = await sb.from('job_processes').delete().eq('job_id', jobId).in('process', remove); if (error) fail('Processes not saved', error); }
}

export async function updateJob(jobId, patch) {
  const sb = await getSupabase();
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) fail('The job was not saved', error);
}

/** The running order: these jobs hold a place, top first; every other job goes back to date order. */
/** A station's own order: ids hold a place at that process, top first; the rest follow the running order. */
export async function setStationOrder(process, ids) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('set_station_order', { p_process: process, p_ids: ids });
  if (error) fail('The station order was not saved', error);
}
export async function setRunningOrder(ids) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('set_running_order', { p_ids: ids });
  if (error) fail('The running order was not saved', error);
}

/** Moves the job's lines due on `from` (and not yet fully sent) to `to`. Returns how many lines moved. */
export async function setJobDue(jobId, from, to) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('set_job_due', { p_job_id: jobId, p_from: from, p_to: to });
  if (error) fail('The due date was not changed', error);
  return data;
}

export async function createJob(payload) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('create_job', { payload });
  if (error) fail('The job was not created', error);
  return data;
}

/** Sage "Amend": header fields and lines (with their ids; new lines without). */
export async function amendJob(jobId, payload) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('amend_job', { p_job_id: jobId, payload });
  if (error) fail('The order was not amended', error);
  return data;
}

/** 'open' | 'held' | 'cancelled' */
export async function setJobStatus(jobId, status) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('jobs').update({ status }, { count: 'exact' }).eq('id', jobId);
  if (error) fail('Not saved', error);
  if (!count) throw new Error('Not saved. Only Levi and Mandy can change an order.');
}

export async function createDespatch(jobId, lines) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('create_despatch', { p_job_id: jobId, lines });
  if (error) fail('The dispatch note was not created', error);
  return data;
}

/** what: 'emailed' | 'delivered' | 'undelivered' */
export async function markDespatch(despatchId, what, receivedBy = '') {
  const sb = await getSupabase();
  const { error } = await sb.rpc('mark_despatch', { p_despatch_id: despatchId, p_what: what, p_received_by: receivedBy });
  if (error) fail('Not saved', error);
}
/** Cancel a dispatch note not yet invoiced: it stays, marked cancelled; its quantities are outstanding again. */
export async function cancelDespatch(despatchId) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('cancel_despatch', { p_despatch_id: despatchId });
  if (error) fail('Not cancelled', error);
}
export async function markAckEmailed(jobId) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('mark_ack_emailed', { p_job_id: jobId });
  if (error) fail('Not saved', error);
}

/**
 * An Outlook draft in the signed-in person's mailbox with the PDF attached. Never sends:
 * the person checks it in Outlook and presses Send. Returns Outlook's link to the draft.
 */
/** to and cc: one address, or several separated by commas or semicolons. */
export async function draftEmail({ to, cc, subject, html, fileName, pdfBase64 }) {
  const list = t => emailList(t).ok.map(address => ({ emailAddress: { address } }));
  const msg = await graph('/me/messages', { method: 'POST', scopes: CONFIG.MAIL_SCOPES, body: {
    subject, body: { contentType: 'HTML', content: html },
    toRecipients: list(to),
    ccRecipients: list(cc),
    attachments: pdfBase64 ? [{ '@odata.type': '#microsoft.graph.fileAttachment', name: fileName, contentType: 'application/pdf', contentBytes: pdfBase64 }] : [],
  } });
  return msg.webLink;
}

export async function markInvoiced(despatchId, invoiceNo) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('despatches')
    .update({ xero_invoice_no: invoiceNo, sent_to_xero_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', despatchId);
  if (error) fail('Not saved', error);
  if (!count) throw new Error('Not saved. Only Levi and Mandy can mark dispatches as invoiced.');
}

/* ---------- drawings: files in SharePoint (Factory Jobs › Documents › Job drawings › <SO>) ---------- */
let driveId;
async function factoryDrive() {
  driveId ??= (await graph(`/sites/${CONFIG.SP_SITE}:/drive?$select=id`)).id;
  return driveId;
}
const CHUNK = 320 * 1024 * 16;   // 5 MB, a multiple of 320 KiB as SharePoint asks
/** Uploads one file into the job's folder and records it on the job. onProgress(0..1). */
const spSafe = s => String(s).replace(/[\\/:*?"<>|#%]/g, '-').trim();
/** Puts a file into the Factory Jobs Documents library at folders/name (renamed if taken); returns { drive, item }. */
async function putFactoryFile(folders, file, onProgress) {
  if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} is over 100 MB. Make it smaller or put it in SharePoint by hand.`);
  const drive = await factoryDrive();
  const path = [...folders, file.name].map(x => encodeURIComponent(spSafe(x))).join('/');
  let item;
  if (file.size <= 4 * 1024 * 1024) {
    item = await (await graphRaw(`/drives/${drive}/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`,
      { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })).json();
    onProgress(1);
  } else {
    const s = await (await graphRaw(`/drives/${drive}/root:/${path}:/createUploadSession`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) })).json();
    for (let at = 0; at < file.size; at += CHUNK) {
      const end = Math.min(file.size, at + CHUNK);
      const r = await fetch(s.uploadUrl, { method: 'PUT', body: file.slice(at, end), headers: { 'Content-Range': `bytes ${at}-${end - 1}/${file.size}` } });
      if (!r.ok && r.status !== 202) throw new Error(`The upload of ${file.name} stopped (${r.status}). Try again.`);
      if (r.status === 200 || r.status === 201) item = await r.json();
      onProgress(end / file.size);
    }
  }
  return { drive, item };
}
export async function uploadDrawing(job, file, onProgress = () => {}) {
  const { drive, item } = await putFactoryFile(['Job drawings', job.so], file, onProgress);
  const sb = await getSupabase();
  const { error } = await sb.from('job_files').insert({ job_id: job.id, name: item.name, drive_id: drive, item_id: item.id,
    web_url: item.webUrl || '', size: item.size ?? file.size, mime: item.file?.mimeType || file.type || '' });
  if (error) fail(`${item.name} is in SharePoint but was not linked to ${job.so}`, error);
  return item;
}

/* ---------- parts library (office): a customer's part numbers and their drawings ---------- */
export async function loadParts() {
  const sb = await getSupabase();
  const [p, f] = await Promise.all([sb.from('parts').select('*').order('part_no'), sb.from('part_files').select('*').order('uploaded_at', { ascending: false })]);
  if (p.error) fail('Could not load the parts', p.error);
  if (f.error) fail('Could not load the part drawings', f.error);
  const by = new Map(p.data.map(x => [x.id, { id: x.id, customer: x.customer, customerKey: x.customer_key, partNo: x.part_no, description: x.description,
    by: x.created_by, at: x.created_at, files: [] }]));
  for (const x of f.data) by.get(x.part_id)?.files.push({ id: x.id, partId: x.part_id, name: x.name, driveId: x.drive_id, itemId: x.item_id,
    url: x.web_url, size: x.size, mime: x.mime, by: x.uploaded_by, at: x.uploaded_at });
  return [...by.values()];
}
export async function addPart({ customer, customerKey, partNo, description }) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('parts').insert({ customer, customer_key: customerKey, part_no: partNo.trim(), description: (description || '').trim() }).select().single();
  if (error) fail(error.code === '23505' ? `${partNo} is already in the parts list for ${customer}` : 'The part was not saved', error);
  return data.id;
}
export async function updatePart(id, patch) {
  const sb = await getSupabase();
  const { error } = await sb.from('parts').update(patch).eq('id', id);
  if (error) fail('The part was not saved', error);
}
export async function deletePart(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('parts').delete().eq('id', id);
  if (error) fail('The part was not removed', error);
}
/** A new drawing (or revision) for a part: into SharePoint › Part drawings › customer › part number. */
export async function uploadPartDrawing(part, file, onProgress = () => {}) {
  const { drive, item } = await putFactoryFile(['Part drawings', part.customer, part.partNo], file, onProgress);
  return addPartFile(part.id, { name: item.name, driveId: drive, itemId: item.id, url: item.webUrl || '', size: item.size ?? file.size, mime: item.file?.mimeType || file.type || '' });
}
/** Records a file already in SharePoint (e.g. a job's drawing) as a part's drawing; returns its id. */
export async function addPartFile(partId, f) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('part_files').insert({ part_id: partId, name: f.name, drive_id: f.driveId, item_id: f.itemId,
    web_url: f.url || '', size: f.size ?? null, mime: f.mime || '' }).select().single();
  if (error) fail(`${f.name} is in SharePoint but was not added to the part`, error);
  return data.id;
}
export async function removePartFile(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('part_files').delete().eq('id', id);
  if (error) fail('Not removed', error);
}
/** Links a part's drawing to a job: the same SharePoint file, never a copy. */
export async function linkPartFile(jobId, pf) {
  const sb = await getSupabase();
  const { error } = await sb.from('job_files').insert({ job_id: jobId, name: pf.name, drive_id: pf.driveId, item_id: pf.itemId,
    web_url: pf.url || '', size: pf.size ?? null, mime: pf.mime || '', part_file_id: pf.id });
  if (error) fail(`${pf.name} was not linked`, error);
}
export async function markJobFileFromPart(jobFileId, partFileId) {
  const sb = await getSupabase();
  const { error } = await sb.from('job_files').update({ part_file_id: partFileId }).eq('id', jobFileId);
  if (error) fail('Not saved', error);
}
/** The file's contents, for showing it on screen. */
export async function drawingBlob(f) {
  return (await graphRaw(`/drives/${f.driveId}/items/${f.itemId}/content`)).blob();
}
/** Takes the drawing off the job. The file stays in SharePoint. */
export async function removeDrawing(id) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('job_files').delete({ count: 'exact' }).eq('id', id);
  if (error) fail('Not removed', error);
  if (!count) throw new Error('Not removed. Only Levi and Mandy can remove drawings.');
}

/* ---------- purchase orders (office): made in Xero by the edge function, listed here ---------- */
export async function loadPurchaseOrders() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('purchase_orders').select('*').order('id');
  if (error) fail('Could not load the purchase orders', error);
  return data.map(p => ({ id: p.id, jobId: p.job_id, xeroId: p.xero_id, no: p.po_number, supplier: p.supplier_name, supplierId: p.supplier_id, account: p.account_code ?? '', delivery: p.delivery_date,
    lines: p.lines, net: Number(p.net), by: p.created_by, at: p.created_at }));
}

/* ---------- work sent out (powder coat, plating): anyone records it, Levi and Mandy delete ---------- */
const outRow = r => ({ id: r.id, jobId: r.job_id, process: r.process, supplier: r.supplier, items: r.items, finish: r.finish, sentOn: r.sent_on,
  dueBack: r.due_back, backOn: r.back_on, note: r.note, sentBy: r.sent_by, backBy: r.back_by });
export async function loadOutwork() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('outwork').select('*').order('id');
  if (error) fail('Could not load the work sent out', error);
  return data.map(outRow);
}
export async function sendOut({ jobId, process, supplier, items, finish, sentOn, dueBack, note, by }) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('outwork').insert({ job_id: jobId, process, supplier: supplier.trim(), items: items || '', finish: finish || '',
    sent_on: sentOn, due_back: dueBack || null, note: note || '', sent_by: by }).select('id').single();
  if (error) fail('It was not saved as sent out', error);
  return data.id;
}
export async function updateOutwork(id, f) {
  const sb = await getSupabase();
  const patch = {};
  for (const [k, c] of [['supplier', 'supplier'], ['items', 'items'], ['finish', 'finish'], ['sentOn', 'sent_on'], ['dueBack', 'due_back'], ['note', 'note']]) if (k in f) patch[c] = f[k] === '' && k === 'dueBack' ? null : f[k];
  if ('backOn' in f) { patch.back_on = f.backOn || null; patch.back_by = f.backOn ? f.backBy : null; }
  const { error, count } = await sb.from('outwork').update(patch, { count: 'exact' }).eq('id', id);
  if (error) fail('The change was not saved', error);
  if (!count) throw new Error('The change was not saved. Try again.');
}
export async function deleteOutwork(id) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('outwork').delete({ count: 'exact' }).eq('id', id);
  if (error) fail('It was not removed', error);
  if (!count) throw new Error('It was not removed. Only Levi and Mandy can remove a send.');
}

/* ---------- sales (Levi only): follow-ups on quotes and customers, and the AI email writer ---------- */
export async function allQuotes() {
  const s = await spLists();
  const items = await allItems(`/sites/${s.site}/lists/${s.quotes}/items?$expand=fields&$top=500`);
  return items.map(i => toQuote(i, s.qcol));
}
export async function loadSales() {
  const sb = await getSupabase();
  const [f, a] = await Promise.all([sb.from('quote_follow').select('*'), sb.from('sales_actions').select('*').order('created_at', { ascending: false }).limit(2000)]);
  for (const x of [f, a]) if (x.error) fail('Could not load the sales follow-ups', x.error);
  return { follow: Object.fromEntries(f.data.map(x => [x.sp_quote_id, { state: x.state, lostReason: x.lost_reason, nextOn: x.next_on, note: x.note, updatedAt: x.updated_at }])),
    actions: a.data.map(x => ({ id: x.id, spId: x.sp_quote_id, customer: x.customer, kind: x.kind, note: x.note, by: x.created_by, at: x.created_at })) };
}
export async function setFollow(q, patch) {
  const sb = await getSupabase();
  const row = { sp_quote_id: q.spId, quote_no: q.quoteNo, customer: q.customer, updated_at: new Date().toISOString() };
  if ('state' in patch) row.state = patch.state;
  if ('lostReason' in patch) row.lost_reason = patch.lostReason;
  if ('nextOn' in patch) row.next_on = patch.nextOn || null;
  if ('note' in patch) row.note = patch.note;
  const { error } = await sb.from('quote_follow').upsert(row, { onConflict: 'sp_quote_id' });
  if (error) fail('The follow-up was not saved', error);
}
export async function addSalesAction({ spId = null, customer, kind, note = '' }) {
  const sb = await getSupabase();
  const { error } = await sb.from('sales_actions').insert({ sp_quote_id: spId, customer, kind, note });
  if (error) fail('It was not noted', error);
}
export async function logSalesEmail({ customer, kind }) {
  const sb = await getSupabase();
  await sb.from('sales_emails').insert({ customer, kind, ai: false });
}
export async function salesAi(facts) {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/sales-ai`, { method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ facts }) });
  } catch { throw new Error('Could not reach the AI email writer. Check the internet connection and try again.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `The AI email writer failed (${res.status}).`);
  return out;
}

/* ---------- metal prices (office): enquiries to several suppliers and the prices they gave ---------- */
export async function loadMetal() {
  const sb = await getSupabase();
  const [r, q] = await Promise.all([sb.from('metal_rfqs').select('*').order('id', { ascending: false }), sb.from('metal_quotes').select('*').order('id')]);
  for (const x of [r, q]) if (x.error) fail('Could not load the metal prices', x.error);
  const quotes = q.data.map(x => ({ id: x.id, rfqId: x.rfq_id, supplierId: x.supplier_id, supplier: x.supplier, email: x.email, askedAt: x.asked_at,
    prices: x.prices, carriage: x.carriage == null ? null : Number(x.carriage), leadDays: x.lead_days, validUntil: x.valid_until, note: x.note, enteredBy: x.entered_by, enteredAt: x.entered_at }));
  return r.data.map(x => ({ id: x.id, jobId: x.job_id, lines: x.lines, note: x.note, status: x.status, orderedFrom: x.ordered_from, orderedPo: x.ordered_po,
    by: x.created_by, createdAt: x.created_at, quotes: quotes.filter(y => y.rfqId === x.id) }));
}
/** The enquiry and one row per supplier asked. Returns its id. */
export async function createRfq({ jobId, lines, note, suppliers }) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('metal_rfqs').insert({ job_id: jobId || null, lines, note: note || '' }).select('id').single();
  if (error) fail('The enquiry was not saved', error);
  const { error: e2 } = await sb.from('metal_quotes').insert(suppliers.map(x => ({ rfq_id: data.id, supplier_id: x.supplierId || '', supplier: x.supplier.trim(), email: x.email.trim() })));
  if (e2) fail('The suppliers were not saved on the enquiry', e2);
  return data.id;
}
export async function markAsked(quoteId) {
  const sb = await getSupabase();
  const { error } = await sb.from('metal_quotes').update({ asked_at: new Date().toISOString() }).eq('id', quoteId);
  if (error) fail('Could not note the email', error);
}
export async function saveQuote(quoteId, { prices, carriage, leadDays, validUntil, note, by }) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('metal_quotes').update({ prices, carriage, lead_days: leadDays, valid_until: validUntil || null, note: note || '',
    entered_by: by, entered_at: new Date().toISOString() }, { count: 'exact' }).eq('id', quoteId);
  if (error) fail('The prices were not saved', error);
  if (!count) throw new Error('The prices were not saved. Try again.');
}
export async function setRfq(id, patch) {
  const sb = await getSupabase();
  const row = {};
  if ('status' in patch) row.status = patch.status;
  if ('orderedFrom' in patch) row.ordered_from = patch.orderedFrom;
  if ('orderedPo' in patch) row.ordered_po = patch.orderedPo;
  if ('jobId' in patch) row.job_id = patch.jobId;
  const { error } = await sb.from('metal_rfqs').update(row).eq('id', id);
  if (error) fail('The enquiry was not updated', error);
}

/* ---------- aged debt chases (office): a note of each chase email drafted ---------- */
export async function loadChases() {
  const sb = await getSupabase();
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data, error } = await sb.from('debt_chases').select('*').gte('chased_at', since).order('chased_at', { ascending: false });
  if (error) fail('Could not load the payment chases', error);
  return data.map(c => ({ id: c.id, customer: c.customer, contactId: c.contact_id, invoices: c.invoices, owed: Number(c.owed), by: c.chased_by, at: c.chased_at }));
}
export async function addChase({ customer, contactId, invoices, owed, by }) {
  const sb = await getSupabase();
  const { error } = await sb.from('debt_chases').insert({ customer, contact_id: contactId || '', invoices, owed, chased_by: by });
  if (error) fail('The chase was not noted', error);
}

/* ---------- pro formas (office) ---------- */
export async function loadProformas() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('proformas').select('*').order('id');
  if (error) fail('Could not load the pro formas', error);
  return data.map(p => ({ id: p.id, pf: p.pf_number, jobId: p.job_id, lines: p.lines, net: Number(p.net), vat: Number(p.vat),
    by: p.created_by, at: p.created_at, emailedAt: p.emailed_at, paidOn: p.paid_on, paidBy: p.paid_by, cancelledAt: p.cancelled_at }));
}
/** lines: [{ job_line_id, qty }]. Prices are taken from the order on the server. */
export async function createProforma(jobId, lines) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('create_proforma', { p_job_id: jobId, p_lines: lines });
  if (error) fail('The pro forma was not made', error);
  return data;
}
/** what: 'emailed' | 'paid' | 'unpaid' | 'cancel' | 'uncancel' */
export async function markProforma(id, what, by = '') {
  const sb = await getSupabase();
  const now = new Date().toISOString();
  const set = { emailed: { emailed_at: now }, paid: { paid_on: now.slice(0, 10), paid_by: by }, unpaid: { paid_on: null, paid_by: null },
    cancel: { cancelled_at: now }, uncancel: { cancelled_at: null } }[what];
  const { error, count } = await sb.from('proformas').update(set, { count: 'exact' }).eq('id', id);
  if (error) fail('Not saved', error);
  if (!count) throw new Error('Not saved. Only Levi and Mandy can change a pro forma.');
}
/** The office's own settings: the accounts address copied into pro forma emails, the payment details. */
export async function loadOfficeSettings() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('office_settings').select('key, value');
  if (error) fail('Could not load the office settings', error);
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}
export async function saveOfficeSetting(key, value) {
  const sb = await getSupabase();
  const { error } = value == null || value === '' ? await sb.from('office_settings').delete().eq('key', key)
    : await sb.from('office_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) fail('Not saved', error);
}

/** sp_quote_id of every quote marked "Not a job". Office only. */
/** Office settings as { key: value } (the monthly target). */
export async function loadSettings() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('board_settings').select('key, value');
  if (error) fail('Could not load the board settings', error);
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}
export async function saveSetting(key, value) {
  const sb = await getSupabase();
  const { error } = value == null ? await sb.from('board_settings').delete().eq('key', key)
    : await sb.from('board_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) fail('Not saved', error);
}

export async function loadDismissed() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('quote_dismissals').select('sp_quote_id');
  if (error) fail('Could not load the dismissed quotes', error);
  return data.map(r => r.sp_quote_id);
}
export async function dismissQuote(spQuoteId, quoteNo) {
  const sb = await getSupabase();
  const { error } = await sb.from('quote_dismissals').upsert({ sp_quote_id: spQuoteId, quote_no: quoteNo });
  if (error) fail('Not saved', error);
}
export async function restoreQuote(spQuoteId) {
  const sb = await getSupabase();
  const { error } = await sb.from('quote_dismissals').delete().eq('sp_quote_id', spQuoteId);
  if (error) fail('Not saved', error);
}

/** Xero sales orders brought in by the one-off import at changeover, in the read route's shape. Office only. */
export async function loadXeroOrders() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('xero_orders').select('*').order('order_date', { ascending: false });
  if (error) fail('Could not load the imported Xero sales orders', error);
  return data.map(r => ({ id: r.xero_id, number: r.so_number, customer: r.customer, reference: r.reference, status: r.xero_status,
    date: r.order_date, expiry: r.expiry, subTotal: r.sub_total == null ? null : Number(r.sub_total), lines: r.lines || [],
    importedAt: r.imported_at, importedBy: r.imported_by, dismissed: !!r.dismissed_at }));
}
/** Adds the given Xero sales orders; ones already imported are left exactly as they are. Returns how many were new. */
export async function importXeroOrders(orders) {
  const sb = await getSupabase();
  const rows = orders.map(q => ({ xero_id: q.id, so_number: q.number, customer: q.customer || '', reference: q.reference || '',
    xero_status: q.status || '', order_date: q.date || null, expiry: q.expiry || null, sub_total: q.subTotal ?? null, lines: q.lines || [] }));
  if (!rows.length) return 0;
  const { data, error } = await sb.from('xero_orders').upsert(rows, { onConflict: 'xero_id', ignoreDuplicates: true }).select('xero_id');
  if (error) fail('The import was not saved', error);
  return data.length;
}
/** Refreshes the saved lines of imported orders (e.g. to carry Xero's item codes), leaving everything else alone. */
export async function refreshXeroLines(orders) {
  const sb = await getSupabase();
  for (const q of orders) {
    const { error } = await sb.from('xero_orders').update({ lines: q.lines || [] }).eq('xero_id', q.id);
    if (error) fail('The imported lines were not refreshed', error);
  }
}
/** Puts Xero's item code in front of order lines' part text: [{ id, code }]. Returns how many lines changed. */
export async function addLineCodes(lines) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('add_line_codes', { p_lines: lines.map(l => ({ id: l.id, code: l.code })) });
  if (error) fail('The part numbers were not added', error);
  return data;
}
export async function dismissXeroOrder(xeroId, dismiss, by) {
  const sb = await getSupabase();
  const { error } = await sb.from('xero_orders').update(dismiss ? { dismissed_at: new Date().toISOString(), dismissed_by: by || '' } : { dismissed_at: null, dismissed_by: null }).eq('xero_id', xeroId);
  if (error) fail('Not saved', error);
}

/** The board's own contact book: people and delivery addresses per customer. Office only. */
export async function loadContactBook() {
  const sb = await getSupabase();
  const [p, s] = await Promise.all([sb.from('customer_people').select('*').order('id'), sb.from('customer_sites').select('*').order('id')]);
  if (p.error) fail('Could not load the contact book', p.error);
  if (s.error) fail('Could not load the contact book', s.error);
  return {
    people: p.data.map(r => ({ id: r.id, key: r.customer_key, customer: r.customer_name, role: r.role, name: r.name, email: r.email, phone: r.phone, notes: r.notes, main: r.main })),
    sites: s.data.map(r => ({ id: r.id, key: r.customer_key, customer: r.customer_name, label: r.label, address: r.address, contact: r.site_contact, phone: r.phone, main: r.main })),
  };
}
/** Adds (no id) or updates a person. Marking one main for a role unmarks the others for that customer and role. */
export async function savePerson(p) {
  const sb = await getSupabase();
  const row = { customer_key: p.key, customer_name: p.customer, role: p.role, name: p.name || '', email: p.email || '', phone: p.phone || '',
    notes: p.notes || '', main: !!p.main, updated_at: new Date().toISOString() };
  if (p.main) {
    let q = sb.from('customer_people').update({ main: false }).eq('customer_key', p.key).eq('role', p.role);
    if (p.id) q = q.neq('id', p.id);
    const { error } = await q; if (error) fail('Not saved', error);
  }
  const { error } = p.id ? await sb.from('customer_people').update(row).eq('id', p.id) : await sb.from('customer_people').insert(row);
  if (error) fail('Not saved', error);
}
export async function deletePerson(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_people').delete().eq('id', id);
  if (error) fail('Not removed', error);
}
export async function saveSite(x) {
  const sb = await getSupabase();
  const row = { customer_key: x.key, customer_name: x.customer, label: x.label || '', address: x.address, site_contact: x.contact || '',
    phone: x.phone || '', main: !!x.main, updated_at: new Date().toISOString() };
  if (x.main) {
    let q = sb.from('customer_sites').update({ main: false }).eq('customer_key', x.key);
    if (x.id) q = q.neq('id', x.id);
    const { error } = await q; if (error) fail('Not saved', error);
  }
  const { error } = x.id ? await sb.from('customer_sites').update(row).eq('id', x.id) : await sb.from('customer_sites').insert(row);
  if (error) fail('Not saved', error);
}
export async function deleteSite(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_sites').delete().eq('id', id);
  if (error) fail('Not removed', error);
}

/** Cancel a job made by mistake. Refused once anything has been despatched. */
export async function deleteJob(jobId) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('jobs').delete({ count: 'exact' }).eq('id', jobId);
  if (error) {
    if (error.code === '23503') throw new Error('This job has dispatch notes, so it cannot be cancelled.');
    fail('The job was not cancelled', error);
  }
  if (!count) throw new Error('The job was not cancelled. Only Levi and Mandy can cancel jobs.');
}

/** Calls back on any change to jobs, ticks or despatches by anyone. */
export async function onChange(cb) {
  const sb = await getSupabase();
  const ch = sb.channel('board');
  for (const table of ['jobs', 'job_lines', 'job_processes', 'despatches', 'quote_dismissals', 'xero_orders', 'customer_people', 'customer_sites', 'board_settings', 'proformas', 'job_files', 'purchase_orders', 'parts', 'part_files', 'outwork', 'metal_rfqs', 'metal_quotes', 'quote_follow', 'sales_actions']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
  ch.subscribe();
}

/* ---------- Xero (through the edge function; no token ever reaches the browser) ---------- */

export async function xeroStatus() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('xero_status');
  if (error) fail('Could not read the Xero connection', error);
  return data?.[0] || null;
}

/** route: 'connect' | 'read' | 'disconnect' */
export async function xero(route, body) {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/xero/${route}`, { method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Could not reach the Xero connection. Check the internet connection and try again.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `The Xero connection failed (${res.status}).`);
  return out;
}

/** Board customer (normalised) → Xero contact, as chosen by the office. */
export async function loadContactMap() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('customer_contacts').select('customer_key, xero_contact_id, xero_contact_name');
  if (error) fail('Could not load the Xero contact choices', error);
  return new Map(data.map(r => [r.customer_key, { id: r.xero_contact_id, name: r.xero_contact_name }]));
}
export async function saveContact(customerKey, contact) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_contacts').upsert({ customer_key: customerKey, xero_contact_id: contact.id, xero_contact_name: contact.name });
  if (error) fail('The contact choice was not saved', error);
}

/* ---------- Levi's quotes (SharePoint) ---------- */

let sp = null;
async function spLists() {
  if (sp) return sp;
  const site = await graph(`/sites/${CONFIG.SP_SITE}?$select=id`);
  const lists = (await graph(`/sites/${site.id}/lists?$select=id,displayName&$top=200`)).value;
  const find = n => lists.find(l => l.displayName.toLowerCase() === n.toLowerCase())
    || (() => { throw new Error(`The Factory Jobs site has no list called "${n}".`); })();
  const quotes = find('Quotes'), lines = find('QuoteLines');
  const cols = async id => (await graph(`/sites/${site.id}/lists/${id}/columns?$top=500`)).value;
  const [qcols, lcols] = await Promise.all([cols(quotes.id), cols(lines.id)]);
  sp = { site: site.id, quotes: quotes.id, lines: lines.id,
    qcol: resolveColumns(qcols, QUOTE_FIELDS, 'Quotes'),
    lcol: resolveColumns(lcols, LINE_FIELDS, 'QuoteLines'),
    lookup: quoteLookupColumn(lcols, quotes.id) };
  return sp;
}

async function allItems(url) {
  const out = [];
  let next = url;
  while (next) {
    const page = await graph(next, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } });
    out.push(...page.value);
    next = page['@odata.nextLink'] || null;
  }
  return out;
}

/** Quotes Levi has marked Ordered in the quote calculator. */
export async function orderedQuotes() {
  const s = await spLists();
  const items = await allItems(`/sites/${s.site}/lists/${s.quotes}/items?$expand=fields&$top=500`);
  return items.map(i => toQuote(i, s.qcol)).filter(q => q.status === 'Ordered')
    .sort((a, b) => (a.quoteNo < b.quoteNo ? 1 : -1));
}

/** The lines of one quote, in line order. */
export async function quoteLines(spQuoteId) {
  const s = await spLists();
  const items = await allItems(`/sites/${s.site}/lists/${s.lines}/items?$expand=fields&$top=500` +
    `&$filter=fields/${s.lookup}LookupId eq ${Number(spQuoteId)}`);
  return items.map(i => toLine(i, s.lcol)).sort((a, b) => a.lineNo - b.lineNo);
}
