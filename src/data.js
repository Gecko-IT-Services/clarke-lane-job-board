/**
 * Everything the board reads and writes. Jobs, ticks and despatches: Supabase.
 * Ordered quotes: Levi's SharePoint lists, read only.
 */
import { CONFIG } from './config.js';
import { getSupabase, graph, graphRaw } from './auth.js';
import { emailList } from './core/jobs.js';
import { QUOTE_FIELDS, LINE_FIELDS, resolveColumns, quoteLookupColumn, toQuote, toLine } from './core/quotes.js';
import { attachmentsToRead } from './core/quotepack.js';

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
    { id: l.id, lineNo: l.line_no, partNo: l.part_no || '', part: l.part, qty: l.qty, due: l.due_date, po: l.customer_po || '', price: office ? (price.get(l.id) ?? null) : null,
      procs: l.processes || [] });   // [] before 22 Oct (or before the migration): every process on the order, read with lineProcs
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
  // Ignoring ones already there: amend_job adds a process a line needs itself (22 Oct), and this runs after it.
  if (add.length) { const { error } = await sb.from('job_processes').upsert(add.map(process => ({ job_id: jobId, process })), { onConflict: 'job_id,process', ignoreDuplicates: true }); if (error) fail('Processes not saved', error); }
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

/* ---------- Company Data in SharePoint: customers' old files, laser drawings, material certificates. Read only. ---------- */
let dataDrive;
const spErr = e => { if (e.status === 403 || e.status === 401) { const x = new Error('Your Microsoft account cannot open the Company Data site in SharePoint. Ask for read access to it.'); x.status = e.status; throw x; } throw e; };
async function companyDrive() {
  dataDrive ??= (await graph(`/sites/${CONFIG.SP_DATA_SITE}:/drive?$select=id`).catch(spErr)).id;
  return dataDrive;
}
const ITEM_SELECT = 'id,name,size,webUrl,createdDateTime,lastModifiedDateTime,file,folder';
const spItem = (drive, x, path = '') => ({ id: x.id, itemId: x.id, driveId: drive, name: x.name, path, url: x.webUrl || '', size: x.size ?? null,
  // the earlier date: files moved into SharePoint were "created" on the day they moved
  at: [x.createdDateTime, x.lastModifiedDateTime].filter(Boolean).sort()[0] || '', mime: x.file?.mimeType || '', folder: !!x.folder });
