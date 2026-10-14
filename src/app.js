/**
 * The board: Jobs, Shop floor, Quotes, Despatch. Rendering from one state object;
 * every change goes to Supabase first and the board redraws from what comes back.
 */
import * as auth from './auth.js';
import * as data from './data.js';
import { PROCESSES, SHORT, sent, left, needed, doneCount, allDone, value, despatchValue, stage, nextDue,
  lastDespatch, calloffDates, defaultDespatchQty, suggestProcesses, describeLine, unitPrice, round2,
  addWorkingDays, quoteStates } from './core/jobs.js';

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

const S = { xero: null, xeroRead: null, xeroErr: null, xeroBusy: false, newJob: null, me: null, jobs: [], quotesRaw: null, dismissed: [], quotesErr: null, cancelAsk: null, stageChosen: false, tab: 'jobs', stage: 'current', search: '',
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
  if (st === 'completed') {
    if (office()) out.push(j.despatches.some(d => !d.xero) ? '<span class="chip soon">Waiting for Xero</span>' : '<span class="chip ok">Invoiced</span>');
    else out.push('<span class="chip ok">All sent</span>');
    return out.join('');
  }
  if (j.calloffs.length) out.push(`<span class="chip">Call-off ${Math.min(j.despatches.length + 1, j.calloffs.length)} of ${j.calloffs.length}</span>`);
  else if (j.despatches.length) out.push('<span class="chip">Part despatched</span>');
  if (allDone(j)) out.push('<span class="chip ok">Ready to despatch</span>');
  else if (st === 'current') out.push(`<span class="chip">${doneCount(j)} of ${needed(j).length} done</span>`);
  if (S.quotesRaw && j.spQuoteId && !S.quotesRaw.some(q => q.spId === j.spQuoteId)) out.push('<span class="chip late" title="The quote is no longer marked Ordered in the quote calculator">Quote no longer Ordered</span>');
  return out.join('');
}
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
    S.conv = { spId, lines, procs: suggestProcesses(lines),
      due: addWorkingDays(todayIso(), q.deliveryDays > 0 ? q.deliveryDays : 10), carriage: q.carriage > 0 };
  } catch (e) { S.conv = null; toast(e.message, null, true); }
  render();
}

async function submitConvert(form) {
  const q = S.quotesRaw.find(x => x.spId === S.conv.spId);
  const procs = [...form.querySelectorAll('input[name=cv-p]:checked')].map(i => i.value);
  const due = $('cv-due').value;
  if (!procs.length) { $('cv-msg').textContent = 'Tick at least one process so the shop floor knows what the job needs.'; return; }
  if (!due) { $('cv-msg').textContent = 'Enter the promised delivery date.'; return; }
  let calloffs = [];
  if ($('cv-co').checked) calloffs = calloffDates(due, Math.max(2, Math.min(24, +$('cv-n').value || 2)), $('cv-every').value);
  const lines = S.conv.lines.map(l => ({ part: describeLine(l), qty: l.qty, unit_price: unitPrice(l.sellTotal, l.qty) }));
  if ($('cv-carr')?.checked) lines.push({ part: 'Carriage', qty: 1, unit_price: q.carriage });
  const bad = lines.find(l => !(l.qty > 0));
  if (bad) { $('cv-msg').textContent = `"${bad.part}" has no quantity on the quote. Fix it in the quote calculator first.`; return; }
  S.busy = true; render();
  try {
    const j = await data.createJob({ sp_quote_id: q.spId, quote_no: q.quoteNo, customer: q.customer,
      contact_name: q.contactName, contact_email: q.contactEmail, customer_po: $('cv-po').value.trim(),
      due_date: calloffs.length ? calloffs[calloffs.length - 1] : due, calloff_dates: calloffs,
      notes: $('cv-notes').value.trim(), processes: procs, lines });
    S.conv = null; keepInputs = false; await reload();
    showDoc('soa', j.id);
    toast(`${j.so_number} created for ${q.customer}. It is in Upcoming on the Jobs tab.`);
  } catch (e) { toast(e.message, null, true); }
  S.busy = false; render();
}

