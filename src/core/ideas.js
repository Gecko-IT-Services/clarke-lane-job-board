/**
 * Ideas (Philip, 21 Oct): what the AI is told when Levi asks for ideas to win more work, from the board's own
 * records (what each customer buys, how often, whether they are growing or slipping, quotes, enquiries) and from
 * reading customers' websites and public pages. Never money: trends are words. Pure: tested in tests/ideas.mjs.
 */
import { FREE_MAIL, domainOf } from './crm.js';

/** A customer's direction in words (no figures leave the board). */
export function trendOf(c) {
  if (c.lapsed) return 'stopped ordering';
  if (c.quiet) return 'gone quiet';
  if (c.orders <= 2) return 'new or occasional';
  if (c.prevNet > 0 && c.yearNet > c.prevNet * 1.2) return 'growing';
  if (c.prevNet > 0 && c.yearNet < c.prevNet * 0.8) return 'slipping';
  return 'steady';
}

/** Facts for "Think of ideas". base: customerBase(); more: couldBuyMore(); reorders: reordersDue(); research: loadResearch();
 *  oldQuotes: Map key → quoteHistory() from their SharePoint folders. */
export function ideasFacts({ base = [], more = [], reorders = [], chase = 0, stats = null, funnel = null, research = [], oldQuotes = new Map(), company = 'Clarke Lane Engineering' }) {
  const also = new Map(more.map(x => [x.key, x.missing]));
  return {
    customer: '(all customers)', company,
    whatWeDo: 'Laser cutting, folding, cutting and drilling, tapping and countersinking, inserts, welding, powder coating and painting, plating and anodising (through partners), and rolling, for sheet metal parts and fabrications.',
    customers: base.filter(c => c.orders > 0).slice(0, 30).map(c => ({ customer: c.customer, ordersOnRecord: c.orders, lastOrdered: c.last, quietForDays: c.since,
      usualDaysBetweenOrders: c.usual, trend: trendOf(c), theyBuy: (c.items || []).slice(0, 4).map(i => i.item), neverHadFromUs: also.get(c.key) || [],
      ...(oldQuotes.get(c.key) ? { quotesSentOverTheYears: { count: oldQuotes.get(c.key).count, firstYear: oldQuotes.get(c.key).first, lastYear: oldQuotes.get(c.key).last } } : {}) })),
    repeatItemsDue: reorders.slice(0, 10).map(r => ({ customer: r.customer, item: r.item, usuallyEveryDays: r.every, daysSince: r.since })),
    quotes: { toChaseNow: chase, winRate: stats?.rate == null ? null : Math.round(stats.rate * 100) + '%' },
    websiteEnquiriesLast90Days: funnel,
    customerResearch: research.slice(0, 12).map(r => ({ customer: r.customer, about: r.about, news: (r.news || []).map(n => n.text).slice(0, 4), openings: (r.openings || []).map(o => o.idea).slice(0, 3) })),
  };
}

/** The customer's website from their email addresses (not webmail, not ours), e.g. "example.co.uk", or ''. */
export function websiteGuess(emails, ownDomain = '') {
  const count = new Map();
  for (const raw of emails || []) for (const e of String(raw || '').split(/[,;\s]+/)) {
    const d = domainOf(e); if (!d || FREE_MAIL.has(d) || d === ownDomain) continue;
    count.set(d, (count.get(d) || 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/** Ideas grouped: the newest batch (still open first), and how many older ones are still open. */
export function ideaBoard(ideas) {
  const all = [...(ideas || [])].sort((a, b) => b.batchAt.localeCompare(a.batchAt) || a.id - b.id);
  const at = all[0]?.batchAt || null;
  const rank = { doing: 0, new: 1, done: 2, no: 3 };
  const latest = all.filter(i => i.batchAt === at).sort((a, b) => rank[a.status] - rank[b.status] || a.id - b.id);
  const older = all.filter(i => i.batchAt !== at && ['new', 'doing'].includes(i.status));
  return { at, latest, older };
}
