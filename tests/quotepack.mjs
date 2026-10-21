import assert from 'node:assert/strict';
import { docMediaType, attachmentsToRead, packFacts, cleanPack, quotePackText, noMoney, PACK_LIMITS } from '../src/core/quotepack.js';

// — Which files the AI can read: PDFs and pictures only. —
assert.equal(docMediaType('Bracket rev B.PDF'), 'application/pdf');
assert.equal(docMediaType('photo', 'image/jpeg'), 'image/jpeg');
assert.equal(docMediaType('sketch.jpg'), 'image/jpeg');
assert.equal(docMediaType('part.webp'), 'image/webp');
assert.equal(docMediaType('part.dxf', 'application/octet-stream'), null, 'CAD files are not sent');
assert.equal(docMediaType('spec.docx'), null);

// — Attachments: real files, 4 MB or less each, at most 4 and 12 MB in all, drawings first. —
const MB = 1024 * 1024, file = (name, size, extra = {}) => ({ '@odata.type': '#microsoft.graph.fileAttachment', id: name, name, contentType: '', size, ...extra });
const picked = attachmentsToRead([file('photo.png', 1 * MB), file('a.pdf', 3 * MB), file('huge.pdf', 5 * MB), file('b.pdf', 3.5 * MB), file('c.pdf', 3.5 * MB),
  file('d.pdf', 1 * MB), file('model.step', 1 * MB), file('logo.png', 0.01 * MB, { isInline: true }), { '@odata.type': '#microsoft.graph.itemAttachment', name: 'fwd.pdf', size: 100 }]);
assert.deepEqual(picked.map(a => a.name), ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'], 'PDFs first, the 5 MB one left out, never more than 4');
assert.ok(picked.reduce((s, a) => s + a.size, 0) <= PACK_LIMITS.totalBytes);
assert.deepEqual(attachmentsToRead([file('a.pdf', 4 * MB), file('b.pdf', 4 * MB), file('c.pdf', 4 * MB), file('d.png', 1 * MB)]).map(a => a.name), ['a.pdf', 'b.pdf', 'c.pdf'], '12 MB in all');
assert.deepEqual(attachmentsToRead([]), []);

// — The facts sent: only the named fields, never a price, the text capped at 6,000 characters. —
const enq = { id: 7, fromEmail: 'jo@newco.example', fromName: 'Jo Bloggs', person: 'Jo Bloggs', company: 'Newco Fabrications Ltd', subject: 'Quote for brackets',
  wants: '50 brackets, 3mm mild steel', summary: 'Asks for a price.', value: 1234.5, sellTotal: 999, price: 12, text: 'Could you quote 50 of the attached? Our budget is £4,500 or about £90 each. ' + 'x'.repeat(9000) };
const facts = packFacts(enq, [{ name: 'BRK-100 rev B.pdf', text: 'MATERIAL S275 3mm FINISH powder coat RAL 9005 unit price $12.50 ' + 'y'.repeat(5000) }]);
assert.deepEqual(Object.keys(facts), ['from', 'fromName', 'company', 'subject', 'text', 'wants', 'attachments']);
assert.ok(facts.text.length <= 6002, 'email text capped at 6000 characters');
assert.ok(facts.attachments[0].text.length <= PACK_LIMITS.fileText + 2);
const sent = JSON.stringify(facts);
assert.ok(!/£\s?\d|\$\s?\d|1234|sellTotal|"price"|"value"/.test(sent), 'no prices or money fields in what is sent');
assert.match(facts.text, /budget is \[amount\] or about \[amount\] each/);
assert.equal(noMoney('5 per part at £5k, 10p each'), '5 per part at [amount], 10p each', 'only money is taken out');
assert.ok(JSON.stringify(packFacts({ ...enq, text: '' })).includes('Asks for a price.'), 'no email text: the summary stands in');
assert.deepEqual(packFacts({}, undefined).attachments, []);

// — Tidying the AI's answer: Levi's nine processes only, in his order, every field there. —
const pack = cleanPack({ summary: ' Two brackets. ', parts: [
  { partNo: 'BRK-100 rev B', description: 'Bracket', material: 'S275', thickness: '3mm', qty: '50', finish: 'Powder coat RAL 9005', processes: ['Fold', 'Laser', 'Polishing', 'P/Coat Paint', 'Fold'], notes: '' },
  { partNo: '', description: '', processes: [] }, { description: 'Cover plate', processes: 'Laser' }], questions: ['Which revision is current?', ''], watchOut: ['Tolerance ±0.05 on the slot'] });
assert.equal(pack.summary, 'Two brackets.');
assert.equal(pack.parts.length, 2, 'empty parts dropped');
assert.deepEqual(pack.parts[0].processes, ['Laser', 'Fold', 'P/Coat Paint']);
assert.deepEqual(pack.parts[1], { partNo: '', description: 'Cover plate', material: '', thickness: '', qty: '', finish: '', processes: [], notes: '' });
assert.deepEqual(pack.questions, ['Which revision is current?']);
assert.deepEqual(cleanPack(null), { summary: '', parts: [], questions: [], watchOut: [] });

// — The clipboard text: one line per part, then the questions. —
assert.equal(quotePackText(pack, { company: 'Newco Fabrications Ltd' }), [
  'Enquiry: Newco Fabrications Ltd', 'Two brackets.', '', 'Parts:',
  '1. BRK-100 rev B, Bracket · 3mm · S275 · qty 50 · Powder coat RAL 9005 · Laser, Fold, P/Coat Paint',
  '2. Cover plate', '', 'Questions to ask:', '- Which revision is current?'].join('\n'));
assert.equal(quotePackText({ parts: [] }), 'No parts listed.');

console.log('quotepack: ok');
