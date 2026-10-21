/**
 * Customers, enquiries and tasks (Philip, 20 Oct): the pieces of a small CRM for a company that has none. One page
 * per customer from what the board already knows (orders, Xero invoices, quotes, notes, tasks, emails read live),
 * website enquiries from info@ with how long each has waited, tasks on Home, and two prompts for extra work:
 * repeat parts due a reorder, and work a customer could also give us. Pure: no window. Tested in tests/crm.mjs.
 */
import { normName } from './xero.js';
import { processHints } from './preview.js';

const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
const median = xs => { const a = [...xs].sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Webmail addresses: search by the whole address, never by the domain (everyone at gmail.com is not one customer). */
export const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'msn.com', 'yahoo.com', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.co.uk', 'btinternet.com', 'btopenworld.com', 'btconnect.com', 'sky.com', 'virginmedia.com', 'virgin.net', 'blueyonder.co.uk',
  'talktalk.net', 'tiscali.co.uk', 'ntlworld.com', 'talk21.com', 'protonmail.com', 'proton.me', 'pm.me', 'gmx.com', 'gmx.co.uk', 'mail.com', 'zoho.com', 'zohomail.com',
  'outlook.co.uk', 'hotmail.de', 'yahoo.ie', 'ymail.com', 'rocketmail.com', 'fastmail.com', 'hey.com', 'live.ie', 'plus.com', 'plusnet.com', 'o2.co.uk', 'orange.net', 'lineone.net', 'freeserve.co.uk']);
export const domainOf = email => (String(email || '').trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/) || [])[1] || '';
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim());

/** What to search a mailbox for to find a customer's emails: their company domains, or whole webmail addresses. */
export function mailTerms(emails, ownDomain = '') {
  const out = new Set();
  for (const raw of emails || []) for (const e of String(raw || '').split(/[,;\s]+/)) {
    if (!validEmail(e)) continue;
    const d = domainOf(e); if (!d || d === ownDomain) continue;
    out.add(FREE_MAIL.has(d) ? e.trim().toLowerCase() : d);
  }
  return [...out].slice(0, 5);
}

/** Who an email address belongs to: an exact address first, then the company domain. index from customerIndex().
 *  Never the firm's own domain (a colleague is not a customer), and a domain shared by two different
 *  customers (a parent company, an agent) is left out rather than guessed. */
export function customerIndex(entries, ownDomain = '') {
  const byEmail = new Map(), byDomain = new Map(), shared = new Set();
  for (const { key, customer, email } of entries) for (const e of String(email || '').split(/[,;\s]+/)) {
    if (!validEmail(e)) continue;
    const a = e.trim().toLowerCase(), d = domainOf(a);
    if (d === ownDomain) continue;
    if (!byEmail.has(a)) byEmail.set(a, { key, customer });
    if (!d || FREE_MAIL.has(d)) continue;
    if (byDomain.has(d) && byDomain.get(d).key !== key) shared.add(d); else if (!byDomain.has(d)) byDomain.set(d, { key, customer });
  }
  for (const d of shared) byDomain.delete(d);
  return { byEmail, byDomain };
}
export const whoIs = (index, email) => { const a = String(email || '').trim().toLowerCase(); return index.byEmail.get(a) || index.byDomain.get(domainOf(a)) || null; };

/**
 * Sorting an email from info@ (Philip, 21 Oct: a known customer's "quantity change to 16, amended PO to follow" and
 * "does the quoted price include folding" were filed as new enquiries from new customers). The AI's first sort is kept
 * unless the sender is a known customer AND the email refers to an order or quote that already exists: then it is
 * customer correspondence, not new work. Nothing a stranger sends is changed.
 */
