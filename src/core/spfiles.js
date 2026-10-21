/**
 * SharePoint files (Philip, 21 Oct): Clarke Lane's own folders in the Company Data site, read only. A customer's
 * client folder and laser (Bystronic) folder on their page, the history of old quotes from the file names,
 * drawings found by part number for orders and Parts, and the material certificate folder for the grades on
 * an order. Nothing is copied: the board keeps only which folder belongs to which customer.
 * Pure: tested in tests/spfiles.mjs. file: { id, name, path, size, at, url, driveId, itemId }.
 */
import { normName } from './xero.js';
import { normPartNo, namesPart, partNumbersIn } from './parts.js';

/**
 * The folder for a customer: the one whose name is the customer's (normName, so Ltd and Limited are the same);
 * failing that, the only folder that starts with the other's name ("Example" and "Example Racing"). Else null.
 */
export function matchFolder(key, folders) {
  if (!key) return null;
  const all = (folders || []).map(f => ({ f, k: normName(f.name) })).filter(x => x.k);
  const same = all.find(x => x.k === key); if (same) return same.f;
  const near = all.filter(x => Math.min(x.k.length, key.length) >= 4 && (x.k.startsWith(key) || key.startsWith(x.k)));
  return near.length === 1 ? near[0].f : null;
}

/**
 * A customer's two folders, client and laser: the one linked by hand if there is one (itemId null: "has none"),
 * else the one found by name. how: 'linked' | 'name' | 'none' | 'missing'. links: loadCustomerFolders().
 */
export function customerFolders(key, links, { clients = [], laser = [] } = {}) {
  const pick = (kind, list) => {
    const l = (links || []).find(x => x.key === key && x.kind === kind);
    if (l) return l.itemId ? { folder: { name: l.name, driveId: l.driveId, itemId: l.itemId, url: l.url }, how: 'linked' } : { folder: null, how: 'none' };
    const f = matchFolder(key, list);
    return { folder: f, how: f ? 'name' : 'missing' };
  };
  return { client: pick('client', clients), laser: pick('laser', laser) };
}

/** "QCLE06556 Bracket.xlsx", "QCLE 06509.pdf" → "QCLE06556"; anything else → null. */
export function quoteNo(name) {
  const m = String(name || '').match(/^QCLE[\s_-]*(\d{3,6})(?!\d)/i);
  return m ? 'QCLE' + m[1].padStart(5, '0') : null;
}
/** In the one-off customers' folder the customer comes after the number: "QCLE04906 - Example Ltd.xlsx" → "Example Ltd". */
export const quoteCustomer = name => String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/^QCLE[\s_-]*\d{3,6}[\s_–-]*/i, '').trim();

const DRAWING = /\.(pdf|dxf|dwg|stp|step|igs|iges|png|jpe?g|tiff?|bmp|gif|webp|sldprt|slddrw|x_t|nc|lsr|geo)$/i;
/** Which group a file goes in on the customer page: drawings, quotes, delivery, certs or other. */
export function fileGroup(f) {
  const n = String(f.name || ''), p = String(f.path || '');
  if (quoteNo(n) || /(^|\/)quotes?(\/|$)/i.test(p) || /\bquot(e|ation)\b/i.test(n)) return 'quotes';
  if (/deliver(y|ies)|\bD\/?N[\s_-]?\d|despatch|dispatch/i.test(n)) return 'delivery';
  if (/conformity|\bDoC\b|\bcert(s|ificate)?\b|\bC\s?of\s?C\b/i.test(n)) return 'certs';
  if (/pro[\s_-]?forma|invoice|statement/i.test(n)) return 'other';
  if (DRAWING.test(n)) return 'drawings';
  return 'other';
}
export const GROUPS = [['drawings', 'Drawings'], ['quotes', 'Old quotes'], ['delivery', 'Delivery notes'], ['certs', 'Certificates'], ['other', 'Other']];

/**
 * The customer page's lists: newest first, matching the search (name or folder), grouped. Old quotes only for
 * the office (the shop floor never sees them). Returns [{ key, title, files }] for the groups that have any.
 */
export function groupFiles(files, { q = '', office = false } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const hit = f => words.every(w => `${f.name} ${f.path || ''}`.toLowerCase().includes(w));
  const list = (files || []).filter(hit).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || String(a.name).localeCompare(String(b.name)));
  return GROUPS.filter(([k]) => office || k !== 'quotes')
    .map(([key, title]) => ({ key, title, files: list.filter(f => fileGroup(f) === key) })).filter(g => g.files.length);
}

/**
 * Old quotes from the file names: how many different QCLE numbers, and the first and last year they were
 * written. misc: files in the one-off customers' folder, counted when the name after the number is this
 * customer's. Returns { count, first, last } (years) or null when there are none.
 */
