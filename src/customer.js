/**
 * Customers as a small CRM (Philip, 20 Oct): Home's Today panel (enquiries waiting, tasks, follow-ups), the enquiries
 * from info@, the task form, and a customer's page (overview, orders and invoices, quotes, emails, tasks and notes).
 * Logic in core/crm.js and core/sales.js (tested); this file only draws. Money totals only when md is true.
 */
import { icon } from './icons.js';
import { STAGES } from './core/sales.js';
import { trendWords } from './core/crm.js';

const days = n => `${n} day${n === 1 ? '' : 's'}`;
const waited = h => h < 1 ? 'just now' : h < 24 ? `${h} hour${h === 1 ? '' : 's'}` : days(Math.round(h / 24));
const first = s => String(s || '').split(/[ @]/)[0];

/** Home: what is waiting today, and my tasks. */
export function renderToday({ m, tasks, md, me, staff }, h) {
  const { esc, fmt } = h;
  const tile = (n, label, attrs, tone) => `<button type="button" class="tcard${n ? ' t-' + tone : ''}" ${attrs}><b>${n}</b><span>${label}</span></button>`;
  const tiles = [tile(m.enquiries, m.enquiries === 1 ? 'new enquiry to answer' : 'new enquiries to answer', 'data-tab="customers" data-goenq', 'bad'),
    tile(m.overdueTasks + m.todayTasks, m.overdueTasks ? `tasks due (${m.overdueTasks} overdue)` : 'tasks due today', 'data-gotasks', m.overdueTasks ? 'bad' : 'warn'),
    tile(m.chase, 'quotes to chase', 'data-tab="sales"', 'warn'), tile(m.reorders, 'repeat parts due a reorder', 'data-tab="sales" data-gosmart', 'info'),
    tile(m.quiet, 'customers gone quiet', 'data-tab="sales" data-gosmart', 'info')].join('');
  const who = e => (staff.find(s => s.email === e)?.name || first(e)).split(' ')[0];
  const row = t => `<li class="${t.dueOn < m.today ? 'late' : ''}"><label><input type="checkbox" data-taskdone="${t.id}"> <b>${esc(t.title)}</b></label>
      ${t.customer ? `<button class="btn link sm" type="button" data-custpage="${esc(t.customerKey)}" data-custname="${esc(t.customer)}">${esc(t.customer)}</button>` : ''}
      <span class="chip ${t.dueOn < m.today ? 'late' : t.dueOn === m.today ? 'soon' : ''}">${t.dueOn < m.today ? 'was due ' : t.dueOn === m.today ? '' : 'due '}${t.dueOn === m.today ? 'today' : esc(fmt(t.dueOn))}</span>
      ${t.assignedTo !== me ? `<span class="note">${esc(who(t.assignedTo))}</span>` : ''}</li>`;
  const list = [...tasks.overdue, ...tasks.today, ...tasks.soon];
  return `<section class="today" id="today"><div class="hsec-h"><h3>Today</h3><span class="note">what is waiting for you</span>
      <button class="btn sm" type="button" data-taskadd="">${icon('plus')}Add a task</button></div>
    <div class="tcards">${tiles}</div>
    ${list.length ? `<ul class="tasks">${list.map(row).join('')}</ul>` : '<p class="note">No tasks due in the next week.</p>'}
    ${tasks.later.length ? `<p class="note">${tasks.later.length} more later on.</p>` : ''}</section>`;
}

/** The add-a-task form (Home, a customer, an enquiry or an email). */
export function taskForm(f, { staff, customers }, h) {
  const { esc } = h;
  return `<form class="panel taskform" id="taskf" autocomplete="off"><h3>${f.id ? 'Change the task' : 'Add a task'}</h3>
    <label class="fl">What needs doing<input type="text" id="tk-title" required value="${esc(f.title || '')}" placeholder="e.g. Call Sam about the next batch"></label>
    <div class="row3"><label class="fl">Customer (optional)<input type="text" id="tk-cust" list="tk-custs" value="${esc(f.customer || '')}"><datalist id="tk-custs">${customers.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <label class="fl">Due<input type="date" id="tk-due" required value="${esc(f.dueOn || '')}"></label>
      <label class="fl">For<select class="f" id="tk-who">${staff.filter(s => ['md', 'office'].includes(s.role)).map(s => `<option value="${esc(s.email)}"${s.email === f.assignedTo ? ' selected' : ''}>${esc(s.name || s.email)}</option>`).join('')}</select></label></div>
    <p class="bad" id="tk-err" hidden></p>
    <div class="actions"><button class="btn pri" type="submit">Save the task</button><button class="btn" type="button" data-taskcancel>Cancel</button></div></form>`;
}

