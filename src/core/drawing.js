/**
 * Reading a drawing (Philip, 20 Oct): the text of a customer's PDF drawing, as CAD writes it, turned into
 * the processes it probably needs, each with the words that suggested it, plus anything that is not one of
 * Clarke Lane's nine processes (turning, machined threads, engraving) as a flag rather than a guess.
 * Suggestions only: Levi or Mandy add them. Bends that are only drawn (no words) cannot be read here.
 * Pure: no window, no PDF library (app.js extracts the text). Tested in tests/drawing.mjs.
 */
import { PROCESSES } from './jobs.js';

// Title blocks repeat the same small print on every drawing; it must not suggest anything.
const BOILERPLATE = [/remove\s+all\s+burrs?(\s+and\s+sharp\s+edges)?/gi, /de-?burr(\s+all)?(\s+sharp\s+edges)?/gi, /do\s+not\s+scale/gi,
  /surface\s+(finish|treatment)\s*:?\s*none/gi, /heat\s+treatment\s*:?\s*none/gi, /finish\s*:?\s*none/gi, /unless\s+otherwise\s+stated/gi,
  /computer\s+generated\s+drawing[^.]*/gi, /third\s+angle\s+projection/gi, /machined\s+surfaces?\s+finish[^.]*/gi];

// Each process: the patterns that suggest it. The first match is shown as the reason.
const RULES = [
  ['Laser', [/\b(?:cut|laser(?:ed)?|profiled?)\s+(?:from|out\s+of)\b[^.]{0,40}\bsheet/i, /\b\d+(?:\.\d+)?\s*mm\s*(?:thk|thick)\b/i, /\bsheet\b/i, /\blaser\b/i, /\bflat\s+pattern\b/i, /\bdxf\b/i]],
  ['Fold', [/\bflat\s+pattern\b/i, /\bbend(?:s|ing)?\b/i, /\bfold(?:s|ed|ing)?\b/i, /\bk[- ]?factor\b/i, /\b(?:up|down)\s+\d+(?:\.\d+)?\s*°/i, /\bhem(?:med)?\b/i, /\bformed\b/i]],
  ['Cut & Drill', [/\bdrill(?:ed|ing)?\b/i, /\bream(?:ed)?\b/i, /\bcut\s+to\s+length\b/i, /\b(?:box|angle|channel|flat)\s+section\b/i, /\btube\b/i]],
  ['Tap & C/Sink', [/\btap(?:ped|ping)?\b/i, /\bc\/?sink\b|\bcountersunk?\b|\bcsk\b/i, /\bchamfer\s+90\s*°/i, /\bm\d+(?:\.\d+)?\s*(?:x\s*[\d.]+\s*)?(?:tapped|tap)\b/i, /\bthreaded\s+holes?\b/i]],
  ['Insert', [/\binserts?\b/i, /\bpem\b/i, /\bclinch(?:ed|ing)?\b/i, /\brivnuts?\b|\bnutserts?\b|\bhelicoils?\b/i, /\bstud(?:s)?\s+(?:fitted|press)/i]],
  ['Weld', [/\bweld(?:s|ed|ing)?\b/i, /\b(?:tig|mig)\b/i, /\bfillet\b/i]],
  ['P/Coat Paint', [/\bpowder\s*coat(?:ed|ing)?\b/i, /\bp\/?coat\b/i, /\bpaint(?:ed)?\b/i, /\bral\s*\d{4}\b/i]],
  ['Plating / Anodising', [/\banodi[sz](?:e|ed|ing)\b/i, /\bzinc\s+plat/i, /\bplat(?:ed|ing)\b/i, /\bpassivat/i, /\bchromate\b|\balocrom\b|\biridite\b/i, /\bnickel\b/i, /\belectro-?plat/i]],
  ['Rolling', [/\brolled\b|\brolling\b|\broll\s+to\b/i]],
];

