// Personality on the TV: each job's mood, the day's mood line, and the cheer when a job goes out.
import assert from 'node:assert/strict';
const { jobMood, boardMood, newDispatches } = await import('../src/core/mood.js');

assert.equal(jobMood({ late: 3 }), 'late');
assert.equal(jobMood({ late: 3, held: true }), 'held', 'on hold before late');
assert.equal(jobMood({ late: 1, ready: true }), 'ready', 'ready to go out, even if late');
assert.equal(jobMood({ soon: true }), 'soon');
assert.equal(jobMood({}), 'ok');

assert.equal(boardMood({ open: 0 }).key, 'clear');
assert.equal(boardMood({ open: 5 }).key, 'calm');
assert.match(boardMood({ open: 5, ready: 1, today: '2026-10-21' }).text, /1 job ready to go out\.$/);
assert.equal(boardMood({ open: 5, late: 1 }).key, 'push');
assert.equal(boardMood({ open: 5, late: 3 }).key, 'rush');
assert.match(boardMood({ open: 5, late: 3, today: '2026-10-21' }).text, /3 jobs late/);
assert.equal(boardMood({ open: 5, today: '2026-10-21' }).text, boardMood({ open: 5, today: '2026-10-21' }).text, 'the same line all day');
for (const m of [boardMood({ open: 4, late: 1, today: '2026-10-21' }), boardMood({ open: 4, late: 1, today: '2026-10-22' })]) assert.match(m.text, /1 job/);

const jobs = [{ so: 'SO-1', customer: 'A', despatches: [{ id: 1, dn: 'DN-1' }] }, { so: 'SO-2', customer: 'B', despatches: [] }];
const first = newDispatches(jobs, null);
assert.deepEqual(first.fresh, [], 'no cheer when the TV starts');
const later = newDispatches([jobs[0], { ...jobs[1], despatches: [{ id: 2, dn: 'DN-2' }] }], first.now);
assert.deepEqual(later.fresh, [{ id: 2, so: 'SO-2', customer: 'B', dn: 'DN-2' }]);
console.log('mood: ok');