const EXISTING = /\b(?:SO|S0|DN|PF)[-\s]?\d{3,5}\b|\bP\.?O\.?[-\s#]?[A-Z]?\d{3,}\b|\bQ[-\s]?\d{3,4}\b|\bQCLE\s?\d{3,6}\b|\b(?:amend(?:ed|ment)?|quoted price|your quote|our order|the order|order (?:no|number)|quantity change|previously|as quoted|invoice|delivery note|re-?cut|arrived)\b/i;
export const refersToExisting = text => EXISTING.test(String(text || ''));
/** The kind an email is filed under: the AI's, unless a known customer is writing about something that exists already. */
export const sortEmail = (kind, { known = false, text = '' } = {}) => (kind === 'enquiry' && known && refersToExisting(text)) ? 'customer' : kind;
/** The customer an email belongs to: by the sender's address or domain, else by the company name the AI read. names: Map key → name. */
export function emailCustomer(index, email, company, names) {
  const hit = whoIs(index, email); if (hit) return hit.key;
  const k = normName(company || ''); return k && names?.has(k) ? k : '';
}

/** Email HTML as plain text, for the AI to read (no markup, no long quoted threads). */
export function plainText(html, max = 6000) {
  const t = String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  const cut = t.search(/\n(From|On .{5,80} wrote|-----Original Message)/);   // the earlier emails in a reply chain
  return (cut > 200 ? t.slice(0, cut) : t).slice(0, max);
}

/** Should the board read this message as a possible enquiry? Not from ourselves, not an automatic message. */
export function worthReading(m, ownDomain) {
  const from = String(m.from || '').toLowerCase();
  if (!from || (ownDomain && domainOf(from) === ownDomain)) return false;
  if (/no-?reply|donotreply|mailer-daemon|postmaster|notifications?@|newsletter|bounce/.test(from)) return false;
  return true;
}

/** Enquiries list: the new ones first, longest waiting first; hours waiting while it is new. */
export function enquiryList(rows, now) {
  const t = Date.parse(now);
  return (rows || []).filter(e => e.kind).map(e => ({ ...e, waitHours: e.status === 'new' ? Math.max(0, Math.round((t - Date.parse(e.receivedAt)) / 36e5)) : null }))
    .sort((a, b) => (a.status === 'new') !== (b.status === 'new') ? (a.status === 'new' ? -1 : 1) : a.status === 'new' ? b.waitHours - a.waitHours : b.receivedAt.localeCompare(a.receivedAt));
}
/** How many enquiries came in, were answered, quoted and won, in the last `days`. */
export function enquiryFunnel(rows, today, days = 90) {
  const from = dayNo(today) - days, xs = (rows || []).filter(e => e.kind === 'enquiry' && dayNo(e.receivedAt) >= from);
  const n = s => xs.filter(e => s.includes(e.status)).length;
  return { received: xs.length, answered: n(['replied', 'quoted', 'won', 'lost']), quoted: n(['quoted', 'won', 'lost']), won: n(['won']), waiting: n(['new']) };
}

/** Tasks for Home: overdue, today, the next 7 days, later; mine or everyone's. */
export function taskGroups(tasks, today, me = null) {
  const t = dayNo(today), open = (tasks || []).filter(x => !x.doneAt && (!me || x.assignedTo === me)).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id - b.id);
  return { overdue: open.filter(x => dayNo(x.dueOn) < t), today: open.filter(x => x.dueOn === today), soon: open.filter(x => dayNo(x.dueOn) > t && dayNo(x.dueOn) <= t + 7),
    later: open.filter(x => dayNo(x.dueOn) > t + 7), open };
}

/**
 * Repeat items due a reorder: an item a customer has ordered 3+ times at a steady gap, now past 1.25 times that gap
 * (and not so long ago that it has clearly stopped: under 4 times). base: customerBase() rows (items with dates).
 */
export function reordersDue(base, today) {
  const t = dayNo(today), out = [];
  for (const c of base || []) for (const it of c.allItems || c.items || []) {
    const dates = [...new Set(it.dates || [])].sort(); if (dates.length < 3) continue;
    const gaps = dates.slice(1).map((d, i) => dayNo(d) - dayNo(dates[i])).filter(g => g > 0), every = median(gaps);
    if (!every || every < 7) continue;
    const since = t - dayNo(dates.at(-1));
    if (since > every * 1.25 && since < every * 4) out.push({ key: c.key, customer: c.customer, contactId: c.contactId, item: it.item, times: dates.length, every: Math.round(every), last: dates.at(-1), since, worth: c.worth });
  }
  return out.sort((a, b) => b.worth - a.worth || b.since / b.every - a.since / a.every);
}

/**
 * Work a regular customer could also give us: they buy cut or folded parts from us but nothing we would finish,
 * fold or weld for them. From the processes the board ticked on their orders and the words on their invoices.
 * Only for customers with 4+ orders; it is a prompt to ask, not a guess about their business.
 */
