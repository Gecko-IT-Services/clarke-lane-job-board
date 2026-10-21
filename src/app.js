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
import { normPartNo, currentFile, drawingsToLink, findPart, ordersForPart, suggestedParts, openOrdersNeeding, partsOnJob, lineNumbers } from './core/parts.js';
import { OUT_PROCESSES, outNow, outBoard, itemsFor, finishFor, defaultDueBack, suppliersUsed, checkSend } from './core/outwork.js';
import { renderHelp } from './help.js';
import { renderHome } from './home.js';
import { icon, XERO, MICROSOFT } from './icons.js';
import { renderWon } from './won.js';
import { startWave, endWave } from './wave.js';
import { renderBoard } from './board.js';
import { renderShopFloor, clockHtml } from './floor.js';
import { renderTv } from './tv.js';
import { notesPanel, floorNotesBox } from './notes.js';
import { newNotes } from './core/notes.js';
import { renderMetal } from './metal.js';
import { renderSales } from './sales.js';
import { renderReorders } from './reorders.js';
import { reorderRound, reorderTally, roundNudge, reorderNote, snoozeNote, SNOOZE_FOR } from './core/reorders.js';
import { renderIdeas } from './ideas.js';
import { ideasFacts, websiteGuess, ideaBoard } from './core/ideas.js';
import { renderToday, taskForm, renderEnquiries, renderCustomerPage } from './customer.js';
import { renderDigest } from './digest.js';
import { digestPicks, samePicks, fallbackLine, digestFacts } from './core/digest.js';
import { packFacts, cleanPack, quotePackText, docMediaType } from './core/quotepack.js';
import { renderFilesTab, foundDrawingsHtml, certsHtml, quoteHistWords } from './spfiles.js';
import { customerFolders, quoteHistory, foundDrawings, drawingsFor, gradesOnJob, certFolders } from './core/spfiles.js';
import { CONFIG } from './config.js';
import { searchAll } from './core/search.js';
import { newDispatches } from './core/mood.js';
import { mailTerms, customerIndex, whoIs, sortEmail, emailCustomer, plainText, worthReading, enquiryList, enquiryFunnel, taskGroups, reordersDue, couldBuyMore, timeline, trendWords, morning, domainOf } from './core/crm.js';
import { linkEmail, emailActions, sortEmails, emailTaskTitle, needTopic, cleanTopic, ASKED } from './core/inbox.js';
import { winStats, pipeline, chaseList, monthGap, customerBase, quietCustomers, customerFacts, quoteChaseEmail, aiEmailHtml, quoteValue } from './core/sales.js';
import { rfqRef, lineText, checkRfq, rfqEmail } from './core/metal.js';
import { renderSalesOrders } from './orders.js';
import { renderDispatch } from './dispatch.js';
import { renderDeliveries, signaturePad } from './deliveries.js';
import { deliveryRuns, deliveryProblem, signatureOk } from './core/deliveries.js';
import { drawMap, focusStop, fitAll, KINDS } from './map.js';
import { postcodeOf } from './core/geo.js';
import { dashboard, dispatchLists, partSuggestions, partMatches, lineLabel, lineHtml, xeroLineFields, emailList, invoiceIdsToCheck, awaitingApproval, SETTLED, homeGaps } from './core/jobs.js';
import { PROCESSES, SHORT, sent, left, needed, doneCount, allDone, value, despatchValue, stage, nextDue,
  lastDespatch, calloffDates, defaultDespatchQty, suggestProcesses, describeLine, unitPrice, round2,
  addWorkingDays, quoteStates, repeatLines, poSuggestions, backToBackLines, xeroLinePart, missingLineCodes, deliveryDates, deliveryLabel, despatchStatus, invoiceStatus, splitIntoCalloffs,
  byRunningOrder, partsLeft, moveInOrder, nextStep, floorQueue, moveInStation, lineProcs } from './core/jobs.js';

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
  station: null, open: null, conv: null, desp: null, dispView: 'ready', dispChosen: false, dsearch: '', error: null, busy: false,
  dpick: null, sig: '', dsign: {} };   // the driver's screen: the note tapped, its signature so far (a PNG data URL), its form
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
    // Work sent out (powder coat, plating): everyone, the shop floor included. A missing table just means none yet.
    S.outwork = await data.loadOutwork().then(r => { S.outErr = null; return r; }).catch(e => { S.outErr = e.message; return S.outwork || []; });
    // Notes on jobs: everyone, the shop floor included.
    S.notes = await data.loadNotes().catch(() => S.notes || []);
    if (md()) S.settings = await data.loadSettings().catch(() => S.settings || {});
    if (office()) [S.pfs, S.officeSet, S.pos] = await Promise.all([data.loadProformas().catch(() => S.pfs || []), data.loadOfficeSettings().catch(() => S.officeSet || {}),
      data.loadPurchaseOrders().catch(() => S.pos || [])]);
    if (office()) [S.tasks, S.enq, S.staff] = await Promise.all([data.loadTasks().catch(e => { S.tasksErr = e.message; return S.tasks || []; }),
      data.loadEnquiries().catch(e => { S.enqErr = e.message; return S.enq || []; }), S.staff ? S.staff : data.loadStaff().catch(() => [])]);
    if (office()) S.salesActs = await data.loadActions().catch(() => S.salesActs || []);
    if (office()) S.metal = await data.loadMetal().then(r => { S.metalErr = null; return r; }).catch(e => { S.metalErr = e.message; return S.metal || []; });
    if (office()) [S.chases, S.parts] = await Promise.all([data.loadChases().catch(() => S.chases || []), data.loadParts().catch(e => { S.partsErr = e.message; return S.parts || []; })]);
    S.error = null;
  } catch (e) { S.error = e.message; }
  render();
  loadInvoiceStatus();
  loadMonthSales();
  loadDebts();
  if (office() && !S.enqStarted) { S.enqStarted = true; syncEnquiries(); }   // info@: then every 15 minutes
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
      // QuoteLines has no part number column: Part no. stays empty for Mandy to fill rather than guessed.
      // One form line per quote line, so each is ticked from its own quote line (22 Oct); carriage gets the lot.
      lines: lines.map(l => ({ partNo: '', part: describeLine(l), qty: String(l.qty), price: String(unitPrice(l.sellTotal, l.qty)), due, procs: suggestProcesses([l]) }))
        .concat(q.carriage > 0 ? [{ partNo: '', part: 'Carriage', qty: '1', price: String(q.carriage), due }] : []) });
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
/** signature, note: from the driver's screen. phone: true when saved there (its own message). Returns whether it saved. */
async function markDelivery(id, what, receivedBy = '', signature = '', note = '', phone = false) {
  let ok = false;
  try {
    await data.markDespatch(id, what, receivedBy, signature, note); ok = true;
    toast(what === 'delivered' ? (phone ? 'Delivered. Mandy will see it on Waiting for Xero.' : 'Marked delivered. It is now waiting for Xero.') : 'Set back to out for delivery.',
      what === 'delivered' ? () => markDelivery(id, 'undelivered') : null);
  }
  catch (e) { toast(e.message, null, true); }
  await reload();
  return ok;
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
const TABS = [['home', 'Home'], ['quotes', 'Won quotes'], ['orders', 'Sales orders'], ['jobs', 'Jobs'], ['floor', 'Shop floor'], ['dispatch', 'Dispatch'], ['map', 'Map'], ['customers', 'Customers'], ['parts', 'Parts'], ['xero', 'Xero'], ['help', 'Help'], ['sales', 'CRM'], ['tv', 'TV board'], ['metal', 'Metal prices'], ['deliveries', 'Deliveries']];   // CRM (was Sales) last (Levi, 21 Oct)   // left to right, the order work flows
/** Open jobs with every process ticked and something still to send, in the running order. */
const readyToDispatch = () => S.jobs.filter(j => onBoardStage(j) && j.status === 'open' && allDone(j)).sort(byRunningOrder);
function renderTabs() {
  const ready = (quotes() || []).filter(q => q.state === 'waiting').length;
  const toXero = S.jobs.reduce((a, j) => a + j.despatches.filter(d => !d.xero && d.deliveredOn).length, 0);
  // Map lives under Dispatch, Customers under CRM (Philip, 21 Oct), Parts and Metal under Sales orders; their parent tab stays lit.
  const lit = { map: 'dispatch', customers: 'sales', parts: 'orders', metal: 'orders', deliveries: 'dispatch' }[S.tab] || S.tab;
  $('tabs').hidden = !office();   // the shop floor login sees only its own screen, so no tabs
  $('tabs').innerHTML = !office() ? '' : TABS.filter(([k]) => !['map', 'customers', 'parts', 'tv', 'metal', 'deliveries'].includes(k)).map(([k, t]) => {
    const b = k === 'quotes' ? ready + xeroWaiting().length : k === 'dispatch' && office() ? toXero : k === 'xero' ? xeroWaiting().length : 0;
    const go = k === 'dispatch' ? readyToDispatch().length : 0;
    return `<a href="#${k}" data-tab="${k}" ${lit === k ? 'aria-current="page"' : ''}>${k === 'xero' ? XERO : icon({ quotes: 'won', dispatch: 'truck', sales: 'book' }[k] || k) + t}${go ? `<span class="badge go" title="${go} ready to dispatch">${go} ready</span>` : ''}${b ? `<span class="badge" title="${k === 'dispatch' ? 'Delivered, waiting for Xero' : ''}">${b}</span>` : ''}</a>`;
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
  $('v-orders').innerHTML = renderSalesOrders({ selected: S.sel || (S.sel = new Set()), jobs: S.jobs, md: md(), today: todayIso(), view: S.orderView, search: S.osearch, form: S.form ? orderForm() : '' },
    { esc, fmt, gbp, dueChip, match: orderMatch });
}
/* ---------- the sales order form (Sage: New / Amend), for quotes, Xero orders, phone orders and Sage carry-over ---------- */
const blankLine = (due, procs = []) => ({ partNo: '', part: '', qty: '', price: '', due: due || '', procs: [...procs] });
/** The order's processes: every process any of its lines needs, in Levi's order. */
const unionProcs = lines => PROCESSES.filter(p => lines.some(l => (l.procs || []).includes(p)));
function openOrderForm(prefill = {}, amendId = null) {
  const due = prefill.due || addWorkingDays(todayIso(), 10);
  S.form = { mode: amendId ? 'amend' : 'new', jobId: amendId, so: '', customer: '', po: '', contact: '', contactEmail: '',
    address: '', notes: '', due, lines: [blankLine(due)], procs: [], xeroQuoteId: null, spQuoteId: null, quoteNo: '', from: '', ...prefill };
  // Processes are ticked per line (Levi, 22 Oct); a prefill's order-wide procs go on every line without their own.
  S.form.lines = S.form.lines.map(l => ({ ...l, procs: [...(l.procs ?? S.form.procs ?? [])] }));
  S.form.procs = unionProcs(S.form.lines);
  S.open = null; S.tab = 'orders'; keepInputs = false; render(); window.scrollTo(0, 0);
  if (S.xero && !S.xc && !S.xcErr) loadXeroContacts();
  if (S.xero && !S.xitems && !S.xitemsErr) loadXeroItems();
}
/** Xero's Products and services, read once per visit for the Part box. Not fatal: the board's own parts still show. */
let xitemsLoading = false;
async function loadXeroItems(fresh) {
  if (xitemsLoading) return; xitemsLoading = true;
  S.xitemsErr = null;
  try { const r = await data.xero('items', { fresh: !!fresh }); S.xitems = r.items || []; S.xitemsTotal = r.total ?? S.xitems.length; }
  catch (e) { S.xitems = []; S.xitemsErr = e.message; }
  xitemsLoading = false;
  if (S.form) { collectForm(); keepInputs = false; render(); } else if (S.tab === 'xero') render();
}
// Worked out once per change of its inputs, not on every redraw or key press (thousands of Xero products).
let partsMemo = null;
const formParts = n => {
  const k = [S.jobs, S.xitems, S.parts, n.customer];
  if (!partsMemo || partsMemo.k.some((x, i) => x !== k[i])) partsMemo = { k, v: partSuggestions(S.jobs.filter(j => !j.preview), S.xitems || [], n.customer, S.parts || []) };
  return partsMemo.v;
};
const partOptions = ps => ps.map(x => `<option value="${esc(x.part)}">${x.from === 'xero' ? 'Xero product' : !x.so ? 'in Parts' : x.from === 'customer' ? `${esc(x.so)}, ${fmt(x.date)}` : `ordered by others, ${esc(x.so)}`}${x.price != null ? ' · ' + gbp(x.price, 2) : ''}</option>`).join('');
/** PO(s) for one dispatch note: its lines' own call-off POs, else the order's PO. */
const dnPo = (j, d) => dispatchPo(j.po, j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => l.po));
const linePos = j => [...new Set(j.lines.map(l => l.po).filter(Boolean))];
const orderMatch = (j, q) => [j.so, j.customer, j.po, j.quote, ...linePos(j)].some(s => (s || '').toLowerCase().includes(q));
const jobMatch = (j, q) => orderMatch(j, q) || j.lines.some(l => lineLabel(l).toLowerCase().includes(q) || (l.partNo || '').toLowerCase().includes(q));
/** Sage-style "copy order": a new order from an old one. New number, new PO, dates moved forward. */
function openRepeat(id) {
  const j = job(id);
  const due = addWorkingDays(todayIso(), 10);
  openOrderForm({ from: `repeat of ${j.so}`, repeatOf: j.so, customer: j.customer, contact: j.contactName, contactEmail: j.contactEmail || '',
    address: j.address, notes: j.notes, due, procs: needed(j), lines: repeatLines(j.lines.map(l => ({ ...l, procs: lineProcs(j, l) })), due) });
  toast(`Copied from ${j.so}. Enter the new customer order no., and check the prices and dates are still right.`);
}
function openAmend(id) {
  const j = job(id);
  openOrderForm({ so: j.so, customer: j.customer, po: j.po, contact: j.contactName, contactEmail: j.contactEmail || '', address: j.address, notes: j.notes,
    due: nextDue(j), procs: needed(j),
    lines: j.lines.map(l => ({ id: l.id, partNo: l.partNo || '', part: l.part, qty: String(l.qty), price: String(l.price), due: l.due, po: l.po || '', sent: sent(j, l), procs: lineProcs(j, l) })) }, id);
}
/** Copy what is typed into S.form, so adding, removing or splitting lines keeps everything else. */
function collectForm() {
  const n = S.form, v = id => $(id)?.value ?? '';
  Object.assign(n, { so: v('of-so'), customer: v('of-cust') || n.customer, po: v('of-po'), contact: v('of-contact'), contactEmail: v('of-email'), address: v('of-addr'),
    due: v('of-due') || n.due, notes: v('of-notes') });
  const ticked = $('of-ptable') ? [...document.querySelectorAll('input[name=of-lp]:checked')] : null;
  n.lines = n.lines.map((l, i) => ({ ...l, partNo: v('of-pno' + i), part: v('of-part' + i), qty: v('of-qty' + i), price: v('of-price' + i), due: v('of-ldue' + i), po: v('of-lpo' + i),
    procs: ticked ? PROCESSES.filter(p => ticked.some(x => x.dataset.line === String(i) && x.value === p)) : [...(l.procs || [])] }));
  n.procs = unionProcs(n.lines);
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
  // Two boxes, as in Xero and Sage (Mandy, 22 Oct): Part no. (optional) and Description (required). Both offer the
  // same list; picking from either fills both.
  const rows = n.lines.map((l, i) => `<tr><td><input type="text" class="mono pno" id="of-pno${i}" value="${esc(l.partNo || '')}" placeholder="optional" list="of-parts" autocomplete="off" aria-label="Part no., line ${i + 1}"></td>
    <td><input type="text" id="of-part${i}" value="${esc(l.part)}" placeholder="Description and spec: type to pick from the list" list="of-parts" autocomplete="off" aria-label="Description, line ${i + 1}"></td>
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
      <label class="fl">Contact email<input type="text" inputmode="email" id="of-email" value="${esc(n.contactEmail)}" placeholder="Several? Separate with commas" autocomplete="off"></label></div>
    ${bookFor(n.customer).sites.length > 0 ? `<label class="fl">Saved delivery addresses<select class="f" id="of-site"><option value="">Choose one to fill in the address…</option>${bookFor(n.customer).sites.map(x => `<option value="${x.id}">${esc(x.label || x.address.split('\n')[0])}${x.main ? ' (usual)' : ''}</option>`).join('')}</select></label>` : ''}
    <div class="row2"><label class="fl">Delivery address<textarea id="of-addr" rows="3" placeholder="Leave blank to deliver to the customer's usual address">${esc(n.address)}</textarea></label>
      <label class="fl">Promised delivery<input type="date" id="of-due" value="${esc(n.due)}" data-was="${esc(n.due)}"><span class="note">Changing it moves the lines on the same date (not yet dispatched) with it, and new lines get it.</span></label></div>
    <div style="overflow-x:auto"><table class="lines njlines"><thead><tr><th title="The customer's part number, if it has one. Parts and the drawings use it first.">Part no.</th><th>Description</th><th>Qty</th><th>Unit price (£)</th><th>Due</th><th title="Only if the customer sent a separate PO for this delivery. Blank = the order's PO.">Call-off PO</th><th>Net</th>${amend ? '<th>Dispatched</th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="actions"><button class="btn sm" type="button" data-oladd>Add a line</button>
      <details class="splitter"><summary class="btn sm">Split into call-offs…</summary>
        <div class="row3"><label class="fl">Deliveries<input type="number" id="of-sn" min="2" max="24" value="${esc(n.splitN || 4)}"></label>
          <label class="fl">How often<select class="f" id="of-se">${[['7', 'Weekly'], ['14', 'Every 2 weeks'], ['m', 'Monthly']].map(([v, t]) => `<option value="${v}" ${n.splitEvery === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="fl">First delivery<input type="date" id="of-sf" value="${esc(n.splitFrom || n.due)}"></label></div>
        <p class="note">Each line becomes one line per delivery, with the quantity shared out. Adjust any quantity or date afterwards, as you would in Sage. If the customer sends a PO for each call-off, type it in that line's Call-off PO when it arrives (Amend).</p>
        <button class="btn sm" type="button" data-olsplit>Split the lines</button></details></div>
    <p class="note" id="of-tot">${formTotals(n.lines)}</p>
    ${(() => { const ps = formParts(n), c = k => ps.filter(x => x.from === k).length;
      return `<datalist id="of-parts">${partOptions(partMatches(ps, ''))}</datalist>
      <p class="note">Parts list: ${c('customer')} for this customer, ${c('board')} from other orders${c('parts') ? `, ${c('parts')} in Parts` : ''}${S.xero ? `, ${S.xitems ? c('xero') + ' from Xero\'s Products and services' : 'reading Xero\'s Products and services…'}` : ''}. Type the part number or a word from the description in either box; picking one fills in the part number, the description and its price.${S.xitemsErr ? ` <span class="bad">Xero's list could not be read (${esc(S.xitemsErr)}).</span>` : ''}</p>`; })()}
    ${procTable(n)}
    <label class="fl">Notes (optional)<input type="text" id="of-notes" value="${esc(n.notes)}"></label>
    ${amend ? '' : `<label class="b2b"><input type="checkbox" id="of-b2b" ${n.b2b ? 'checked' : ''}> <span><b>Back-to-back:</b> buy these parts in for this order. Once it is saved, the purchase order opens ready, with the same parts (no processes needed if nothing is made here).</span></label>`}
    <div class="actions"><button class="btn pri" type="submit" ${S.busy ? 'disabled' : ''}>${amend ? 'Save the changes' : 'Create order'}</button><button class="btn" type="button" data-olcancel>Cancel</button>
      <button class="btn link sm" type="button" data-booksave title="Save the contact, email and delivery address above to this customer's contact book (Sales orders › Customers)">Save contact and address to the contact book</button></div>
    <p class="note" id="of-msg"></p></form>`;
}
/** How a form line reads in the Processes table: as it will on the board, or "Line n" until something is typed. */
const formLineName = (l, i) => (l.part || '').trim() || (l.partNo || '').trim() ? lineHtml({ partNo: (l.partNo || '').trim(), part: (l.part || '').trim() }, esc) : `Line ${i + 1}`;
/** Processes per part line (Levi, 22 Oct: "each part may need a different process"): a row per line, a column per
 *  process, and with more than one line an All lines row that ticks or unticks a column on every line. */
function procTable(n) {
  const many = n.lines.length > 1;
  const box = (p, on, attrs, label) => `<td><input type="checkbox" ${attrs} value="${esc(p)}" ${on ? 'checked' : ''} aria-label="${esc(label)}"></td>`;
  return `<div class="fl" id="of-pnote">Processes each part needs${n.spQuoteId ? '. Ticked from the quote lines; check them and add Tap & C/Sink if needed.' : n.procNote ? '. ' + esc(n.procNote) : ''}</div>
    <div style="overflow-x:auto"><table class="lines lprocs" id="of-ptable"><thead><tr><th>Part</th>${PROCESSES.map(p => `<th title="${esc(p)}">${esc(SHORT[p])}</th>`).join('')}</tr></thead><tbody>
    ${many ? `<tr class="allrow"><td><b>All lines</b></td>${PROCESSES.map(p => box(p, n.lines.every(l => l.procs.includes(p)), `data-allp="${esc(p)}"`, `${p} on every line`)).join('')}</tr>` : ''}
    ${n.lines.map((l, i) => `<tr><td id="of-plbl${i}">${formLineName(l, i)}</td>${PROCESSES.map(p => box(p, l.procs.includes(p), `name="of-lp" data-line="${i}"`, `${p}, line ${i + 1}`)).join('')}</tr>`).join('')}
    </tbody></table></div>
    ${many ? '<p class="note">A line with nothing ticked goes through every process on the order.</p>' : ''}`;
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
  const real = n.lines.filter(l => (l.part.trim() || (l.partNo || '').trim()) && Number(l.qty) > 0);
  if (!real.length) return toast('Enter the parts and quantities first, then split them.', null, true);
  n.lines = splitIntoCalloffs(real, dates).map(l => ({ ...l, qty: String(l.qty) }));
  n.due = dates[0]; keepInputs = false; render();
  toast(`Split into ${count} deliveries from ${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}.`);
}
async function submitOrder() {
  collectForm();
  const n = S.form, msg = t => { $('of-msg').textContent = t; };
  const lines = n.lines.filter(l => l.part.trim() || (l.partNo || '').trim() || l.qty || l.price);
  if (!n.customer.trim()) return msg('Enter the customer.');
  const mails = emailList(n.contactEmail);
  if (mails.bad.length) return msg(`"${mails.bad[0]}" is not an email address. Put several addresses with a comma between them.`);
  n.contactEmail = mails.ok.join(', ');
  if (!lines.length) return msg('Add at least one line.');
  const bad = lines.find(l => !l.part.trim() || !(Number(l.qty) > 0) || !Number.isInteger(Number(l.qty)) || l.price === '' || Number(l.price) < 0 || !l.due);
  if (bad) return msg('Every line needs a description, a whole-number quantity, a unit price (0 is allowed) and a due date. The part number is optional.');
  const under = lines.find(l => l.sent && Number(l.qty) < l.sent);
  if (under) return msg(`"${lineLabel(under)}" has ${under.sent} dispatched already, so its quantity cannot go below that.`);
  n.procs = unionProcs(lines);   // the order's processes: every process a line being saved needs
  if (!n.procs.length && !n.b2b) return msg('Tick at least one process so the shop floor knows what the order needs (or tick Back-to-back if it is bought in and sent on).');
  if (n.mode === 'new' && n.so.trim() && !/^(SO|SAGE)-\d+$/i.test(n.so.trim())) return msg('An order number must look like SO-9726 or SAGE-9701, or be left blank.');
  const payloadLines = lines.map(l => ({ ...(l.id ? { id: l.id } : {}), part_no: (l.partNo || '').trim(), part: l.part.trim(), qty: Number(l.qty), unit_price: Number(l.price), due_date: l.due, customer_po: (l.po || '').trim(),
    processes: PROCESSES.filter(p => (l.procs || []).includes(p)) }));
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
      toast(`${j.so_number} created for ${who}. It's on Sales orders, and on Jobs under Not started.${partsNote} Press Front sheet to print one for the folder.`);
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
    if ((n.contact.trim() || n.contactEmail.trim()) && emailList(n.contactEmail).ok.length <= 1 && !b.people.some(p => p.role === 'orders' && p.name === n.contact.trim() && p.email === n.contactEmail.trim())) {
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

/** Every customer the board knows of (contact book, orders, Xero invoices, the quote calculator): key → name. */
function customerNames() {
  const names = new Map();
  for (const x of [...S.book.people, ...S.book.sites]) if (x.customer) names.set(x.key, x.customer);
  for (const j of S.jobs) if (!j.preview && !names.has(normName(j.customer))) names.set(normName(j.customer), j.customer);
  for (const x of S.hist?.invoices || []) if (x.customer && !names.has(normName(x.customer))) names.set(normName(x.customer), x.customer);
  for (const q of S.salesQ || []) if (q.customer && !names.has(normName(q.customer))) names.set(normName(q.customer), q.customer);
  return names;
}
function renderCustomers() {
  const q = (S.csearch || '').toLowerCase();
  const names = customerNames();
  if (S.cust && !names.has(S.cust) && S.custName) names.set(S.cust, S.custName);
  const list = [...names.entries()].filter(([, n]) => !q || n.toLowerCase().includes(q)).sort((a, b) => a[1].localeCompare(b[1]));
  const sel = S.cust && names.has(S.cust) ? S.cust : null, name = sel ? names.get(sel) : '';
  S.custShown = name;   // the name on the page: what the contact book saves with
  const items = list.map(([k, n]) => { const b = { people: S.book.people.filter(p => p.key === k).length, sites: S.book.sites.filter(x => x.key === k).length };
    return `<button type="button" class="citem ${k === sel ? 'on' : ''}" data-cust="${esc(k)}"><b>${esc(n)}</b><span>${b.people ? `${b.people} contact${b.people === 1 ? '' : 's'}` : 'no contacts yet'}${b.sites ? ` · ${b.sites} address${b.sites === 1 ? '' : 'es'}` : ''}</span></button>`; }).join('');
  let main = customersGlance();
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
      ${customerPageHtml(sel, name)}${(S.ctab || 'overview') !== 'contacts' ? '' : `
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
        ${sform || '<div class="actions"><button class="btn sm" type="button" data-addsite>Add a delivery address</button>' + (xc ? ' <button class="btn sm" type="button" data-fromxerosite>Copy in Xero\'s address</button>' : '') + '</div>'}</div>
      `}${(S.ctab || 'overview') === 'contacts' && orders.length ? `<div class="panel"><h3>Open orders <span class="note">${orders.length}</span></h3><div class="acts" style="display:flex;gap:6px;flex-wrap:wrap">${orders.map(j => `<button class="btn sm" type="button" data-open="${j.id}">${esc(j.so)} · due ${fmt(nextDue(j))}</button>`).join('')}</div></div>` : ''}`;
  }
  $('v-customers').innerHTML = `${crmHead()}<div class="sec-h"><h2>Customers</h2><span class="sub">Every customer: orders, invoices, quotes, emails, tasks and notes, and who to deal with. Xero and the quote calculator are not changed.</span></div>
    ${enquiriesHtml()}<div class="cbook"><div class="clist"><input type="search" id="csearch" placeholder="Find a customer" value="${esc(S.csearch || '')}">
        <div class="citems">${items || '<div class="note">No customers yet.</div>'}</div>
        <form class="addcust" data-addcust><input type="text" id="newcust" list="xero-customers2" placeholder="Add a customer (from Xero or new)" autocomplete="off">
          <datalist id="xero-customers2">${(S.xc?.contacts || []).map(c => `<option value="${esc(c.name)}"></option>`).join('')}</datalist><button class="btn sm" type="submit">Open</button></form></div>
      <div class="cmain">${main}</div></div>`;
  if (S.xero && !S.xc && !S.xcErr) loadXeroContacts();
  ensureHistory(); ensureQuotes();
}
async function saveBookForm(kind) {
  const v = id => $(id)?.value ?? '', name = S.custShown || S.custName || [...S.book.people, ...S.book.sites].find(x => x.key === S.cust && x.customer)?.customer || S.jobs.find(j => normName(j.customer) === S.cust)?.customer || '';
  if (!S.cust || !name) return toast('Pick the customer on the left first.', null, true);
  const base = { id: S.bookEdit?.id, key: S.cust, customer: name, main: $('bk-main')?.checked };
  const rec = kind === 'person' ? { ...base, role: v('bk-role'), name: v('bk-name').trim(), email: v('bk-email').trim(), phone: v('bk-phone').trim(), notes: v('bk-notes').trim() }
    : { ...base, label: v('bk-label').trim(), address: v('bk-address').trim(), contact: v('bk-contact').trim(), phone: v('bk-phone').trim() };
  if (kind === 'person' && !rec.name && !rec.email) return toast('Enter a name or an email.', null, true);
  if (kind === 'site' && !rec.address) return toast('Enter the address.', null, true);
  try { await (kind === 'person' ? data.savePerson(rec) : data.saveSite(rec)); S.bookEdit = null; await reload(); toast('Saved.'); }
  catch (e) { toast(e.message, null, true); }
}
async function copyXeroToBook() {
  const name = S.custShown || S.custName || [...S.book.people, ...S.book.sites].find(x => x.key === S.cust && x.customer)?.customer || S.jobs.find(j => normName(j.customer) === S.cust)?.customer;
  const xc = contactFor(name); if (!xc) return;
  try { const d = await data.xero('contact', { id: xc.id });
    S.bookEdit = { kind: 'person', role: 'accounts', name: d.person || '', email: d.email || '', main: !bookFor(name).people.some(p => p.role === 'accounts') };
    if (d.address && !bookFor(name).sites.length) toast('Xero\'s address can be added under Delivery addresses if goods go there.');
    render();
  } catch (e) { toast(e.message, null, true); }
}

/** Xero's address for the customer (its delivery address if it has one) into the delivery address form, to check and save. */
async function copyXeroAddress() {
  const name = S.custShown || S.custName, xc = contactFor(name); if (!xc) return;
  try { const d = await data.xero('contact', { id: xc.id });
    if (!d.address) return toast(`Xero has no address for ${xc.name}.`, null, true);
    S.bookEdit = { kind: 'site', label: '', address: d.address, contact: d.person || '', phone: '', main: !bookFor(name).sites.length };
    toast('Xero\'s address is in the form. Check it, then press Add.'); render();
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
    const v = await data.xero('month', { from, to: today, fresh: !!force });
    S.monthX = v.invoices || []; S.monthXErr = null; S.monthNote = staleNote(v);
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
    const v = await data.xero('debts', { fresh: !!force });
    S.debtInv = v.invoices || []; S.debtErr = null; S.debtNote = staleNote(v);
    try { sessionStorage.setItem('clj.debts', JSON.stringify({ at: Date.now(), v: S.debtInv })); } catch { /* asked again next time */ }
  } catch (e) { S.debtErr = e.message; }
  debtAsking = false;
  render();
}
const debts = () => (S.debtInv ? agedDebt(S.debtInv, todayIso()) : null);
/** A kept answer the board returned because Xero's daily limit is used up: say how old the figures are. */
function staleNote(r) {
  if (!r?.stale || !r.cached_at) return '';
  const at = new Date(r.cached_at), t = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = iso(at) === todayIso() ? '' : ` on ${fmt(iso(at))}`;
  return `Xero's figures from ${t}${day} (Xero's daily limit is used up for now)`;
}
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
const monthXero = () => (!S.xero || PREVIEW.on ? { x: null, note: '' } : S.monthX ? { x: S.monthX, note: '', stale: S.monthNote || '' } : { x: null, note: S.monthXErr || 'checking' });

/** The one-off changeover import: reads Xero's open sales orders and keeps them on the board
 *  (xero_orders), so Won quotes offers them until each becomes a sales order or is marked not a job.
 *  Nothing reads Xero's sales orders by itself; running it again only adds new ones. */
const openSo = q => /^SO-?\d+$/i.test(q.number) && !['DECLINED', 'DELETED', 'INVOICED'].includes(q.status);
let xeroReading = false;
async function importFromXero() {
  if (!S.xero || xeroReading) return;
  xeroReading = true; S.xeroErr = null; render();
  try {
    S.xeroRead = await data.xero('read', { fresh: true }); S.xeroReadAt = new Date();
    const fresh = S.xeroRead.quotes.filter(q => openSo(q) && !onBoard(q));
    const added = await data.importXeroOrders(fresh);
    // Imports saved before item codes were read: refresh their lines so the codes (part numbers) come through.
    const kept = new Set((S.xeroOrders || []).map(q => q.id));
    const old = S.xeroRead.quotes.filter(q => kept.has(q.id) && (q.lines || []).some(l => l.code));
    if (old.length) await data.refreshXeroLines(old);
    await reload();
    const fix = missingLineCodes(S.jobs, S.xeroOrders);
    toast((added ? `${added} sales order${added === 1 ? '' : 's'} brought in from Xero. They are on Won quotes.` : 'Nothing new: every open sales order in Xero is already here.')
      + (fix.length ? ` ${fix.length} line${fix.length === 1 ? '' : 's'} on orders already made are missing Xero's item code: see the Xero tab.` : ''));
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
/** Xero allows the board 5,000 calls a day, and each read pages through a whole list (100 a call). The board's
 *  Xero connection keeps Xero's answers for everyone (xero_cache); this also keeps one on this computer a while. */
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
  if (S.xero && !S.xitems && !S.xitemsErr && !xitemsLoading) loadXeroItems();
  const x = S.xero, r = S.xeroRead, busy = S.xeroBusy || xeroReading ? 'disabled' : '';
  const imported = S.xeroOrders || [];
  const last = imported.reduce((a, q) => (q.importedAt > (a?.importedAt || '') ? q : a), null);
  const head = x
    ? `<p>Connected to <b>${esc(x.tenant_name)}</b> by ${esc(x.connected_by)} on ${fmtLong(x.connected_at)}.</p>
       <div class="actions"><button class="btn" type="button" data-xero="connect" ${busy}>${icon('refresh')}Reconnect</button></div>
       <p class="note">To stay inside Xero's daily limit, the board remembers Xero's answers for everyone: customers for 30 minutes, products for an hour, invoices (for customer pages and Sales) for 6 hours, debts for 15 minutes. The Read again buttons fetch fresh ones. Added a customer in Xero? <button class="btn sm" type="button" data-xcreload>Read the customers again</button></p>
       <p class="note">${data.xeroLeft.day != null ? `Xero allows the board 5,000 calls a day. Left today: <b>${Number(data.xeroLeft.day).toLocaleString('en-GB')}</b>${data.xeroLeft.at ? ` (as of ${new Date(data.xeroLeft.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : ''}` : 'Calls left today: not known yet (it shows after the board\'s next read)'}</p>`
    : `<p>Not connected. Connecting lets the board create draft invoices in Xero for Keith, and bring in Xero's open sales orders once at changeover. It never approves, sends or deletes anything in Xero.</p>
       <div class="actions"><button class="btn xero" type="button" data-xero="connect" ${busy}>Connect to ${XERO}</button></div>
       <p class="note">You will be sent to Xero to sign in. Pick Clarke Lane Engineering when it asks which organisation.</p>`;
  const waiting = xeroWaiting();
  const importPanel = !x ? '' : `<div class="panel"><h3>Changeover: bring in Xero's sales orders</h3>
      <p>Do this once, on the day the board takes over from raising sales orders in Xero. It copies every open sales order (SO-…) from Xero onto Won quotes, ready to become sales orders. After that the board is the only place orders are raised, and Xero is not read for orders again.</p>
      ${last ? `<p><b>Imported ${imported.length} sales order${imported.length === 1 ? '' : 's'}</b>, last on ${fmtLong(last.importedAt)} by ${esc(last.importedBy)}. ${waiting.length} still waiting on Won quotes.</p>` : '<p class="note">Not imported yet.</p>'}
      <div class="actions"><button class="btn ${last ? '' : 'pri'}" type="button" data-xero="import" ${busy}>${icon('download')}${xeroReading ? 'Reading Xero…' : last ? 'Import again (adds only new ones)' : 'Import open sales orders'}</button></div>
      ${r ? `<p class="note">The highest SO number in Xero is <b>${r.highestSo ? 'SO-' + r.highestSo : 'none'}</b>, so the next order made on the board will be <b>SO-${r.counterNext ?? '…'}</b>. The board always keeps its numbers past Xero's.</p>` : ''}</div>`;
  // Orders already made from an import whose lines lack Xero's item code (often the customer's part number).
  const fix = x ? missingLineCodes(S.jobs, S.xeroOrders) : [];
  const fixPanel = fix.length ? `<div class="panel"><h3>Part numbers to add from Xero</h3>
      <p>${fix.length} line${fix.length === 1 ? '' : 's'} on ${new Set(fix.map(f => f.so)).size} order${new Set(fix.map(f => f.so)).size === 1 ? '' : 's'} made from Xero ${fix.length === 1 ? 'is' : 'are'} missing the item code that line has in Xero, which is usually the customer's part number. For example:
        ${fix.slice(0, 4).map(f => `<b>${esc(f.so)}</b>: <span class="mono">${esc(f.code)}</span> ${esc(f.part)}`).join(' · ')}${fix.length > 4 ? ' …' : ''}</p>
      <p class="note">Adding them puts the code in front of each line's description, so Parts can find it, drawings attach, and the invoice shows it. Nothing else on the orders changes.</p>
      <div class="actions"><button class="btn pri" type="button" data-addcodes>Add the part numbers to ${fix.length} line${fix.length === 1 ? '' : 's'}</button></div></div>` : '';
  $('v-xero').innerHTML = `<div class="sec-h"><h2 class="xhead">${XERO}</h2><span class="sub">Clarke Lane's Xero, through the board's own connection.</span>
      <span class="right"><span class="chip ${x ? 'ok' : ''}">${x ? icon('link') + 'Connected' : 'Not connected'}</span></span></div>
    ${S.xeroErr ? `<div class="err">${esc(S.xeroErr)}</div>` : ''}
    <div class="panel"><h3>Connection</h3>${head}</div>
    ${importPanel}${fixPanel}${x ? productsCheck() : ''}`;
}
/** Xero tab: what Xero's Products and services give the board, and a look-up by code (Mandy, 20 Oct). */
function productsCheck() {
  const pc = S.pcheck || {};
  const list = S.xitems || [];
  const q = (pc.q || '').trim().toUpperCase();
  const hits = q ? list.filter(i => `${i.code} ${i.description}`.toUpperCase().includes(q)).slice(0, 8) : [];
  const lineHits = q ? (S.xeroOrders || []).flatMap(o => (o.lines || []).filter(l => `${l.code || ''} ${l.description}`.toUpperCase().includes(q)).map(l => ({ so: o.number, ...l }))).slice(0, 6) : [];
  return `<div class="panel"><h3>Check: Xero's Products and services</h3>
    ${S.xitemsErr ? `<div class="err">Xero said: ${esc(S.xitemsErr)}</div>` : !S.xitems ? '<p class="note">Not read yet.</p>'
      : `<p>Xero sent <b>${S.xitemsTotal ?? list.length}</b> product${(S.xitemsTotal ?? list.length) === 1 ? '' : 's'}; <b>${list.length}</b> can be offered in the Part box (${list.filter(i => !i.sold).length} not ticked as sold in Xero).</p>`}
    <div class="actions"><button class="btn sm" type="button" data-pcheckread>${icon('refresh')}Read them again</button>
      <input type="search" id="pcheck-q" placeholder="Look up a code, e.g. SAM01-11-1696" value="${esc(pc.q || '')}" style="min-width:260px"></div>
    ${q ? `<p class="note"><b>In Xero's products:</b> ${hits.length ? hits.map(i => `<span class="mono">${esc(i.code || '(no code)')}</span> ${esc(i.description)}${i.price != null ? ' · ' + gbp(i.price, 2) : ''}`).join(' · ') : 'not found'}</p>
      <p class="note"><b>On imported Xero sales orders:</b> ${lineHits.length ? lineHits.map(l => `${esc(l.so)}: <span class="mono">${esc(l.code || '(no item code)')}</span> ${esc(l.description)}`).join(' · ') : 'not found'}</p>` : ''}</div>`;
}
async function addMissingCodes() {
  const fix = missingLineCodes(S.jobs, S.xeroOrders); if (!fix.length) return;
  try {
    const n = await data.addLineCodes(fix); await reload();
    for (const so of new Set(fix.map(f => f.so))) { const j = S.jobs.find(x => x.so === so); if (j) await linkPartDrawings(j.id, true); }
    toast(`Part numbers added to ${n} line${n === 1 ? '' : 's'}. They now show on Parts › Found on your orders, and drawings in Parts attach to them.`);
  } catch (e) { toast(e.message, null, true); }
  render();
}
function makeJobFromXero(id) {
  const q = (S.xeroOrders || []).find(x => x.id === id); if (!q) return;
  const due = q.expiry && q.expiry >= todayIso() ? q.expiry : addWorkingDays(todayIso(), 10);
  openOrderForm({ from: `Xero ${q.number}`, so: q.number.toUpperCase().replace(/^SO(\d)/, 'SO-$1'), customer: q.customer, po: q.reference,
    due, xeroQuoteId: q.id,
    // Xero's item code into Part no., its description into Description (22 Oct); no code, no part number.
    lines: q.lines.filter(l => l.qty > 0).map(l => ({ ...xeroLineFields(l), qty: String(l.qty), price: String(l.unit), due })).concat(q.lines.some(l => l.qty > 0) ? [] : [blankLine(due)]) });
}

/* ---------- shop floor: the touch screen in the factory. Same rows as the job board, bigger boxes. ---------- */
/** Outstanding parts, one line per part however many delivery lines it is split over. */
function dispatchParts(j) {
  return partsLeft(j).map(r =>
    `<div><b>${r.left}</b> × ${lineHtml({ partNo: r.partNo, part: r.desc }, esc)}${r.next && r.next !== r.left ? ` <span class="note">(${r.next} for the next delivery)</span>` : ''}</div>`).join('');
}
function procButtons(j, focus) {
  return needed(j).map(p => { const s = j.procs[p];
    return `<button type="button" class="pbtn ${s.done ? 'done' : ''} ${focus === p ? 'focus' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}"${j.status === 'held' && !office() ? ' disabled' : ''}><b>${s.done ? '✓ ' : ''}${esc(p)}</b><span>${s.done ? `${esc(s.by)} · ${fmtTime(s.at)}` : 'Tap when done'}</span></button>`; }).join('');
}
/* ---------- notes on a job: the office and the shop floor (one shared login, so a typed name, kept on the tablet) ---------- */
function noteName() {
  if (office()) return S.me.name.split(' ')[0];
  try { return localStorage.getItem('clj.notename') || ''; } catch { return ''; }
}
async function postNote(f) {
  const jobId = +f.dataset.job, body = $('note-body').value.trim(), by = office() ? noteName() : ($('note-by')?.value || '').trim();
  if (!body) return;
  if (!by) return toast('Type your name first.', null, true);
  if (!office()) { try { localStorage.setItem('clj.notename', by); } catch { /* this visit only */ } }
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    await data.addNote({ jobId, body, by, fromFloor: !office() });
    // the other side's notes on this job are answered by replying
    await Promise.all((S.notes || []).filter(n => n.jobId === jobId && !n.seenBy && n.fromFloor === office()).map(n => data.seenNote(n.id, by).catch(() => {})));
    S.notes = await data.loadNotes(); $('note-body').value = ''; keepInputs = false; render();
    toast(office() ? 'Note posted. It shows on the shop floor and the TV.' : 'Note posted for the office.');
  } catch (e) { btn.disabled = false; toast(e.message, null, true); }
}
async function seenNote(id) {
  const by = noteName() || (office() ? S.me.name : 'Shop floor');
  try { await data.seenNote(id, by); S.notes = await data.loadNotes(); render(); } catch (e) { toast(e.message, null, true); }
}
async function removeNote(id) {
  if (!confirm('Remove this note? Everyone stops seeing it.')) return;
  try { await data.deleteNote(id); S.notes = await data.loadNotes(); render(); } catch (e) { toast(e.message, null, true); }
}
/** On the job's details: its sends to other companies, and Send out when one is due. */
function outPanel(j) {
  const rows = (S.outwork || []).filter(r => r.jobId === j.id).sort((a, b) => b.sentOn.localeCompare(a.sentOn) || b.id - a.id);
  const can = OUT_PROCESSES.filter(p => j.procs[p] && !j.procs[p].done && !outNow(S.outwork, j.id, p));
  if (!rows.length && !can.length) return '';
  const today = todayIso();
  return `<div class="outlist">${rows.map(r => `<p>${r.backOn ? '' : `<span class="chip ${r.dueBack && r.dueBack < today ? 'late' : 'soon'}">Out now</span> `}<b>${esc(SHORT[r.process])}</b> at ${esc(r.supplier)}${r.finish ? ` (${esc(r.finish)})` : ''}:
      went ${fmt(r.sentOn)}${r.backOn ? `, back ${fmt(r.backOn)}` : r.dueBack ? `, due back ${fmt(r.dueBack)}` : ''}.
      ${r.backOn ? '' : `<button class="btn sm" type="button" data-outback="${r.id}">Back in</button> `}<button class="btn sm link" type="button" data-outedit="${r.id}">Change</button></p>`).join('')}
    ${can.map(p => `<button class="btn sm" type="button" data-sendout="${esc(p)}" data-job="${j.id}">Send out for ${esc(SHORT[p])}</button>`).join(' ')}</div>`;
}
/* ---------- customers as a CRM: history, quotes, emails, tasks, enquiries (Levi and Mandy) ---------- */
const DEFAULT_ENQUIRY_MAILBOX = 'info@clarke-lane.co.uk';
const enquiryMailbox = () => String(S.officeSet?.enquiry_mailbox || DEFAULT_ENQUIRY_MAILBOX);
const ownDomain = () => domainOf(S.me?.email || '');
/** Xero's sales invoices (24 months), read once per visit: customer pages, Sales and Home's list. */
function ensureHistory(fresh) {
  if (!S.xero || PREVIEW.on || S.histLoading || (S.hist && !fresh)) return;
  S.histLoading = true;
  data.xero('history', { fresh: !!fresh }).then(r => { S.hist = r; S.histErr = null; S.histNote = staleNote(r); }).catch(e => { S.histErr = e.message; S.hist = S.hist || { invoices: [] }; })
    .then(() => { S.histLoading = false; if (['sales', 'customers', 'home'].includes(S.tab)) render(); });
}
/** Every quote in the quote calculator (read only), for customer pages and Sales. */
function ensureQuotes(fresh) {
  if (S.salesQLoading || (S.salesQ && !fresh) || S.salesErr) return;
  S.salesQLoading = true;
  data.allQuotes().then(q => { S.salesQ = q; }).catch(e => { S.salesErr = e.message; }).then(() => { S.salesQLoading = false; if (['sales', 'customers', 'home'].includes(S.tab)) render(); });
}
const staffList = () => S.staff || [];
function customerIdx() {
  const entries = [...S.book.people.map(p => ({ key: p.key, customer: p.customer, email: p.email })),
    ...S.jobs.filter(j => !j.preview).map(j => ({ key: normName(j.customer), customer: j.customer, email: j.contactEmail })),
    ...(S.salesQ || []).map(q => ({ key: normName(q.customer), customer: q.customer, email: q.contactEmail }))];
  return customerIndex(entries);
}

/** Reads new emails in the enquiries mailbox: each one not seen before is sorted by AI and kept as one row. */
let enqSyncing = false;
async function syncEnquiries(manual) {
  if (!office() || PREVIEW.on || enqSyncing) return;
  enqSyncing = true; S.enqState = S.enqState === 'ok' ? 'ok' : 'reading';
  const mailbox = enquiryMailbox();
  try {
    const known = new Set((S.enq || []).map(e => e.messageId));
    const last = (S.enq || []).reduce((m, e) => (e.receivedAt > m ? e.receivedAt : m), '');
    const since = new Date(Math.max(Date.now() - 14 * 864e5, last ? Date.parse(last) - 36e5 : 0)).toISOString();
    const msgs = (await data.inboxMessages(mailbox, since)).filter(m => !known.has(m.messageId) && worthReading({ from: m.fromEmail }, ownDomain()));
    let read = 0;
    for (const m of msgs.slice(0, 8)) {
      const attachments = m.hasAttachments ? await data.attachmentNames(mailbox, m.graphId).catch(() => []) : [];
      const x = await data.salesAi({ from: m.fromEmail, fromName: m.fromName, subject: m.subject, text: plainText(m.text), attachments }, 'enquiry');
      const id = await data.claimEnquiry({ ...m, mailbox });
      const key = emailCustomer(customerIdx(), m.fromEmail, x.company, customerNames());   // by address or domain, else by the company named
      const kind = sortEmail(x.kind, { known: !!key, text: `${m.subject} ${x.wants || ''} ${x.summary || ''} ${plainText(m.text, 2000)}` });
      const t = cleanTopic(x);   // what it is about, and the order or quote it names (21 Oct)
      if (id) { await data.setEnquiry(id, { kind, summary: x.summary || '', company: x.company || '', person: x.person || m.fromName, phone: x.phone || '', wants: x.wants || '', hasDrawings: !!x.hasDrawings || attachments.some(a => /\.(pdf|dxf|dwg|step|stp|igs)$/i.test(a)), customerKey: key,
        ...t, ...linkEmail(t, { jobs: S.jobs, quotes: S.salesQ || [] }) }); read++; }
    }
    // Emails filed before this sorting (21 Oct): a known customer's email about an existing order or quote moves to customer correspondence.
    for (const e of (S.enq || []).filter(e => e.status === 'new' && e.kind === 'enquiry')) {
      const key = e.customerKey || emailCustomer(customerIdx(), e.fromEmail, e.company, customerNames());
      const kind = sortEmail(e.kind, { known: !!key, text: `${e.subject} ${e.wants} ${e.summary}` });
      if (key !== e.customerKey || kind !== e.kind) { await data.setEnquiry(e.id, { kind, customerKey: key }).catch(() => {}); read++; }
    }
    // Emails read before topics (21 Oct): up to 10 a check get their topic and numbers from what was kept (the subject,
    // what they want and the summary: the body is not stored). Low effort, about a penny each. Not on the practice page.
    if (!data.practice) for (const e of needTopic(S.enq)) {
      const x = await data.salesAi({ from: e.fromEmail, fromName: e.fromName, subject: e.subject, text: [e.wants, e.summary].filter(Boolean).join('\n'), attachments: [] }, 'enquiry').catch(() => null);
      if (!x) break;   // no AI today (no key, over the limit, offline): try again next check
      const t = cleanTopic(x);
      await data.setEnquiry(e.id, { ...t, ...linkEmail(t, { jobs: S.jobs, quotes: S.salesQ || [] }) }).catch(() => {}); read++;
    }
    // An email read before the quote calculator was: link it to its quote or order now that they are known.
    if (S.salesQ) for (const e of (S.enq || []).filter(e => e.status === 'new' && e.kind === 'customer' && e.topic && e.jobId == null && e.quoteSpId == null && Object.values(e.refs || {}).some(Boolean)).slice(0, 20)) {
      const l = linkEmail(e, { jobs: S.jobs, quotes: S.salesQ });
      if (l.jobId != null || l.quoteSpId != null) { await data.setEnquiry(e.id, l).catch(() => {}); read++; }
    }
    S.enqState = 'ok'; S.enqCheckedAt = new Date().toISOString();
    if (read || manual) { S.enq = await data.loadEnquiries(); if (manual) toast(read ? `${read} new email${read === 1 ? '' : 's'} read.` : 'Nothing new in the mailbox.'); }
  } catch (e) {
    S.enqState = e.code === 'CONSENT_REQUIRED' ? 'consent' : /403|denied|not found|404/i.test(e.message) ? 'noaccess' : 'error:' + e.message;
    if (manual) toast(e.message, null, true);
  }
  enqSyncing = false; if (['customers', 'sales', 'home'].includes(S.tab)) render();
}
setInterval(() => { if (!document.hidden && S.me && office()) syncEnquiries(); }, 15 * 60e3);
function enquiriesHtml() {
  if (!office()) return '';
  // Customers' emails: the linked order's SO and quote's number for the row, and the buttons for its topic (core/inbox.js).
  const list = enquiryList(S.enq || [], new Date().toISOString()).map(e => {
    if (e.kind !== 'customer') return e;
    if (e.jobId == null && e.quoteSpId == null && e.topic) e = { ...e, ...linkEmail(e, { jobs: S.jobs, quotes: S.salesQ || [] }) };   // read before the quotes were: shown linked now, saved on the next check
    const x = { ...e, jobSo: e.jobId != null ? S.jobs.find(j => j.id === e.jobId)?.so || '' : '', quoteNo: e.quoteSpId != null ? (S.salesQ || []).find(q => q.spId === e.quoteSpId)?.quoteNo || '' : '' };
    return { ...x, actions: emailActions(x, { md: md() }) };
  });
  return renderEnquiries({ list: [...list.filter(e => e.kind !== 'customer'), ...sortEmails(list.filter(e => e.kind === 'customer'))], funnel: enquiryFunnel(S.enq || [], todayIso()), state: S.enqState || 'reading', mailbox: enquiryMailbox(),
    open: S.enqOpen, busy: S.enqBusy, reply: S.enqReply, checkedAt: S.enqCheckedAt, settings: S.enqSettings, packBusy: S.packBusy }, { esc, fmt, fmtTime });
}
/** The AI reply to an enquiry; questions (from the quote pack's Ask these questions) are what the reply must ask. */
async function replyEnquiry(id, questions = []) {
  const e = (S.enq || []).find(x => x.id === id); if (!e) return;
  S.enqBusy = id; render();
  try {
    // A customer writing about an order or quote (21 Oct): the topic and their numbers, so the reply answers that, not a new enquiry.
    const about = e.kind === 'customer' || (e.topic && e.topic !== 'other') ? { topic: e.topic || 'other', refs: e.refs || {} } : {};
    const d = await data.salesAi({ from: e.fromEmail, fromName: e.person || e.fromName, subject: e.subject, company: e.company, wants: e.wants, summary: e.summary, hasDrawings: e.hasDrawings,
      questions: (questions || []).slice(0, 12), ...about }, 'reply');
    S.enqReply = { id, draft: { subject: d.subject, greeting: d.greeting, paragraphs: d.paragraphs || [] } };
  } catch (x) { toast(x.message, null, true); }
  S.enqBusy = null; render();
}
/**
 * The quote pack (Philip, 21 Oct): the enquiry's email and its PDFs and pictures (each PDF's text read here too, with
 * pdf.js, so the AI has the words as well as the drawing) read by AI into the parts, the questions to ask and what to
 * watch out for, and kept on the enquiry. No attachments, or none it can read: it still reads the email on its own.
 */
const bytesOf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
async function prepareQuotePack(id) {
  const e = (S.enq || []).find(x => x.id === id); if (!e || S.packBusy) return;
  S.packBusy = id; render();
  try {
    const box = e.mailbox || enquiryMailbox();
    let attErr = null;
    const [text, files] = e.graphId ? await Promise.all([data.enquiryText(box, e.graphId).catch(() => ''),
      data.enquiryAttachments(box, e.graphId).catch(x => { attErr = x; return []; })]) : ['', []];
    const read = [];
    for (const f of files) read.push({ name: f.name, text: docMediaType(f.name, f.contentType) === 'application/pdf' ? await pdfText(bytesOf(f.base64)).catch(() => '') : '' });
    const documents = files.map(f => ({ name: f.name, mediaType: docMediaType(f.name, f.contentType), base64: f.base64 }));
    const x = await data.salesAi(packFacts({ ...e, text: plainText(text) }, read), 'quotepack', documents.length ? { documents } : {});
    await data.setEnquiry(id, { quotePack: { ...cleanPack(x), files: files.map(f => f.name), model: x.model || '' } });
    S.enq = await data.loadEnquiries();
    if (attErr && e.hasDrawings) toast(`The attachments could not be opened (${attErr.message}), so this was read from the email alone.`, null, true);
  } catch (x) { toast(x.message, null, true); }
  S.packBusy = null; render();
}
function copyQuotePack(id) {
  const e = (S.enq || []).find(x => x.id === id); if (!e?.quotePack) return;
  const t = quotePackText(e.quotePack, { company: e.company || e.fromName });
  (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Copied. Paste it into the quote calculator or a note.'), () => toast('Could not copy here. Select the parts table and copy it by hand.', null, true));
}

/**
 * Three things today (Philip, 21 Oct): built once a day when Levi or Mandy first open Home, when the board has read
 * what it needs (enquiries, tasks, quotes, Xero), or after 8 seconds with whatever it has. Kept per person per day
 * (daily_digests), so a reload shows the same three unless the picks have changed. If the AI cannot be reached the
 * picks still show with plain lines; nothing waits on it.
 */
let digestWait = null;
const digestHidden = day => { if (S.digestHidden === day) return true; try { return localStorage.getItem('clj.digest.' + day) === 'hidden'; } catch { return false; } };
function digestPicksNow() {
  const today = todayIso(), m = S.salesQ && S.salesF ? salesModel() : null, rm = reorderModel();
  return digestPicks({ role: md() ? 'md' : 'office', enquiries: S.enq || [], soOf: id => S.jobs.find(j => j.id === id)?.so || '', chase: m ? m.chase : [], reorders: rm ? rm.round.filter(r => r.state === 'due') : [],
    late: dashboard(S.jobs.filter(j => !j.preview), today).late, tasks: (S.tasks || []).filter(t => t.assignedTo === S.me.email), today, now: new Date().toISOString(),
    jobValue: md() ? j => value(j, { remaining: true }) : null });   // money for Levi only
}
function ensureDigest() {
  if (!office() || !S.me) return;
  const day = todayIso();
  if (S.digest?.day === day || digestHidden(day)) return;
  const ready = S.tasks && S.enq && S.enqState !== 'reading' && ((S.salesQ && S.salesF) || S.salesErr) && (S.hist || !S.xero || S.histErr);
  if (!ready && digestWait !== 'done') { digestWait ??= setTimeout(() => { digestWait = 'done'; if (S.tab === 'home') render(); }, 8000); return; }
  buildDigest();
}
async function buildDigest(force) {
  const day = todayIso(), picks = digestPicksNow(), role = md() ? 'md' : 'office';
  S.digest = { day, picks, greeting: '', lines: [], busy: !!picks.length };
  await null;   // never render from inside a render
  const done = x => { if (S.digest?.day === day) S.digest = { day, picks, greeting: '', lines: [], ...x, busy: false }; if (S.tab === 'home') render(); };
  if (!picks.length) return done({});
  if (!force) {
    const cached = await data.loadDigest(day).catch(() => null);
    if (cached && samePicks(cached.picks, picks)) return done({ greeting: cached.greeting, lines: cached.lines });
  }
  try {
    const r = await data.salesAi(digestFacts(S.me.name, role, picks), 'digest');
    const lines = picks.map((p, i) => String(r.lines?.[i] || '').trim() || fallbackLine(p));
    data.saveDigest(day, { picks, greeting: r.greeting || '', lines, model: r.model || '' }).catch(() => {});
    done({ greeting: r.greeting || '', lines });
  } catch { done({ lines: picks.map(fallbackLine), fallback: true }); }   // no toast: the picks are still useful
}
function digestHtml() {
  if (!office() || !S.me) return '';
  ensureDigest();
  const day = todayIso(), d = S.digest;
  return d?.day === day && !digestHidden(day) ? renderDigest(d, { esc }) : '';
}
function hideDigest() {
  const day = todayIso(); S.digestHidden = day;
  try { localStorage.setItem('clj.digest.' + day, 'hidden'); } catch { /* this visit only */ }
  toast('Hidden until tomorrow.', () => { S.digestHidden = null; try { localStorage.removeItem('clj.digest.' + day); } catch { /* ok */ } render(); });
  render();
}

async function sendEnquiryReply(id) {
  const e = (S.enq || []).find(x => x.id === id); if (!e) return;
  const subject = $('er-subj').value.trim(), parts = $('er-body').value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  if (!subject || !parts.length) return toast('The reply needs a subject and some text.', null, true);
  try {
    const link = await data.draftEmail({ to: e.fromEmail, subject, html: aiEmailHtml({ greeting: parts[0], paragraphs: parts.slice(1) }, S.me.name) });
    await data.setEnquiry(id, { status: 'replied', by: S.me.email });
    if (e.customerKey) data.addSalesAction({ customer: e.company || e.fromName, kind: 'email', note: e.kind === 'customer' ? `Reply to their email: ${e.summary || e.subject}` : `Reply to enquiry: ${e.wants || e.subject}` }).catch(() => {});
    S.enqReply = null; S.enq = await data.loadEnquiries();
    toast(`The reply to ${e.fromName || e.fromEmail} is in your Outlook Drafts. Check it and press Send.`);
    if (link) window.open(link, '_blank', 'noopener');
  } catch (x) { toast(mailErr(x), null, true); }
  render();
}
/**
 * A customer's question on a quote, onto the chase list (Philip, 21 Oct: "can you break down the price increase", "does
 * the quoted price include folding"): noted on the quote as "Customer asked: …" so Levi sees it on the card, its
 * follow-up set to today so it is in Chase these today, and the email marked done.
 */
async function emailToChase(id) {
  const e = (S.enq || []).find(x => x.id === id); if (!e) return;
  const q = e.quoteSpId != null ? salesQuote(e.quoteSpId) : null;
  if (!q) return toast('The quote this email is about is not in the quote calculator yet (or is still loading). Add a task instead.', null, true);
  try {
    await data.addSalesAction({ spId: q.spId, customer: q.customer, kind: 'note', note: `${ASKED} ${e.summary || e.wants || e.subject}`.slice(0, 500) });
    await data.setFollow(q, { nextOn: todayIso() });
    await data.setEnquiry(id, { status: 'ignored', by: S.me.email });
    S.enq = await data.loadEnquiries(); S.salesActs = await data.loadActions().catch(() => S.salesActs || []);
    toast(`${q.quoteNo} is on today's chase list, with the customer's question on its card.`);
  } catch (x) { toast(x.message, null, true); }
  loadSalesData(); render();
}
async function enquiryToCustomer(id) {
  const e = (S.enq || []).find(x => x.id === id); if (!e) return;
  const name = (prompt('Customer name', e.company || e.fromName || '') || '').trim(); if (!name) return;
  const key = normName(name);
  try {
    await data.savePerson({ key, customer: name, role: 'orders', name: e.person || e.fromName, email: e.fromEmail, phone: e.phone, notes: 'From an enquiry', main: !bookFor(name).people.some(p => p.role === 'orders') });
    await data.setEnquiry(id, { customerKey: key });
    await reload(); openCustomer(key, name);
    toast(`${name} added to Customers with ${e.person || e.fromName} as the orders contact.`);
  } catch (x) { toast(x.message, null, true); }
}
function openCustomer(key, name, tab = 'overview') { S.tab = 'customers'; S.cust = key; S.custName = name || S.custName; S.ctab = tab; S.bookEdit = null; closeDoc(); S.open = null; render(); window.scrollTo(0, 0); }

/** A customer's page: everything the board knows about them, from its own records, Xero and the quote calculator. */
function customerPageHtml(key, name) {
  const today = todayIso(), base = S.hist ? customerBase(S.hist.invoices, today) : [], c = base.find(x => x.key === key) || null;
  const F = S.salesF || { follow: {}, actions: [] };
  const quotes = (S.salesQ || []).filter(q => normName(q.customer) === key).map(q => ({ ...q, value: quoteValue(q), lost: F.follow?.[q.spId]?.state === 'lost' ? (F.follow[q.spId].lostReason || 'yes') : null }))
    .sort((a, b) => (b.quoteDate || '').localeCompare(a.quoteDate || ''));
  const openQ = office() && S.salesQ ? salesModel().open.filter(q => normName(q.customer) === key) : quotes.filter(q => q.status !== 'Ordered' && !q.lost);
  const stageOf = new Map(openQ.map(q => [q.spId, q.stage]));
  const jobs = S.jobs.filter(j => !j.preview && normName(j.customer) === key).sort((a, b) => (b.ordered || '').localeCompare(a.ordered || ''));
  const invoices = (S.hist?.invoices || []).filter(x => normName(x.customer) === key).sort((a, b) => b.date.localeCompare(a.date));
  const tasks = (S.tasks || []).filter(t => t.customerKey === key || normName(t.customer) === key);
  const actions = (S.salesActs || F.actions || []).filter(a => normName(a.customer) === key);
  const prompts = [];
  if (c) {
    for (const r of reordersDue([c], today)) prompts.push(`Usually orders <b>${esc(r.item)}</b> every ${r.every} days; last ${esc(fmt(r.last))} (${r.since} days ago).`);
    for (const m of couldBuyMore([c], S.jobs)) prompts.push(`Has never had ${esc(m.missing.join(' or '))} from us: worth asking whether they get it done elsewhere.`);
    if (c.quiet) prompts.push(`Usually orders every ${c.usual} days; nothing for ${c.since}.`);
  }
  const tab = S.ctab || 'overview';
  if (tab === 'emails' && !S.cmail?.[key]) setTimeout(() => loadCustomerMail(key), 0);
  if (tab === 'overview' && office() && S.insight?.[key] === undefined) { S.insight = { ...(S.insight || {}), [key]: null }; data.loadInsight(key).then(x => { S.insight[key] = x; render(); }).catch(() => {}); }
  const m = S.cmail?.[key], cf = ['overview', 'files'].includes(tab) && S.sp?.ready ? custFiles(key) : (spReady(), null);
  return renderCustomerPage({ filesHtml: tab === 'files' ? filesTabHtml(key, name) : '', quoteHist: quoteHistWords(cf?.hist), tab, c, md: md(), office: office(), today, staff: staffList(), jobs, invoices, tasks, timeline: timeline({ key, jobs, invoices, quotes, actions, tasks, enquiries: S.enq || [] }),
    quotes: quotes.map(q => ({ ...q, stage: stageOf.get(q.spId) })), openQuotes: openQ, openOrders: jobs.filter(j => ['upcoming', 'current'].includes(stage(j))).length,
    insight: S.insight?.[key] || null, insightBusy: S.insightBusy === key, prompts, statusChips, jobValue: j => value(j),
    quotesState: S.salesErr ? `<div class="err">The quote calculator could not be read: ${esc(S.salesErr)}</div>` : !S.salesQ ? '<p class="note">Reading the quote calculator…</p>' : '',
    histNote: !S.xero ? '<p class="note">Xero is not connected.</p>' : S.histErr ? `<div class="err">Xero's invoices could not be read: ${esc(S.histErr)}</div>` : !S.hist ? '<p class="note">Reading Xero…</p>' : S.histNote ? `<p class="note">${esc(S.histNote)}</p>` : '',
    mail: m ? { ...m, messages: (m.messages || []).map(x => ({ ...x, out: domainOf(x.from) === ownDomain(), box: x.mailbox === 'me' ? 'your mailbox' : x.mailbox })) } : null }, { esc, fmt, gbp });
}
async function loadCustomerMail(key) {
  const emails = [...S.book.people.filter(p => p.key === key).map(p => p.email), ...S.jobs.filter(j => normName(j.customer) === key).map(j => j.contactEmail),
    ...(S.salesQ || []).filter(q => normName(q.customer) === key).map(q => q.contactEmail), ...(S.enq || []).filter(e => e.customerKey === key).map(e => e.fromEmail)];
  const terms = mailTerms(emails, ownDomain());
  S.cmail = { ...(S.cmail || {}), [key]: { state: terms.length ? 'loading' : 'none', terms } }; render();
  if (!terms.length) return;
  const boxes = ['me', enquiryMailbox(), ...staffList().filter(s => ['md', 'office'].includes(s.role) && s.email !== S.me.email && domainOf(s.email) === ownDomain()).map(s => s.email)];
  const r = await data.searchMail([...new Set(boxes)], terms);
  S.cmail[key] = { state: 'ok', terms, ...r }; if (S.tab === 'customers') render();
}
async function writeInsight(key, name) {
  const today = todayIso(), c = (S.hist ? customerBase(S.hist.invoices, today) : []).find(x => x.key === key);
  if (!c) return toast('There are no Xero invoices for this customer yet, so there is nothing to summarise.', null, true);
  S.insightBusy = key; render();
  try {
    const facts = { ...customerFacts(c, { openQuotes: (S.salesQ ? salesModel().open : []).filter(q => normName(q.customer) === key), from: S.me.name }),
      trend: trendWords(c), quotesWon: (S.salesQ || []).filter(q => normName(q.customer) === key && q.status === 'Ordered').length,
      quotesNotWon: (S.salesQ || []).filter(q => normName(q.customer) === key && q.status !== 'Ordered').length,
      recentNotes: (S.salesF?.actions || []).filter(a => normName(a.customer) === key && a.note).slice(0, 6).map(a => ({ date: a.at.slice(0, 10), kind: a.kind, note: a.note })),
      openTasks: (S.tasks || []).filter(t => !t.doneAt && t.customerKey === key).map(t => t.title) };
    const r = await data.salesAi(facts, 'summary');
    const x = { summary: r.summary, nextStep: r.nextStep, at: new Date().toISOString() };
    await data.saveInsight(key, name, x, r.model).catch(() => {});
    S.insight = { ...(S.insight || {}), [key]: x };
  } catch (e) { toast(e.message, null, true); }
  S.insightBusy = null; render();
}

/* ---------- SharePoint files (Company Data, read only): customers' folders, drawings by part number, material certificates ---------- */
/** The folder lists and the folders linked by hand, read once a visit (office). Resolves when ready. */
function spReady() {
  if (!office()) return Promise.resolve(false);
  S.spWait ??= (async () => {
    S.sp = { links: [], clients: [], laser: [], certs: [], misc: null, ready: false, err: null, certErr: null, files: {} };
    try {
      const [links, clients, laser] = await Promise.all([data.loadCustomerFolders().catch(() => []), data.companyFolders('clients'), data.companyFolders('laser')]);
      const misc = clients.find(f => f.name.toUpperCase() === CONFIG.SP_MISC) || null;
      Object.assign(S.sp, { links, misc, clients: clients.filter(f => f !== misc), laser, ready: true });
    } catch (e) { S.sp.err = e.message; }   // shown on the page; a reload tries again
    data.companyFolders('certs').then(c => { S.sp.certs = c; }).catch(e => { S.sp.certErr = `The certificate folders could not be read: ${e.message}`; }).then(() => render());
    render(); return S.sp.ready;
  })();
  return S.spWait;
}
const spFolders = key => customerFolders(key, S.sp?.links, S.sp || {});
/** A customer's files from their client and laser folders, read once a visit: { state, files, hist } or null until the lists are read. */
function custFiles(key, quiet = false) {
  if (!S.sp?.ready) { spReady(); return null; }
  if (S.sp.files[key]) return S.sp.files[key];
  const fs = spFolders(key), entry = S.sp.files[key] = { state: 'loading', files: [], hist: null };
  const read = (f, label) => f ? data.filesIn(f).then(list => list.map(x => ({ ...x, path: [label, x.path].filter(Boolean).join('/') }))) : Promise.resolve([]);
  entry.done = Promise.all([read(fs.client.folder, ''), read(fs.laser.folder, 'Laser drawings')])
    .then(([c, l]) => { entry.files = [...c, ...l]; entry.client = c; entry.state = 'ok'; entry.hist = quoteHistory(c, { key }); })
    .catch(e => { entry.state = 'error:' + e.message; })
    .then(() => S.sp.misc ? data.filesIn(S.sp.misc).then(m => { entry.hist = quoteHistory(entry.client || [], { key, misc: m }); }).catch(() => {}) : null)
    .then(() => { if (!quiet) render(); });
  return entry;
}
function filesTabHtml(key, name) {
  spReady();
  const v = S.spView?.key === key ? S.spView : (S.spView = { key, q: '', all: {}, pick: null }); v.name = name;
  const cf = S.sp?.ready ? custFiles(key) : null;
  return renderFilesTab({ name, office: office(), folders: S.sp?.ready ? spFolders(key) : null, lists: { ready: !!S.sp?.ready, clients: S.sp?.clients || [], laser: S.sp?.laser || [] },
    files: cf?.files || [], state: cf?.state, err: S.sp?.err, q: v.q, pick: v.pick, all: v.all, hist: cf?.hist }, { esc, fmt });
}
async function linkFolder(kind, none) {
  const key = S.cust, name = S.spView?.name || S.custName || key, list = kind === 'client' ? S.sp.clients : S.sp.laser;
  let folder = null;
  if (!none) {
    const want = ($('sp-pick')?.value || '').trim().toLowerCase();
    folder = list.find(f => f.name.toLowerCase() === want) || null;
    if (!folder) return toast('Pick a folder from the list as you type.', null, true);
  }
  try {
    await data.setCustomerFolder(key, name, kind, folder);
    S.sp.links = await data.loadCustomerFolders(); delete S.sp.files[key]; S.spView.pick = null;
    toast(folder ? `${folder.name} linked to ${name}.` : `Noted: ${name} has no ${kind === 'client' ? 'client' : 'laser drawings'} folder.`);
  } catch (e) { toast(e.message, null, true); }
  render();
}
async function unlinkFolder(kind) {
  try { await data.clearCustomerFolder(S.cust, kind); S.sp.links = await data.loadCustomerFolders(); delete S.sp.files[S.cust]; S.spView.pick = null; } catch (e) { toast(e.message, null, true); }
  render();
}
/** Does an order name any part numbers (on its lines, or a Parts part of this customer)? Only then are the folders searched. */
const namesParts = j => j.lines.some(l => lineNumbers(l).length) || partsOnJob(S.parts || [], j).length > 0;
function foundOnJob(j) {
  if (!office() || !namesParts(j)) return '';
  const cf = custFiles(normName(j.customer));
  if (!cf || cf.state === 'loading') return foundDrawingsHtml({ state: S.sp?.err ? '' : 'loading' }, { esc, fmt });
  if (cf.state !== 'ok') return '';
  return foundDrawingsHtml({ jobId: j.id, found: foundDrawings(j, cf.files, S.parts || []) }, { esc, fmt });
}
async function attachSpFile(jobId, itemId) {
  const j = job(jobId), f = S.sp?.files[normName(j?.customer)]?.files.find(x => x.itemId === itemId); if (!j || !f) return;
  try { await data.linkSpFile(jobId, f); toast(`${f.name} attached to ${j.so}. It is the same file in SharePoint, not a copy.`); await reload(); } catch (e) { toast(e.message, null, true); }
}
function certsPanel(j) {
  if (!office()) return '';
  const grades = gradesOnJob(j); if (!grades.length) return '';
  spReady(); if (!S.sp?.ready && !S.sp?.err) return '';
  return certsHtml({ certs: certFolders(grades, S.sp.certs), err: S.sp.err || S.sp.certErr }, { esc });
}
/** Old quotes for the customers the Ideas AI is told about: read their folders (at most about 20 seconds). */
async function quoteHistories(keys) {
  if (!(await spReady())) return new Map();
  const reads = keys.map(k => custFiles(k, true)?.done).filter(Boolean);
  await Promise.race([Promise.all(reads), new Promise(r => setTimeout(r, 20000))]);
  return new Map(keys.map(k => [k, S.sp.files[k]?.hist]).filter(([, h]) => h));
}
/** Customers with nobody picked: who is worth a call, my tasks, who was active lately, and open orders with no contact. No money. */
function customersGlance() {
  const today = todayIso(), base = S.hist ? customerBase(S.hist.invoices, today) : [], m = S.salesQ && S.salesF ? salesModel() : null;
  const link = (key, name) => `<button class="btn link sm" type="button" data-custpage="${esc(key)}" data-custname="${esc(name)}"><b>${esc(name)}</b></button>`;
  const calls = [...(m ? m.chase.slice(0, 5).map(q => `${link(normName(q.customer), q.customer)} quote ${esc(q.quoteNo)} is worth chasing`) : []),
    ...reordersDue(base, today).slice(0, 5).map(r => `${link(r.key, r.customer)} usually orders ${esc(r.item)} every ${r.every} days; last ${esc(fmt(r.last))}`),
    ...quietCustomers(base).slice(0, 5).map(c => `${link(c.key, c.customer)} ${c.lapsed ? 'has stopped ordering' : 'has gone quiet'}; last order ${esc(fmt(c.last))}`)];
  const tg = taskGroups(S.tasks || [], today, S.me.email), tasks = [...tg.overdue, ...tg.today, ...tg.soon].slice(0, 8);
  const seen = new Set(), recent = [...S.jobs.filter(j => !j.preview).map(j => ({ key: normName(j.customer), name: j.customer, at: j.createdAt || j.ordered || '', what: `order ${j.so}` })),
    ...(S.salesQ || []).map(q => ({ key: normName(q.customer), name: q.customer, at: q.quoteDate || '', what: `quote ${q.quoteNo}` })),
    ...(S.enq || []).filter(e => e.customerKey).map(e => ({ key: e.customerKey, name: e.company || e.fromName, at: e.receivedAt || '', what: 'email to info@' }))]
    .filter(x => x.name && x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).filter(x => !seen.has(x.key) && seen.add(x.key)).slice(0, 8);
  const hasPeople = new Set(S.book.people.map(p => p.key)), noOne = new Map();
  for (const j of S.jobs) if (!j.preview && j.status !== 'cancelled' && ['upcoming', 'current'].includes(stage(j)) && !hasPeople.has(normName(j.customer))) noOne.set(normName(j.customer), j.customer);
  const list = (items, empty) => items.length ? `<ul class="cfacts">${items.map(x => `<li>${x}</li>`).join('')}</ul>` : `<p class="note">${empty}</p>`;
  return `<div class="cglance">
    <section class="panel"><h3>Worth a call</h3>${list(calls, S.hist || m ? 'Nobody needs a call today.' : 'Reading Xero and the quote calculator…')}</section>
    <section class="panel"><h3>Your tasks</h3>${list(tasks.map(t => `<b>${esc(t.title)}</b>${t.customer ? ' · ' + link(t.customerKey || normName(t.customer), t.customer) : ''} <span class="chip ${t.dueOn < today ? 'late' : t.dueOn === today ? 'soon' : ''}">${t.dueOn < today ? 'was due ' : 'due '}${t.dueOn === today ? 'today' : esc(fmt(t.dueOn))}</span>`), 'No tasks due in the next week.')}</section>
    <section class="panel"><h3>Lately</h3>${list(recent.map(x => `${link(x.key, x.name)} <span class="note">${esc(x.what)} · ${esc(fmt(String(x.at).slice(0, 10)))}</span>`), 'Nothing yet.')}</section>
    <section class="panel"><h3>Open orders with no contact saved</h3>${list([...noOne].slice(0, 12).map(([k, n]) => `${link(k, n)}`), 'Every customer with an open order has a contact.')}
      ${noOne.size ? '<p class="note">Open one and add their buyer and goods-in contacts under <b>Contacts</b>, or copy them in from Xero.</p>' : ''}</section></div>`;
}

/* ---------- search everything (the top bar, every screen; press / to jump to it) ---------- */
let gHits = [], gSel = -1;
const searchSource = () => ({ jobs: S.jobs, customers: office() ? [...customerNames()].map(([key, name]) => ({ key, name })) : [], people: office() ? S.book.people : [],
  quotes: office() ? S.salesQ || [] : [], invoices: office() ? S.hist?.invoices || [] : [], parts: office() ? S.parts || [] : [], enquiries: office() ? S.enq || [] : [], tasks: office() ? S.tasks || [] : [] });
function showSearch() {
  const q = $('gq').value, box = $('gres');
  if (q.trim().length < 2) { box.hidden = true; gHits = []; return; }
  const groups = searchAll(q, searchSource(), { office: office() }); let n = 0;
  gHits = groups.flatMap(g => g.items); gSel = gHits.length ? 0 : -1;
  box.innerHTML = groups.length ? groups.map(g => `<div class="gg"><h4>${esc(g.title)}${g.more ? ` <span>+${g.more} more: type more to narrow</span>` : ''}</h4>
      ${g.items.map(x => `<button type="button" class="gi${n === 0 ? ' on' : ''}" data-gi="${n++}"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('')}</div>`).join('')
    : `<p class="gnone">Nothing found for “${esc(q.trim())}”.</p>`;
  box.hidden = false;
}
function closeSearch() { $('gres').hidden = true; gSel = -1; }
/** Opens a search result: an order, a customer's page (at the right tab), a part, an enquiry. */
function goHit(i) {
  const x = gHits[i]; if (!x) return;
  $('gq').value = ''; closeSearch(); $('gq').blur();
  if (x.kind === 'job' || x.kind === 'dn') { S.open = x.id; S.ask = null; keepInputs = false; return render(); }
  if (x.kind === 'quote') { const j = S.jobs.find(j => j.spQuoteId === x.id); if (j) { S.open = j.id; return render(); } return openCustomer(x.key, x.name, 'quotes'); }
  if (x.kind === 'customer') return openCustomer(x.key, x.name);
  if (x.kind === 'person') return openCustomer(x.key, x.name, 'contacts');
  if (x.kind === 'invoice') return openCustomer(x.key, x.name, 'orders');
  if (x.kind === 'part') { S.tab = 'parts'; S.partOpen = x.id; S.psearch = ''; render(); return window.scrollTo(0, 0); }
  if (x.kind === 'enquiry') { S.tab = 'customers'; S.cust = null; S.enqOpen = x.id; render(); return setTimeout(() => $('enquiries')?.scrollIntoView({ behavior: 'smooth' }), 50); }
  if (x.kind === 'task') { if (x.key) return openCustomer(x.key, x.name, 'tasks'); S.tab = 'home'; return render(); }
}
document.addEventListener('keydown', e => {
  const inBox = e.target.id === 'gq';
  if (e.key === '/' && !inBox && !e.target.closest('input,textarea,select,[contenteditable]') && $('gq') && !$('app').hidden) { e.preventDefault(); $('gq').focus(); return; }
  if (!inBox || $('gres').hidden) { if (inBox && e.key === 'Escape') $('gq').blur(); return; }
  const move = d => { gSel = (gSel + d + gHits.length) % gHits.length; document.querySelectorAll('#gres .gi').forEach(b => b.classList.toggle('on', +b.dataset.gi === gSel)); document.querySelector('#gres .gi.on')?.scrollIntoView({ block: 'nearest' }); };
  if (e.key === 'ArrowDown' && gHits.length) { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp' && gHits.length) { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter' && gSel >= 0) { e.preventDefault(); e.stopPropagation(); const before = navOf(); goHit(gSel); if (!sameNav(before, navOf())) navPush(); }
  else if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
}, true);
document.addEventListener('pointerdown', e => { if ($('gres') && !$('gres').hidden && !e.target.closest('#gsearch')) closeSearch(); });
/* Tasks: one form for Home, a customer, an enquiry or an email. */
function openTaskForm(src) {
  const today = todayIso(), f = { dueOn: plusDays(today, 1), assignedTo: S.me.email, title: '', customer: '' };
  if (src === 'cust' && S.cust) Object.assign(f, { customer: S.custName || [...S.book.people].find(p => p.key === S.cust)?.customer || (S.hist?.invoices || []).find(x => normName(x.customer) === S.cust)?.customer || S.cust });
  if (src?.startsWith('enquiry:')) { const e = (S.enq || []).find(x => x.id === +src.slice(8)); if (e) Object.assign(f, { title: e.kind === 'customer' ? emailTaskTitle(e, S.jobs.find(j => j.id === e.jobId)?.so || e.refs?.so || '')
    : `Quote for ${e.company || e.fromName}: ${e.wants || e.subject}`.slice(0, 200), customer: e.company || (e.customerKey && S.book.people.find(p => p.key === e.customerKey)?.customer) || '', source: 'enquiry', sourceRef: e.id, dueOn: today }); }   // a customer's email: "Sort out SO-…: …" for a complaint
  if (src?.startsWith('idea:')) { const i = (S.ideas || []).find(x => x.id === +src.slice(5)); if (i) Object.assign(f, { title: i.title.slice(0, 200), customer: i.customer || '', note: i.angle || '' }); }
  if (src?.startsWith('rs:')) { const [, key, n] = src.split(':'), r = (S.research || []).find(x => x.key === key), o = r?.openings[+n]; if (o) Object.assign(f, { title: o.idea.slice(0, 200), customer: r.customer, note: o.angle || '' }); }
  if (src?.startsWith('email:')) { const m = Object.values(S.cmail || {}).flatMap(x => x.messages || []).find(x => x.id === src.slice(6)); if (m) Object.assign(f, { title: `Reply to: ${m.subject}`.slice(0, 200), customer: S.custName || '', source: 'email', sourceRef: m.internetMessageId }); }
  S.taskForm = f;
  const names = [...new Set([...S.book.people.map(p => p.customer), ...S.jobs.map(j => j.customer), ...(S.hist?.invoices || []).map(x => x.customer)])].filter(Boolean).sort();
  $('doc').innerHTML = `<div class="docbar"><span>Tasks show on Home for the person they are for.</span><button class="btn" type="button" data-taskcancel>Close</button></div>${taskForm(f, { staff: staffList(), customers: names }, { esc })}`;
  $('doc').hidden = false; document.body.classList.add('doc-open'); $('tk-title')?.focus();
}
async function saveTask() {
  const f = S.taskForm, title = $('tk-title').value.trim(), customer = $('tk-cust').value.trim(), dueOn = $('tk-due').value, assignedTo = $('tk-who').value;
  if (!title || !dueOn) { $('tk-err').textContent = 'Say what needs doing and when.'; $('tk-err').hidden = false; return; }
  try {
    await data.addTask({ title, customer, customerKey: customer ? normName(customer) : '', dueOn, assignedTo, source: f.source, sourceRef: f.sourceRef });
    S.taskForm = null; closeDoc(); S.tasks = await data.loadTasks();
    toast(`Task saved for ${(staffList().find(x => x.email === assignedTo)?.name || assignedTo).split(' ')[0]}, due ${fmt(dueOn)}.`);
  } catch (e) { $('tk-err').textContent = e.message; $('tk-err').hidden = false; return; }
  render();
}
async function toggleTask(id, done) {
  const t = (S.tasks || []).find(x => x.id === id); if (!t) return;
  try {
    await data.setTask(id, { done }, S.me.email); S.tasks = await data.loadTasks();
    if (done) toast(`Done: ${t.title}`, async () => { await data.setTask(id, { done: false }, S.me.email); S.tasks = await data.loadTasks(); render(); });
  } catch (e) { toast(e.message, null, true); }
  render();
}
/** Won quotes not yet sales orders (SharePoint's and Xero's), or null until SharePoint's quotes are read. */
const wonWaiting = () => S.quotesRaw ? (quotes() || []).filter(q => q.state === 'waiting').length + xeroWaiting().length : null;
/** Home's Today panel: for Mandy, Today and Sales this week side by side; for Levi, Sales this week and his tasks. */
function todayHtml() {
  if (!office()) return '';
  const today = todayIso(), tasks = taskGroups(S.tasks || [], today, S.me.email);
  let chase = [], reorders = [], quiet = [];
  const rm = reorderModel();
  { if (S.salesQ && S.salesF) chase = salesModel().chase; if (S.hist) { quiet = quietCustomers(customerBase(S.hist.invoices, today)); reorders = rm.round.filter(r => r.state === 'due'); } }
  const gaps = md() ? {} : homeGaps(S.jobs, S.book?.people || []);   // Mandy's Today and Sales tiles (21 Oct)
  const m = { ...morning({ enquiries: S.enq || [], tasks, chase, reorders, quiet, won: wonWaiting(), ...gaps }), today };   // the tile counts only those still to ask
  return renderToday({ m, tasks, md: md(), me: S.me.email, staff: staffList(), panel: md() }, { esc, fmt });
}
const floorNotesHtml = () => office() ? floorNotesBox(newNotes(S.notes || [], true, S.jobs.filter(j => j.status !== 'cancelled')), S.jobs, { esc }) : '';

/**
 * The reorder round (Philip, 21 Oct): the repeat parts due again with what was done about each (asked, not needed,
 * came back in), from Xero's invoices, the calls and emails logged, and the board's orders. Null until Xero is read.
 */
function reorderModel() {
  if (!S.hist) return null;
  const today = todayIso(), acts = S.salesActs || S.salesF?.actions || [];
  const round = reorderRound(reordersDue(customerBase(S.hist.invoices, today), today), acts, S.jobs, today);
  return { round, tally: reorderTally(round, today, md() ? j => value(j) : null), nudge: roundNudge(round, acts, today) };
}
/** The Reorder round panel: compact on Home (top 5, the Monday nudge), in full on CRM › Follow-ups. */
function reordersHtml(compact) {
  if (!office()) return '';
  const r = reorderModel();
  if (!r) return renderReorders({ round: [], tally: {}, compact, loading: !!S.xero && !S.histErr, err: !S.xero ? 'Xero is not connected, so the repeat parts are not known. Connect it on the Xero tab.' : S.histErr ? `Xero's invoices could not be read, so the repeat parts are not known: ${S.histErr}` : '' }, { esc, fmt, gbp });
  return renderReorders({ ...r, md: md(), compact, nudge: compact ? r.nudge : 0, today: todayIso() }, { esc, fmt, gbp });
}
/** Asked about a repeat part (by hand after a call, or by the AI email), or not needed for 90 days. */
async function reorderAction(key, item, kind) {
  const r = reorderModel()?.round.find(x => x.key === key && x.item === item); if (!r) return;
  const until = plusDays(todayIso(), SNOOZE_FOR);
  try {
    await data.addSalesAction({ customer: r.customer, kind, note: kind === 'reorder' ? reorderNote(item) : snoozeNote(item, until) });
    S.salesActs = await data.loadActions().catch(() => S.salesActs || []);
    toast(kind === 'reorder' ? `Noted: ${r.customer} asked about ${item}.` : `${item} for ${r.customer} is put away until ${fmt(until)}.`);
  } catch (e) { toast(e.message, null, true); }
  render();
}

/* ---------- CRM (Levi and Mandy; the month against the target Levi only): quotes to chase, customers gone quiet ---------- */
async function loadSalesData(fresh) {
  if (S.salesLoading) return; S.salesLoading = true; S.salesErr = null;
  try {
    const [qs, f] = await Promise.all([fresh || !S.salesQ ? data.allQuotes() : S.salesQ, data.loadSales()]);
    S.salesQ = qs; S.salesF = f;
  } catch (e) { S.salesErr = e.message; }
  S.salesLoading = false;
  ensureHistory(fresh);
  if (S.tab === 'sales') render();
}
/** Everything the Sales screen shows, worked out from the quotes, follow-ups, orders and Xero. */
function salesModel() {
  const today = todayIso(), F = S.salesF || { follow: {}, actions: [] };
  const quotes = (S.salesQ || []).map(q => ({ ...q, jobId: S.jobs.find(j => j.spQuoteId === q.spId)?.id || null }));
  const stats = winStats(quotes, F.follow, today);
  const open = pipeline(quotes, F.follow, F.actions, stats, today);
  const base = S.hist ? customerBase(S.hist.invoices, today) : null;
  return { today, quotes, stats, open, chase: chaseList(open), actions: F.actions, base, quiet: base ? quietCustomers(base) : [],
    month: monthGap({ target: Number(S.settings?.monthly_target) || null, jobs: S.jobs, quotes, open, stats, today, jobValue: j => value(j) }) };
}
/* ---------- Ideas (CRM, Levi and Mandy): AI ideas from the board's facts, and customers' websites read by AI ---------- */
function ensureIdeas() {
  if (S.ideasLoaded) return; S.ideasLoaded = true;
  Promise.all([data.loadIdeas(), data.loadResearch()]).then(([i, r]) => { S.ideas = i; S.research = r; S.ideasErr = null; })
    .catch(e => { S.ideasErr = e.message; S.ideas = S.ideas || []; S.research = S.research || []; }).then(() => { if (S.tab === 'sales') render(); });
}
function ideaCustomers() {
  const base = S.hist ? customerBase(S.hist.invoices, todayIso()) : [];
  const seen = new Set(base.map(c => c.key)), out = base.map(c => ({ key: c.key, customer: c.customer }));
  for (const name of [...S.jobs.map(j => j.customer), ...S.book.people.map(p => p.customer)]) { const k = normName(name); if (name && !seen.has(k)) { seen.add(k); out.push({ key: k, customer: name }); } }
  return out;
}
const customerEmails = key => [...S.book.people.filter(p => p.key === key).map(p => p.email), ...S.jobs.filter(j => normName(j.customer) === key).map(j => j.contactEmail),
  ...(S.enq || []).filter(e => e.customerKey === key || normName(e.company || '') === key).map(e => e.fromEmail)];
function ideasHtml() {
  ensureIdeas(); ensureHistory();
  if (!S.ideas) return '<p class="note">Loading ideas…</p>';
  return renderIdeas({ board: ideaBoard(S.ideas), research: S.research || [], customers: ideaCustomers(), busy: S.ideaBusy || {}, rs: S.rs || {}, err: S.ideasErr }, { esc, fmt });
}
async function thinkOfIdeas() {
  if (!S.hist) return toast('The customer history from Xero is still loading. Try again in a moment.', null, true);
  const today = todayIso(), base = customerBase(S.hist.invoices, today), m = S.salesQ && S.salesF ? salesModel() : null;
  S.ideaBusy = { ...(S.ideaBusy || {}), ideas: true }; render();
  try {
    const oldQuotes = await quoteHistories(base.filter(c => c.orders > 0).slice(0, 30).map(c => c.key)).catch(() => new Map());   // from their SharePoint folders
    const facts = ideasFacts({ base, more: couldBuyMore(base, S.jobs), reorders: reordersDue(base, today), chase: m ? m.chase.length : 0, stats: m?.stats, funnel: enquiryFunnel(S.enq || [], today), research: S.research || [], oldQuotes });
    const r = await data.salesAi(facts, 'ideas');
    const keyOf = name => ideaCustomers().find(c => c.customer === name || c.key === normName(name))?.key || null;
    await data.saveIdeas((r.ideas || []).map(i => ({ ...i, key: i.customer ? keyOf(i.customer) : null })));
    S.ideas = await data.loadIdeas(); toast(`${(r.ideas || []).length} ideas.`);
  } catch (e) { toast(e.message, null, true); }
  S.ideaBusy = { ...S.ideaBusy, ideas: false }; render();
}
async function researchCustomer(name, website) {
  name = String(name || '').trim(); if (!name) return;
  const c = ideaCustomers().find(x => x.customer.toLowerCase() === name.toLowerCase()), key = c?.key || normName(name), customer = c?.customer || name;
  const site = String(website || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || websiteGuess(customerEmails(key), ownDomain());
  const b = S.hist ? customerBase(S.hist.invoices, todayIso()).find(x => x.key === key) : null;
  S.ideaBusy = { ...(S.ideaBusy || {}), research: `Reading ${customer}'s website…` }; S.ideasErr = null; render();
  try {
    const r = await data.salesAi({ customer, website: site, theyBuy: (b?.items || []).slice(0, 6).map(i => i.item), ordersOnRecord: b?.orders || 0 }, 'research');
    if (r.found === false) toast(`The AI could not be sure it found ${customer}. Add their website and try again.`, null, true);
    await data.saveResearch(key, customer, site, r, r.model, r.costUsd);
    S.research = await data.loadResearch(); S.rs = {};
  } catch (e) { S.ideasErr = e.message; }
  S.ideaBusy = { ...S.ideaBusy, research: null }; render();
}
function renderSalesView() {
  if (!S.salesQ && !S.salesErr && !S.salesLoading) loadSalesData();
  if (S.crmView === 'ideas') { $('v-sales').innerHTML = crmHead() + ideasHtml(); return; }
  if (!S.salesQ) { $('v-sales').innerHTML = renderSales({ loading: !S.salesErr, err: S.salesErr }, { esc, fmt, gbp }); return; }
  const m = salesModel();
  $('v-sales').innerHTML = crmHead() + renderSales({ ...m, err: null, view: S.salesView, openId: S.salesOpen, histErr: S.xero ? S.histErr : 'Xero is not connected', histStale: S.histNote || '', histEarliest: S.hist?.earliest, ai: S.ai,
    reorderBox: reordersHtml(false), more: m.base ? couldBuyMore(m.base, S.jobs) : [], news: S.news, enquiriesBox: enquiriesHtml(), md: md() }, { esc, fmt, gbp });
}
function crmHead() {
  const n = (S.ideas || []).filter(i => i.status === 'new').length;
  const on = v => S.tab === 'customers' ? v === 'customers' : v === (S.crmView === 'ideas' ? 'ideas' : 'main');
  return `<div class="crmswitch"><div class="seg"><button type="button" data-crmview="main" aria-pressed="${on('main')}">Follow-ups</button>
    <button type="button" data-tab="customers" aria-pressed="${on('customers')}">${icon('customers')}Customers</button>
    <button type="button" data-crmview="ideas" aria-pressed="${on('ideas')}">${icon('spark')}Ideas${n ? ` <em>${n}</em>` : ''}</button></div></div>`;
}
const plusDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const salesQuote = spId => salesModel().open.find(q => q.spId === spId) || (S.salesQ || []).find(q => q.spId === spId);
async function chaseQuote(spId) {
  const q = salesQuote(spId); if (!q) return;
  try {
    const { subject, html } = quoteChaseEmail(q, S.me.name);
    const link = await data.draftEmail({ to: q.contactEmail, subject, html });
    await data.addSalesAction({ spId, customer: q.customer, kind: 'email', note: `Follow-up email for ${q.quoteNo}` });
    await data.setFollow(q, { nextOn: plusDays(todayIso(), 7) });
    data.logSalesEmail({ customer: q.customer, kind: 'quote' }).catch(() => {});
    toast(`Follow-up for ${q.quoteNo} is in your Outlook Drafts${q.contactEmail ? ` to ${q.contactEmail}` : ' (no email on the quote: add one)'}. Check it and press Send. Next follow-up booked for a week's time.`);
    if (link) window.open(link, '_blank', 'noopener');
  } catch (e) { toast(mailErr(e), null, true); }
  loadSalesData();
}
async function logCall(spId, customerKey) {
  const q = spId ? salesQuote(spId) : null, c = customerKey ? (salesModel().base || []).find(x => x.key === customerKey) : null;
  const who = q ? `${q.customer} about ${q.quoteNo}` : c?.customer; if (!who) return;
  const note = prompt(`Call with ${who}: what was said? (optional)`); if (note === null) return;
  try {
    await data.addSalesAction({ spId: q?.spId ?? null, customer: q ? q.customer : c.customer, kind: 'call', note: note.trim() });
    if (q) await data.setFollow(q, { nextOn: plusDays(todayIso(), 7), ...(note.trim() ? { note: note.trim() } : {}) });
    toast(q ? 'Call noted. Next follow-up booked for a week\'s time (change the date if needed).' : 'Call noted.');
  } catch (e) { toast(e.message, null, true); }
  loadSalesData();
}
async function markQuoteLost(spId, reason) {
  const q = salesQuote(spId); if (!q || !reason) return;
  try {
    await data.setFollow(q, { state: 'lost', lostReason: reason });
    await data.addSalesAction({ spId, customer: q.customer, kind: 'lost', note: reason });
    toast(`${q.quoteNo} marked lost (${reason}).`, async () => { await data.setFollow(q, { state: 'open', lostReason: '' }); await data.addSalesAction({ spId, customer: q.customer, kind: 'reopen' }); loadSalesData(); });
  } catch (e) { toast(e.message, null, true); }
  loadSalesData();
}
async function openAi(key, angle = '', reorder = '') {
  const c = (salesModel().base || []).find(x => x.key === key); if (!c) return toast('There are no Xero invoices for this customer yet, so there is nothing for the AI to go on.', null, true);
  // reorder: the repeat part this email asks about (the reorder round), noted as asked once it is in Drafts.
  S.ai = { key, angle, to: '', person: '', reorder }; S.tab = 'sales'; S.crmView = 'main'; render(); $('saibox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (c.contactId && /^[0-9a-f-]{36}$/i.test(c.contactId)) data.xero('contact', { id: c.contactId }).then(x => { if (S.ai?.key === key) { S.ai.to = x.email || ''; S.ai.person = x.person || ''; } }).catch(() => {});
}
async function writeAi(key) {
  const m = salesModel(), c = (m.base || []).find(x => x.key === key); if (!c || !S.ai) return;
  if ($('ai-angle')) S.ai.angle = $('ai-angle').value.trim();
  S.ai.busy = true; S.ai.draft = null; render();
  try {
    const facts = customerFacts(c, { person: S.ai.person, openQuotes: m.open.filter(q => normName(q.customer) === c.key), angle: S.ai.angle, from: S.me.name });
    const r = await data.salesAi(facts);
    S.ai.draft = { subject: r.subject, greeting: r.greeting, paragraphs: r.paragraphs || [] };
  } catch (e) { toast(e.message, null, true); }
  if (S.ai) S.ai.busy = false; render();
}
/** The monthly news email: one personal AI draft per ticked customer, one after another. */
async function newsEmails() {
  const text = $('news-text').value.trim(); if (!text) return toast('Write what is new first: the AI builds each email around it.', null, true);
  const picked = [...document.querySelectorAll('[data-newspick]:checked')].map(x => x.dataset.newspick);
  if (!picked.length) return toast('Tick at least one customer.', null, true);
  if (!confirm(`Draft ${picked.length} email${picked.length === 1 ? '' : 's'} in your Outlook Drafts, one per customer? (About ${picked.length}p of AI.) Nothing is sent.`)) return;
  const m = salesModel(); S.news = { text, picked, busy: '' }; let done = 0, noMail = 0;
  for (const key of picked) {
    const c = m.base.find(x => x.key === key); if (!c) continue;
    S.news.busy = `Drafting ${done + 1} of ${picked.length}…`; render();
    try {
      const x = c.contactId && /^[0-9a-f-]{36}$/i.test(c.contactId) ? await data.xero('contact', { id: c.contactId }).catch(() => ({})) : {};
      const r = await data.salesAi(customerFacts(c, { person: x.person || '', openQuotes: m.open.filter(q => normName(q.customer) === key), angle: text, from: S.me.name }), 'checkin', { news: true });
      await data.draftEmail({ to: x.email || '', subject: r.subject, html: aiEmailHtml({ greeting: r.greeting, paragraphs: r.paragraphs }, S.me.name) });
      await data.addSalesAction({ customer: c.customer, kind: 'email', note: `News email: ${r.subject}` });
      done++; if (!x.email) noMail++;
    } catch (e) { toast(`Stopped at ${c.customer}: ${mailErr(e)}`, null, true); break; }
  }
  S.news = { text, picked, busy: '' };
  toast(`${done} email${done === 1 ? '' : 's'} in your Outlook Drafts${noMail ? ` (${noMail} with no address in Xero: add it before sending)` : ''}. Check each one and press Send.`);
  loadSalesData();
}
async function draftAi(key) {
  const c = (salesModel().base || []).find(x => x.key === key); if (!c) return;
  const to = $('ai-to').value.trim(), subject = $('ai-subj').value.trim(), parts = $('ai-body').value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  if (!subject || !parts.length) return toast('The email needs a subject and some text.', null, true);
  try {
    const link = await data.draftEmail({ to, subject, html: aiEmailHtml({ greeting: parts[0], paragraphs: parts.slice(1) }, S.me.name) });
    await data.addSalesAction({ customer: c.customer, kind: 'email', note: subject });
    if (S.ai?.reorder) await data.addSalesAction({ customer: c.customer, kind: 'reorder', note: reorderNote(S.ai.reorder) }).catch(() => {});   // the reorder round: asked
    S.ai = null; S.salesActs = await data.loadActions().catch(() => S.salesActs || []);
    toast(`The email to ${c.customer} is in your Outlook Drafts${to ? '' : ' (add their email address there)'}. Check it and press Send.`);
    if (link) window.open(link, '_blank', 'noopener');
  } catch (e) { toast(mailErr(e), null, true); }
  loadSalesData();
}

/* ---------- metal prices: ask several suppliers, compare, order from one (Levi and Mandy) ---------- */
const blankMetal = () => ({ material: 'Aluminium', grade: '', form: 'Sheet', thickness: '', size: '', qty: '1', unit: 'sheets' });
/** Suppliers asked before, newest first, with the email used last time. */
function metalSuppliers() {
  const seen = new Map();
  for (const r of S.metal || []) for (const q of r.quotes) { const k = q.supplier.trim().toLowerCase(); if (!seen.has(k)) seen.set(k, { supplierId: q.supplierId, supplier: q.supplier, email: q.email }); }
  return [...seen.values()];
}
function renderMetalView() {
  if (S.xero && !S.xc && !S.xcErr) loadXeroContacts();
  if (S.xero && S.bills === undefined) { S.bills = null; data.xero('bills').then(r => { S.bills = r.bills || []; }).catch(e => { S.bills = []; S.billsErr = e.message; }).then(() => { if (S.tab === 'metal') { if (S.rfqForm) collectRfq(); render(); } }); }
  $('v-metal').innerHTML = renderMetal({ rfqs: S.metal || [], err: S.metalErr, form: S.rfqForm, open: S.rfqOpen, edit: S.mqEdit, jobs: S.jobs.filter(j => !j.preview), suppliers: metalSuppliers(),
    xeroSuppliers: S.xc ? S.xc.contacts.filter(c => c.supplier) : (S.xero ? null : []), xeroErr: S.xero ? S.xcErr : 'Xero is not connected', bills: S.xero ? S.bills : [], billsErr: S.billsErr, q: S.msearch, poJob: S.rfqPoJob }, { esc, fmt, gbp });
}
function newRfq(jobId) {
  S.rfqForm = { jobId: jobId || null, lines: [blankMetal()], note: '', needBy: '', picked: metalSuppliers().map(x => ({ ...x, on: true })) };
  S.tab = 'metal'; closeDoc(); S.open = null; render(); window.scrollTo(0, 0);
}
function collectRfq() {
  const f = S.rfqForm; if (!f || !$('rfqf')) return;
  f.jobId = +$('rf-job').value || null; f.needBy = $('rf-need').value; f.note = $('rf-note').value.trim();
  f.lines = f.lines.map((l, i) => ({ material: $('rf-m' + i).value, grade: $('rf-g' + i).value.trim(), form: $('rf-f' + i).value, thickness: $('rf-t' + i).value.trim(),
    size: $('rf-s' + i).value.trim(), qty: $('rf-q' + i).value, unit: $('rf-u' + i).value }));
  f.picked = f.picked.map((x, i) => ({ ...x, on: !!document.querySelector(`[data-rfpick="${i}"]`)?.checked, email: $('rf-e' + i)?.value.trim() ?? x.email }));
}
/** One Outlook draft per supplier; each is noted as asked once its draft exists. */
async function draftRfqEmails(r, quotes) {
  let made = 0;
  for (const q of quotes) {
    const { subject, html } = rfqEmail({ id: r.id, lines: r.lines, note: r.note, supplier: q.supplier, from: S.me.name, needBy: r.needBy ? fmtLong(r.needBy) : '' });
    await data.draftEmail({ to: q.email, subject, html });
    await data.markAsked(q.id); made++;
  }
  return made;
}
const mailErr = e => /Mail\.ReadWrite|consent|AADSTS65001/i.test(e.message) ? 'Emailing needs a one-off permission in Microsoft 365 (Mail.ReadWrite). Ask Gecko IT to grant it.' : e.message;
async function saveRfq() {
  collectRfq(); const f = S.rfqForm;
  const lines = f.lines.map(l => ({ ...l, qty: Number(l.qty) })), chosen = f.picked.filter(x => x.on);
  const err = checkRfq({ lines, suppliers: chosen });
  if (err) { $('rf-err').textContent = err; $('rf-err').hidden = false; return; }
  f.busy = true; render();
  let id = null, made = 0;
  try {
    id = await data.createRfq({ jobId: f.jobId, lines, note: f.note, suppliers: chosen });
    S.metal = await data.loadMetal();
    const r = S.metal.find(x => x.id === id);
    made = await draftRfqEmails({ ...r, needBy: f.needBy }, r.quotes);
    S.rfqForm = null; S.rfqOpen = id;
    toast(`${rfqRef(id)}: ${made} draft${made === 1 ? '' : 's'} in your Outlook Drafts. Check each one and press Send. Type the prices in here when they reply.`);
  } catch (e) {
    if (id) { S.rfqForm = null; S.rfqOpen = id; toast(`${rfqRef(id)} is saved, but ${made ? 'only ' + made + ' draft' + (made === 1 ? ' was' : 's were') + ' made' : 'no drafts were made'}: ${mailErr(e)} Use Email again on the others.`, null, true); }
    else { f.busy = false; render(); $('rf-err').textContent = e.message; $('rf-err').hidden = false; return; }
  }
  await reload();
}
function findQuote(qid) { for (const r of S.metal || []) { const q = r.quotes.find(x => x.id === qid); if (q) return { r, q }; } return {}; }
async function saveMetalQuote(qid) {
  const { r } = findQuote(qid); if (!r) return;
  const num = id => { const v = $(id)?.value.trim(); return v === '' || v == null ? null : Number(v); };
  const prices = r.lines.map((_, i) => num('mq-p' + i)), carriage = num('mq-c'), leadDays = num('mq-l');
  if ([...prices, carriage, leadDays].some(v => v != null && !(Number.isFinite(v) && v >= 0))) return toast('Prices, delivery and lead time must be numbers (0 or more).', null, true);
  if (prices.every(v => v == null)) return toast('Type at least one price, or press Cancel.', null, true);
  try { await data.saveQuote(qid, { prices, carriage, leadDays: leadDays == null ? null : Math.round(leadDays), validUntil: $('mq-v')?.value || null, note: $('mq-n')?.value.trim() || '', by: S.me.name }); S.mqEdit = null; toast('Prices saved.'); }
  catch (e) { return toast(e.message, null, true); }
  reload();
}
/** Order from one supplier: the PO form, filled in from their quote (account 5000, each line at their price). */
function orderFromQuote(qid) {
  const { r, q } = findQuote(qid); if (!r) return;
  const jobId = r.jobId || +($('rf-pojob')?.value || 0);
  if (!jobId) return toast('Choose the order this metal is for first: a purchase order goes against an order.', null, true);
  if (!r.jobId) data.setRfq(r.id, { jobId }).catch(() => {});
  openPoForm(jobId); const f = S.poForm; if (!f) return;
  f.contactId = q.supplierId; f.account = '5000';
  f.lines = r.lines.map((l, i) => ({ description: lineText(l), qty: String(l.qty), unit: String(q.prices[i]) }));
  if (q.carriage > 0) f.lines.push({ description: 'Delivery', qty: '1', unit: String(q.carriage) });
  f.copied = `${rfqRef(r.id)}, ${q.supplier}'s prices`; f.rfq = { id: r.id, supplier: q.supplier };
  showPoForm();
}

/* ---------- the workshop TV: the whiteboard on a big screen, display only ---------- */
function renderTvView() {
  // A delivery note made since the last look gets a short cheer on the TV (never when the TV first starts).
  const d = newDispatches(S.jobs, S.tvSeen || null); S.tvSeen = d.now;
  if (d.fresh.length) { S.tvCheer = { ...d.fresh[d.fresh.length - 1], until: Date.now() + 10000 }; setTimeout(() => { if (S.tab === 'tv') renderTvView(); }, 10200); }
  const cheer = S.tvCheer && S.tvCheer.until > Date.now() ? S.tvCheer : null;
  $('v-tv').innerHTML = renderTv({ jobs: S.jobs, outwork: S.outwork || [], notes: S.notes || [], today: todayIso(), now: new Date(), page: S.tvPage || 0, cheer }, { esc, fmt });
}
// Next page every 15 seconds when there are more jobs than fit, and the clock.
setInterval(() => { if (S.tab !== 'tv' || !S.me) return; S.tvPage = (S.tvPage || 0) + 1; renderTvView(); }, 15000);
// Keep the TV's screen on while it shows the board (where the browser allows it).
let tvLock = null;
function tvAwake(on) {
  if (on && !tvLock && navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then(l => { tvLock = l; l.addEventListener('release', () => { tvLock = null; }); }).catch(() => {});
  if (!on && tvLock) { tvLock.release().catch(() => {}); tvLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tab === 'tv') tvAwake(true); });
function leaveTv() { if (!S.kiosk && document.fullscreenElement) document.exitFullscreen().catch(() => {}); location.hash = '#floor'; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.tab === 'tv') leaveTv(); });
// The Leave button shows when someone moves the mouse or touches the TV, and fades again after a few seconds.
let tvTouchT;
['pointermove', 'pointerdown'].forEach(t => document.addEventListener(t, () => { if (S.tab !== 'tv') return; document.body.classList.add('tv-touch'); clearTimeout(tvTouchT); tvTouchT = setTimeout(() => document.body.classList.remove('tv-touch'), 4000); }, { passive: true }));
function renderFloor() {
  $('v-floor').innerHTML = renderShopFloor({ jobs: S.jobs, today: todayIso(), station: S.station, now: new Date(),
    kiosk: !!S.kiosk, canMove: office(), outwork: S.outwork || [], notes: S.notes || [], office: office(), outForm: S.outForm, canRemove: office() }, { esc, fmt, fmtTime, TICK });
}

/* ---------- Deliveries: the driver's screen on the phone (Philip, 22 Oct) ---------- */
// A realtime reload while a finger is on the signature box waits until the stroke ends, so nothing half-drawn is lost.
let sigDrawing = false, sigPending = false, sigPad = null;
function renderDeliveriesView() {
  if (sigDrawing) { sigPending = true; return; }
  const today = todayIso();
  if (S.dpick != null && !deliveryRuns(S.jobs, today).some(r => r.d.id === S.dpick)) {   // delivered (or cancelled) meanwhile
    const dn = S.jobs.flatMap(j => j.despatches).find(d => d.id === S.dpick)?.dn;
    if (!S.dsign?.busy && dn) toast(`${dn} has already been marked delivered.`);
    Object.assign(S, { dpick: null, sig: '', dsign: {} }); keepInputs = false;
  }
  $('v-deliveries').innerHTML = renderDeliveries({ jobs: S.jobs, today, now: new Date(), me: S.me, pick: S.dpick, signing: S.dsign || {} },
    { esc, fmt, fmtTime, lineHtml, phoneFor: deliveryPhone });
  const c = $('dl-sig');
  sigPad = c ? signaturePad(c, { value: S.sig, onStart: () => { sigDrawing = true; },
    onEnd: url => { sigDrawing = false; S.sig = url; if (S.dsign?.err) { S.dsign.err = ''; $('dl-err').hidden = true; } if (sigPending) { sigPending = false; render(); } } }) : null;
}
/** A phone number for the delivery, from the contact book (Levi and Mandy's logins read it): the site at this
 *  address, else the customer's goods-in person. '' when there is none, so no Call button. */
function deliveryPhone(j) {
  const b = bookFor(j.customer), first = s => String(s || '').split('\n')[0].trim().toLowerCase();
  const site = first(j.address) && b.sites.find(x => x.phone && first(x.address) === first(j.address));
  return (site?.phone || b.people.find(p => p.role === 'deliveries' && p.phone)?.phone || '').trim();
}
async function saveDelivery(id) {
  if (S.dsign?.busy) return;
  const nobody = !!$('dl-nobody')?.checked, name = nobody ? '' : ($('dl-name')?.value || '').trim(), note = nobody ? ($('dl-note')?.value || '').trim() : '';
  const signature = nobody ? '' : S.sig;
  const err = deliveryProblem({ name, nobody, signature, note });
  S.dsign = { nobody, err };
  if (err) { render(); return $('dl-err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  S.dsign.busy = true; render();
  const ok = await markDelivery(id, 'delivered', name, signature, note, true);
  if (ok) { Object.assign(S, { dpick: null, sig: '', dsign: {} }); keepInputs = false; history.replaceState({ ...navOf(), i: history.state?.i || 0 }, '', '#deliveries'); }
  else S.dsign.busy = false;
  render(); window.scrollTo(0, 0);
}

/* ---------- work sent out: powder coat and plating at another company (the whiteboard) ---------- */
function sendOutForm(jobId, process) {
  const j = job(jobId); if (!j) return;
  const today = todayIso();
  S.outForm = { jobId, process, supplier: suppliersUsed(S.outwork)[0] || '', items: itemsFor(j), finish: finishFor(j, process), sentOn: today, dueBack: defaultDueBack(today), note: '' };
  S.tab = 'floor'; closeDoc(); S.open = null; render(); window.scrollTo(0, 0); $('out-sup')?.focus();
}
function editOut(id) {
  const r = (S.outwork || []).find(x => x.id === id); if (!r) return;
  S.outForm = { ...r, dueTouched: true }; S.tab = 'floor'; closeDoc(); S.open = null; render(); window.scrollTo(0, 0);
}
const readOutForm = () => ({ ...S.outForm, process: $('out-proc').value, supplier: $('out-sup').value.trim(), items: $('out-items').value.trim(), finish: $('out-fin').value.trim(),
  sentOn: $('out-sent').value, dueBack: $('out-due').value, note: $('out-note').value.trim(), dueTouched: !!$('out-due').dataset.touched });
async function saveOut() {
  const f = readOutForm(), err = checkSend(f, todayIso());
  if (err) { $('out-err').textContent = err; $('out-err').hidden = false; return; }
  const btn = document.querySelector('#outf [type=submit]'); btn.disabled = true;
  const j = job(f.jobId);
  try {
    if (f.id) await data.updateOutwork(f.id, { supplier: f.supplier, items: f.items, finish: f.finish, sentOn: f.sentOn, dueBack: f.dueBack, note: f.note });
    else await data.sendOut({ ...f, by: S.me.name });
    S.outForm = null; S.station = 'out';
    toast(f.id ? `${j?.so || 'The send'} changed.` : `${j?.so || 'It'} is out at ${f.supplier}${f.dueBack ? `, due back ${fmt(f.dueBack)}` : ''}.`);
    await reload(); window.scrollTo(0, 0);
  } catch (e) { btn.disabled = false; $('out-err').textContent = e.message; $('out-err').hidden = false; }
}
/** Back from the other company: the row is closed and that process ticked done (Undo takes both back). */
async function outBack(id) {
  const r = (S.outwork || []).find(x => x.id === id), j = r && job(r.jobId); if (!r || !j) return;
  const wasDone = !!j.procs[r.process]?.done, today = todayIso();
  try {
    await data.updateOutwork(id, { backOn: today < r.sentOn ? r.sentOn : today, backBy: S.me.name });
    if (j.procs[r.process] && !wasDone) await data.setProcess(j.id, r.process, true, S.me.name);
    toast(`${j.so} back from ${r.supplier}. ${SHORT[r.process]} ticked done.`, async () => {
      try { await data.updateOutwork(id, { backOn: null }); if (!wasDone) await data.setProcess(j.id, r.process, false, S.me.name); } catch (e) { toast(e.message, null, true); }
      reload();
    });
  } catch (e) { toast(e.message, null, true); }
  reload();
}
async function removeOut(id) {
  const r = (S.outwork || []).find(x => x.id === id), j = r && job(r.jobId);
  if (!confirm(`Remove this send of ${j?.so || 'the job'} to ${r?.supplier || 'the company'}? Use it only for a mistake: it is no longer on the Sent out list.`)) return;
  try { await data.deleteOutwork(id); S.outForm = null; toast('Removed.'); } catch (e) { toast(e.message, null, true); }
  reload();
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
      + tbl(['Part', 'Qty', 'Due', 'Net'], j.lines.map(l => `<tr><td>${lineHtml(l, esc)}</td><td class="num">${l.qty}</td><td class="num">${fmt(l.due)}</td><td class="num">${l.price != null ? gbp(round2(l.qty * l.price), 2) : ''}</td></tr>`));
  }
  if (r.kind === 'xero') {
    const x = (S.xeroOrders || []).find(o => o.id === r.xeroId);
    return x ? tbl(['Description', 'Qty', 'Unit price', 'Net'], x.lines.map(l => `<tr><td>${esc(xeroLinePart(l))}</td><td class="num">${l.qty}</td><td class="num">${gbp(l.unit, 2)}</td><td class="num">${gbp(l.amount, 2)}</td></tr>`))
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
  try { [S.xc, S.xcMap] = await Promise.all([keptFor('clj.xc2', 5 * 60e3, () => data.xero('contacts', { fresh: !!fresh })), data.loadContactMap()]); }
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
    ${j.lines.filter(l => left(j, l) > 0 || sent(j, l) > 0).map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td>${lineHtml(l, esc)}${l.po ? ` <span class="note">PO ${esc(l.po)}</span>` : ''}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td>${left(j, l)}</td><td>${left(j, l) ? `<input type="number" min="0" max="${left(j, l)}" value="${defaultDespatchQty(j, l)}" id="dq-${l.id}" data-dq="${l.id}" aria-label="Quantity of ${esc(lineLabel(l))} due ${fmt(l.due)} this dispatch">` : '—'}</td></tr>`).join('')}
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
    { esc, fmt, fmtTime, gbp, dueChip, parts: dispatchParts });
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
    ${j.notes ? `<div class="panel"><div class="note">Order notes</div>${esc(j.notes)}</div>` : ''}
    ${notesPanel({ notes: S.notes || [], job: j, office: office(), name: noteName(), canRemove: office() }, { esc })}
    <div class="panel"><h3>Lines</h3><div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Due</th><th>Ordered</th><th>Desp.</th><th>Outst.</th>${money ? '<th>Unit</th><th>Net</th>' : ''}</tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${lineHtml(l, esc)}${l.po ? ` <span class="note">PO ${esc(l.po)}</span>` : ''}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td><b>${left(j, l)}</b></td>${money ? `<td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${money ? `<p class="note" style="text-align:right">Net <b>${gbp(net, 2)}</b> · VAT 20% ${gbp(round2(net * 0.2), 2)} · Total <b>${gbp(round2(net * 1.2), 2)}</b></p>` : ''}
      ${deliveryRow(j)}</div>
    ${drawingsPanel(j)}${certsPanel(j)}
    <div class="panel"><h3>Processes</h3><div class="pbtns">${procButtons(j)}</div>${outPanel(j)}</div>
    <div class="panel"><h3>Dispatched</h3>${j.despatches.length ? `<table class="lines"><thead><tr><th>Note</th><th>Date</th><th>Items</th><th>Emailed</th><th>Delivered</th>${money ? '<th>Net</th><th>Invoice</th>' : ''}<th></th></tr></thead><tbody>
      ${j.despatches.map(d => `<tr><td class="mono">${esc(d.dn)}</td><td>${fmt(d.date)}</td><td>${Object.values(d.lines).reduce((a, q) => a + q, 0)}</td>
        <td>${d.emailedAt ? fmt(d.emailedAt.slice(0, 10)) : '—'}</td><td>${d.deliveredOn ? fmt(d.deliveredOn) : '<span class="note">not yet</span>'}</td>
        ${money ? `<td>${gbp(despatchValue(j, d), 2)}</td><td>${d.xero ? `<span class="chip ok">${esc(d.xero.no)}</span>` : d.deliveredOn ? '<span class="chip soon">waiting</span>' : '<span class="note">after delivery</span>'}</td>` : ''}
        <td><button class="btn sm" type="button" data-dn="${d.id}" data-job="${j.id}">View</button></td></tr>`).join('')}</tbody></table>
      <p class="note">Mark deliveries on the Dispatch tab.</p>` : '<div class="note">Nothing dispatched yet.</div>'}
      ${(j.cancelledDespatches || []).length ? `<p class="note">Cancelled dispatch notes: ${j.cancelledDespatches.map(d => esc(d.dn)).join(', ')}.</p>` : ''}</div>
    ${money ? purchasePanel(j) + proformaPanel(j) : ''}
    <div class="actions">
      <button class="btn" type="button" data-jobsheet="${j.id}">${icon('doc')}Front sheet</button>
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
    : `<div class="note">${office() ? 'No drawings yet. Attach the drawing so the shop floor can see it.' : 'No drawings on this job.'}</div>`}${foundOnJob(j)}${up}${office() ? hintBox(j) : ''}
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
      <td>${esc(p.customer)}</td><td>${cur ? `<span class="pfile">${icon('doc')}${esc(cur.name)}</span>${p.files.length > 1 ? ` <span class="note">+${p.files.length - 1} older</span>` : ''}` : '<span class="chip soon">No drawing</span>'}</td>
      <td>${ordersForPart(S.jobs, p).length}</td><td class="act"><button class="btn sm" type="button" data-partopen="${p.id}">${open ? 'Close' : 'Open'}</button></td></tr>${open ? detail(p) : ''}`; };
  const sugg = suggestedParts(S.jobs, S.parts).filter(s => !q || `${s.partNo} ${s.customer} ${s.description}`.toLowerCase().includes(q));
  const shown = S.suggAll ? sugg : sugg.slice(0, 25);
  if (S.sp?.ready) for (const k of [...new Set(shown.map(s => s.customerKey))].slice(0, 15)) custFiles(k); else spReady();   // their folders, for drawings to offer
  const suggRow = s => { const sp = suggDrawing(s); return `<tr data-dropsugg="${esc(suggKey(s))}"><td><b class="mono">${esc(s.partNo)}</b>${s.description ? `<span class="ref">${esc(s.description)}</span>` : ''}</td><td>${esc(s.customer)}</td>
    <td>${s.orders.slice(0, 4).map(j => `<button type="button" class="btn link sm" data-open="${j.id}">${esc(j.so)}</button>`).join(' ')}${s.orders.length > 4 ? ` <span class="note">+${s.orders.length - 4}</span>` : ''}</td>
    <td class="act"><label class="btn sm pri">${icon('plus')}Attach drawing<input type="file" class="sr" data-suggattach="${esc(suggKey(s))}" accept=".pdf,.png,.jpg,.jpeg,.dxf,.dwg,.step,.stp"></label>
      <button class="btn sm" type="button" data-suggadd="${esc(suggKey(s))}" title="Add the part now, drawing later">Add</button>
      ${sp ? `<div class="note spsugg">In their SharePoint folder: <a href="${esc(sp.url)}" target="_blank" rel="noopener">${esc(sp.name)}</a> <button class="btn sm" type="button" data-suggsp="${esc(suggKey(s))}">Use it</button></div>` : ''}</td></tr>`; };
  const suggSec = sugg.length ? `<section class="sugg"><div class="hsec-h"><h3>Found on your orders: ${sugg.length} part number${sugg.length === 1 ? '' : 's'} not in Parts yet</h3>
      <span class="note">drag a drawing onto a row, or press Attach drawing: that adds the part and puts the drawing on its open orders too</span></div>
    <div class="tbl-wrap"><table class="lines home"><thead><tr><th>Part</th><th>Customer</th><th>On orders</th><th class="act"><span class="sr">Action</span></th></tr></thead><tbody>${shown.map(suggRow).join('')}</tbody></table></div>
    ${sugg.length > shown.length ? `<p class="note"><button type="button" class="btn link sm" data-suggall>Show all ${sugg.length}</button></p>` : ''}
    <p class="note">Spotted from the order lines: codes like UL-PR-10448 or 361200245. Something that is not a part number? Just leave it.</p></section>` : '';
  $('v-parts').innerHTML = `<div class="home">
    <div class="hhead"><div><h2>Parts</h2><p class="sub">Customers' repeat parts and their drawings. A new order that names one of these part numbers gets its drawing attached automatically.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="orders">Sales orders</button><button class="btn pri" type="button" data-partadd="open">${icon('plus')}Add a part</button></div></div>
    ${S.partsErr ? `<div class="err">Could not load the parts: ${esc(S.partsErr)}</div>` : ''}
    ${add}
    <section><div class="hsec-h"><h3>${(S.parts || []).length} part${(S.parts || []).length === 1 ? '' : 's'}</h3><span class="note">by customer</span>
      <input type="search" id="psearch" placeholder="Search part number, customer or description" aria-label="Search parts" value="${esc(S.psearch || '')}"></div>
    ${parts.length ? `<div class="tbl-wrap"><table class="lines home"><thead><tr><th>Part</th><th>Customer</th><th>Current drawing</th><th>Orders</th><th class="act"><span class="sr">Open</span></th></tr></thead><tbody>${parts.map(row).join('')}</tbody></table></div>`
      : `<div class="tbl-wrap"><p class="allclear">${q ? 'No parts match.' : 'No parts yet. Attach drawings to the part numbers found on your orders below, press Add a part, or press Keep for this part when a drawing is attached to an order.'}</p></div>`}</section>
    ${suggSec}</div>`;
}
/** A part's drawing is new or changed: attach it to the open orders already naming the part. Returns how many. */
async function catchUpOrders(partId) {
  const p = (S.parts || []).find(x => x.id === partId); if (!p) return 0;
  const todo = openOrdersNeeding(S.jobs, p, j => onBoardStage(j) && j.status !== 'cancelled');
  let n = 0;
  for (const j of todo) { try { await data.linkPartFile(j.id, currentFile(p)); n++; } catch { /* the others still go */ } }
  return n;
}
const suggKey = s => `${s.customerKey}|${normPartNo(s.partNo)}`;
/** The best drawing for a suggested part in the customer's SharePoint folders, or null. */
const suggDrawing = s => { const cf = S.sp?.files[s.customerKey]; return cf?.state === 'ok' ? drawingsFor(s.partNo, cf.files)[0] || null : null; };
/** A suggested part (from the orders): add it, with a drawing if one was dropped or picked, or the one found in SharePoint (fromSp). */
async function addSuggested(key, file, fromSp = false) {
  const s = suggestedParts(S.jobs, S.parts).find(x => suggKey(x) === key); if (!s) return;
  const sp = fromSp ? suggDrawing(s) : null; if (fromSp && !sp) return;
  try {
    const id = await data.addPart({ customer: s.customer, customerKey: s.customerKey, partNo: s.partNo, description: s.description });
    S.parts = await data.loadParts();
    if (sp) {
      await data.addPartFile(id, { name: sp.name, driveId: sp.driveId, itemId: sp.itemId, url: sp.url, size: sp.size, mime: sp.mime });
      S.parts = await data.loadParts(); const n = await catchUpOrders(id);
      toast(`${s.partNo} added to Parts with ${sp.name} from their SharePoint folder${n ? `, and attached to ${n} open order${n === 1 ? '' : 's'} naming it` : ''}.`);
      if (n) await reload(); render();
    } else if (file) await attachPartDrawing(id, file);
    else { toast(`${s.partNo} added to Parts. Drop its drawing on it when you have it.`); render(); }
  } catch (e) { toast(e.message, null, true); }
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
  let ok = false;
  try { await data.uploadPartDrawing(p, file, x => { S.uploading.pct = x; render(); }); ok = true; }
  catch (e) { toast(e.message, null, true); }
  S.uploading = null; S.parts = await data.loadParts().catch(() => S.parts);
  if (ok) {
    const n = await catchUpOrders(p.id);
    toast(`${file.name} is now the current drawing for ${p.partNo}${n ? `, and is attached to ${n} open order${n === 1 ? '' : 's'} naming it` : ''}.`);
    if (n) await reload();
  }
  render();
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
    const line = j.lines.find(l => l.partNo && normPartNo(l.partNo) === normPartNo(partNo)) || j.lines.find(l => normPartNo(l.part).includes(normPartNo(partNo)));
    const id = p ? p.id : await data.addPart({ customer: j.customer, customerKey: normName(j.customer), partNo, description: line?.partNo ? line.part : line ? line.part.replace(new RegExp(partNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim() : '' });
    const pfId = await data.addPartFile(id, f);
    await data.markJobFileFromPart(f.id, pfId).catch(() => {});
    S.parts = await data.loadParts();
    const n = await catchUpOrders(id);
    toast(`${f.name} kept for ${partNo}${p ? ' as its current drawing' : ' (new part)'}. New orders for ${j.customer} naming ${partNo} will get it${n ? `; it is also on ${n} other open order${n === 1 ? '' : 's'} now` : ''}.`);
    h.kept = true; await reload();
  } catch (e) { toast(e.message, null, true); }
}

/* Drag and drop drawings onto an order's Drawings section (Philip, 20 Oct), office only. */
const dropZone = e => (office() && e.dataTransfer?.types?.includes('Files') ? e.target.closest?.('[data-dropjob],[data-droppart],[data-dropsugg]') : null);
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
  if (z.dataset.dropsugg) return addSuggested(z.dataset.dropsugg, files[0]);
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
/** The text of a PDF (a Blob, or its bytes: the quote pack's attachments come as bytes), first 6 pages. */
async function pdfText(src) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer()) }).promise;
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
      <button class="btn" type="button" data-pob2b="${j.id}" title="A PO for this order's parts, with the supplier and costs from the last PO for them">${icon('repeat')}Back-to-back PO</button>
      <button class="btn" type="button" data-rfnew="${j.id}" title="Ask several suppliers for the metal for this order, and compare their prices">Ask for metal prices</button></div>` : ''}</div>`;
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
  f.delivery = r.delivery && r.delivery >= todayIso() ? r.delivery : '';   // never a delivery date already gone
  f.copied = `${j.so}, back-to-back${r.costed ? ` (costs for ${r.costed} of ${r.lines.length} part${r.lines.length === 1 ? '' : 's'} from earlier POs)` : ''}`;
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
    if (f.rfq) await data.setRfq(f.rfq.id, { status: 'ordered', orderedFrom: f.rfq.supplier, orderedPo: r.number || '' }).catch(() => {});
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
    ${j.lines.map(l => `<tr><td style="text-align:left">${lineHtml(l, esc)}</td><td>${fmt(l.due)}</td><td>${l.qty}</td><td>${left(j, l)}</td><td>${unit(l.price)}</td>
      <td><input type="number" min="0" max="${l.qty}" step="1" value="${S.pfDraft.qty[l.id] || 0}" data-pq="${l.id}" style="width:90px" aria-label="Quantity on this pro forma: ${esc(lineLabel(l))}"></td></tr>`).join('')}</tbody></table></div>
    ${settings}
    <div class="actions"><button class="btn pri" type="button" data-pfcreate="${j.id}" ${S.officeSet?.payment_details ? '' : 'disabled title="Save the payment details first"'}>${icon('doc')}Make the pro forma</button></div></div>`;
}
function pfLinesFrom(j) {   // the draft's lines with the order's prices (the server takes its own prices when it is made)
  return j.lines.filter(l => (S.pfDraft.qty[l.id] || 0) > 0).map(l => ({ job_line_id: l.id, part: l.part, qty: S.pfDraft.qty[l.id], unit_price: l.price, net: round2(S.pfDraft.qty[l.id] * l.price) }));
}
/** A pro forma line as it reads: a saved one keeps only the description (create_proforma copies part), so its
 *  order line's Part no. box is looked up by job_line_id (22 Oct). */
const pfLineHtml = (j, l) => lineHtml({ partNo: j.lines.find(x => x.id === l.job_line_id)?.partNo || '', part: l.part }, esc);
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
    // The front sheet (Levi, 22 Oct: "set out like the Xero version, as each part may need a different process"):
    // the factory's paper copy for the job folder, with the drawing. No prices. The board stays the live record.
    const need = needed(j);
    // What to make on this sheet: chosen on screen before printing (S.sheet); the order is not changed.
    const pick = S.sheet?.jobId === j.id ? S.sheet.qty : Object.fromEntries(j.lines.map(l => [l.id, left(j, l)]));
    const make = j.lines.filter(l => (pick[l.id] || 0) > 0);
    const allDates = deliveryDates(j), dates = [...new Set(make.map(l => l.due))].sort();
    const which = allDates.length > 1 && dates.length ? dates.map(d => allDates.indexOf(d) + 1).filter(n => n > 0) : [];
    const pos = [...new Set(make.map(l => l.po).filter(Boolean))];
    // A box where the part needs the process (ticked if the order has it done already); nothing where it does not.
    const cell = (l, p) => `<td class="pr">${lineProcs(j, l).includes(p) ? `<span class="jbox">${j.procs[p].done ? '✓' : ''}</span>` : ''}</td>`;
    body = `<div class="ph">${logo}<div><h1>Sales order front sheet</h1><div class="dno big">${esc(j.so)}</div></div></div>
      <div class="two"><div><div class="k">Customer</div><b class="lg">${esc(j.customer)}</b>${j.address ? `<div style="white-space:pre-line">${esc(j.address)}</div>` : ''}${j.contactName ? `<div>${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Order no</span><span>${esc(j.so)}</span><span class="k">Order date</span><span>${fmtLong(j.ordered)}</span>
        <span class="k">Customer PO</span><span>${esc(j.po) || '—'}</span><span class="k">Our quote</span><span>${esc(j.quote) || '—'}</span>
        <span class="k">Required</span><span class="req"><b>${dates.length ? (dates.length > 1 ? `${fmtLong(dates[0])} to ${fmtLong(dates[dates.length - 1])}` : fmtLong(dates[0])) : '—'}</b></span>
        ${which.length ? `<span class="k">Call-off</span><span><b>${which.length > 1 ? `Deliveries ${which.join(', ')}` : `Delivery ${which[0]}`} of ${allDates.length}</b></span>` : ''}
        ${pos.length ? `<span class="k">Call-off PO</span><span><b>${esc(pos.join(', '))}</b></span>` : ''}</div></div>
      ${make.length ? `<table class="jfront"><thead><tr><th class="q">Qty</th><th class="pn">Part number</th><th>Description</th>${dates.length > 1 ? '<th class="du">Due</th>' : ''}${pos.length ? '<th class="du">Call-off PO</th>' : ''}${need.map(p => `<th class="pr">${esc(SHORT[p])}</th>`).join('')}</tr></thead><tbody>
      ${make.map(l => `<tr><td class="q"><b class="lg">${pick[l.id]}</b></td><td class="pn mono">${esc((l.partNo || '').trim())}</td><td>${esc(l.part)}</td>${dates.length > 1 ? `<td class="du">${fmt(l.due)}</td>` : ''}${pos.length ? `<td class="du">${esc(l.po) || ''}</td>` : ''}${need.map(p => cell(l, p)).join('')}</tr>`).join('')}</tbody></table>`
        : '<div class="jnote">Nothing to make on this sheet. Enter a quantity above it on screen.</div>'}
      ${!need.length ? '<div class="k" style="text-transform:none;letter-spacing:0">No processes ticked on this order.</div>' : ''}
      ${j.notes ? `<div class="jnote"><div class="k">Notes</div><div style="white-space:pre-line">${esc(j.notes)}</div></div>` : ''}
      <div class="jnote jcert"><div class="k">Certificate batch no.</div></div>
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
      ${lines.map(l => `<tr><td>${pfLineHtml(j, l)}</td><td>${l.qty}</td><td>${unit(Number(l.unit_price))}</td><td>${gbp(Number(l.net), 2)}</td></tr>`).join('') || '<tr><td colspan="4">Nothing chosen yet.</td></tr>'}</tbody></table>
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
      ${j.lines.map(l => `<tr><td>${lineHtml(l, esc)}${l.po && l.po !== j.po ? ` <span style="color:var(--paper-mute)">(your PO ${esc(l.po)})</span>` : ''}</td><td>${fmtLong(l.due)}</td><td>${l.qty}</td><td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td></tr>`).join('')}</tbody></table>
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
      ${j.lines.filter(l => (d.lines[l.id] || 0) > 0).map(l => `<tr><td>${lineHtml(l, esc)}${deliveryDates(j).length > 1 ? ` <span style="color:var(--paper-mute)">(due ${fmt(l.due)})</span>` : ''}</td><td>${l.qty}</td><td>${before(l)}</td><td><b>${d.lines[l.id]}</b></td><td>${l.qty - before(l) - d.lines[l.id]}</td></tr>`).join('')}</tbody></table>
      ${stillToCome(j, di)}
      ${receivedBlock(d)}
      <div class="foot">Please check the goods on delivery and report any shortage or damage within 48 hours, quoting ${esc(d.dn)}.</div>`;
  }
  return body;
}
/* Proof of delivery (22 Oct): a note marked delivered with a name, a signature or where it was left prints them in
   place of the blank Received by lines. A note not delivered yet, or delivered with nothing recorded (older ones),
   keeps the blank lines to sign on paper. The signature is read when the note is opened (data.loadSignature). */
const sigCache = new Map();
const sigKey = d => `${d.id}@${d.deliveredAt || ''}`;
const sigOf = d => d.signature ?? sigCache.get(sigKey(d));   // undefined: not read yet
async function ensureSignature(d) {
  if (!d?.deliveredOn || !d.deliveredAt || sigOf(d) !== undefined) return false;
  sigCache.set(sigKey(d), await data.loadSignature(d.id).catch(() => ''));
  return true;
}
function receivedBlock(d) {
  const sig = sigOf(d) || '';
  if (!d.deliveredOn || !(d.receivedBy || d.deliveryNote || sig)) return '<div class="sign"><div>Received by (print)</div><div>Signature</div><div>Date</div></div>';
  const t = d.deliveredAt ? new Date(d.deliveredAt) : null;
  const when = t && !isNaN(t) ? `${fmtLong(iso(t))} at ${t.toTimeString().slice(0, 5)}` : fmtLong(d.deliveredOn);
  const by = d.deliveredBy ? staffList().find(x => x.email?.toLowerCase() === d.deliveredBy.toLowerCase())?.name || d.deliveredBy : '';
  const name = d.receivedBy ? `<b class="lg">${esc(d.receivedBy)}</b>${d.deliveryNote ? `<div>${esc(d.deliveryNote)}</div>` : ''}`
    : `<b class="lg">Nobody to sign</b>${d.deliveryNote ? `<div>${esc(d.deliveryNote)}</div>` : ''}`;
  return `<div class="received"><div class="k">Received by</div><div class="rb"><div>${name}</div>
    <div class="rsig">${signatureOk(sig) ? `<img src="${esc(sig)}" alt="Signature" style="max-height:70px">` : ''}</div>
    <div><div>Delivered ${when}</div>${by ? `<div>Delivered by ${esc(by)}</div>` : ''}</div></div></div>`;
}
/** Before printing a front sheet: choose what this sheet is for (call-off customers make part of an
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
    <p class="note">Change <b>To make</b> for this front sheet only, for example the call-off you are making now. The order is not changed; to change the order, use Amend.</p>
    <div style="overflow-x:auto"><table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Due</th>${linePos(j).length ? '<th>Call-off PO</th>' : ''}<th>Ordered</th><th>Outstanding</th><th>To make</th></tr></thead><tbody>
    ${j.lines.map(l => `<tr${left(j, l) === 0 ? ' class="muted"' : ''}><td style="text-align:left">${lineHtml(l, esc)}</td><td>${fmt(l.due)}</td>${linePos(j).length ? `<td>${esc(l.po) || ''}</td>` : ''}<td>${l.qty}</td><td>${left(j, l)}</td>
      <td><input type="number" min="0" step="1" value="${S.sheet.qty[l.id] || 0}" data-sq="${l.id}" style="width:90px" aria-label="To make on this sheet: ${esc(lineLabel(l))} due ${fmt(l.due)}"></td></tr>`).join('')}</tbody></table></div>
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
      ${kind === 'soa' ? `<button class="btn" type="button" data-jobsheet="${jobId}">${icon('doc')}Front sheet</button>` : ''}
      ${canEmail ? `<button class="btn pri" type="button" data-emaildoc="${kind}" data-job="${jobId}" data-dnid="${despId || ''}">${icon('mail')}${sentAt ? 'Email again' : 'Email to customer'}</button>` : ''}
      ${['dn', 'soa', 'pf'].includes(kind) ? `<button class="btn" type="button" data-savedoc="${kind}" data-job="${jobId}" data-dnid="${despId || ''}" title="Save it as a PDF named ${esc(docName(kind, jobId, despId))}.pdf">${icon('doc')}Save PDF</button>` : ''}
      <button class="btn" type="button" data-print data-name="${esc(docName(kind, jobId, despId))}">${icon('print')}Print</button><button class="btn" type="button" data-closedoc>Close</button></div>
    ${kind === 'job' ? sheetEditor(j) : kind === 'pfnew' ? pfEditor(j) : ''}
    <div class="paper">${docHtml(kind, jobId, despId)}</div>`;
  $('doc').hidden = false;
  document.body.classList.add('doc-open');
  if (d) ensureSignature(d).then(got => {   // the signature arrives a moment after the note opens
    const p = $('doc').querySelector('.paper');
    if (got && p && !$('doc').hidden && $('doc').querySelector(`[data-savedoc][data-dnid="${despId}"]`)) p.innerHTML = docHtml(kind, jobId, despId);
  });
}

/** The file name a document is saved under (Philip, 20 Oct: they keep despatch notes, so the customer's name is in it). */
function docName(kind, jobId, despId) {
  const j = job(jobId); if (!j) return 'Document';
  const no = kind === 'dn' ? j.despatches.find(x => x.id === despId)?.dn : kind === 'pf' ? (S.pfs || []).find(x => x.id === despId)?.pf : kind === 'job' ? 'Front sheet' : j.so;
  const what = { dn: 'Delivery note', soa: 'Order acknowledgement', pf: 'Pro forma' }[kind];
  return [j.customer, what, no, kind === 'soa' ? '' : j.so].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|#%]+/g, '-');
}
/** Downloads the document as a PDF with that name. */
async function saveDoc(kind, jobId, despId) {
  const btn = document.querySelector('[data-savedoc]'), was = btn?.innerHTML; if (btn) { btn.disabled = true; btn.textContent = 'Making the PDF…'; }
  try {
    if (kind === 'dn') await ensureSignature(job(jobId)?.despatches.find(x => x.id === despId));
    const b64 = await pdfBase64(docHtml(kind, jobId, despId));
    const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + b64; a.download = docName(kind, jobId, despId) + '.pdf';
    document.body.append(a); a.click(); a.remove();
    toast(`Saved ${a.download} to your Downloads.`);
  } catch (e) { toast(e.message, null, true); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = was; } }
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
    if (d) await ensureSignature(d);
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
      : d.deliveredOn && (d.receivedBy || d.deliveryNote || sigOf(d))   // proof of delivery: the note as signed for
      ? `<p>${hello}</p><p>Your goods for order ${esc(j.so)}${ref} were delivered on ${fmtLong(d.deliveredOn)}. Please find attached the signed delivery note ${esc(d.dn)}.</p><p>Kind regards,<br>${esc(S.me.name)}<br>Clarke Lane Engineering Ltd</p>`
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
    if (out > 0) { const k = lineLabel(l), r = by.get(k) || { qty: 0, next: l.due, l }; r.qty += out; if (l.due < r.next) r.next = l.due; by.set(k, r); }
  }
  if (!by.size) return '<p>This completes the order.</p>';
  return `<div><div class="k">Still to come on this order</div>${[...by.values()].map(r => `${r.qty} × ${lineHtml(r.l, esc)} (next due ${fmtLong(r.next)})`).join('<br>')}</div>`;
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
  if (!office() && ['quotes', 'orders', 'customers', 'parts', 'xero', 'metal'].includes(S.tab)) S.tab = 'floor';
  if (S.kiosk && !['tv', 'deliveries'].includes(S.tab)) { S.tab = 'floor'; if (location.hash !== '#floor') history.replaceState(null, '', '#floor'); }
  if (!office() && !['floor', 'tv', 'deliveries'].includes(S.tab)) S.tab = 'floor';   // the driver's screen is the shop floor login's too (22 Oct)
  if (S.tab === 'sales' && !office()) S.tab = 'home';   // the CRM is Levi's and Mandy's; the month's figures in it are Levi's only   // the workshop TV uses the shop floor login too   // the shop floor login only has the Shop floor screen (Philip, 19 Oct)
  document.body.classList.toggle('kiosk-mode', !!S.kiosk || S.tab === 'tv');
  document.body.classList.toggle('tv-mode', S.tab === 'tv'); tvAwake(S.tab === 'tv');
  renderTabs();
  $('err').hidden = !S.error;
  if (S.error) $('err').innerHTML = `<b>The board could not load.</b> ${esc(S.error)} <button class="btn sm" type="button" data-reload>Try again</button>`;
  for (const [k] of TABS) $('v-' + k).hidden = S.tab !== k;
  ({ home: () => { if (office()) { ensureHistory(); ensureQuotes(); if (!S.salesF && !S.salesLoading) loadSalesData(); } $('v-home').innerHTML = renderHome({ digestBox: digestHtml(), todayBox: todayHtml(), notesBox: floorNotesHtml(), reorderBox: reordersHtml(true), jobs: S.jobs, me: S.me, office: office(), md: md(), monthXero: monthXero(), editTarget: S.editTarget,
      debts: !S.xero || PREVIEW.on ? { off: true } : { list: debts(), err: S.debtErr, note: S.debtNote || '', chases: S.chases || [] }, breakeven: Number(S.settings?.monthly_breakeven) || null, target: Number(S.settings?.monthly_target) || null, today: todayIso(), view: S.homeView,
      wonQuotes: wonWaiting(),
      sentOut: (() => { const b = outBoard(S.outwork || [], S.jobs, todayIso()); return { out: b.out.length, late: b.late.length, ready: b.ready.length }; })(),
      approval: !S.xero || PREVIEW.on ? { off: true } : S.inv ? awaitingApproval(S.jobs, S.inv) : { err: S.invErr, list: null } }, { esc, fmt, gbp }); },
    tv: renderTvView, metal: renderMetalView, sales: renderSalesView, orders: renderOrders, map: renderMapTab, customers: renderCustomers, parts: renderParts, jobs: renderJobs, floor: renderFloor, deliveries: renderDeliveriesView, quotes: renderQuotes, dispatch: renderDespatch, xero: renderXero, help: () => { if (!$('v-help').innerHTML) $('v-help').innerHTML = renderHelp(office()); } })[S.tab]();
  document.body.classList.toggle('on-floor', S.tab === 'floor' || S.tab === 'deliveries');   // big messages for big fingers
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
  idleT = setTimeout(() => { if (S.tab !== 'floor' || (office() && !S.kiosk) || (S.station == null && S.open == null && !S.outForm && $('doc').hidden)) return; closeDoc(); S.station = null; S.open = null; S.ask = null; S.outForm = null; render(); window.scrollTo(0, 0); }, 120000);
}
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, nudge, { passive: true }));
nudge();

/* ---------- Back: every change of screen is a step that the browser's Back, and ← Back, undoes ---------- */
const navOf = () => ({ v: 1, tab: S.tab, open: S.open ?? null, homeView: S.homeView ?? 'attention', station: S.station ?? null, wonView: S.wonView ?? 'waiting',
  dispView: S.dispView ?? null, orderView: S.orderView ?? null, desp: S.desp ?? null, form: !!S.form, dpick: S.dpick ?? null });
const sameNav = (a, b) => ['tab', 'open', 'homeView', 'station', 'wonView', 'dispView', 'orderView', 'desp', 'form', 'dpick'].every(k => (a?.[k] ?? null) === (b?.[k] ?? null));
function navPush() {
  if (sameNav(navOf(), history.state)) return;
  history.pushState({ ...navOf(), i: (history.state?.i || 0) + 1 }, '', '#' + S.tab); renderBack();
}
function renderBack() { const b = $('backrow'); if (b) b.hidden = S.tab === 'home' || S.tab === 'deliveries' || !(history.state?.i > 0); }   // Home is the start: no Back there (Philip, 20 Oct); Deliveries has its own big back button
window.addEventListener('popstate', e => {
  const n = e.state;
  if (!n?.v) { fromHash(); render(); renderBack(); return; }
  if (S.form && !n.form && !confirm('Leave this order? What you have typed is not saved.')) { history.pushState({ ...navOf(), i: (n.i || 0) + 1 }, '', '#' + S.tab); return; }
  if ((n.dpick ?? null) !== S.dpick) Object.assign(S, { sig: '', dsign: {} });   // another delivery: a clean form
  Object.assign(S, { tab: n.tab, open: n.open, station: n.station, desp: n.desp, dpick: n.dpick ?? null, ask: null, cancelDn: null });
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
  const t = e.target.closest('button,a,input[data-pick],input[data-pickall],tr[data-open],tr[data-rfopen],tr[data-sopen],tr[data-enqopen]'); if (!t) return;
  const d = t.dataset;
  if ('goback' in d) return history.back();
  if ('preview' in d) return enterPreview();
  if (d.cust) { S.cust = d.cust; S.custName = null; S.bookEdit = null; S.ctab = S.ctab || 'overview'; return render(); }
  if ('addperson' in d) { S.bookEdit = { kind: 'person', role: 'orders', main: false }; return render(); }
  if ('addsite' in d) { S.bookEdit = { kind: 'site', main: false }; return render(); }
  if (d.editperson) { S.bookEdit = { kind: 'person', ...S.book.people.find(p => p.id === +d.editperson) }; return render(); }
  if (d.editsite) { S.bookEdit = { kind: 'site', ...S.book.sites.find(x => x.id === +d.editsite) }; return render(); }
  if ('bookcancel' in d) { S.bookEdit = null; return render(); }
  if (d.delperson) return data.deletePerson(+d.delperson).then(reload).then(() => toast('Removed.')).catch(err => toast(err.message, null, true));
  if (d.delsite) return data.deleteSite(+d.delsite).then(reload).then(() => toast('Removed.')).catch(err => toast(err.message, null, true));
  if ('fromxerobook' in d) return copyXeroToBook();
  if ('fromxerosite' in d) return copyXeroAddress();
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
  if (d.tab && ('goenq' in d || 'gosmart' in d)) { e.preventDefault(); S.tab = d.tab; if ('gosmart' in d) S.crmView = 'main'; if (d.goenqid) { S.cust = null; S.enqOpen = +d.goenqid; } render(); setTimeout(() => ((d.goenqid && $('em-' + d.goenqid)) || $('goenq' in d ? 'enquiries' : 'smart'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); return; }   // a customer's email: its own row
  if (d.tab) { e.preventDefault(); S.tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.dpick) { Object.assign(S, { dpick: +d.dpick, sig: '', dsign: {} }); keepInputs = false; render(); window.scrollTo(0, 0); return; }
  if ('dlist' in d) { Object.assign(S, { dpick: null, sig: '', dsign: {} }); keepInputs = false; render(); window.scrollTo(0, 0); return; }
  if ('sigclear' in d) { S.sig = ''; sigPad?.clear(); return; }
  if (d.proc) { e.stopPropagation(); return toggleProc(+d.job, d.proc); }
  if (d.sendout) { e.stopPropagation(); return sendOutForm(+d.job, d.sendout); }
  if (d.outedit) { e.stopPropagation(); return editOut(+d.outedit); }
  if (d.outback) { e.stopPropagation(); return outBack(+d.outback); }
  if (d.outremove) return removeOut(+d.outremove);
  if (d.noteseen) { e.stopPropagation(); return seenNote(+d.noteseen); }
  if (d.notedel) return removeNote(+d.notedel);
  if ('salesreload' in d) { S.salesQ = null; S.hist = null; S.salesErr = null; return loadSalesData(true); }
  if (d.custpage) { const n = d.custname || (S.hist?.invoices || []).find(x => normName(x.customer) === d.custpage)?.customer || S.book.people.find(p => p.key === d.custpage)?.customer || d.custpage; return openCustomer(d.custpage, n, d.custtab || 'overview'); }
  if (d.gi) return goHit(+d.gi);
  if ('tvleave' in d) return leaveTv();
  if (d.ctab) { S.ctab = d.ctab; return render(); }
  if ('sppick' in d) { S.spView.pick = d.sppick || null; render(); if (d.sppick) $('sp-pick')?.focus(); return; }
  if (d.spsave) return linkFolder(d.spsave, false);
  if (d.spnone) return linkFolder(d.spnone, true);
  if (d.spunlink) return unlinkFolder(d.spunlink);
  if (d.spall) { S.spView.all[d.spall] = true; return render(); }
  if (d.spattach) return attachSpFile(+d.spattach, d.spitem);
  if (d.suggsp) return addSuggested(d.suggsp, null, true);
  if ('cnote' in d) { const t = $('cn-text').value.trim(), kind = $('cn-kind').value, name = S.custName || S.cust; if (!t) return;
    data.addSalesAction({ customer: name, kind, note: t }).then(async () => { S.salesActs = await data.loadActions(); toast('Noted.'); render(); }).catch(e => toast(e.message, null, true)); return; }
  if ('cinsight' in d) return writeInsight(S.cust, S.custName || S.cust);
  if ('cmail' in d) { if (S.cmail) delete S.cmail[S.cust]; return loadCustomerMail(S.cust); }
  if ('taskadd' in d) return openTaskForm(d.taskadd);
  if ('taskcancel' in d) { S.taskForm = null; return closeDoc(); }
  if (d.enqopen) { S.enqOpen = S.enqOpen === +d.enqopen ? null : +d.enqopen; return render(); }
  if (d.enqreply) return replyEnquiry(+d.enqreply);
  if (d.packread) return prepareQuotePack(+d.packread);
  if (d.packcopy) return copyQuotePack(+d.packcopy);
  if (d.enqask) return replyEnquiry(+d.enqask, (S.enq || []).find(x => x.id === +d.enqask)?.quotePack?.questions || []);
  if ('digestrefresh' in d) { buildDigest(true); return render(); }
  if ('digesthide' in d) return hideDigest();
  if (d.enqsend) return sendEnquiryReply(+d.enqsend);
  if (d.enqnewcust) return enquiryToCustomer(+d.enqnewcust);
  if ('enqsync' in d) return syncEnquiries(true);
  if ('enqsettings' in d) { S.enqSettings = !S.enqSettings; return render(); }
  if ('enqmailbox' in d) { const v = $('enq-mailbox').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast('That is not an email address.', null, true);
    data.saveOfficeSetting('enquiry_mailbox', v).then(async () => { S.officeSet = await data.loadOfficeSettings(); S.enqState = 'reading'; S.enqSettings = false; toast(`Enquiries will be read from ${v}.`); syncEnquiries(true); }).catch(e => toast(e.message, null, true)); return; }
  if ('enqdoneall' in d) { const xs = (S.enq || []).filter(e => e.kind === 'customer' && e.status === 'new');
    Promise.all(xs.map(e => data.setEnquiry(e.id, { status: 'ignored', by: S.me.email }))).then(async () => { S.enq = await data.loadEnquiries(); render(); }).catch(e => toast(e.message, null, true)); return; }
  if (d.enqchase) return emailToChase(+d.enqchase);
  if (d.enqdone) { const id = +d.enqdone; data.setEnquiry(id, { status: 'ignored', by: S.me.email }).then(async () => { S.enq = await data.loadEnquiries(); S.enqReply = S.enqReply?.id === id ? null : S.enqReply; render();
    toast('Done.', async () => { await data.setEnquiry(id, { status: 'new' }); S.enq = await data.loadEnquiries(); render(); }); }).catch(e => toast(e.message, null, true)); return; }
  if ('goenq' in d) { S.tab = 'customers'; render(); setTimeout(() => $('enquiries')?.scrollIntoView({ behavior: 'smooth' }), 50); return; }
  if ('gotasks' in d) { $('today')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if ('gosmart' in d) { S.tab = 'sales'; render(); setTimeout(() => $('smart')?.scrollIntoView({ behavior: 'smooth' }), 50); return; }
  if ('newsgo' in d) return newsEmails();
  if (d.sview) { S.salesView = d.sview; return render(); }
  if (d.crmview) { S.tab = 'sales'; S.crmView = d.crmview; render(); window.scrollTo(0, 0); return; }
  if ('ideasgo' in d) return thinkOfIdeas();
  if (d.ideastatus) { const id = +d.id, st = d.ideastatus; data.setIdea(id, st).then(() => { S.ideas.find(x => x.id === id).status = st; render(); }).catch(err => toast(err.message, null, true)); return; }
  if (d.ideaemail) { const i = (S.ideas || []).find(x => x.id === +d.ideaemail); if (i) { data.setIdea(i.id, 'doing').catch(() => {}); i.status = 'doing'; openAi(i.key, i.angle || i.title); } return; }
  if (d.ideatask) return openTaskForm('idea:' + d.ideatask);
  if (d.research) return researchCustomer(d.custname, d.site);
  if (d.rsemail) { const r = (S.research || []).find(x => x.key === d.rsemail), o = r?.openings[+d.i]; if (o) openAi(r.key, `${o.angle} (From their website or public pages: ${o.why})`); return; }
  if (d.rstask) return openTaskForm(`rs:${d.rstask}:${d.i}`);
  if (d.sopen) { S.salesOpen = S.salesOpen === +d.sopen ? null : +d.sopen; return render(); }
  if (d.qchase) return chaseQuote(+d.qchase);
  if (d.qcall) return logCall(+d.qcall, null);
  if (d.ccall) return logCall(null, d.ccall);
  if (d.aiopen) return openAi(d.aiopen, d.angle || '', d.reitem || '');
  if (d.reasked) return reorderAction(d.reasked, d.reitem, 'reorder');
  if (d.resnooze) return reorderAction(d.resnooze, d.reitem, 'reorder_snooze');
  if (d.aiwrite) return writeAi(d.aiwrite);
  if (d.aidraft) return draftAi(d.aidraft);
  if ('aiclose' in d) { S.ai = null; return render(); }
  if ('rfnew' in d) return newRfq(d.rfnew ? +d.rfnew : null);
  if ('rfcancel' in d) { S.rfqForm = null; return render(); }
  if ('rfadd' in d) { collectRfq(); const last = S.rfqForm.lines.at(-1); S.rfqForm.lines.push({ ...blankMetal(), material: last.material, grade: last.grade, form: last.form, unit: last.unit }); return render(); }
  if (d.rfdel) { collectRfq(); S.rfqForm.lines.splice(+d.rfdel, 1); return render(); }
  if (d.rfopen) { S.rfqOpen = S.rfqOpen === +d.rfopen ? null : +d.rfopen; S.mqEdit = null; return render(); }
  if (d.mqedit) { S.mqEdit = +d.mqedit; render(); $('mq-p0')?.focus(); return; }
  if ('mqcancel' in d) { S.mqEdit = null; return render(); }
  if (d.mqsave) return saveMetalQuote(+d.mqsave);
  if (d.rforder) return orderFromQuote(+d.rforder);
  if (d.rfmail) { const { r, q } = findQuote(+d.rfmail); if (!q) return; draftRfqEmails(r, [q]).then(() => { toast(`Draft to ${q.supplier} is in your Outlook Drafts. Check it and press Send.`); reload(); }).catch(e => toast(mailErr(e), null, true)); return; }
  if (d.rfclose) { if (!confirm(`Close ${rfqRef(+d.rfclose)} without ordering? Its prices are kept for the price history.`)) return; data.setRfq(+d.rfclose, { status: 'closed' }).then(reload).catch(e => toast(e.message, null, true)); return; }
  if ('tvopen' in d) { location.hash = '#tv'; fullscreen(true); return; }
  if (d.outcancel) { S.outForm = null; render(); window.scrollTo(0, 0); return; }
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
  if (d.open) { S.open = +d.open; S.ask = null; keepInputs = false; render(); if ('tonotes' in d) setTimeout(() => $('jnotes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); return; }
  if ('neworder' in d) return openOrderForm();
  if (d.amend) return openAmend(+d.amend);
  if (d.repeat) return openRepeat(+d.repeat);
  if (d.ask) { S.ask = { id: +d.job, what: d.ask }; return render(); }
  if ('noask' in d) { S.ask = null; return render(); }
  if (d.status) return setStatus(+d.job, d.status);
  if (d.confirmdelete) return deleteOrder(+d.confirmdelete);
  // A new line starts with the line above's processes: most lines on an order go the same way.
  if ('oladd' in d) { collectForm(); S.form.lines.push(blankLine(S.form.due, S.form.lines[S.form.lines.length - 1]?.procs)); keepInputs = false; return render(); }
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
  if (d.pick) { e.stopPropagation(); const id = +d.pick, sel = S.sel || (S.sel = new Set());
    // Shift-click ticks (or unticks) every order between the last one and this one.
    if (e.shiftKey && S.lastPick != null) { const ids = [...document.querySelectorAll('#v-orders [data-pick]')].map(x => +x.dataset.pick);
      const a = ids.indexOf(S.lastPick), b = ids.indexOf(id); const on = !sel.has(id);
      if (a >= 0 && b >= 0) { for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? sel.add(x) : sel.delete(x); S.lastPick = id; return render(); } }
    sel.has(id) ? sel.delete(id) : sel.add(id); S.lastPick = id; return render(); }
  if (d.pickall != null) { e.stopPropagation(); const ids = d.pickall.split(',').filter(Boolean).map(Number), sel = S.sel || (S.sel = new Set());
    const all = ids.every(x => sel.has(x)); ids.forEach(x => (all ? sel.delete(x) : sel.add(x))); return render(); }
  if ('pickclear' in d) { S.sel = new Set(); S.lastPick = null; return render(); }
  if ('addcodes' in d) return addMissingCodes();
  if ('pcheckread' in d) { S.xitems = null; S.xitemsErr = null; render(); return loadXeroItems(true).then(render); }
  if (d.chase) return chaseDebt(d.chase);
  if (d.hintadd) return addHinted(+d.hintadd);
  if (d.keeppart) return keepForPart(+d.keeppart);
  if (d.suggadd) return addSuggested(d.suggadd, null);
  if ('suggall' in d) { S.suggAll = true; return render(); }
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
  if ('pofill' in d) { collectPo(); const j = job(S.poForm.jobId); S.poForm.lines = [...S.poForm.lines.filter(l => l.description.trim()), ...j.lines.map(l => ({ description: lineLabel(l), qty: String(left(j, l) || l.qty), unit: '' }))]; return showPoForm(); }
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
  if ('print' in d) {   // the browser's "Save as PDF" takes the page title as the file name
    const was = document.title; if (d.name) document.title = d.name;
    window.addEventListener('afterprint', () => { document.title = was; }, { once: true });
    return window.print();
  }
  if (d.savedoc) return saveDoc(d.savedoc, +d.job, d.dnid ? +d.dnid : null);
  if (d.emaildoc) return emailDoc(d.emaildoc, +d.job, +d.dnid || null);
  if (d.undeliver) {   // a delivery marked on the phone: undoing it removes the signature, so ask first
    const x = S.jobs.flatMap(j => j.despatches).find(y => y.id === +d.undeliver);
    if (x?.deliveredAt && (x.receivedBy || x.deliveryNote) && !confirm(`Set ${x.dn} back to out for delivery? Who signed for it${x.deliveryNote && !x.receivedBy ? ' (where it was left)' : ' and their signature'} will be removed.`)) return;
    return markDelivery(+d.undeliver, 'undelivered');
  }
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
  if (e.target.id === 'gq') return showSearch();
  if (e.target.dataset.pq && S.pfDraft) {   // pro forma quantities: redraw the preview, keep the box being typed in
    const j = job(S.pfDraft.jobId), l = j?.lines.find(x => x.id === +e.target.dataset.pq);
    S.pfDraft.qty[+e.target.dataset.pq] = Math.max(0, Math.min(l?.qty ?? 0, Math.floor(Number(e.target.value) || 0)));
    document.querySelector('#doc .paper').innerHTML = docHtml('pfnew', S.pfDraft.jobId);
    return;
  }
  if (e.target.dataset.sq && S.sheet) {   // front sheet quantities: redraw the sheet, keep the box being typed in
    S.sheet.qty[+e.target.dataset.sq] = Math.max(0, Math.floor(Number(e.target.value) || 0));
    document.querySelector('#doc .paper').innerHTML = docHtml('job', S.sheet.jobId);
    return;
  }
  if (e.target.id === 'pcheck-q') { S.pcheck = { q: e.target.value }; const pos = e.target.selectionStart; render(); const el = $('pcheck-q'); el?.focus(); el?.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'msearch') { S.msearch = e.target.value; const pos = e.target.selectionStart; if (S.rfqForm) collectRfq(); renderMetalView(); const el = $('msearch'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'spq' && S.spView) { S.spView.q = e.target.value; const pos = e.target.selectionStart; render(); const el = $('spq'); el?.focus(); el?.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'psearch') { S.psearch = e.target.value; const pos = e.target.selectionStart; renderParts(); const el = $('psearch'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'csearch') { S.csearch = e.target.value; const pos = e.target.selectionStart; renderCustomers(); const el = $('csearch'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (['search', 'osearch', 'dsearch'].includes(e.target.id)) {
    const id = e.target.id; S[id] = e.target.value; const pos = e.target.selectionStart;
    if (id === 'search') renderJobs(); else if (id === 'dsearch') render(); else { if (S.form) collectForm(); renderOrders(); }
    const el = $(id); el.focus(); el.setSelectionRange(pos, pos);
  }
  const m = /^of-(qty|price)(\d+)$/.exec(e.target.id);
  const pm = /^of-(?:part|pno)(\d+)$/.exec(e.target.id);
  if (pm && S.form) {   // a part picked from the list brings its price, unless a price is already typed
    const all = formParts(S.form), hit = all.find(x => x.part === e.target.value);
    // Picked from either box (22 Oct): the part number into Part no., the description into Description. Both
    // boxes are set, so a pick with no part number clears one typed before it rather than leaving a mismatch.
    if (hit) {
      const no = $('of-pno' + pm[1]), desc = $('of-part' + pm[1]);
      if (no) no.value = hit.partNo || ''; if (desc) desc.value = hit.description || hit.part;
      collectForm();
    }
    // The list shows only what matches the typing, so Xero's thousands of products never sit in it at once.
    const dl = $('of-parts'), want = hit ? [hit] : partMatches(all, e.target.value), key = want.map(x => x.part).join('\n');
    if (dl && dl.dataset.k !== key) { dl.innerHTML = partOptions(want); dl.dataset.k = key; }
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
// Clicking into a Part box: its list matches what that box already says.
document.addEventListener('focusin', e => {
  if (!/^of-(part|pno)\d+$/.test(e.target.id) || !S.form) return;
  const dl = $('of-parts'), want = partMatches(formParts(S.form), e.target.value), key = want.map(x => x.part).join('\n');
  if (dl && dl.dataset.k !== key) { dl.innerHTML = partOptions(want); dl.dataset.k = key; }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dl-nobody') {   // Nobody to sign: the name and signature step aside, Where it was left shows
    const on = e.target.checked; S.dsign = { ...S.dsign, nobody: on, err: '' };
    $('dl-who')?.classList.toggle('off', on); $('dl-leftwrap').hidden = !on; $('dl-err').hidden = true;
    $('dl-who')?.querySelectorAll('input,button').forEach(x => { x.disabled = on; });
    if (on) $('dl-note')?.focus();
    return;
  }
  if (e.target.dataset.xcpick !== undefined) { pickContact(e.target.dataset.xcpick, e.target.value); return; }
  if (e.target.id === 'po-copy' && S.poForm && e.target.value) { collectPo(); copyPo(+e.target.value); return; }
  if (e.target.id === 'po-acc' && S.poForm) { collectPo(); showPoForm(); if (S.poForm.account === 'other') $('po-acc2')?.focus(); return; }
  if (e.target.dataset.sendpick) { S.sendPick[+e.target.dataset.sendpick] = e.target.checked; render(); return; }
  if (e.target.id === 'dsel') { S.desp = +e.target.value || null; keepInputs = false; render(); showDespForm(); }
  if (e.target.dataset.taskdone) return toggleTask(+e.target.dataset.taskdone, e.target.checked);
  if (e.target.dataset.enqstatus && e.target.value) { const id = +e.target.dataset.enqstatus, v = e.target.value; data.setEnquiry(id, { status: v, by: S.me.email }).then(async () => { S.enq = await data.loadEnquiries(); render(); }).catch(x => toast(x.message, null, true)); return; }
  if (e.target.dataset.newspick !== undefined) { S.news = { ...(S.news || {}), text: $('news-text')?.value || '', picked: [...document.querySelectorAll('[data-newspick]:checked')].map(x => x.dataset.newspick) }; return; }
  if (e.target.dataset.qnext) { const q = salesQuote(+e.target.dataset.qnext); if (q) data.setFollow(q, { nextOn: e.target.value || null }).then(() => { toast(e.target.value ? `Follow-up for ${q.quoteNo} booked for ${fmt(e.target.value)}.` : 'Follow-up date cleared.'); loadSalesData(); }).catch(x => toast(x.message, null, true)); return; }
  if (e.target.dataset.qlost) return markQuoteLost(+e.target.dataset.qlost, e.target.value);
  if (e.target.dataset.qnote) { const q = salesQuote(+e.target.dataset.qnote); if (q) data.setFollow(q, { note: e.target.value.trim() }).then(() => loadSalesData()).catch(x => toast(x.message, null, true)); return; }
  if (e.target.dataset.rfpick !== undefined && S.rfqForm) { collectRfq(); render(); return; }
  if (e.target.id === 'rf-copy' && S.rfqForm && e.target.value) { collectRfq(); const from = (S.metal || []).find(r => r.id === +e.target.value); if (from) S.rfqForm.lines = structuredClone(from.lines).map(l => ({ ...l, qty: String(l.qty) })); return render(); }
  if (e.target.id === 'rf-pojob') { S.rfqPoJob = +e.target.value || null; return; }
  if (e.target.id === 'rf-addx' && S.rfqForm && e.target.value) {
    collectRfq(); const c = S.xc?.contacts.find(x => x.id === e.target.value); if (!c) return;
    const row = { supplierId: c.id, supplier: c.name, email: '', on: true }; S.rfqForm.picked.push(row); render();
    data.xero('contact', { id: c.id }).then(x => {   // their email from Xero, into the box (unless one is typed already)
      const i = S.rfqForm?.picked.findIndex(y => y.supplierId === c.id), el = $('rf-e' + i);
      if (x.email && i >= 0 && !S.rfqForm.picked[i].email && el && !el.value) { el.value = x.email; S.rfqForm.picked[i].email = x.email; }
    }).catch(() => {});
    return;
  }
  if (e.target.id === 'of-cust') customerPicked(e.target.value.trim());
  // Promised delivery changed (Mandy, 20 Oct: changing it on an amend did nothing): the lines still on the old
  // date and not fully dispatched follow it, so Next due moves too. Lines on other dates keep theirs.
  if (e.target.id === 'of-due' && S.form) {
    const was = e.target.dataset.was, now = e.target.value; let moved = 0; e.target.dataset.was = now;
    if (was && now && was !== now) S.form.lines.forEach((l, i) => {
      const el = $('of-ldue' + i);
      if (el && el.value === was && !(l.sent > 0 && l.sent >= Number(l.qty))) { el.value = now; moved++; }
    });
    collectForm();
    if (moved) toast(`${moved === 1 ? 'The line' : moved + ' lines'} due ${fmt(was)} moved to ${fmt(now)}. Press ${S.form.mode === 'amend' ? 'Save the changes' : 'Create order'} to keep it.`);
  }
  if (e.target.id === 'out-sent' && S.outForm && !$('out-due').dataset.touched && e.target.value) $('out-due').value = defaultDueBack(e.target.value);
  if (e.target.id === 'out-due') e.target.dataset.touched = '1';
  if (e.target.id === 'out-proc' && S.outForm) { const f = readOutForm(), j = job(f.jobId); S.outForm = { ...f, finish: f.finish || (j ? finishFor(j, f.process) : '') }; render(); }
  // Processes per line (22 Oct): All lines ticks or unticks that process on every line; a line's box keeps All lines in step.
  if (S.form && (e.target.dataset.allp || e.target.name === 'of-lp')) {
    S.form.procsTouched = true;
    const p = e.target.value, col = [...document.querySelectorAll('input[name=of-lp]')].filter(i => i.value === p);
    if (e.target.dataset.allp) col.forEach(i => { i.checked = e.target.checked; });
    else { const all = [...document.querySelectorAll('input[data-allp]')].find(i => i.value === p); if (all) all.checked = col.every(i => i.checked); }
  }
  if (/^of-(part|pno)\d+$/.test(e.target.id) && S.form) {   // the Processes table names the line as it is typed
    const i = +e.target.id.replace(/\D+/g, ''), cell = $('of-plbl' + i);
    if (cell) cell.innerHTML = formLineName({ partNo: $('of-pno' + i)?.value, part: $('of-part' + i)?.value }, i);
  }
  // Same part made before: tick the processes that line had then, on that line only, until someone ticks by hand.
  if (/^of-(part|pno)\d+$/.test(e.target.id) && S.form && !S.form.procsTouched && !S.form.spQuoteId && S.form.mode !== 'amend') {
    collectForm(); const n = S.form, hits = [];
    n.lines.forEach((l, i) => {
      const h = processesFromHistory(S.jobs, lineLabel(l)); if (!h) return;
      hits.push(h); l.procs = [...h.processes];   // nothing ticked by hand yet, so the earlier line's ticks replace what was copied
      // Ticked in place, not by redrawing the form: Tab from Part no. to Description (22 Oct) must keep its focus.
      document.querySelectorAll(`input[name=of-lp][data-line="${i}"]`).forEach(x => { x.checked = l.procs.includes(x.value); });
    });
    if (hits.length) {
      n.procs = unionProcs(n.lines);
      document.querySelectorAll('input[data-allp]').forEach(x => { x.checked = n.lines.every(l => l.procs.includes(x.value)); });
      n.procNote = `Ticked as on ${[...new Set(hits.map(h => h.so))].join(', ')} (the same part made before); check them.`;
      if ($('of-pnote')) $('of-pnote').textContent = 'Processes each part needs. ' + n.procNote;
    }
  }
  if (e.target.id === 'of-site' && S.form) { const x = S.book.sites.find(y => y.id === +e.target.value); if (x) { collectForm(); S.form.address = x.address; keepInputs = false; render(); } }
  if (e.target.id === 'rs-cust') { const c = ideaCustomers().find(x => x.customer === e.target.value.trim()); if (c && $('rs-site') && !$('rs-site').value) $('rs-site').value = websiteGuess(customerEmails(c.key), ownDomain()); }
  if (e.target.id === 'of-contact' && S.form) { const p = bookFor(S.form.customer).people.find(y => y.name === e.target.value.trim()); if (p?.email && $('of-email')) $('of-email').value = p.email; }
  if (e.target.dataset.suggattach) { const fl = e.target.files[0]; e.target.value = ''; if (fl) addSuggested(e.target.dataset.suggattach, fl); return; }
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
  if (f.id === 'outf') return saveOut();
  if (f.id === 'rfqf') return saveRfq();
  if (f.id === 'taskf') return saveTask();
  if (f.id === 'notef') return postNote(f);
  if (f.id === 'rsf') return researchCustomer($('rs-cust').value, $('rs-site').value);
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
  if (f.id === 'delivf') return saveDelivery(+f.dataset.dnote);
  if (f.dataset.inv) {
    const no = f.querySelector('input').value.trim(); if (!no) return;
    try { await data.markInvoiced(+f.dataset.inv, no); toast(`Recorded as ${no}.`); } catch (err) { toast(err.message, null, true); }
    reload();
  }
});

boot();
