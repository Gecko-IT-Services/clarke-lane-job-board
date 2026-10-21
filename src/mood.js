/**
 * The little animated marks for the TV and the shop floor (Philip, 21 Oct): drawn here, not GIFs from the web,
 * so they always load, stay sharp on a big screen and match the board. Logic in core/mood.js (tested).
 * Movement stops for anyone whose device asks for less motion (styles in index.html, .mi).
 */
const svg = (k, body, title) => `<svg class="mi m-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${title}">${body}</svg>`;
const ICONS = {
  // Late: a stopwatch, its hand ticking round fast.
  late: () => svg('late', '<circle cx="12" cy="13.5" r="8"/><path d="M10 2.5h4M12 2.5v2.8M18.6 6.4l1.4-1.4"/><g class="hand"><path d="M12 13.5V8.6"/></g>', 'Late'),
  // Due in the next few days: an hourglass that turns over now and then.
  soon: () => svg('soon', '<g class="glass"><path d="M6.5 3h11M6.5 21h11M8 3c0 5.5 8 5 8 9s-8 3.5-8 9M16 3c0 5.5-8 5-8 9s8 3.5 8 9"/><path class="sand" d="M9.8 18.6h4.4L12 16z" fill="currentColor" stroke="none"/></g>', 'Due soon'),
  // On time: cool and composed, sunglasses on.
  ok: () => svg('ok', '<g class="face"><circle cx="12" cy="12" r="9"/><path d="M5 10h14" stroke-width="1.5"/><path d="M6.3 10h4.6v1.4a2.3 2.3 0 0 1-4.6 0zM13.1 10h4.6v1.4a2.3 2.3 0 0 1-4.6 0z" fill="currentColor" stroke="none"/><path d="M9 15.6c1.7 1.3 4.3 1.3 6 0"/></g>', 'On time'),
  // Ready to go out: a lorry with its engine running.
  ready: () => svg('ready', '<g class="lorry"><path d="M2.5 6.5h11v9.5h-11zM13.5 9.5h4l3 3.2V16h-7z"/></g><circle cx="6.5" cy="17.6" r="1.8"/><circle cx="16.8" cy="17.6" r="1.8"/>', 'Ready to go'),
  // On hold: asleep.
  held: () => svg('held', '<g stroke="none" fill="currentColor" font-family="inherit" font-weight="800"><text class="z1" x="3" y="20" font-size="8">z</text><text class="z2" x="9" y="14" font-size="9.5">z</text><text class="z3" x="15.5" y="8" font-size="11">z</text></g>', 'On hold'),
  // The TV's top line when things are late: running to catch up.
  rush: () => svg('rush', '<g class="runner"><circle cx="15" cy="4.2" r="2" fill="currentColor" stroke="none"/><path d="M14 7.5l-3 5 4 2.2-2 6M11 12.5l-4.2.8M14 8.5l3.6 3 3-.8M15 14.7l3.8 2 .8 3.8"/></g><path class="speed" d="M1.5 9h4M1 13h3.5M2.5 17h3"/>', 'Running late'),
  // Nothing waiting: a mug of tea, steaming.
  clear: () => svg('clear', '<path d="M5 10h11v6.5A3.5 3.5 0 0 1 12.5 20h-4A3.5 3.5 0 0 1 5 16.5z"/><path d="M16 12h1.5a2.3 2.3 0 0 1 0 4.6H16"/><path class="steam s1" d="M8.5 7.5c-.8-1 .8-2 0-3.2"/><path class="steam s2" d="M12 7.5c-.8-1 .8-2 0-3.2"/>', 'All clear'),
};
ICONS.calm = ICONS.ok; ICONS.push = ICONS.late;

/** A job's (or the day's) mark: 'late', 'soon', 'ok', 'ready', 'held', 'rush', 'clear', 'calm' or 'push'. */
export const moodIcon = k => (ICONS[k] || ICONS.ok)();

/** The TV's mood line. m: boardMood(). */
export const moodLine = (m, esc) => `<div class="tvmood mood-${m.key}">${moodIcon(m.key)}<span>${esc(m.text)}</span></div>`;

/** A short cheer over the TV when a delivery note is made. d: { so, customer, dn }. */
export function cheerHtml(d, esc) {
  const bits = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 53) % 100}%;--d:${(i % 6) * 0.25}s;--c:${['#E8641E', '#1F7A45', '#2F5FD0', '#F2B705'][i % 4]}"></i>`).join('');
  return `<div class="tvcheer" role="status">${bits}<div class="cheerbox">${moodIcon('ready')}<div><b>On its way!</b><span>${esc(d.so)} for ${esc(d.customer)}${d.dn ? ` · ${esc(d.dn)}` : ''}</span></div></div></div>`;
}