export function couldBuyMore(base, jobs) {
  const ASK = [['P/Coat Paint', 'powder coating'], ['Fold', 'folding'], ['Weld', 'welding'], ['Tap & C/Sink', 'tapping and countersinking'], ['Insert', 'inserts']];
  const out = [];
  for (const c of base || []) {
    if (c.orders < 4) continue;
    const texts = (c.invoices || []).flatMap(x => (x.lines || []).map(l => l.description || ''));
    const seen = new Set(processHints(texts));
    for (const j of jobs || []) if (normName(j.customer) === c.key) for (const p of Object.keys(j.procs || {})) seen.add(p);
    if (!seen.has('Laser') && !seen.has('Fold')) continue;   // not a sheet metal customer we can tell about
    const missing = ASK.filter(([p]) => !seen.has(p)).map(([, t]) => t);
    if (missing.length && missing.length < ASK.length) out.push({ key: c.key, customer: c.customer, contactId: c.contactId, has: [...seen], missing: missing.slice(0, 2), worth: c.worth });
  }
  return out.sort((a, b) => b.worth - a.worth);
}

/** Everything that happened with one customer, newest first: orders, invoices, quotes, calls and notes, tasks, enquiries. */
export function timeline({ key, jobs = [], invoices = [], quotes = [], actions = [], tasks = [], enquiries = [] }) {
  const mine = x => normName(x.customer || '') === key || x.customerKey === key;
  const ev = [];
  for (const j of jobs) if (normName(j.customer) === key && !j.preview) ev.push({ at: j.ordered || j.createdAt, kind: 'order', text: `Order ${j.so}${j.po ? ' (PO ' + j.po + ')' : ''}`, ref: j.id });
  for (const x of invoices) if (normName(x.customer) === key) ev.push({ at: x.date, kind: x.net < 0 ? 'credit' : 'invoice', text: `${x.net < 0 ? 'Credit note' : 'Invoice'} ${x.number}`, ref: x.id });
  for (const q of quotes) if (normName(q.customer) === key && q.quoteDate) ev.push({ at: q.quoteDate, kind: 'quote', text: `Quote ${q.quoteNo}${q.status === 'Ordered' ? ' (ordered)' : ''}`, ref: q.spId });
  for (const a of actions) if (mine(a)) ev.push({ at: a.at, kind: a.kind, text: a.note || { email: 'Email drafted', call: 'Call', note: 'Note', visit: 'Visit', lost: 'Quote lost', reopen: 'Quote reopened' }[a.kind], ref: a.id });
  for (const t of tasks) if (mine(t)) ev.push({ at: t.doneAt || t.createdAt, kind: t.doneAt ? 'done' : 'task', text: `${t.doneAt ? 'Done' : 'Task'}: ${t.title}`, ref: t.id });
  for (const e of enquiries) if (e.customerKey === key) ev.push({ at: e.receivedAt, kind: 'enquiry', text: `Enquiry: ${e.wants || e.subject}`, ref: e.id });
  return ev.filter(e => e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** How the customer's orders are moving, in words (no figures): for the AI summary and the page. */
export function trendWords(c) {
  if (!c) return '';
  if (!c.prevNet && c.yearNet) return 'new in the last year';
  if (!c.yearNet && c.prevNet) return 'nothing in the last year';
  if (!c.prevNet) return '';
  const r = c.yearNet / c.prevNet;
  return r > 1.15 ? 'growing on the year before' : r < 0.85 ? 'down on the year before' : 'steady on the year before';
}

/**
 * The morning list for Home: what is waiting for someone today. won: won quotes not yet orders (a count, or null while
 * SharePoint is read); noDrawing/noContact: open orders with no drawing, or no contact saved (homeGaps in core/jobs.js).
 */
export function morning({ enquiries = [], tasks, chase = [], reorders = [], quiet = [], won = null, noDrawing = [], noContact = [] }) {
  return { enquiries: enquiries.filter(e => e.kind === 'enquiry' && e.status === 'new').length, overdueTasks: tasks.overdue.length, todayTasks: tasks.today.length,
    chase: chase.length, reorders: reorders.length, quiet: quiet.length, won, noDrawing: noDrawing.length, noContact: noContact.length };
}
