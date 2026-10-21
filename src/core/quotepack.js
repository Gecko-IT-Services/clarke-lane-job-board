/**
 * The quote pack (Philip, 21 Oct: "the slowest step between an enquiry and an order is reading the drawings and
 * working out what is being asked"): an enquiry and its drawings read by AI into the parts, what each drawing says,
 * the questions Levi must ask before he can quote, and anything risky. This file is the pure part: which attachments
 * are worth sending, the facts sent (never a price), tidying the AI's answer, and the text copied for the quote
 * calculator. Pure: no window. Tested in tests/quotepack.mjs.
 */
import { PROCESSES } from './jobs.js';

/** Limits, kept in step with the sales-ai function (it refuses more than 12 MB of documents). */
export const PACK_LIMITS = { files: 4, fileBytes: 4 * 1024 * 1024, totalBytes: 12 * 1024 * 1024, text: 6000, fileText: 2500 };

/** The media type the AI reads a file as, from its name and Outlook's content type: a PDF or a picture, else null. */
export function docMediaType(name, contentType = '') {
  const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '', ct = String(contentType || '').toLowerCase();
  if (ext === 'pdf' || ct === 'application/pdf') return 'application/pdf';
  if (ext === 'png' || ct === 'image/png') return 'image/png';
  if (['jpg', 'jpeg'].includes(ext) || ct === 'image/jpeg' || ct === 'image/jpg') return 'image/jpeg';
  if (ext === 'webp' || ct === 'image/webp') return 'image/webp';
  return null;   // DXF, STEP, Word, zip: the AI cannot read them, so the pack says what it could not read
}

/**
 * Which of an email's attachments to fetch for the AI (Graph's attachment list: { id, name, contentType, size,
 * '@odata.type' }): real files (not Outlook items or links), PDFs and pictures, 4 MB or less each, at most 4 and
 * 12 MB in all, drawings (PDFs) before pictures, as they come in the email otherwise.
 */
export function attachmentsToRead(list, limits = PACK_LIMITS) {
  const ok = (list || []).filter(a => (!a['@odata.type'] || a['@odata.type'] === '#microsoft.graph.fileAttachment') && !a.isInline
    && docMediaType(a.name, a.contentType) && Number(a.size) > 0 && Number(a.size) <= limits.fileBytes);
  const pdfFirst = [...ok.filter(a => docMediaType(a.name, a.contentType) === 'application/pdf'), ...ok.filter(a => docMediaType(a.name, a.contentType) !== 'application/pdf')];
  const out = []; let total = 0;
  for (const a of pdfFirst) {
    if (out.length >= limits.files || total + Number(a.size) > limits.totalBytes) continue;
    out.push(a); total += Number(a.size);
  }
  return out;
}

/** Money taken out of text sent to the AI: a pack never talks about prices, so it never needs one (a customer's
 *  target price stays in the email for Levi to read himself). */
export const noMoney = s => String(s || '').replace(/(£|GBP\s?|€|\$)\s?\d[\d,]*(\.\d+)?(k\b)?/gi, '[amount]');
const cut = (s, n) => { const t = noMoney(s).trim(); return t.length > n ? t.slice(0, n) + ' …' : t; };

/**
 * What is sent to the AI about one enquiry (documents travel separately): who, what they asked and the email
 * text (6,000 characters at most), and each attachment's name with the text read from it. Only these fields, so
 * nothing else on the enquiry row (or a price from anywhere) can ride along. e: an enquiry row, plus `text`.
 */
export function packFacts(e, attachments = [], limits = PACK_LIMITS) {
  return {
    from: String(e.fromEmail || ''), fromName: String(e.person || e.fromName || ''), company: String(e.company || ''),
    subject: String(e.subject || ''), text: cut(e.text || e.summary || '', limits.text), wants: cut(e.wants || '', 600),
    attachments: (attachments || []).slice(0, limits.files).map(a => ({ name: String(a.name || ''), text: cut(a.text || '', limits.fileText) })),
  };
}

const str = x => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
const strs = xs => (Array.isArray(xs) ? xs : []).map(str).filter(Boolean);
/** The AI's answer tidied for keeping: every field present, processes only from Levi's nine (exact names). */
export function cleanPack(x) {
  const ps = new Set(PROCESSES);
  return {
    summary: str(x?.summary),
    parts: (Array.isArray(x?.parts) ? x.parts : []).map(p => ({ partNo: str(p.partNo), description: str(p.description), material: str(p.material), thickness: str(p.thickness),
      qty: str(p.qty), finish: str(p.finish), processes: [...new Set(strs(p.processes).filter(q => ps.has(q)))].sort((a, b) => PROCESSES.indexOf(a) - PROCESSES.indexOf(b)), notes: str(p.notes) }))
      .filter(p => p.partNo || p.description),
    questions: strs(x?.questions), watchOut: strs(x?.watchOut),
  };
}

/**
 * The pack as plain text for the clipboard (Copy for the quote calculator): one line per part, then the questions.
 * e.g. "1. BRK-100 rev B, Bracket · 3mm · S275 · qty 50 · powder coat black · Laser, Fold, P/Coat Paint".
 */
export function quotePackText(pack, { company = '' } = {}) {
  const p = cleanPack(pack || {});
  const line = (x, i) => `${i + 1}. ${[[x.partNo, x.description].filter(Boolean).join(', '), x.thickness, x.material, x.qty && `qty ${x.qty}`, x.finish, x.processes.join(', '), x.notes && `(${x.notes})`]
    .filter(Boolean).join(' · ')}`;
  return [company && `Enquiry: ${company}`, p.summary, '', p.parts.length ? 'Parts:' : 'No parts listed.', ...p.parts.map(line),
    ...(p.questions.length ? ['', 'Questions to ask:', ...p.questions.map(q => `- ${q}`)] : [])].filter(x => typeof x === 'string').join('\n').trim();
}
