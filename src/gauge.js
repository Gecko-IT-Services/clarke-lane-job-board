/**
 * Levi's month (MD only), the same two lines every month: break-even and the ideal target, both typed
 * in on the board (board_settings), never in this public code. A half-dial from £0 to the target:
 * a thin outer ring is amber up to break-even and green beyond it, the dark arc is what has been dispatched
 * this month, the pale arc is where the month ends if everything due by then goes out, and a notch
 * marks break-even. The status is always said in words too. Numbers come from monthProgress().
 */
const R = 82, CX = 120, CY = 104, W = 16;
const pt = (f, r = R) => { const a = Math.PI * (1 - Math.min(1, Math.max(0, f))); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
const arc = r => `M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}`;
const ARC = arc(R), RZ = R + W / 2 + 6, ZONE = arc(RZ);   // the zones are a thin ring outside the dial
const k = n => (n >= 1000 ? `£${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k` : `£${Math.round(n)}`);

/** Where the month stands against the two lines, in words. */
export function monthState({ dispatched, dueByEnd }, breakeven, target) {
  const be = breakeven || null, tg = target || null;
  if (tg && dispatched >= tg) return { tone: 'top', word: 'Target hit' };
  if (be && dispatched >= be) return { tone: 'ok', word: tg ? `Past break-even · ${k(tg - dispatched)} to target` : 'Past break-even' };
  if (be) return { tone: 'warn', word: `${k(be - dispatched)} to break-even`, short: Math.max(0, be - dispatched - dueByEnd) };
  return { tone: 'warn', word: `${k(tg - dispatched)} to target`, short: Math.max(0, tg - dispatched - dueByEnd) };
}

export function monthGauge({ dispatched, dueByEnd }, breakeven, target, st) {
  const top = Math.max(target || 0, breakeven || 0) || 1;
  const f = n => Math.min(100, Math.max(0, (100 * n) / top));
  const b = breakeven ? f(breakeven) : null, done = f(dispatched), could = f(dispatched + dueByEnd);
  const notch = b != null ? [pt(b / 100, R - W / 2 - 2), pt(b / 100, RZ + 5)] : null;
  const lab = b != null ? pt(b / 100, RZ + 12) : null;
  return `<svg class="gauge g-${st.tone}" viewBox="0 -8 240 140" aria-hidden="true">
    <path d="${ARC}" class="g-track" pathLength="100"/>
    <path d="${ZONE}" class="z-under" pathLength="100" stroke-dasharray="${b ?? 100} 100"/>
    ${b != null ? `<path d="${ZONE}" class="z-over" pathLength="100" stroke-dasharray="0 ${b} ${100 - b} 100"/>` : ''}
    <path d="${ARC}" class="g-could" pathLength="100" stroke-dasharray="${could} 100"/>
    ${done > 0 ? `<path d="${ARC}" class="g-done" pathLength="100" stroke-dasharray="${Math.max(0.6, done)} 100"/>` : ''}
    ${notch ? `<line x1="${notch[0][0].toFixed(1)}" y1="${notch[0][1].toFixed(1)}" x2="${notch[1][0].toFixed(1)}" y2="${notch[1][1].toFixed(1)}" class="g-be"/>
      <text x="${lab[0].toFixed(1)}" y="${(lab[1] - 2).toFixed(1)}" class="g-tag" text-anchor="${lab[0] < CX - 8 ? 'end' : lab[0] > CX + 8 ? 'start' : 'middle'}">Break-even ${k(breakeven)}</text>` : ''}
    <text x="${CX}" y="${CY - 20}" class="g-big">${k(dispatched)}</text>
    <text x="${CX}" y="${CY - 2}" class="g-small">dispatched</text>
    <text x="${CX - R}" y="${CY + 20}" class="g-end" text-anchor="middle">£0</text>
    <text x="${CX + R}" y="${CY + 20}" class="g-end" text-anchor="middle">${target ? 'Target ' : ''}${k(top)}</text>
  </svg>`;
}

/**
 * The "This month" panel for Home and Jobs. mp: monthProgress(); settings: { breakeven, target };
 * edit: show the form (Jobs only); compact: Home's short version with a link to Jobs.
 */
export function monthPanel({ mp, breakeven, target, name, edit = false, compact = false }, { gbp, esc, fmt }) {
  if (mp.dispatched == null) return '';
  const set = breakeven || target;
  const st = set ? monthState(mp, breakeven, target) : null;
  const form = `<form class="tform" data-targetform>
      <label>Break-even, every month (net £) <input type="number" id="be-in" min="1" step="1" inputmode="numeric" value="${breakeven ?? ''}" placeholder="£ per month"></label>
      <label>Ideal target, every month (net £) <input type="number" id="target-in" min="1" step="1" inputmode="numeric" value="${target ?? ''}" placeholder="£ per month"></label>
      <button class="btn sm pri" type="submit">Save</button><button class="btn sm" type="button" data-edittarget="close">Cancel</button></form>`;
  const lines = set ? [
    breakeven ? `Break-even ${gbp(breakeven)}: ${mp.dispatched >= breakeven ? '<b class="ok">passed</b>' : `<b>${gbp(breakeven - mp.dispatched)}</b> to go`}` : '',
    target ? `Target ${gbp(target)}: ${mp.dispatched >= target ? '<b class="ok">hit</b>' : `<b>${gbp(target - mp.dispatched)}</b> to go`}` : '',
  ].filter(Boolean).join(' · ') : '';
  const due = `${gbp(mp.dueByEnd)} still to send on jobs due by ${fmt(mp.end)}`;
  const pace = set ? `At an even pace you would be at ${gbp((target || breakeven) * mp.pace)} by today.` : '';
  const warn = st?.short > 0 ? `<p class="bad">${gbp(st.short)} short of ${breakeven && mp.dispatched < breakeven ? 'break-even' : 'target'}, even if all of it goes: bring later jobs forward.</p>` : '';
  const link = compact ? `<a href="#jobs" data-tab="jobs">${set ? 'See the jobs →' : 'Set break-even and target on Jobs →'}</a>`
    : edit ? form : `<button type="button" class="btn link sm" data-edittarget>${set ? 'Change break-even / target' : 'Set break-even and target'}</button>`;
  return `<section class="month${set ? ' has-gauge' : ''}${compact ? ' compact' : ''}" aria-label="${esc(name)} against break-even and target">
    ${set ? `<figure class="gwrap" role="img" aria-label="${esc(`${name}: ${gbp(mp.dispatched)} dispatched. ${st.word}.`)}">${monthGauge(mp, breakeven, target, st)}
      <figcaption class="g-state g-${st.tone}">${esc(st.word)}</figcaption></figure>` : ''}
    <div class="minfo"><h3>${esc(name)} <span>${gbp(mp.dispatched)} dispatched</span></h3>
      ${lines ? `<p>${lines}</p>` : ''}<p class="note">${due}.${pace ? ' ' + pace : ''}</p>${warn}
      ${set && !compact ? `<ul class="tkey"><li><i class="k-done"></i>Dispatched</li><li><i class="k-could"></i>If all due by ${fmt(mp.end)} goes</li><li><i class="k-under"></i>Below break-even</li><li><i class="k-over"></i>Above break-even</li></ul>` : ''}
      ${link}</div></section>`;
}
