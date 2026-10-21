/**
 * Three things today (Philip, 21 Oct: more work comes from doing the right few things every day). The board
 * already knows them; this picks the three most worth doing first, one of each kind where it can, and the AI adds one
 * sentence on why. Ranked: an enquiry waiting over a day (oldest first), an overdue task, the quote most worth
 * chasing, the job running latest, the repeat part most worth asking about. Money only for Levi (role 'md'): the
 * quote's and the late order's value; Mandy's picks carry counts and names only, so nothing priced reaches the AI.
 * Pure: no window. Tested in tests/digest.mjs.
 */
const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const KIND_ORDER = ['enquiry', 'task', 'quote', 'late', 'reorder'];

/**
 * Up to three picks: [{ kind, id, title, facts, open: { attrs } }]. open.attrs is the data-attribute string that
 * opens the thing on the board (the same ones Home's tiles use). Never two of a kind unless there is nothing else.
 *   enquiries: enquiry rows ({ id, kind, status, receivedAt, company, fromName, wants, subject, hasDrawings, customerKey })
 *   chase:     chaseList() quotes (due follow-ups first, then by likely value)
 *   reorders:  the reorder round's rows still to ask (state 'due')
 *   late:      dashboard().late ({ job, days }, latest first)
 *   tasks:     my open tasks ({ id, title, customer, dueOn, doneAt })
 *   jobValue:  Levi only: an order's value still to send, for the late pick's facts
 */
export function digestPicks({ role = 'office', enquiries = [], chase = [], reorders = [], late = [], tasks = [], today, now = null, jobValue = null }) {
  const md = role === 'md', t = now ? Date.parse(now) : Date.parse(today + 'T12:00:00Z');
  const hours = e => Math.max(0, Math.round((t - Date.parse(e.receivedAt)) / 36e5));
  const by = {
    enquiry: (enquiries || []).filter(e => e.kind === 'enquiry' && e.status === 'new' && hours(e) > 24).sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)))
      .map(e => { const who = e.company || e.fromName || e.fromEmail || 'someone', days = Math.floor(hours(e) / 24);
        return { kind: 'enquiry', id: String(e.id), title: `Reply to ${who}`, open: { attrs: `data-tab="customers" data-goenq data-goenqid="${e.id}"` },
          facts: { from: who, wants: e.wants || e.subject || '', waitingDays: days, hasDrawings: !!e.hasDrawings, newCustomer: !e.customerKey } }; }),
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
    task: `Was due ${f.daysOverdue === 1 ? 'yesterday' : `${f.daysOverdue} days ago`}${f.customer ? ` (${f.customer})` : ''}.`,
    quote: f.followUpDue ? 'Its follow-up is due today.' : `The open quote most likely to turn into an order${f.chance ? ` (${f.chance} chance)` : ''}.`,
    late: `The order furthest behind${f.onHold ? ', and it is on hold' : ''}: worth a call to the customer before they ring.`,
    reorder: `They usually order it every ${f.usuallyEveryDays} days and it has been ${f.daysSinceLastOrder}.`,
  }[p.kind] || '';
}

/** What the AI is sent: the first name, the role and the picks' titles and facts (no attributes, nothing else). */
export const digestFacts = (name, role, picks) => ({ name: String(name || '').split(' ')[0], role: role === 'md' ? 'managing director' : 'office manager',
  picks: (picks || []).map(p => ({ kind: p.kind, title: p.title, facts: p.facts })) });