async function makeDespatch() {
  const j = job(S.desp);
  const lines = j.lines.map(l => {
    const v = Math.floor(+document.querySelector(`[data-dq="${l.id}"]`).value || 0);
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
    toast(`${d.dn_number} created.` + (done ? ` ${j.so} is complete.` : ' The rest stays on the job.'));
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
async function cancelJob(id) {
  const j = job(id);
  try { await data.deleteJob(id); S.open = null; S.cancelAsk = null; toast(`${j.so} cancelled.`); }
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
  const q = S.search.toLowerCase();
  const by = { upcoming: [], current: [], completed: [] };
  S.jobs.forEach(j => by[stage(j)].push(j));
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
  const blurb = { upcoming: 'Confirmed jobs nobody has started yet.', current: 'At least one process done, or part despatched.', completed: 'Everything despatched.' }[S.stage];
  const empty = S.jobs.length ? (q ? 'No jobs match that search.' : 'No jobs here.')
    : (office() ? 'No jobs yet. Turn an ordered quote into a job on the Quotes tab.' : 'No jobs yet. They appear here once the office creates them.');
  $('v-jobs').innerHTML = `
    <div class="sec-h"><h2>Jobs</h2><span class="sub">${blurb}${money && S.stage !== 'completed' && list.length ? ` ${gbp(sum)} still to despatch.` : ''}</span>
      ${money && !S.newJob ? '<span class="right"><button class="btn pri" type="button" data-newjob>New job</button></span>' : ''}</div>
    ${S.newJob ? newJobForm() : ''}
    <div class="sec-h" style="gap:10px"><div class="seg" role="group" aria-label="Job stage">${seg}</div>
      <input type="search" id="search" placeholder="Search customer, SO, PO or part" value="${esc(S.search)}" style="flex:1 1 240px;max-width:360px;margin-left:auto"></div>
    <div class="tbl-wrap"><table class="jobs"><thead><tr><th>Customer</th><th>Sales order</th><th>Customer PO</th><th>${S.stage === 'completed' ? 'Despatched' : 'Due'}</th>
      ${PROCESSES.map(p => `<th class="p">${esc(p)}</th>`).join('')}${money ? `<th style="text-align:right">${S.stage === 'completed' ? 'Value' : 'Left to send'}</th>` : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="15" class="empty">${empty}</td></tr>`}</tbody></table></div>
    <p class="note">Tick a box when that process is finished. A dash means the job doesn't need it. Click a row for the full job, the order acknowledgement and despatch notes.</p>`;
}

/* ---------- new job (not from a quote: phone orders, Sage carry-over, Xero sales orders) ---------- */
const blankLine = () => ({ part: '', qty: '', price: '' });
function openNewJob(prefill = {}) {
  S.newJob = { so: '', customer: '', po: '', contact: '', due: addWorkingDays(todayIso(), 10), notes: '',
    lines: [blankLine()], procs: [], xeroQuoteId: null, from: '', ...prefill };
  S.tab = 'jobs'; history.replaceState(null, '', '#jobs'); keepInputs = false; render(); window.scrollTo(0, 0);
}
/** Copy what is typed into S.newJob, so adding or removing a line keeps everything else. */
function collectNewJob() {
  const n = S.newJob, v = id => $(id)?.value ?? '';
  Object.assign(n, { so: v('nj-so'), customer: v('nj-cust'), po: v('nj-po'), contact: v('nj-contact'), due: v('nj-due'), notes: v('nj-notes') });
  n.lines = n.lines.map((l, i) => ({ part: v('nj-part' + i), qty: v('nj-qty' + i), price: v('nj-price' + i) }));
  n.procs = [...document.querySelectorAll('input[name=nj-p]:checked')].map(i => i.value);
  n.calloffs = $('nj-co')?.checked; n.coN = v('nj-n'); n.coEvery = v('nj-every');
}
function newJobForm() {
  const n = S.newJob;
  const rows = n.lines.map((l, i) => `<tr><td><input type="text" id="nj-part${i}" value="${esc(l.part)}" placeholder="Part and spec" aria-label="Part, line ${i + 1}" style="width:100%"></td>
    <td><input type="number" id="nj-qty${i}" value="${esc(l.qty)}" min="1" step="1" aria-label="Quantity, line ${i + 1}"></td>
    <td><input type="number" id="nj-price${i}" value="${esc(l.price)}" min="0" step="any" aria-label="Unit price, line ${i + 1}"></td>
    <td>${n.lines.length > 1 ? `<button class="btn sm" type="button" data-njdel="${i}" aria-label="Remove line ${i + 1}">Remove</button>` : ''}</td></tr>`).join('');
  return `<form class="panel newjob" data-newjobform><h3>New job${n.from ? ` <span class="note">from ${esc(n.from)}</span>` : ''}</h3>
    <div class="row2"><label class="fl">Customer<input type="text" id="nj-cust" value="${esc(n.customer)}" required></label>
      <label class="fl">Order number<input type="text" id="nj-so" value="${esc(n.so)}" placeholder="Leave blank for the next SO number"></label></div>
    <p class="note">Leave the order number blank for a new order. For an order that already has a number, type it: SO-9726 for one raised in Xero, SAGE-9701 for one carried over from Sage.</p>
    <div class="row2"><label class="fl">Customer PO<input type="text" id="nj-po" value="${esc(n.po)}"></label>
      <label class="fl">Contact<input type="text" id="nj-contact" value="${esc(n.contact)}"></label></div>
    <div style="overflow-x:auto"><table class="lines njlines"><thead><tr><th>Part</th><th>Qty</th><th>Unit price (£)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div><button class="btn sm" type="button" data-njadd>Add a line</button></div>
    <div class="row2"><label class="fl">Promised delivery<input type="date" id="nj-due" value="${esc(n.due)}" required></label></div>
    <div class="fl">Processes this job needs</div>
    <div class="pchecks">${PROCESSES.map(p => `<label><input type="checkbox" name="nj-p" value="${esc(p)}" ${n.procs.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="nj-co" ${n.calloffs ? 'checked' : ''}> Delivered in call-offs</label>
    <div class="row2" id="nj-co-row" ${n.calloffs ? '' : 'hidden'}><label class="fl">How many call-offs<input type="number" id="nj-n" min="2" max="24" value="${esc(n.coN || 4)}"></label>
      <label class="fl">How often<select class="f" id="nj-every">${[['7', 'Weekly'], ['14', 'Every 2 weeks'], ['m', 'Monthly']].map(([v, t]) => `<option value="${v}" ${n.coEvery === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="note" style="grid-column:1/-1">The first call-off is on the promised delivery date.</p></div>
    <label class="fl">Notes for the job (optional)<input type="text" id="nj-notes" value="${esc(n.notes)}"></label>
    <div class="actions"><button class="btn pri" type="submit" ${S.busy ? 'disabled' : ''}>Create job</button><button class="btn" type="button" data-njcancel>Cancel</button></div>
    <p class="note" id="nj-msg"></p></form>`;
}
async function submitNewJob() {
  collectNewJob();
  const n = S.newJob, msg = t => { $('nj-msg').textContent = t; };
  const lines = n.lines.filter(l => l.part.trim() || l.qty || l.price);
  if (!n.customer.trim()) return msg('Enter the customer.');
  if (!lines.length) return msg('Add at least one part.');
  const bad = lines.find(l => !l.part.trim() || !(Number(l.qty) > 0) || !Number.isInteger(Number(l.qty)) || l.price === '' || Number(l.price) < 0);
  if (bad) return msg('Every line needs a part, a whole-number quantity and a unit price (0 is allowed).');
  if (!n.procs.length) return msg('Tick at least one process so the shop floor knows what the job needs.');
  if (!n.due) return msg('Enter the promised delivery date.');
  if (n.so.trim() && !/^(SO|SAGE)-\d+$/i.test(n.so.trim())) return msg('An order number must look like SO-9726 or SAGE-9701, or be left blank.');
  const calloffs = n.calloffs ? calloffDates(n.due, Math.max(2, Math.min(24, +n.coN || 2)), n.coEvery || '7') : [];
  S.busy = true; render();
  try {
    const j = await data.createJob({ so_number: n.so.trim().toUpperCase(), customer: n.customer.trim(), customer_po: n.po.trim(),
      contact_name: n.contact.trim(), xero_quote_id: n.xeroQuoteId, quote_no: '', notes: n.notes.trim(),
      due_date: calloffs.length ? calloffs[calloffs.length - 1] : n.due, calloff_dates: calloffs, processes: n.procs,
      lines: lines.map(l => ({ part: l.part.trim(), qty: Number(l.qty), unit_price: Number(l.price) })) });
    const who = n.customer.trim();
    S.newJob = null; keepInputs = false; await reload();
    if (S.tab === 'jobs') showDoc('soa', j.id);
    toast(`${j.so_number} created for ${who}.`);
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
  openNewJob({ from: `Xero ${q.number}`, so: q.number.toUpperCase().replace(/^SO(\d)/, 'SO-$1'), customer: q.customer, po: q.reference,
    due: q.expiry && q.expiry >= todayIso() ? q.expiry : addWorkingDays(todayIso(), 10), xeroQuoteId: q.id,
    lines: q.lines.filter(l => l.qty > 0).map(l => ({ part: l.description, qty: String(l.qty), price: String(l.unit) })).concat(q.lines.some(l => l.qty > 0) ? [] : [blankLine()]) });
}

/* ---------- shop floor ---------- */
function procButtons(j, focus) {
  return needed(j).map(p => { const s = j.procs[p];
    return `<button type="button" class="pbtn ${s.done ? 'done' : ''} ${focus === p ? 'focus' : ''}" data-proc="${esc(p)}" data-job="${j.id}" aria-pressed="${s.done}"><b>${s.done ? '✓ ' : ''}${esc(p)}</b><span>${s.done ? `${esc(s.by)} · ${fmtTime(s.at)}` : 'Tap when done'}</span></button>`; }).join('');
}
function renderFloor() {
  const open = S.jobs.filter(j => stage(j) !== 'completed').sort(byDue);
  const st = S.station;
  const count = p => open.filter(j => j.procs[p] && !j.procs[p].done).length;
  const btns = [['all', 'All jobs', open.length], ...PROCESSES.map(p => [p, p, count(p)])]
    .map(([k, t, c]) => `<button type="button" data-station="${esc(k)}" aria-pressed="${st === k}">${esc(t)}<span class="c">${c}</span></button>`).join('');
  const list = st === 'all' ? open : open.filter(j => j.procs[st] && !j.procs[st].done);
  const cards = list.map(j => `<article class="fcard ${allDone(j) ? 'ready' : ''}">
      <div class="h"><span class="so">${esc(j.so)}</span>${dueChip(nextDue(j))}</div>
      <div class="cust">${esc(j.customer)}</div>
      <div class="parts">${j.lines.map(l => `<div><b>${left(j, l)}</b> × ${esc(l.part)}${j.despatches.length ? ` <span>(of ${l.qty})</span>` : ''}</div>`).join('')}
        ${j.calloffs.length ? `<div>Call-off ${Math.min(j.despatches.length + 1, j.calloffs.length)} of ${j.calloffs.length}</div>` : ''}
        ${j.po ? `<div>PO ${esc(j.po)}</div>` : ''}</div>
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
  if (S.conv.loading) return `<article class="qcard">${head}<div class="note">Reading the quote lines…</div></article>`;
  const c = S.conv;
  const lines = c.lines.map(l => `<tr><td>${esc(describeLine(l))}</td><td>${l.qty}</td><td>${unit(unitPrice(l.sellTotal, l.qty))}</td><td>${gbp(l.sellTotal, 2)}</td></tr>`).join('');
  return `<article class="qcard wide">${head}
    <form class="convert" data-convert>
      <div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>${lines}
        ${q.carriage > 0 ? `<tr><td colspan="3"><label><input type="checkbox" id="cv-carr" ${c.carriage ? 'checked' : ''}> Carriage as its own line</label></td><td>${gbp(q.carriage, 2)}</td></tr>` : ''}</tbody></table></div>
      <div class="row"><label class="fl">Customer PO number<input type="text" id="cv-po" placeholder="From the customer's order"></label>
        <label class="fl">Promised delivery<input type="date" id="cv-due" value="${c.due}" required></label></div>
      <div class="fl">Processes this job needs. Ticked from the quote lines (folds, welds, inserts, holes, paint, plating). Check them and add Tap or C/Sink if needed.</div>
      <div class="pchecks">${PROCESSES.map(p => `<label><input type="checkbox" name="cv-p" value="${esc(p)}" ${c.procs.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="cv-co"> Delivered in call-offs</label>
      <div class="row" id="cv-co-row" hidden><label class="fl">How many call-offs<input type="number" id="cv-n" min="2" max="24" value="4"></label>
        <label class="fl">How often<select class="f" id="cv-every"><option value="7">Weekly</option><option value="14">Every 2 weeks</option><option value="m">Monthly</option></select></label>
        <p class="note" style="grid-column:1/-1">The first call-off is on the promised delivery date.</p></div>
      <label class="fl">Notes for the job (optional)<input type="text" id="cv-notes"></label>
      <div class="actions"><button class="btn pri" type="submit" ${S.busy ? 'disabled' : ''}>Create job</button><button class="btn" type="button" data-cancel>Cancel</button></div>
      <p class="note" id="cv-msg"></p></form></article>`;
}

/* ---------- despatch ---------- */
function callRow(j) {
  const today = todayIso();
  return `<div class="callrow">${j.calloffs.map((c, i) => { const done = i < j.despatches.length, late = !done && c < today;
    return `<div class="call ${done ? 'done' : late ? 'late' : ''}"><i>${i + 1}</i><b>${fmt(c)}</b>${done ? 'sent ' + fmt(j.despatches[i].date) : late ? 'late' : 'due'}</div>`; }).join('')}</div>`;
}
function renderDespatch() {
  const open = S.jobs.filter(j => stage(j) !== 'completed').sort(byDue);
  if (S.desp && !open.some(j => j.id === S.desp)) S.desp = null;
  const j = S.desp ? job(S.desp) : null;
  const money = office();
  let form = '';
  if (j) {
    const missing = needed(j).filter(p => !j.procs[p].done);
    const callN = j.calloffs.length ? j.despatches.length + 1 : 0;
    form = `${missing.length ? `<div class="warn">Not ticked yet: ${esc(missing.join(', '))}. Check the parts are finished before they go.</div>` : ''}
      ${j.calloffs.length ? callRow(j) : ''}
      <div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Ordered</th><th>Sent before</th><th>Left</th><th>This despatch</th></tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td>${left(j, l)}</td><td><input type="number" min="0" max="${left(j, l)}" value="${defaultDespatchQty(j, l)}" id="dq-${l.id}" data-dq="${l.id}" aria-label="Quantity of ${esc(l.part)} this despatch"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="actions"><button class="btn pri" type="button" id="mkdn" ${S.busy ? 'disabled' : ''}>Create despatch note${callN ? ` (call-off ${callN})` : ''}</button></div>
      <p class="note" id="dn-msg">Anything left stays on the job for the next despatch.</p>`;
  }
  const all = []; S.jobs.forEach(x => x.despatches.forEach(d => all.push([x, d])));
  all.sort((a, b) => (a[1].id < b[1].id ? 1 : -1));
  const pend = all.filter(([, d]) => !d.xero).reverse();
  $('v-despatch').innerHTML = `
    <div class="sec-h"><h2>Despatch</h2><span class="sub">Send all of a job or part of it. Each despatch gets its own note, and only what went out is invoiced.</span></div>
    <div class="panel"><h3>Despatch goods</h3>
      <label class="fl">Job
      <select class="f" id="dsel"><option value="">Choose a job…</option>${open.map(x => `<option value="${x.id}" ${x.id === S.desp ? 'selected' : ''}>${esc(x.so)} · ${esc(x.customer)}${x.po ? ' · PO ' + esc(x.po) : ''}${allDone(x) ? ' · ready' : ''}</option>`).join('')}</select></label>
      ${form}</div>
    ${money ? `<div class="panel"><h3>Waiting for Xero <span class="note">${pend.length}</span></h3>
      <p class="note">Until the Xero connection is switched on, raise each of these in Xero as an invoice for exactly these quantities, with the sales order, customer PO and despatch note as the reference. Then type the invoice number here so it leaves this list.</p>
      ${pend.length ? `<div style="overflow-x:auto"><table class="lines"><thead><tr><th>Despatch note</th><th style="text-align:left">Customer</th><th style="text-align:left">Reference</th><th>Sent</th><th>Net</th><th>Xero invoice no.</th></tr></thead><tbody>
        ${pend.map(([x, d]) => `<tr><td><button class="btn link mono" type="button" data-dn="${d.id}" data-job="${x.id}">${esc(d.dn)}</button></td><td style="text-align:left">${esc(x.customer)}</td>
          <td style="text-align:left" class="mono">${esc([x.so, x.po, d.dn].filter(Boolean).join(' / '))}</td><td>${fmt(d.date)}</td><td>${gbp(despatchValue(x, d), 2)}</td>
          <td><form class="inv" data-inv="${d.id}"><input type="text" id="inv-${d.id}" placeholder="INV-" aria-label="Xero invoice number for ${esc(d.dn)}" required><button class="btn sm" type="submit">Save</button></form></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Nothing waiting. Every despatch has an invoice number.</div>'}</div>` : ''}
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
  const money = office();
  const edit = money ? `<form class="panel" data-editjob><h3>Order details</h3>
      <div class="row2"><label class="fl">Customer PO<input type="text" id="ej-po" value="${esc(j.po)}"></label>
      ${j.calloffs.length ? '' : `<label class="fl">Due date<input type="date" id="ej-due" value="${esc(j.due)}"></label>`}</div>
      ${j.calloffs.length ? `<div class="fl">Call-off dates</div><div class="cdates">${j.calloffs.map((c, i) => `<label class="fl">${i + 1}${i < j.despatches.length ? ' (sent)' : ''}<input type="date" id="ej-c${i}" value="${esc(c)}" ${i < j.despatches.length ? 'disabled' : ''}></label>`).join('')}</div>` : ''}
      <label class="fl">Notes<input type="text" id="ej-notes" value="${esc(j.notes)}"></label>
      <details><summary class="note">Change which processes this job needs</summary><div class="pchecks" style="margin-top:8px">${PROCESSES.map(p => `<label><input type="checkbox" name="ej-p" value="${esc(p)}" ${j.procs[p] ? 'checked' : ''}>${esc(p)}</label>`).join('')}</div></details>
      <div class="actions"><button class="btn" type="submit">Save changes</button></div></form>` : '';
  $('drawer').innerHTML = `
    <div class="dh"><div><div class="mono note">${esc(j.so)}${j.quote ? ' · from ' + esc(j.quote) : ''}</div><h2>${esc(j.customer)}</h2><div class="actions" style="margin-top:6px">${statusChips(j)}</div></div>
      <button class="btn sm x" type="button" data-close>Close</button></div>
    <div class="facts">
      <div class="fact"><div class="k">Customer PO</div><div class="v mono">${esc(j.po) || '—'}</div></div>
      <div class="fact"><div class="k">${stage(j) === 'completed' ? 'Finished' : j.calloffs.length ? 'Next call-off' : 'Due'}</div><div class="v">${fmtLong(stage(j) === 'completed' ? lastDespatch(j) : nextDue(j))}</div></div>
      <div class="fact"><div class="k">Ordered</div><div class="v">${fmtLong(j.ordered)}</div></div>
      ${money ? `<div class="fact"><div class="k">Order value</div><div class="v num">${gbp(value(j), 2)}</div></div>` : ''}
    </div>
    ${j.notes ? `<div class="panel"><div class="note">Notes</div>${esc(j.notes)}</div>` : ''}
    <div class="panel"><h3>Processes</h3><div class="pbtns">${procButtons(j)}</div></div>
    <div class="panel"><h3>Parts</h3><div style="overflow-x:auto"><table class="lines"><thead><tr><th>Part</th><th>Ordered</th><th>Sent</th><th>Left</th>${money ? '<th>Unit</th>' : ''}</tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${l.qty}</td><td>${sent(j, l)}</td><td><b>${left(j, l)}</b></td>${money ? `<td>${unit(l.price)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      ${j.calloffs.length ? callRow(j) : ''}</div>
    <div class="actions">
      ${money ? `<button class="btn" type="button" data-soa="${j.id}">Order acknowledgement</button>` : ''}
      ${stage(j) !== 'completed' ? `<button class="btn pri" type="button" data-desp="${j.id}">Despatch…</button>` : ''}
      ${j.despatches.map(d => `<button class="btn" type="button" data-dn="${d.id}" data-job="${j.id}">${esc(d.dn)}</button>`).join('')}
    </div>${edit}
    ${money && !j.despatches.length ? (S.cancelAsk === j.id
      ? `<div class="panel warnbox"><b>Cancel ${esc(j.so)}?</b><span class="note">The job, its parts and ticks are removed. ${j.spQuoteId ? 'The quote goes back to the Quotes tab. ' : ''}The number ${esc(j.so)} is not used again.</span>
         <div class="actions"><button class="btn danger" type="button" data-confirmcancel="${j.id}">Yes, cancel ${esc(j.so)}</button><button class="btn" type="button" data-keepjob>Keep it</button></div></div>`
      : `<div><button class="btn link" type="button" data-canceljob="${j.id}">Cancel this job</button> <span class="note">Only while nothing has been despatched.</span></div>`) : ''}`;
}
async function saveJob(form) {
  const j = job(S.open);
  const want = [...form.querySelectorAll('input[name=ej-p]:checked')].map(i => i.value);
  if (!want.length) { toast('A job needs at least one process.', null, true); return; }
  const add = want.filter(p => !j.procs[p]), remove = needed(j).filter(p => !want.includes(p));
  const patch = { customer_po: $('ej-po').value.trim(), notes: $('ej-notes').value.trim() };
  if (!j.calloffs.length && $('ej-due').value) patch.due_date = $('ej-due').value;
  if (j.calloffs.length) {
    const dates = j.calloffs.map((c, i) => $('ej-c' + i).value || c);
    if (dates.some((d, i) => i && d < dates[i - 1])) { toast('Call-off dates must be in order, earliest first.', null, true); return; }
    patch.calloff_dates = dates; patch.due_date = dates[dates.length - 1];
  }
  try { await data.updateJob(j.id, patch); await data.setJobProcesses(j.id, add, remove); toast(`${j.so} saved.`); }
  catch (e) { toast(e.message, null, true); }
  reload();
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
        <span class="k">Delivery</span><span>${j.calloffs.length ? `${j.calloffs.length} call-offs, ${fmtLong(j.calloffs[0])} to ${fmtLong(j.calloffs[j.calloffs.length - 1])}` : fmtLong(j.due)}</span></div></div>
      <p>Thank you for your order. We confirm the following.</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Net</th></tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${l.qty}</td><td>${unit(l.price)}</td><td>${gbp(round2(l.qty * l.price), 2)}</td></tr>`).join('')}</tbody></table>
      <div class="tot"><span>Net</span><span>${gbp(net, 2)}</span><span>VAT 20%</span><span>${gbp(vat, 2)}</span><span class="g">Total</span><span class="g">${gbp(net + vat, 2)}</span></div>
      ${j.calloffs.length ? `<div><div class="k">Call-off schedule</div>${j.calloffs.map((c, i) => `${i + 1}. ${fmtLong(c)}`).join(' &nbsp; ')}</div>` : ''}
      <div class="foot">Clarke Lane Engineering Ltd. Please quote ${esc(j.so)} on any correspondence about this order.</div>`;
  } else {
    const di = j.despatches.findIndex(d => d.id === despId), d = j.despatches[di];
    const before = l => j.despatches.slice(0, di).reduce((a, x) => a + (x.lines[l.id] || 0), 0);
    body = head('Despatch note', esc(d.dn)) + `
      <div class="two"><div><div class="k">Deliver to</div><b>${esc(j.customer)}</b>${j.contactName ? `<div>FAO ${esc(j.contactName)}</div>` : ''}</div>
        <div class="kv"><span class="k">Date</span><span>${fmtLong(d.date)}</span><span class="k">Your order</span><span>${esc(j.po) || '—'}</span>
        <span class="k">Our order</span><span>${esc(j.so)}</span>${j.calloffs.length ? `<span class="k">Call-off</span><span>${di + 1} of ${j.calloffs.length}</span>` : ''}</div></div>
      <table><thead><tr><th>Description</th><th>Ordered</th><th>Previously sent</th><th>This delivery</th><th>Still to come</th></tr></thead><tbody>
      ${j.lines.map(l => `<tr><td>${esc(l.part)}</td><td>${l.qty}</td><td>${before(l)}</td><td><b>${d.lines[l.id] || 0}</b></td><td>${l.qty - before(l) - (d.lines[l.id] || 0)}</td></tr>`).join('')}</tbody></table>
      <div class="sign"><div>Received by (print)</div><div>Signature</div><div>Date</div></div>
      <div class="foot">Please check the goods on delivery and report any shortage or damage within 48 hours, quoting ${esc(d.dn)}.</div>`;
  }
  $('doc').innerHTML = `<div class="docbar"><span>Print it, or choose "Save as PDF" in the print window to email it.</span><button class="btn pri" type="button" data-print>Print</button><button class="btn" type="button" data-closedoc>Close</button></div><div class="paper">${body}</div>`;
  $('doc').hidden = false;
  document.body.classList.add('doc-open');
}
function closeDoc() { $('doc').hidden = true; document.body.classList.remove('doc-open'); }

/* ---------- render + events ---------- */
let keepInputs = true;
function snapshotInputs() {
  const m = new Map();
  if (keepInputs) document.querySelectorAll('#views input, #views select, #drawer input').forEach(el => {
    const k = el.id || (el.name ? el.name + '=' + el.value : '');
    if (k && el.type !== 'search') m.set(k, el.type === 'checkbox' ? el.checked : el.value);
  });
  keepInputs = true;
  return m;
}
function restoreInputs(m) {
  document.querySelectorAll('#views input, #views select, #drawer input').forEach(el => {
    const k = el.id || (el.name ? el.name + '=' + el.value : '');
    if (!m.has(k)) return;
    if (el.type === 'checkbox') el.checked = m.get(k); else el.value = m.get(k);
    if (el.id === 'cv-co') $('cv-co-row').hidden = !el.checked;
    if (el.id === 'nj-co') $('nj-co-row').hidden = !el.checked;
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
  if (d.open) { S.open = +d.open; S.cancelAsk = null; keepInputs = false; return render(); }
  if ('close' in d) { S.open = null; return render(); }
  if (d.start) { keepInputs = false; return startConvert(+d.start); }
  if ('cancel' in d) { S.conv = null; return render(); }
  if ('reloadquotes' in d) { S.quotesRaw = null; render(); return loadQuotes(); }
  if (d.dismiss) return dismiss(+d.dismiss);
  if (d.restore) return restore(+d.restore);
  if (d.canceljob) { S.cancelAsk = +d.canceljob; return render(); }
  if ('keepjob' in d) { S.cancelAsk = null; return render(); }
  if (d.confirmcancel) return cancelJob(+d.confirmcancel);
  if (d.soa) return showDoc('soa', +d.soa);
  if (d.dn) return showDoc('dn', +d.job, +d.dn);
  if (d.desp) { S.desp = +d.desp; S.open = null; S.tab = 'despatch'; history.replaceState(null, '', '#despatch'); return render(); }
  if ('print' in d) return window.print();
  if ('closedoc' in d) return closeDoc();
  if (t.id === 'mkdn') return makeDespatch();
  if ('newjob' in d) return openNewJob();
  if ('njcancel' in d) { S.newJob = null; return render(); }
  if ('njadd' in d) { collectNewJob(); S.newJob.lines.push(blankLine()); keepInputs = false; return render(); }
  if (d.njdel) { collectNewJob(); S.newJob.lines.splice(+d.njdel, 1); keepInputs = false; return render(); }
  if (d.xero) return xeroAction(d.xero);
  if (d.fromxero) return makeJobFromXero(d.fromxero);
});
$('scrim').addEventListener('click', () => { S.open = null; render(); });
$('doc').addEventListener('click', e => { if (e.target.id === 'doc') closeDoc(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('doc').hidden) closeDoc(); else if (S.open) { S.open = null; render(); } } });
document.addEventListener('input', e => {
  if (e.target.id === 'search') { S.search = e.target.value; const pos = e.target.selectionStart; renderJobs(); const s = $('search'); s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dsel') { S.desp = +e.target.value || null; keepInputs = false; render(); }
  if (e.target.id === 'cv-co') $('cv-co-row').hidden = !e.target.checked;
  if (e.target.id === 'nj-co') $('nj-co-row').hidden = !e.target.checked;
});
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  if ('convert' in f.dataset) return submitConvert(f);
  if ('editjob' in f.dataset) return saveJob(f);
  if ('newjobform' in f.dataset) return submitNewJob();
  if (f.dataset.inv) {
    const no = f.querySelector('input').value.trim(); if (!no) return;
    try { await data.markInvoiced(+f.dataset.inv, no); toast(`Recorded as ${no}.`); } catch (err) { toast(err.message, null, true); }
    reload();
  }
});

boot();
