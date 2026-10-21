// Clarke Lane Job Board ↔ Xero. The only place the Xero client secret and tokens exist.
//
// Routes (all under /functions/v1/xero/):
//   POST connect   office only → { url } to send the browser to Xero's consent page
//   GET  callback  Xero redirects here; stores tokens; sends the browser back to the board
//   POST read      office only → sales orders (Xero quotes) and sales invoices since go-live
//   POST contacts  office only → Xero contacts + the sales account/VAT Clarke Lane's invoices use
//   POST contact   office only → one contact's details (contact person, email, delivery address)
//   POST items     office only → Products and services that are sold (description, code, sales price)
//   POST send      office only → one DRAFT sales invoice per despatch (never approved or sent)
//   POST bills     office only → the last 12 months' supplier bills, materials lines (account 5000) only. Read only.
//   POST history   office only → sales invoices and credit notes, last 24 months, with their lines and what is owed (customer pages, Sales). Read only.
//   POST disconnect office only
//   (also: invoices = status by ids, online = pay-online links, po = draft purchase order, month = Levi's month)
//
// Xero allows 5,000 calls a day per organisation. Read answers are kept in public.xero_cache and shared by
// everyone on every device (22 Oct): history 6 h, bills 6 h, items 1 h, contacts 30 min, debts 15 min,
// month 15 min (per from/to), read 15 min. A body of { fresh: true } reads Xero again. Not kept: invoices,
// contact, online, send, po, connect, disconnect. Every answer carries xero_left: the calls Xero says are
// left today and this minute, as of the last call this instance made.
//
// Secrets (Supabase › Edge Functions › Secrets): XERO_CLIENT_ID, XERO_CLIENT_SECRET.
// Optional: XERO_SCOPES. Deployed with verify_jwt off because Xero's redirect carries no
// Supabase token; every other route checks the caller itself (office()).
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
// A copy of src/core/xero.js (tests/xero.mjs checks they are identical).
import { buildInvoice, invoiceNet, salesDefaults, dispatchPo, buildPurchaseOrder } from './xero-core.js';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') || '';
// Granular scopes: Xero apps created after 2 March 2026 cannot use the old broad ones.
// accounting.invoices covers invoices and quotes (sales orders), read and draft-invoice write.
// accounting.settings.read: Products and services (Xero answered 401 to Items without it, 20 Oct).
const SCOPES = [...new Set(`${Deno.env.get('XERO_SCOPES') || 'openid profile email offline_access accounting.invoices accounting.contacts.read'} accounting.settings.read`.split(/\s+/).filter(Boolean))].join(' ');
const CALLBACK = `${SB_URL}/functions/v1/xero/callback`;
const BOARD = 'https://jobs.clarke-lane.co.uk/';
// The old GitHub address redirects to jobs.clarke-lane.co.uk; kept here in case it is used before the redirect.
const ORIGINS = ['https://jobs.clarke-lane.co.uk', 'https://gecko-it-services.github.io', 'http://localhost:8080'];
const GO_LIVE = '2026-10-01';   // Clarke Lane's first day in Xero

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** Calls Xero says are left (X-DayLimit-Remaining, X-MinLimit-Remaining), from this instance's last call. */
let limits = { day: null as number | null, minute: null as number | null, at: '' };
const DAY_LIMIT = "Xero's daily limit";

function cors(req: Request, res: Response) {
  const o = req.headers.get('origin') || '';
  if (ORIGINS.includes(o)) {
    res.headers.set('Access-Control-Allow-Origin', o);
    res.headers.set('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
    res.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const back = (msg: string) => Response.redirect(`${BOARD}?xero=${encodeURIComponent(msg)}#dispatch`, 302);

/** The caller, if they are office staff on the board. */
async function office(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to the job board first.');
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data, error } = await user.rpc('me');
  if (error) throw new HttpError(401, 'Your job board sign-in has expired. Reload the page.');
  const me = data?.[0];
  if (!['md', 'office'].includes(me?.role)) throw new HttpError(403, 'Only Levi and Mandy can use the Xero connection.');
  return me as { email: string; name: string; role: string };
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
               'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Xero refused the sign-in (${t.error || res.status}).`);
  return t as { access_token: string; refresh_token: string; expires_in: number };
}

async function connectUrl(email: string) {
  const state = crypto.randomUUID();
  const { error } = await admin.rpc('xero_save_state', { p_state: state, p_email: email });
  if (error) throw new HttpError(500, error.message);
  const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK,
    scope: SCOPES, state });
  return `https://login.xero.com/identity/connect/authorize?${q}`;
}