async function children(drive, url) {
  const out = [];
  for (let next = url; next;) { const r = await graph(next).catch(spErr); out.push(...(r.value || [])); next = r['@odata.nextLink']; }
  return out;
}
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
/** The folders in one of Company Data's top folders (client folders, laser folders or certificate grades). */
const folderLists = {};
export async function companyFolders(which) {
  const root = { clients: CONFIG.SP_CLIENTS, laser: CONFIG.SP_LASER, certs: CONFIG.SP_CERTS }[which];
  folderLists[which] ??= (async () => { const drive = await companyDrive();
    return (await children(drive, `/drives/${drive}/root:/${encPath(root)}:/children?$top=999&$select=${ITEM_SELECT}`)).filter(x => x.folder).map(x => spItem(drive, x, root)); })()
    .catch(e => { delete folderLists[which]; throw e; });
  return folderLists[which];
}
/** Every file in a folder and its subfolders (up to 4 deep, 4000 files), kept for the visit. path: the subfolders it is in. */
const folderFiles = {};
export async function filesIn(folder) {
  const k = `${folder.driveId}|${folder.itemId}`;
  folderFiles[k] ??= (async () => {
    const out = [], todo = [{ id: folder.itemId, path: '', depth: 0 }];
    while (todo.length && out.length < 4000) {
      const f = todo.shift();
      for (const x of await children(folder.driveId, `/drives/${folder.driveId}/items/${f.id}/children?$top=999&$select=${ITEM_SELECT}`)) {
        if (x.folder) { if (f.depth < 4) todo.push({ id: x.id, path: f.path ? `${f.path}/${x.name}` : x.name, depth: f.depth + 1 }); }
        else out.push(spItem(folder.driveId, x, f.path));
      }
    }
    return out;
  })().catch(e => { delete folderFiles[k]; throw e; });
  return folderFiles[k];
}
/** Folders linked by hand to a customer (where the names differ): [{ key, kind: 'client' | 'laser', name, driveId, itemId, url }]. itemId null: none. */
export async function loadCustomerFolders() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('customer_folders').select('*');
  if (error) fail('Could not load the customer folders', error);
  return data.map(r => ({ key: r.customer_key, kind: r.kind, customer: r.customer, name: r.name, driveId: r.drive_id, itemId: r.item_id, url: r.web_url }));
}
/** Links a folder to a customer, or (folder null) says the customer has none of that kind. */
export async function setCustomerFolder(key, customer, kind, folder) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_folders').upsert({ customer_key: key, customer, kind, name: folder?.name || '', drive_id: folder?.driveId || null,
    item_id: folder?.itemId || null, web_url: folder?.url || '' }, { onConflict: 'customer_key,kind' });
  if (error) fail('The folder was not saved', error);
}
export async function clearCustomerFolder(key, kind) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_folders').delete().eq('customer_key', key).eq('kind', kind);
  if (error) fail('Not saved', error);
}
/** Puts a Company Data file on a job: the same SharePoint file, never a copy. */
export async function linkSpFile(jobId, f) {
  const sb = await getSupabase();
  const { error } = await sb.from('job_files').insert({ job_id: jobId, name: f.name, drive_id: f.driveId, item_id: f.itemId, web_url: f.url || '', size: f.size ?? null, mime: f.mime || '' });
  if (error) fail(`${f.name} was not attached`, error);
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

/* ---------- notes on a job: the office and the shop floor talk on the job itself ---------- */
const noteRow = r => ({ id: r.id, jobId: r.job_id, body: r.body, byName: r.by_name, fromFloor: r.from_floor, seenBy: r.seen_by, seenAt: r.seen_at, at: r.created_at });
export async function loadNotes() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('job_notes').select('*').order('created_at');
  if (error) fail('Could not load the notes', error);
  return data.map(noteRow);
}
export async function addNote({ jobId, body, by, fromFloor }) {
  const sb = await getSupabase();
  const { error } = await sb.from('job_notes').insert({ job_id: jobId, body: body.trim(), by_name: by.trim(), from_floor: !!fromFloor });
  if (error) fail('The note was not saved', error);
}
export async function seenNote(id, by) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('job_note_seen', { note_id: id, who: by });
  if (error) fail('Not marked as seen', error);
}
export async function deleteNote(id) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('job_notes').delete({ count: 'exact' }).eq('id', id);
  if (error) fail('The note was not removed', error);
  if (!count) throw new Error('The note was not removed. Only Levi and Mandy can remove notes.');
}

/* ---------- CRM (Levi and Mandy): follow-ups on quotes and customers, and the AI email writer ---------- */
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
/** Calls, notes and emails logged about customers (office). */
export async function loadActions() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('sales_actions').select('*').order('created_at', { ascending: false }).limit(3000);
  if (error) fail('Could not load the notes', error);
  return data.map(x => ({ id: x.id, spId: x.sp_quote_id, customer: x.customer, kind: x.kind, note: x.note, by: x.created_by, at: x.created_at }));
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
/** One AI call (sales-ai). extra: more fields in the body beside facts, e.g. { news: true } or the quote pack's
 *  { documents: [{ name, mediaType, base64 }] } (sent beside the facts, so the function's size check on facts ignores them). */
