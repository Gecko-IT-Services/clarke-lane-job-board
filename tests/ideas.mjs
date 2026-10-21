import assert from 'node:assert/strict';
import { trendOf, ideasFacts, websiteGuess, ideaBoard } from '../src/core/ideas.js';

assert.equal(trendOf({ lapsed: true }), 'stopped ordering');
assert.equal(trendOf({ quiet: true, orders: 5 }), 'gone quiet');
assert.equal(trendOf({ orders: 2 }), 'new or occasional');
assert.equal(trendOf({ orders: 8, yearNet: 130, prevNet: 100 }), 'growing');
assert.equal(trendOf({ orders: 8, yearNet: 70, prevNet: 100 }), 'slipping');
assert.equal(trendOf({ orders: 8, yearNet: 100, prevNet: 100 }), 'steady');

const base = [{ key: 'a', customer: 'A Ltd', orders: 6, last: '2026-09-01', since: 50, usual: 30, yearNet: 9000, prevNet: 5000, items: [{ item: 'Bracket' }] }];
const f = ideasFacts({ base, more: [{ key: 'a', missing: ['welding'] }], reorders: [], chase: 3, stats: { rate: 0.31 }, research: [{ customer: 'A Ltd', about: 'Makes kiosks', news: [{ text: 'New site', url: 'x' }], openings: [] }] });
assert.equal(f.customers[0].trend, 'growing');
assert.deepEqual(f.customers[0].neverHadFromUs, ['welding']);
assert.equal(f.quotes.winRate, '31%');
assert.ok(!JSON.stringify(f).includes('9000') && !JSON.stringify(f).includes('5000'), 'no money is sent');
assert.deepEqual(f.customerResearch[0].news, ['New site']);

assert.equal(websiteGuess(['sam@acme.co.uk', 'jo@gmail.com', 'kim@acme.co.uk; lee@other.com', 'me@clarke-lane.co.uk'], 'clarke-lane.co.uk'), 'acme.co.uk');
assert.equal(websiteGuess(['jo@gmail.com']), '');

const ideas = [{ id: 1, batchAt: '2026-10-20T09:00:00Z', status: 'new' }, { id: 2, batchAt: '2026-10-20T09:00:00Z', status: 'done' },
  { id: 3, batchAt: '2026-10-21T09:00:00Z', status: 'done' }, { id: 4, batchAt: '2026-10-21T09:00:00Z', status: 'doing' }];
const b = ideaBoard(ideas);
assert.equal(b.at, '2026-10-21T09:00:00Z');
assert.deepEqual(b.latest.map(i => i.id), [4, 3]);
assert.deepEqual(b.older.map(i => i.id), [1]);
console.log('ideas: ok');