async function callback(url: URL) {
  if (url.searchParams.get('error')) return back(`Xero said: ${url.searchParams.get('error_description') || url.searchParams.get('error')}`);
  const { data: email } = await admin.rpc('xero_take_state', { p_state: url.searchParams.get('state') || '' });
  if (!email) return back('That Xero sign-in had expired or was not started from the board. Press Connect to Xero again.');
  const t = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: CALLBACK });
  const conns = await (await fetch('https://api.xero.com/connections',
    { headers: { Authorization: `Bearer ${t.access_token}` } })).json() as { tenantId: string; tenantName: string; tenantType: string }[];
  const orgs = conns.filter(c => c.tenantType === 'ORGANISATION');
  const org = orgs.find(c => /clarke\s*lane/i.test(c.tenantName));
  if (!org) return back(`The Xero organisation chosen was ${orgs.map(o => o.tenantName).join(', ') || 'none'}, not Clarke Lane. Press Connect to Xero again and pick Clarke Lane Engineering.`);
  const { error } = await admin.rpc('xero_save_tokens', { p_tenant_id: org.tenantId, p_tenant_name: org.tenantName,
    p_access: t.access_token, p_refresh: t.refresh_token, p_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), p_by: email });
  if (error) return back('Connected to Xero but could not save the connection: ' + error.message);
  return back('connected');
}

/** A current access token, refreshed when within a minute of expiry. */
async function session() {
  const { data, error } = await admin.rpc('xero_get_tokens');
  if (error) throw new HttpError(500, error.message);
  const row = data?.[0];
  if (!row) throw new HttpError(409, 'Xero is not connected yet. Press Connect to Xero.');
  if (new Date(row.expires_at).getTime() - Date.now() > 60_000) return row;
  // One refresh at a time: a Xero refresh token works once, and the board fires several routes together.
  refreshing ??= refresh(row).finally(() => { refreshing = null; });
  return refreshing;
}
let refreshing: Promise<any> | null = null;
async function refresh(row: any) {
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
    .catch((e: Error) => { throw /invalid_grant/.test(e.message) ? new HttpError(409, 'The Xero connection has lapsed (unused for 60 days, or removed in Xero). Press Connect to Xero again.') : e; });
  const expires = new Date(Date.now() + t.expires_in * 1000).toISOString();
  const save = () => admin.rpc('xero_update_tokens', { p_access: t.access_token, p_refresh: t.refresh_token, p_expires_at: expires });
  let { error } = await save();
  if (error) ({ error } = await save());   // the old refresh token is spent now, so this one must be kept
  if (error) console.error('xero_update_tokens failed; the next refresh will need Connect to Xero again:', error.message);
  return { ...row, access_token: t.access_token };
}

