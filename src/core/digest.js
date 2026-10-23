/**
 * Three things today (Philip, 21 Oct: more work comes from doing the right few things every day). The board
 * already knows them; this picks the three most worth doing first, one of each kind where it can, and the AI adds one
 * sentence on why. Ranked: a customer's complaint, a customer's PO (21 Oct: both are money kept or won today), an
 * enquiry waiting over a day (oldest first), a customer's question on a quote, an overdue task, the quote most worth
 * chasing, the job running latest, the repeat part most worth asking about. Money only for Levi (role 'md'): the
 * quote's and the late order's value; Mandy's picks carry counts and names only, so nothing priced reaches the AI.
 * Pure: no window. Tested in tests/digest.mjs.
 */
const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
// Mandy's picks carry no money: a figure the customer wrote ("the £1,250 quote") is taken out of what the email said.
export const noMoney = s => String(s || '').replace(/(?:£|GBP\s?)\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?k\b)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:pounds|GBP)\b/gi, '[price]');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// Customers' emails (kind 'email', from core/inbox.js's topics) rank by topic, so each topic is its own place in the order.
export const KIND_ORDER = ['complaint', 'po', 'enquiry', 'question', 'noquote', 'task', 'quote', 'late', 'reorder'];   // noquote (25 Oct): answered, but no quote after 48 hours

/**
 * Up to three picks: [{ kind, id, title, facts, open: { attrs } }]. open.attrs is the data-attribute string that
 * opens the thing on the board (the same ones Home's tiles use). Never two of a kind unless there is nothing else
 * (a complaint, a PO and a question on a quote count as three kinds: each is worth doing today).
 *   enquiries: enquiry rows ({ id, kind, status, receivedAt, company, fromName, wants, subject, hasDrawings, customerKey }); a
 *              customer's email (kind 'customer', still new) with topic complaint, po or quote_question is a pick of kind 'email'
 *   soOf:      an order's SO from its id (for an email linked to an order), optional
 *   noQuote:   quoteTurnaround().waiting: enquiries past 48 hours with no quote out ({ id, who, hours, replied, wants })
 *   chase:     chaseList() quotes (due follow-ups first, then by likely value)
 *   reorders:  the reorder round's rows still to ask (state 'due')
 *   late:      dashboard().late ({ job, days }, latest first)
 *   tasks:     my open tasks ({ id, title, customer, dueOn, doneAt })
 *   jobValue:  Levi only: an order's value still to send, for the late pick's facts
 */
