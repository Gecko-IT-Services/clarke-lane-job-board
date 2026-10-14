/**
 * The board: Jobs, Shop floor, Quotes, Despatch. Rendering from one state object;
 * every change goes to Supabase first and the board redraws from what comes back.
 */
import * as auth from './auth.js';
import * as data from './data.js';
import { normName, matchContact } from './core/xero.js';
import { PROCESSES, SHORT, sent, left, needed, doneCount, allDone, value, despatchValue, stage, nextDue,
  lastDespatch, calloffDates, defaultDespatchQty, suggestProcesses, describeLine, unitPrice, round2,
  addWorkingDays, quoteStates, deliveryDates, deliveryLabel, despatchStatus, invoiceStatus, splitIntoCalloffs } from './core/jobs.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (n, dp = 0) => n == null ? '' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const unit = n => n == null ? '' : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayIso = () => iso(new Date());
const fmt = s => { if (!s) return ''; const [, m, d] = s.slice(0, 10).split('-'); return +d + ' ' + MON[+m - 1]; };
const fmtLong = s => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return +d + ' ' + MON[+m - 1] + ' ' + y; };
const fmtTime = s => { if (!s) return ''; const d = new Date(s); return fmt(iso(d)) + ' ' + d.toTimeString().slice(0, 5); };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const S = { view: 'board', orderFilter: 'outstanding', ask: null, forcePick: new Set(), xc: null, xcErr: null, xcMap: new Map(), sendPick: {}, sendErr: {}, xero: null, xeroRead: null, xeroErr: null, xeroBusy: false, newJob: null, me: null, jobs: [], quotesRaw: null, dismissed: [], quotesErr: null, cancelAsk: null, stageChosen: false, tab: 'jobs', stage: 'current', search: '',
  station: 'all', open: null, conv: null, desp: null, error: null, busy: false };
const office = () => S.me?.role === 'office';
const job = id => S.jobs.find(j => j.id === id);
/** Ordered quotes with where each stands (waiting / job / dismissed), or null until read. */
const quotes = () => S.quotesRaw ? quoteStates(S.quotesRaw, S.jobs, S.dismissed) : null;

/* ---------- start ---------- */
async function boot() {
  let st;
  try { st = await auth.start(); }
  catch (e) { return gate(`<p>${esc(e.message)}</p><button class="btn pri" type="button" data-signin>Try signing in again</button>`); }
  if (!st.account || !st.ready) {
    return gate(`<p>Sign in with your Clarke Lane Microsoft account to open the job board.</p>
      <button class="btn pri" type="button" data-signin>Sign in with Microsoft</button>`);
  }
  try { S.me = await data.whoAmI(); }
  catch (e) { return gate(`<p>${esc(e.message)}</p><button class="btn" type="button" data-reload>Try again</button>`); }
  if (!S.me.role) {
    return gate(`<p><b>${esc(st.account.username)}</b> is signed in but is not on the job board's staff list.</p>
      <p class="note">Ask Gecko IT to add this address. Until then the board shows nothing.</p>
      <button class="btn" type="button" data-signout>Sign out</button>`);
  }
  $('gate').hidden = true; $('app').hidden = false;
  $('who').innerHTML = `${esc(S.me.name)} <button class="btn sm ghost" type="button" data-signout>Sign out</button>`;
  try { const t = localStorage.getItem('clj.station'); if (t && (t === 'all' || PROCESSES.includes(t))) S.station = t; } catch { /* none kept */ }
  fromHash();
  await reload();
  if (office()) { loadQuotes(); loadXeroStatus(); }
  const back = new URLSearchParams(location.search).get('xero');
  if (back) {
    history.replaceState(null, '', location.pathname + '#xero'); S.tab = 'xero';
    if (back === 'connected') toast('Xero connected.'); else toast(back, null, true);
  }
  data.onChange(debounce(reload, 400)).catch(() => {});
  setInterval(() => { if (!document.hidden) reload(); }, 60000);   // backstop if realtime drops
}
function gate(html) { $('app').hidden = true; $('gate').hidden = false; $('gate-body').innerHTML = html; }
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

async function reload() {
  try {
    [S.jobs, S.dismissed] = await Promise.all([data.loadJobs({ office: office() }), office() ? data.loadDismissed() : []]);
    S.error = null;
    if (!S.stageChosen) {            // open on the first list that has something in it
      const has = st => S.jobs.some(j => stage(j) === st);
      S.stage = has('current') ? 'current' : has('upcoming') ? 'upcoming' : 'current';
    }
  } catch (e) { S.error = e.message; }
  render();
}
async function loadQuotes() {
  S.quotesErr = null;
  try { S.quotesRaw = await data.orderedQuotes(); }
  catch (e) { S.quotesErr = e.message; }
  render();
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, undo, bad) {
  const t = $('toast'); clearTimeout(toastT);
  t.className = 'toast' + (bad ? ' bad' : '');
  t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button" id="undo">Undo</button>' : '');
  t.hidden = false;
  if (undo) $('undo').onclick = () => { t.hidden = true; undo(); };
  toastT = setTimeout(() => t.hidden = true, bad ? 9000 : 5000);
}

/* ---------- derived bits ---------- */
function dueChip(due) {
  if (!due) return '<span class="chip">no date</span>';
  const days = Math.round((new Date(due + 'T00:00') - new Date(todayIso() + 'T00:00')) / 864e5);
  if (days < 0) return `<span class="chip late">${-days}d late · ${fmt(due)}</span>`;
  if (days === 0) return '<span class="chip soon">today</span>';
  if (days <= 7) return `<span class="chip soon">${fmt(due)}</span>`;
  return `<span class="chip">${fmt(due)}</span>`;
}
function statusChips(j) {
  const st = stage(j), out = [];
  if (j.status === 'held') out.push('<span class="chip late">On hold</span>');
  if (st === 'cancelled') return '<span class="chip">Cancelled</span>';
  if (st === 'completed') {
    if (office()) out.push(j.despatches.some(d => !d.xero) ? '<span class="chip soon">Waiting for Xero</span>' : '<span class="chip ok">Invoiced</span>');
    else out.push('<span class="chip ok">All sent</span>');
    return out.join('');
  }
  const del = deliveryLabel(j);
  if (del) out.push(`<span class="chip">${del}</span>`);
  else if (j.despatches.length) out.push('<span class="chip">Part despatched</span>');
  if (allDone(j)) out.push('<span class="chip ok">Ready to despatch</span>');
  else if (st === 'current') out.push(`<span class="chip">${doneCount(j)} of ${needed(j).length} done</span>`);
  if (S.quotesRaw && j.spQuoteId && !S.quotesRaw.some(q => q.spId === j.spQuoteId)) out.push('<span class="chip late" title="The quote is no longer marked Ordered in the quote calculator">Quote no longer Ordered</span>');
  return out.join('');
}
const onBoardStage = j => ['upcoming', 'current'].includes(stage(j));
const byDue = (a, b) => (nextDue(a) < nextDue(b) ? -1 : 1);

/* ---------- actions ---------- */
async function toggleProc(id, p) {
  const j = job(id); const prev = j.procs[p]; if (!prev) return;
  const done = !prev.done;
  j.procs[p] = done ? { done: true, by: S.me.name, at: new Date().toISOString() } : { done: false };
  render();
  try {
    await data.setProcess(id, p, done, S.me.name);
    toast(done ? `${p} done on ${j.so}` + (allDone(j) ? '. Ready to despatch.' : '') : `${p} on ${j.so} set back to not done`,
      async () => { try { await data.setProcess(id, p, prev.done, prev.by || S.me.name); } catch (e) { toast(e.message, null, true); } reload(); });
  } catch (e) { j.procs[p] = prev; render(); toast(e.message, null, true); }
}

async function startConvert(spId) {
  const q = S.quotesRaw.find(x => x.spId === spId);
  S.conv = { spId, loading: true }; render();
  try {
    const lines = await data.quoteLines(spId);
    if (!lines.length) throw new Error(`${q.quoteNo} has no lines in QuoteLines, so there is nothing to make.`);
    const bad = lines.find(l => !(l.qty > 0));
    if (bad) throw new Error(`"${describeLine(bad)}" has no quantity on ${q.quoteNo}. Fix it in the quote calculator first.`);
    const due = addWorkingDays(todayIso(), q.deliveryDays > 0 ? q.deliveryDays : 10);
    S.conv = null;
    openOrderForm({ from: `quote ${q.quoteNo}`, spQuoteId: q.spId, quoteNo: q.quoteNo, customer: q.customer,
      contact: q.contactName, contactEmail: q.contactEmail, due, procs: suggestProcesses(lines),
      lines: lines.map(l => ({ part: describeLine(l), qty: String(l.qty), price: String(unitPrice(l.sellTotal, l.qty)), due }))
        .concat(q.carriage > 0 ? [{ part: 'Carriage', qty: '1', price: String(q.carriage), due }] : []) });
  } catch (e) { S.conv = null; toast(e.message, null, true); render(); }
}