async function xero(s: { access_token: string; tenant_id: string }, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
      headers: { Authorization: `Bearer ${s.access_token}`, 'xero-tenant-id': s.tenant_id, Accept: 'application/json' } });
    const day = res.headers.get('X-DayLimit-Remaining'), minute = res.headers.get('X-MinLimit-Remaining');
    if (day != null || minute != null) {
      limits = { day: day != null && day !== '' ? Number(day) : limits.day, minute: minute != null && minute !== '' ? Number(minute) : limits.minute, at: new Date().toISOString() };
      if (limits.day != null && limits.day < 200) console.warn(`Xero: only ${limits.day} calls left today (${path.split('?')[0]})`);
    }
    if (res.status === 429) {
      // Xero says which limit: concurrent (5 at once), minute (60) or day (5,000 per app per organisation).
      const problem = res.headers.get('X-Rate-Limit-Problem') || '', wait = Number(res.headers.get('Retry-After')) || 2 * (attempt + 1);
      console.warn(`Xero 429 (${problem || 'unknown'}) on ${path.split('?')[0]}, retry after ${wait}s`);
      if (problem === 'day') throw new HttpError(503, `${DAY_LIMIT} for the board is used up. It frees up in about ${Math.ceil(wait / 3600)} hour(s). Nothing is lost: dispatches waiting for Xero stay on the list; send them then.`);
      if (wait > 20) throw new HttpError(503, `Xero is busy (rate limit). Try again in ${wait} seconds.`);
      await new Promise(r => setTimeout(r, wait * 1000)); continue;
    }
    if (res.status >= 500 && attempt < 2) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }   // Xero's own hiccup: try again
    if (!res.ok) throw new HttpError(502, `Xero said ${res.status} reading ${path.split('?')[0]}.`);
    return res.json();
  }
  throw new HttpError(503, 'Xero is busy (rate limit). Try again in a minute.');
}

/** Xero's answer for `key`, kept in public.xero_cache for ttlMs and shared by everyone. `fresh` reads Xero
 *  again. If Xero's daily limit is used up, the last kept answer is returned with stale: true. */
async function cached<T extends Record<string, unknown>>(key: string, ttlMs: number, fresh: boolean, read: () => Promise<T>):
    Promise<T & { cached_at?: string; stale?: boolean }> {
  const { data: row, error } = await admin.from('xero_cache').select('body, at').eq('key', key).maybeSingle();
  if (error) console.warn(`xero_cache read ${key}:`, error.message);
  if (row && !fresh && Date.now() - new Date(row.at).getTime() < ttlMs) return { ...(row.body as T), cached_at: row.at };
  let body: T;
  try { body = await read(); }
  catch (e) {
    if (row && e instanceof HttpError && e.message.startsWith(DAY_LIMIT)) return { ...(row.body as T), cached_at: row.at, stale: true };
    throw e;
  }
  const at = new Date().toISOString();
  const { error: upErr } = await admin.from('xero_cache').upsert({ key, body, at });
  if (upErr) console.warn(`xero_cache save ${key}:`, upErr.message);
  return { ...body, cached_at: at };
}
const MIN = 60_000, HOUR = 60 * MIN;

async function xeroPost(s: { access_token: string; tenant_id: string }, path: string, body: unknown, idempotencyKey: string) {
  const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, { method: 'POST',
    headers: { Authorization: `Bearer ${s.access_token}`, 'xero-tenant-id': s.tenant_id, Accept: 'application/json',
               'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = r?.Elements?.[0]?.ValidationErrors?.map((v: any) => v.Message).join('; ') || r?.Message || r?.Detail || res.status;
    throw new HttpError(502, `Xero refused it: ${why}`);
  }
  return r;
}

async function allPages(s: { access_token: string; tenant_id: string }, base: string, key: string) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const r = await xero(s, `${base}${base.includes('?') ? '&' : '?'}page=${page}`);
    out.push(...r[key]);
    if (r[key].length < 100) break;
  }
  return out;
}

