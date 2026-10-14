// Clarke Lane Job Board ↔ Xero. The only place the Xero client secret and tokens exist.
//
// Routes (all under /functions/v1/xero/):
//   POST connect   office only → { url } to send the browser to Xero's consent page
//   GET  callback  Xero redirects here; stores tokens; sends the browser back to the board
//   POST read      office only → sales orders (Xero quotes) and sales invoices since go-live
//   POST contacts  office only → Xero contacts + the sales account/VAT Clarke Lane's invoices use
//   POST contact   office only → one contact's details (contact person, email, delivery address)
//   POST send      office only → one DRAFT sales invoice per despatch (never approved or sent)
//   POST disconnect office only
//
// Secrets (Supabase › Edge Functions › Secrets): XERO_CLIENT_ID, XERO_CLIENT_SECRET.
// Optional: XERO_SCOPES. Deployed with verify_jwt off because Xero's redirect carries no
// Supabase token; every other route checks the caller itself (office()).
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
// A copy of src/core/xero.js (tests/xero.mjs checks they are identical).
import { buildInvoice, invoiceNet, salesDefaults } from './xero-core.js';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') || '';
// Granular scopes: Xero apps created after 2 March 2026 cannot use the old broad ones.
// accounting.invoices covers invoices and quotes (sales orders), read and draft-invoice write.
const SCOPES = Deno.env.get('XERO_SCOPES') ||
  'openid profile email offline_access accounting.invoices accounting.contacts.read';
const CALLBACK = `${SB_URL}/functions/v1/xero/callback`;
const BOARD = 'https://gecko-it-services.github.io/clarke-lane-job-board/';
const ORIGINS = ['https://gecko-it-services.github.io', 'http://localhost:8080'];
const GO_LIVE = '2026-10-01';   // Clarke Lane's first day in Xero

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

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
const back = (msg: string) => Response.redirect(`${BOARD}?xero=${encodeURIComponent(msg)}#despatch`, 302);

/** The caller, if they are office staff on the board. */
async function office(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to the job board first.');
  const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data, error } = await user.rpc('me');
  if (error) throw new HttpError(401, 'Your job board sign-in has expired. Reload the page.');
  const me = data?.[0];
  if (me?.role !== 'office') throw new HttpError(403, 'Only Levi and Mandy can use the Xero connection.');
  return me as { email: string; name: string };
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
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token })
    .catch(() => { throw new HttpError(409, 'The Xero connection has lapsed (unused for 60 days, or removed in Xero). Press Connect to Xero again.'); });
  const expires = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await admin.rpc('xero_update_tokens', { p_access: t.access_token, p_refresh: t.refresh_token, p_expires_at: expires });
  return { ...row, access_token: t.access_token };
}