export function quoteHistory(files, { key = '', misc = [] } = {}) {
  const seen = new Map();
  const add = f => { const no = quoteNo(f.name); if (!no) return; const y = String(f.at || '').slice(0, 4);
    if (!seen.has(no) || (y && y < seen.get(no))) seen.set(no, y); };
  for (const f of files || []) add(f);
  for (const f of misc || []) if (key && normName(quoteCustomer(f.name)) === key) add(f);
  if (!seen.size) return null;
  const years = [...seen.values()].filter(Boolean).sort();
  return { count: seen.size, first: years[0] || null, last: years[years.length - 1] || null };
}

/** "03-7866-0000 Issue 05.pdf" → 5, "Bracket Rev C.pdf" → 3, none → 0. Higher is newer. */
export function issueOf(name) {
  const m = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').match(/(?:^|[^a-z])(?:issue|iss|rev(?:ision)?)[\s._-]*([0-9]{1,3}|[a-z]{1,2})(?![a-z0-9])/i);
  if (!m) return 0;
  const v = m[1].toUpperCase();
  return /^\d+$/.test(v) ? Number(v) : [...v].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
}

/** The drawings in the folders that name a part number, best first: highest issue, a PDF before other kinds, newest. */
export function drawingsFor(partNo, files) {
  const pdf = f => /\.pdf$/i.test(f.name) ? 0 : 1;
  return (files || []).filter(f => fileGroup(f) === 'drawings' && namesPart(String(f.name).replace(/\.[a-z0-9]{2,6}$/i, ''), partNo))
    .sort((a, b) => issueOf(b.name) - issueOf(a.name) || pdf(a) - pdf(b) || String(b.at || '').localeCompare(String(a.at || '')));
}

/**
 * Drawings to offer on an order: for each part number its lines name (spotted on the lines, or a Parts part of
 * this customer), the best drawing in the customer's folders, unless the order already has that file.
 * Returns [{ partNo, file, more }] (more: how many other files also matched).
 */
export function foundDrawings(job, files, parts = []) {
  const key = normName(job.customer), have = new Set((job.files || []).map(f => f.itemId));
  const nos = new Map();
  for (const l of job.lines || []) {
    for (const no of partNumbersIn(l.part)) nos.set(normPartNo(no), no);
    for (const p of parts) if (p.customerKey === key && namesPart(l.part, p.partNo)) nos.set(normPartNo(p.partNo), p.partNo);
  }
  const out = [];
  for (const no of nos.values()) {
    const hits = drawingsFor(no, files);
    if (hits.length && !hits.some(f => have.has(f.itemId))) out.push({ partNo: no, file: hits[0], more: hits.length - 1 });
  }
  return out;
}

/**
 * Material grades named in text, as the certificate folders call them: S275, S355, 304, 316, and the
 * aluminium grades (1050, 5083, 5251, 6061, 6063, 6082). Stainless and aluminium numbers count only when the
 * text says stainless or aluminium (or 304L, A4, T6, H32…), so a quantity of 304 is not a grade.
 */
export function gradesIn(text) {
  const t = String(text || '').toUpperCase(), out = [];
  const add = g => { if (!out.includes(g)) out.push(g); };
  for (const m of t.matchAll(/\bS(235|275|355)(?:JR|J0|J2|MC|N)?\b/g)) add('S' + m[1]);
  const ss = /STAINLESS|\bST\.?\s?ST\b|\bS\/S\b|\bSS\b|\bA[24]\b|\bINOX\b/.test(t);
  for (const m of t.matchAll(/(SS|\b)(304|316)(L?)\b/g)) if (ss || m[1] || m[3]) add(m[2]);
  if (/\b1\.43(01|07)\b/.test(t)) add('304');
  if (/\b1\.44(01|04)\b/.test(t)) add('316');
  const al = /ALU|ALLOY|\bALI\b|\bAL\b|\bNS4\b|\bNS8\b|\bHE30\b/.test(t);
  for (const m of t.matchAll(/\b(1050|5083|5251|6061|6063|6082)(A)?(?:[\s-]?(T\d|H\d{2,3}|O))?\b/g)) if (al || m[3]) add(m[1]);
  return out;
}
/** The grades on an order's lines and notes. */
export const gradesOnJob = job => [...new Set([...(job.lines || []).flatMap(l => gradesIn(l.part)), ...gradesIn(job.notes)])];

/** Each grade with its certificate folder ("6082 T6" is the 6082 folder), or folder: null when there is none. */
export function certFolders(grades, folders) {
  return (grades || []).map(g => ({ grade: g,
    folder: (folders || []).find(f => String(f.name).toUpperCase().split(/[\s_-]+/)[0].replace(/[^A-Z0-9]/g, '') === g) || null }));
}
