/**
 * Home: problems first. Mandy (office): Today and Sales this week side by side, two rows of four cards (the work, then
 * invoicing and what is out), the shop floor's notes, the reorder round, the stations with work waiting, then one table that
 * switches between "Needs attention" and "Going out". Levi (md): see the note above `main` below. The numbers and the row order come from
 * dashboard() and attention() in core/jobs.js (tested); this file only draws them.
 * h: the formatting helpers from app.js.
 */
import { icon, XERO } from './icons.js';
import { fold } from './fold.js';
import { monthPanel } from './gauge.js';
import { monthProgress, monthInvoiced, dashboard, attention, PROCESSES, needed, allDone, deliveryLabel, nextDue, value, despatchValue, homeGaps } from './core/jobs.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A summary card. It only takes its colour when there is something to see. label/shown are HTML: escape before passing. */
export const card = (tone, ic, shown, label, on, attrs = '') => attrs
  ? `<button type="button" class="hcard go${on ? ' t-' + tone : ''}" ${attrs}><span class="ic">${icon(ic)}</span><div><b>${shown}</b><span>${label}</span></div></button>`
  : `<div class="hcard${on ? ' t-' + tone : ''}"><span class="ic">${icon(ic)}</span><div><b>${shown}</b><span>${label}</span></div></div>`;