const xDate = (v?: string) => {     // "/Date(1759276800000+0000)/" or ISO → YYYY-MM-DD
  if (!v) return '';
  const m = /\/Date\((\d+)/.exec(v);
  return (m ? new Date(Number(m[1])) : new Date(v)).toISOString().slice(0, 10);
};

/** Account and VAT for draft lines: XERO_ACCOUNT_CODE/XERO_TAX_TYPE if set, else what recent invoices use. */
async function defaults(s: { access_token: string; tenant_id: string }) {
  const code = Deno.env.get('XERO_ACCOUNT_CODE');
  if (code) return { accountCode: code, taxType: Deno.env.get('XERO_TAX_TYPE') || null, from: 'setting' };
  const r = await xero(s, `Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&order=Date%20DESC&page=1`);
  const d = salesDefaults(r.Invoices || []);
  if (!d) throw new HttpError(409, 'There are no sales invoices in Xero yet to copy the sales account from. Ask Gecko to set XERO_ACCOUNT_CODE.');
  return { ...d, from: `your last ${(r.Invoices || []).length} invoices` };
}

async function contacts() {
  const s = await session();
  const [list, d] = await Promise.all([
    allPages(s, `Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}`, 'Contacts'),
    defaults(s)]);
  // The postcode (delivery address first) lets the delivery map place a customer with no address on the order.
  const pc = (c: any) => { const a = (c.Addresses || []) as any[];
    return ((a.find(x => x.AddressType === 'DELIVERY' && x.PostalCode) || a.find(x => x.AddressType === 'STREET' && x.PostalCode) || a.find(x => x.PostalCode))?.PostalCode || '').trim(); };
  return { contacts: list.map(c => ({ id: c.ContactID, name: c.Name, postcode: pc(c), supplier: !!c.IsSupplier })).sort((a, b) => a.name.localeCompare(b.name)), defaults: d };
}

/** One Xero contact, for filling in a new order the way Sage does when you pick the account. */
async function contact(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new HttpError(400, 'Not a Xero contact id.');
  const s = await session();
  const c = (await xero(s, `Contacts/${id}`)).Contacts?.[0];
  if (!c) throw new HttpError(404, 'That contact is not in Xero.');
  const addrs: any[] = c.Addresses || [];
  const a = addrs.find(x => x.AddressType === 'DELIVERY' && x.AddressLine1) || addrs.find(x => x.AddressType === 'STREET' && x.AddressLine1)
    || addrs.find(x => x.AddressLine1);
  const address = a ? [a.AttentionTo ? `FAO ${a.AttentionTo}` : '', a.AddressLine1, a.AddressLine2, a.AddressLine3, a.AddressLine4,
    a.City, a.Region, a.PostalCode].filter(Boolean).join('\n') : '';
  // Default contact: the contact's own primary person, else the first named contact person
  // (preferring one marked to receive emails), as Xero shows them.
  const people: any[] = (c.ContactPersons || []).filter((p: any) => p.FirstName || p.LastName);
  const alt = people.find(p => p.IncludeInEmails) || people[0];
  const primary = [c.FirstName, c.LastName].filter(Boolean).join(' ');
  const person = primary || (alt ? [alt.FirstName, alt.LastName].filter(Boolean).join(' ') : '');
  const email = c.EmailAddress || alt?.EmailAddress || '';
  return { id: c.ContactID, name: c.Name, email, person, address };
}

/** Xero's Products and services that are sold: what the order form offers as parts. Read only. */
async function items() {
  const s = await session();
  let r;
  try { r = await xero(s, 'Items'); }
  catch (e) {
    if (/ 40[13] /.test(` ${(e as Error).message} `)) throw new HttpError(409, 'Xero needs one more permission for its Products and services. Levi: on the Xero tab press Reconnect and approve in Xero.');
    throw e;
  }
  // Every product Xero has, sold or not: those converted from Sage are often not ticked as sold
  // (Mandy, 20 Oct: SAM01-11-1696 is in Xero but never showed). The code is usually the part number.
  const all = r.Items || [];
  return { total: all.length, items: all.map((i: any) => ({
    code: (i.Code || '').trim(), name: (i.Name || '').trim(), description: (i.Description || i.Name || '').trim(),
    price: i.SalesDetails?.UnitPrice ?? null, sold: i.IsSold !== false })).filter((i: any) => i.code || i.description)
    .sort((a: any, b: any) => (a.code || a.description).localeCompare(b.code || b.description, 'en', { numeric: true })) };
}

/** items: [{ despatchId, contactId }] → one draft invoice each, recorded on the despatch. */
async function send(items: { despatchId: number; contactId: string }[]) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Nothing chosen to send.');
  const s = await session();
  const d = await defaults(s);
  const out = [];
  for (const it of items) {
    try {
      // Amounts come from the database, never from the browser.
      const { data: row, error } = await admin.from('despatches')
        .select('id, dn_number, despatched_on, delivered_on, cancelled_at, xero_invoice_id, xero_invoice_no, job_id, ' +
          'jobs(so_number, customer_po), despatch_lines(qty, job_lines(part, part_no, line_no, customer_po, job_line_prices(unit_price)))')
        .eq('id', it.despatchId).single();
      if (error || !row) throw new Error('Dispatch not found.');
      if (row.xero_invoice_id || row.xero_invoice_no) { out.push({ despatchId: it.despatchId, ok: true, invoiceNo: row.xero_invoice_no, already: true }); continue; }
      if (row.cancelled_at) throw new Error(`${row.dn_number} is cancelled.`);
      if (!row.delivered_on) throw new Error(`${row.dn_number} is not marked delivered yet.`);
      if (!it.contactId) throw new Error('Choose the Xero contact first.');
      const job: any = row.jobs;
      const lines = (row.despatch_lines as any[])
        .sort((a, b) => a.job_lines.line_no - b.job_lines.line_no)
        // A line's Part no. box (22 Oct) goes in front of its description, one space, as Xero shows code and
        // description. No ItemCode: this path does not read Xero's items, so it cannot know the code exists there.
        .map(l => ({ part: l.job_lines.part_no ? `${l.job_lines.part_no} ${l.job_lines.part}` : l.job_lines.part, qty: l.qty, unit: Number(l.job_lines.job_line_prices?.unit_price ?? l.job_lines.job_line_prices?.[0]?.unit_price) }));
      if (lines.some(l => !Number.isFinite(l.unit))) throw new Error('A part on this dispatch has no price.');
      const { data: pfs } = await admin.from('proformas').select('pf_number')
        .eq('job_id', row.job_id).not('paid_on', 'is', null).is('cancelled_at', null).order('id');
      const inv = buildInvoice({ dn: row.dn_number, date: row.despatched_on, so: job.so_number,
        po: dispatchPo(job.customer_po, (row.despatch_lines as any[]).map(l => l.job_lines.customer_po)), calloff: '', lines,
        prepaid: (pfs || []).map((p: any) => p.pf_number) },
        it.contactId, d.accountCode, d.taxType);
      const r = await xeroPost(s, 'Invoices', { Invoices: [inv] }, `clj-despatch-${row.id}`);
      const made = r.Invoices?.[0];
      if (!made?.InvoiceID) throw new Error('Xero did not return an invoice.');
      // The draft exists in Xero from here on. If the board cannot write its number down (the mark
      // fails, or the note was cancelled or un-delivered meanwhile), the office must hear about it:
      // the note would stay in "waiting for Xero" with a draft already made.
      const { data: marked, error: markErr } = await admin.rpc('xero_mark_sent', { p_despatch_id: row.id, p_invoice_id: made.InvoiceID, p_invoice_no: made.InvoiceNumber || '' });
      if (markErr) console.warn('xero_mark_sent', row.id, markErr.message);
      const net = invoiceNet(inv);
      out.push({ despatchId: it.despatchId, ok: true, invoiceNo: made.InvoiceNumber, net,
        xeroNet: made.SubTotal, mismatch: Math.abs((made.SubTotal ?? net) - net) > 0.004, recorded: !!marked,
        recordError: marked ? undefined : (markErr?.message || 'the note was cancelled or set back to not delivered meanwhile') });
    } catch (e) {
      out.push({ despatchId: it.despatchId, ok: false, error: (e as Error).message });
    }
  }
  return { results: out, defaults: d };
}

