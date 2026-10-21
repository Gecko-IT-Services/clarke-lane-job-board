/**
 * The reorder round (Philip, 21 Oct: "47 repeat parts are due a reorder and nobody asks"): once a week Mandy or
 * Levi goes down the repeat parts past their usual gap (reordersDue in core/crm.js, from Xero's invoices) and asks
 * each customer, by an AI email or a phone call. The board remembers what was asked and what was not needed, so
 * the list gets shorter, and spots the orders that came back. Stored as sales_actions rows, no new table:
 *   kind 'reorder'        note 'Reorder: <item>'                   asked about it
 *   kind 'reorder_snooze' note 'until YYYY-MM-DD · <item>'          not needed for now
 * Pure: no window. Tested in tests/reorders.mjs.
 */
import { normName } from './xero.js';

const dayNo = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T12:00:00Z') / 864e5);
const r2 = n => Math.round(n * 100) / 100;
export const ASKED_FOR = 30;    // days an ask counts as asked; after that the item is due again
export const SNOOZE_FOR = 90;   // "Not needed" puts it away for this long
const WON_WITHIN = 90;          // an order this long after the ask still counts as the ask working

export const reorderNote = item => `Reorder: ${item}`;
export const snoozeNote = (item, until) => `until ${until} · ${item}`;
/** The item a reorder action is about, and a snooze's until date. */
const itemOf = note => String(note || '').replace(/^\s*(reorder:\s*|until \d{4}-\d{2}-\d{2}\s*·\s*)/i, '').trim().toLowerCase();
const untilOf = note => (String(note || '').match(/until (\d{4}-\d{2}-\d{2})/) || [])[1] || null;

/**
 * The words that name an item, for spotting it on an order line: the first 3 meaningful words of the invoice
 * description, leaving out sizes and thicknesses (2mm, 1000x500, 3) and little words. "Shelf bracket 2mm Zintec"
 * → shelf, bracket, zintec. Part codes (BRK-1) are kept: they are the surest match of all.
 */
