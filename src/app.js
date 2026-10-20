/**
 * The board: Jobs, Shop floor, Quotes, Dispatch. Rendering from one state object;
 * every change goes to Supabase first and the board redraws from what comes back.
 */
import * as auth from './auth.js';
import * as realData from './data.js';
import { previewJobs } from './core/preview.js';
import { normName, matchContact, dispatchPo } from './core/xero.js';
import { agedDebt, debtFor, recentChase, chaseEmail, DEBT_DAYS } from './core/debts.js';
import { readDrawing, toAdd, processesFromHistory } from './core/drawing.js';
import { normPartNo, currentFile, drawingsToLink, findPart, ordersForPart } from './core/parts.js';
import { renderHelp } from './help.js';
import { renderHome } from './home.js';
import { icon, XERO, MICROSOFT } from './icons.js';
import { renderWon } from './won.js';
import { startWave, endWave } from './wave.js';
import { renderBoard } from './board.js';
import { renderShopFloor, clockHtml } from './floor.js';
import { renderSalesOrders } from './orders.js';
import { renderDispatch } from './dispatch.js';
import { drawMap, focusStop, fitAll, KINDS } from './map.js';
import { postcodeOf } from './core/geo.js';
import { dashboard, dispatchLists, partSuggestions, invoiceIdsToCheck, awaitingApproval, SETTLED } from './core/jobs.js';
import { PROCESSES, SHORT, sent, left, needed, doneCount, allDone, value, despatchValue, stage, nextDue,
  lastDespatch, calloffDates, defaultDespatchQty, suggestProcesses, describeLine, unitPrice, round2,
  addWorkingDays, quoteStates, repeatLines, poSuggestions, backToBackLines, deliveryDates, deliveryLabel, despatchStatus, invoiceStatus, splitIntoCalloffs,
  byRunningOrder, partsLeft, moveInOrder, nextStep, floorQueue, moveInStation } from './core/jobs.js';

const $ = id => document.getElementById(id);

/* ---------- preview: Xero's open orders shown as jobs, in this browser only. Nothing is saved. ---------- */
const PREVIEW = { on: false, jobs: [], prio: new Map() };
const NOT_SAVED = 'This is a preview, so nothing is saved. Leave the preview to work for real.';
/** The data layer, swapped for a read-only one in preview: reads are real, writes are refused,
 *  except ticks and the running order, which stay in this browser so the board can be tried. */
let data = realData;
function previewData() {
  const no = async () => { throw new Error(NOT_SAVED); };
  const blocked = Object.fromEntries(Object.keys(realData).filter(k => typeof realData[k] === 'function' && !/^(load|whoAmI|onChange|orderedQuotes|quoteLines|xeroStatus)/.test(k)).map(k => [k, no]));
  return { ...realData, ...blocked,
    loadJobs: async o => [...(await realData.loadJobs(o)), ...structuredClone(PREVIEW.jobs)]
      .map(j => (PREVIEW.prio.size ? { ...j, priority: PREVIEW.prio.get(j.id) ?? null } : j)),
    setProcess: async (id, p, done, by) => {
      const j = PREVIEW.jobs.find(x => x.id === id); if (!j) return no();
      j.procs[p] = done ? { done: true, by, at: new Date().toISOString() } : { done: false };
    },
    setRunningOrder: async ids => { PREVIEW.prio = new Map(ids.map((id, i) => [id, i + 1])); },
    xero: (route, body) => (['read', 'contacts', 'contact', 'items', 'invoices'].includes(route) ? realData.xero(route, body) : no()),
  };
}
async function enterPreview() {
  if (!S.xero) return toast('Connect to Xero first (Xero tab).', null, true);
  S.xeroBusy = true; render();
  try {
    const r = await realData.xero('read');
    PREVIEW.jobs = previewJobs(r.quotes, q => !!onBoard(q), d => addWorkingDays(d || todayIso(), 10));
    PREVIEW.on = true; data = previewData();
    try { sessionStorage.setItem('clj.preview', '1'); } catch { /* this visit only */ }
    S.xeroBusy = false; S.tab = 'home'; history.replaceState(null, '', '#home');
    await reload(); window.scrollTo(0, 0);
    toast(`Preview: ${PREVIEW.jobs.length} open sales orders from Xero shown as jobs. Nothing is saved.`);
  } catch (e) { S.xeroBusy = false; toast(e.message, null, true); render(); }
}
function leavePreview() { try { sessionStorage.removeItem('clj.preview'); } catch { /* fine */ } location.replace(location.pathname + '#home'); location.reload(); }
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

const S = { orderView: 'outstanding', ask: null, forcePick: new Set(), xc: null, xcErr: null, xcMap: new Map(), sendPick: {}, sendErr: {}, xero: null, xeroRead: null, xeroErr: null, xeroBusy: false, newJob: null, me: null, jobs: [], quotesRaw: null, dismissed: [], quotesErr: null, cancelAsk: null, stageChosen: false, book: { people: [], sites: [] }, cust: null, bookEdit: null, mapMiles: 10, mapShow: { late: true, out: true, ready: true, soon: true, later: false }, tab: 'home', stage: 'open', search: '',
  station: null, open: null, conv: null, desp: null, dispView: 'ready', dispChosen: false, dsearch: '', error: null, busy: false };
const office = () => ['md', 'office'].includes(S.me?.role);
/** Levi (MD): the business figures (target, order book and other totals). Mandy (office) keeps prices on orders. */
const md = () => S.me?.role === 'md';
const job = id => S.jobs.find(j => j.id === id);
/** Ordered quotes with where each stands (waiting / job / dismissed), or null until read. */
const quotes = () => S.quotesRaw ? quoteStates(S.quotesRaw, S.jobs, S.dismissed) : null;

/* ---------- start ---------- */
async function boot() {
  let st;
  try { st = await auth.start(); }
  catch (e) { return gate(`<p>${esc(e.message)}</p><button class="btn pri" type="button" data-signin>Try signing in again</button>`); }
  if (!st.account || !st.ready) {
    return gate(`<button class="btn ms" type="button" data-signin>${MICROSOFT}Sign in with Microsoft</button>`);
  }
  try { S.me = await data.whoAmI(); }
  catch (e) { return gate(`<p>${esc(e.message)}</p><button class="btn" type="button" data-reload>Try again</button>`); }
  if (!S.me.role) {
    return gate(`<p><b>${esc(st.account.username)}</b> is signed in but is not on the job board's staff list.</p>
      <p class="note">Ask Gecko IT to add this address. Until then the board shows nothing.</p>
      <button class="btn" type="button" data-signout>Sign out</button>`);
  }
  $('gate').hidden = true; $('app').hidden = false; endWave();
  $('who').innerHTML = `${esc(S.me.name)} <button class="btn sm ghost" type="button" data-signout>${icon('signout')}Sign out</button>`;
  try { if (localStorage.getItem('clj.homeview') === 'out') S.homeView = 'out'; } catch { /* none kept */ }
  try { const v = localStorage.getItem('clj.orderview'); if (['dispatched', 'held', 'cancelled'].includes(v)) S.orderView = v; } catch { /* none kept */ }
  try { const v = localStorage.getItem('clj.wonview'); if (v === 'made' || v === 'gone') S.wonView = v; } catch { /* none kept */ }
  try { S.kiosk = localStorage.getItem('clj.kiosk') === '1'; } catch { /* none kept */ }
  fromHash();
  if (!office() && !location.hash) S.tab = 'floor';   // the factory tablet opens on its own screen
  history.replaceState({ ...navOf(), i: 0 }, '', '#' + S.tab);   // the first step: ← Back stays hidden here
  await reload();
  if (office()) {
    loadQuotes();
    loadXeroStatus().then(() => { try { sessionStorage.removeItem('clj.preview'); } catch { /* none */ } return checkSoNumbers(); });   // the preview was retired at go-live (Philip, 19 Oct)
  }
  const back = new URLSearchParams(location.search).get('xero');
  if (back) {
    S.tab = 'xero'; history.replaceState({ ...navOf(), i: 0 }, '', location.pathname + '#xero');
    if (back === 'connected') { forgetXero(); toast('Xero connected.'); } else toast(back, null, true);
  }
  data.onChange(debounce(reload, 400)).catch(() => {});
  setInterval(() => { if (!document.hidden) reload(); }, 60000);   // backstop if realtime drops
}
function gate(html) { $('app').hidden = true; $('gate').hidden = false; $('gate-body').innerHTML = html; startWave($('gate')); }
function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

async function reload() {
  try {
    [S.jobs, S.dismissed, S.xeroOrders, S.book] = await Promise.all([data.loadJobs({ office: office() }),
      office() ? data.loadDismissed() : [], office() ? data.loadXeroOrders() : [], office() ? data.loadContactBook() : { people: [], sites: [] }]);
    if (md()) S.settings = await data.loadSettings().catch(() => S.settings || {});
    if (office()) [S.pfs, S.officeSet, S.pos] = await Promise.all([data.loadProformas().catch(() => S.pfs || []), data.loadOfficeSettings().catch(() => S.officeSet || {}),
      data.loadPurchaseOrders().catch(() => S.pos || [])]);
    if (office()) [S.chases, S.parts] = await Promise.all([data.loadChases().catch(() => S.chases || []), data.loadParts().catch(e => { S.partsErr = e.message; return S.parts || []; })]);
    S.error = null;
  } catch (e) { S.error = e.message; }
  render();
  loadInvoiceStatus();
  loadMonthSales();
  loadDebts();
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
  toastT = setTimeout(() => t.hidden = true, bad ? 9000 : undo ? 9000 : 5000);   // time to reach Undo
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
  else if (j.despatches.length) out.push('<span class="chip">Part dispatched</span>');
  if (allDone(j)) out.push('<span class="chip ok">Ready to dispatch</span>');
  else if (st === 'current') out.push(`<span class="chip">${doneCount(j)} of ${needed(j).length} done</span>`);
  if (S.quotesRaw && j.spQuoteId && !S.quotesRaw.some(q => q.spId === j.spQuoteId)) out.push('<span class="chip late" title="The quote is no longer marked Ordered in the quote calculator">Quote no longer Ordered</span>');
  return out.join('');
}
const onBoardStage = j => ['upcoming', 'current'].includes(stage(j));
const byDue = (a, b) => (nextDue(a) < nextDue(b) ? -1 : 1);

/* ---------- running order: the office brings jobs forward; the shop floor follows it ---------- */
const boardVisible = () => S.boardList || [];
const runningOrder = () => S.jobs.filter(j => onBoardStage(j) && j.status !== 'cancelled').sort(byRunningOrder);
async function moveJob(id, how, visible) {
  const all = runningOrder(), i = visible.findIndex(j => j.id === id);
  const target = how === 'top' ? 0 : how === 'up' ? all.indexOf(visible[i - 1]) : how === 'down' ? all.indexOf(visible[i + 1])
    : typeof how === 'number' ? all.indexOf(visible[how]) : -1;
  const ids = how === 'reset' ? [] : target < 0 ? null : moveInOrder(all, id, target);
  if (!ids) return;
  const before = new Map(S.jobs.map(j => [j.id, j.priority]));
  const prevIds = S.jobs.filter(j => j.priority != null).sort((a, b) => a.priority - b.priority).map(j => j.id);
  S.jobs.forEach(j => { const n = ids.indexOf(j.id); j.priority = n < 0 ? null : n + 1; }); render();
  const undo = async () => {
    S.jobs.forEach(j => { j.priority = before.get(j.id) ?? null; }); render();
    try { await data.setRunningOrder(prevIds); toast('Running order put back.'); } catch (e) { toast(e.message, null, true); reload(); }
  };
  try {
    await data.setRunningOrder(ids);
    if (how === 'reset') toast('Back to date order.', undo);
    else if (how === 'top' || how === 0) toast(`${job(id).so} is now first on the shop floor.`, undo);
    else if (typeof how === 'number') toast(`${job(id).so} moved to number ${ids.indexOf(id) + 1}.`, undo);
    else toast(`${job(id).so} moved ${how}.`, undo);
  } catch (e) { S.jobs.forEach(j => { j.priority = before.get(j.id) ?? null; }); render(); toast(e.message, null, true); }
}

/** Station order: move a job at one station only (the shop floor screen, office). */
async function moveAtStation(id, how) {
  const st = S.station; if (!st || st === 'all') return;
  const list = floorQueue(S.jobs, st), i = list.findIndex(j => j.id === id);
  const ids = how === 'reset' ? [] : moveInStation(list, st, id, how === 'top' ? 0 : how === 'up' ? i - 1 : i + 1);
  if (!ids) return;
  const before = new Map(S.jobs.filter(j => j.procs[st]).map(j => [j.id, j.procs[st].place]));
  const prevIds = [...before].filter(([, p]) => p != null).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const put = m => S.jobs.forEach(j => { if (j.procs[st]) j.procs[st].place = m(j); });
  put(j => { const n = ids.indexOf(j.id); return n < 0 ? null : n + 1; }); render();
  const undo = async () => { put(j => before.get(j.id) ?? null); render();
    try { await data.setStationOrder(st, prevIds); toast(`${st} order put back.`); } catch (e) { toast(e.message, null, true); reload(); } };
  try {
    await data.setStationOrder(st, ids);
    toast(how === 'reset' ? `${st} follows the running order again.` : `${job(id).so} moved ${how === 'top' ? 'to the top' : how} at ${st}. Other stations are unchanged.`, undo);
  } catch (e) { put(j => before.get(j.id) ?? null); render(); toast(e.message, null, true); }
}

