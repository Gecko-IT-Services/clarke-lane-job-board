/**
 * A bit of personality on the workshop TV and the shop floor (Philip, 21 Oct): each job gets a small animated
 * mark for how it stands (late, due soon, on time, ready to go, on hold), the TV's top line has a mood for the
 * day, and a job leaving gets a short cheer. Playful, never mocking: customers may see the TV.
 * Pure: tested in tests/mood.mjs.
 */

/** How one job stands: 'held', 'ready', 'late', 'soon' or 'ok'. */
export const jobMood = ({ held, ready, late, soon }) => held ? 'held' : ready ? 'ready' : late ? 'late' : soon ? 'soon' : 'ok';

const pick = (list, today) => list[(Number(String(today || '').replace(/-/g, '')) || 0) % list.length];   // the same line all day
const jobs = n => `${n} job${n === 1 ? '' : 's'}`;

/** The TV's mood line: { key: 'clear' | 'calm' | 'push' | 'rush', text }. */
export function boardMood({ open = 0, late = 0, ready = 0, today = '' }) {
  if (!open) return { key: 'clear', text: pick(['All clear. Time for a brew.', 'Nothing waiting. Kettle on.'], today) };
  if (!late) return { key: 'calm', text: pick(['Smooth sailing. Everything on time.', 'Cool, calm and on schedule.', 'All on time. Nice work.'], today)
    + (ready ? ` ${jobs(ready)} ready to go out.` : '') };
  if (late <= 2) return { key: 'push', text: pick([`Nearly there: ${jobs(late)} need${late === 1 ? 's' : ''} a push.`, `${jobs(late)} running behind. Let's catch up.`], today) };
  return { key: 'rush', text: pick([`Pedal to the metal: ${jobs(late)} late.`, `All hands: ${jobs(late)} late.`], today) };
}

/** Delivery notes made since the last look: [{ id, so, customer, dn }]. seen: Set of despatch ids, or null the first time (no cheer on start). */
export function newDispatches(jobs, seen) {
  const all = (jobs || []).flatMap(j => (j.despatches || []).map(d => ({ id: d.id, so: j.so, customer: j.customer, dn: d.dn })));
  return { now: new Set(all.map(d => d.id)), fresh: seen ? all.filter(d => !seen.has(d.id)) : [] };
}