export function renderHome({ digestBox = '', todayBox = '', notesBox = '', reorderBox = '', folds = {}, changes = null, waiting = null, jobs, me, office, md = false, editTarget = false, monthXero = { x: null, note: '' }, debts = { off: true }, breakeven = null, target = null, today, wonQuotes, view, invFilter = null, approval = { off: true }, sentOut = null }, h) {
  const { esc, fmt, gbp } = h;
  const d = dashboard(jobs, today);
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${office && me?.name ? ', ' + esc(me.name.split(' ')[0]) : ''}`;
  const longDate = new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const btns = office
    ? `<button class="btn" type="button" data-tab="dispatch">${icon('truck')}Dispatch</button><button class="btn pri" type="button" data-neworder>${icon('plus')}New order</button>`
    : `<button class="btn pri" type="button" data-tab="floor">${icon('floor')}Shop floor</button>`;

  const cards = {
    // Each card opens the jobs behind its number in the table below.
    late: card('bad', 'late', d.late.length, md && d.late.length && d.lateValue != null ? `Running late · ${gbp(d.lateValue)}` : 'Running late', d.late.length > 0,
      'data-homeview="late" title="Show the jobs running late"'),
    soon: card('warn', 'soon', d.soon.length, 'Due in the next 7 days', d.soon.length > 0, 'data-homeview="soon" title="Show the jobs due in the next 7 days"'),
    ready: card('ok', 'ready', d.ready.length, 'Ready to dispatch', d.ready.length > 0, 'data-homeview="ready" title="Show the jobs ready to dispatch"'),
    book: md && d.orderBook != null ? card('info', 'book', gbp(d.orderBook), `Order book · ${d.open.length} open`, d.open.length > 0, 'data-homeview="book" title="Show every open order"')
      : card('info', 'book', d.open.length, 'Open jobs', d.open.length > 0, 'data-homeview="book" title="Show every open job"'),
  };

  // Invoicing (office only): delivered but not yet in Xero, and drafts in Xero not yet approved there.
  const ap = approval, apN = ap.list ? ap.list.length : 0;
  // Aged debt (Levi and Mandy): customers with invoices over 60 days and past due in Xero.
  const debtCard = debts.off ? '' : !debts.list ? card('info', 'late', '—', debts.err ? 'Over 60 days · could not check Xero' : 'Over 60 days · checking Xero…', false, debts.err ? `title="${esc(debts.err)}"` : '')
      : card(debts.list.length ? 'bad' : 'ok', 'late', debts.list.length ? gbp(debts.list.reduce((a, c) => a + c.over, 0)) : 0,
        debts.list.length ? `Over 60 days · ${plural(debts.list.length, 'customer')}` : 'Over 60 days · nobody', debts.list.length > 0,
        'data-homeview="debts" title="Show the customers with invoices over 60 days"');
  const draftCard = ap.off ? card('info', 'doc', '—', 'In Xero, not approved · Xero not connected', false)
      : !ap.list ? card('info', 'doc', '—', ap.err ? 'In Xero, not approved · could not check Xero' : 'In Xero, not approved · checking Xero…', false, ap.err ? `title="${esc(ap.err)}"` : '')
      : card('info', 'doc', md && ap.value != null ? gbp(ap.value) : apN, md ? `In Xero, not approved · ${plural(apN, 'draft')}` : 'In Xero, not approved', apN > 0,
        'data-homeview="drafts" title="Show the draft invoices waiting for approval in Xero"');
  const money2 = office ? [
    card('warn', 'invoice', md && d.toXeroValue != null ? gbp(d.toXeroValue) : d.toXero.length, md ? `Delivered, not invoiced · ${plural(d.toXero.length, 'note')}` : 'Delivered, not invoiced', d.toXero.length > 0,
      'data-homeview="uninv" title="Show the delivered notes not yet sent to Xero"'),
    draftCard,
    // Always four on Mandy's second row (Philip, 21 Oct: no gaps): without Xero the debt card says so.
    debtCard || card('info', 'late', '—', 'Over 60 days · Xero not connected', false),
    // Work at other companies (powder coat, plating): opens the Sent out whiteboard on the Shop floor. Always shown, silver at 0.
    (o => card(o.late ? 'bad' : 'info', 'truck', o.out, o.late ? `Sent out · ${o.late} overdue back` : o.ready ? `Sent out · ${o.ready} ready to go` : o.out ? 'Sent out to other companies' : 'Sent out · nothing at other companies',
      o.out > 0 || o.ready > 0, 'data-gostation="out" title="Show what is at other companies for powder coat or plating"'))(sentOut || { out: 0, late: 0, ready: 0 }),
  ].join('') : '';

  // Levi's month at a glance (MD only); the detail and the settings are on Jobs.
  const split = md ? monthInvoiced(jobs, today, monthXero.x) : null;   // what the sales figure is made of (27 Oct)
  const month = md ? monthPanel({ mp: monthProgress(jobs, today, monthXero.x), split, changes, xeroNote: monthXero.note, xeroStale: monthXero.stale || '', breakeven, target, edit: editTarget,
    name: new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) }, { gbp, esc, fmt }) : '';

  const busy = PROCESSES.filter(p => d.stations[p]).sort((a, b) => d.stations[b] - d.stations[a]);
  const most = Math.max(1, ...busy.map(p => d.stations[p]));
  const snap = busy.length
    ? `<div class="snap">${busy.map(p => {
      const n = d.stations[p], late = d.stationLate[p];
      return `<button type="button" class="st" data-gostation="${esc(p)}" title="Open the shop floor at ${esc(p)}">
        <span class="r1"><b>${esc(p)}</b><span>${n} <small>${n === 1 ? 'job' : 'jobs'}</small></span></span>
        ${late ? `<span class="chip late">${late} late</span>` : '<span class="chip ok">On time</span>'}
        <span class="sbar${late ? ' late' : ''}"><span style="width:${Math.round(100 * n / most)}%"></span></span></button>`;
    }).join('')}</div>`
    : '<p class="note">Nothing waiting at any station.</p>';

  const todo = j => { const l = needed(j).filter(p => !j.procs[p].done); return l.length ? l.map(p => `<span class="chip">${esc(p)}</span>`).join(' ') : 'Nothing left'; };
  const who = (name, ref) => `<b>${esc(name)}</b><span class="ref mono">${esc(ref)}</span>`;
  const money = v => (office ? `<td class="num">${gbp(v, 2)}</td>` : '');
  const ref = j => j.so + (deliveryLabel(j) ? ' · ' + deliveryLabel(j).toLowerCase() : '');
  const openBtn = j => `<button class="btn sm" type="button" data-open="${j.id}">Open</button>`;
  const dispatchBtn = j => `<button class="btn sm pri" type="button" data-desp="${j.id}">Dispatch</button>`;
  const jobRow = (j, status, action) => `<tr data-open="${j.id}"><td>${who(j.customer, ref(j))}</td><td>${fmt(nextDue(j))}</td>
    <td>${todo(j)}</td><td>${status}</td>${money(value(j, { remaining: true }))}<td class="act">${action}</td></tr>`;
  const heldChip = j => (j.status === 'held' ? ' <span class="chip soon">On hold</span>' : '');

  const ROW = {
    late: r => jobRow(r.job, `<span class="chip late">${plural(r.days, 'day')} late</span>${heldChip(r.job)}`, openBtn(r.job)),
    risk: r => jobRow(r.job, '<span class="chip soon">At risk</span>', openBtn(r.job)),
    held: r => jobRow(r.job, '<span class="chip soon">On hold</span>', openBtn(r.job)),
    ready: r => jobRow(r.job, '<span class="chip ok">Ready</span>', dispatchBtn(r.job)),
    quotes: r => `<tr><td>${who(`${plural(r.count, 'won quote')} waiting`, 'Won quotes tab')}</td><td></td>
      <td>Make ${r.count === 1 ? 'it a sales order' : 'them sales orders'}</td><td><span class="chip">Won quote</span></td>${money(null)}
      <td class="act"><button class="btn sm" type="button" data-tab="quotes">Make order</button></td></tr>`,
    invoice: r => `<tr data-open="${r.job.id}"><td>${who(r.job.customer, r.despatch.dn)}</td><td>Delivered ${fmt(r.despatch.deliveredOn)}</td>
      <td>Invoice it</td><td><span class="chip">To invoice</span></td>${money(despatchValue(r.job, r.despatch))}
      <td class="act"><button class="btn sm" type="button" data-dispview="xero">Send to ${XERO}</button></td></tr>`,
  };
  const outRow = j => {
    const ready = j.status === 'open' && allDone(j);
    const status = j.status === 'held' ? '<span class="chip soon">On hold</span>' : ready ? '<span class="chip ok">Ready</span>' : '<span class="chip soon">Being made</span>';
    return jobRow(j, status, ready ? dispatchBtn(j) : openBtn(j));
  };

  const rows = attention(d, { office, wonQuotes: wonQuotes || 0 });
  const isOut = view === 'out';
  const until = j => { const n = Math.round((new Date(nextDue(j) + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
    return `<span class="chip soon">${n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due in ${n} days`}</span>`; };
  // Lists opened from the cards (not on the switch): ✕ goes back to Needs attention.
  const xeroLink = id => `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(id)}`;
  const draftRow = r => `<tr data-open="${r.job.id}"><td>${who(r.job.customer, r.d.dn)}</td><td>Sent ${fmt((r.d.xero.at || '').slice(0, 10))}</td>
    <td class="mono">${esc(r.number || 'Draft')}</td><td><span class="chip soon">${r.status === 'SUBMITTED' ? 'Awaiting approval' : 'Draft'}</span></td>${money(despatchValue(r.job, r.d))}
    <td class="act"><a class="btn sm" href="${xeroLink(r.d.xero.id)}" target="_blank" rel="noopener" title="Open this invoice in Xero">Open in ${XERO}</a></td></tr>`;
  // Sales so far this month (27 Oct): each dispatch with where its invoice is, then what was raised in Xero outside the board.
  const invChip = { approved: '<span class="chip ok">Approved in Xero</span>', draft: '<span class="chip soon">In Xero, not approved</span>', notsent: '<span class="chip">Not sent to Xero yet</span>' };
  const invRow = r => `<tr data-open="${r.job.id}"><td>${who(r.job.customer, `${r.job.so} · ${r.d.dn}`)}</td><td>Dispatched ${fmt(r.d.date)}</td><td class="mono">${esc(r.number || '—')}</td><td>${invChip[r.state]}</td>${money(r.net)}
    <td class="act">${r.d.xero ? `<a class="btn sm" href="${xeroLink(r.d.xero.id)}" target="_blank" rel="noopener" title="Open this invoice in Xero">Open in ${XERO}</a>` : ''}</td></tr>`;
  const outsideRow = x => `<tr><td>${who(x.customer, x.credit ? 'Credit note, raised in Xero' : 'Raised in Xero, not on the board')}</td><td>${fmt(x.date)}</td><td class="mono">${esc(x.number)}</td><td><span class="chip ok">Approved in Xero</span></td>${x.credit ? `<td class="num">-${gbp(-x.net, 2)}</td>` : money(x.net)}
    <td class="act"><a class="btn sm" href="${xeroLink(x.id)}" target="_blank" rel="noopener" title="Open this invoice in Xero">Open in ${XERO}</a></td></tr>`;
  // Waiting on a reply (29 Oct): who, how long, what, and the button that deals with it; an estimate says so.
  const waitKind = { po: '<span class="chip ok">PO received</span>', question: '<span class="chip soon">Question on a quote</span>', chase: '<span class="chip">Due a follow-up</span>', enquiry: '<span class="chip late">Not yet quoted</span>' };
  const waitAct = i => i.kind === 'chase' ? '<button class="btn sm" type="button" data-tab="sales">Open the CRM</button>' : `<button class="btn sm" type="button" data-tab="customers" data-goenq data-goenqid="${i.id}">${i.kind === 'po' ? 'Make the order' : i.kind === 'question' ? 'Answer it' : 'Quote it'}</button>`;
  const waitRow = i => `<tr><td>${who(i.who, i.what)}</td><td><span class="chip${i.hours > 48 && i.kind !== 'chase' ? ' late' : i.hours > 24 ? ' soon' : ''}">${i.hours < 48 ? `${i.hours} hours` : `${Math.floor(i.hours / 24)} days`}</span></td><td>${i.kind === 'enquiry' && i.replied ? 'Answered, not quoted' : i.kind === 'chase' ? `Sent ${Math.floor(i.hours / 24)} days ago` : 'Unanswered'}</td><td>${waitKind[i.kind]}</td>
    <td class="num">${i.value != null ? gbp(i.value, 2) : i.estimate != null ? `<span class="note">about ${gbp(i.estimate)}</span>` : '<span class="note">not priced</span>'}</td><td class="act">${waitAct(i)}</td></tr>`;
  const chased = c => { const ch = (debts.chases || []).find(x => x.customer === c.customer);
    return ch ? `<span class="chip ok">Chased ${fmt(ch.at.slice(0, 10))} · ${esc(ch.by.split(' ')[0])}</span>` : '<span class="chip soon">Not chased</span>'; };
  const debtRow = c => `<tr><td>${who(c.customer, `${c.invoices.length} invoice${c.invoices.length === 1 ? '' : 's'} over 60 days`)}</td>
    <td>${fmt(c.oldest.date)} <span class="chip late">${c.oldest.age} days</span></td><td class="mono">${esc(c.oldest.number)}</td><td>${chased(c)}</td>${money(c.over)}
    <td class="act"><button class="btn sm" type="button" data-chase="${esc(c.key)}">Draft a chase email</button> <a class="btn sm" href="${xeroLink(c.oldest.id)}" target="_blank" rel="noopener" title="Open the oldest invoice in Xero">${XERO}</a></td></tr>`;
  const DRILL = {
    debts: { title: 'Over 60 days', sub: 'customers with invoices more than 60 days old and past due in Xero · most owed first · the chase email is an Outlook draft, copied to Keith' + (debts.note ? ` · ${esc(debts.note)}` : ''),
      list: (debts.list || []).map(debtRow), empty: 'Nobody has invoices over 60 days.', cols: ['Customer', 'Oldest invoice', 'Invoice', 'Chased'] },
    late: { title: 'Running late', sub: 'worst first', list: d.late.map(r => ROW.late(r)), empty: 'Nothing is late.' },
    soon: { title: 'Due in the next 7 days', sub: 'soonest first', list: d.soon.map(j => jobRow(j, until(j) + heldChip(j), j.status === 'open' && allDone(j) ? dispatchBtn(j) : openBtn(j))), empty: 'Nothing due in the next 7 days.' },
    ready: { title: 'Ready to dispatch', sub: 'every process ticked', list: d.ready.map(j => ROW.ready({ job: j })), empty: 'Nothing ready yet.' },
    book: { title: md ? 'Order book' : 'Open jobs', sub: md && d.orderBook != null ? `${d.open.length} open · ${gbp(d.orderBook)} still to send · soonest due first` : 'soonest due first',
      list: d.open.slice().sort((a, b) => (nextDue(a) || '9') < (nextDue(b) || '9') ? -1 : 1).map(outRow), empty: 'No open orders.' },
    uninv: { title: 'Delivered, not invoiced', sub: 'oldest delivery first · send them from Dispatch › Waiting for Xero',
      list: d.toXero.slice().sort((a, b) => String(a.d.deliveredOn).localeCompare(String(b.d.deliveredOn))).map(x => ROW.invoice({ job: x.job, despatch: x.d })),
      empty: 'Every delivered note is in Xero.', cols: ['Customer', 'Delivered', 'Next step', 'Status'] },
    nodrawing: { title: 'Open orders with no drawing', sub: 'nothing attached yet · soonest due first · attach one on the job',
      list: homeGaps(jobs).noDrawing.map(j => jobRow(j, `<span class="chip soon">No drawing</span>${heldChip(j)}`, openBtn(j))), empty: 'Every open order has a drawing.' },
    invoiced: { title: invFilter === 'approved' ? 'Approved in Xero this month' : invFilter === 'awaiting' ? 'Dispatched, awaiting invoice or approval' : 'Sales so far this month',
      sub: !split ? 'Xero has not been read yet' : invFilter === 'approved' ? `${gbp(split.approved)} · what Xero's profit and loss shows · newest first` : invFilter === 'awaiting' ? `${gbp(split.awaiting)} · drafts for Keith to approve, and dispatches not yet sent to Xero · newest first`
        : `${gbp(split.approved)} approved in Xero (what its profit and loss shows) · ${gbp(split.awaiting)} dispatched and still awaiting invoice or approval · newest first`,
      list: !split ? [] : [...split.board.filter(r => !invFilter || (invFilter === 'approved') === (r.state === 'approved')).map(r => ({ date: r.d.date, html: invRow(r) })),
          ...(invFilter === 'awaiting' ? [] : split.outside.map(x => ({ date: x.date, html: outsideRow(x) })))]
        .sort((a, b) => b.date.localeCompare(a.date)).map(r => r.html),   // newest first, like Xero's own list (Levi, 27 Oct)
      empty: 'Nothing dispatched or invoiced this month yet.', cols: ['Customer', 'Date', 'Invoice', 'Status'] },
    waiting: { title: 'Waiting on a reply', sub: waiting ? `${gbp(waiting.exact)} with a known value (POs received, questions on quotes, quotes due a chase)${waiting.estimateCount ? ` · ${waiting.estimateCount} enquir${waiting.estimateCount === 1 ? 'y' : 'ies'} not yet quoted, about ${gbp(waiting.estimate)} at the customer's or your average` : ''} · longest waiting first` : 'Still reading the quotes and the mailbox',
      list: (waiting?.items || []).map(waitRow), empty: 'Nothing is waiting on a reply.', cols: ['Customer', 'Waiting', 'What', 'Kind'] },
    drafts: { title: 'In Xero, not approved', sub: 'draft invoices the board made, still waiting to be approved in Xero · oldest first',
      list: (ap.list || []).map(draftRow), empty: 'Nothing waiting: every invoice the board made has been approved in Xero.', cols: ['Customer', 'Sent', 'Invoice', 'Status'] },
  };
  const drill = DRILL[view];
  const body = drill ? drill.list : isOut ? d.goingOut.map(outRow) : rows.map(r => ROW[r.kind](r));
  const [c1, c2, c3, c4] = drill?.cols || ['Customer', 'Due', 'Still to do', 'Status'];
  const head = `<thead><tr><th>${c1}</th><th>${c2}</th><th>${c3}</th><th>${c4}</th>${office ? '<th class="num">Value</th>' : ''}<th class="act"><span class="sr">Action</span></th></tr></thead>`;
  const table = body.length
    ? `<div class="tbl-wrap"><table class="lines home">${head}<tbody>${body.join('')}</tbody></table></div>`
    : `<div class="tbl-wrap"><p class="allclear${isOut || drill ? '' : ' ok'}">${drill ? drill.empty : isOut ? 'Nothing due out before next Friday.' : 'All clear — nothing late, at risk or waiting.'}</p></div>`;
  const seg = `<div class="seg" role="group" aria-label="Show">
    <button type="button" data-homeview="attention" aria-pressed="${!isOut && !drill}">Needs attention <em>${rows.length}</em></button>
    <button type="button" data-homeview="out" aria-pressed="${isOut}">Going out <em>${d.goingOut.length}</em></button></div>`
    + (drill ? ' <button type="button" class="btn sm" data-homeview="attention" title="Back to Needs attention">✕ Close this list</button>' : '');

  const top = `<div class="hhead"><div><h2>${hello}</h2><p class="sub">${longDate} · ${d.ticksToday} process${d.ticksToday === 1 ? '' : 'es'} ticked off today</p></div><div class="hbtns">${btns}</div></div>`;
  // Levi's Home (Philip, 21 Oct): the month beside what to chase, then four cards that are his (order book, late, due,
  // owed over 60 days), the shop floor's notes, the reorder round and what needs attention. Dispatch, invoicing and the
  // station snapshot are Mandy's and the shop floor's: they stay on their Homes.
  // Three things today (21 Oct) sits above everything on both Homes: the day's three most useful actions.
  const main = md ? `${digestBox}<div class="hmd">${month}${todayBox}</div>
    <div class="hcards hcards5">${[cards.book, cards.late, cards.soon, debtCard, draftCard].join('')}</div>   <!-- the drafts card for Levi too (27 Oct) -->
    ${fold('fnotes', notesBox, folds.fnotes === true)}${fold('reround', reorderBox, folds.reround !== false)}`
  // Mandy's Home (Philip, 21 Oct: "remove the areas that don't matter, align the ones that do"): Today and Sales this
  // week side by side at the same height, then two rows of four cards (the work; invoicing and what is out), the shop
  // floor's notes, the reorder round and the station snapshot, every box on the same gutters.
  : `${digestBox}${todayBox ? `<div class="hmd">${todayBox}</div>` : ''}
    <div class="hcards hcards8">${Object.values(cards).join('')}${money2}</div>
    ${fold('fnotes', notesBox, folds.fnotes === true)}${fold('reround', reorderBox, folds.reround !== false)}
    ${fold('snap', `<section class="panel snapbox"><div class="hsec-h"><h3>Station snapshot</h3><span class="note">open jobs still needing each process</span><button class="btn sm link" type="button" data-tab="floor">Open shop floor</button></div>${snap}</section>`, folds.snap !== false)}`;
  return `<div class="home">${top}${main}
    <section id="home-list"><div class="hsec-h"><h3>${drill ? drill.title : isOut ? 'Going out this week and next' : 'Needs attention'}</h3>${drill ? `<span class="note">${drill.sub}</span>` : ''}${seg}</div>${table}</section>
  </div>`;
}