async function xero(s: { access_token: string; tenant_id: string }, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
      headers: { Authorization: `Bearer ${s.access_token}`, 'xero-tenant-id': s.tenant_id, Accept: 'application/json' } });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new HttpError(502, `Xero said ${res.status} reading ${path.split('?')[0]}.`);
    return res.json();
  }
  throw new HttpError(503, 'Xero is busy (rate limit). Try again in a minute.');
}

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
    allPages(s, `Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&summaryOnly=true`, 'Contacts'),
    defaults(s)]);
  return { contacts: list.map(c => ({ id: c.ContactID, name: c.Name })).sort((a, b) => a.name.localeCompare(b.name)), defaults: d };
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
  const person = [c.FirstName, c.LastName].filter(Boolean).join(' ');
  return { id: c.ContactID, name: c.Name, email: c.EmailAddress || '', person, address };
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
        .select('id, dn_number, despatched_on, xero_invoice_id, xero_invoice_no, job_id, ' +
          'jobs(so_number, customer_po), despatch_lines(qty, job_lines(part, line_no, job_line_prices(unit_price)))')
        .eq('id', it.despatchId).single();
      if (error || !row) throw new Error('Despatch not found.');
      if (row.xero_invoice_id || row.xero_invoice_no) { out.push({ despatchId: it.despatchId, ok: true, invoiceNo: row.xero_invoice_no, already: true }); continue; }
      if (!it.contactId) throw new Error('Choose the Xero contact first.');
      const job: any = row.jobs;
      const lines = (row.despatch_lines as any[])
        .sort((a, b) => a.job_lines.line_no - b.job_lines.line_no)
        .map(l => ({ part: l.job_lines.part, qty: l.qty, unit: Number(l.job_lines.job_line_prices?.unit_price ?? l.job_lines.job_line_prices?.[0]?.unit_price) }));
      if (lines.some(l => !Number.isFinite(l.unit))) throw new Error('A part on this despatch has no price.');
      const inv = buildInvoice({ dn: row.dn_number, date: row.despatched_on, so: job.so_number, po: job.customer_po, calloff: '', lines },
        it.contactId, d.accountCode, d.taxType);
      const r = await xeroPost(s, 'Invoices', { Invoices: [inv] }, `clj-despatch-${row.id}`);
      const made = r.Invoices?.[0];
      if (!made?.InvoiceID) throw new Error('Xero did not return an invoice.');
      const { data: marked } = await admin.rpc('xero_mark_sent', { p_despatch_id: row.id, p_invoice_id: made.InvoiceID, p_invoice_no: made.InvoiceNumber || '' });
      const net = invoiceNet(inv);
      out.push({ despatchId: it.despatchId, ok: true, invoiceNo: made.InvoiceNumber, net,
        xeroNet: made.SubTotal, mismatch: Math.abs((made.SubTotal ?? net) - net) > 0.004, recorded: !!marked });
    } catch (e) {
      out.push({ despatchId: it.despatchId, ok: false, error: (e as Error).message });
    }
  }
  return { results: out, defaults: d };
}

async function read() {
  const s = await session();
  const [quotes, invoices] = await Promise.all([
    allPages(s, `Quotes?DateFrom=${GO_LIVE}`, 'Quotes'),
    allPages(s, `Invoices?where=${encodeURIComponent(`Type=="ACCREC"&&Date>=DateTime(${GO_LIVE.replaceAll('-', ',')})`)}`, 'Invoices'),
  ]);
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
      lines: (q.LineItems || []).map((l: any) => ({ description: l.Description || '', qty: l.Quantity, unit: l.UnitAmount, amount: l.LineAmount })),
    })),
    invoices: invoices.filter(i => i.Status !== 'DELETED' && i.Status !== 'VOIDED').map(i => ({
      id: i.InvoiceID, number: i.InvoiceNumber, status: i.Status, customer: i.Contact?.Name || '',
      reference: i.Reference || '', date: xDate(i.DateString || i.Date), subTotal: i.SubTotal, total: i.Total })),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    if (route === 'callback') return await callback(url);
    const me = await office(req);
    if (!CLIENT_ID || !CLIENT_SECRET) throw new HttpError(503, 'Xero is not set up yet: XERO_CLIENT_ID and XERO_CLIENT_SECRET are missing from Supabase › Edge Functions › Secrets.');
    if (route === 'connect') return cors(req, json({ url: await connectUrl(me.email) }));
    if (route === 'read') return cors(req, json(await read()));
    if (route === 'contacts') return cors(req, json(await contacts()));
    if (route === 'contact') return cors(req, json(await contact((await req.json().catch(() => ({}))).id)));
    if (route === 'send') return cors(req, json(await send((await req.json().catch(() => ({}))).items)));
    if (route === 'disconnect') { await admin.rpc('xero_disconnect'); return cors(req, json({ ok: true })); }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (route === 'callback') return back('Something went wrong connecting Xero: ' + (e as Error).message);
    return cors(req, json({ error: (e as Error).message }, status));
  }
});