/** Enquiries from info@: the new ones first with how long they have waited, then what happened to the rest. */
export function renderEnquiries({ list, funnel, state, mailbox, open, busy, reply }, h) {
  const { esc, fmt, fmtTime } = h;
  const st = { new: '<span class="chip late">Not answered</span>', replied: '<span class="chip soon">Replied</span>', quoted: '<span class="chip soon">Quoted</span>', won: '<span class="chip ok">Won</span>',
    lost: '<span class="chip">Lost</span>', ignored: '<span class="chip">Not an enquiry</span>' };
  const head = state === 'consent' ? `<div class="warn">Reading ${esc(mailbox)} needs a one-off Microsoft 365 permission (Mail.Read.Shared) that is not approved yet. Gecko IT approves it once; until then this list stays empty.</div>`
    : state === 'noaccess' ? `<div class="warn">Your Microsoft account cannot open ${esc(mailbox)}. Ask for access to that mailbox (Read and manage) in Microsoft 365.</div>`
    : state?.startsWith?.('error:') ? `<div class="err">${esc(state.slice(6))}</div>` : '';
  const enq = list.filter(e => e.kind === 'enquiry'), cust = list.filter(e => e.kind === 'customer' && e.status === 'new');
  const row = e => `<tr class="${open === e.id ? 'open' : ''}" data-enqopen="${e.id}" tabindex="0"><td>${e.status === 'new' ? `<b>${esc(waited(e.waitHours))}</b>` : esc(fmt(e.receivedAt.slice(0, 10)))}</td>
      <td><b>${esc(e.company || e.fromName || e.fromEmail)}</b><small>${esc(e.person || e.fromName)}${e.phone ? ' · ' + esc(e.phone) : ''}</small></td>
      <td>${esc(e.wants || e.subject)}${e.hasDrawings ? ' <span class="chip ok">drawings</span>' : ''}${e.customerKey ? ' <span class="chip">customer</span>' : ' <span class="chip soon">new</span>'}</td><td>${st[e.status] || ''}</td></tr>
    ${open === e.id ? `<tr class="edetail"><td colspan="4"><p>${esc(e.summary)}</p><p class="note">From ${esc(e.fromName)} &lt;${esc(e.fromEmail)}&gt; · ${esc(fmtTime(e.receivedAt))} · “${esc(e.subject)}”</p>
      ${reply?.id === e.id && reply.draft ? `<div class="saibox"><label class="fl">Subject<input type="text" id="er-subj" value="${esc(reply.draft.subject)}"></label>
          <label class="fl">Reply (edit anything)<textarea id="er-body" rows="7">${esc([reply.draft.greeting, ...reply.draft.paragraphs].join('\n\n'))}</textarea></label>
          <div class="actions"><button class="btn pri sm" type="button" data-enqsend="${e.id}">${icon('mail')}Put in my Outlook Drafts</button><button class="btn sm" type="button" data-enqreply="${e.id}">Write it again</button></div></div>` : ''}
      <div class="actions">${e.webLink ? `<a class="btn sm" href="${esc(e.webLink)}" target="_blank" rel="noopener">Open the email</a>` : ''}
        <button class="btn sm pri" type="button" data-enqreply="${e.id}" ${busy === e.id ? 'disabled' : ''}>${busy === e.id ? 'Writing…' : 'Draft a reply with AI'}</button>
        <button class="btn sm" type="button" data-taskadd="enquiry:${e.id}">Add a task</button>
        ${e.customerKey ? `<button class="btn sm" type="button" data-custpage="${esc(e.customerKey)}">Customer page</button>` : `<button class="btn sm" type="button" data-enqnewcust="${e.id}">Add as a customer</button>`}
        <label class="sinline">Mark as <select data-enqstatus="${e.id}"><option value="">…</option>${['replied', 'quoted', 'won', 'lost', 'ignored', 'new'].map(s => `<option value="${s}">${{ replied: 'Replied', quoted: 'Quoted', won: 'Won', lost: 'Lost', ignored: 'Not an enquiry', new: 'Not answered' }[s]}</option>`).join('')}</select></label></div></td></tr>` : ''}`;
  const f = funnel;
  return `<section class="panel enquiries" id="enquiries"><h3>Enquiries <small>from ${esc(mailbox)}, read by AI</small></h3>${head}
    ${f.received ? `<p class="note">Last 90 days: <b>${f.received}</b> enquir${f.received === 1 ? 'y' : 'ies'}, ${f.answered} answered, ${f.quoted} quoted, <b>${f.won} won</b>${f.waiting ? ` · <b class="bad">${f.waiting} waiting for an answer</b>` : ''}. A quick first reply wins more of them.</p>` : ''}
    ${enq.length ? `<div class="tbl-wrap"><table class="lines elist"><thead><tr><th>Waiting</th><th>Who</th><th>What they want</th><th></th></tr></thead><tbody>${enq.slice(0, 40).map(row).join('')}</tbody></table></div>`
      : state === 'ok' ? '<p class="note">No enquiries yet. New emails to the mailbox are read every 15 minutes while the board is open.</p>' : state === 'reading' ? '<p class="note">Reading the mailbox…</p>' : ''}
    ${cust.length ? `<p class="note">Also ${cust.length} email${cust.length === 1 ? '' : 's'} from customers about their orders: ${cust.slice(0, 5).map(e => `<a href="${esc(e.webLink)}" target="_blank" rel="noopener">${esc(e.company || e.fromName)}</a>`).join(', ')}.
      <button class="btn link sm" type="button" data-enqdoneall>Mark them seen</button></p>` : ''}
    <p class="note">Mailbox: <input type="email" id="enq-mailbox" value="${esc(mailbox)}" style="width:240px"> <button class="btn sm" type="button" data-enqmailbox>Save</button> <button class="btn sm" type="button" data-enqsync>Check now</button></p></section>`;
}