/** ids → each invoice's status in Xero (DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED, DELETED), one call
 *  per 40. The board asks only about invoices it made and has not yet seen approved. */
async function invoiceStatus(ids: unknown) {
  if (!Array.isArray(ids)) throw new HttpError(400, 'No invoices given.');
  const want = [...new Set(ids.filter((i): i is string => typeof i === 'string' && /^[0-9a-f-]{36}$/i.test(i)))].slice(0, 400);
  if (!want.length) return { invoices: [] };
  const s = await session();
  const out = [];
  for (let i = 0; i < want.length; i += 40) {
    const r = await xero(s, `Invoices?IDs=${want.slice(i, i + 40).join(',')}&summaryOnly=true`);
    out.push(...(r.Invoices || []).map((v: any) => ({ id: v.InvoiceID, number: v.InvoiceNumber || '', status: v.Status })));
  }
  return { invoices: out };
}

/** A DRAFT purchase order in Xero for a sales order (office). Recorded on the board once Xero has it. */
async function purchaseOrder(b: any, me: { email: string; name: string }) {
  const jobId = Number(b?.jobId), contactId = String(b?.contactId || ''), key = String(b?.key || '');
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(contactId)) throw new HttpError(400, 'Choose the supplier first.');
  if (!/^[\w-]{8,64}$/.test(key)) throw new HttpError(400, 'Missing request key.');
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l: any) => ({ description: String(l.description || '').trim(), qty: Number(l.qty), unit: Number(l.unit) }))
    .filter((l: any) => l.description && l.qty > 0);
  if (!lines.length) throw new HttpError(400, 'Add at least one line with a description and a quantity.');
  if (lines.some((l: any) => !Number.isFinite(l.unit) || l.unit < 0)) throw new HttpError(400, 'Every line needs a cost (0 or more).');
  const accountCode = String(b?.accountCode || '').trim();
  if (accountCode && !/^[A-Za-z0-9.-]{1,10}$/.test(accountCode)) throw new HttpError(400, 'That account code does not look right: use the number from Xero, e.g. 5000.');
  const { data: job } = await admin.from('jobs').select('id, so_number, customer, status').eq('id', jobId).single();
  if (!job || job.status === 'cancelled') throw new HttpError(404, 'That order is cancelled or no longer exists.');
  const s = await session();
  const po = buildPurchaseOrder({ date: new Date().toISOString().slice(0, 10), deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(b.deliveryDate || '') ? b.deliveryDate : '',
    so: job.so_number, customer: job.customer, accountCode, lines }, contactId);
  const r = await xeroPost(s, 'PurchaseOrders', { PurchaseOrders: [po] }, `clj-po-${key}`);
  const made = r.PurchaseOrders?.[0];
  if (!made?.PurchaseOrderID) throw new HttpError(502, 'Xero did not return a purchase order.');
  const net = lines.reduce((a: number, l: any) => a + Math.round(l.qty * l.unit * 100) / 100, 0);
  const { error } = await admin.from('purchase_orders').upsert({ job_id: job.id, xero_id: made.PurchaseOrderID, po_number: made.PurchaseOrderNumber || '',
    supplier_id: contactId, supplier_name: made.Contact?.Name || '', delivery_date: po.DeliveryDate || null, lines, net, account_code: accountCode, created_by: me.email }, { onConflict: 'xero_id' });
  return { id: made.PurchaseOrderID, number: made.PurchaseOrderNumber || '', supplier: made.Contact?.Name || '', recorded: !error };
}