async function makeDespatch() {
  const j = job(S.desp);
  const lines = j.lines.filter(l => left(j, l) > 0).map(l => {
    const v = Math.floor(+document.querySelector(`[data-dq="${l.id}"]`)?.value || 0);
    return { job_line_id: l.id, qty: Math.max(0, Math.min(v, left(j, l))) };
  }).filter(l => l.qty > 0);
  if (!lines.length) { $('dn-msg').textContent = 'Enter a quantity for at least one part.'; return; }
  S.busy = true; render();
  try {
    const d = await data.createDespatch(j.id, lines);
    keepInputs = false; await reload();
    const done = stage(job(j.id)) === 'completed';
    if (done) S.desp = null;
    showDoc('dn', j.id, d.id);
    toast(`${d.dn_number} created.` + (done ? ` ${j.so} is fully despatched.` : ' The rest stays outstanding on the order.'));
  } catch (e) { toast(e.message, null, true); }
  S.busy = false; render();
}

async function dismiss(spId) {
  const q = S.quotesRaw.find(x => x.spId === spId);
  if (S.conv?.spId === spId) S.conv = null;
  S.dismissed = [...S.dismissed, spId]; render();
  try {
    await data.dismissQuote(spId, q.quoteNo);
    toast(`${q.quoteNo} marked not a job. The quote itself is unchanged.`, () => restore(spId));
  } catch (e) { S.dismissed = S.dismissed.filter(x => x !== spId); render(); toast(e.message, null, true); }
}
async function restore(spId) {
  const q = S.quotesRaw.find(x => x.spId === spId);
  S.dismissed = S.dismissed.filter(x => x !== spId); render();
  try { await data.restoreQuote(spId); toast(`${q?.quoteNo || 'Quote'} is back in Ordered, ready to become a job.`); }
  catch (e) { toast(e.message, null, true); reload(); }
}
async function setStatus(id, status) {
  const j = job(id);
  try {
    await data.setJobStatus(id, status); S.ask = null;
    toast({ held: `${j.so} is on hold. It cannot be despatched until it is released.`, open: `${j.so} released.`, cancelled: `${j.so} cancelled. It stays in the Sales orders list.` }[status]);
  } catch (e) { toast(e.message, null, true); }
  reload();
}
async function deleteOrder(id) {
  const j = job(id);
  try { await data.deleteJob(id); S.open = null; S.ask = null; toast(`${j.so} deleted.`); }
  catch (e) { toast(e.message, null, true); }
  reload();
}

/* ---------- tabs ---------- */
const TABS = [['jobs', 'Jobs'], ['floor', 'Shop floor'], ['quotes', 'Quotes'], ['despatch', 'Despatch'], ['xero', 'Xero']];
function renderTabs() {
  const ready = (quotes() || []).filter(q => q.state === 'waiting').length;
  const toXero = S.jobs.reduce((a, j) => a + j.despatches.filter(d => !d.xero).length, 0);
  $('tabs').innerHTML = TABS.filter(([k]) => office() || (k !== 'quotes' && k !== 'xero')).map(([k, t]) => {
    const b = k === 'quotes' ? ready : k === 'despatch' && office() ? toXero : 0;
    return `<a href="#${k}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${t}${b ? `<span class="badge">${b}</span>` : ''}</a>`;
  }).join('');
}

