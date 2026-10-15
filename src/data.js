/**
 * Everything the board reads and writes. Jobs, ticks and despatches: Supabase.
 * Ordered quotes: Levi's SharePoint lists, read only.
 */
import { CONFIG } from './config.js';
import { getSupabase, graph } from './auth.js';
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
  const [jobs, lines, prices, procs, desps, dlines] = await Promise.all([
    q('jobs').order('id'), q('job_lines').order('line_no'),
    office ? q('job_line_prices') : Promise.resolve({ data: [] }),
    q('job_processes'), q('despatches').order('id'), q('despatch_lines'),
  ]);
  for (const r of [jobs, lines, prices, procs, desps, dlines]) if (r.error) fail('Could not load the jobs', r.error);
  const price = new Map(prices.data.map(p => [p.job_line_id, Number(p.unit_price)]));
  const byJob = new Map(jobs.data.map(j => [j.id, {
    id: j.id, so: j.so_number, quote: j.quote_no, spQuoteId: j.sp_quote_id, xeroQuoteId: j.xero_quote_id, customer: j.customer,
    contactName: j.contact_name, contactEmail: j.contact_email, po: j.customer_po,
    ordered: j.ordered_on, due: j.due_date, notes: j.notes, address: j.delivery_address, status: j.status,
    createdBy: j.created_by, ackEmailedAt: j.ack_emailed_at,
    lines: [], procs: {}, despatches: [],
  }]));
  for (const l of lines.data) byJob.get(l.job_id)?.lines.push(
    { id: l.id, lineNo: l.line_no, part: l.part, qty: l.qty, due: l.due_date, price: office ? (price.get(l.id) ?? null) : null });
  for (const p of procs.data) { const j = byJob.get(p.job_id); if (j) j.procs[p.process] = { done: !!p.done_at, by: p.done_by, at: p.done_at }; }
  const dById = new Map();
  for (const d of desps.data) {
    const o = { id: d.id, dn: d.dn_number, date: d.despatched_on, by: d.despatched_by, lines: {},
      xero: d.xero_invoice_no ? { no: d.xero_invoice_no, at: d.sent_to_xero_at } : null,
      emailedAt: d.emailed_at, deliveredOn: d.delivered_on, deliveredBy: d.delivered_by, receivedBy: d.received_by };
    dById.set(d.id, o); byJob.get(d.job_id)?.despatches.push(o);
  }
  for (const dl of dlines.data) { const d = dById.get(dl.despatch_id); if (d) d.lines[dl.job_line_id] = dl.qty; }
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
export async function markAckEmailed(jobId) {
  const sb = await getSupabase();
  const { error } = await sb.rpc('mark_ack_emailed', { p_job_id: jobId });
  if (error) fail('Not saved', error);
}

/**
 * An Outlook draft in the signed-in person's mailbox with the PDF attached. Never sends:
 * the person checks it in Outlook and presses Send. Returns Outlook's link to the draft.
 */
export async function draftEmail({ to, subject, html, fileName, pdfBase64 }) {
  const msg = await graph('/me/messages', { method: 'POST', scopes: CONFIG.MAIL_SCOPES, body: {
    subject, body: { contentType: 'HTML', content: html },
    toRecipients: to ? [{ emailAddress: { address: to } }] : [],
    attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: fileName, contentType: 'application/pdf', contentBytes: pdfBase64 }],
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

/** sp_quote_id of every quote marked "Not a job". Office only. */
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
export async function dismissXeroOrder(xeroId, dismiss, by) {
  const sb = await getSupabase();
  const { error } = await sb.from('xero_orders').update(dismiss ? { dismissed_at: new Date().toISOString(), dismissed_by: by || '' } : { dismissed_at: null, dismissed_by: null }).eq('xero_id', xeroId);
  if (error) fail('Not saved', error);
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
  for (const table of ['jobs', 'job_lines', 'job_processes', 'despatches', 'quote_dismissals', 'xero_orders']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
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
