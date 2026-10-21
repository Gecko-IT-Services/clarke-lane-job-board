/**
 * Customers' emails become actions (Philip, 21 Oct: "Customers writing about their orders" held a PO in reply to a
 * quote, a request for a price breakdown, half-size plates needing an urgent re-cut, a "can 6-8 weeks be sooner" and
 * a "does the price include folding", and the only button was Mark all seen; each is money won or kept). The AI names
 * the topic and the numbers quoted (refs: so, po, quote); this file links them to the board's orders and the quote
 * calculator's quotes, and says which buttons each email gets. No money anywhere. Pure: no window. Tested in tests/inbox.mjs.
 */
const attr = s => String(s ?? '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);   // attrs go straight into the page
const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);

export const TOPICS = ['po', 'quote_question', 'order_change', 'delivery', 'complaint', 'lead_time', 'invoice', 'other'];
const CHIPS = { po: 'PO received', quote_question: 'Question on a quote', order_change: 'Order change', delivery: 'Delivery', complaint: 'Complaint', lead_time: 'Lead time', invoice: 'Invoice' };
/** The chip on the row ('' for other or not read yet). */
export const topicChip = topic => CHIPS[topic] || '';
/** The chip's style: a complaint in red (the 'late' chip), a PO in green ('ok'), the rest plain. */
export const topicTone = topic => topic === 'complaint' ? 'late' : topic === 'po' ? 'ok' : '';

// Numbers as people type them: "SO-9781", "so 9781", "S0-9781" (a zero for the O), "9781"; "Q-0312", "Q0312", "0312";
// "PO-4471", "P.O. 4471", "4471". Compared on the digits (and for a PO, letters too), leading zeros ignored.
const soKey = s => String(s || '').toUpperCase().replace(/^\s*S[O0][-\s.#:]*/, '').replace(/\D/g, '').replace(/^0+/, '');
const quoteKey = s => /QCLE/i.test(String(s || '')) ? '' : String(s || '').toUpperCase().replace(/^\s*Q[-\s.#:]*/, '').replace(/\D/g, '').replace(/^0+/, '');
const poKey = s => String(s || '').toUpperCase().replace(/^\s*P\.?\s?O\.?[-\s#:]*/, '').replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');

/**
 * The order and quote an email is about, from the numbers it quotes. refs.so to a job's SO, refs.quote to a quote's
 * number, refs.po to a job's PO (or one of its lines'). A matched order brings its quote (spQuoteId) when the email
 * named none. Returns { jobId, quoteSpId } (null when nothing matched).
 */
export function linkEmail(e, { jobs = [], quotes = [] } = {}) {
  const r = e?.refs || {}, live = (jobs || []).filter(j => !j.preview);
  const so = soKey(r.so), qn = quoteKey(r.quote), po = poKey(r.po);
  let job = so.length >= 3 ? live.find(j => soKey(j.so) === so) : null;
  if (!job && po.length >= 3) job = live.find(j => poKey(j.po) === po || (j.lines || []).some(l => poKey(l.po) === po)) || null;
  const quote = qn.length >= 2 ? (quotes || []).find(q => quoteKey(q.quoteNo) === qn) : null;
  return { jobId: job?.id ?? null, quoteSpId: quote?.spId ?? job?.spQuoteId ?? null };
}

/**
 * The buttons for one customer email, in order: [{ label, attrs, tone, note? }]. tone: 'pri' (the main one), 'bad'
 * (a complaint's), or ''. Open (the email in Outlook) and Done are drawn by the screen on every row.
 * e: { id, topic, quoteSpId, jobId, customerKey, quoteNo? (the linked quote's number, else refs.quote) }.
 * opts.md is accepted for symmetry with the other screens; nothing here carries money, so Levi and Mandy get the same.
 */
export function emailActions(e, opts = {}) {
  const task = (label = 'Add a task', tone = '') => ({ label, attrs: `data-taskadd="enquiry:${e.id}"`, tone });
  const reply = (tone = '') => ({ label: 'Draft a reply with AI', attrs: `data-enqreply="${e.id}"`, tone });
  const order = tone => e.jobId != null ? [{ label: 'Open the order', attrs: `data-open="${e.jobId}"`, tone }] : [];
  const qn = e.quoteNo || e.refs?.quote || '';
  switch (e.topic) {
    // A PO against a quote: Mark as Ordered in the calculator, then Won quotes turns it into an order.
    case 'po': return [e.quoteSpId != null
      ? { label: 'Won quotes', attrs: 'data-tab="quotes"', tone: 'pri', note: `mark ${qn || 'the quote'} as Ordered in the calculator` }
      : { label: 'Make the order', attrs: 'data-neworder', tone: 'pri' }, task()];
    case 'quote_question': return [e.quoteSpId != null ? { label: 'Put on the chase list', attrs: `data-enqchase="${e.id}"`, tone: 'pri' } : task('Add a task', 'pri'), reply()];
    case 'order_change': case 'delivery': case 'lead_time': return [...order('pri'), reply(e.jobId != null ? '' : 'pri'), task()];
    case 'complaint': return [task('Make a task', 'bad'), ...order(''), reply()];
    case 'invoice': return [...(e.customerKey ? [{ label: 'Customer page', attrs: `data-custpage="${attr(e.customerKey)}" data-custtab="orders"`, tone: 'pri' }] : []), task()];
    default: return [task()];
  }
}

/** Complaints first, then POs, then the rest in the order given (the list is already longest-waiting first). */
const RANK = { complaint: 0, po: 1 };
export const sortEmails = list => (list || []).map((e, i) => [e, i]).sort(([a, i], [b, j]) => (RANK[a.topic] ?? 2) - (RANK[b.topic] ?? 2) || i - j).map(([e]) => e);

/** The task an email becomes: a complaint is "Sort out SO-9782: …" (the order when linked); the rest "Reply to <who>: …". */
export function emailTaskTitle(e, so = '') {
  const what = e.summary || e.subject || '';
  return (e.topic === 'complaint' ? `Sort out${so ? ' ' + so : ''}: ${what}` : `Reply to ${e.company || e.fromName || e.fromEmail || 'the customer'}${so ? ' (' + so + ')' : ''}: ${what}`).slice(0, 200);
}

/** The customer's question on a quote (Put on the chase list): the newest "Customer asked: …" note in the last 14 days, or ''. */
export const ASKED = 'Customer asked:';
export function customerQuestion(actions, spId, today) {
  const t = dayNo(today);
  const a = (actions || []).filter(x => x.spId === spId && x.kind === 'note' && String(x.note || '').startsWith(ASKED) && x.at && t - dayNo(x.at) <= 14)
    .sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
  return a ? a.note.slice(ASKED.length).trim() : '';
}

/** Saved emails still to be given a topic (read before 21 Oct): new, from a customer or an enquiry, up to n. */
export const needTopic = (rows, n = 10) => (rows || []).filter(e => e.status === 'new' && !e.topic && ['customer', 'enquiry'].includes(e.kind)).slice(0, n);
/** The AI's topic and refs, made safe to save: a known topic or 'other', and the three numbers as short strings. */
export const cleanTopic = x => ({ topic: TOPICS.includes(x?.topic) ? x.topic : 'other',
  refs: Object.fromEntries(['so', 'po', 'quote'].map(k => [k, String(x?.refs?.[k] || '').trim().slice(0, 40)])) });