/** Drag a job by its ⠿ grip to a new place in the list (mouse or touch). */
let drag = null;
document.addEventListener('pointerdown', e => {
  const g = e.target.closest('[data-grip]'); if (!g || !office()) return;
  const tr = g.closest('tr'), body = tr?.parentElement; if (!body) return;
  e.preventDefault(); g.setPointerCapture?.(e.pointerId);
  drag = { id: +g.dataset.grip, tr, rows: [...body.children], to: null };
  tr.classList.add('dragging'); document.body.classList.add('is-dragging');
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const i = drag.rows.findIndex(r => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
  const to = i < 0 ? drag.rows.length : i;
  drag.rows.forEach((r, n) => { r.classList.toggle('drop-before', n === to); r.classList.toggle('drop-after', to === drag.rows.length && n === drag.rows.length - 1); });
  drag.to = to;
});
const endDrag = () => {
  if (!drag) return;
  const { id, rows, to, tr } = drag; drag = null;
  rows.forEach(r => r.classList.remove('drop-before', 'drop-after')); tr.classList.remove('dragging'); document.body.classList.remove('is-dragging');
  if (to == null) return;
  const from = rows.indexOf(tr), dest = to > from ? to - 1 : to;
  if (dest !== from) moveJob(id, dest, boardVisible());
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

/** Due date changed from the Jobs list. */
async function setDue(id, from, to) {
  const j = job(id); if (!j || !to || to === from) return;
  try {
    const n = await data.setJobDue(id, from || null, to);
    toast(`${j.so} now due ${fmtLong(to)}${n > 1 ? ` (${n} lines)` : ''}.`, from ? async () => {
      try { await data.setJobDue(id, to, from); toast(`${j.so} back to ${fmtLong(from)}.`); } catch (e) { toast(e.message, null, true); } reload();
    } : null);
  } catch (e) { toast(e.message, null, true); }
  reload();
}

/* ---------- actions ---------- */
async function toggleProc(id, p) {
  const j = job(id); const prev = j.procs[p]; if (!prev) return;
  const done = !prev.done;
  j.procs[p] = done ? { done: true, by: S.me.name, at: new Date().toISOString() } : { done: false };
  render();
  try {
    await data.setProcess(id, p, done, S.me.name);
    toast(done ? `${p} done on ${j.so}` + (allDone(j) ? ' · ready to dispatch' : ` · next: ${nextStep(j)}`) : `${p} on ${j.so} set back to not done`,
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
    toast(`${d.dn_number} created.` + (done ? ` ${j.so} is fully dispatched.` : ' The rest stays outstanding on the order.'), async () => {
      closeDoc();
      try { await data.cancelDespatch(d.id); toast(`${d.dn_number} cancelled. Its quantities are outstanding again on ${j.so}.`); } catch (e) { toast(e.message, null, true); }
      reload();
    });
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
async function cancelDispatchNote(id) {
  const x = S.jobs.find(j => j.despatches.some(d => d.id === id)), d = x?.despatches.find(y => y.id === id);
  S.cancelDn = null;
  try { await data.cancelDespatch(id); toast(`${d?.dn || 'Dispatch note'} cancelled. Its quantities are outstanding again on ${x?.so || 'the order'}.`); }
  catch (e) { toast(e.message, null, true); }
  reload();
}
async function markDelivery(id, what, receivedBy = '') {
  try {
    await data.markDespatch(id, what, receivedBy);
    toast(what === 'delivered' ? 'Marked delivered. It is now waiting for Xero.' : 'Set back to out for delivery.',
      what === 'delivered' ? () => markDelivery(id, 'undelivered') : null);
  }
  catch (e) { toast(e.message, null, true); }
  reload();
}
async function setStatus(id, status, undoing = false) {
  const j = job(id), was = j.status;
  try {
    await data.setJobStatus(id, status); S.ask = null;
    toast({ held: `${j.so} is on hold. It cannot be dispatched until it is released.`, open: `${j.so} ${was === 'cancelled' ? 'is open again' : 'released'}.`, cancelled: `${j.so} cancelled. It stays in the Sales orders list.` }[status],
      undoing || was === status ? null : () => setStatus(id, was, true));
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
const TABS = [['home', 'Home'], ['quotes', 'Won quotes'], ['orders', 'Sales orders'], ['jobs', 'Jobs'], ['floor', 'Shop floor'], ['dispatch', 'Dispatch'], ['map', 'Map'], ['customers', 'Customers'], ['parts', 'Parts'], ['xero', 'Xero'], ['help', 'Help']];   // left to right, the order work flows
/** Open jobs with every process ticked and something still to send, in the running order. */
const readyToDispatch = () => S.jobs.filter(j => onBoardStage(j) && j.status === 'open' && allDone(j)).sort(byRunningOrder);
function renderTabs() {
  const ready = (quotes() || []).filter(q => q.state === 'waiting').length;
  const toXero = S.jobs.reduce((a, j) => a + j.despatches.filter(d => !d.xero && d.deliveredOn).length, 0);
  // Map lives under Dispatch and Customers under Sales orders (Philip: fewer tabs); their parent tab stays lit.
  const lit = { map: 'dispatch', customers: 'orders', parts: 'orders' }[S.tab] || S.tab;
  $('tabs').hidden = !office();   // the shop floor login sees only its own screen, so no tabs
  $('tabs').innerHTML = !office() ? '' : TABS.filter(([k]) => !['map', 'customers', 'parts'].includes(k)).map(([k, t]) => {
    const b = k === 'quotes' ? ready + xeroWaiting().length : k === 'dispatch' && office() ? toXero : k === 'xero' ? xeroWaiting().length : 0;
    const go = k === 'dispatch' ? readyToDispatch().length : 0;
    return `<a href="#${k}" data-tab="${k}" ${lit === k ? 'aria-current="page"' : ''}>${k === 'xero' ? XERO : icon({ quotes: 'won', dispatch: 'truck' }[k] || k) + t}${go ? `<span class="badge go" title="${go} ready to dispatch">${go} ready</span>` : ''}${b ? `<span class="badge" title="${k === 'dispatch' ? 'Delivered, waiting for Xero' : ''}">${b}</span>` : ''}</a>`;
  }).join('');
}

/* ---------- jobs ---------- */
function renderJobs() {
  const { html, list } = renderBoard({ jobs: S.jobs, today: todayIso(), office: office(), md: md(), monthXero: monthXero(), stageKey: S.stage, search: S.search,
    anyPlaced: S.jobs.some(j => j.priority != null && onBoardStage(j)), breakeven: Number(S.settings?.monthly_breakeven) || null, target: Number(S.settings?.monthly_target) || null, editTarget: S.editTarget, byValue: S.jobSort === 'value' },
    { esc, fmt, fmtTime, gbp, dueChip, statusChips, match: jobMatch, TICK });
  S.boardList = list;
  $('v-jobs').innerHTML = html;
}
/** Sales orders: the office's own tab, as Sage's Sales Order Processing. New and Amend open here. */
function renderOrders() {
  $('v-orders').innerHTML = renderSalesOrders({ jobs: S.jobs, md: md(), today: todayIso(), view: S.orderView, search: S.osearch, form: S.form ? orderForm() : '' },
    { esc, fmt, gbp, dueChip, match: orderMatch });
}
/* ---------- the sales order form (Sage: New / Amend), for quotes, Xero orders, phone orders and Sage carry-over ---------- */
const blankLine = due => ({ part: '', qty: '', price: '', due: due || '' });
function openOrderForm(prefill = {}, amendId = null) {
  const due = prefill.due || addWorkingDays(todayIso(), 10);
  S.form = { mode: amendId ? 'amend' : 'new', jobId: amendId, so: '', customer: '', po: '', contact: '', contactEmail: '',
    address: '', notes: '', due, lines: [blankLine(due)], procs: [], xeroQuoteId: null, spQuoteId: null, quoteNo: '', from: '', ...prefill };
  S.open = null; S.tab = 'orders'; keepInputs = false; render(); window.scrollTo(0, 0);
  if (S.xero && !S.xc && !S.xcErr) loadXeroContacts();
  if (S.xero && !S.xitems && !S.xitemsErr) loadXeroItems();
}
/** Xero's Products and services, read once per visit for the Part box. Not fatal: the board's own parts still show. */
async function loadXeroItems() {
  S.xitemsErr = null;
  try { S.xitems = (await data.xero('items')).items || []; }
  catch (e) { S.xitems = []; S.xitemsErr = e.message; }
  if (S.form) { collectForm(); keepInputs = false; render(); }
}
const formParts = n => partSuggestions(S.jobs.filter(j => !j.preview), S.xitems || [], n.customer);
/** PO(s) for one dispatch note: its lines' own call-off POs, else the order's PO. */
const dnPo = (j, d) => dispatchPo(j.po, j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => l.po));
const linePos = j => [...new Set(j.lines.map(l => l.po).filter(Boolean))];
const orderMatch = (j, q) => [j.so, j.customer, j.po, j.quote, ...linePos(j)].some(s => (s || '').toLowerCase().includes(q));
const jobMatch = (j, q) => orderMatch(j, q) || j.lines.some(l => (l.part || '').toLowerCase().includes(q));
/** Sage-style "copy order": a new order from an old one. New number, new PO, dates moved forward. */
function openRepeat(id) {
  const j = job(id);
  const due = addWorkingDays(todayIso(), 10);
  openOrderForm({ from: `repeat of ${j.so}`, repeatOf: j.so, customer: j.customer, contact: j.contactName, contactEmail: j.contactEmail || '',
    address: j.address, notes: j.notes, due, procs: needed(j), lines: repeatLines(j.lines, due) });
  toast(`Copied from ${j.so}. Enter the new customer order no., and check the prices and dates are still right.`);
}
function openAmend(id) {
  const j = job(id);
  openOrderForm({ so: j.so, customer: j.customer, po: j.po, contact: j.contactName, contactEmail: j.contactEmail || '', address: j.address, notes: j.notes,
    due: nextDue(j), procs: needed(j),
    lines: j.lines.map(l => ({ id: l.id, part: l.part, qty: String(l.qty), price: String(l.price), due: l.due, po: l.po || '', sent: sent(j, l) })) }, id);
}
/** Copy what is typed into S.form, so adding, removing or splitting lines keeps everything else. */
function collectForm() {
  const n = S.form, v = id => $(id)?.value ?? '';
  Object.assign(n, { so: v('of-so'), customer: v('of-cust') || n.customer, po: v('of-po'), contact: v('of-contact'), contactEmail: v('of-email'), address: v('of-addr'),
    due: v('of-due') || n.due, notes: v('of-notes') });
  n.lines = n.lines.map((l, i) => ({ ...l, part: v('of-part' + i), qty: v('of-qty' + i), price: v('of-price' + i), due: v('of-ldue' + i), po: v('of-lpo' + i) }));
  n.procs = [...document.querySelectorAll('input[name=of-p]:checked')].map(i => i.value);
  n.splitN = v('of-sn'); n.splitEvery = v('of-se'); n.splitFrom = v('of-sf');
  if ($('of-b2b')) n.b2b = $('of-b2b').checked;
}
const lineNet = l => round2((Number(l.qty) || 0) * (Number(l.price) || 0));
function formTotals(lines) {
  const net = round2(lines.reduce((a, l) => a + lineNet(l), 0)), vat = round2(net * 0.2);
  return `Net <b>${gbp(net, 2)}</b> · VAT 20% ${gbp(vat, 2)} · Total <b>${gbp(net + vat, 2)}</b>`;
}
function orderForm() {
  const n = S.form, amend = n.mode === 'amend';
  const rows = n.lines.map((l, i) => `<tr><td><input type="text" id="of-part${i}" value="${esc(l.part)}" placeholder="Part and spec: type to pick from the list" list="of-parts" autocomplete="off" aria-label="Part, line ${i + 1}"></td>
    <td><input type="number" id="of-qty${i}" value="${esc(l.qty)}" min="${l.sent || 1}" step="1" aria-label="Quantity, line ${i + 1}"></td>
    <td><input type="number" id="of-price${i}" value="${esc(l.price)}" min="0" step="any" aria-label="Unit price, line ${i + 1}"></td>
    <td><input type="date" id="of-ldue${i}" value="${esc(l.due)}" aria-label="Due date, line ${i + 1}"></td>
    <td><input type="text" id="of-lpo${i}" value="${esc(l.po || '')}" placeholder="${esc(n.po) || 'as order'}" style="width:110px" aria-label="Call-off PO, line ${i + 1} (blank = the order's PO)"></td>
    <td class="num" id="of-net${i}">${gbp(lineNet(l), 2)}</td>
    ${amend ? `<td class="num">${l.sent || 0}</td>` : ''}
    <td>${n.lines.length > 1 && !l.sent ? `<button class="btn sm" type="button" data-oldel="${i}" aria-label="Remove line ${i + 1}">Remove</button>` : ''}</td></tr>`).join('');
  return `<form class="panel newjob" data-orderform><h3>${amend ? `Amend ${esc(n.so)}` : 'New sales order'}${n.from ? ` <span class="note">from ${esc(n.from)}</span>` : ''}</h3>
    <div class="row2"><label class="fl">Customer${amend ? '' : ' (from Xero)'}<input type="text" id="of-cust" value="${esc(n.customer)}" ${amend ? 'disabled' : 'required list="xero-customers" autocomplete="off"'}>
      ${amend ? '' : `<datalist id="xero-customers">${(S.xc?.contacts || []).map(c => `<option value="${esc(c.name)}"></option>`).join('')}</datalist><span class="note" id="of-custnote">${customerNote(n)}</span>`}</label>
      ${amend ? `<label class="fl">Order number<input type="text" value="${esc(n.so)}" disabled></label>`
        : `<label class="fl">Order number<input type="text" id="of-so" value="${esc(n.so)}" placeholder="Blank = next SO number"></label>`}</div>
    ${amend ? '' : debtWarn(n.customer)}
    ${n.repeatOf ? `<div class="warn">Copied from ${esc(n.repeatOf)}. Prices are as they were on that order: check they are still right. The delivery dates have moved forward, keeping their spacing.</div>` : ''}
    ${amend ? '' : '<p class="note">Leave the order number blank for a new order. For one that already has a number, type it: SO-9726 raised in Xero, SAGE-9701 carried over from Sage.</p>'}
    <div class="row3"><label class="fl">Customer order no. (PO)<input type="text" id="of-po" value="${esc(n.po)}"></label>
      <label class="fl">Contact<input type="text" id="of-contact" value="${esc(n.contact)}" list="of-people" autocomplete="off">
        <datalist id="of-people">${bookFor(n.customer).people.map(p => `<option value="${esc(p.name)}">${esc(ROLES[p.role])}${p.email ? ' · ' + esc(p.email) : ''}</option>`).join('')}</datalist></label>
      <label class="fl">Contact email<input type="email" id="of-email" value="${esc(n.contactEmail)}"></label></div>
    ${bookFor(n.customer).sites.length > 0 ? `<label class="fl">Saved delivery addresses<select class="f" id="of-site"><option value="">Choose one to fill in the address…</option>${bookFor(n.customer).sites.map(x => `<option value="${x.id}">${esc(x.label || x.address.split('\n')[0])}${x.main ? ' (usual)' : ''}</option>`).join('')}</select></label>` : ''}
    <div class="row2"><label class="fl">Delivery address<textarea id="of-addr" rows="3" placeholder="Leave blank to deliver to the customer's usual address">${esc(n.address)}</textarea></label>
      <label class="fl">Promised delivery (default for new lines)<input type="date" id="of-due" value="${esc(n.due)}"></label></div>
    <div style="overflow-x:auto"><table class="lines njlines"><thead><tr><th>Part</th><th>Qty</th><th>Unit price (£)</th><th>Due</th><th title="Only if the customer sent a separate PO for this delivery. Blank = the order's PO.">Call-off PO</th><th>Net</th>${amend ? '<th>Dispatched</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="actions"><button class="btn sm" type="button" data-oladd>Add a line</button>
      <details class="splitter"><summary class="btn sm">Split into call-offs…</summary>
        <div class="row3"><label class="fl">Deliveries<input type="number" id="of-sn" min="2" max="24" value="${esc(n.splitN || 4)}"></label>
          <label class="fl">How often<select class="f" id="of-se">${[['7', 'Weekly'], ['14', 'Every 2 weeks'], ['m', 'Monthly']].map(([v, t]) => `<option value="${v}" ${n.splitEvery === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fl">First delivery<input type="date" id="of-sf" value="${esc(n.splitFrom || n.due)}"></label></div>
        <p class="note">Each line becomes one line per delivery, with the quantity shared out. Adjust any quantity or date afterwards, as you would in Sage. If the customer sends a PO for each call-off, type it in that line's Call-off PO when it arrives (Amend).</p>
        <button class="btn sm" type="button" data-olsplit>Split the lines</button></details></div>
    <p class="note" id="of-tot">${formTotals(n.lines)}</p>
    ${(() => { const ps = formParts(n), c = k => ps.filter(x => x.from === k).length;
      return `<datalist id="of-parts">${ps.map(x => `<option value="${esc(x.part)}">${x.from === 'xero' ? `Xero${x.code ? ' ' + esc(x.code) : ''}` : x.from === 'customer' ? `${esc(x.so)}, ${fmt(x.date)}` : `ordered by others, ${esc(x.so)}`}${x.price != null ? ' · ' + gbp(x.price, 2) : ''}</option>`).join('')}</datalist>
      <p class="note">Parts list: ${c('customer')} from this customer's orders, ${c('board')} from other orders${S.xero ? `, ${S.xitems ? c('xero') + ' from Xero\'s Products and services' : 'reading Xero\'s Products and services…'}` : ''}. Picking one fills in its price; change it if needed.${S.xitemsErr ? ` <span class="bad">Xero's list could not be read (${esc(S.xitemsErr)}).</span>` : ''}</p>`; })()}
    <div class="fl">Processes this order needs${n.spQuoteId ? '. Ticked from the quote lines; check them and add Tap & C/Sink if needed.' : n.procNote ? '. ' + esc(n.procNote) : ''}</div>
    <div class="pchecks">${PROCESSES.map(p => `<label><input type="checkbox" name="of-p" value="${esc(p)}" ${n.procs.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div>
    <label class="fl">Notes (optional)<input type="text" id="of-notes" value="${esc(n.notes)}"></label>
    ${amend ? '' : `<label class="b2b"><input type="checkbox" id="of-b2b" ${n.b2b ? 'checked' : ''}> <span><b>Back-to-back:</b> buy these parts in for this order. Once it is saved, the purchase order opens ready, with the same parts (no processes needed if nothing is made here).</span></label>`}
    <div class="actions"><button class="btn pri" type="submit" ${S.busy ? 'disabled' : ''}>${amend ? 'Save the changes' : 'Create order'}</button><button class="btn" type="button" data-olcancel>Cancel</button>
      <button class="btn link sm" type="button" data-booksave title="Save the contact, email and delivery address above to this customer's contact book (Sales orders › Customers)">Save contact and address to the contact book</button></div>
    <p class="note" id="of-msg"></p></form>`;
}
/** Under the customer box: whether the order is on a Xero contact, as Sage insists on an account. */
function customerNote(n) {
  if (!S.xero) return 'Connect Xero on the Xero tab to pick customers from it.';
  if (S.xcErr) return 'Could not read the customers from Xero: ' + S.xcErr;
  if (!S.xc) return 'Reading the customers from Xero…';
  const m = n.customer.trim() && contactFor(n.customer);
  if (m) return `✓ Xero contact: ${m.name}`;
  return n.customer.trim() ? 'Not a Xero customer yet. Pick one from the list, or add them in Xero first (then Read the customers again on the Xero tab), so the invoice lands on the right account.'
    : `Start typing to pick from ${S.xc.contacts.length} Xero contacts.`;
}
/** Picking a Xero contact fills in the contact person and delivery address (if empty) and
 *  remembers the match, so Send to Xero never has to ask for this customer. */
async function customerPicked(name) {
  const n = S.form; if (!n) return;
  const c = S.xc?.contacts.find(x => x.name === name);
  if (!c) {
    collectForm();
    applyBook(n); keepInputs = false; render();   // also brings this customer's parts to the top of the list
    if ($('of-custnote')) $('of-custnote').textContent = customerNote({ ...n, customer: name });
    return;
  }
  collectForm();
  S.xcMap.set(normName(c.name), c); S.forcePick.delete(normName(c.name));
  data.saveContact(normName(c.name), c).catch(() => {});
  $('of-custnote').textContent = 'Fetching the contact details from Xero…';
  try {
    const d = await data.xero('contact', { id: c.id });
    if (S.form !== n) return;
    // Fill blanks, and replace what the previous Xero pick filled in; never overwrite what was typed.
    if (d.address && (!n.address.trim() || n.address === n.fromXero?.address)) n.address = d.address;
    if (d.person && (!n.contact.trim() || n.contact === n.fromXero?.person)) n.contact = d.person;
    if (d.email && (!n.contactEmail.trim() || n.contactEmail === n.fromXero?.email)) n.contactEmail = d.email;
    n.fromXero = { address: d.address, person: d.person, email: d.email };
  } catch { /* details are a convenience; the match itself is saved */ }
  applyBook(n);   // the contact book beats Xero's (accounts) contact
  keepInputs = false; render();
}
function splitLines() {
  collectForm();
  const n = S.form;
  if (n.lines.some(l => l.sent)) return toast('Some lines have dispatches already. Add new lines for the remaining deliveries instead.', null, true);
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
  if (under) return msg(`"${under.part}" has ${under.sent} dispatched already, so its quantity cannot go below that.`);
  if (!n.procs.length && !n.b2b) return msg('Tick at least one process so the shop floor knows what the order needs (or tick Back-to-back if it is bought in and sent on).');
  if (n.mode === 'new' && n.so.trim() && !/^(SO|SAGE)-\d+$/i.test(n.so.trim())) return msg('An order number must look like SO-9726 or SAGE-9701, or be left blank.');
  const payloadLines = lines.map(l => ({ ...(l.id ? { id: l.id } : {}), part: l.part.trim(), qty: Number(l.qty), unit_price: Number(l.price), due_date: l.due, customer_po: (l.po || '').trim() }));
  S.busy = true; render();
  try {
    if (n.mode === 'amend') {
      const j = job(n.jobId);
      await data.amendJob(n.jobId, { customer_po: n.po.trim(), contact_name: n.contact.trim(), delivery_address: n.address.trim(), notes: n.notes.trim(), lines: payloadLines });
      await data.setJobProcesses(n.jobId, n.procs.filter(p => !j.procs[p]), needed(j).filter(p => !n.procs.includes(p)));
      if ((n.contactEmail || '') !== (j.contactEmail || '')) await data.updateJob(n.jobId, { contact_email: n.contactEmail.trim() });
      S.form = null; keepInputs = false; await reload(); S.open = n.jobId;
      await linkPartDrawings(n.jobId);
      toast(`${j.so} amended.`);
    } else {
      const j = await data.createJob({ so_number: n.so.trim().toUpperCase(), customer: n.customer.trim(), customer_po: n.po.trim(),
        contact_name: n.contact.trim(), contact_email: n.contactEmail || '', delivery_address: n.address.trim(), notes: n.notes.trim(),
        xero_quote_id: n.xeroQuoteId, sp_quote_id: n.spQuoteId, quote_no: n.quoteNo || '',
        due_date: lines.map(l => l.due).sort().pop(), processes: n.procs, lines: payloadLines });
      const who = n.customer.trim();
      S.form = null; keepInputs = false; await reload();
      const fromParts = await linkPartDrawings(j.id, true);
      const partsNote = fromParts.length ? ` Drawing${fromParts.length === 1 ? '' : 's'} from Parts attached: ${fromParts.join(', ')}.` : '';
      if (n.b2b && S.xero) { S.busy = false; render(); backToBackPo(j.id); return toast(`${j.so_number} created for ${who}.${partsNote} Here is its back-to-back purchase order: check the supplier and costs, then send it to Xero.`); }
      showDoc('soa', j.id);
      toast(`${j.so_number} created for ${who}. It's on Sales orders, and on Jobs under Not started.${partsNote} Press Job sheet to print one for the folder.`);
    }
  } catch (e) { toast(e.message, null, true); }
  S.busy = false; render();
}

/* ---------- contact book: operations' own people and delivery addresses per customer ---------- */
const ROLES = { orders: 'Orders / buyer', deliveries: 'Goods in / deliveries', accounts: 'Accounts', other: 'Other' };
const bookFor = name => { const k = normName(name); return { people: S.book.people.filter(p => p.key === k), sites: S.book.sites.filter(x => x.key === k) }; };
function mainPerson(name, role) {
  const ps = bookFor(name).people.filter(p => p.role === role && (p.email || p.name));
  return ps.find(p => p.main) || ps[0] || null;
}
const mainSite = name => { const ss = bookFor(name).sites; return ss.find(x => x.main) || ss[0] || null; };
/** The contact book wins over Xero for who operations deal with; never overwrites what was typed. */
function applyBook(n) {
  const p = mainPerson(n.customer, 'orders'), site = mainSite(n.customer);
  const auto = (v, k) => !String(v || '').trim() || v === n.fromXero?.[k] || v === n.fromBook?.[k];
  const was = { ...n.fromBook };
  n.fromBook = {};
  if (p) {
    if (p.name && auto(n.contact, 'person')) { n.contact = p.name; n.fromBook.person = p.name; }
    if (p.email && auto(n.contactEmail, 'email')) { n.contactEmail = p.email; n.fromBook.email = p.email; }
  }
  if (site && auto(n.address, 'address')) { n.address = site.address; n.fromBook.address = site.address; }
  return Object.keys(n.fromBook).length || Object.keys(was).length;
}
async function saveFormToBook() {
  collectForm();
  const n = S.form; if (!n.customer.trim()) return toast('Enter the customer first.', null, true);
  const key = normName(n.customer), b = bookFor(n.customer);
  try {
    let did = [];
    if ((n.contact.trim() || n.contactEmail.trim()) && !b.people.some(p => p.role === 'orders' && p.name === n.contact.trim() && p.email === n.contactEmail.trim())) {
      await data.savePerson({ key, customer: n.customer.trim(), role: 'orders', name: n.contact.trim(), email: n.contactEmail.trim(), main: !b.people.some(p => p.role === 'orders') });
      did.push(`${n.contact.trim() || n.contactEmail.trim()} (orders)`);
    }
    if (n.address.trim() && !b.sites.some(x => x.address.trim() === n.address.trim())) {
      await data.saveSite({ key, customer: n.customer.trim(), address: n.address.trim(), main: !b.sites.length });
      did.push('the delivery address');
    }
    await reload();
    toast(did.length ? `Saved to ${n.customer.trim()}'s contact book: ${did.join(' and ')}.` : 'Already in the contact book.');
  } catch (e) { toast(e.message, null, true); }
}

function renderCustomers() {
  const q = (S.csearch || '').toLowerCase();
  const names = new Map();
  for (const x of [...S.book.people, ...S.book.sites]) names.set(x.key, x.customer);
  for (const j of S.jobs) if (!j.preview && !names.has(normName(j.customer))) names.set(normName(j.customer), j.customer);
  if (S.cust && !names.has(S.cust) && S.custName) names.set(S.cust, S.custName);
  const list = [...names.entries()].filter(([, n]) => !q || n.toLowerCase().includes(q)).sort((a, b) => a[1].localeCompare(b[1]));
  const sel = S.cust && names.has(S.cust) ? S.cust : null, name = sel ? names.get(sel) : '';
  const items = list.map(([k, n]) => { const b = { people: S.book.people.filter(p => p.key === k).length, sites: S.book.sites.filter(x => x.key === k).length };
    return `<button type="button" class="citem ${k === sel ? 'on' : ''}" data-cust="${esc(k)}"><b>${esc(n)}</b><span>${b.people ? `${b.people} contact${b.people === 1 ? '' : 's'}` : 'no contacts yet'}${b.sites ? ` · ${b.sites} address${b.sites === 1 ? '' : 'es'}` : ''}</span></button>`; }).join('');
  let main = '<div class="empty">Pick a customer on the left, or add one.</div>';
  if (sel) {
    const b = bookFor(name), ed = S.bookEdit, xc = contactFor(name);
    const orders = S.jobs.filter(j => !j.preview && normName(j.customer) === sel && ['upcoming', 'current'].includes(stage(j)) && j.status !== 'cancelled');
    const pform = ed?.kind === 'person' ? `<form class="bookform" data-bookform="person">
        <div class="row3"><label class="fl">Role<select class="f" id="bk-role">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${ed.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fl">Name<input type="text" id="bk-name" value="${esc(ed.name || '')}"></label><label class="fl">Email<input type="email" id="bk-email" value="${esc(ed.email || '')}"></label></div>
        <div class="row3"><label class="fl">Phone<input type="text" id="bk-phone" value="${esc(ed.phone || '')}"></label><label class="fl">Notes<input type="text" id="bk-notes" value="${esc(ed.notes || '')}"></label>
          <label class="fl chk"><input type="checkbox" id="bk-main" ${ed.main ? 'checked' : ''}> Main contact for this role</label></div>
        <div class="actions"><button class="btn pri sm" type="submit">${ed.id ? 'Save' : 'Add'}</button><button class="btn sm" type="button" data-bookcancel>Cancel</button></div></form>` : '';
    const sform = ed?.kind === 'site' ? `<form class="bookform" data-bookform="site">
        <div class="row2"><label class="fl">Label (optional)<input type="text" id="bk-label" value="${esc(ed.label || '')}" placeholder="e.g. Goods in, Unit 4"></label>
          <label class="fl">Site contact<input type="text" id="bk-contact" value="${esc(ed.contact || '')}"></label></div>
        <div class="row2"><label class="fl">Address (with postcode)<textarea id="bk-address" rows="4">${esc(ed.address || '')}</textarea></label>
          <div style="display:flex;flex-direction:column;gap:10px"><label class="fl">Phone<input type="text" id="bk-phone" value="${esc(ed.phone || '')}"></label>
          <label class="fl chk"><input type="checkbox" id="bk-main" ${ed.main ? 'checked' : ''}> Usual delivery address</label></div></div>
        <div class="actions"><button class="btn pri sm" type="submit">${ed.id ? 'Save' : 'Add'}</button><button class="btn sm" type="button" data-bookcancel>Cancel</button></div></form>` : '';
    main = `<div class="sec-h"><h3 style="font-size:28px">${esc(name)}</h3>
        <span class="note">${xc ? `Invoiced in Xero to <b>${esc(xc.name)}</b>.` : S.xc ? 'Not matched to a Xero contact yet.' : ''}</span></div>
      <div class="panel"><h3>People</h3>
        <p class="note">Who operations deal with. The <b>main Orders / buyer</b> contact fills in new orders and gets the order acknowledgement; the <b>main Goods in / deliveries</b> contact gets delivery notes. Xero's contact is only used when nobody is set here.</p>
        ${b.people.length ? `<div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Role</th><th style="text-align:left">Name</th><th style="text-align:left">Email</th><th style="text-align:left">Phone</th><th style="text-align:left">Notes</th><th></th></tr></thead><tbody>
          ${b.people.slice().sort((x, y) => Object.keys(ROLES).indexOf(x.role) - Object.keys(ROLES).indexOf(y.role) || (y.main - x.main)).map(p => `<tr><td style="text-align:left">${ROLES[p.role]}${p.main ? ' <span class="chip ok">main</span>' : ''}</td><td style="text-align:left"><b>${esc(p.name)}</b></td>
            <td style="text-align:left">${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}</td><td style="text-align:left">${esc(p.phone)}</td><td style="text-align:left">${esc(p.notes)}</td>
            <td style="white-space:nowrap"><button class="btn sm" type="button" data-editperson="${p.id}">Edit</button> <button class="btn link sm" type="button" data-delperson="${p.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No people yet.</div>'}
        ${pform || '<div class="actions"><button class="btn sm" type="button" data-addperson>Add a person</button>' + (xc ? ' <button class="btn sm" type="button" data-fromxerobook>Copy in Xero\'s contact</button>' : '') + '</div>'}</div>
      <div class="panel"><h3>Delivery addresses</h3>
        ${b.sites.length ? `<div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Address</th><th style="text-align:left">Site contact</th><th style="text-align:left">Phone</th><th></th></tr></thead><tbody>
          ${b.sites.map(x => `<tr><td style="text-align:left">${x.label ? `<b>${esc(x.label)}</b><br>` : ''}<span style="white-space:pre-line">${esc(x.address)}</span>${x.main ? ' <span class="chip ok">usual</span>' : ''}${postcodeOf(x.address) ? '' : ' <span class="chip late">no postcode</span>'}</td>
            <td style="text-align:left">${esc(x.contact)}</td><td style="text-align:left">${esc(x.phone)}</td>
            <td style="white-space:nowrap"><button class="btn sm" type="button" data-editsite="${x.id}">Edit</button> <button class="btn link sm" type="button" data-delsite="${x.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No delivery addresses yet.</div>'}
        ${sform || '<div class="actions"><button class="btn sm" type="button" data-addsite>Add a delivery address</button></div>'}</div>
      ${orders.length ? `<div class="panel"><h3>Open orders <span class="note">${orders.length}</span></h3><div class="acts" style="display:flex;gap:6px;flex-wrap:wrap">${orders.map(j => `<button class="btn sm" type="button" data-open="${j.id}">${esc(j.so)} · due ${fmt(nextDue(j))}</button>`).join('')}</div></div>` : ''}`;
  }
  $('v-customers').innerHTML = `<p class="crumb"><a href="#orders" data-tab="orders">← Sales orders</a></p><div class="sec-h"><h2>Customers</h2><span class="sub">The board's own contact book: who to deal with and where to deliver. Xero is not changed.</span></div>
    <div class="cbook"><div class="clist"><input type="search" id="csearch" placeholder="Find a customer" value="${esc(S.csearch || '')}">
        <div class="citems">${items || '<div class="note">No customers yet.</div>'}</div>
        <form class="addcust" data-addcust><input type="text" id="newcust" list="xero-customers2" placeholder="Add a customer (from Xero or new)" autocomplete="off">
          <datalist id="xero-customers2">${(S.xc?.contacts || []).map(c => `<option value="${esc(c.name)}"></option>`).join('')}</datalist><button class="btn sm" type="submit">Open</button></form></div>
      <div class="cmain">${main}</div></div>`;
  if (S.xero && !S.xc && !S.xcErr) loadXeroContacts();
}
async function saveBookForm(kind) {
  const v = id => $(id)?.value ?? '', name = S.custName || [...S.book.people, ...S.book.sites].find(x => x.key === S.cust)?.customer || S.jobs.find(j => normName(j.customer) === S.cust)?.customer || '';
  const base = { id: S.bookEdit?.id, key: S.cust, customer: name, main: $('bk-main')?.checked };
  const rec = kind === 'person' ? { ...base, role: v('bk-role'), name: v('bk-name').trim(), email: v('bk-email').trim(), phone: v('bk-phone').trim(), notes: v('bk-notes').trim() }
    : { ...base, label: v('bk-label').trim(), address: v('bk-address').trim(), contact: v('bk-contact').trim(), phone: v('bk-phone').trim() };
  if (kind === 'person' && !rec.name && !rec.email) return toast('Enter a name or an email.', null, true);
  if (kind === 'site' && !rec.address) return toast('Enter the address.', null, true);
  try { await (kind === 'person' ? data.savePerson(rec) : data.saveSite(rec)); S.bookEdit = null; await reload(); toast('Saved.'); }
  catch (e) { toast(e.message, null, true); }
}
async function copyXeroToBook() {
  const name = S.custName || [...S.book.people, ...S.book.sites].find(x => x.key === S.cust)?.customer || S.jobs.find(j => normName(j.customer) === S.cust)?.customer;
  const xc = contactFor(name); if (!xc) return;
  try { const d = await data.xero('contact', { id: xc.id });
    S.bookEdit = { kind: 'person', role: 'accounts', name: d.person || '', email: d.email || '', main: !bookFor(name).people.some(p => p.role === 'accounts') };
    if (d.address && !bookFor(name).sites.length) toast('Xero\'s address can be added under Delivery addresses if goods go there.');
    render();
  } catch (e) { toast(e.message, null, true); }
}

/* ---------- map: where deliveries are going, so a second drop can join the same run ---------- */
let mapSig = '';
function jobPostcode(j) {
  const xc = S.xc && contactFor(j.customer);
  return postcodeOf(j.address) || postcodeOf(mainSite(j.customer)?.address) || postcodeOf(xc ? S.xc.contacts.find(c => c.id === xc.id)?.postcode : '');
}
function renderMapTab() {
  const el = $('v-map');
  if (!el.dataset.ready) {
    el.innerHTML = `<p class="crumb"><a href="#dispatch" data-tab="dispatch">← Dispatch</a></p><div class="sec-h"><h2>Map</h2><span class="sub">Where the open orders are going. Pick a stop to see the jobs there and what else is nearby, so a second delivery can go on the same run.</span></div>
      <div class="mapctl" id="mapctl"></div><div class="mapgrid"><div class="mapframe"><div id="mapbox"></div></div><aside class="stops" id="mapstops"><p class="note">Placing the postcodes…</p></aside></div><div id="mapnote"></div>`;
    el.dataset.ready = '1';
  }
  if (S.xero && office() && !S.xc && !S.xcErr) loadXeroContacts();
  const d = dashboard(S.jobs, todayIso());
  const kindOf = new Map();
  const put = (j, k) => { const cur = kindOf.get(j.id); if (!cur || KINDS[k].rank < KINDS[cur].rank) kindOf.set(j.id, k); };
  d.open.forEach(j => put(j, 'later')); d.soon.forEach(j => put(j, 'soon')); d.ready.forEach(j => put(j, 'ready'));
  d.out.forEach(x => put(x.job, 'out')); d.late.forEach(x => put(x.job, 'late'));
  const counts = {};
  const items = [], missing = [];
  for (const [id, k] of kindOf) {
    counts[k] = (counts[k] || 0) + 1;
    if (!S.mapShow[k]) continue;
    const j = job(id), pc = jobPostcode(j);
    const it = { postcode: pc, kind: k, short: esc(j.so), due: nextDue(j),
      html: `<button class="btn link mono" type="button" data-open="${j.id}">${esc(j.so)}</button><span class="mc">${esc(j.customer)}</span><span class="mk-chip" style="--k:${KINDS[k].colour}">${KINDS[k].label}</span><span class="note">due ${fmt(nextDue(j))}</span>` };
    (pc ? items : missing).push({ ...it, j });
  }
  $('mapctl').innerHTML = Object.entries(KINDS).map(([k, x]) => `<label class="mk kind" style="--k:${x.colour}"><input type="checkbox" data-mapkind="${k}" ${S.mapShow[k] ? 'checked' : ''}>${x.label} <span class="cnt">${counts[k] || 0}</span></label>`).join('')
    + `<label class="mk">Nearby means within <select class="f" id="mapmiles">${[5, 10, 15, 25].map(m => `<option ${S.mapMiles === m ? 'selected' : ''}>${m}</option>`).join('')}</select> miles</label>`;
  const sig = JSON.stringify([items.map(i => [i.postcode, i.kind, i.html]), S.mapMiles]);
  const note = list => `${list.length ? `<div class="panel"><h3>Not on the map <span class="note">${list.length}</span></h3><p class="note">No postcode found for these. Add a delivery address on the order (Amend) or in Customers.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${list.map(i => `<button class="btn sm" type="button" data-open="${i.j.id}">${esc(i.j.so)} · ${esc(i.j.customer)}</button>`).join('')}</div></div>` : ''}
    <p class="note">Map © OpenStreetMap contributors. Postcodes are placed using postcodes.io (only the postcode is sent). Distances are straight-line. The van's live position can be added later.</p>`;
  const stopList = stops => `<div class="sh"><h3>Stops <span class="note">${stops.length}</span></h3>${stops.length > 1 ? '<button class="btn sm" type="button" data-mapfit>Show all</button>' : ''}</div>
    ${stops.length ? `<ol>${stops.map(s => {
      const custs = [...new Set(s.items.map(i => i.j.customer))];
      return `<li><button type="button" data-mapstop="${esc(s.key)}" aria-current="false"><span class="mpin" style="--k:${KINDS[s.kind].colour}">${s.items.length}</span>
        <span class="sb"><b class="mono">${esc(s.key)}</b><span class="sc">${esc(custs.join(', '))}</span>
        <span class="note">${s.items.map(i => esc(i.j.so)).join(', ')} · due ${fmt(s.items[0].due)}${s.near.length ? ` · <b class="nb">${s.near.length} nearby</b>` : ''}</span></span></button></li>`;
    }).join('')}</ol>` : '<p class="note">Nothing to show. Switch on more kinds of job above.</p>'}`;
  if (sig === mapSig) return;
  mapSig = sig;
  $('mapnote').innerHTML = note(missing);
  drawMap($('mapbox'), items, S.mapMiles, esc)
    .then(r => { $('mapstops').innerHTML = stopList(r.stops); if (r.missing.length) $('mapnote').innerHTML = note([...missing, ...r.missing]); })
    .catch(e => { mapSig = ''; $('mapstops').innerHTML = ''; $('mapnote').innerHTML = `<div class="err">${esc(e.message)}</div>`; });
}

/* ---------- Xero ---------- */
async function loadXeroStatus() {
  try { S.xero = await data.xeroStatus(); } catch (e) { S.xeroErr = e.message; }
  render();
  loadInvoiceStatus();
  loadMonthSales();
  loadDebts();
}
/** Xero's status for the invoices the board made, for Home's "In Xero, not approved" card. Approved,
 *  paid or voided ones are remembered on this computer and never asked about again; the rest are asked
 *  about at most every 15 minutes, or straight away when a new note has been sent (Xero's daily limit). */
let invAsking = false;
async function loadInvoiceStatus() {
  if (!S.xero || !office() || invAsking || PREVIEW.on) return;
  let settled = new Set(), kept = null;
  try { settled = new Set(JSON.parse(localStorage.getItem('clj.settled') || '[]')); kept = JSON.parse(localStorage.getItem('clj.invstatus')); } catch { /* ask again */ }
  const ids = invoiceIdsToCheck(S.jobs, settled);
  const fresh = kept && Date.now() - kept.at < 15 * 60e3 && ids.every(id => kept.v.some(x => x.id === id));
  if (fresh) { S.inv = new Map(kept.v.map(x => [x.id, x])); S.invErr = null; return render(); }
  if (!ids.length) { S.inv = new Map(); S.invErr = null; return render(); }
  invAsking = true;
  try {
    const v = (await data.xero('invoices', { ids })).invoices || [];
    for (const x of v) if (SETTLED.includes(x.status)) settled.add(x.id);
    try { localStorage.setItem('clj.settled', JSON.stringify([...settled])); localStorage.setItem('clj.invstatus', JSON.stringify({ at: Date.now(), v })); } catch { /* asked again next time */ }
    S.inv = new Map(v.map(x => [x.id, x])); S.invErr = null;
  } catch (e) { S.invErr = e.message; }
  invAsking = false;
  render();
}
/** Levi's month (MD only): this month's sales invoices in Xero, so work invoiced there outside the board
 *  (before changeover) counts too. Asked at most every 15 minutes, kept for this browser tab only. */
let monthAsking = false;
async function loadMonthSales(force = false) {
  if (!S.xero || !md() || monthAsking || PREVIEW.on) return;
  const today = todayIso(), from = today.slice(0, 7) + '-01';
  try { const kept = JSON.parse(sessionStorage.getItem('clj.monthx') || 'null');
    if (!force && kept && kept.from === from && Date.now() - kept.at < 15 * 60e3) { S.monthX = kept.v; S.monthXErr = null; return render(); } } catch { /* ask again */ }
  monthAsking = true;
  try {
    const v = await data.xero('month', { from, to: today });
    S.monthX = v.invoices || []; S.monthXErr = null;
    try { sessionStorage.setItem('clj.monthx', JSON.stringify({ at: Date.now(), from, v: S.monthX })); } catch { /* asked again next time */ }
  } catch (e) { S.monthXErr = e.message; }
  monthAsking = false;
  render();
}
/** Aged debt (Levi and Mandy): Xero's unpaid invoices, asked at most every 15 minutes, kept for this tab. */
let debtAsking = false;
async function loadDebts(force = false) {
  if (!S.xero || !office() || debtAsking || PREVIEW.on) return;
  try { const kept = JSON.parse(sessionStorage.getItem('clj.debts') || 'null');
    if (!force && kept && Date.now() - kept.at < 15 * 60e3) { S.debtInv = kept.v; S.debtErr = null; return render(); } } catch { /* ask again */ }
  debtAsking = true;
  try {
    S.debtInv = (await data.xero('debts')).invoices || []; S.debtErr = null;
    try { sessionStorage.setItem('clj.debts', JSON.stringify({ at: Date.now(), v: S.debtInv })); } catch { /* asked again next time */ }
  } catch (e) { S.debtErr = e.message; }
  debtAsking = false;
  render();
}
const debts = () => (S.debtInv ? agedDebt(S.debtInv, todayIso()) : null);
/** The aged-debt entry for a customer as named on an order or quote: by their Xero contact, else by name. */
function debtOf(name) {
  const list = debts(); if (!list || !name) return null;
  const c = contactFor(name);
  return (c && list.find(d => d.contactId === c.id)) || debtFor(list, name);
}
/** The warning shown on a new order (and its quote) for a customer with invoices over 60 days. */
function debtWarn(name, where = 'form') {
  const d = debtOf(name); if (!d) return '';
  const ch = recentChase(S.chases, d.customer, todayIso());
  const inv = d.invoices.length;
  return `<div class="warn debt"><b>${esc(d.customer)} owes ${gbp(d.over, 2)} on ${inv} invoice${inv === 1 ? '' : 's'} over ${DEBT_DAYS} days</b>
    (oldest ${esc(d.oldest.number)}, ${d.oldest.age} days). ${where === 'form' ? 'You can still create the order; check with Levi if it should wait.' : ''}
    ${ch ? `<span class="chip ok">Chased ${fmt(ch.at.slice(0, 10))} by ${esc(ch.by)}</span>` : ''}
    <button class="btn sm" type="button" data-chase="${esc(d.key)}">Draft a chase email</button></div>`;
}
/** A chase email for one customer's invoices over 60 days, as an Outlook draft (never sent), copied to Keith. */
async function chaseDebt(key) {
  const d = (debts() || []).find(x => x.key === key); if (!d) return;
  if (S.chasing) return; S.chasing = key; toast(`Writing the chase email for ${d.customer}…`);
  try {
    const book = mainPerson(d.customer, 'accounts');
    let to = book?.email || '', person = book?.name || '';
    if (!to && d.contactId) { try { const c = await data.xero('contact', { id: d.contactId }); to = c.email || ''; person = person || c.person || ''; } catch { /* the draft just has no To */ } }
    const links = (await data.xero('online', { ids: d.invoices.map(x => x.id) }).catch(() => ({ links: {} }))).links || {};
    const { subject, html } = chaseEmail({ debt: d, person, links, from: S.me.name });
    const cc = S.officeSet?.accounts_email || '';
    await data.draftEmail({ to, cc, subject, html });
    await data.addChase({ customer: d.customer, contactId: d.contactId, invoices: d.invoices.map(x => ({ number: x.number, owed: x.owed })), owed: d.over, by: S.me.name }).catch(() => {});
    S.chases = await data.loadChases().catch(() => S.chases);
    toast(`Chase email for ${d.customer} is in your Outlook Drafts${to ? ` to ${to}` : ' (no email address found: add one)'}${cc ? `, copied to ${cc}` : ''}. Check it and press Send.`);
  } catch (e) { toast(e.message, null, true); }
  S.chasing = null; render();
}
const monthXero = () => (!S.xero || PREVIEW.on ? { x: null, note: '' } : S.monthX ? { x: S.monthX, note: '' } : { x: null, note: S.monthXErr || 'checking' });

/** The one-off changeover import: reads Xero's open sales orders and keeps them on the board
 *  (xero_orders), so Won quotes offers them until each becomes a sales order or is marked not a job.
 *  Nothing reads Xero's sales orders by itself; running it again only adds new ones. */
const openSo = q => /^SO-?\d+$/i.test(q.number) && !['DECLINED', 'DELETED', 'INVOICED'].includes(q.status);
let xeroReading = false;
async function importFromXero() {
  if (!S.xero || xeroReading) return;
  xeroReading = true; S.xeroErr = null; render();
  try {
    S.xeroRead = await data.xero('read'); S.xeroReadAt = new Date();
    const fresh = S.xeroRead.quotes.filter(q => openSo(q) && !onBoard(q));
    const added = await data.importXeroOrders(fresh);
    await reload();
    toast(added ? `${added} sales order${added === 1 ? '' : 's'} brought in from Xero. They are on Won quotes.` : 'Nothing new: every open sales order in Xero is already here.');
  } catch (e) { S.xeroErr = e.message; }
  xeroReading = false; render();
}
/** Until changeover (the import), Mandy may still raise sales orders in Xero, so on opening the
 *  board a quiet read keeps the board's next SO number past Xero's. No orders are brought in. */
async function checkSoNumbers() {
  if (!S.xero || (S.xeroOrders || []).length) return;
  try { S.xeroRead = await keptFor('clj.socheck', 15 * 60e3, async () => { const r = await data.xero('read'); return { highestSo: r.highestSo, counterNext: r.counterNext }; }); render(); }
  catch { /* numbers are checked again next time */ }
}
/** Xero allows the board 5,000 calls a day, and each read pages through a whole list (100 a call),
 *  so what changes slowly is kept on this computer for a while instead of read on every page load. */
async function keptFor(key, ms, read) {
  try { const k = JSON.parse(localStorage.getItem(key)); if (k && Date.now() - k.at < ms) return k.v; } catch { /* read it */ }
  const v = await read();
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch { /* read again next time */ }
  return v;
}
function forgetXero() { try { for (const k of ['clj.socheck', 'clj.xc', 'clj.xc2', 'clj.invstatus', 'clj.settled']) localStorage.removeItem(k); } catch { /* nothing kept */ } }
/** Imported Xero sales orders still waiting to go on the board. */
function xeroWaiting() {
  return (S.xeroOrders || []).filter(q => !q.dismissed && !onBoard(q));
}
async function dismissXero(id, dismiss) {
  const q = (S.xeroOrders || []).find(x => x.id === id); if (!q) return;
  q.dismissed = dismiss; render();
  try {
    await data.dismissXeroOrder(id, dismiss, S.me?.email);
    toast(dismiss ? `${q.number} marked not a job. Xero is unchanged.` : `${q.number} is back on Won quotes.`, dismiss ? () => dismissXero(id, false) : null);
  } catch (e) { q.dismissed = !dismiss; render(); toast(e.message, null, true); }
}
async function xeroAction(route) {
  S.xeroBusy = true; S.xeroErr = null; render();
  try {
    if (route === 'connect') { location.href = (await data.xero('connect')).url; return; }
    if (route === 'import') { await loadXeroStatus(); S.xeroBusy = false; await importFromXero(); return; }
    if (route === 'disconnect') { await data.xero('disconnect'); S.xero = null; S.xeroRead = null; forgetXero(); toast('Xero disconnected.'); }
  } catch (e) { S.xeroErr = e.message; }
  S.xeroBusy = false; render();
}
const onBoard = q => S.jobs.find(j => j.xeroQuoteId === q.id || j.so.toUpperCase() === String(q.number).toUpperCase());
function renderXero() {
  const x = S.xero, r = S.xeroRead, busy = S.xeroBusy || xeroReading ? 'disabled' : '';
  const imported = S.xeroOrders || [];
  const last = imported.reduce((a, q) => (q.importedAt > (a?.importedAt || '') ? q : a), null);
  const head = x
    ? `<p>Connected to <b>${esc(x.tenant_name)}</b> by ${esc(x.connected_by)} on ${fmtLong(x.connected_at)}.</p>
       <div class="actions"><button class="btn" type="button" data-xero="connect" ${busy}>${icon('refresh')}Reconnect</button></div>
       <p class="note">Xero's customer list is kept on this computer for half an hour, to stay inside Xero's daily limit. Added a customer in Xero? <button class="btn sm" type="button" data-xcreload>Read the customers again</button></p>`
    : `<p>Not connected. Connecting lets the board create draft invoices in Xero for Keith, and bring in Xero's open sales orders once at changeover. It never approves, sends or deletes anything in Xero.</p>
       <div class="actions"><button class="btn xero" type="button" data-xero="connect" ${busy}>Connect to ${XERO}</button></div>
       <p class="note">You will be sent to Xero to sign in. Pick Clarke Lane Engineering when it asks which organisation.</p>`;
  const waiting = xeroWaiting();
  const importPanel = !x ? '' : `<div class="panel"><h3>Changeover: bring in Xero's sales orders</h3>
      <p>Do this once, on the day the board takes over from raising sales orders in Xero. It copies every open sales order (SO-…) from Xero onto Won quotes, ready to become sales orders. After that the board is the only place orders are raised, and Xero is not read for orders again.</p>
      ${last ? `<p><b>Imported ${imported.length} sales order${imported.length === 1 ? '' : 's'}</b>, last on ${fmtLong(last.importedAt)} by ${esc(last.importedBy)}. ${waiting.length} still waiting on Won quotes.</p>` : '<p class="note">Not imported yet.</p>'}
      <div class="actions"><button class="btn ${last ? '' : 'pri'}" type="button" data-xero="import" ${busy}>${icon('download')}${xeroReading ? 'Reading Xero…' : last ? 'Import again (adds only new ones)' : 'Import open sales orders'}</button></div>
      ${r ? `<p class="note">The highest SO number in Xero is <b>${r.highestSo ? 'SO-' + r.highestSo : 'none'}</b>, so the next order made on the board will be <b>SO-${r.counterNext ?? '…'}</b>. The board always keeps its numbers past Xero's.</p>` : ''}</div>`;
  $('v-xero').innerHTML = `<div class="sec-h"><h2 class="xhead">${XERO}</h2><span class="sub">Clarke Lane's Xero, through the board's own connection.</span>
      <span class="right"><span class="chip ${x ? 'ok' : ''}">${x ? icon('link') + 'Connected' : 'Not connected'}</span></span></div>
    ${S.xeroErr ? `<div class="err">${esc(S.xeroErr)}</div>` : ''}
    <div class="panel"><h3>Connection</h3>${head}</div>
    ${importPanel}`;
}
function makeJobFromXero(id) {
  const q = (S.xeroOrders || []).find(x => x.id === id); if (!q) return;
  const due = q.expiry && q.expiry >= todayIso() ? q.expiry : addWorkingDays(todayIso(), 10);
  openOrderForm({ from: `Xero ${q.number}`, so: q.number.toUpperCase().replace(/^SO(\d)/, 'SO-$1'), customer: q.customer, po: q.reference,
    due, xeroQuoteId: q.id,
    lines: q.lines.filter(l => l.qty > 0).map(l => ({ part: l.description, qty: String(l.qty), price: String(l.unit), due })).concat(q.lines.some(l => l.qty > 0) ? [] : [blankLine(due)]) });
}

/* ---------- shop floor: the touch screen in the factory. Same rows as the job board, bigger boxes. ---------- */
/** Outstanding parts, one line per part however many delivery lines it is split over. */
function dispatchParts(j) {
  return partsLeft(j).map(r =>
    `<div><b>${r.left}</b> × ${esc(r.part)}${r.next && r.next !== r.left ? ` <span class="note">(${r.next} for the next delivery)</span>` : ''}</div>`).join('');
}
function procButtons(j, focus) {
  return needed(j).map(p => { const s = j.procs[p];
    return `<button type="button" class="pbtn ${s.done ? 'done' : ''} ${focus === p ? 'focus' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}"${j.status === 'held' && !office() ? ' disabled' : ''}><b>${s.done ? '✓ ' : ''}${esc(p)}</b><span>${s.done ? `${esc(s.by)} · ${fmtTime(s.at)}` : 'Tap when done'}</span></button>`; }).join('');
}
function renderFloor() {
  $('v-floor').innerHTML = renderShopFloor({ jobs: S.jobs, today: todayIso(), station: S.station, now: new Date(),
    kiosk: !!S.kiosk, canMove: office() }, { esc, fmt, fmtTime, TICK });
}

/* ---------- new orders: Levi's ordered quotes and Xero sales orders, as Sage-style rows ---------- */
/** Both inboxes as one list of rows: { kind: 'quote' | 'xero', date, ref, customer, who, net, state, ... }. */
function inboxRows() {
  const rows = [];
  for (const q of quotes() || []) rows.push({ kind: 'quote', key: 'q' + q.spId, date: q.wonDate || q.quoteDate, ref: q.quoteNo, customer: q.customer,
    who: q.contactName, net: q.sellTotal != null ? q.sellTotal + (q.carriage || 0) : null, state: q.state, so: q.so, jobId: q.jobId, spId: q.spId,
    madeOn: q.jobId ? job(q.jobId)?.ordered : null });
  for (const x of S.xeroOrders || []) {
    const j = onBoard(x);
    rows.push({ kind: 'xero', key: 'x' + x.id, date: x.date, ref: x.number, customer: x.customer, who: x.reference ? 'Ref ' + x.reference : '',
      net: x.subTotal, state: j ? 'job' : x.dismissed ? 'dismissed' : 'waiting', so: j?.so, jobId: j?.id, xeroId: x.id, madeOn: j?.ordered });
  }
  return rows.sort((p, q) => ((q.date || '') < (p.date || '') ? -1 : (q.date || '') > (p.date || '') ? 1 : p.ref < q.ref ? 1 : -1));
}
function renderQuotes() {
  $('v-quotes').innerHTML = renderWon({ debtNote: name => { const d = debtOf(name); return d ? { over: d.over, key: d.key } : null; }, rows: inboxRows(), md: md(), today: todayIso(), view: S.wonView, reading: !S.quotesRaw && !S.quotesErr,
    error: S.quotesErr, converting: S.conv?.spId, open: S.wonOpen, detail: wonDetail }, { esc, fmt, gbp });
}
/* What is on a won quote: its lines from the quote calculator, the Xero sales order, or the order it became. */
S.qlines = new Map();   // spId → lines | 'loading' | Error
function wonDetail(r) {
  const tbl = (head, rows) => `<table class="lines wl"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  if (r.state === 'job' && job(r.jobId)) {
    const j = job(r.jobId);
    return `<p class="note">Now <b>${esc(j.so)}</b>${j.po ? `, customer PO ${esc(j.po)}` : ''}. <button class="btn link sm" type="button" data-open="${j.id}">Open the order</button></p>`
      + tbl(['Part', 'Qty', 'Due', 'Net'], j.lines.map(l => `<tr><td>${esc(l.part)}</td><td class="num">${l.qty}</td><td class="num">${fmt(l.due)}</td><td class="num">${l.price != null ? gbp(round2(l.qty * l.price), 2) : ''}</td></tr>`));
  }
  if (r.kind === 'xero') {
    const x = (S.xeroOrders || []).find(o => o.id === r.xeroId);
    return x ? tbl(['Description', 'Qty', 'Unit price', 'Net'], x.lines.map(l => `<tr><td>${esc(l.description)}</td><td class="num">${l.qty}</td><td class="num">${gbp(l.unit, 2)}</td><td class="num">${gbp(l.amount, 2)}</td></tr>`))
      : '<p class="note">The lines are not available.</p>';
  }
  const got = S.qlines.get(r.spId);
  if (!got) { S.qlines.set(r.spId, 'loading'); data.quoteLines(r.spId).then(ls => { S.qlines.set(r.spId, ls); render(); }).catch(e => { S.qlines.set(r.spId, e); render(); }); }
  if (!got || got === 'loading') return '<p class="note">Reading the lines from the quote calculator…</p>';
  if (got instanceof Error) return `<p class="note bad">Could not read the lines: ${esc(got.message)}</p>`;
  if (!got.length) return '<p class="note">This quote has no lines in the quote calculator.</p>';
  return tbl(['Part', 'Qty', 'Net'], got.map(l => `<tr><td>${esc(describeLine(l))}</td><td class="num">${l.qty}</td><td class="num">${l.sellTotal != null ? gbp(l.sellTotal, 2) : ''}</td></tr>`));
}
function wonDrill(what, key) {
  S.wonView = what === 'oldest' ? 'waiting' : what;
  if (what === 'oldest') S.wonOpen = key;
  if (what === 'waiting' || what === 'oldest') { try { localStorage.setItem('clj.wonview', 'waiting'); } catch { /* not kept */ } }
  render();
  const el = what === 'oldest' ? document.querySelector('#v-quotes tr.open') : $('won-list');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- dispatch ---------- */
function waitingForXero(pend) {
  const connected = !!S.xero;
  if (connected && !S.xc && !S.xcErr) loadXeroContacts();
  const rows = pend.map(({ job: x, d }) => {
    const m = contactFor(x.customer);
    const picked = S.sendPick[d.id] ?? !!m;
    const contactCell = !connected ? '' : !S.xc ? '<span class="note">…</span>'
      : m ? `${esc(m.name)} <span class="note">${m.how === 'auto' ? '(matched)' : ''}</span> <button class="btn link sm" type="button" data-xcchange="${esc(normName(x.customer))}">change</button>`
      : `<select class="f" data-xcpick="${esc(normName(x.customer))}" aria-label="Xero contact for ${esc(x.customer)}"><option value="">Choose the Xero contact…</option>
          ${S.xc.contacts.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`;
    return `<tr${S.sendErr[d.id] ? ' class="rowerr"' : ''}>${connected ? `<td><input type="checkbox" data-sendpick="${d.id}" ${picked && m ? 'checked' : ''} ${m ? '' : 'disabled'} aria-label="Send ${esc(d.dn)}"></td>` : ''}
      <td><button class="btn link mono" type="button" data-dn="${d.id}" data-job="${x.id}">${esc(d.dn)}</button></td>
      <td>${esc(x.customer)}${S.sendErr[d.id] ? `<div class="note bad">${esc(S.sendErr[d.id])}</div>` : ''}</td>
      ${connected ? `<td>${contactCell}</td>` : ''}
      <td class="mono wide">${esc([x.so, dnPo(x, d), d.dn].filter(Boolean).join(' / '))}</td><td class="wide">${fmt(d.deliveredOn)}</td><td class="num">${gbp(despatchValue(x, d), 2)}</td>
      <td class="act"><form class="inv" data-inv="${d.id}"><input type="text" id="inv-${d.id}" placeholder="INV-" aria-label="Xero invoice number for ${esc(d.dn)} if raised by hand"><button class="btn sm" type="submit">Save</button></form></td></tr>`;
  }).join('');
  const ready = pend.filter(({ job: x, d }) => contactFor(x.customer) && (S.sendPick[d.id] ?? true));
  const total = ready.reduce((a, { job: x, d }) => a + (despatchValue(x, d) || 0), 0);
  const how = !connected ? '<p class="note">Connect Xero on the Xero tab to send these as draft invoices with one click. Until then, raise each in Xero by hand and type its invoice number here.</p>'
    : S.xcErr ? `<div class="err">${esc(S.xcErr)} <button class="btn sm" type="button" data-xcreload>Try again</button></div>`
    : !S.xc ? '<p class="note">Reading the contacts from Xero…</p>'
    : `<p class="note">Each one becomes a <b>draft</b> invoice in Xero for exactly what went out on that dispatch note, referenced sales order / PO / dispatch note, on account <b>${esc(S.xc.defaults.accountCode)}</b>${S.xc.defaults.taxType ? ` with VAT code <b>${esc(S.xc.defaults.taxType)}</b>` : ''} (as on ${esc(S.xc.defaults.from)}). Keith checks and approves them in Xero. The board never approves or sends an invoice.</p>`;
  return {
    table: `<table class="lines home xero"><thead><tr>${connected ? '<th></th>' : ''}<th>Note</th><th>Customer</th>${connected ? '<th>Xero contact</th>' : ''}<th class="wide">Reference</th><th class="wide">Delivered</th><th class="num">Net</th><th class="act">Invoiced by hand?</th></tr></thead><tbody>${rows}</tbody></table>`,
    how,
    send: connected && S.xc ? `<div class="hbtns"><button class="btn xero" type="button" data-sendxero ${ready.length && !S.busy ? '' : 'disabled'}>${S.busy ? 'Sending…' : `Create ${ready.length} draft invoice${ready.length === 1 ? '' : 's'} in ${XERO}`}</button>${ready.length ? `<span class="note">${gbp(total, 2)} net</span>` : ''}</div>` : '',
  };
}
/** The Xero contact a customer's invoices go to, or null while Mandy has to choose. */
function contactFor(customer) {
  if (!S.xc || S.forcePick.has(normName(customer))) return null;
  return matchContact(customer, S.xc.contacts, S.xcMap);
}
/** Called from several tabs' render; one read at a time, or every re-render while it runs starts another
 *  (each one pages through all of Xero's contacts) and Xero answers "rate limit". */
let xcLoading = false;
async function loadXeroContacts(fresh) {
  if (xcLoading) return;
  xcLoading = true; S.xcErr = null; if (S.form) collectForm();
  if (fresh) try { localStorage.removeItem('clj.xc2'); } catch { /* not kept */ }
  try { [S.xc, S.xcMap] = await Promise.all([keptFor('clj.xc2', 30 * 60e3, () => data.xero('contacts')), data.loadContactMap()]); }
  catch (e) { S.xcErr = e.message; }
  xcLoading = false; render();
  if (S.poForm && !$('doc').hidden) { collectPo(); showPoForm(); }
}
async function pickContact(key, id) {
  const c = S.xc.contacts.find(x => x.id === id); if (!c) return;
  S.xcMap.set(key, c); S.forcePick.delete(key); render();
  try { await data.saveContact(key, c); toast(`Invoices for this customer will go to ${c.name} in Xero.`); }
  catch (e) { S.xcMap.delete(key); render(); toast(e.message, null, true); }
}
async function sendToXero() {
  const pend = []; S.jobs.forEach(x => x.despatches.forEach(d => { if (!d.xero && d.deliveredOn) pend.push([x, d]); }));
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
/** The dispatch note form for the picked job: what is outstanding, with this dispatch's quantities. */
function despatchForm(j) {
  const missing = needed(j).filter(p => !j.procs[p].done), del = deliveryLabel(j);
  return `<div class="panel dform"><h3>Dispatch ${esc(j.so)} · ${esc(j.customer)}</h3>
    <p class="note">${[j.po ? 'PO ' + esc(j.po) : 'No PO', del].filter(Boolean).join(' · ')}. The quantities start at everything due by ${fmt(nextDue(j))}. Anything not sent stays outstanding on the order.</p>
    ${missing.length ? `<div class="warn">Not ticked yet: ${esc(missing.join(', '))}. Check the parts are finished before they go.</div>` : ''}
    ${deliveryRow(j)}
    <div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Sent</th><th>Left</th><th>This dispatch</th></tr></thead><tbody>
    ${j.lines.filter(l => left(j, l) > 0 || sent(j, l) > 0).map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td>${esc(l.part)}${l.po ? ` <span class="note">PO ${esc(l.po)}</span>` : ''}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td>${left(j, l)}</td><td>${left(j, l) ? `<input type="number" min="0" max="${left(j, l)}" value="${defaultDespatchQty(j, l)}" id="dq-${l.id}" data-dq="${l.id}" aria-label="Quantity of ${esc(l.part)} due ${fmt(l.due)} this dispatch">` : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="actions"><button class="btn pri" type="button" id="mkdn" ${S.busy ? 'disabled' : ''}>Create dispatch note${del ? ` (${del.toLowerCase()})` : ''}</button><button class="btn" type="button" data-despclose>Close</button></div>
    <p class="note" id="dn-msg"></p></div>`;
}
/** The note form opens above the list: bring it into view when it is opened from further down. */
const showDespForm = () => $('v-dispatch').querySelector('.dform')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
function renderDespatch() {
  const lists = dispatchLists(S.jobs, todayIso());
  if (S.desp && !lists.open.some(j => j.id === S.desp)) S.desp = null;
  const money = office();
  $('v-dispatch').innerHTML = renderDispatch({ lists, office: money, md: md(), view: S.dispView, chosen: S.dispChosen, search: S.dsearch, desp: S.desp,
    form: S.desp ? despatchForm(job(S.desp)) : '', cancelDn: S.cancelDn, xero: money && lists.toXero.length ? waitingForXero(lists.toXero) : null },
    { esc, fmt, gbp, dueChip, parts: dispatchParts });
}

/* ---------- job drawer ---------- */
function renderDrawer() {
  const j = S.open ? job(S.open) : null;
  $('drawer').hidden = $('scrim').hidden = !j;
  if (!j) return;
  const money = office(), st = stage(j), net = value(j);
  const ask = S.ask && S.ask.id === j.id ? S.ask.what : null;
  const actions = money && j.status !== 'cancelled' ? `<div class="actions">
      <button class="btn" type="button" data-amend="${j.id}">${icon('edit')}Amend order</button>
      ${j.status === 'held' ? `<button class="btn" type="button" data-status="open" data-job="${j.id}">${icon('making')}Release from hold</button>`
        : st !== 'completed' ? `<button class="btn" type="button" data-status="held" data-job="${j.id}">${icon('hold')}Put on hold</button>` : ''}
      ${st !== 'completed' ? `<button class="btn" type="button" data-ask="cancel" data-job="${j.id}">Cancel order</button>` : ''}
      ${!j.despatches.length ? `<button class="btn link" type="button" data-ask="delete" data-job="${j.id}">Delete (made by mistake)</button>` : ''}</div>` : '';
  const confirm = ask === 'cancel'
    ? `<div class="panel warnbox"><b>Cancel ${esc(j.so)}?</b><span class="note">${j.despatches.length ? 'What has been dispatched stays, with its dispatch notes and invoices. The outstanding quantity is cancelled.' : 'Nothing has been dispatched.'} The order stays in the Sales orders list as Cancelled and leaves the job board.</span>
       <div class="actions"><button class="btn danger" type="button" data-status="cancelled" data-job="${j.id}">Yes, cancel ${esc(j.so)}</button><button class="btn" type="button" data-noask>Keep it</button></div></div>`
    : ask === 'delete'
    ? `<div class="panel warnbox"><b>Delete ${esc(j.so)}?</b><span class="note">For an order created by mistake. It is removed completely. ${j.spQuoteId ? 'The quote goes back to the Quotes tab. ' : ''}The number ${esc(j.so)} is not used again.</span>
       <div class="actions"><button class="btn danger" type="button" data-confirmdelete="${j.id}">Yes, delete ${esc(j.so)}</button><button class="btn" type="button" data-noask>Keep it</button></div></div>` : '';
  $('drawer').innerHTML = `
    <div class="dh"><div><div class="mono note">${esc(j.so)}${j.quote ? ' · from ' + esc(j.quote) : ''}</div><h2>${esc(j.customer)}</h2>
      <div class="actions" style="margin-top:6px">${j.status === 'cancelled' ? '<span class="chip">Cancelled</span>' : `<span class="chip ${despatchStatus(j) === 'Dispatched' ? 'ok' : ''}">${despatchStatus(j)}</span>`}
        ${money ? `<span class="chip ${invoiceStatus(j) === 'Invoiced' ? 'ok' : ''}">${invoiceStatus(j)}</span>` : ''}${j.status === 'held' ? '<span class="chip late">On hold</span>' : ''}${deliveryLabel(j) && st !== 'completed' ? `<span class="chip">${deliveryLabel(j)}</span>` : ''}</div></div>
      <button class="btn sm x" type="button" data-close title="Close (Esc)">← Back</button></div>
    <div class="facts">
      <div class="fact"><div class="k">Customer order no.</div><div class="v mono">${esc(j.po) || '—'}</div></div>
      <div class="fact"><div class="k">Order date</div><div class="v">${fmtLong(j.ordered)}</div></div>
      <div class="fact"><div class="k">${st === 'completed' ? 'Dispatched' : 'Next due'}</div><div class="v">${fmtLong(st === 'completed' ? lastDespatch(j) : nextDue(j))}</div></div>
      <div class="fact"><div class="k">Contact</div><div class="v">${esc(j.contactName) || '—'}</div></div>
      ${j.address ? `<div class="fact" style="grid-column:1/-1"><div class="k">Deliver to</div><div class="v" style="white-space:pre-line;font-weight:500">${esc(j.address)}</div></div>` : ''}
    </div>
    ${j.notes ? `<div class="panel"><div class="note">Notes</div>${esc(j.notes)}</div>` : ''}
    <div class="panel"><h3>Lines</h3><div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Desp.</th><th>Outst.</th>${money ? '<th>Unit</th><th>Net</th>' : ''}</tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}${l.po ? ` <span class="note">PO ${esc(l.po)}</span>` : ''}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td><b>${left(j, l)}</b></td>${money ? `<td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${money ? `<p class="note" style="text-align:right">Net <b>${gbp(net, 2)}</b> · VAT 20% ${gbp(round2(net * 0.2), 2)} · Total <b>${gbp(round2(net * 1.2), 2)}</b></p>` : ''}
      ${deliveryRow(j)}</div>
    ${drawingsPanel(j)}
    <div class="panel"><h3>Processes</h3><div class="pbtns">${procButtons(j)}</div></div>
    <div class="panel"><h3>Dispatched</h3>${j.despatches.length ? `<table class="lines"><thead><tr><th>Note</th><th>Date</th><th>Items</th><th>Emailed</th><th>Delivered</th>${money ? '<th>Net</th><th>Invoice</th>' : ''}<th></th></tr></thead><tbody>
      ${j.despatches.map(d => `<tr><td class="mono">${esc(d.dn)}</td><td>${fmt(d.date)}</td><td>${Object.values(d.lines).reduce((a, q) => a + q, 0)}</td>
        <td>${d.emailedAt ? fmt(d.emailedAt.slice(0, 10)) : '—'}</td><td>${d.deliveredOn ? fmt(d.deliveredOn) : '<span class="note">not yet</span>'}</td>
        ${money ? `<td>${gbp(despatchValue(j, d), 2)}</td><td>${d.xero ? `<span class="chip ok">${esc(d.xero.no)}</span>` : d.deliveredOn ? '<span class="chip soon">waiting</span>' : '<span class="note">after delivery</span>'}</td>` : ''}
        <td><button class="btn sm" type="button" data-dn="${d.id}" data-job="${j.id}">View</button></td></tr>`).join('')}</tbody></table>
      <p class="note">Mark deliveries on the Dispatch tab.</p>` : '<div class="note">Nothing dispatched yet.</div>'}
      ${(j.cancelledDespatches || []).length ? `<p class="note">Cancelled dispatch notes: ${j.cancelledDespatches.map(d => esc(d.dn)).join(', ')}.</p>` : ''}</div>
    ${money ? purchasePanel(j) + proformaPanel(j) : ''}
    <div class="actions">
      <button class="btn" type="button" data-jobsheet="${j.id}">${icon('doc')}Job sheet</button>
      ${money ? `<button class="btn" type="button" data-repeat="${j.id}">${icon('repeat')}Repeat order</button>` : ''}
      ${money ? `<button class="btn" type="button" data-soa="${j.id}">${icon('orders')}Order acknowledgement${j.ackEmailedAt ? ` <span class="chip ok">emailed ${fmt(j.ackEmailedAt.slice(0, 10))}</span>` : ''}</button>` : ''}
      ${onBoardStage(j) && j.status === 'open' ? `<button class="btn pri" type="button" data-desp="${j.id}">${icon('truck')}Dispatch…</button>` : ''}
    </div>${actions}${confirm}`;
}

/* ---------- drawings: kept in SharePoint (Factory Jobs › Documents › Job drawings › SO), shown on every screen ---------- */
const kb = n => n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
function drawingsPanel(j) {
  const up = S.uploading?.jobId === j.id ? `<p class="note">Uploading ${esc(S.uploading.name)} to SharePoint… ${Math.round(S.uploading.pct * 100)}%</p>` : '';
  return `<div class="panel drawings"${office() ? ` data-dropjob="${j.id}"` : ''}><h3>Drawings</h3>${j.files.length ? `<ul class="files">${j.files.map(f => `<li>
      <button type="button" class="btn" data-drawing="${f.id}" data-job="${j.id}">${icon('doc')}${esc(f.name)}</button><span class="note">${kb(f.size)} · ${fmt(f.at.slice(0, 10))}${f.partFileId && office() ? ` · from Parts${partOfFile(f.partFileId) ? ` (${esc(partOfFile(f.partFileId).part.partNo)})` : ''}` : ''}</span>
      ${office() && /\.pdf$/i.test(f.name) ? `<button type="button" class="btn link sm" data-readdrawing="${f.id}" data-job="${j.id}" title="Read the drawing for the processes it suggests">Check processes</button>` : ''}
      ${office() ? `<button type="button" class="btn link sm" data-rmdrawing="${f.id}" title="Takes it off this job. The file stays in SharePoint.">Remove</button>` : ''}</li>`).join('')}</ul>`
    : `<div class="note">${office() ? 'No drawings yet. Attach the drawing so the shop floor can see it.' : 'No drawings on this job.'}</div>`}${up}${office() ? hintBox(j) : ''}
    ${office() ? `<label class="btn"${S.uploading ? ' aria-disabled="true"' : ''}>${icon('plus')}Attach drawings<input type="file" class="sr" data-attach="${j.id}" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.dxf,.dwg,.step,.stp,.doc,.docx,.xls,.xlsx"${S.uploading ? ' disabled' : ''}></label>
      <span class="note droptip">or drag PDF drawings here</span>
      <p class="note">Saved in SharePoint: Factory Jobs › Documents › Job drawings › ${esc(j.so)}.</p>` : ''}</div>`;
}
async function attachDrawings(jobId, files) {
  const j = job(jobId); if (!j || !files.length) return;
  for (const f of files) {
    S.uploading = { jobId, name: f.name, pct: 0 }; render();
    try {
      await data.uploadDrawing(j, f, p => { S.uploading.pct = p; render(); });
      toast(`${f.name} attached to ${j.so}.`);
    } catch (e) { toast(e.message, null, true); break; }
  }
  S.uploading = null; await reload();
  // Read the PDFs just attached for the processes they suggest (the office checks and adds them).
  const pdf = [...files].reverse().find(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (pdf && office()) readDrawingFile(jobId, pdf.name, pdf);
}

/* ---------- parts library: a customer's part numbers and their drawings (Sales orders › Parts) ---------- */
/** New or amended order: link the current drawing of every library part its lines name (same SharePoint file). */
async function linkPartDrawings(jobId, quiet = false) {
  const j = job(jobId); if (!j || !office() || !S.parts?.length) return [];
  const todo = drawingsToLink(S.parts, j); if (!todo.length) return [];
  const done = [];
  for (const { part, file } of todo) { try { await data.linkPartFile(jobId, file); done.push(part.partNo); } catch (e) { toast(e.message, null, true); } }
  if (done.length) { if (!quiet) toast(`Drawing${done.length === 1 ? '' : 's'} from Parts attached to ${j.so}: ${done.join(', ')}.`); await reload(); }
  return done;
}
const partOfFile = id => { for (const p of S.parts || []) { const f = p.files.find(x => x.id === id); if (f) return { part: p, file: f }; } return null; };
function renderParts() {
  const q = (S.psearch || '').trim().toLowerCase();
  const parts = (S.parts || []).filter(p => !q || `${p.partNo} ${p.customer} ${p.description}`.toLowerCase().includes(q))
    .sort((a, b) => a.customer.localeCompare(b.customer) || a.partNo.localeCompare(b.partNo, 'en', { numeric: true }));
  const customers = [...new Set([...S.jobs.map(j => j.customer), ...(S.xc?.contacts || []).map(c => c.name)])].sort();
  const add = S.partAdd ? `<form class="panel partadd" data-partform><h3>Add a part</h3>
      <div class="row3"><label class="fl">Customer<input type="text" id="pa-cust" list="pa-custs" required autocomplete="off" value="${esc(S.partAdd.customer || '')}"><datalist id="pa-custs">${customers.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <label class="fl">Part number<input type="text" id="pa-no" required value="${esc(S.partAdd.partNo || '')}" placeholder="as on the drawing, e.g. UL-PR-10448"></label>
      <label class="fl">Description (optional)<input type="text" id="pa-desc" value="${esc(S.partAdd.description || '')}" placeholder="e.g. Exhaust shim"></label></div>
      <div class="actions"><button class="btn pri" type="submit">Add the part</button><button class="btn" type="button" data-partadd="close">Cancel</button></div></form>` : '';
  const up = id => S.uploading?.partId === id ? `<p class="note">Uploading ${esc(S.uploading.name)} to SharePoint… ${Math.round(S.uploading.pct * 100)}%</p>` : '';
  const detail = p => { const cur = currentFile(p), used = ordersForPart(S.jobs, p);
    return `<tr class="wdetail"><td colspan="5"><div class="panel drawings" data-droppart="${p.id}">
      <h3>Drawings for ${esc(p.partNo)}</h3>
      ${p.files.length ? `<ul class="files">${p.files.map(f => `<li><button type="button" class="btn${f === cur ? ' pri' : ''}" data-partview="${f.id}">${icon('doc')}${esc(f.name)}</button>
        <span class="note">${f === cur ? '<b>current</b> · new orders get this one · ' : 'older · '}${fmt(f.at.slice(0, 10))} · ${esc((f.by || '').split('@')[0])}</span>
        <button type="button" class="btn link sm" data-partrmfile="${f.id}" title="Takes it off the part. The file stays in SharePoint; orders that have it keep it.">Remove</button></li>`).join('')}</ul>`
        : '<p class="note">No drawing yet. Attach one, or drag it here: new orders naming this part number then get it automatically.</p>'}${up(p.id)}
      <label class="btn"${S.uploading ? ' aria-disabled="true"' : ''}>${icon('plus')}${p.files.length ? 'Add a new revision' : 'Attach drawing'}<input type="file" class="sr" data-partattach="${p.id}" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.dxf,.dwg,.step,.stp"${S.uploading ? ' disabled' : ''}></label>
      <span class="note droptip">or drag it here. The newest becomes current; orders already made keep theirs.</span>
      <p class="note">Saved in SharePoint: Factory Jobs › Documents › Part drawings › ${esc(p.customer)} › ${esc(p.partNo)}.</p>
      <p class="note"><b>On ${used.length} order${used.length === 1 ? '' : 's'}</b>${used.length ? ': ' + used.slice(0, 12).map(j => `<button type="button" class="btn link sm" data-open="${j.id}">${esc(j.so)}</button>`).join(' ') : ''}</p>
      <div class="actions"><button type="button" class="btn sm" data-partdel="${p.id}">Remove this part</button></div></div></td></tr>`; };
  const row = p => { const cur = currentFile(p), open = S.partOpen === p.id;
    return `<tr class="${open ? 'open' : ''}" data-partopen="${p.id}" style="cursor:pointer"><td><b class="mono">${esc(p.partNo)}</b>${p.description ? `<span class="ref">${esc(p.description)}</span>` : ''}</td>
      <td>${esc(p.customer)}</td><td>${cur ? `${icon('doc')} ${esc(cur.name)}${p.files.length > 1 ? ` <span class="note">+${p.files.length - 1} older</span>` : ''}` : '<span class="chip soon">No drawing</span>'}</td>
      <td>${ordersForPart(S.jobs, p).length}</td><td class="act"><button class="btn sm" type="button" data-partopen="${p.id}">${open ? 'Close' : 'Open'}</button></td></tr>${open ? detail(p) : ''}`; };
  $('v-parts').innerHTML = `<div class="home">
    <div class="hhead"><div><h2>Parts</h2><p class="sub">Customers' repeat parts and their drawings. A new order that names one of these part numbers gets its drawing attached automatically.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="orders">Sales orders</button><button class="btn pri" type="button" data-partadd="open">${icon('plus')}Add a part</button></div></div>
    ${S.partsErr ? `<div class="err">Could not load the parts: ${esc(S.partsErr)}</div>` : ''}
    ${add}
    <section><div class="hsec-h"><h3>${(S.parts || []).length} part${(S.parts || []).length === 1 ? '' : 's'}</h3><span class="note">by customer</span>
      <input type="search" id="psearch" placeholder="Search part number, customer or description" aria-label="Search parts" value="${esc(S.psearch || '')}"></div>
    ${parts.length ? `<div class="tbl-wrap"><table class="lines home"><thead><tr><th>Part</th><th>Customer</th><th>Current drawing</th><th>Orders</th><th class="act"><span class="sr">Open</span></th></tr></thead><tbody>${parts.map(row).join('')}</tbody></table></div>`
      : `<div class="tbl-wrap"><p class="allclear">${q ? 'No parts match.' : 'No parts yet. Press Add a part, or press Keep for this part when a drawing is attached to an order.'}</p></div>`}</section></div>`;
}
async function savePart(f) {
  const customer = $('pa-cust').value.trim(), partNo = $('pa-no').value.trim(), description = $('pa-desc').value.trim();
  if (!customer || normPartNo(partNo).length < 3) return toast('Enter the customer and a part number (3 characters or more).', null, true);
  try {
    const id = await data.addPart({ customer, customerKey: normName(customer), partNo, description });
    S.partAdd = null; S.partOpen = id; S.parts = await data.loadParts(); render();
    toast(`${partNo} added for ${customer}. Attach its drawing below.`);
  } catch (e) { toast(e.message, null, true); }
}
async function attachPartDrawing(partId, file) {
  const p = (S.parts || []).find(x => x.id === partId); if (!p || !file) return;
  S.uploading = { partId, name: file.name, pct: 0 }; render();
  try { await data.uploadPartDrawing(p, file, x => { S.uploading.pct = x; render(); }); toast(`${file.name} is now the current drawing for ${p.partNo}.`); }
  catch (e) { toast(e.message, null, true); }
  S.uploading = null; S.parts = await data.loadParts().catch(() => S.parts); render();
}
async function removePartDrawing(fileId) {
  const x = partOfFile(fileId); if (!x) return;
  try { await data.removePartFile(x.file.id); S.parts = await data.loadParts(); toast(`${x.file.name} taken off ${x.part.partNo}. It is still in SharePoint.`); } catch (e) { toast(e.message, null, true); }
  render();
}
async function removePart(id) {
  const p = (S.parts || []).find(x => x.id === id); if (!p) return;
  if (S.partDelAsk !== p.id) { S.partDelAsk = p.id; return toast(`Press Remove this part again to take ${p.partNo} out of the parts list. Its drawings stay in SharePoint and on orders.`); }
  try { await data.deletePart(p.id); S.partOpen = null; S.parts = await data.loadParts(); toast(`${p.partNo} removed from the parts list.`); } catch (e) { toast(e.message, null, true); }
  render();
}
/** From an order's drawing: keep it in the library for the part number the drawing gives (adds the part if new). */
async function keepForPart(jobId) {
  const j = job(jobId), h = S.hints?.[jobId]; if (!j || !h?.reading?.facts.part) return;
  const f = j.files.find(x => x.name === h.name) || j.files[j.files.length - 1]; if (!f) return;
  const partNo = h.reading.facts.part;
  try {
    let p = findPart(S.parts, j.customer, partNo);
    const line = j.lines.find(l => normPartNo(l.part).includes(normPartNo(partNo)));
    const id = p ? p.id : await data.addPart({ customer: j.customer, customerKey: normName(j.customer), partNo, description: line ? line.part.replace(new RegExp(partNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim() : '' });
    const pfId = await data.addPartFile(id, f);
    await data.markJobFileFromPart(f.id, pfId).catch(() => {});
    S.parts = await data.loadParts();
    toast(`${f.name} kept for ${partNo}${p ? ' as its current drawing' : ' (new part)'}. New orders for ${j.customer} naming ${partNo} will get it.`);
    h.kept = true; await reload();
  } catch (e) { toast(e.message, null, true); }
}

/* Drag and drop drawings onto an order's Drawings section (Philip, 20 Oct), office only. */
const dropZone = e => (office() && e.dataTransfer?.types?.includes('Files') ? e.target.closest?.('[data-dropjob],[data-droppart]') : null);
let dropOver = null;
document.addEventListener('dragover', e => {
  const z = dropZone(e); if (!z) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  if (dropOver !== z) { dropOver?.classList.remove('dropping'); z.classList.add('dropping'); dropOver = z; }
});
document.addEventListener('dragleave', e => { if (dropOver && !dropOver.contains(e.relatedTarget)) { dropOver.classList.remove('dropping'); dropOver = null; } });
document.addEventListener('drop', e => {
  const z = dropZone(e); dropOver?.classList.remove('dropping'); dropOver = null;
  if (!z) { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); return; }   // a file dropped elsewhere must not open in the tab
  e.preventDefault();
  if (S.uploading) return toast('Wait for the drawing being uploaded to finish.', null, true);
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  if (z.dataset.droppart) return attachPartDrawing(+z.dataset.droppart, files[0]);
  attachDrawings(+z.dataset.dropjob, files);
});
window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files') && !dropZone(e)) e.preventDefault(); });

/* ---------- reading a drawing: the PDF's text, in the browser (pdf.js), into suggested processes ---------- */
let pdfReader = null;
function loadPdfJs() {
  pdfReader ??= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfReader = null; bad(new Error('Could not load the PDF reader. Check the internet connection.')); };
    document.head.appendChild(s);
  });
  return pdfReader;
}
async function pdfText(blob) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' '));
  return out.join(' \n ');
}
async function readDrawingFile(jobId, name, blob) {
  S.hints = { ...(S.hints || {}), [jobId]: { name, busy: true } }; render();
  try { S.hints[jobId] = { name, reading: readDrawing(await pdfText(blob)) }; }
  catch (e) { S.hints[jobId] = { name, err: e.message }; }
  render();
}
async function addHinted(jobId) {
  const j = job(jobId), h = S.hints?.[jobId]; if (!j || !h?.reading) return;
  const add = toAdd(h.reading, j.procs); if (!add.length) return;
  try { await data.setJobProcesses(jobId, add, []); toast(`${add.join(', ')} added to ${j.so}.`); delete S.hints[jobId]; }
  catch (e) { toast(e.message, null, true); }
  reload();
}
function hintBox(j) {
  const h = S.hints?.[j.id]; if (!h) return '';
  if (h.busy) return `<p class="note">Reading ${esc(h.name)}…</p>`;
  if (h.err) return `<div class="warn">Could not read ${esc(h.name)}: ${esc(h.err)}</div>`;
  const r = h.reading;
  if (!r.readable) return `<div class="warn hint">${esc(h.name)} has no text the board can read (a scan, or text drawn as lines), so check the processes by eye. <button class="btn link sm" type="button" data-hintclose="${j.id}">OK</button></div>`;
  const add = toAdd(r, j.procs);
  const facts = [r.facts.part && `Part ${r.facts.part}`, r.facts.material && `Material ${r.facts.material}`, r.facts.thickness, r.facts.finish && `Finish ${r.facts.finish}`].filter(Boolean);
  return `<div class="hint"><b>From the drawing ${esc(h.name)}</b>${facts.length ? `<p class="note">${esc(facts.join(' · '))}</p>` : ''}
    ${add.length ? `<p>It looks like this order also needs: ${add.map(p => `<b>${esc(p)}</b> <span class="note">("${esc(r.why[p])}")</span>`).join(', ')}.</p>`
      : `<p class="note">The processes on the order already cover what the drawing says${r.suggest.length ? ` (${esc(r.suggest.join(', '))})` : ''}.</p>`}
    ${r.flags.length ? `<p class="bad">Not one of the nine processes: ${esc(r.flags.join('; '))}. Bought in, or done another way?</p>` : ''}
    <p class="note">Bends that are only drawn, not written, can't be read: check Fold by eye.</p>
    ${r.facts.part && !h.kept ? (() => { const p = findPart(S.parts, j.customer, r.facts.part), f = j.files.find(x => x.name === h.name);
      const same = p && f && currentFile(p)?.itemId === f.itemId;
      return same ? `<p class="note">This is the current drawing for ${esc(r.facts.part)} in Parts.</p>`
        : `<p>${p ? `<b>${esc(r.facts.part)}</b> is in Parts with another drawing.` : `Keep this drawing for <b>${esc(r.facts.part)}</b>, so the next order for it gets it automatically?`}
          <button class="btn sm" type="button" data-keeppart="${j.id}">${p ? 'Make this its current drawing' : 'Keep for this part'}</button></p>`; })() : ''}
    <div class="actions">${add.length ? `<button class="btn sm pri" type="button" data-hintadd="${j.id}">Add ${esc(add.join(', '))}</button>` : ''}<button class="btn sm" type="button" data-hintclose="${j.id}">${add.length ? 'Not needed' : 'OK'}</button></div></div>`;
}
async function removeDrawingFrom(id) {
  const j = S.jobs.find(x => x.files.some(f => f.id === id)), f = j?.files.find(x => x.id === id);
  try { await data.removeDrawing(id); toast(`${f?.name || 'Drawing'} taken off ${j?.so || 'the job'}. It is still in SharePoint.`); } catch (e) { toast(e.message, null, true); }
  reload();
}
let viewUrl = null;
/** Full screen on any screen, the shop floor included: PDFs and pictures shown here, anything else opens in SharePoint. */
async function showDrawing(jobId, fileId) {
  const j = job(jobId), f = j?.files.find(x => x.id === fileId); if (!f) return;
  const others = j.files.length > 1 ? j.files.map(x => `<button class="btn${x.id === f.id ? ' pri' : ''}" type="button" data-drawing="${x.id}" data-job="${j.id}">${esc(x.name)}</button>`).join('') : '';
  $('doc').innerHTML = `<div class="docbar"><span>${esc(j.so)} · ${esc(j.customer)} · <b>${esc(f.name)}</b></span>${others}
      ${f.url && f.url !== '#' ? `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener">Open in SharePoint</a>` : ''}<button class="btn" type="button" data-closedoc>Close</button></div>
    <div class="viewer" id="viewer"><p class="note">Opening ${esc(f.name)}…</p></div>`;
  $('doc').hidden = false; document.body.classList.add('doc-open', 'viewing');
  try {
    const blob = await data.drawingBlob(f);
    if (viewUrl) URL.revokeObjectURL(viewUrl);
    const type = blob.type || f.mime || '', pdf = /pdf/i.test(type) || /\.pdf$/i.test(f.name), img = /^image\//i.test(type) || /\.(png|jpe?g|gif|webp)$/i.test(f.name);
    viewUrl = URL.createObjectURL(pdf && !/pdf/i.test(blob.type) ? new Blob([blob], { type: 'application/pdf' }) : blob);
    $('viewer').innerHTML = pdf ? `<iframe class="vframe" src="${viewUrl}#view=FitH" title="${esc(f.name)}"></iframe>`
      : img ? `<img class="vimg" src="${viewUrl}" alt="${esc(f.name)}">`
      : `<div class="panel"><b>${esc(f.name)}</b><p class="note">This kind of file cannot be shown on the board. ${f.url && f.url !== '#' ? 'Open it in SharePoint, or ' : ''}<a href="${viewUrl}" download="${esc(f.name)}">download it</a>.</p></div>`;
  } catch (e) { $('viewer').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

/* ---------- purchase orders: bought-in parts or outside work for a sales order, as DRAFT POs in Xero
   (the SO number is the reference) for Keith to match against the supplier's invoice ---------- */
const posFor = j => (S.pos || []).filter(p => p.jobId === j.id);
const xeroPoLink = id => `https://go.xero.com/Accounts/Payable/PurchaseOrders/View/${encodeURIComponent(id)}`;
function purchasePanel(j) {
  const list = posFor(j);
  return `<div class="panel"><h3>Purchase orders</h3>${list.length ? `<table class="lines"><thead><tr><th>PO</th><th>Supplier</th><th>Date</th><th>Net</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td class="mono">${esc(p.no || 'draft')}</td><td style="text-align:left">${esc(p.supplier)}</td><td>${fmt(p.at.slice(0, 10))}</td><td>${gbp(p.net, 2)}</td>
      <td><a class="btn sm" href="${xeroPoLink(p.xeroId)}" target="_blank" rel="noopener">Open in ${XERO}</a></td></tr>`).join('')}</tbody></table>`
    : '<div class="note">Bought-in parts or outside work (painting, plating) for this order. Each one goes to Xero as a draft purchase order.</div>'}
    ${j.status !== 'cancelled' ? `<div class="actions"><button class="btn" type="button" data-ponew="${j.id}">${icon('plus')}New purchase order</button>
      <button class="btn" type="button" data-pob2b="${j.id}" title="A PO for this order's parts, with the supplier and costs from the last PO for them">${icon('repeat')}Back-to-back PO</button></div>` : ''}</div>`;
}
const blankPoLine = () => ({ description: '', qty: '1', unit: '' });
function openPoForm(jobId) {
  if (!S.xero) return toast('Connect to Xero first (Xero tab).', null, true);
  S.poForm = { jobId, contactId: '', delivery: '', account: '5000', other: '', lines: [blankPoLine()], key: crypto.randomUUID(), busy: false };
  if (!S.xc && !S.xcErr) loadXeroContacts();
  showPoForm();
}
function collectPo() {
  const f = S.poForm; if (!f || !$('po-sup')) return;
  f.contactId = $('po-sup').value; f.delivery = $('po-del').value; f.account = $('po-acc').value; f.other = $('po-acc2')?.value ?? f.other;
  f.lines = f.lines.map((l, i) => ({ description: $('po-d' + i)?.value ?? l.description, qty: $('po-q' + i)?.value ?? l.qty, unit: $('po-u' + i)?.value ?? l.unit }));
}
function showPoForm() {
  const f = S.poForm, j = job(f.jobId); if (!j) return;
  // Copy a previous PO: same parts first, then the same customer, then the rest (newest first).
  const sug = poSuggestions(j, S.jobs, S.pos || []);
  const copyOpt = p => `<option value="${p.id}">${esc(p.no || 'Draft PO')} · ${esc(p.supplier)} · ${p.so ? esc(p.so) + ' · ' : ''}${p.lines.length} line${p.lines.length === 1 ? '' : 's'} · ${gbp(p.net, 2)} · ${fmt(p.at.slice(0, 10))}</option>`;
  const groups = [['Same parts as this order', sug.samePart], [`Other orders for ${j.customer}`, sug.sameCustomer], ['Other purchase orders', sug.other.slice(0, 30)]].filter(([, l]) => l.length);
  const copy = groups.length ? `<label class="fl">Copy a previous PO (optional)<select class="f" id="po-copy"><option value="">${sug.samePart.length ? `${sug.samePart.length} earlier PO${sug.samePart.length === 1 ? '' : 's'} for the same parts…` : 'Choose one to copy…'}</option>
      ${groups.map(([t, l]) => `<optgroup label="${esc(t)}">${l.map(copyOpt).join('')}</optgroup>`).join('')}</select></label>
      ${f.copied ? `<p class="note">Copied from <b>${esc(f.copied)}</b>: supplier, account and lines. Check the quantities and costs before sending.</p>` : ''}` : '';
  const cs = (S.xc?.contacts || []).slice().sort((a, b) => (b.supplier - a.supplier) || a.name.localeCompare(b.name));
  const sup = cs.filter(c => c.supplier), rest = cs.filter(c => !c.supplier);
  const opt = c => `<option value="${esc(c.id)}"${c.id === f.contactId ? ' selected' : ''}>${esc(c.name)}</option>`;
  const net = round2(f.lines.reduce((a, l) => a + round2((Number(l.qty) || 0) * (Number(l.unit) || 0)), 0));
  $('doc').innerHTML = `<div class="docbar"><span>New purchase order for ${esc(j.so)} · ${esc(j.customer)}</span><button class="btn" type="button" data-closedoc>Close</button></div>
    <div class="sheetedit panel poform"><h3>Purchase order for ${esc(j.so)}</h3>
      <p class="note">It goes to Xero as a <b>draft</b> purchase order, with ${esc(j.so)} as the reference. Approve and send it to the supplier from Xero; Keith matches the supplier's bill to it there.</p>
      ${copy}
      <div class="row2"><label class="fl">Supplier (from Xero)${S.xcErr ? ` <span class="bad">${esc(S.xcErr)}</span>` : ''}<select class="f" id="po-sup"><option value="">${S.xc ? 'Choose the supplier…' : 'Reading Xero…'}</option>
        ${sup.length ? `<optgroup label="Suppliers">${sup.map(opt).join('')}</optgroup>` : ''}${rest.length ? `<optgroup label="Other contacts">${rest.map(opt).join('')}</optgroup>` : ''}</select></label>
        <label class="fl">Delivery date (optional)<input type="date" id="po-del" value="${esc(f.delivery)}"></label></div>
      <div class="row2"><label class="fl">Account in Xero (one for the whole PO)<select class="f" id="po-acc" data-poacc>
          ${[['5000', 'Materials, e.g. steel (5000)'], ['other', 'Another account: type the code'], ['', 'Not sure: Keith codes it in Xero']]
            .map(([v, t]) => `<option value="${v}"${v === f.account ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        ${f.account === 'other' ? `<label class="fl">Account code<input type="text" id="po-acc2" value="${esc(f.other)}" placeholder="e.g. consumables or subcontract code" maxlength="10" inputmode="numeric"></label>` : '<span></span>'}</div>
      <div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Description</th><th>Qty</th><th>Unit cost</th><th>Net</th><th></th></tr></thead><tbody>
      ${f.lines.map((l, i) => `<tr><td style="text-align:left;min-width:260px"><input type="text" id="po-d${i}" value="${esc(l.description)}" placeholder="e.g. Powder coat RAL 9005, 40 brackets" style="width:100%;text-align:left"></td>
        <td><input type="number" id="po-q${i}" min="0" step="any" value="${esc(l.qty)}" style="width:80px"></td>
        <td><input type="number" id="po-u${i}" min="0" step="any" value="${esc(l.unit)}" placeholder="£" style="width:100px"></td>
        <td>${gbp(round2((Number(l.qty) || 0) * (Number(l.unit) || 0)), 2)}</td>
        <td>${f.lines.length > 1 ? `<button class="btn sm link" type="button" data-podel="${i}" aria-label="Remove line ${i + 1}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="actions"><button class="btn sm" type="button" data-poadd>${icon('plus')}Add line</button><button class="btn sm" type="button" data-pofill title="One line per part on the order, to price">Copy this order's parts</button>
        <span class="note" style="margin-left:auto">Net <b>${gbp(net, 2)}</b> + VAT as set in Xero</span></div>
      <div class="actions"><button class="btn pri" type="button" data-pocreate ${f.busy ? 'disabled' : ''}>${f.busy ? 'Sending to Xero…' : `Create draft PO in ${XERO}`}</button></div></div>`;
  $('doc').hidden = false; document.body.classList.add('doc-open');
}
/** Back-to-back (Mandy, 20 Oct): a PO for exactly this order's parts. Each part takes the cost from the
 *  newest earlier PO line naming it; the supplier is the one on that PO when every costed part agrees. */
function backToBackPo(jobId) {
  const j = job(jobId); if (!j) return;
  openPoForm(jobId); const f = S.poForm; if (!f) return;
  const r = backToBackLines(j, S.pos || []);
  f.lines = r.lines.map(l => ({ description: l.description, qty: String(l.qty), unit: l.unit == null ? '' : String(l.unit) }));
  if (r.supplierId) f.contactId = r.supplierId;
  if (r.account != null) { f.account = r.account === '5000' || r.account === '' ? r.account : 'other'; f.other = f.account === 'other' ? r.account : ''; }
  f.delivery = r.delivery && r.delivery >= todayIso() ? r.delivery : '';   // never a delivery date already gone f.copied = `${j.so}, back-to-back${r.costed ? ` (costs for ${r.costed} of ${r.lines.length} part${r.lines.length === 1 ? '' : 's'} from earlier POs)` : ''}`;
  showPoForm();
}
/** Fills the open PO form from an earlier PO: its supplier, account code and lines (kept as they were). */
function copyPo(id) {
  const p = (S.pos || []).find(x => x.id === id), f = S.poForm; if (!p || !f) return;
  f.contactId = p.supplierId || f.contactId;
  f.account = p.account === '5000' || p.account === '' ? p.account : 'other'; f.other = f.account === 'other' ? p.account : '';
  f.lines = p.lines.map(l => ({ description: String(l.description || ''), qty: String(l.qty ?? 1), unit: l.unit == null ? '' : String(l.unit) }));
  if (!f.lines.length) f.lines = [blankPoLine()];
  const from = job(p.jobId); f.copied = `${p.no || 'a draft PO'}${from ? ` (${from.so})` : ''}`;
  showPoForm();
}
async function createPo() {
  collectPo(); const f = S.poForm, j = job(f.jobId);
  const lines = f.lines.map(l => ({ description: l.description.trim(), qty: Number(l.qty), unit: l.unit === '' ? NaN : Number(l.unit) })).filter(l => l.description || l.qty);
  if (!f.contactId) return toast('Choose the supplier first.', null, true);
  if (!lines.length || lines.some(l => !l.description || !(l.qty > 0))) return toast('Every line needs a description and a quantity.', null, true);
  if (lines.some(l => !Number.isFinite(l.unit) || l.unit < 0)) return toast('Every line needs a unit cost (0 if not known yet).', null, true);
  const accountCode = f.account === 'other' ? f.other.trim() : f.account;
  if (f.account === 'other' && !accountCode) return toast('Type the account code, or choose "Not sure" and Keith will code it.', null, true);
  f.busy = true; showPoForm();
  try {
    const r = await data.xero('po', { jobId: f.jobId, contactId: f.contactId, deliveryDate: f.delivery, accountCode, lines, key: f.key });
    S.poForm = null; closeDoc(); await reload();
    toast(`${r.number || 'Draft purchase order'} for ${r.supplier || 'the supplier'} is in Xero as a draft, referenced ${j.so}.${r.recorded ? '' : ' It could not be listed on the board: refresh the page.'}`);
  } catch (e) { f.busy = false; showPoForm(); toast(e.message, null, true); }
}

/* ---------- pro formas: a priced request for payment before the goods go. Not a VAT invoice; never sent to Xero.
   Keith (the office's accounts address) is copied into every email; once paid, the order's later draft
   invoices in Xero say "Paid in advance, pro forma PF-…". ---------- */
const pfsFor = j => (S.pfs || []).filter(p => p.jobId === j.id);
const pfTotal = p => round2(p.net + p.vat);
const pfState = p => p.cancelledAt ? '<span class="chip">Cancelled</span>' : p.paidOn ? `<span class="chip ok">Paid ${fmt(p.paidOn)}</span>`
  : p.emailedAt ? `<span class="chip soon">Emailed ${fmt(p.emailedAt.slice(0, 10))}, not paid</span>` : '<span class="chip soon">Not paid</span>';
function proformaPanel(j) {
  const list = pfsFor(j);
  return `<div class="panel"><h3>Pro forma</h3>${list.length ? `<table class="lines"><thead><tr><th>Pro forma</th><th>Date</th><th>Total inc VAT</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td class="mono">${esc(p.pf)}</td><td>${fmt(p.at.slice(0, 10))}</td><td>${gbp(pfTotal(p), 2)}</td><td>${pfState(p)}</td>
      <td><button class="btn sm" type="button" data-pfview="${p.id}" data-job="${j.id}">View</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="note">For payment before the goods go. Not a VAT invoice: the invoice still goes to Xero after dispatch.</div>'}
    ${j.status !== 'cancelled' ? `<div class="actions"><button class="btn" type="button" data-pfnew="${j.id}">${icon('doc')}New pro forma</button></div>` : ''}</div>`;
}
function openProformaDraft(jobId) {
  const j = job(jobId); if (!j) return;
  const out = Object.fromEntries(j.lines.map(l => [l.id, left(j, l)]));
  S.pfDraft = { jobId, qty: Object.values(out).some(q => q > 0) ? out : Object.fromEntries(j.lines.map(l => [l.id, l.qty])) };
  S.pfSettings = !S.officeSet?.payment_details;
  showDoc('pfnew', jobId);
}
function pfEditor(j) {
  const o = S.officeSet || {};
  const settings = S.pfSettings ? `<form class="pfset" data-pfsettings>
      <label class="fl">Payment details printed on every pro forma (bank, sort code, account, terms)<textarea id="pf-pay" rows="4" placeholder="Typed in by Levi or Mandy">${esc(o.payment_details || '')}</textarea></label>
      <label class="fl">Copy every pro forma email to (Keith)<input type="text" id="pf-cc" value="${esc(o.accounts_email || '')}" placeholder="accounts@…"></label>
      <div class="actions"><button class="btn sm pri" type="submit">Save these</button>${o.payment_details ? '<button class="btn sm" type="button" data-pfset="close">Cancel</button>' : ''}</div>
      <p class="note">Kept on the board for everyone in the office, never in the code.</p></form>`
    : `<p class="note">Payment details and the copy to ${esc(o.accounts_email || 'accounts')} are set. <button class="btn link sm" type="button" data-pfset="open">Change them</button></p>`;
  return `<div class="sheetedit panel"><h3>New pro forma for ${esc(j.so)}</h3>
    <p class="note">Choose what this pro forma asks payment for: everything still to send, or one call-off. Prices are the order's.</p>
    <div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Due</th><th>Ordered</th><th>Outstanding</th><th>Unit</th><th>On this pro forma</th></tr></thead><tbody>
    ${j.lines.map(l => `<tr><td style="text-align:left">${esc(l.part)}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${left(j, l)}</td><td>${unit(l.price)}</td>
      <td><input type="number" min="0" max="${l.qty}" step="1" value="${S.pfDraft.qty[l.id] || 0}" data-pq="${l.id}" style="width:90px" aria-label="Quantity on this pro forma: ${esc(l.part)}"></td></tr>`).join('')}</tbody></table></div>
    ${settings}
    <div class="actions"><button class="btn pri" type="button" data-pfcreate="${j.id}" ${S.officeSet?.payment_details ? '' : 'disabled title="Save the payment details first"'}>${icon('doc')}Make the pro forma</button></div></div>`;
}
function pfLinesFrom(j) {   // the draft's lines with the order's prices (the server takes its own prices when it is made)
  return j.lines.filter(l => (S.pfDraft.qty[l.id] || 0) > 0).map(l => ({ part: l.part, qty: S.pfDraft.qty[l.id], unit_price: l.price, net: round2(S.pfDraft.qty[l.id] * l.price) }));
}
async function createProforma(jobId) {
  const j = job(jobId);
  const lines = j.lines.map(l => ({ job_line_id: l.id, qty: S.pfDraft.qty[l.id] || 0 })).filter(l => l.qty > 0);
  if (!lines.length) return toast('Enter a quantity for at least one part.', null, true);
  try {
    const p = await data.createProforma(jobId, lines);
    S.pfDraft = null; await reload();
    showDoc('pf', jobId, p.id);
    toast(`${p.pf_number} made. Email it to the customer, or print it.`, async () => {
      closeDoc(); try { await data.markProforma(p.id, 'cancel'); toast(`${p.pf_number} cancelled.`); } catch (e) { toast(e.message, null, true); } reload();
    });
  } catch (e) { toast(e.message, null, true); }
}
async function markPf(id, what) {
  const p = S.pfs.find(x => x.id === id); if (!p) return;
  const back = { paid: 'unpaid', unpaid: 'paid', cancel: 'uncancel' }[what];
  try {
    await data.markProforma(id, what, S.me.name); await reload(); showDoc('pf', p.jobId, id);
    toast({ paid: `${p.pf} marked paid. The order's draft invoices in Xero will say it was paid in advance.`, unpaid: `${p.pf} set back to not paid.`, cancel: `${p.pf} cancelled.` }[what],
      back ? () => markPf(id, back) : null);
  } catch (e) { toast(e.message, null, true); }
}
async function savePfSettings() {
  const pay = $('pf-pay').value.trim(), cc = $('pf-cc').value.trim();
  if (!pay) return toast('Type the payment details first: they go on every pro forma.', null, true);
  if (cc && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc)) return toast('That copy address does not look like an email address.', null, true);
  try {
    await Promise.all([data.saveOfficeSetting('payment_details', pay), data.saveOfficeSetting('accounts_email', cc)]);
    S.officeSet = { ...S.officeSet, payment_details: pay, accounts_email: cc }; S.pfSettings = false;
    toast('Saved for everyone in the office.'); showDoc('pfnew', S.pfDraft.jobId);
  } catch (e) { toast(e.message, null, true); }
}

/* ---------- documents (print / save as PDF) ---------- */
function docHtml(kind, jobId, despId) {
  const j = job(jobId); if (!j) return '';
  const logo = document.querySelector('.top .logo').outerHTML;
  const head = (title, no) => `<div class="ph">${logo}<div><h1>${title}</h1><div class="dno">${no}</div></div></div>`;
  let body;
  if (kind === 'job') {
    // The factory's paper copy for the job folder (with the drawing). No prices. The board stays the live record.
    const need = needed(j), skip = PROCESSES.filter(p => !j.procs[p]);
    // What to make on this sheet: chosen on screen before printing (S.sheet); the order is not changed.
    const pick = S.sheet?.jobId === j.id ? S.sheet.qty : Object.fromEntries(j.lines.map(l => [l.id, left(j, l)]));
    const make = j.lines.filter(l => (pick[l.id] || 0) > 0);
    const allDates = deliveryDates(j), dates = [...new Set(make.map(l => l.due))].sort();
    const which = allDates.length > 1 && dates.length ? dates.map(d => allDates.indexOf(d) + 1).filter(n => n > 0) : [];
    const pos = [...new Set(make.map(l => l.po).filter(Boolean))];
    body = `<div class="ph">${logo}<div><h1>Job sheet</h1><div class="dno big">${esc(j.so)}</div></div></div>
      <div class="two"><div><div class="k">Customer</div><b class="lg">${esc(j.customer)}</b>${j.contactName ? `<div>${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Customer PO</span><span>${esc(j.po) || '—'}</span><span class="k">Our quote</span><span>${esc(j.quote) || '—'}</span>
        <span class="k">Ordered</span><span>${fmtLong(j.ordered)}</span>
        <span class="k">Due</span><span><b>${dates.length ? (dates.length > 1 ? `${fmtLong(dates[0])} to ${fmtLong(dates[dates.length - 1])}` : fmtLong(dates[0])) : '—'}</b></span>
        ${which.length ? `<span class="k">Call-off</span><span><b>${which.length > 1 ? `Deliveries ${which.join(', ')}` : `Delivery ${which[0]}`} of ${allDates.length}</b></span>` : ''}
        ${pos.length ? `<span class="k">Call-off PO</span><span><b>${esc(pos.join(', '))}</b></span>` : ''}</div></div>
      ${j.notes ? `<div class="jnote"><div class="k">Notes</div><div style="white-space:pre-line">${esc(j.notes)}</div></div>` : ''}
      ${make.length ? `<table><thead><tr><th>Part</th><th>To make</th><th>Due</th>${pos.length ? '<th>Call-off PO</th>' : ''}</tr></thead><tbody>
      ${make.map(l => `<tr><td>${esc(l.part)}</td><td><b class="lg">${pick[l.id]}</b></td><td>${fmtLong(l.due)}</td>${pos.length ? `<td>${esc(l.po) || ''}</td>` : ''}</tr>`).join('')}</tbody></table>`
        : '<div class="jnote">Nothing to make on this sheet. Enter a quantity above it on screen.</div>'}
      <table class="jprocs"><thead><tr><th>Process</th><th>Done</th><th>By</th><th>Date</th></tr></thead><tbody>
      ${need.map(p => { const st = j.procs[p]; return `<tr><td><b>${esc(p)}</b></td><td><span class="jbox">${st.done ? '✓' : ''}</span></td><td>${st.done ? esc(st.by) : ''}</td><td>${st.done ? fmt(st.at.slice(0, 10)) : ''}</td></tr>`; }).join('')
        || '<tr><td colspan="4">No processes ticked on this order.</td></tr>'}</tbody></table>
      ${skip.length ? `<div class="k" style="text-transform:none;letter-spacing:0">Not needed: ${skip.map(esc).join(', ')}</div>` : ''}
      <div class="jlines"><div>Drawing no. / revision</div><div>Material</div><div>Notes</div></div>
      <div class="foot">Printed ${fmtLong(todayIso())} from the job board. The job board is the live record: tick processes there too.</div>`;
  } else if (kind === 'pf' || kind === 'pfnew') {
    const p = kind === 'pf' ? S.pfs.find(x => x.id === despId) : null;
    const lines = p ? p.lines : pfLinesFrom(j);
    const net = p ? p.net : round2(lines.reduce((a, l) => a + l.net, 0)), vat = p ? p.vat : round2(net * 0.2);
    const no = p ? p.pf : 'PF-(number when made)', date = p ? p.at.slice(0, 10) : todayIso();
    body = head('Pro forma invoice', esc(no)) + `
      <div class="two"><div><div class="k">For</div><b>${esc(j.customer)}</b>${j.contactName ? `<div>${esc(j.contactName)}</div>` : ''}${j.address ? `<div style="white-space:pre-line">${esc(j.address)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(date)}</span><span class="k">Your order</span><span>${esc(j.po) || '—'}</span>
        <span class="k">Our order</span><span>${esc(j.so)}</span></div></div>
      <p>Please pay this pro forma before the goods are dispatched. <b>This is not a VAT invoice</b>; the VAT invoice follows when the goods are sent.</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Net</th></tr></thead><tbody>
      ${lines.map(l => `<tr><td>${esc(l.part)}</td><td>${l.qty}</td><td>${unit(Number(l.unit_price))}</td><td>${gbp(Number(l.net), 2)}</td></tr>`).join('') || '<tr><td colspan="4">Nothing chosen yet.</td></tr>'}</tbody></table>
      <div class="tot"><span>Net</span><span>${gbp(net, 2)}</span><span>VAT 20%</span><span>${gbp(vat, 2)}</span><span class="g">To pay</span><span class="g">${gbp(round2(net + vat), 2)}</span></div>
      <div class="jnote"><div class="k">How to pay</div><div style="white-space:pre-line">${esc(S.officeSet?.payment_details || 'Payment details to be added.')}</div>
        <div style="margin-top:6px">Please use <b>${esc(no)}</b> as the payment reference.</div></div>
      ${p?.paidOn ? `<p><b>Paid ${fmtLong(p.paidOn)}. Thank you.</b></p>` : ''}
      <div class="foot">Clarke Lane Engineering Ltd. Pro forma ${esc(no)} for order ${esc(j.so)}. Not a VAT invoice.</div>`;
  } else if (kind === 'soa') {
    const net = value(j), vat = round2(net * 0.2);
    body = head('Order acknowledgement', esc(j.so)) + `
      <div class="two"><div><div class="k">Customer</div><b>${esc(j.customer)}</b>${j.contactName ? `<div>${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(j.ordered)}</span><span class="k">Your order</span><span>${esc(j.po) || '—'}</span>
        <span class="k">Our quote</span><span>${esc(j.quote) || '—'}</span>
        <span class="k">Delivery</span><span>${deliveryDates(j).length > 1 ? `${deliveryDates(j).length} deliveries, ${fmtLong(deliveryDates(j)[0])} to ${fmtLong(deliveryDates(j).pop())}` : fmtLong(nextDue(j))}</span></div></div>
      ${j.address ? `<div><div class="k">Deliver to</div><div style="white-space:pre-line">${esc(j.address)}</div></div>` : ''}
      <p>Thank you for your order. We confirm the following.</p>
      <table><thead><tr><th>Description</th><th>Due</th><th>Qty</th><th>Unit price</th><th>Net</th></tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}${l.po && l.po !== j.po ? ` <span style="color:var(--paper-mute)">(your PO ${esc(l.po)})</span>` : ''}</td><td>${fmtLong(l.due)}</td><td>${l.qty}</td><td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td></tr>`).join('')}</tbody></table>
      <div class="tot"><span>Net</span><span>${gbp(net, 2)}</span><span>VAT 20%</span><span>${gbp(vat, 2)}</span><span class="g">Total</span><span class="g">${gbp(net + vat, 2)}</span></div>
      <div class="foot">Clarke Lane Engineering Ltd. Please quote ${esc(j.so)} on any correspondence about this order.</div>`;
  } else {
    const di = j.despatches.findIndex(d => d.id === despId), d = j.despatches[di];
    const before = l => j.despatches.slice(0, di).reduce((a, x) => a + (x.lines[l.id] || 0), 0);
    body = head('Delivery note', esc(d.dn)) + `
      <div class="two"><div><div class="k">Deliver to</div><b>${esc(j.customer)}</b>${j.address ? `<div style="white-space:pre-line">${esc(j.address)}</div>` : ''}${j.contactName ? `<div>FAO ${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(d.date)}</span><span class="k">Your order</span><span>${esc(dnPo(j, d)) || '—'}</span>
        <span class="k">Our order</span><span>${esc(j.so)}</span></div></div>
      <table><thead><tr><th>Description</th><th>Ordered</th><th>Previously sent</th><th>This delivery</th><th>Outstanding</th></tr></thead><tbody>
      ${j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => `<tr><td>${esc(l.part)}${deliveryDates(j).length > 1 ? ` <span style="color:var(--paper-mute)">(due ${fmt(l.due)})</span>` : ''}</td><td>${l.qty}</td><td>${before(l)}</td><td><b>${d.lines[l.id]}</b></td><td>${l.qty - before(l) - d.lines[l.id]}</td></tr>`).join('')}</tbody></table>
      ${stillToCome(j, di)}
      <div class="sign"><div>Received by (print)</div><div>Signature</div><div>Date</div></div>
      <div class="foot">Please check the goods on delivery and report any shortage or damage within 48 hours, quoting ${esc(d.dn)}.</div>`;
  }
  return body;
}
/** Before printing a job sheet: choose what this sheet is for (call-off customers make part of an
 *  order at a time). Defaults to the next delivery; the order itself is never changed here. */
function openJobSheet(id) {
  const j = job(id); if (!j) return;
  const next = Object.fromEntries(j.lines.map(l => [l.id, defaultDespatchQty(j, l)]));
  const any = Object.values(next).some(q => q > 0);
  S.sheet = { jobId: id, qty: any ? next : Object.fromEntries(j.lines.map(l => [l.id, left(j, l)])) };
  showDoc('job', id);
}
function sheetEditor(j) {
  const call = deliveryDates(j).length > 1;
  return `<div class="sheetedit panel"><h3>What is this sheet for?</h3>
    <p class="note">Change <b>To make</b> for this job sheet only, for example the call-off you are making now. The order is not changed; to change the order, use Amend.</p>
    <div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Due</th>${linePos(j).length ? '<th>Call-off PO</th>' : ''}<th>Ordered</th><th>Outstanding</th><th>To make</th></tr></thead><tbody>
    ${j.lines.map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td style="text-align:left">${esc(l.part)}</td><td>${fmt(l.due)}</td>${linePos(j).length ? `<td>${esc(l.po) || ''}</td>` : ''}<td>${l.qty}</td><td>${left(j, l)}</td>
      <td><input type="number" min="0" step="1" value="${S.sheet.qty[l.id] || 0}" data-sq="${l.id}" style="width:90px" aria-label="To make on this sheet: ${esc(l.part)} due ${fmt(l.due)}"></td></tr>`).join('')}</tbody></table></div>
    <div class="actions">${call ? '<button class="btn sm" type="button" data-sqset="next">Next delivery</button>' : ''}<button class="btn sm" type="button" data-sqset="all">Everything outstanding</button><button class="btn sm" type="button" data-sqset="none">Clear</button></div></div>`;
}
function setSheet(how) {
  const j = job(S.sheet?.jobId); if (!j) return;
  S.sheet.qty = Object.fromEntries(j.lines.map(l => [l.id, how === 'all' ? left(j, l) : how === 'next' ? defaultDespatchQty(j, l) : 0]));
  showDoc('job', j.id);
}
function showDoc(kind, jobId, despId) {
  const j = job(jobId); if (!j) return;
  const d = kind === 'dn' ? j.despatches.find(x => x.id === despId) : null;
  const p = kind === 'pf' ? (S.pfs || []).find(x => x.id === despId) : null;
  const sentAt = kind === 'soa' ? j.ackEmailedAt : kind === 'pf' ? p?.emailedAt : d?.emailedAt;
  const canEmail = !['job', 'pfnew'].includes(kind) && (kind === 'dn' || office()) && !p?.cancelledAt;
  const pfBtns = p && !p.cancelledAt ? `${p.paidOn ? `<button class="btn" type="button" data-pfmark="unpaid" data-pf="${p.id}">Not paid after all</button>`
      : `<button class="btn" type="button" data-pfmark="paid" data-pf="${p.id}">Mark paid</button><button class="btn" type="button" data-pfmark="cancel" data-pf="${p.id}">Cancel pro forma</button>`}` : '';
  $('doc').innerHTML = `<div class="docbar"><span>${kind === 'job' ? 'Print it for the job folder.' : kind === 'pfnew' ? 'Check it, then make the pro forma.' : sentAt ? `Emailed ${fmtTime(sentAt)}.` : 'Print it, or email it to the customer as a PDF.'}</span>${pfBtns}
      ${kind === 'soa' ? `<button class="btn" type="button" data-jobsheet="${jobId}">${icon('doc')}Job sheet</button>` : ''}
      ${canEmail ? `<button class="btn pri" type="button" data-emaildoc="${kind}" data-job="${jobId}" data-dnid="${despId || ''}">${icon('mail')}${sentAt ? 'Email again' : 'Email to customer'}</button>` : ''}
      <button class="btn" type="button" data-print>${icon('print')}Print</button><button class="btn" type="button" data-closedoc>Close</button></div>
    ${kind === 'job' ? sheetEditor(j) : kind === 'pfnew' ? pfEditor(j) : ''}
    <div class="paper">${docHtml(kind, jobId, despId)}</div>`;
  $('doc').hidden = false;
  document.body.classList.add('doc-open');
}

/* ---------- emailing documents: an Outlook draft with the PDF attached, never sent by the board ---------- */
// html2pdf's own renderer gave blank pages here, so: html2canvas draws the page, jsPDF makes the A4.
const PDF_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
let pdfLib;
function loadScript(src) {
  return new Promise((ok, no) => { const t = document.createElement('script'); t.src = src; t.onload = ok;
    t.onerror = () => no(new Error('Could not load the PDF maker. Check the internet connection and try again.')); document.head.append(t); });
}
function loadPdfLib() { pdfLib ??= Promise.all(PDF_LIBS.map(loadScript)).catch(e => { pdfLib = null; throw e; }); return pdfLib; }
/** The document as an A4 PDF (base64), split over pages if it is longer than one. */
async function pdfBase64(html) {
  await loadPdfLib();
  const el = document.createElement('div');
  el.className = 'paper pdf'; el.innerHTML = html;
  el.style.cssText = 'position:absolute;left:0;top:0;width:794px;max-width:none;box-shadow:none;border-radius:0;z-index:-1';
  document.body.append(el);
  try {
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
    if (!canvas.height) throw new Error('The PDF came out empty. Try again.');
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margin = 10, w = 210 - 2 * margin, pageH = 297 - 2 * margin;
    const pxPerMm = canvas.width / w, slice = Math.floor(pageH * pxPerMm);
    for (let y = 0, page = 0; y < canvas.height; y += slice, page++) {
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = Math.min(slice, canvas.height - y);
      part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, part.height / pxPerMm);
    }
    return pdf.output('datauristring').split(',')[1];
  } finally { el.remove(); }
}
async function emailDoc(kind, jobId, despId) {
  const j = job(jobId), d = kind === 'dn' ? j.despatches.find(x => x.id === despId) : null;
  const btn = document.querySelector('[data-emaildoc]'); if (btn) { btn.disabled = true; btn.textContent = 'Making the PDF…'; }
  try {
    const pf = kind === 'pf' ? S.pfs.find(x => x.id === despId) : null;
    const no = kind === 'soa' ? j.so : pf ? pf.pf : d.dn;
    const pdf = await pdfBase64(docHtml(kind, jobId, despId));
    // Delivery notes go to the customer's goods-in contact when the contact book has one.
    const goodsIn = kind === 'dn' ? mainPerson(j.customer, 'deliveries') : kind === 'pf' ? mainPerson(j.customer, 'orders') : null;
    const to = goodsIn?.email || j.contactEmail, who = goodsIn?.email ? goodsIn.name : j.contactName;
    const hello = who ? `Dear ${esc(who.split(' ')[0])},` : 'Hello,';
    const po = kind === 'dn' ? dnPo(j, d) : j.po;
    const ref = po ? ` (your order ${esc(po)})` : '';
    const html = pf
      ? `<p>${hello}</p><p>Thank you for your order${ref}. Please find attached pro forma invoice ${esc(pf.pf)} for ${gbp(pfTotal(pf), 2)} including VAT, for payment before dispatch.</p><p>Please use <b>${esc(pf.pf)}</b> as the payment reference. The VAT invoice follows when the goods are sent.</p><p>Kind regards,<br>${esc(S.me.name)}<br>Clarke Lane Engineering Ltd</p>`
      : kind === 'soa'
      ? `<p>${hello}</p><p>Thank you for your order${ref}. Please find attached our sales order acknowledgement ${esc(j.so)}.</p><p>Kind regards,<br>${esc(S.me.name)}<br>Clarke Lane Engineering Ltd</p>`
      : `<p>${hello}</p><p>Your goods for order ${esc(j.so)}${ref} have been dispatched. Please find attached delivery note ${esc(d.dn)}.</p><p>Kind regards,<br>${esc(S.me.name)}<br>Clarke Lane Engineering Ltd</p>`;
    const subject = pf ? `Pro forma invoice ${pf.pf} – order ${j.so}${j.po ? ' / ' + j.po : ''}` : kind === 'soa' ? `Sales order acknowledgement ${j.so}${j.po ? ' – your order ' + j.po : ''}` : `Delivery note ${d.dn} – order ${j.so}${po ? ' / ' + po : ''}`;
    const cc = pf ? S.officeSet?.accounts_email || '' : '';
    const link = await data.draftEmail({ to, cc, subject, html, fileName: `${no}.pdf`, pdfBase64: pdf });
    if (kind === 'soa') await data.markAckEmailed(jobId); else if (pf) await data.markProforma(pf.id, 'emailed'); else await data.markDespatch(despId, 'emailed');
    await reload(); showDoc(kind, jobId, despId);
    toast(`Draft ready in your Outlook Drafts${to ? ` to ${to}${goodsIn?.email ? (pf ? ' (orders contact, from the contact book)' : ' (goods in, from the contact book)') : ''}` : ' (no email address on the order: add one in Outlook)'}${cc ? `, copied to ${cc}` : ''}. Check it and press Send.`);
    if (link) window.open(link, '_blank', 'noopener');
  } catch (e) {
    toast(/Mail\.ReadWrite|consent|AADSTS65001/i.test(e.message) ? 'Emailing needs a one-off permission in Microsoft 365 (Mail.ReadWrite). Ask Gecko IT to grant it.' : e.message, null, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Email to customer'; }
  }
}
/** On a dispatch note: what is still to come on the order after this delivery, per part. */
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
function closeDoc() { S.poForm = null; $('doc').hidden = true; document.body.classList.remove('doc-open', 'viewing'); if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; } }

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
  $('preview-bar').hidden = !PREVIEW.on;
  if (PREVIEW.on) $('preview-bar').innerHTML = `<b>Preview</b> <span>${PREVIEW.jobs.length} open sales orders read from Xero, shown as jobs in this browser only. Nothing is saved and Xero is not changed. Processes are guessed from the descriptions; due dates are Xero's expiry dates.</span> <button class="btn sm" type="button" data-leavepreview>Leave preview</button>`;
  const kept = snapshotInputs();
  if (!office() && ['quotes', 'orders', 'customers', 'parts', 'xero'].includes(S.tab)) S.tab = 'floor';
  if (S.kiosk) { S.tab = 'floor'; if (location.hash !== '#floor') history.replaceState(null, '', '#floor'); }
  if (!office() && S.tab !== 'floor') S.tab = 'floor';   // the shop floor login only has the Shop floor screen (Philip, 19 Oct)
  document.body.classList.toggle('kiosk-mode', !!S.kiosk);
  renderTabs();
  $('err').hidden = !S.error;
  if (S.error) $('err').innerHTML = `<b>The board could not load.</b> ${esc(S.error)} <button class="btn sm" type="button" data-reload>Try again</button>`;
  for (const [k] of TABS) $('v-' + k).hidden = S.tab !== k;
  ({ home: () => { $('v-home').innerHTML = renderHome({ jobs: S.jobs, me: S.me, office: office(), md: md(), monthXero: monthXero(), editTarget: S.editTarget,
      debts: !S.xero || PREVIEW.on ? { off: true } : { list: debts(), err: S.debtErr, chases: S.chases || [] }, breakeven: Number(S.settings?.monthly_breakeven) || null, target: Number(S.settings?.monthly_target) || null, today: todayIso(), view: S.homeView,
      wonQuotes: S.quotesRaw ? (quotes() || []).filter(q => q.state === 'waiting').length + xeroWaiting().length : null,
      approval: !S.xero || PREVIEW.on ? { off: true } : S.inv ? awaitingApproval(S.jobs, S.inv) : { err: S.invErr, list: null } }, { esc, fmt, gbp }); },
    orders: renderOrders, map: renderMapTab, customers: renderCustomers, parts: renderParts, jobs: renderJobs, floor: renderFloor, quotes: renderQuotes, dispatch: renderDespatch, xero: renderXero, help: () => { if (!$('v-help').innerHTML) $('v-help').innerHTML = renderHelp(office()); } })[S.tab]();
  document.body.classList.toggle('on-floor', S.tab === 'floor');
  renderDrawer();
  restoreInputs(kept);
}
function fromHash() { const h = location.hash.slice(1) === 'despatch' ? 'dispatch' : location.hash.slice(1); if (TABS.some(([k]) => k === h)) S.tab = h; }
/* Kiosk mode: the shared shop floor screen stays on the Shop floor, full screen, with no header or tabs. Kept on this device. */
const fullscreen = on => { if (!document.fullscreenEnabled || on === !!document.fullscreenElement) return; (on ? document.documentElement.requestFullscreen() : document.exitFullscreen()).catch(() => {}); };
function setKiosk(on) {
  if (!on && !confirm('Leave kiosk mode? The header and tabs come back on this screen.')) return;
  S.kiosk = on; S.station = null; S.open = null; closeDoc();
  try { if (on) localStorage.setItem('clj.kiosk', '1'); else localStorage.removeItem('clj.kiosk'); } catch { /* this visit only */ }
  if (on) history.replaceState(null, '', '#floor');
  fullscreen(on); render(); window.scrollTo(0, 0);
}
// After a reload or Esc, the next tap puts the kiosk back to full screen (browsers only allow it from a tap).
document.addEventListener('click', e => { if (S.kiosk && !e.target.closest('[data-kiosk]')) fullscreen(true); }, true);
setInterval(() => { const c = $('fclock'); if (c) c.innerHTML = clockHtml(new Date()); }, 15000);
window.addEventListener('hashchange', () => { fromHash(); render(); nudge(); });

/* The shop floor screen is shared: two minutes untouched, it goes back to the station tiles. */
let idleT;
function nudge() {
  clearTimeout(idleT);
  // The shared factory screen only: an office user's half-done drawer is never closed under them.
  idleT = setTimeout(() => { if (S.tab !== 'floor' || (office() && !S.kiosk) || (S.station == null && S.open == null && $('doc').hidden)) return; closeDoc(); S.station = null; S.open = null; S.ask = null; render(); window.scrollTo(0, 0); }, 120000);
}
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, nudge, { passive: true }));
nudge();

/* ---------- Back: every change of screen is a step that the browser's Back, and ← Back, undoes ---------- */
const navOf = () => ({ v: 1, tab: S.tab, open: S.open ?? null, homeView: S.homeView ?? 'attention', station: S.station ?? null, wonView: S.wonView ?? 'waiting',
  dispView: S.dispView ?? null, orderView: S.orderView ?? null, desp: S.desp ?? null, form: !!S.form });
const sameNav = (a, b) => ['tab', 'open', 'homeView', 'station', 'wonView', 'dispView', 'orderView', 'desp', 'form'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null));
function navPush() {
  if (sameNav(navOf(), history.state)) return;
  history.pushState({ ...navOf(), i: (history.state?.i || 0) + 1 }, '', '#' + S.tab); renderBack();
}
function renderBack() { const b = $('backrow'); if (b) b.hidden = S.tab === 'home' || !(history.state?.i > 0); }   // Home is the start: no Back there (Philip, 20 Oct)
window.addEventListener('popstate', e => {
  const n = e.state;
  if (!n?.v) { fromHash(); render(); renderBack(); return; }
  if (S.form && !n.form && !confirm('Leave this order? What you have typed is not saved.')) { history.pushState({ ...navOf(), i: (n.i || 0) + 1 }, '', '#' + S.tab); return; }
  Object.assign(S, { tab: n.tab, open: n.open, station: n.station, desp: n.desp, ask: null, cancelDn: null });
  for (const k of ['homeView', 'wonView', 'dispView', 'orderView']) if (n[k] != null) S[k] = n[k];
  if (!n.form) S.form = null;
  closeDoc(); keepInputs = false; render(); renderBack(); window.scrollTo(0, 0);
});
/** Close the order panel: a step back when opening it was the last step, so Back doesn't reopen it. */
function closeOpen() {
  if (history.state?.open === S.open && history.state?.i > 0) return history.back();
  S.open = null; render(); history.replaceState({ ...navOf(), i: history.state?.i || 0 }, '', '#' + S.tab);
}
document.addEventListener('click', e => {
  const before = navOf();
  onClick(e);
  if (!sameNav(before, navOf())) navPush();
});

function onClick(e) {
  if (e.target.closest('[data-grip]')) return;        // dragging, not opening the row
  const pick = e.target.closest('.duepick');
  if (pick) {                                          // the due date: open the date picker, not the row
    const inp = pick.querySelector('input[type=date]');
    if (e.target !== inp) { try { inp.showPicker(); } catch { inp.focus(); } }
    return;
  }
  const t = e.target.closest('button,a,tr[data-open]'); if (!t) return;
  const d = t.dataset;
  if ('goback' in d) return history.back();
  if ('preview' in d) return enterPreview();
  if (d.cust) { S.cust = d.cust; S.custName = null; S.bookEdit = null; return render(); }
  if ('addperson' in d) { S.bookEdit = { kind: 'person', role: 'orders', main: false }; return render(); }
  if ('addsite' in d) { S.bookEdit = { kind: 'site', main: false }; return render(); }
  if (d.editperson) { S.bookEdit = { kind: 'person', ...S.book.people.find(p => p.id === +d.editperson) }; return render(); }
  if (d.editsite) { S.bookEdit = { kind: 'site', ...S.book.sites.find(x => x.id === +d.editsite) }; return render(); }
  if ('bookcancel' in d) { S.bookEdit = null; return render(); }
  if (d.delperson) return data.deletePerson(+d.delperson).then(reload).then(() => toast('Removed.')).catch(err => toast(err.message, null, true));
  if (d.delsite) return data.deleteSite(+d.delsite).then(reload).then(() => toast('Removed.')).catch(err => toast(err.message, null, true));
  if ('fromxerobook' in d) return copyXeroToBook();
  if ('booksave' in d) return saveFormToBook();
  if ('leavepreview' in d) return leavePreview();
  if (d.gostation) { S.station = d.gostation; S.tab = 'floor'; render(); window.scrollTo(0, 0); return; }
  if (t.matches('a[href^="#help-"]')) { e.preventDefault(); document.querySelector(t.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if ('signin' in d) return auth.signIn();
  if ('signout' in d) { try { sessionStorage.removeItem('clj.monthx'); } catch { /* none */ } return auth.signOut(); }   // Levi's figures leave with him
  if ('reload' in d) return location.reload();
  if (d.homeview) {   // the switch is remembered; a card's list is just for now, and scrolls into view
    S.homeView = d.homeview;
    if (['attention', 'out'].includes(d.homeview)) { try { localStorage.setItem('clj.homeview', d.homeview); } catch { /* not kept */ } return render(); }
    render(); $('home-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  if (d.dispview) { S.dispView = d.dispview; S.dispChosen = true; if (S.tab !== 'dispatch') { S.tab = 'dispatch'; window.scrollTo(0, 0); } return render(); }
  if (d.orderview) { S.orderView = d.orderview; try { localStorage.setItem('clj.orderview', d.orderview); } catch { /* not kept */ } return render(); }
  if (d.wondrill) return wonDrill(d.wondrill, d.key);
  if (d.wonlines) { S.wonOpen = S.wonOpen === d.wonlines ? null : d.wonlines; return render(); }
  if (d.wonview) { S.wonView = d.wonview; try { localStorage.setItem('clj.wonview', d.wonview); } catch { /* not kept */ } return render(); }
  if (d.tab) { e.preventDefault(); S.tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.proc) { e.stopPropagation(); return toggleProc(+d.job, d.proc); }
  if ('jobsort' in d) { S.jobSort = S.jobSort === 'value' ? null : 'value'; return render(); }
  if ('edittarget' in d) { S.editTarget = d.edittarget !== 'close'; render(); if (S.editTarget) $('be-in')?.focus(); return; }
  if (d.move) { e.stopPropagation(); return moveJob(+d.job, d.move, boardVisible()); }
  if (d.smove) { e.stopPropagation(); if (!office()) return; return moveAtStation(+d.job || 0, d.smove); }
  if (d.stage) { S.stage = d.stage; S.stageChosen = true; return render(); }
  if (d.station) { S.station = d.station; render(); window.scrollTo(0, 0); return; }
  if (d.stations) { S.station = null; render(); window.scrollTo(0, 0); return; }
  if (d.kiosk) return setKiosk(d.kiosk === 'on');
  if (d.mapstop) return focusStop(d.mapstop);
  if ('mapfit' in d) return fitAll();
  if (d.open) { S.open = +d.open; S.ask = null; keepInputs = false; return render(); }
  if ('neworder' in d) return openOrderForm();
  if (d.amend) return openAmend(+d.amend);
  if (d.repeat) return openRepeat(+d.repeat);
  if (d.ask) { S.ask = { id: +d.job, what: d.ask }; return render(); }
  if ('noask' in d) { S.ask = null; return render(); }
  if (d.status) return setStatus(+d.job, d.status);
  if (d.confirmdelete) return deleteOrder(+d.confirmdelete);
  if ('oladd' in d) { collectForm(); S.form.lines.push(blankLine(S.form.due)); keepInputs = false; return render(); }
  if (d.oldel) { collectForm(); S.form.lines.splice(+d.oldel, 1); keepInputs = false; return render(); }
  if ('olsplit' in d) return splitLines();
  if ('olcancel' in d) { const back = S.form.jobId; S.form = null; if (back) S.open = back; return render(); }
  if ('close' in d) return closeOpen();
  if (d.start) { keepInputs = false; return startConvert(+d.start); }
  if ('reloadquotes' in d) { S.quotesRaw = null; render(); return loadQuotes(); }
  if (d.xdismiss) return dismissXero(d.xdismiss, true);
  if (d.xrestore) return dismissXero(d.xrestore, false);
  if (d.dismiss) return dismiss(+d.dismiss);
  if (d.restore) return restore(+d.restore);
  if (d.soa) return showDoc('soa', +d.soa);
  if (d.jobsheet) return openJobSheet(+d.jobsheet);
  if (d.drawing) return showDrawing(+d.job, +d.drawing);
  if (d.ponew) return openPoForm(+d.ponew);
  if (d.pob2b) return backToBackPo(+d.pob2b);
  if (d.chase) return chaseDebt(d.chase);
  if (d.hintadd) return addHinted(+d.hintadd);
  if (d.keeppart) return keepForPart(+d.keeppart);
  if (d.partadd) { S.partAdd = d.partadd === 'open' ? {} : null; render(); if (S.partAdd) $('pa-cust')?.focus(); return; }
  if (d.partopen) { e.stopPropagation(); S.partOpen = S.partOpen === +d.partopen ? null : +d.partopen; return render(); }
  if (d.partview) { const x = partOfFile(+d.partview); if (!x) return; const w = window.open('', '_blank');
    return data.drawingBlob(x.file).then(b => { const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; }, er => { w?.close(); toast(er.message, null, true); }); }
  if (d.partrmfile) return removePartDrawing(+d.partrmfile);
  if (d.partdel) return removePart(+d.partdel);
  if (d.hintclose) { delete S.hints[+d.hintclose]; return render(); }
  if (d.readdrawing) { const j = job(+d.job), f = j?.files.find(x => x.id === +d.readdrawing); if (!f) return;
    S.hints = { ...(S.hints || {}), [j.id]: { name: f.name, busy: true } }; render();
    return data.drawingBlob(f).then(b => readDrawingFile(j.id, f.name, b), e => { S.hints[j.id] = { name: f.name, err: e.message }; render(); }); }
  if ('poadd' in d) { collectPo(); S.poForm.lines.push(blankPoLine()); return showPoForm(); }
  if (d.podel) { collectPo(); S.poForm.lines.splice(+d.podel, 1); return showPoForm(); }
  if ('pofill' in d) { collectPo(); const j = job(S.poForm.jobId); S.poForm.lines = [...S.poForm.lines.filter(l => l.description.trim()), ...j.lines.map(l => ({ description: l.part, qty: String(left(j, l) || l.qty), unit: '' }))]; return showPoForm(); }
  if ('pocreate' in d) return createPo();
  if (d.rmdrawing) return removeDrawingFrom(+d.rmdrawing);
  if (d.pfnew) return openProformaDraft(+d.pfnew);
  if (d.pfview) return showDoc('pf', +d.job, +d.pfview);
  if (d.pfcreate) return createProforma(+d.pfcreate);
  if (d.pfmark) return markPf(+d.pf, d.pfmark);
  if (d.pfset) { S.pfSettings = d.pfset === 'open'; return showDoc('pfnew', S.pfDraft.jobId); }
  if (d.sqset) return setSheet(d.sqset);
  if (d.dn) return showDoc('dn', +d.job, +d.dn);
  if ('despclose' in d) { S.desp = null; keepInputs = false; return render(); }
  if (d.desp) { S.desp = +d.desp; S.open = null; keepInputs = false; S.tab = 'dispatch'; render(); return showDespForm(); }
  if ('print' in d) return window.print();
  if (d.emaildoc) return emailDoc(d.emaildoc, +d.job, +d.dnid || null);
  if (d.undeliver) return markDelivery(+d.undeliver, 'undelivered');
  if (d.cancdn) { S.cancelDn = +d.cancdn; return render(); }
  if ('cancdnno' in d) { S.cancelDn = null; return render(); }
  if (d.cancdnyes) return cancelDispatchNote(+d.cancdnyes);
  if ('closedoc' in d) return closeDoc();
  if (t.id === 'mkdn') return makeDespatch();
  if (d.xero) return xeroAction(d.xero);
  if (d.fromxero) return makeJobFromXero(d.fromxero);
  if ('sendxero' in d) return sendToXero();
  if ('xcreload' in d) return loadXeroContacts(true).then(() => (S.xcErr || S.xc) && toast(S.xcErr || `Read ${S.xc.contacts.length} customers from Xero.`, null, !!S.xcErr));
  if (d.xcchange) { S.forcePick.add(d.xcchange); return render(); }
}
$('scrim').addEventListener('click', () => closeOpen());
$('doc').addEventListener('click', e => { if (e.target.id === 'doc') closeDoc(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('doc').hidden) closeDoc(); else if (S.open) closeOpen(); } });
document.addEventListener('input', e => {
  if (e.target.dataset.pq && S.pfDraft) {   // pro forma quantities: redraw the preview, keep the box being typed in
    const j = job(S.pfDraft.jobId), l = j?.lines.find(x => x.id === +e.target.dataset.pq);
    S.pfDraft.qty[+e.target.dataset.pq] = Math.max(0, Math.min(l?.qty ?? 0, Math.floor(Number(e.target.value) || 0)));
    document.querySelector('#doc .paper').innerHTML = docHtml('pfnew', S.pfDraft.jobId);
    return;
  }
  if (e.target.dataset.sq && S.sheet) {   // job sheet quantities: redraw the sheet, keep the box being typed in
    S.sheet.qty[+e.target.dataset.sq] = Math.max(0, Math.floor(Number(e.target.value) || 0));
    document.querySelector('#doc .paper').innerHTML = docHtml('job', S.sheet.jobId);
    return;
  }
  if (e.target.id === 'psearch') { S.psearch = e.target.value; const pos = e.target.selectionStart; renderParts(); const el = $('psearch'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'csearch') { S.csearch = e.target.value; const pos = e.target.selectionStart; renderCustomers(); const el = $('csearch'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (['search', 'osearch', 'dsearch'].includes(e.target.id)) {
    const id = e.target.id; S[id] = e.target.value; const pos = e.target.selectionStart;
    if (id === 'search') renderJobs(); else if (id === 'dsearch') render(); else { if (S.form) collectForm(); renderOrders(); }
    const el = $(id); el.focus(); el.setSelectionRange(pos, pos);
  }
  const m = /^of-(qty|price)(\d+)$/.exec(e.target.id);
  const pm = /^of-part(\d+)$/.exec(e.target.id);
  if (pm && S.form) {   // a part picked from the list brings its price, unless a price is already typed
    const hit = formParts(S.form).find(x => x.part === e.target.value);
    const price = $('of-price' + pm[1]);
    if (hit && hit.price != null && price && !price.value) {
      price.value = String(hit.price); collectForm();
      if ($('of-net' + pm[1])) $('of-net' + pm[1]).textContent = gbp(lineNet(S.form.lines[+pm[1]]), 2);
      $('of-tot').innerHTML = formTotals(S.form.lines);
    }
  }
  if (m && S.form) {   // keep line nets and the order total current while typing
    collectForm();
    const i = +m[2]; if ($('of-net' + i)) $('of-net' + i).textContent = gbp(lineNet(S.form.lines[i]), 2);
    $('of-tot').innerHTML = formTotals(S.form.lines);
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.xcpick !== undefined) { pickContact(e.target.dataset.xcpick, e.target.value); return; }
  if (e.target.id === 'po-copy' && S.poForm && e.target.value) { collectPo(); copyPo(+e.target.value); return; }
  if (e.target.id === 'po-acc' && S.poForm) { collectPo(); showPoForm(); if (S.poForm.account === 'other') $('po-acc2')?.focus(); return; }
  if (e.target.dataset.sendpick) { S.sendPick[+e.target.dataset.sendpick] = e.target.checked; render(); return; }
  if (e.target.id === 'dsel') { S.desp = +e.target.value || null; keepInputs = false; render(); showDespForm(); }
  if (e.target.id === 'of-cust') customerPicked(e.target.value.trim());
  if (e.target.name === 'of-p' && S.form) S.form.procsTouched = true;
  // Same part made before: tick the processes it had then, until someone ticks by hand.
  if (/^of-part\d+$/.test(e.target.id) && S.form && !S.form.procsTouched && !S.form.spQuoteId && S.form.mode !== 'amend') {
    collectForm(); const n = S.form;
    const hits = n.lines.map(l => processesFromHistory(S.jobs, l.part)).filter(Boolean);
    if (hits.length) {
      n.procs = PROCESSES.filter(p => n.procs.includes(p) || hits.some(h => h.processes.includes(p)));
      n.procNote = `Ticked as on ${[...new Set(hits.map(h => h.so))].join(', ')} (the same part made before); check them.`;
      keepInputs = false; render();
    }
  }
  if (e.target.id === 'of-site' && S.form) { const x = S.book.sites.find(y => y.id === +e.target.value); if (x) { collectForm(); S.form.address = x.address; keepInputs = false; render(); } }
  if (e.target.id === 'of-contact' && S.form) { const p = bookFor(S.form.customer).people.find(y => y.name === e.target.value.trim()); if (p?.email && $('of-email')) $('of-email').value = p.email; }
  if (e.target.dataset.partattach) { const fl = e.target.files[0]; e.target.value = ''; attachPartDrawing(+e.target.dataset.partattach, fl); return; }
  if (e.target.dataset.attach) { const fs = [...e.target.files]; e.target.value = ''; attachDrawings(+e.target.dataset.attach, fs); return; }
  if (e.target.dataset.setdue) { setDue(+e.target.dataset.setdue, e.target.dataset.from, e.target.value); return; }
  if (e.target.dataset.mapkind) { S.mapShow[e.target.dataset.mapkind] = e.target.checked; render(); }
  if (e.target.id === 'mapmiles') { S.mapMiles = +e.target.value; render(); }
});
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  if ('orderform' in f.dataset) return submitOrder();
  if ('partform' in f.dataset) return savePart(f);
  if ('pfsettings' in f.dataset) return savePfSettings();
  if ('targetform' in f.dataset) {
    const num = id => { const v = $(id).value.trim(); return v === '' ? null : Math.round(Number(v)); };
    const be = num('be-in'), tg = num('target-in');
    if ([be, tg].some(v => v != null && !(v > 0)) || (be == null && tg == null)) return toast('Type the figures in pounds, for example 65000.', null, true);
    if (be && tg && tg < be) return toast('The ideal target should be above break-even.', null, true);
    try {
      await Promise.all([data.saveSetting('monthly_breakeven', be), data.saveSetting('monthly_target', tg)]);
      S.settings = { ...S.settings, monthly_breakeven: be, monthly_target: tg }; S.editTarget = false;
      toast('Saved. The same figures apply every month.');
    } catch (err) { toast(err.message, null, true); }
    return render();
  }
  if (f.dataset.bookform) return saveBookForm(f.dataset.bookform);
  if ('addcust' in f.dataset) { const v = $('newcust').value.trim(); if (!v) return; S.cust = normName(v); S.custName = v; S.bookEdit = null; return render(); }
  if (f.dataset.deliver) return markDelivery(+f.dataset.deliver, 'delivered', f.querySelector('input').value.trim());
  if (f.dataset.inv) {
    const no = f.querySelector('input').value.trim(); if (!no) return;
    try { await data.markInvoiced(+f.dataset.inv, no); toast(`Recorded as ${no}.`); } catch (err) { toast(err.message, null, true); }
    reload();
  }
});

boot();