async function read() {
  const s = await session();
  // Sales orders only. (Invoices were read here too but nothing used them, and Xero's invoice search
  // was failing with 500s, which stopped the preview.)
  const quotes = await allPages(s, `Quotes?DateFrom=${GO_LIVE}`, 'Quotes');
  const so = quotes.map(q => /^SO-?(\d+)$/i.exec(q.QuoteNumber || '')).filter(Boolean).map(m => Number(m![1]));
  let counterNext = null;
  if (so.length) {
    const { data } = await admin.rpc('bump_sales_order_counter', { p_min: Math.max(...so) + 1 });
    counterNext = data;
  }
  return {
    organisation: s.tenant_name,
    highestSo: so.length ? Math.max(...so) : null,
    counterNext,
    quotes: quotes.map(q => ({
      id: q.QuoteID, number: q.QuoteNumber, status: q.Status, customer: q.Contact?.Name || '',
      reference: q.Reference || '', date: xDate(q.DateString || q.Date), expiry: xDate(q.ExpiryDateString || q.ExpiryDate),
      subTotal: q.SubTotal, total: q.Total,
      lines: (q.LineItems || []).map((l: any) => ({ code: l.ItemCode || '', description: l.Description || '', qty: l.Quantity, unit: l.UnitAmount, amount: l.LineAmount })),
    })),
  };
}

