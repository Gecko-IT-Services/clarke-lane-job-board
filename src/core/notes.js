/**
 * Notes on a job (Philip, 21 Oct): Levi and Mandy leave notes for the shop floor and the shop floor answers.
 * A note from one side is "new" for the other until someone there taps Got it. Shown on the job's details,
 * the shop floor cards, the workshop TV and Home. Pure: tested in tests/notes.mjs.
 * note: { id, jobId, body, byName, fromFloor, seenBy, seenAt, at }
 */

/** A job's notes, oldest first (read like a conversation). */
export const notesFor = (notes, jobId) => (notes || []).filter(n => n.jobId === jobId)
  .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);

/** Is this note waiting for me? office: true for Levi and Mandy, false on the shop floor. */
export const isNew = (n, office) => !n.seenBy && n.fromFloor === !!office;

/** Notes waiting for me, newest first. jobs (optional): only those still on the board. */
export function newNotes(notes, office, jobs) {
  const open = jobs ? new Set(jobs.map(j => j.id)) : null;
  return (notes || []).filter(n => isNew(n, office) && (!open || open.has(n.jobId)))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** For a floor card or the TV: the newest note, how many there are, and whether any wait for this side. */
export function noteSummary(notes, jobId, office) {
  const list = notesFor(notes, jobId);
  if (!list.length) return null;
  return { last: list[list.length - 1], count: list.length, fresh: list.filter(n => isNew(n, office)).length };
}

/** "Mandy, 10:42" today; "Mandy, Tue 20 Oct" before. */
export function noteWhen(at, now = new Date()) {
  const d = new Date(at), same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