/** A customer's page, all but the Contacts tab (drawn by app.js from the contact book). */
export function renderCustomerPage(p, h) {
  const { esc, fmt, gbp } = h, { tab, c, md } = p, fmtY = d => d && d.slice(0, 4) !== p.today.slice(0, 4) ? `${fmt(d)} ${d.slice(0, 4)}` : fmt(d);
  const tabs = [['overview', 'Overview'], ['orders', 'Orders and invoices'], ['quotes', 'Quotes'], ['emails', 'Emails'], ['tasks', 'Tasks and notes'], ['files', 'Files'], ['contacts', 'Contacts']];
  const strip = `<div class="seg ctabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" data-ctab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>`;
  if (tab === 'contacts') return strip;
  const owed = p.invoices.filter(x => x.owed > 0), overdue = owed.filter(x => x.due && x.due < p.today);
  const taskList = (ts, done) => ts.length ? `<ul class="tasks">${ts.map(t => `<li class="${!done && t.dueOn < p.today ? 'late' : ''}"><label><input type="checkbox" data-taskdone="${t.id}"${done ? ' checked' : ''}> ${done ? `<s>${esc(t.title)}</s>` : `<b>${esc(t.title)}</b>`}</label>
      <span class="chip ${!done && t.dueOn < p.today ? 'late' : ''}">${done ? 'done ' + esc(fmt(t.doneAt.slice(0, 10))) : 'due ' + esc(fmt(t.dueOn))}</span> <span class="note">${esc(first(p.staff.find(s => s.email === t.assignedTo)?.name || t.assignedTo))}</span></li>`).join('')}</ul>` : '';
  const tl = n => p.timeline.length ? `<ul class="ctl">${p.timeline.slice(0, n).map(e => `<li><span class="note">${esc(fmt(String(e.at).slice(0, 10)))}</span> <span class="chip">${esc({ order: 'Order', invoice: 'Invoice', credit: 'Credit', quote: 'Quote', email: 'Email', call: 'Call', note: 'Note', visit: 'Visit', lost: 'Lost', reopen: 'Reopened', task: 'Task', done: 'Done', enquiry: 'Enquiry' }[e.kind] || e.kind)}</span> ${esc(e.text)}</li>`).join('')}</ul>` : '<p class="note">Nothing yet.</p>';
  const quickNote = `<div class="cnote"><input type="text" id="cn-text" placeholder="Note a call, visit or anything worth remembering"><select id="cn-kind"><option value="call">Call</option><option value="note">Note</option><option value="visit">Visit</option></select>
      <button class="btn sm" type="button" data-cnote>Save</button> <button class="btn sm" type="button" data-taskadd="cust">${icon('plus')}Add a task</button></div>`;
  let body = '';
  if (tab === 'overview') {
    const ins = p.insight, insBtn = p.office ? `<button class="btn sm" type="button" data-cinsight ${p.insightBusy ? 'disabled' : ''}>${p.insightBusy ? 'Writing…' : ins ? 'Write it again' : 'Write a summary with AI'}</button>` : '';
    body = `<div class="cgrid">
      <section class="panel"><h3>At a glance</h3><ul class="cfacts">
        ${c ? `<li>${c.orders} invoiced order${c.orders === 1 ? '' : 's'} since ${esc(fmtY(c.first))}${c.usual ? `, usually every <b>${esc(days(c.usual))}</b>` : ''}.</li>
          <li>Last order <b>${esc(fmt(c.last))}</b> (${esc(days(c.since))} ago)${c.quiet ? ' <span class="chip soon">gone quiet</span>' : c.lapsed ? ' <span class="chip late">lapsed</span>' : ''}.</li>
          ${md ? `<li>Last 12 months <b>${gbp(c.yearNet)}</b>${c.prevNet ? `, the year before ${gbp(c.prevNet)}` : ''}${trendWords(c) ? ` (${esc(trendWords(c))})` : ''}.</li>` : trendWords(c) ? `<li>Orders ${esc(trendWords(c))}.</li>` : ''}
          ${c.items.length ? `<li>Buys most: ${c.items.slice(0, 3).map(i => `${esc(i.item)} (${i.times}×)`).join(', ')}.</li>` : ''}` : '<li>No invoices in Xero yet.</li>'}
        ${p.quoteHist ? `<li>${esc(p.quoteHist)} in their SharePoint folder.</li>` : ''}
        <li>${p.openOrders} open order${p.openOrders === 1 ? '' : 's'} on the board · ${p.openQuotes.length} open quote${p.openQuotes.length === 1 ? '' : 's'}${md && p.openQuotes.length ? ` (${gbp(p.openQuotes.reduce((a, q) => a + q.value, 0))})` : ''}.</li>
        ${owed.length ? `<li>${owed.length} invoice${owed.length === 1 ? '' : 's'} unpaid${overdue.length ? `, <b class="bad">${overdue.length} overdue</b>` : ''}${md ? ` (${gbp(owed.reduce((a, x) => a + x.owed, 0))})` : ''}.</li>` : ''}
      </ul></section>
      ${p.office ? `<section class="panel"><h3>Summary and next step</h3>${ins ? `<p>${esc(ins.summary)}</p><p><b>Next step:</b> ${esc(ins.nextStep)}</p><p class="note">Written by AI from this customer's records on ${esc(fmt(ins.at.slice(0, 10)))}.</p>` : '<p class="note">A short AI read of this customer from their orders, quotes, notes and tasks, with one thing to do this week (about 1p).</p>'}${insBtn}</section>` : ''}
      ${p.prompts.length ? `<section class="panel"><h3>Worth a call</h3><ul class="cfacts">${p.prompts.map(x => `<li>${x}</li>`).join('')}</ul>${p.office && c ? `<button class="btn sm pri" type="button" data-aiopen="${esc(c.key)}" data-aigo="1">Write them an email</button>` : ''}</section>` : ''}
      <section class="panel"><h3>Tasks</h3>${taskList(p.tasks.filter(t => !t.doneAt), false) || '<p class="note">No open tasks.</p>'}${quickNote}</section>
      <section class="panel cwide"><h3>Latest</h3>${tl(10)}</section></div>`;
  } else if (tab === 'orders') {
    const jobs = p.jobs;
    body = `<section class="panel"><h3>Orders on the board</h3>${jobs.length ? `<div class="tbl-wrap"><table class="lines"><thead><tr><th>Order</th><th>Ordered</th><th>PO</th><th>Status</th>${p.office ? '<th class="num">Value</th>' : ''}</tr></thead><tbody>
        ${jobs.map(j => `<tr data-open="${j.id}"><td class="mono">${esc(j.so)}</td><td>${esc(fmt(j.ordered))}</td><td>${esc(j.po)}</td><td>${p.statusChips(j)}</td>${p.office ? `<td class="num">${p.jobValue(j) == null ? '' : gbp(p.jobValue(j), 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="note">No orders on the board yet.</p>'}</section>
      <section class="panel"><h3>Xero invoices <small>last 24 months</small></h3>${p.histNote}${p.invoices.length ? `<div class="tbl-wrap"><table class="lines"><thead><tr><th>Invoice</th><th>Date</th><th>Reference</th><th>Status</th><th class="num">Net</th><th></th></tr></thead><tbody>
        ${p.invoices.map(x => `<tr><td class="mono">${esc(x.number)}</td><td>${esc(fmt(x.date))}</td><td>${esc(x.reference || '')}</td><td>${x.net < 0 ? '<span class="chip">Credit note</span>' : x.owed > 0 ? `<span class="chip ${x.due && x.due < p.today ? 'late' : 'soon'}">${x.due && x.due < p.today ? 'Overdue' : 'Owed'} ${gbp(x.owed, 2)}</span>` : '<span class="chip ok">Paid</span>'}</td>
          <td class="num">${gbp(x.net, 2)}</td><td>${x.id ? `<a class="btn sm link" href="https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(x.id)}" target="_blank" rel="noopener">Xero</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">None in Xero.</p>'}</section>`;
  } else if (tab === 'quotes') {
    body = `<section class="panel"><h3>Quotes</h3>${p.quotesState || ''}${p.quotes.length ? `<div class="tbl-wrap"><table class="lines"><thead><tr><th>Quote</th><th>Date</th><th>Status</th><th class="num">Value</th></tr></thead><tbody>
        ${p.quotes.map(q => `<tr><td class="mono">${esc(q.quoteNo)}</td><td>${esc(fmt(q.quoteDate))}</td><td>${q.status === 'Ordered' ? '<span class="chip ok">Ordered</span>' : q.lost ? `<span class="chip">Lost${q.lost ? ': ' + esc(q.lost) : ''}</span>` : q.stage ? `<span class="chip soon">${esc(STAGES[q.stage])}</span>` : esc(q.status)}</td><td class="num">${gbp(q.value, 2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">No quotes for this customer in the quote calculator.</p>'}</section>`;
  } else if (tab === 'emails') {
    const m = p.mail;
    body = `<section class="panel"><h3>Emails <small>${m?.terms?.length ? 'with ' + esc(m.terms.join(', ')) : ''}</small></h3>
      ${!m || m.state === 'loading' ? '<p class="note">Searching your mailbox, your colleagues\' and the enquiries mailbox…</p>'
        : m.state === 'none' ? '<p class="note">Add an email address for someone at this customer (Contacts) to find their emails.</p>'
        : `${m.consent ? '<div class="warn">Reading colleagues\' and shared mailboxes needs a one-off Microsoft 365 permission (Mail.Read.Shared) that is not approved yet; only your own mailbox was searched.</div>' : ''}
          ${m.noAccess?.length ? `<p class="note">Not searched (no access): ${esc(m.noAccess.join(', '))}.</p>` : ''}
          ${m.messages.length ? `<ul class="cmail">${m.messages.map(x => `<li><span class="chip ${x.out ? '' : 'ok'}">${x.out ? 'Sent' : 'From them'}</span> <b>${esc(x.subject)}</b> <span class="note">${esc(fmt(x.at.slice(0, 10)))} · ${esc(x.out ? 'to ' + (x.to[0] || '') : x.fromName || x.from)} · ${esc(x.box)}</span>
              <p class="note">${esc(x.preview.slice(0, 220))}</p><div class="actions">${x.webLink ? `<a class="btn sm" href="${esc(x.webLink)}" target="_blank" rel="noopener">Open in Outlook</a>` : ''}<button class="btn sm" type="button" data-taskadd="email:${esc(x.id)}">Make a task</button></div></li>`).join('')}</ul>` : '<p class="note">No emails found.</p>'}`}
      <button class="btn sm" type="button" data-cmail>${icon('refresh')}Search again</button></section>`;
  } else if (tab === 'files') {
    body = p.filesHtml || '';
  } else if (tab === 'tasks') {
    body = `<section class="panel"><h3>Tasks</h3>${taskList(p.tasks.filter(t => !t.doneAt), false) || '<p class="note">No open tasks.</p>'}${quickNote}
        ${p.tasks.some(t => t.doneAt) ? `<h4>Done</h4>${taskList(p.tasks.filter(t => t.doneAt), true)}` : ''}</section>
      <section class="panel"><h3>Everything, newest first</h3>${tl(200)}</section>`;
  }
  return strip + body;
}
