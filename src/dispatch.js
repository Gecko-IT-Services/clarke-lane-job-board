/**
 * Dispatch: Home's cards, the note form when a job is picked, then one table switching Ready / Out
 * for delivery / Waiting for Xero (office) / All notes, each row with its next step. The lists come
 * from dispatchLists() in core/jobs.js (tested). The note form and the Xero rows need app.js's
 * state, so app.js draws those and passes them in. h: the formatting helpers from app.js.
 */
import { allDone, deliveryLabel, nextDue } from './core/jobs.js';
import { card } from './home.js';

const notes = n => `${n} note${n === 1 ? '' : 's'}`;
const noteMatch = ({ job: j, d }, q) => [d.dn, j.so, j.po, j.customer, ...j.lines.map(l => l.po)].some(v => (v || '').toLowerCase().includes(q));

export function renderDispatch({ lists: s, office, view, chosen, search, desp, form, cancelDn, xero }, h) {
  const { esc, fmt, gbp, dueChip, parts } = h;
  const cards = [
    card('ok', 'ready', s.ready.length, 'Ready to dispatch', s.ready.length > 0),
    card('warn', 'mail', s.notEmailed.length, 'Not emailed to the customer', s.notEmailed.length > 0),
    card('info', 'truck', s.out.length, 'Out for delivery', s.out.length > 0),
    office ? card('warn', 'invoice', gbp(s.toXeroValue), `Waiting for Xero · ${notes(s.toXero.length)}`, s.toXero.length > 0)
      : card('', 'soon', s.thisWeek, 'Sent this week', false),
  ].join('');

  const ready = s.ready.filter(j => j.id !== desp);   // the job in the form is not listed twice
  const VIEWS = {
    ready: { list: ready, tab: 'Ready', title: 'Ready to dispatch', sub: 'every process ticked · running order', empty: ready.length < s.ready.length ? 'Nothing else ready.' : 'Nothing ready yet. Jobs show here once every process is ticked.' },
    out: { list: s.out, tab: 'Out for delivery', title: 'Out for delivery', sub: 'email the note, then mark it delivered when it arrives · only delivered notes go to Xero', empty: 'Nothing out for delivery.', ok: true },
    ...(office ? { xero: { list: s.toXero, tab: 'Waiting for Xero', title: 'Waiting for Xero', sub: 'delivered, not invoiced yet', empty: 'Nothing waiting. Every delivered note is in Xero.', ok: true } } : {}),
    all: { list: s.notes.slice(0, 100), n: s.notes.length, tab: 'All notes', title: 'All dispatch notes', sub: 'newest first, latest 100', empty: 'No dispatch notes yet.' },
  };
  const v = chosen && VIEWS[view] ? view : Object.keys(VIEWS).find(k => k === 'ready' ? s.ready.length : k !== 'all' && VIEWS[k].list.length) || 'all', V = VIEWS[v];
  const q = v === 'all' ? (search || '').trim().toLowerCase() : '';
  const list = q ? s.notes.filter(x => noteMatch(x, q)) : V.list;

  const chip = (t, tone) => `<span class="chip${tone ? ' ' + tone : ''}">${t}</span>`;
  const who = j => `<b>${esc(j.customer)}</b><span class="ref mono">${esc(j.so)} · ${j.po ? esc(j.po) : 'no PO'}</span>`;
  const emailed = d => d.emailedAt ? chip(`Emailed ${fmt(d.emailedAt.slice(0, 10))}`, 'ok') : chip('Not emailed', 'soon');
  const viewBtn = (j, d, label = 'View', pri = false) => `<button class="btn sm${pri ? ' pri' : ''}" type="button" data-dn="${d.id}" data-job="${j.id}">${label}</button>`;
  const deliver = (d, pri) => `<form class="inv" data-deliver="${d.id}"><input type="text" id="rcv-${d.id}" placeholder="Signed by (optional)" aria-label="Who signed for ${esc(d.dn)}"><button class="btn sm${pri ? ' pri' : ''}" type="submit">Mark delivered</button></form>`;
  const progress = d => d.cancelled ? chip(`Cancelled ${fmt(d.cancelled.at.slice(0, 10))}${d.cancelled.by ? ' by ' + esc(d.cancelled.by) : ''}`)
    : [emailed(d),
      d.deliveredOn ? chip(`Delivered ${fmt(d.deliveredOn)}${d.receivedBy ? ' · ' + esc(d.receivedBy) : ''}`, 'ok') + (d.xero ? '' : ` <button class="btn link sm" type="button" data-undeliver="${d.id}">undo</button>`) : chip('Out for delivery'),
      office ? (d.xero ? chip(esc(d.xero.no), 'ok') : d.deliveredOn ? chip('Waiting for Xero', 'soon') : '') : ''].join(' ');
  const cancelRow = (j, d) => cancelDn !== d.id ? '' : `<tr class="confirmrow"><td colspan="5"><div class="warn" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <span><b>Cancel ${esc(d.dn)}?</b> It stays on the list marked cancelled, its number is not reused, and everything on it goes back to outstanding on ${esc(j.so)}. Use this when the goods did not go, or came back.</span>
    <button class="btn sm pri" type="button" data-cancdnyes="${d.id}">Yes, cancel ${esc(d.dn)}</button><button class="btn sm" type="button" data-cancdnno>Keep it</button></div></td></tr>`;

  const HEAD = {
    ready: '<th>Customer</th><th>Due</th><th>To send</th><th class="act">Next step</th>',
    out: '<th>Note</th><th>Customer</th><th class="wide">Dispatched</th><th class="wide">Emailed</th><th class="act">Next step</th>',
    all: '<th>Note</th><th>Customer</th><th class="wide">Dispatched</th><th>Progress</th><th class="act"></th>',
  };
  const ROW = {
    ready: j => `<tr><td>${who(j)}</td><td>${dueChip(nextDue(j))}${deliveryLabel(j) ? ` <span class="note">${deliveryLabel(j)}</span>` : ''}</td>
      <td>${parts(j)}</td><td class="act"><button class="btn sm pri" type="button" data-desp="${j.id}">Dispatch</button></td></tr>`,
    out: ({ job: j, d }) => `<tr><td class="mono">${esc(d.dn)}</td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td class="wide">${emailed(d)}</td>
      <td class="act"><div class="next">${d.emailedAt ? deliver(d, true) + viewBtn(j, d) : viewBtn(j, d, 'Email note…', true) + deliver(d, false)}</div></td></tr>`,
    all: ({ job: j, d }) => d.cancelled
      ? `<tr class="muted"><td class="mono"><s>${esc(d.dn)}</s></td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td>${progress(d)}</td><td class="act"></td></tr>`
      : `<tr><td class="mono">${esc(d.dn)}</td><td>${who(j)}</td><td class="wide">${fmt(d.date)}</td><td>${progress(d)}</td>
        <td class="act">${viewBtn(j, d)}${office && !d.xero ? ` <button class="btn link sm" type="button" data-cancdn="${d.id}">Cancel</button>` : ''}</td></tr>${cancelRow(j, d)}`,
  };
  const table = !list.length ? `<div class="tbl-wrap"><p class="allclear${!q && V.ok ? ' ok' : ''}">${q ? 'No notes match that search.' : V.empty}</p></div>`
    : v === 'xero' ? `<div class="tbl-wrap">${xero.table}</div>${xero.how}`
    : `<div class="tbl-wrap"><table class="lines home dispatch"><thead><tr>${HEAD[v]}</tr></thead><tbody>${list.map(ROW[v]).join('')}</tbody></table></div>`;
  const chooser = v !== 'ready' ? '' : `<div class="dfoot"><label class="note" for="dsel">Sending part of a job that isn't finished?</label>
    <select class="f" id="dsel"><option value="">Choose any open job…</option>${s.open.map(x => `<option value="${x.id}" ${x.id === desp ? 'selected' : ''}>${esc(x.so)} · ${esc(x.customer)}${x.po ? ' · PO ' + esc(x.po) : ''}${allDone(x) ? ' · ready' : ''}</option>`).join('')}</select>
    ${s.held.length ? `<span class="note">On hold, so not listed: ${s.held.map(j => esc(j.so)).join(', ')}.</span>` : ''}</div>`;
  const seg = `<div class="seg" role="group" aria-label="Which dispatch list to show">${Object.entries(VIEWS).map(([k, x]) =>
    `<button type="button" data-dispview="${k}" aria-pressed="${k === v}">${x.tab} <em>${x.n ?? x.list.length}</em></button>`).join('')}</div>`;
  const find = v === 'all' ? `<input type="search" id="dsearch" placeholder="Search note, order or customer" aria-label="Search dispatch notes" value="${esc(search || '')}">` : '';

  return `<div class="home">
    <div class="hhead"><div><h2>Dispatch</h2><p class="sub">Send all of a job or part of it. Each dispatch gets its own note, and only what went out is invoiced.</p></div></div>
    <div class="hcards">${cards}</div>
    ${form || ''}
    <section><div class="hsec-h"><h3>${q ? 'Search results' : V.title}</h3><span class="note">${q ? `${notes(list.length)} found` : V.sub}</span>${seg}${find}${v === 'xero' && xero ? xero.send : ''}</div>${table}${chooser}</section>
  </div>`;
}