/** Aged debt (Levi and Mandy, 20 Oct): every approved sales invoice with money still owed. Read only. */
async function debts() {
  const s = await session();
  const where = encodeURIComponent('Type=="ACCREC" AND AmountDue>0');
  const inv = await allPages(s, `Invoices?where=${where}&Statuses=AUTHORISED&summaryOnly=true`, 'Invoices');
  return { invoices: inv.map((x: any) => ({ id: x.InvoiceID, number: x.InvoiceNumber || '', reference: x.Reference || '',
    contactId: x.Contact?.ContactID || '', customer: x.Contact?.Name || '', date: xDate(x.DateString || x.Date),
    due: xDate(x.DueDateString || x.DueDate), total: Number(x.Total || 0), owed: Number(x.AmountDue || 0) })) };
}
/** Sales (20 Oct, Levi only): every approved or paid sales invoice and credit note in the last 24 months with
 *  its lines, for who buys what and how often. Read only. Also says how far back Xero's invoices go. */
async function history() {
  const s = await session();
  const d = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10).split('-').map(Number).join(',');
  const where = (t: string) => encodeURIComponent(`Type=="${t}" AND Date>=DateTime(${d})`);
  const inv = await allPages(s, `Invoices?where=${where('ACCREC')}&Statuses=AUTHORISED,PAID`, 'Invoices');
  let credits: any[] = [];
  try { credits = await allPages(s, `CreditNotes?where=${where('ACCRECCREDIT')}`, 'CreditNotes'); } catch { /* invoices alone still tell most of it */ }
  const row = (x: any, sign: number) => ({ id: x.InvoiceID || x.CreditNoteID || '', contactId: x.Contact?.ContactID || '', customer: x.Contact?.Name || '', date: xDate(x.DateString || x.Date),
    number: x.InvoiceNumber || x.CreditNoteNumber || '', reference: x.Reference || '', net: sign * Number(x.SubTotal || 0), total: sign * Number(x.Total || 0),
    owed: sign > 0 ? Number(x.AmountDue || 0) : 0, due: xDate(x.DueDateString || x.DueDate), status: x.Status || '',
    lines: sign > 0 ? (x.LineItems || []).map((l: any) => ({ description: String(l.Description || '').slice(0, 200), code: l.ItemCode || '', qty: Number(l.Quantity || 0), amount: Number(l.LineAmount || 0) })) : [] });
  const all = [...inv.map(x => row(x, 1)), ...credits.filter(c => ['AUTHORISED', 'PAID'].includes(c.Status)).map(x => row(x, -1))];
  return { invoices: all, earliest: all.reduce((m: string, x) => (!m || x.date < m ? x.date : m), '') };
}
/** Metal prices (20 Oct): what suppliers actually charged for materials, from approved and paid bills in the
 *  last 12 months, lines on account 5000 only. Read only. */
async function bills() {
  const s = await session();
  const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10).split('-').map(Number).join(',');
  const where = encodeURIComponent(`Type=="ACCPAY" AND Date>=DateTime(${from})`);
  const list = await allPages(s, `Invoices?where=${where}&Statuses=AUTHORISED,PAID`, 'Invoices');
  const out = [];
  for (const x of list) for (const l of (x.LineItems || [])) {
    if (String(l.AccountCode || '') !== '5000' || !l.Description) continue;
    out.push({ number: x.InvoiceNumber || x.Reference || '', supplier: x.Contact?.Name || '', date: xDate(x.DateString || x.Date),
      description: l.Description, qty: Number(l.Quantity || 0), unit: Number(l.UnitAmount || 0), amount: Number(l.LineAmount || 0) });
  }
  return { bills: out, from: xDate(new Date(Date.now() - 365 * 864e5).toISOString()) };
}
/** Xero's pay-online page for each invoice (for a chase email), up to 15 at a time. Read only. */
async function onlineLinks(ids: unknown) {
  const want = (Array.isArray(ids) ? ids : []).filter(i => /^[0-9a-f-]{36}$/i.test(String(i))).slice(0, 15);
  const s = await session(), out: Record<string, string> = {};
  for (const id of want) {
    try { const r = await xero(s, `Invoices/${id}/OnlineInvoice`); const u = r.OnlineInvoices?.[0]?.OnlineInvoiceUrl; if (u) out[id] = u; }
    catch { /* a draft or an invoice Xero will not share: the email just has no link for it */ }
  }
  return { links: out };
}

