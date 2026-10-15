/**
 * Preview: Xero's open sales orders shown as jobs, in the browser only, so Levi can see the board
 * with his real order book before go-live. Nothing here is saved anywhere. Pure: tested in
 * tests/preview.mjs.
 */
import { PROCESSES } from './jobs.js';

/** Processes guessed from a line's description, for the preview only (real orders are ticked by Mandy). */
const HINTS = [
  ['Laser', /laser|profile|\bcut\b/i],
  ['Fold', /fold|bend|brake|formed/i],
  ['Roll Drill', /\broll|drill/i],
  ['Tap', /\btap(ped|ping)?\b|thread/i],
  ['Insert', /insert|\bpem\b|rivnut|captive nut/i],
  ['C/Sink', /c\/?sink|countersink|\bcsk\b/i],
  ['Weld', /weld|fabricat/i],
  ['P/Coat Paint', /powder|p\/?coat|paint|\bral\s?\d/i],
  ['Plating / Anodising', /zinc|plat(ed|ing)|anodis|galv/i],
];
export function guessProcesses(texts) {
  const all = texts.join(' ');
  const hit = HINTS.filter(([, re]) => re.test(all)).map(([p]) => p);
  const out = PROCESSES.filter(p => hit.includes(p));
  return out.length ? out : ['Laser'];
}

const isOpenSo = q => /^SO-?\d+$/i.test(q.number) && !['DECLINED', 'DELETED', 'INVOICED'].includes(q.status);
const soNo = n => String(n).toUpperCase().replace(/^SO(\d)/, 'SO-$1');

/**
 * quotes: the Xero read route's quotes. onBoard(q): true when that order is already a real job.
 * fallbackDue(date): the due date when Xero has no expiry date. Ids are negative so they never
 * meet a real job's id.
 */
export function previewJobs(quotes, onBoard, fallbackDue) {
  return quotes.filter(q => isOpenSo(q) && !onBoard(q)).map((q, n) => {
    const due = q.expiry || fallbackDue(q.date);
    const lines = (q.lines || []).filter(l => Number(l.qty) > 0);
    return {
      id: -(n + 1), preview: true, so: soNo(q.number), quote: '', spQuoteId: null, xeroQuoteId: q.id,
      customer: q.customer || '', contactName: '', contactEmail: '', po: q.reference || '',
      ordered: q.date || '', due, notes: '', address: '', status: 'open', priority: null,
      lines: lines.map((l, i) => ({ id: -((n + 1) * 1000 + i), lineNo: i + 1, part: l.description || '(no description)',
        qty: Number(l.qty), price: Number(l.unit), due, po: '' })),
      procs: Object.fromEntries(guessProcesses(lines.map(l => l.description || '')).map(p => [p, { done: false }])),
      despatches: [], cancelledDespatches: [],
    };
  }).filter(j => j.lines.length);
}