export async function salesAi(facts, kind = 'checkin', extra = {}) {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/sales-ai`, { method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, kind, ...extra }) });
  } catch { throw new Error('Could not reach the AI email writer. Check the internet connection and try again.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `The AI email writer failed (${res.status}).`);
  return out;
}

/* ---------- customers, enquiries and tasks (office) ---------- */
export async function loadStaff() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('staff').select('email, name, role');
  if (error) fail('Could not read the staff list', error);
  return data;
}
const taskRow = t => ({ id: t.id, title: t.title, customer: t.customer, customerKey: t.customer_key, dueOn: t.due_on, assignedTo: t.assigned_to, source: t.source, sourceRef: t.source_ref,
  note: t.note, doneAt: t.done_at, doneBy: t.done_by, by: t.created_by, createdAt: t.created_at });
export async function loadTasks() {
  const sb = await getSupabase();
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  const { data, error } = await sb.from('tasks').select('*').or(`done_at.is.null,done_at.gte.${since}`).order('due_on');
  if (error) fail('Could not load the tasks', error);
  return data.map(taskRow);
}
export async function addTask(t) {
  const sb = await getSupabase();
  const { error } = await sb.from('tasks').insert({ title: t.title.trim(), customer: t.customer || '', customer_key: t.customerKey || '', due_on: t.dueOn, assigned_to: t.assignedTo,
    source: t.source || '', source_ref: String(t.sourceRef || ''), note: t.note || '' });
  if (error) fail('The task was not saved', error);
}
export async function setTask(id, patch, by) {
  const sb = await getSupabase();
  const row = {};
  if ('done' in patch) { row.done_at = patch.done ? new Date().toISOString() : null; row.done_by = patch.done ? by : null; }
  if ('dueOn' in patch) row.due_on = patch.dueOn;
  if ('assignedTo' in patch) row.assigned_to = patch.assignedTo;
  if ('title' in patch) row.title = patch.title;
  const { error } = await sb.from('tasks').update(row).eq('id', id);
  if (error) fail('The task was not updated', error);
}
export async function deleteTask(id) {
  const sb = await getSupabase();
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) fail('The task was not removed', error);
}
const enqRow = e => ({ id: e.id, messageId: e.message_id, graphId: e.graph_id, mailbox: e.mailbox, receivedAt: e.received_at, fromName: e.from_name, fromEmail: e.from_email, subject: e.subject,
  webLink: e.web_link, kind: e.kind, summary: e.summary, company: e.company, person: e.person, phone: e.phone, wants: e.wants, hasDrawings: e.has_drawings, customerKey: e.customer_key,
  status: e.status, handledBy: e.handled_by, handledAt: e.handled_at, error: e.error, quotePack: e.quote_pack || null, quotePackAt: e.quote_pack_at || null,
  topic: e.topic || '', refs: e.refs || {}, quoteSpId: e.quote_sp_id ?? null, jobId: e.job_id ?? null });   // what a customer's email is about, and the quote or order it names (21 Oct)
export async function loadEnquiries() {
  const sb = await getSupabase();
  const since = new Date(Date.now() - 180 * 864e5).toISOString();
  const { data, error } = await sb.from('enquiries').select('*').gte('received_at', since).order('received_at', { ascending: false });
  if (error) fail('Could not load the enquiries', error);
  return data.map(enqRow);
}
/** Claims a message for reading: the first person to insert it reads it; returns its id, or null if someone has it. */
export async function claimEnquiry(m) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('enquiries').upsert({ message_id: m.messageId, graph_id: m.graphId, mailbox: m.mailbox, received_at: m.receivedAt, from_name: m.fromName,
    from_email: m.fromEmail, subject: m.subject, web_link: m.webLink }, { onConflict: 'message_id', ignoreDuplicates: true }).select('id');
  if (error) fail('Could not note the email', error);
  return data?.[0]?.id ?? null;
}
export async function setEnquiry(id, p) {
  const sb = await getSupabase();
  const row = {};
  for (const [k, c] of [['kind', 'kind'], ['summary', 'summary'], ['company', 'company'], ['person', 'person'], ['phone', 'phone'], ['wants', 'wants'], ['hasDrawings', 'has_drawings'],
    ['customerKey', 'customer_key'], ['status', 'status'], ['error', 'error'], ['topic', 'topic'], ['refs', 'refs'], ['quoteSpId', 'quote_sp_id'], ['jobId', 'job_id']]) if (k in p) row[c] = p[k];
  if ('status' in p) { row.handled_by = p.by || null; row.handled_at = p.status === 'new' ? null : new Date().toISOString(); }
  if ('quotePack' in p) { row.quote_pack = p.quotePack || null; row.quote_pack_at = p.quotePack ? new Date().toISOString() : null; }   // the quote pack (21 Oct)
  const { error } = await sb.from('enquiries').update(row).eq('id', id);
  if (error) fail('The enquiry was not updated', error);
}
/* ---------- Three things today (Levi and Mandy): the day's picks and the AI's lines, kept per person per day ---------- */
export async function loadDigest(day) {
  const sb = await getSupabase();
  const { data, error } = await sb.from('daily_digests').select('picks, greeting, lines, model, created_at').eq('day', day).maybeSingle();   // RLS: only my own row
  if (error) fail('Could not read today\'s three things', error);
  return data ? { picks: data.picks || [], greeting: data.greeting || '', lines: data.lines || [], model: data.model || '', at: data.created_at } : null;
}
export async function saveDigest(day, { picks, greeting = '', lines = [], model = '' }) {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const email = String(session?.user?.email || '').toLowerCase(); if (!email) return;
  const { error } = await sb.from('daily_digests').upsert({ user_email: email, day, picks, greeting, lines, model, created_at: new Date().toISOString() });
  if (error) fail('Today\'s three things were not saved', error);
}

/* ---------- ideas (Levi and Mandy): customers' websites read by AI, and ideas for winning more work ---------- */
const researchRow = r => ({ key: r.customer_key, customer: r.customer, website: r.website, about: r.about, news: r.news || [], openings: r.openings || [], sources: r.sources || [], at: r.created_at });
export async function loadResearch() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('customer_research').select('*').order('created_at', { ascending: false });
  if (error) fail('Could not load the customer research', error);
  return data.map(researchRow);
}
export async function saveResearch(key, customer, website, x, model, cost) {
  const sb = await getSupabase();
  const { error } = await sb.from('customer_research').upsert({ customer_key: key, customer, website: website || '', about: x.about || '', news: x.news || [], openings: x.openings || [],
    sources: x.sources || [], model: model || '', cost_usd: cost ?? null, created_at: new Date().toISOString() });
  if (error) fail('The research was not saved', error);
}
const ideaRow = r => ({ id: r.id, title: r.title, why: r.why, action: r.action, angle: r.angle, key: r.customer_key, customer: r.customer, status: r.status, batchAt: r.batch_at });
export async function loadIdeas() {
  const sb = await getSupabase();
  const { data, error } = await sb.from('sales_ideas').select('*').order('batch_at', { ascending: false }).limit(200);
  if (error) fail('Could not load the ideas', error);
  return data.map(ideaRow);
}
export async function saveIdeas(list) {
  const sb = await getSupabase(), at = new Date().toISOString();
  const { error } = await sb.from('sales_ideas').insert(list.map(i => ({ title: i.title, why: i.why || '', action: i.action || 'other', angle: i.angle || '', customer_key: i.key || null, customer: i.customer || '', batch_at: at })));
  if (error) fail('The ideas were not saved', error);
}
export async function setIdea(id, status) {
  const sb = await getSupabase();
  const { error } = await sb.from('sales_ideas').update({ status }).eq('id', id);
  if (error) fail('Not saved', error);
}
export async function loadInsight(key) {
  const sb = await getSupabase();
  const { data } = await sb.from('customer_insights').select('*').eq('customer_key', key).maybeSingle();
  return data ? { summary: data.summary, nextStep: data.next_step, at: data.created_at } : null;
}
export async function saveInsight(key, customer, x, model) {
  const sb = await getSupabase();
  await sb.from('customer_insights').upsert({ customer_key: key, customer, summary: x.summary, next_step: x.nextStep || '', model: model || '', created_at: new Date().toISOString() });
}
const MAIL_SELECT = 'id,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,webLink,hasAttachments';
const boxPath = box => box === 'me' ? '/me' : `/users/${encodeURIComponent(box)}`;
const boxScopes = box => box === 'me' ? CONFIG.MAIL_SCOPES : CONFIG.SHARED_MAIL_SCOPES;
/** The newest messages in a shared mailbox's inbox since a date, with their text (for enquiries). Never asks to approve. */
export async function inboxMessages(mailbox, sinceIso) {
  const r = await graph(`${boxPath(mailbox)}/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}&$orderby=receivedDateTime desc&$top=30&$select=${MAIL_SELECT},body`,
    { scopes: boxScopes(mailbox), quiet: true, headers: { Prefer: 'outlook.body-content-type="text"' } });
  return (r.value || []).map(m => ({ graphId: m.id, messageId: m.internetMessageId || m.id, subject: m.subject || '', fromEmail: m.from?.emailAddress?.address || '', fromName: m.from?.emailAddress?.name || '',
    receivedAt: m.receivedDateTime, text: m.body?.content || m.bodyPreview || '', webLink: m.webLink || '', hasAttachments: !!m.hasAttachments }));
}
/** One email's text (plain), for the quote pack: the enquiries table keeps what the AI made of it, not the email. */
export async function enquiryText(mailbox, graphId) {
  const m = await graph(`${boxPath(mailbox)}/messages/${encodeURIComponent(graphId)}?$select=body,bodyPreview`,
    { scopes: boxScopes(mailbox), quiet: true, headers: { Prefer: 'outlook.body-content-type="text"' } });
  return m.body?.content || m.bodyPreview || '';
}
/**
 * The quote pack's attachments (21 Oct): the email's PDFs and pictures, 4 MB or less each, at most 4 and 12 MB in all
 * (attachmentsToRead in core/quotepack.js), each fetched with its bytes. Returns [{ name, contentType, size, base64 }].
 */
export async function enquiryAttachments(mailbox, graphId) {
  const base = `${boxPath(mailbox)}/messages/${encodeURIComponent(graphId)}/attachments`, opts = { scopes: boxScopes(mailbox), quiet: true };
  const list = await graph(`${base}?$select=id,name,contentType,size,isInline`, opts);
  const out = [];
  for (const a of attachmentsToRead(list.value || [])) {
    const f = await graph(`${base}/${encodeURIComponent(a.id)}`, opts);   // a file attachment's JSON carries contentBytes (base64)
    if (f.contentBytes) out.push({ name: a.name, contentType: a.contentType || '', size: a.size, base64: f.contentBytes });
  }
  return out;
}
export async function attachmentNames(mailbox, graphId) {
  const r = await graph(`${boxPath(mailbox)}/messages/${encodeURIComponent(graphId)}/attachments?$select=name`, { scopes: boxScopes(mailbox), quiet: true });
  return (r.value || []).map(a => a.name).filter(Boolean).slice(0, 15);
}
/**
 * A customer's emails in each mailbox (yours, colleagues' and info@), searched by their domains or addresses.
 * Returns { messages, noAccess: [mailbox], consent: bool, errors }. Read only; nothing is stored.
 */
export async function searchMail(boxes, terms) {
  const messages = [], noAccess = new Set(), errors = new Set(); let consent = false;
  await Promise.all(boxes.flatMap(box => terms.map(async term => {
    try {
      const r = await graph(`${boxPath(box)}/messages?$search=${encodeURIComponent(`"${term}"`)}&$top=25&$select=${MAIL_SELECT}`, { scopes: boxScopes(box), quiet: true });
      for (const m of r.value || []) messages.push({ id: m.id, mailbox: box, subject: m.subject || '(no subject)', from: m.from?.emailAddress?.address || '', fromName: m.from?.emailAddress?.name || '',
        to: [...(m.toRecipients || []), ...(m.ccRecipients || [])].map(x => x.emailAddress?.address || ''), at: m.receivedDateTime, preview: m.bodyPreview || '', webLink: m.webLink || '',
        internetMessageId: m.internetMessageId || m.id });
    } catch (e) {
      if (e.code === 'CONSENT_REQUIRED') consent = true;
      else if (/403|404|denied|ErrorAccessDenied|MailboxNotEnabled|ResourceNotFound|not found/i.test(e.message)) noAccess.add(box);
      else errors.add(e.message);
    }
  })));
  const seen = new Set();
  return { messages: messages.filter(m => !seen.has(m.internetMessageId) && seen.add(m.internetMessageId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60),
    noAccess: [...noAccess], consent, errors: [...errors] };
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
  for (const table of ['jobs', 'job_lines', 'job_processes', 'despatches', 'quote_dismissals', 'xero_orders', 'customer_people', 'customer_sites', 'board_settings', 'proformas', 'job_files', 'purchase_orders', 'parts', 'part_files', 'outwork', 'metal_rfqs', 'metal_quotes', 'quote_follow', 'sales_actions', 'tasks', 'enquiries', 'job_notes']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
  ch.subscribe();
}

/* ---------- Xero (through the edge function; no token ever reaches the browser) ---------- */

export async function xeroStatus() {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('xero_status');
  if (error) fail('Could not read the Xero connection', error);
  return data?.[0] || null;
}

/** Calls Xero says are left today and this minute, from the last answer (mutated, never reassigned). */
export const xeroLeft = { day: null, minute: null, at: null };

/** route: 'connect' | 'read' | 'disconnect' | ... ; body { fresh: true } reads Xero again instead of the board's kept answer. */
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
  if (out.xero_left) { Object.assign(xeroLeft, out.xero_left); delete out.xero_left; }
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