/** Levi's month (MD only): this month's approved and paid sales invoices, and credit notes, net of
 *  VAT. The board leaves out its own invoices (by ID and by their DN- reference) and adds the rest, so
 *  the month counts what was invoiced in Xero outside the board too (the weeks before changeover). */
async function monthSales(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Which month?');
  const s = await session();
  const dt = (d: string) => `DateTime(${d.split('-').map(Number).join(',')})`;
  const where = encodeURIComponent(`Type=="ACCREC" AND Date>=${dt(from)} AND Date<=${dt(to)}`);
  const inv = await allPages(s, `Invoices?where=${where}&Statuses=AUTHORISED,PAID&summaryOnly=true`, 'Invoices');
  let credits: any[] | null = null;
  try {
    const cw = encodeURIComponent(`Type=="ACCRECCREDIT" AND Date>=${dt(from)} AND Date<=${dt(to)} AND (Status=="AUTHORISED" OR Status=="PAID")`);
    credits = await allPages(s, `CreditNotes?where=${cw}`, 'CreditNotes');
  } catch (e) { console.warn('credit notes not read:', (e as Error).message); }
  const row = (x: any, sign: number) => ({ id: x.InvoiceID || x.CreditNoteID, number: x.InvoiceNumber || x.CreditNoteNumber || '',
    reference: x.Reference || '', customer: x.Contact?.Name || '', date: xDate(x.DateString || x.Date), net: sign * Number(x.SubTotal || 0),
    credit: sign < 0 });
  return { from, to, invoices: [...inv.map(x => row(x, 1)), ...(credits || []).map(x => row(x, -1))], creditsRead: credits != null };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    if (route === 'callback') return await callback(url);
    const me = await office(req);
    if (!CLIENT_ID || !CLIENT_SECRET) throw new HttpError(503, 'Xero is not set up yet: XERO_CLIENT_ID and XERO_CLIENT_SECRET are missing from Supabase › Edge Functions › Secrets.');
    const reply = (body: unknown) => cors(req, json({ ...(body as Record<string, unknown>), xero_left: limits }));
    const b = await req.json().catch(() => ({})) as any;
    const fresh = b?.fresh === true;
    if (route === 'connect') return reply({ url: await connectUrl(me.email) });
    if (route === 'read') return reply(await cached('read', 15 * MIN, fresh, read));
    if (route === 'contacts') return reply(await cached('contacts', 30 * MIN, fresh, contacts));
    if (route === 'contact') return reply(await contact(b?.id));
    if (route === 'items') return reply(await cached('items', HOUR, fresh, items));
    if (route === 'po') return reply(await purchaseOrder(b, me));
    if (route === 'month') {
      if (me.role !== 'md') throw new HttpError(403, 'Only Levi can see the month figures.');
      return reply(await cached(`month:${b?.from}:${b?.to}`, 15 * MIN, fresh, () => monthSales(b?.from, b?.to)));
    }
    if (route === 'debts') return reply(await cached('debts', 15 * MIN, fresh, debts));
    if (route === 'bills') return reply(await cached('bills', 6 * HOUR, fresh, bills));
    // per-invoice amounts, as Mandy sees on orders; totals are drawn for Levi only
    if (route === 'history') return reply(await cached('history', 6 * HOUR, fresh, history));
    if (route === 'online') return reply(await onlineLinks(b?.ids));
    if (route === 'invoices') return reply(await invoiceStatus(b?.ids));
    if (route === 'send') return reply(await send(b?.items));
    if (route === 'disconnect') { await admin.rpc('xero_disconnect'); return reply({ ok: true }); }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (route === 'callback') return back('Something went wrong connecting Xero: ' + (e as Error).message);
    return cors(req, json({ error: (e as Error).message }, status));
  }
});