export function digestPicks({ role = 'office', enquiries = [], noQuote = [], chase = [], reorders = [], late = [], tasks = [], today, now = null, jobValue = null, soOf = null }) {
  const md = role === 'md', t = now ? Date.parse(now) : Date.parse(today + 'T12:00:00Z');
  const hours = e => Math.max(0, Math.round((t - Date.parse(e.receivedAt)) / 36e5));
  const email = topic => (enquiries || []).filter(e => e.kind === 'customer' && e.status === 'new' && e.topic === topic).sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)))
    .map(e => { const who = e.company || e.fromName || e.fromEmail || 'a customer', so = (e.jobId != null && soOf?.(e.jobId)) || e.refs?.so || '', quote = e.refs?.quote || '';
      return { kind: 'email', id: String(e.id), title: { complaint: `Complaint from ${who}${so ? ' about ' + so : ''}`, po: `PO received from ${who}${quote ? ' for ' + quote : ''}`,
        quote_question: `${who} asked about ${quote || 'a quote'}` }[topic], open: { attrs: `data-tab="customers" data-goenq data-goenqid="${e.id}"` },
        facts: { from: who, topic: { complaint: 'complaint', po: 'purchase order', quote_question: 'question on a quote' }[topic], said: md ? e.summary || e.subject || '' : noMoney(e.summary || e.subject || ''),
          ...(so ? { order: so } : {}), ...(quote ? { quote } : {}), waitingHours: hours(e) } }; });
  const by = {
    complaint: email('complaint'), po: email('po'), question: email('quote_question'),
    enquiry: (enquiries || []).filter(e => e.kind === 'enquiry' && e.status === 'new' && hours(e) > 24).sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)))
      .map(e => { const who = e.company || e.fromName || e.fromEmail || 'someone', days = Math.floor(hours(e) / 24);
        return { kind: 'enquiry', id: String(e.id), title: `Reply to ${who}`, open: { attrs: `data-tab="customers" data-goenq data-goenqid="${e.id}"` },
          facts: { from: who, wants: e.wants || e.subject || '', waitingDays: days, hasDrawings: !!e.hasDrawings, newCustomer: !e.customerKey } }; }),
    noquote: (noQuote || []).map(w => ({ kind: 'noquote', id: String(w.id), title: `Quote for ${w.who}`, open: { attrs: `data-tab="customers" data-goenq data-goenqid="${w.id}"` },
      facts: { from: w.who, wants: w.wants || '', waitingDays: Math.floor(w.hours / 24), answered: !!w.replied } })),
    task: (tasks || []).filter(x => !x.doneAt && x.dueOn && x.dueOn < today).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id - b.id)
      .map(x => ({ kind: 'task', id: String(x.id), title: x.title, open: { attrs: 'data-gotasks' },
        facts: { task: x.title, customer: x.customer || '', dueOn: x.dueOn, daysOverdue: dayNo(today) - dayNo(x.dueOn) } })),
    quote: (chase || []).map(q => ({ kind: 'quote', id: String(q.spId ?? q.quoteNo), title: `Chase quote ${q.quoteNo} for ${q.customer}`, open: { attrs: 'data-tab="sales"' },
      facts: { quoteNo: q.quoteNo, customer: q.customer, quoteDate: q.quoteDate || '', ageDays: q.age ?? null, followUpDue: q.stage === 'due', chance: q.chance != null ? Math.round(q.chance * 100) + '%' : '',
        ...(md && q.value != null ? { value: Math.round(q.value) } : {}) } })),
    late: (late || []).map(r => ({ kind: 'late', id: String(r.job.id), title: `${r.job.so} for ${r.job.customer} is ${plural(r.days, 'day')} late`, open: { attrs: 'data-homeview="late"' },
      facts: { order: r.job.so, customer: r.job.customer, daysLate: r.days, onHold: r.job.status === 'held',
        ...(md && jobValue && jobValue(r.job) != null ? { valueStillToSend: Math.round(jobValue(r.job)) } : {}) } })),
    reorder: [...(reorders || [])].sort((a, b) => (b.worth || 0) - (a.worth || 0))
      .map(r => ({ kind: 'reorder', id: `${r.key}|${r.item}`, title: `Ask ${r.customer} about ${r.item}`, open: { attrs: 'data-tab="sales" data-gosmart' },
        facts: { customer: r.customer, item: r.item, usuallyEveryDays: r.every, daysSinceLastOrder: r.since } })),
  };
  // One of each kind in rank order; then, only if fewer than three kinds have anything, the next of each in turn.
  const out = [];
  for (let round = 0; out.length < 3 && KIND_ORDER.some(k => by[k].length > round); round++)
    for (const k of KIND_ORDER) if (out.length < 3 && by[k][round]) out.push(by[k][round]);
  return out;
}

/** Are the saved picks still today's? Same things in the same order (kind and id), so a cached digest can be shown. */
export const samePicks = (a, b) => (a || []).length === (b || []).length && (a || []).every((x, i) => x.kind === b[i].kind && String(x.id) === String(b[i].id));

/** A plain sentence for a pick when the AI is not there (no key, offline, over the day's limit). Never money. */
export function fallbackLine(p) {
  const f = p.facts || {};
  return {
    enquiry: `Waiting ${f.waitingDays >= 2 ? plural(f.waitingDays, 'day') : 'over a day'} for a reply${f.wants ? `: ${f.wants}` : ''}.`,
    noquote: `Asked ${plural(f.waitingDays, 'day')} ago${f.answered ? ' and answered' : ''}, but no quote has gone out yet${f.wants ? `: ${f.wants}` : ''}.`,
    task: `Was due ${f.daysOverdue === 1 ? 'yesterday' : `${f.daysOverdue} days ago`}${f.customer ? ` (${f.customer})` : ''}.`,
    quote: f.followUpDue ? 'Its follow-up is due today.' : `The open quote most likely to turn into an order${f.chance ? ` (${f.chance} chance)` : ''}.`,
    late: `The order furthest behind${f.onHold ? ', and it is on hold' : ''}: worth a call to the customer before they ring.`,
    reorder: `They usually order it every ${f.usuallyEveryDays} days and it has been ${f.daysSinceLastOrder}.`,
    email: { complaint: 'A customer says something went wrong: sort it today, before it costs the next order.', 'purchase order': 'An order has come in: book it in today.',
      'question on a quote': 'A customer is asking about a quote: a quick answer often wins it.' }[f.topic] || '',
  }[p.kind] || '';
}

/** What the AI is sent: the first name, the role and the picks' titles and facts (no attributes, nothing else). */
export const digestFacts = (name, role, picks) => ({ name: String(name || '').split(' ')[0], role: role === 'md' ? 'managing director' : 'office manager',
  picks: (picks || []).map(p => ({ kind: p.kind, title: p.title, facts: p.facts })) });