// Not one of the nine processes: said plainly so someone decides (bought in, or done another way).
const FLAGS = [
  [/\b(?:round\s+)?bar\b(?!\s*code)/i, 'Made from bar stock: probably turned, not lasered'],
  [/\bturn(?:ed|ing)\b|\blathe\b/i, 'Turning'],
  [/\bmachine\s+threads?\b|\bexternal\s+threads?\b/i, 'An outside thread (not a tapped hole)'],
  [/\bmill(?:ed|ing)\b/i, 'Milling'],
  [/\bengrav(?:e|ed|ing)\b/i, 'Engraving'],
  [/\bmask(?:ed|ing)?\b/i, 'Masking before finishing'],
  [/\bheat\s+treat/i, 'Heat treatment'],
];

const clean = text => BOILERPLATE.reduce((t, re) => t.replace(re, ' '), String(text || '')).replace(/\s+/g, ' ');

/**
 * text: everything the PDF says. Returns { readable, suggest: [process], why: { process: words },
 * flags: [text], facts: { material, thickness, finish, part } }.
 */
export function readDrawing(text) {
  const raw = String(text || '');
  const t = clean(raw);
  const readable = t.replace(/[^a-z]/gi, '').length >= 40;
  const why = {};
  const bar = /\b(?:round\s+)?bar\b(?!\s*code)/i.test(t) && !/\bsheet\b/i.test(t);
  for (const [p, res] of RULES) {
    if (bar && p === 'Laser') continue;   // bar stock is not lasered, whatever "mm" says
    for (const re of res) { const m = t.match(re); if (m) { why[p] = m[0].trim(); break; } }
  }
  // An outside thread on a bar part is not tapping.
  if (bar && why['Tap & C/Sink'] && !/\btap(?:ped)?\b|\bcountersunk?\b|\bcsk\b|c\/?sink/i.test(t)) delete why['Tap & C/Sink'];
  const flags = FLAGS.filter(([re]) => re.test(t)).map(([, s]) => s);
  const grab = re => (t.match(re)?.[1] || '').trim().replace(/\s+/g, ' ');
  const facts = {
    material: grab(/\bmaterial\b\s*:?\s*([a-z0-9][a-z0-9 .\-/()]{2,40}?)(?=\s+(?:weight|finish|mass|drawn|designed|heat|surface|description|part|dims|\d+\.\s)|$)/i)
      || grab(/\b((?:\d{3,4}\s+)?(?:stainless\s+steel|aluminium|mild\s+steel|zintec|galv(?:anised)?\s+steel)[a-z0-9 .\-]{0,20})/i),
    thickness: grab(/\b(\d+(?:\.\d+)?\s*mm)\s*(?:thk|thick)\b/i),
    finish: grab(/\b(?:finish(?:\/colou?r)?|surface\s+treatment)\b\s*:?\s*((?!none\b)[a-z][a-z0-9 \-]{2,30}?)(?=\s+(?:material|weight|part|\d+\.\s)|$)/i)
      || grab(/\b((?:black|clear|silver)\s+anodi[sz]e\w*|powder\s+coat\w*(?:\s+[a-z]+)?|zinc\s+plat\w*)/i),
    part: grab(/\b(?:part\s*(?:no|number)|p\/?no)\b\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]{3,24})/i),
  };
  return { readable, suggest: PROCESSES.filter(p => why[p]), why, flags, facts };
}

/** What to offer for a job: the suggested processes it does not have yet. procs: the job's { process: … }. */
export const toAdd = (reading, procs) => reading.suggest.filter(p => !procs[p]);

/**
 * Processes from history (same part made before): the newest earlier job with a line whose part matches
 * (ignoring case and punctuation, or by a part number in it). Returns { so, processes } or null.
 */
export function processesFromHistory(jobs, part) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const p = norm(part); if (p.length < 4) return null;
  const code = (String(part).match(/\b[A-Z0-9]{2,}[-/][A-Z0-9][A-Z0-9\-/]{2,}\b/i) || [])[0];
  const hit = j => j.lines.some(l => norm(l.part) === p || (code && String(l.part).toUpperCase().includes(code.toUpperCase())));
  const j = [...jobs].filter(x => x.status !== 'cancelled' && Object.keys(x.procs || {}).length)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id - a.id).find(hit);
  return j ? { so: j.so, processes: PROCESSES.filter(x => j.procs[x]) } : null;
}
