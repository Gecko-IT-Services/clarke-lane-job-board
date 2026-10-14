/**
 * Everything the board reads and writes. Jobs, ticks and despatches: Supabase.
 * Ordered quotes: Levi's SharePoint lists, read only.
 */
import { CONFIG } from './config.js';
import { getSupabase, graph } from './auth.js';
import { QUOTE_FIELDS, LINE_FIELDS, resolveColumns, quoteLookupColumn, toQuote, toLine } from './core/quotes.js';

const fail = (what, error) => { const e = new Error(`${what}: ${error.message}`); e.cause = error; throw e; };

/** Who is signed in, from the staff table. null role = not on the list. */
export async function whoAmI() {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('staff').select('name, role').eq('email', (user?.email || '').toLowerCase()).maybeSingle();
  if (error) fail('Could not read the staff list', error);
  return { email: user?.email || '', name: data?.name || '', role: data?.role || null };
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
    id: j.id, so: j.so_number, quote: j.quote_no, spQuoteId: j.sp_quote_id, customer: j.customer,
    contactName: j.contact_name, contactEmail: j.contact_email, po: j.customer_po,
    ordered: j.ordered_on, due: j.due_date, calloffs: j.calloff_dates || [], notes: j.notes,
    lines: [], procs: {}, despatches: [],
  }]));
  for (const l of lines.data) byJob.get(l.job_id)?.lines.push(
    { id: l.id, lineNo: l.line_no, part: l.part, qty: l.qty, price: office ? (price.get(l.id) ?? null) : null });
  for (const p of procs.data) { const j = byJob.get(p.job_id); if (j) j.procs[p.process] = { done: !!p.done_at, by: p.done_by, at: p.done_at }; }
  const dById = new Map();
  for (const d of desps.data) {
    const o = { id: d.id, dn: d.dn_number, date: d.despatched_on, by: d.despatched_by, lines: {},
      xero: d.xero_invoice_no ? { no: d.xero_invoice_no, at: d.sent_to_xero_at } : null };
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

export async function createDespatch(jobId, lines) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc('create_despatch', { p_job_id: jobId, lines });
  if (error) fail('The despatch note was not created', error);
  return data;
}

export async function markInvoiced(despatchId, invoiceNo) {
  const sb = await getSupabase();
  const { error, count } = await sb.from('despatches')
    .update({ xero_invoice_no: invoiceNo, sent_to_xero_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', despatchId);
  if (error) fail('Not saved', error);
  if (!count) throw new Error('Not saved. Only Levi and Mandy can mark despatches as invoiced.');
}

/** Calls back on any change to jobs, ticks or despatches by anyone. */
export async function onChange(cb) {
  const sb = await getSupabase();
  const ch = sb.channel('board');
  for (const table of ['jobs', 'job_processes', 'despatches']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
  ch.subscribe();
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