const SMALL = new Set(['and', 'the', 'for', 'with', 'off', 'of', 'to', 'in', 'on', 'a', 'x', 'per', 'pcs', 'qty', 'as', 'drg', 'drawing', 'rev']);
const SIZE = /^\d+([.,]\d+)?(mm|cm|m|g|kg|swg|ga|thk|dia)?$|^\d+([.,]\d+)?(x\d+([.,]\d+)?)+(mm)?$|^m\d+$/i;
export function itemWords(item) {
  return String(item || '').toLowerCase().split(/[\s,;/()"+]+/).map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(w => w.length > 1 && !SMALL.has(w) && !SIZE.test(w)).slice(0, 3);
}
const tokens = text => new Set(String(text || '').toLowerCase().split(/[\s,;/()"+]+/).map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')).filter(Boolean));
/** Does an order line's text name this item? Every one of its words is on the line (loosely: "brackets" counts for "bracket"). */
export function lineNamesItem(text, item) {
  const want = itemWords(item); if (!want.length) return false;
  const have = tokens(text);
  return want.every(w => have.has(w) || have.has(w + 's') || have.has(w + 'es') || (w.endsWith('s') && have.has(w.slice(0, -1))));
}

/**
 * Each due reorder with what has been done about it: { ...r, asked, askedBy, snoozedUntil, state, wonOrder }.
 * state: 'won' (asked, and an order naming the item came in on or after the ask), 'snoozed' (marked not needed,
 * until a date still ahead), 'asked' (asked in the last 30 days), else 'due'. Items asked about that have since
 * dropped off the due list (ordered and invoiced) are kept only if their order is found, so the tally counts them.
 * reorders: reordersDue() rows; actions: sales_actions rows ({ customer, kind, note, by, at }); jobs: the board's orders.
 */
export function reorderRound(reorders, actions, jobs, today) {
  const t = dayNo(today), key = (k, item) => k + '|' + String(item || '').trim().toLowerCase();
  const acts = new Map();   // customer|item → its reorder actions, newest first
  for (const a of actions || []) {
    if (a.kind !== 'reorder' && a.kind !== 'reorder_snooze') continue;
    const k = key(normName(a.customer), itemOf(a.note)), l = acts.get(k) || []; l.push(a); acts.set(k, l);
  }
  for (const l of acts.values()) l.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const orders = (jobs || []).filter(j => j.status !== 'cancelled' && !j.preview && j.ordered);
  const rows = (reorders || []).map(r => ({ ...r }));
  const seen = new Set(rows.map(r => key(r.key, r.item)));
  // Asked about, no longer due: it may have come back in.
  for (const [k, l] of acts) {
    const ask = l.find(a => a.kind === 'reorder'); if (seen.has(k) || !ask || t - dayNo(ask.at) > WON_WITHIN) continue;
    const item = String(ask.note || '').replace(/^\s*reorder:\s*/i, '').trim();
    rows.push({ key: normName(ask.customer), customer: ask.customer, contactId: '', item, times: null, every: null, last: null, since: null, worth: 0, gone: true });
  }
  const out = rows.map(r => {
    const l = acts.get(key(r.key, r.item)) || [];
    const ask = l.find(a => a.kind === 'reorder') || null, snooze = l.find(a => a.kind === 'reorder_snooze') || null;
    const asked = ask ? String(ask.at).slice(0, 10) : null, until = snooze ? untilOf(snooze.note) : null;
    const wonOrder = asked && orders.filter(j => normName(j.customer) === r.key && j.ordered >= asked && dayNo(j.ordered) - dayNo(asked) <= WON_WITHIN
      && (j.lines || []).some(x => lineNamesItem(x.part, r.item))).sort((a, b) => a.ordered.localeCompare(b.ordered))[0] || null;
    // The newest of ask and snooze wins: asked again after a snooze is asked, snoozed after an ask is snoozed.
    const snoozedNow = until && until > today && (!ask || String(snooze.at) >= String(ask.at));
    const state = wonOrder ? 'won' : snoozedNow ? 'snoozed' : asked && t - dayNo(asked) <= ASKED_FOR ? 'asked' : 'due';
    return { ...r, asked, askedBy: ask?.by || null, snoozedUntil: snoozedNow ? until : null, state, wonOrder };
  }).filter(r => !r.gone || r.state === 'won');
  const rank = { due: 0, asked: 1, snoozed: 2, won: 3 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'due' ? b.worth - a.worth : String(b.asked || b.snoozedUntil || '').localeCompare(String(a.asked || a.snoozedUntil || ''))));
}

/**
 * The round's figures for the header: due now, and this month asked and won (won value from the order, for Levi
 * only: the drawing hides it unless md). jobValue: the order's value, as on the rest of the board.
 */
export function reorderTally(round, today, jobValue = null) {
  const m = today.slice(0, 7), won = round.filter(r => r.state === 'won' && r.wonOrder.ordered.slice(0, 7) === m);
  return { due: round.filter(r => r.state === 'due').length, asked: round.filter(r => r.asked && r.asked.slice(0, 7) === m).length, won: won.length,
    wonValue: jobValue ? r2(won.reduce((a, r) => a + (Number(jobValue(r.wonOrder)) || 0), 0)) : null };
}

/** What Levi would say, for the AI email: the item, how often and when it was last ordered. */
export const reorderAngle = r => `Their regular order of "${r.item}" looks due: they usually order it about every ${r.every} days and last ordered it on ${r.last}. Ask whether they need the next batch.`;

/** The Monday nudge on Home: it is Monday, or nobody has asked about a reorder for a week, and there are some to ask. */
export function roundNudge(round, actions, today) {
  const due = round.filter(r => r.state === 'due').length; if (!due) return 0;
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  const lately = (actions || []).some(a => a.kind === 'reorder' && dayNo(today) - dayNo(a.at) < 7);
  return monday || !lately ? due : 0;
}
/** The prompt's words: on a Monday it is the Monday round; any other day it is because nobody has asked for a week. */
export const nudgeWords = (n, today) => new Date(today + 'T12:00:00Z').getUTCDay() === 1
  ? `Monday reorder round: ${n} to ask this week.` : `Nobody has asked about a repeat part for a week: ${n} waiting.`;