/* ---------- jobs ---------- */
function procCell(j, p) {
  const s = j.procs[p]; if (!s) return '<span class="na" aria-label="Not needed">–</span>';
  const title = s.done ? `${p} done by ${s.by}, ${fmtTime(s.at)}` : `Mark ${p} done`;
  return `<button type="button" class="tick ${s.done ? 'done' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}" title="${esc(title)}" aria-label="${esc(title)}">${s.done ? TICK : ''}</button>`;
}
function renderJobs() {
  const money = office();
  const head = `<div class="sec-h"><h2>${S.view === 'orders' ? 'Sales orders' : 'Jobs'}</h2>
      ${money ? `<div class="seg" role="group" aria-label="View"><button type="button" data-view="board" aria-pressed="${S.view === 'board'}">Job board</button><button type="button" data-view="orders" aria-pressed="${S.view === 'orders'}">Sales orders</button></div>` : ''}
      ${money && !S.form ? '<span class="right"><button class="btn pri" type="button" data-neworder>New order</button></span>' : ''}</div>
    ${S.form ? orderForm() : ''}`;
  $('v-jobs').innerHTML = head + (S.view === 'orders' && money ? salesOrders() : jobBoard());
}
function jobBoard() {
  const q = S.search.toLowerCase();
  const by = { upcoming: [], current: [], completed: [] };
  S.jobs.forEach(j => by[stage(j)]?.push(j));
  const list = by[S.stage].filter(j => !q || [j.so, j.customer, j.po, j.quote, ...j.lines.map(l => l.part)].some(s => (s || '').toLowerCase().includes(q)));
  list.sort(S.stage === 'completed' ? (a, b) => (lastDespatch(b) < lastDespatch(a) ? -1 : 1) : byDue);
  const money = office();
  const seg = [['upcoming', 'Upcoming'], ['current', 'Current'], ['completed', 'Completed']].map(([k, t]) =>
    `<button type="button" data-stage="${k}" aria-pressed="${S.stage === k}">${t}<span class="c">${by[k].length}</span></button>`).join('');
  const sum = list.reduce((a, j) => a + (value(j, { remaining: true }) || 0), 0);
  const rows = list.map(j => {
    const pin = needed(j).map(p => `<button type="button" class="tick ${j.procs[p].done ? 'done' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${j.procs[p].done}">${j.procs[p].done ? TICK : ''}${SHORT[p]}</button>`).join('');
    const dueCell = stage(j) === 'completed' ? `<span class="chip">sent ${fmt(lastDespatch(j))}</span>` : dueChip(nextDue(j));
    return `<tr data-open="${j.id}">
      <td class="cust"><b>${esc(j.customer)}</b><div class="meta">${statusChips(j)}</div><div class="pin">${pin}</div></td>
      <td class="so">${esc(j.so)}</td><td class="po">${esc(j.po) || '—'}</td><td class="due">${dueCell}</td>
      ${PROCESSES.map(p => `<td class="p">${procCell(j, p)}</td>`).join('')}
      ${money ? `<td class="val num">${gbp(S.stage === 'completed' ? value(j) : value(j, { remaining: true }))}</td>` : ''}</tr>`;
  }).join('');
  const blurb = { upcoming: 'Confirmed orders nobody has started yet.', current: 'At least one process done, or part despatched.', completed: 'Everything despatched.' }[S.stage];
  const empty = S.jobs.length ? (q ? 'No jobs match that search.' : 'No jobs here.')
    : (money ? 'No orders yet. Turn an ordered quote into one on the Quotes tab, or press New order.' : 'No jobs yet. They appear here once the office creates them.');
  return `<p class="sub note">${blurb}${money && S.stage !== 'completed' && list.length ? ` ${gbp(sum)} still to despatch.` : ''}</p>
    <div class="sec-h" style="gap:10px"><div class="seg" role="group" aria-label="Job stage">${seg}</div>
      <input type="search" id="search" placeholder="Search customer, SO, PO or part" value="${esc(S.search)}" style="flex:1 1 240px;max-width:360px;margin-left:auto"></div>
    <div class="tbl-wrap"><table class="jobs"><thead><tr><th>Customer</th><th>Sales order</th><th>Customer PO</th><th>${S.stage === 'completed' ? 'Despatched' : 'Due'}</th>
      ${PROCESSES.map(p => `<th class="p">${esc(p)}</th>`).join('')}${money ? `<th style="text-align:right">${S.stage === 'completed' ? 'Value' : 'Outstanding'}</th>` : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="15" class="empty">${empty}</td></tr>`}</tbody></table></div>
    <p class="note">Tick a box when that process is finished. A dash means the job doesn't need it. Click a row for the full order.</p>`;
}
/** The Sage-style list of sales orders, with despatch and invoice status. Office only. */
function salesOrders() {
  const q = S.search.toLowerCase();
  const f = S.orderFilter;
  const keep = j => f === 'all' ? true : f === 'cancelled' ? j.status === 'cancelled' : f === 'held' ? j.status === 'held'
    : f === 'complete' ? stage(j) === 'completed' : stage(j) !== 'completed' && j.status !== 'cancelled';
  const list = S.jobs.filter(keep).filter(j => !q || [j.so, j.customer, j.po, j.quote].some(s => (s || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.so < b.so ? 1 : -1));
  const rows = list.map(j => `<tr data-open="${j.id}"><td class="mono">${esc(j.so)}</td><td>${fmt(j.ordered)}</td><td style="text-align:left"><b>${esc(j.customer)}</b></td>
      <td style="text-align:left">${esc(j.po) || '—'}</td><td class="num">${gbp(value(j), 2)}</td><td>${stage(j) === 'completed' || j.status === 'cancelled' ? '' : dueChip(nextDue(j))}</td>
      <td>${j.status === 'cancelled' ? '<span class="chip">Cancelled</span>' : `<span class="chip ${despatchStatus(j) === 'Despatched' ? 'ok' : ''}">${despatchStatus(j)}</span>`}${j.status === 'held' ? ' <span class="chip late">On hold</span>' : ''}</td>
      <td><span class="chip ${invoiceStatus(j) === 'Invoiced' ? 'ok' : ''}">${invoiceStatus(j)}</span></td></tr>`).join('');
  const filters = [['outstanding', 'Outstanding'], ['complete', 'Despatched'], ['held', 'On hold'], ['cancelled', 'Cancelled'], ['all', 'All']]
    .map(([k, t]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="sec-h" style="gap:10px"><label class="fl" style="flex-direction:row;align-items:center;gap:8px">Show <select class="f" id="ofilter">${filters}</select></label>
      <input type="search" id="search" placeholder="Search order, customer or PO" value="${esc(S.search)}" style="flex:1 1 240px;max-width:360px;margin-left:auto"></div>
    <div class="tbl-wrap"><table class="lines solist"><thead><tr><th>Order</th><th>Date</th><th style="text-align:left">Customer</th><th style="text-align:left">Customer order no.</th><th>Net</th><th>Next due</th><th>Despatched</th><th>Invoiced</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="empty">No orders here.</td></tr>`}</tbody></table></div>`;
}

/* ---------- the sales order form (Sage: New / Amend), for quotes, Xero orders, phone orders and Sage carry-over ---------- */
const blankLine = due => ({ part: '', qty: '', price: '', due: due || '' });
function openOrderForm(prefill = {}, amendId = null) {
  const due = prefill.due || addWorkingDays(todayIso(), 10);
  S.form = { mode: amendId ? 'amend' : 'new', jobId: amendId, so: '', customer: '', po: '', contact: '', contactEmail: '',
    address: '', notes: '', due, lines: [blankLine(due)], procs: [], xeroQuoteId: null, spQuoteId: null, quoteNo: '', from: '', ...prefill };
  S.open = null; S.tab = 'jobs'; history.replaceState(null, '', '#jobs'); keepInputs = false; render(); window.scrollTo(0, 0);
}
function openAmend(id) {
  const j = job(id);
  openOrderForm({ so: j.so, customer: j.customer, po: j.po, contact: j.contactName, address: j.address, notes: j.notes,
    due: nextDue(j), procs: needed(j),
    lines: j.lines.map(l => ({ id: l.id, part: l.part, qty: String(l.qty), price: String(l.price), due: l.due, sent: sent(j, l) })) }, id);
}
/** Copy what is typed into S.form, so adding, removing or splitting lines keeps everything else. */
function collectForm() {
  const n = S.form, v = id => $(id)?.value ?? '';
  Object.assign(n, { so: v('of-so'), customer: v('of-cust') || n.customer, po: v('of-po'), contact: v('of-contact'), address: v('of-addr'),
    due: v('of-due') || n.due, notes: v('of-notes') });
  n.lines = n.lines.map((l, i) => ({ ...l, part: v('of-part' + i), qty: v('of-qty' + i), price: v('of-price' + i), due: v('of-ldue' + i) }));
  n.procs = [...document.querySelectorAll('input[name=of-p]:checked')].map(i => i.value);
  n.splitN = v('of-sn'); n.splitEvery = v('of-se'); n.splitFrom = v('of-sf');
}
const lineNet = l => round2((Number(l.qty) || 0) * (Number(l.price) || 0));
function formTotals(lines) {
  const net = round2(lines.reduce((a, l) => a + lineNet(l), 0)), vat = round2(net * 0.2);
  return `Net <b>${gbp(net, 2)}</b> · VAT 20% ${gbp(vat, 2)} · Total <b>${gbp(net + vat, 2)}</b>`;
}
function orderForm() {
  const n = S.form, amend = n.mode === 'amend';
  const rows = n.lines.map((l, i) => `<tr><td><input type="text" id="of-part${i}" value="${esc(l.part)}" placeholder="Part and spec" aria-label="Part, line ${i + 1}"></td>
    <td><input type="number" id="of-qty${i}" value="${esc(l.qty)}" min="${l.sent || 1}" step="1" aria-label="Quantity, line ${i + 1}"></td>
    <td><input type="number" id="of-price${i}" value="${esc(l.price)}" min="0" step="any" aria-label="Unit price, line ${i + 1}"></td>
    <td><input type="date" id="of-ldue${i}" value="${esc(l.due)}" aria-label="Due date, line ${i + 1}"></td>
    <td class="num" id="of-net${i}">${gbp(lineNet(l), 2)}</td>
    ${amend ? `<td class="num">${l.sent || 0}</td>` : ''}
    <td>${n.lines.length > 1 && !l.sent ? `<button class="btn sm" type="button" data-oldel="${i}" aria-label="Remove line ${i + 1}">Remove</button>` : ''}</td></tr>`).join('');
  return `<form class="panel newjob" data-orderform><h3>${amend ? `Amend ${esc(n.so)}` : 'New sales order'}${n.from ? ` <span class="note">from ${esc(n.from)}</span>` : ''}</h3>
    <div class="row2"><label class="fl">Customer<input type="text" id="of-cust" value="${esc(n.customer)}" ${amend ? 'disabled' : 'required'}></label>
      ${amend ? `<label class="fl">Order number<input type="text" value="${esc(n.so)}" disabled></label>`
        : `<label class="fl">Order number<input type="text" id="of-so" value="${esc(n.so)}" placeholder="Blank = next SO number"></label>`}</div>
    ${amend ? '' : '<p class="note">Leave the order number blank for a new order. For one that already has a number, type it: SO-9726 raised in Xero, SAGE-9701 carried over from Sage.</p>'}
    <div class="row2"><label class="fl">Customer order no. (PO)<input type="text" id="of-po" value="${esc(n.po)}"></label>
      <label class="fl">Contact<input type="text" id="of-contact" value="${esc(n.contact)}"></label></div>
    <div class="row2"><label class="fl">Delivery address<textarea id="of-addr" rows="3" placeholder="Leave blank to deliver to the customer's usual address">${esc(n.address)}</textarea></label>
      <label class="fl">Promised delivery (default for new lines)<input type="date" id="of-due" value="${esc(n.due)}"></label></div>
    <div style="overflow-x:auto"><table class="lines njlines"><thead><tr><th>Part</th><th>Qty</th><th>Unit price (£)</th><th>Due</th><th>Net</th>${amend ? '<th>Despatched</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="actions"><button class="btn sm" type="button" data-oladd>Add a line</button>
      <details class="splitter"><summary class="btn sm">Split into call-offs…</summary>
        <div class="row3"><label class="fl">Deliveries<input type="number" id="of-sn" min="2" max="24" value="${esc(n.splitN || 4)}"></label>
          <label class="fl">How often<select class="f" id="of-se">${[['7', 'Weekly'], ['14', 'Every 2 weeks'], ['m', 'Monthly']].map(([v, t]) => `<option value="${v}" ${n.splitEvery === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fl">First delivery<input type="date" id="of-sf" value="${esc(n.splitFrom || n.due)}"></label></div>
        <p class="note">Each line becomes one line per delivery, with the quantity shared out. Adjust any quantity or date afterwards, as you would in Sage.</p>
        <button class="btn sm" type="button" data-olsplit>Split the lines</button></details></div>
    <p class="note" id="of-tot">${formTotals(n.lines)}</p>
    <div class="fl">Processes this order needs${n.spQuoteId ? '. Ticked from the quote lines; check them and add Tap or C/Sink if needed.' : ''}</div>
    <div class="pchecks">${PROCESSES.map(p => `<label><input type="checkbox" name="of-p" value="${esc(p)}" ${n.procs.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div>
    <label class="fl">Notes (optional)<input type="text" id="of-notes" value="${esc(n.notes)}"></label>
    <div class="actions"><button class="btn pri" type="submit" ${S.busy ? 'disabled' : ''}>${amend ? 'Save the changes' : 'Create order'}</button><button class="btn" type="button" data-olcancel>Cancel</button></div>
    <p class="note" id="of-msg"></p></form>`;
}
function splitLines() {
  collectForm();
  const n = S.form;
  if (n.lines.some(l => l.sent)) return toast('Some lines have despatches already. Add new lines for the remaining deliveries instead.', null, true);
  const count = Math.max(2, Math.min(24, +n.splitN || 2));
  const dates = calloffDates(n.splitFrom || n.due, count, n.splitEvery || '7');
  const real = n.lines.filter(l => l.part.trim() && Number(l.qty) > 0);
  if (!real.length) return toast('Enter the parts and quantities first, then split them.', null, true);
  n.lines = splitIntoCalloffs(real, dates).map(l => ({ ...l, qty: String(l.qty) }));
  n.due = dates[0]; keepInputs = false; render();
  toast(`Split into ${count} deliveries from ${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}.`);
}
async function submitOrder() {
  collectForm();
  const n = S.form, msg = t => { $('of-msg').textContent = t; };
  const lines = n.lines.filter(l => l.part.trim() || l.qty || l.price);
  if (!n.customer.trim()) return msg('Enter the customer.');
  if (!lines.length) return msg('Add at least one line.');
  const bad = lines.find(l => !l.part.trim() || !(Number(l.qty) > 0) || !Number.isInteger(Number(l.qty)) || l.price === '' || Number(l.price) < 0 || !l.due);
  if (bad) return msg('Every line needs a part, a whole-number quantity, a unit price (0 is allowed) and a due date.');
  const under = lines.find(l => l.sent && Number(l.qty) < l.sent);
  if (under) return msg(`"${under.part}" has ${under.sent} despatched already, so its quantity cannot go below that.`);
  if (!n.procs.length) return msg('Tick at least one process so the shop floor knows what the order needs.');
  if (n.mode === 'new' && n.so.trim() && !/^(SO|SAGE)-\d+$/i.test(n.so.trim())) return msg('An order number must look like SO-9726 or SAGE-9701, or be left blank.');
  const payloadLines = lines.map(l => ({ ...(l.id ? { id: l.id } : {}), part: l.part.trim(), qty: Number(l.qty), unit_price: Number(l.price), due_date: l.due }));
  S.busy = true; render();
  try {
    if (n.mode === 'amend') {
      const j = job(n.jobId);
      await data.amendJob(n.jobId, { customer_po: n.po.trim(), contact_name: n.contact.trim(), delivery_address: n.address.trim(), notes: n.notes.trim(), lines: payloadLines });
      await data.setJobProcesses(n.jobId, n.procs.filter(p => !j.procs[p]), needed(j).filter(p => !n.procs.includes(p)));
      S.form = null; keepInputs = false; await reload(); S.open = n.jobId;
      toast(`${j.so} amended.`);
    } else {
      const j = await data.createJob({ so_number: n.so.trim().toUpperCase(), customer: n.customer.trim(), customer_po: n.po.trim(),
        contact_name: n.contact.trim(), contact_email: n.contactEmail || '', delivery_address: n.address.trim(), notes: n.notes.trim(),
        xero_quote_id: n.xeroQuoteId, sp_quote_id: n.spQuoteId, quote_no: n.quoteNo || '',
        due_date: lines.map(l => l.due).sort().pop(), processes: n.procs, lines: payloadLines });
      const who = n.customer.trim();
      S.form = null; keepInputs = false; await reload();
      showDoc('soa', j.id);
      toast(`${j.so_number} created for ${who}. It is in Upcoming on the job board.`);
    }
  } catch (e) { toast(e.message, null, true); }
  S.busy = false; render();
}

/* ---------- Xero ---------- */
async function loadXeroStatus() {
  try { S.xero = await data.xeroStatus(); } catch (e) { S.xeroErr = e.message; }
  render();
}
async function xeroAction(route) {
  S.xeroBusy = true; S.xeroErr = null; render();
  try {
    if (route === 'connect') { location.href = (await data.xero('connect')).url; return; }
    if (route === 'read') { S.xeroRead = await data.xero('read'); await loadXeroStatus(); }
    if (route === 'disconnect') { await data.xero('disconnect'); S.xero = null; S.xeroRead = null; toast('Xero disconnected.'); }
  } catch (e) { S.xeroErr = e.message; }
  S.xeroBusy = false; render();
}
const onBoard = q => S.jobs.find(j => j.xeroQuoteId === q.id || j.so.toUpperCase() === String(q.number).toUpperCase());
function renderXero() {
  const x = S.xero, r = S.xeroRead, busy = S.xeroBusy ? 'disabled' : '';
  const head = x
    ? `<p>Connected to <b>${esc(x.tenant_name)}</b> by ${esc(x.connected_by)} on ${fmtLong(x.connected_at)}.</p>
       <div class="actions"><button class="btn pri" type="button" data-xero="read" ${busy}>${S.xeroBusy ? 'Reading Xero…' : 'Read from Xero'}</button>
       <button class="btn" type="button" data-xero="connect" ${busy}>Reconnect</button></div>`
    : `<p>Not connected. Connecting lets the board read Clarke Lane's sales orders and invoices in Xero, and later create draft invoices for Keith. It never approves, sends or deletes anything in Xero.</p>
       <div class="actions"><button class="btn pri" type="button" data-xero="connect" ${busy}>Connect to Xero</button></div>
       <p class="note">You will be sent to Xero to sign in. Pick Clarke Lane Engineering when it asks which organisation.</p>`;
  let body = '';
  if (r) {
    const sos = r.quotes.filter(q => /^SO-?\d+$/i.test(q.number) && !['DECLINED', 'DELETED'].includes(q.status));
    const waiting = sos.filter(q => !onBoard(q) && q.status !== 'INVOICED');
    const done = sos.filter(q => onBoard(q));
    body = `<div class="panel"><h3>Sales order numbers</h3>
        <p>The highest SO number in Xero is <b>${r.highestSo ? 'SO-' + r.highestSo : 'none yet'}</b>. The next job made on the board will be <b>SO-${r.counterNext ?? '…'}</b>.</p>
        <p class="note">The board always keeps its next number past anything raised in Xero, so the two never clash. Once everyone uses the board, stop raising sales orders as quotes in Xero.</p></div>
      <div class="panel"><h3>Sales orders in Xero, not on the board yet <span class="note">${waiting.length}</span></h3>
        ${waiting.length ? `<div style="overflow-x:auto"><table class="lines"><thead><tr><th>Order</th><th style="text-align:left">Customer</th><th style="text-align:left">Reference</th><th>Status</th><th>Date</th><th>Net</th><th></th></tr></thead><tbody>
          ${waiting.map(q => `<tr><td class="mono">${esc(q.number)}</td><td style="text-align:left">${esc(q.customer)}</td><td style="text-align:left">${esc(q.reference)}</td>
            <td><span class="chip">${esc(q.status.toLowerCase())}</span></td><td>${fmt(q.date)}</td><td>${gbp(q.subTotal, 2)}</td>
            <td><button class="btn sm" type="button" data-fromxero="${esc(q.id)}">Make job</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Every sales order in Xero is on the board.</div>'}
        ${done.length ? `<p class="note">${done.length} more already on the board.</p>` : ''}</div>
      <details class="panel"><summary><b>Invoices in Xero since 1 October</b> <span class="note">${r.invoices.length}</span></summary>
        <div style="overflow-x:auto;margin-top:10px"><table class="lines"><thead><tr><th>Invoice</th><th style="text-align:left">Customer</th><th style="text-align:left">Reference</th><th>Status</th><th>Date</th><th>Net</th></tr></thead><tbody>
        ${r.invoices.map(i => `<tr><td class="mono">${esc(i.number)}</td><td style="text-align:left">${esc(i.customer)}</td><td style="text-align:left">${esc(i.reference)}</td><td>${esc(i.status.toLowerCase())}</td><td>${fmt(i.date)}</td><td>${gbp(i.subTotal, 2)}</td></tr>`).join('')}
        </tbody></table></div></details>`;
  }
  $('v-xero').innerHTML = `<div class="sec-h"><h2>Xero</h2><span class="sub">Clarke Lane's Xero, read through the board's own connection.</span></div>
    ${S.xeroErr ? `<div class="err">${esc(S.xeroErr)}</div>` : ''}
    <div class="panel"><h3>Connection</h3>${head}</div>${body}`;
}
function makeJobFromXero(id) {
  const q = S.xeroRead.quotes.find(x => x.id === id);
  const due = q.expiry && q.expiry >= todayIso() ? q.expiry : addWorkingDays(todayIso(), 10);
  openOrderForm({ from: `Xero ${q.number}`, so: q.number.toUpperCase().replace(/^SO(\d)/, 'SO-$1'), customer: q.customer, po: q.reference,
    due, xeroQuoteId: q.id,
    lines: q.lines.filter(l => l.qty > 0).map(l => ({ part: l.description, qty: String(l.qty), price: String(l.unit), due })).concat(q.lines.some(l => l.qty > 0) ? [] : [blankLine(due)]) });
}

/* ---------- shop floor ---------- */
function procButtons(j, focus) {
  return needed(j).map(p => { const s = j.procs[p];
    return `<button type="button" class="pbtn ${s.done ? 'done' : ''} ${focus === p ? 'focus' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}"><b>${s.done ? '✓ ' : ''}${esc(p)}</b><span>${s.done ? `${esc(s.by)} · ${fmtTime(s.at)}` : 'Tap when done'}</span></button>`; }).join('');
}
/** Outstanding parts, one row per part however many delivery lines it is split over. */
function floorParts(j) {
  const by = new Map();
  for (const l of j.lines) { const k = l.part; const r = by.get(k) || { left: 0, next: 0 }; r.left += left(j, l); if (l.due <= nextDue(j)) r.next += left(j, l); by.set(k, r); }
  return [...by.entries()].filter(([, r]) => r.left > 0).map(([part, r]) =>
    `<div><b>${r.left}</b> × ${esc(part)}${r.next && r.next !== r.left ? ` <span>(${r.next} for the next delivery)</span>` : ''}</div>`).join('');
}
function renderFloor() {
  const open = S.jobs.filter(onBoardStage).sort(byDue);
  const st = S.station;
  const count = p => open.filter(j => j.procs[p] && !j.procs[p].done).length;
  const btns = [['all', 'All jobs', open.length], ...PROCESSES.map(p => [p, p, count(p)])]
    .map(([k, t, c]) => `<button type="button" data-station="${esc(k)}" aria-pressed="${st === k}">${esc(t)}<span class="c">${c}</span></button>`).join('');
  const list = st === 'all' ? open : open.filter(j => j.procs[st] && !j.procs[st].done);
  const cards = list.map(j => `<article class="fcard ${allDone(j) ? 'ready' : ''}">
      <div class="h"><span class="so">${esc(j.so)}</span>${dueChip(nextDue(j))}</div>
      <div class="cust">${esc(j.customer)}</div>
      <div class="parts">${floorParts(j)}
        ${deliveryLabel(j) ? `<div>${deliveryLabel(j)}, due ${fmt(nextDue(j))}</div>` : ''}
        ${j.po ? `<div>PO ${esc(j.po)}</div>` : ''}${j.status === 'held' ? '<div class="bad"><b>On hold</b></div>' : ''}</div>
      ${allDone(j) ? '<div class="readybar">All processes done. Ready to despatch.</div>' : ''}
      <div class="pbtns">${procButtons(j, st)}</div>
      <button type="button" class="btn link" data-open="${j.id}" style="align-self:flex-start">Job details</button></article>`).join('');
  $('v-floor').innerHTML = `
    <div class="sec-h"><h2>Shop floor</h2><span class="sub">Pick your station to see only the jobs waiting for it, soonest first. This screen remembers the station.</span></div>
    <div class="stations" role="group" aria-label="Station">${btns}</div>
    <div class="floor">${cards || `<div class="empty">${st === 'all' ? 'No open jobs.' : `Nothing waiting for ${esc(st)}.`}</div>`}</div>`;
}

/* ---------- quotes ---------- */
function renderQuotes() {
  const qs = quotes();
  let body;
  if (S.quotesErr) body = `<div class="err"><b>Could not read the quotes from SharePoint.</b> ${esc(S.quotesErr)} <button class="btn sm" type="button" data-reloadquotes>Try again</button></div>`;
  else if (!qs) body = '<div class="empty">Reading the quote calculator…</div>';
  else {
    const waiting = qs.filter(q => q.state === 'waiting');
    const made = qs.filter(q => q.state === 'job').sort((a, b) => b.jobId - a.jobId).slice(0, 12);
    const gone = qs.filter(q => q.state === 'dismissed');
    body = `<div class="group-h">Ordered, ready to become a job <span class="note">${waiting.length}</span></div>
      <div class="qgrid">${waiting.map(quoteCard).join('') || '<div class="empty">Nothing waiting. When Levi presses Mark as Ordered on a quote, it appears here.</div>'}</div>
      ${made.length ? `<div class="group-h">Already jobs <span class="note">latest ${made.length}</span></div><div class="qgrid">${made.map(quoteCard).join('')}</div>` : ''}
      ${gone.length ? `<details class="gone"><summary class="group-h">Marked not a job <span class="note">${gone.length}</span></summary><div class="qgrid">${gone.map(quoteCard).join('')}</div></details>` : ''}`;
  }
  $('v-quotes').innerHTML = `<div class="sec-h"><h2>Quotes</h2><span class="sub">Levi keeps quoting in the quote calculator. When he presses Mark as Ordered, the quote appears here with its lines, ready to become a job.</span>
    <span class="right"><button class="btn sm" type="button" data-reloadquotes>Refresh</button></span></div>${body}`;
}
function quoteCard(q) {
  const head = `<div class="h"><span class="mono">${esc(q.quoteNo)}${q.quoteDate ? ' · ' + fmt(q.quoteDate) : ''}</span>${q.sellTotal != null ? `<span class="amt num">${gbp(q.sellTotal + (q.carriage || 0), 2)}</span>` : ''}</div>
    <div class="cust">${esc(q.customer)}</div>${q.contactName ? `<div class="note">${esc(q.contactName)}</div>` : ''}`;
  if (q.state === 'job') return `<article class="qcard">${head}<div class="actions"><span class="chip ok">Now ${esc(q.so)}</span><button class="btn link" type="button" data-open="${q.jobId}">Open job</button></div></article>`;
  if (q.state === 'dismissed') return `<article class="qcard">${head}<div class="actions"><span class="chip">Not a job</span><button class="btn sm" type="button" data-restore="${q.spId}">Put back</button></div></article>`;
  if (S.conv?.spId !== q.spId) return `<article class="qcard">${head}<div class="actions"><button class="btn pri" type="button" data-start="${q.spId}">Turn into a job</button>
    <button class="btn" type="button" data-dismiss="${q.spId}" title="Stop offering this quote here. The quote itself is not changed.">Not a job</button></div></article>`;
  return `<article class="qcard">${head}<div class="note">Reading the quote lines…</div></article>`;
}

/* ---------- despatch ---------- */
function waitingForXero(pend) {
  if (!pend.length) return `<div class="panel"><h3>Waiting for Xero</h3><div class="empty">Nothing waiting. Every despatch is in Xero.</div></div>`;
  const connected = !!S.xero;
  if (connected && !S.xc && !S.xcErr) loadXeroContacts();
  const rows = pend.map(([x, d]) => {
    const m = contactFor(x.customer);
    const picked = S.sendPick[d.id] ?? !!m;
    const contactCell = !connected ? '' : !S.xc ? '<span class="note">…</span>'
      : m ? `${esc(m.name)} <span class="note">${m.how === 'auto' ? '(matched)' : ''}</span> <button class="btn link sm" type="button" data-xcchange="${esc(normName(x.customer))}">change</button>`
      : `<select class="f" data-xcpick="${esc(normName(x.customer))}" aria-label="Xero contact for ${esc(x.customer)}"><option value="">Choose the Xero contact…</option>
          ${S.xc.contacts.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`;
    return `<tr${S.sendErr[d.id] ? ' class="rowerr"' : ''}>${connected ? `<td><input type="checkbox" data-sendpick="${d.id}" ${picked && m ? 'checked' : ''} ${m ? '' : 'disabled'} aria-label="Send ${esc(d.dn)}"></td>` : ''}
      <td><button class="btn link mono" type="button" data-dn="${d.id}" data-job="${x.id}">${esc(d.dn)}</button></td>
      <td style="text-align:left">${esc(x.customer)}${S.sendErr[d.id] ? `<div class="note bad">${esc(S.sendErr[d.id])}</div>` : ''}</td>
      ${connected ? `<td style="text-align:left">${contactCell}</td>` : ''}
      <td style="text-align:left" class="mono">${esc([x.so, x.po, d.dn].filter(Boolean).join(' / '))}</td><td>${fmt(d.date)}</td><td>${gbp(despatchValue(x, d), 2)}</td>
      <td><form class="inv" data-inv="${d.id}"><input type="text" id="inv-${d.id}" placeholder="INV-" aria-label="Xero invoice number for ${esc(d.dn)} if raised by hand"><button class="btn sm" type="submit">Save</button></form></td></tr>`;
  }).join('');
  const ready = pend.filter(([x, d]) => contactFor(x.customer) && (S.sendPick[d.id] ?? true));
  const total = ready.reduce((a, [x, d]) => a + (despatchValue(x, d) || 0), 0);
  const how = !connected ? '<p class="note">Connect Xero on the Xero tab to send these as draft invoices with one click. Until then, raise each in Xero by hand and type its invoice number here.</p>'
    : S.xcErr ? `<div class="err">${esc(S.xcErr)} <button class="btn sm" type="button" data-xcreload>Try again</button></div>`
    : !S.xc ? '<p class="note">Reading the contacts from Xero…</p>'
    : `<p class="note">Each one becomes a <b>draft</b> invoice in Xero for exactly what went out on that despatch note, referenced sales order / PO / despatch note, on account <b>${esc(S.xc.defaults.accountCode)}</b>${S.xc.defaults.taxType ? ` with VAT code <b>${esc(S.xc.defaults.taxType)}</b>` : ''} (as on ${esc(S.xc.defaults.from)}). Keith checks and approves them in Xero. The board never approves or sends an invoice.</p>`;
  return `<div class="panel"><h3>Waiting for Xero <span class="note">${pend.length}</span></h3>${how}
    <div style="overflow-x:auto"><table class="lines"><thead><tr>${connected ? '<th></th>' : ''}<th>Despatch note</th><th style="text-align:left">Customer</th>${connected ? '<th style="text-align:left">Xero contact</th>' : ''}<th style="text-align:left">Reference</th><th>Sent</th><th>Net</th><th>Invoiced by hand?</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${connected && S.xc ? `<div class="actions"><button class="btn pri" type="button" data-sendxero ${ready.length && !S.busy ? '' : 'disabled'}>${S.busy ? 'Sending…' : `Create ${ready.length} draft invoice${ready.length === 1 ? '' : 's'} in Xero`}</button>${ready.length ? `<span class="note">${gbp(total, 2)} net</span>` : ''}</div>` : ''}</div>`;
}
/** The Xero contact a customer's invoices go to, or null while Mandy has to choose. */
function contactFor(customer) {
  if (!S.xc || S.forcePick.has(normName(customer))) return null;
  return matchContact(customer, S.xc.contacts, S.xcMap);
}
async function loadXeroContacts() {
  S.xcErr = null;
  try { [S.xc, S.xcMap] = await Promise.all([data.xero('contacts'), data.loadContactMap()]); }
  catch (e) { S.xcErr = e.message; }
  render();
}
async function pickContact(key, id) {
  const c = S.xc.contacts.find(x => x.id === id); if (!c) return;
  S.xcMap.set(key, c); S.forcePick.delete(key); render();
  try { await data.saveContact(key, c); toast(`Invoices for this customer will go to ${c.name} in Xero.`); }
  catch (e) { S.xcMap.delete(key); render(); toast(e.message, null, true); }
}
async function sendToXero() {
  const pend = []; S.jobs.forEach(x => x.despatches.forEach(d => { if (!d.xero) pend.push([x, d]); }));
  const items = pend.map(([x, d]) => ({ x, d, m: contactFor(x.customer) }))
    .filter(({ d, m }) => m && (S.sendPick[d.id] ?? true))
    .map(({ d, m }) => ({ despatchId: d.id, contactId: m.id }));
  if (!items.length) return;
  S.busy = true; S.sendErr = {}; render();
  try {
    const r = await data.xero('send', { items });
    const ok = r.results.filter(x => x.ok), bad = r.results.filter(x => !x.ok);
    bad.forEach(x => { S.sendErr[x.despatchId] = x.error; });
    const odd = ok.filter(x => x.mismatch);
    toast(`${ok.length} draft invoice${ok.length === 1 ? '' : 's'} created in Xero${ok.length ? ` (${ok.map(x => x.invoiceNo).filter(Boolean).join(', ')})` : ''}.` +
      (bad.length ? ` ${bad.length} not sent: see the list.` : '') + (odd.length ? ' Check the totals of ' + odd.map(x => x.invoiceNo).join(', ') + ' in Xero.' : ''), null, !!bad.length);
  } catch (e) { toast(e.message, null, true); }
  S.busy = false; await reload();
}

function deliveryRow(j) {
  const today = todayIso();
  const dates = deliveryDates(j);
  if (dates.length < 2) return '';
  return `<div class="callrow">${dates.map((c, i) => { const ls = j.lines.filter(l => l.due === c);
    const done = ls.every(l => left(j, l) === 0), part = !done && ls.some(l => sent(j, l) > 0), late = !done && c < today;
    return `<div class="call ${done ? 'done' : late ? 'late' : ''}"><i>${i + 1}</i><b>${fmt(c)}</b>${done ? 'sent' : part ? 'part sent' : late ? 'late' : 'due'}</div>`; }).join('')}</div>`;
}
function renderDespatch() {
  const open = S.jobs.filter(j => onBoardStage(j) && j.status === 'open').sort(byDue);
  const held = S.jobs.filter(j => onBoardStage(j) && j.status === 'held');
  if (S.desp && !open.some(j => j.id === S.desp)) S.desp = null;
  const j = S.desp ? job(S.desp) : null;
  const money = office();
  let form = '';
  if (j) {
    const missing = needed(j).filter(p => !j.procs[p].done);
    const del = deliveryLabel(j);
    form = `${missing.length ? `<div class="warn">Not ticked yet: ${esc(missing.join(', '))}. Check the parts are finished before they go.</div>` : ''}
      ${deliveryRow(j)}
      <div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Despatched</th><th>Outstanding</th><th>This despatch</th></tr></thead><tbody>
      ${j.lines.filter(l => left(j, l) > 0 || sent(j, l) > 0).map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td>${esc(l.part)}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td>${left(j, l)}</td><td>${left(j, l) ? `<input type="number" min="0" max="${left(j, l)}" value="${defaultDespatchQty(j, l)}" id="dq-${l.id}" data-dq="${l.id}" aria-label="Quantity of ${esc(l.part)} due ${fmt(l.due)} this despatch">` : '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="actions"><button class="btn pri" type="button" id="mkdn" ${S.busy ? 'disabled' : ''}>Create despatch note${del ? ` (${del.toLowerCase()})` : ''}</button></div>
      <p class="note" id="dn-msg">The quantities default to everything due by ${fmt(nextDue(j))}. Anything not sent stays outstanding on the order, as in Sage.</p>`;
  }
  const all = []; S.jobs.forEach(x => x.despatches.forEach(d => all.push([x, d])));
  all.sort((a, b) => (a[1].id < b[1].id ? 1 : -1));
  const pend = all.filter(([, d]) => !d.xero).reverse();
  $('v-despatch').innerHTML = `
    <div class="sec-h"><h2>Despatch</h2><span class="sub">Send all of a job or part of it. Each despatch gets its own note, and only what went out is invoiced.</span></div>
    <div class="panel"><h3>Despatch goods</h3>
      <label class="fl">Job
      <select class="f" id="dsel"><option value="">Choose a job…</option>${open.map(x => `<option value="${x.id}" ${x.id === S.desp ? 'selected' : ''}>${esc(x.so)} · ${esc(x.customer)}${x.po ? ' · PO ' + esc(x.po) : ''}${allDone(x) ? ' · ready' : ''}</option>`).join('')}</select></label>
      ${held.length ? `<p class="note">On hold, so not listed: ${held.map(h => esc(h.so)).join(', ')}.</p>` : ''}
      ${form}</div>
    ${money ? waitingForXero(pend) : ''}
    <div class="panel"><h3>Despatch notes</h3>
      ${all.length ? `<div style="overflow-x:auto"><table class="lines"><thead><tr><th>Note</th><th style="text-align:left">Customer</th><th style="text-align:left">Sales order</th><th>Date</th>${money ? '<th>Xero</th>' : ''}<th></th></tr></thead><tbody>
      ${all.slice(0, 50).map(([x, d]) => `<tr><td class="mono">${esc(d.dn)}</td><td style="text-align:left">${esc(x.customer)}</td><td style="text-align:left" class="mono">${esc(x.so)}</td><td>${fmt(d.date)}</td>${money ? `<td>${d.xero ? `<span class="chip ok">${esc(d.xero.no)}</span>` : '<span class="chip soon">not yet</span>'}</td>` : ''}<td><button class="btn sm" type="button" data-dn="${d.id}" data-job="${x.id}">View</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No despatch notes yet.</div>'}</div>`;
}

/* ---------- job drawer ---------- */
function renderDrawer() {
  const j = S.open ? job(S.open) : null;
  $('drawer').hidden = $('scrim').hidden = !j;
  if (!j) return;
  const money = office(), st = stage(j), net = value(j);
  const ask = S.ask && S.ask.id === j.id ? S.ask.what : null;
  const actions = money && j.status !== 'cancelled' ? `<div class="actions">
      <button class="btn" type="button" data-amend="${j.id}">Amend order</button>
      ${j.status === 'held' ? `<button class="btn" type="button" data-status="open" data-job="${j.id}">Release from hold</button>`
        : st !== 'completed' ? `<button class="btn" type="button" data-status="held" data-job="${j.id}">Put on hold</button>` : ''}
      ${st !== 'completed' ? `<button class="btn" type="button" data-ask="cancel" data-job="${j.id}">Cancel order</button>` : ''}
      ${!j.despatches.length ? `<button class="btn link" type="button" data-ask="delete" data-job="${j.id}">Delete (made by mistake)</button>` : ''}</div>` : '';
  const confirm = ask === 'cancel'
    ? `<div class="panel warnbox"><b>Cancel ${esc(j.so)}?</b><span class="note">${j.despatches.length ? 'What has been despatched stays, with its despatch notes and invoices. The outstanding quantity is cancelled.' : 'Nothing has been despatched.'} The order stays in the Sales orders list as Cancelled and leaves the job board.</span>
       <div class="actions"><button class="btn danger" type="button" data-status="cancelled" data-job="${j.id}">Yes, cancel ${esc(j.so)}</button><button class="btn" type="button" data-noask>Keep it</button></div></div>`
    : ask === 'delete'
    ? `<div class="panel warnbox"><b>Delete ${esc(j.so)}?</b><span class="note">For an order created by mistake. It is removed completely. ${j.spQuoteId ? 'The quote goes back to the Quotes tab. ' : ''}The number ${esc(j.so)} is not used again.</span>
       <div class="actions"><button class="btn danger" type="button" data-confirmdelete="${j.id}">Yes, delete ${esc(j.so)}</button><button class="btn" type="button" data-noask>Keep it</button></div></div>` : '';
  $('drawer').innerHTML = `
    <div class="dh"><div><div class="mono note">${esc(j.so)}${j.quote ? ' · from ' + esc(j.quote) : ''}</div><h2>${esc(j.customer)}</h2>
      <div class="actions" style="margin-top:6px">${j.status === 'cancelled' ? '<span class="chip">Cancelled</span>' : `<span class="chip ${despatchStatus(j) === 'Despatched' ? 'ok' : ''}">${despatchStatus(j)}</span>`}
        ${money ? `<span class="chip ${invoiceStatus(j) === 'Invoiced' ? 'ok' : ''}">${invoiceStatus(j)}</span>` : ''}${j.status === 'held' ? '<span class="chip late">On hold</span>' : ''}${deliveryLabel(j) && st !== 'completed' ? `<span class="chip">${deliveryLabel(j)}</span>` : ''}</div></div>
      <button class="btn sm x" type="button" data-close>Close</button></div>
    <div class="facts">
      <div class="fact"><div class="k">Customer order no.</div><div class="v mono">${esc(j.po) || '—'}</div></div>
      <div class="fact"><div class="k">Order date</div><div class="v">${fmtLong(j.ordered)}</div></div>
      <div class="fact"><div class="k">${st === 'completed' ? 'Despatched' : 'Next due'}</div><div class="v">${fmtLong(st === 'completed' ? lastDespatch(j) : nextDue(j))}</div></div>
      <div class="fact"><div class="k">Contact</div><div class="v">${esc(j.contactName) || '—'}</div></div>
      ${j.address ? `<div class="fact" style="grid-column:1/-1"><div class="k">Deliver to</div><div class="v" style="white-space:pre-line;font-weight:500">${esc(j.address)}</div></div>` : ''}
    </div>
    ${j.notes ? `<div class="panel"><div class="note">Notes</div>${esc(j.notes)}</div>` : ''}
    <div class="panel"><h3>Lines</h3><div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Desp.</th><th>Outst.</th>${money ? '<th>Unit</th><th>Net</th>' : ''}</tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td><b>${left(j, l)}</b></td>${money ? `<td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${money ? `<p class="note" style="text-align:right">Net <b>${gbp(net, 2)}</b> · VAT 20% ${gbp(round2(net * 0.2), 2)} · Total <b>${gbp(round2(net * 1.2), 2)}</b></p>` : ''}
      ${deliveryRow(j)}</div>
    <div class="panel"><h3>Processes</h3><div class="pbtns">${procButtons(j)}</div></div>
    <div class="panel"><h3>Despatched</h3>${j.despatches.length ? `<table class="lines"><thead><tr><th>Note</th><th>Date</th><th>Items</th>${money ? '<th>Net</th><th>Invoice</th>' : ''}<th></th></tr></thead><tbody>
      ${j.despatches.map(d => `<tr><td class="mono">${esc(d.dn)}</td><td>${fmt(d.date)}</td><td>${Object.values(d.lines).reduce((a, q) => a + q, 0)}</td>${money ? `<td>${gbp(despatchValue(j, d), 2)}</td><td>${d.xero ? `<span class="chip ok">${esc(d.xero.no)}</span>` : '<span class="chip soon">not yet</span>'}</td>` : ''}
        <td><button class="btn sm" type="button" data-dn="${d.id}" data-job="${j.id}">View</button></td></tr>`).join('')}</tbody></table>` : '<div class="note">Nothing despatched yet.</div>'}</div>
    <div class="actions">
      ${money ? `<button class="btn" type="button" data-soa="${j.id}">Order acknowledgement</button>` : ''}
      ${onBoardStage(j) && j.status === 'open' ? `<button class="btn pri" type="button" data-desp="${j.id}">Despatch…</button>` : ''}
    </div>${actions}${confirm}`;
}

/* ---------- documents (print / save as PDF) ---------- */
function showDoc(kind, jobId, despId) {
  const j = job(jobId); if (!j) return;
  const logo = document.querySelector('.top .logo').outerHTML;
  const head = (title, no) => `<div class="ph">${logo}<div><h1>${title}</h1><div class="dno">${no}</div></div></div>`;
  let body;
  if (kind === 'soa') {
    const net = value(j), vat = round2(net * 0.2);
    body = head('Order acknowledgement', esc(j.so)) + `
      <div class="two"><div><div class="k">Customer</div><b>${esc(j.customer)}</b>${j.contactName ? `<div>${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(j.ordered)}</span><span class="k">Your order</span><span>${esc(j.po) || '—'}</span>
        <span class="k">Our quote</span><span>${esc(j.quote) || '—'}</span>
        <span class="k">Delivery</span><span>${deliveryDates(j).length > 1 ? `${deliveryDates(j).length} deliveries, ${fmtLong(deliveryDates(j)[0])} to ${fmtLong(deliveryDates(j).pop())}` : fmtLong(nextDue(j))}</span></div></div>
      ${j.address ? `<div><div class="k">Deliver to</div><div style="white-space:pre-line">${esc(j.address)}</div></div>` : ''}
      <p>Thank you for your order. We confirm the following.</p>
      <table><thead><tr><th>Description</th><th>Due</th><th>Qty</th><th>Unit price</th><th>Net</th></tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${fmtLong(l.due)}</td><td>${l.qty}</td><td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td></tr>`).join('')}</tbody></table>
      <div class="tot"><span>Net</span><span>${gbp(net, 2)}</span><span>VAT 20%</span><span>${gbp(vat, 2)}</span><span class="g">Total</span><span class="g">${gbp(net + vat, 2)}</span></div>
      <div class="foot">Clarke Lane Engineering Ltd. Please quote ${esc(j.so)} on any correspondence about this order.</div>`;
  } else {
    const di = j.despatches.findIndex(d => d.id === despId), d = j.despatches[di];
    const before = l => j.despatches.slice(0, di).reduce((a, x) => a + (x.lines[l.id] || 0), 0);
    body = head('Despatch note', esc(d.dn)) + `
      <div class="two"><div><div class="k">Deliver to</div><b>${esc(j.customer)}</b>${j.address ? `<div style="white-space:pre-line">${esc(j.address)}</div>` : ''}${j.contactName ? `<div>FAO ${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(d.date)}</span><span class="k">Your order</span><span>${esc(j.po) || '—'}</span>
        <span class="k">Our order</span><span>${esc(j.so)}</span></div></div>
      <table><thead><tr><th>Description</th><th>Ordered</th><th>Previously sent</th><th>This delivery</th><th>Outstanding</th></tr></thead><tbody>
      ${j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => `<tr><td>${esc(l.part)}${deliveryDates(j).length > 1 ? ` <span style="color:var(--paper-mute)">(due ${fmt(l.due)})</span>` : ''}</td><td>${l.qty}</td><td>${before(l)}</td><td><b>${d.lines[l.id]}</b></td><td>${l.qty - before(l) - d.lines[l.id]}</td></tr>`).join('')}</tbody></table>
      ${stillToCome(j, di)}
      <div class="sign"><div>Received by (print)</div><div>Signature</div><div>Date</div></div>
      <div class="foot">Please check the goods on delivery and report any shortage or damage within 48 hours, quoting ${esc(d.dn)}.</div>`;
  }
  $('doc').innerHTML = `<div class="docbar"><span>Print it, or choose "Save as PDF" in the print window to email it.</span><button class="btn pri" type="button" data-print>Print</button><button class="btn" type="button" data-closedoc>Close</button></div><div class="paper">${body}</div>`;
  $('doc').hidden = false;
  document.body.classList.add('doc-open');
}
/** On a despatch note: what is still to come on the order after this delivery, per part. */
function stillToCome(j, di) {
  const upto = j.despatches.slice(0, di + 1);
  const by = new Map();
  for (const l of j.lines) {
    const out = l.qty - upto.reduce((a, x) => a + (x.lines[l.id] || 0), 0);
    if (out > 0) { const r = by.get(l.part) || { qty: 0, next: l.due }; r.qty += out; if (l.due < r.next) r.next = l.due; by.set(l.part, r); }
  }
  if (!by.size) return '<p>This completes the order.</p>';
  return `<div><div class="k">Still to come on this order</div>${[...by.entries()].map(([p, r]) => `${r.qty} × ${esc(p)} (next due ${fmtLong(r.next)})`).join('<br>')}</div>`;
}
function closeDoc() { $('doc').hidden = true; document.body.classList.remove('doc-open'); }

/* ---------- render + events ---------- */
let keepInputs = true;
function snapshotInputs() {
  const m = new Map();
  if (keepInputs) document.querySelectorAll('#views input, #views select, #views textarea, #drawer input').forEach(el => {
    const k = el.id || (el.name ? el.name + '=' + el.value : '');
    if (k && el.type !== 'search') m.set(k, el.type === 'checkbox' ? el.checked : el.value);
  });
  keepInputs = true;
  return m;
}
function restoreInputs(m) {
  document.querySelectorAll('#views input, #views select, #views textarea, #drawer input').forEach(el => {
    const k = el.id || (el.name ? el.name + '=' + el.value : '');
    if (!m.has(k)) return;
    if (el.type === 'checkbox') el.checked = m.get(k); else el.value = m.get(k);
  });
}
function render() {
  if (!S.me) return;
  const kept = snapshotInputs();
  if (!office() && (S.tab === 'quotes' || S.tab === 'xero')) S.tab = 'jobs';
  renderTabs();
  $('err').hidden = !S.error;
  if (S.error) $('err').innerHTML = `<b>The board could not load.</b> ${esc(S.error)} <button class="btn sm" type="button" data-reload>Try again</button>`;
  for (const [k] of TABS) $('v-' + k).hidden = S.tab !== k;
  ({ jobs: renderJobs, floor: renderFloor, quotes: renderQuotes, despatch: renderDespatch, xero: renderXero })[S.tab]();
  renderDrawer();
  restoreInputs(kept);
}
function fromHash() { const h = location.hash.slice(1); if (TABS.some(([k]) => k === h)) S.tab = h; }
window.addEventListener('hashchange', () => { fromHash(); render(); });

document.addEventListener('click', e => {
  const t = e.target.closest('button,a,tr[data-open]'); if (!t) return;
  const d = t.dataset;
  if ('signin' in d) return auth.signIn();
  if ('signout' in d) return auth.signOut();
  if ('reload' in d) return location.reload();
  if (d.tab) { e.preventDefault(); S.tab = d.tab; history.replaceState(null, '', '#' + S.tab); render(); window.scrollTo(0, 0); return; }
  if (d.proc) { e.stopPropagation(); return toggleProc(+d.job, d.proc); }
  if (d.stage) { S.stage = d.stage; S.stageChosen = true; return render(); }
  if (d.station) { S.station = d.station; try { localStorage.setItem('clj.station', d.station); } catch { /* not kept */ } return render(); }
  if (d.open) { S.open = +d.open; S.ask = null; keepInputs = false; return render(); }
  if (d.view) { S.view = d.view; return render(); }
  if ('neworder' in d) return openOrderForm();
  if (d.amend) return openAmend(+d.amend);
  if (d.ask) { S.ask = { id: +d.job, what: d.ask }; return render(); }
  if ('noask' in d) { S.ask = null; return render(); }
  if (d.status) return setStatus(+d.job, d.status);
  if (d.confirmdelete) return deleteOrder(+d.confirmdelete);
  if ('oladd' in d) { collectForm(); S.form.lines.push(blankLine(S.form.due)); keepInputs = false; return render(); }
  if (d.oldel) { collectForm(); S.form.lines.splice(+d.oldel, 1); keepInputs = false; return render(); }
  if ('olsplit' in d) return splitLines();
  if ('olcancel' in d) { const back = S.form.jobId; S.form = null; if (back) S.open = back; return render(); }
  if ('close' in d) { S.open = null; return render(); }
  if (d.start) { keepInputs = false; return startConvert(+d.start); }
  if ('reloadquotes' in d) { S.quotesRaw = null; render(); return loadQuotes(); }
  if (d.dismiss) return dismiss(+d.dismiss);
  if (d.restore) return restore(+d.restore);
  if (d.soa) return showDoc('soa', +d.soa);
  if (d.dn) return showDoc('dn', +d.job, +d.dn);
  if (d.desp) { S.desp = +d.desp; S.open = null; S.tab = 'despatch'; history.replaceState(null, '', '#despatch'); return render(); }
  if ('print' in d) return window.print();
  if ('closedoc' in d) return closeDoc();
  if (t.id === 'mkdn') return makeDespatch();
  if (d.xero) return xeroAction(d.xero);
  if (d.fromxero) return makeJobFromXero(d.fromxero);
  if ('sendxero' in d) return sendToXero();
  if ('xcreload' in d) { S.xc = null; S.xcErr = null; return render(); }
  if (d.xcchange) { S.forcePick.add(d.xcchange); return render(); }
});
$('scrim').addEventListener('click', () => { S.open = null; render(); });
$('doc').addEventListener('click', e => { if (e.target.id === 'doc') closeDoc(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('doc').hidden) closeDoc(); else if (S.open) { S.open = null; render(); } } });
document.addEventListener('input', e => {
  if (e.target.id === 'search') { S.search = e.target.value; const pos = e.target.selectionStart; renderJobs(); const s = $('search'); s.focus(); s.setSelectionRange(pos, pos); }
  const m = /^of-(qty|price)(\d+)$/.exec(e.target.id);
  if (m && S.form) {   // keep line nets and the order total current while typing
    collectForm();
    const i = +m[2]; if ($('of-net' + i)) $('of-net' + i).textContent = gbp(lineNet(S.form.lines[i]), 2);
    $('of-tot').innerHTML = formTotals(S.form.lines);
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.xcpick !== undefined) { pickContact(e.target.dataset.xcpick, e.target.value); return; }
  if (e.target.dataset.sendpick) { S.sendPick[+e.target.dataset.sendpick] = e.target.checked; render(); return; }
  if (e.target.id === 'dsel') { S.desp = +e.target.value || null; keepInputs = false; render(); }
  if (e.target.id === 'ofilter') { S.orderFilter = e.target.value; render(); }
});
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  if ('orderform' in f.dataset) return submitOrder();
  if (f.dataset.inv) {
    const no = f.querySelector('input').value.trim(); if (!no) return;
    try { await data.markInvoiced(+f.dataset.inv, no); toast(`Recorded as ${no}.`); } catch (err) { toast(err.message, null, true); }
    reload();
  }
});

boot();
