import assert from 'node:assert/strict';
import { notesFor, isNew, newNotes, noteSummary, noteWhen } from '../src/core/notes.js';

const n = (id, jobId, fromFloor, at, seenBy = null) => ({ id, jobId, body: 'Note ' + id, byName: fromFloor ? 'Dave' : 'Mandy', fromFloor, seenBy, at });
const notes = [n(1, 10, false, '2026-10-21T09:00:00Z'), n(2, 10, true, '2026-10-21T09:30:00Z'), n(3, 10, false, '2026-10-21T08:00:00Z', 'Dave'),
  n(4, 11, true, '2026-10-21T10:00:00Z', 'Mandy'), n(5, 12, true, '2026-10-21T11:00:00Z')];

assert.deepEqual(notesFor(notes, 10).map(x => x.id), [3, 1, 2], 'oldest first');
assert.equal(isNew(notes[0], false), true, 'an office note is new on the shop floor');
assert.equal(isNew(notes[0], true), false, 'but not for the office');
assert.equal(isNew(notes[1], true), true, 'a shop floor note is new for the office');
assert.equal(isNew(notes[2], false), false, 'seen');
assert.deepEqual(newNotes(notes, true).map(x => x.id), [5, 2], 'newest first');
assert.deepEqual(newNotes(notes, true, [{ id: 10 }]).map(x => x.id), [2], 'only jobs still open');
assert.deepEqual(newNotes(notes, false).map(x => x.id), [1]);
const s = noteSummary(notes, 10, false);
assert.equal(s.last.id, 2); assert.equal(s.count, 3); assert.equal(s.fresh, 1);
assert.equal(noteSummary(notes, 99, false), null);
const now = new Date('2026-10-21T15:00:00Z');
assert.match(noteWhen('2026-10-21T09:05:00Z', now), /^\d\d:\d\d$/);
assert.match(noteWhen('2026-10-20T09:05:00Z', now), /Tue/);
console.log('notes: ok');
