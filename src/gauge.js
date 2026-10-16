/**
 * Levi's month gauge (MD only): a half-dial from £0 to his monthly target. The dark arc is what has
 * been dispatched this month; the pale arc beyond it is what would be reached if everything due by
 * the month end goes out; the tick is where he should be by today at an even pace (working days).
 * Status is said in words beside the colour. Numbers come from monthProgress() in core/jobs.js.
 */
const R = 80, CX = 100, CY = 96;
const at = f => { const a = Math.PI * (1 - Math.min(1, Math.max(0, f))); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; };
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

export function monthGauge({ dispatched, dueByEnd, pace, target, name }, { gbp, esc }) {
  const done = dispatched / target, could = (dispatched + dueByEnd) / target, should = target * pace;
  const pct = n => Math.round(Math.min(1, n) * 100);
  const state = done >= 1 ? 'met' : dispatched >= should ? 'ahead' : 'behind';
  const word = { met: 'Target met', ahead: 'On pace', behind: `${gbp(should - dispatched)} behind pace` }[state];
  const [px, py] = at(pace), [ix, iy] = at(pace).map((v, i) => (i ? CY - (CY - v) * 0.78 : CX + (v - CX) * 0.78));
  const tip = `${esc(name)}: ${gbp(dispatched)} dispatched of ${gbp(target)} (${Math.round(done * 100)}%). By today at an even pace: ${gbp(should)}. If everything due by the month end goes: ${gbp(dispatched + dueByEnd)}.`;
  return `<figure class="gauge g-${state}" role="img" aria-label="${tip}">
    <svg viewBox="0 0 200 112" aria-hidden="true"><title>${tip}</title>
      <path d="${ARC}" class="g-track" pathLength="100"/>
      <path d="${ARC}" class="g-could" pathLength="100" stroke-dasharray="${pct(could)} 100"/>
      ${done > 0 ? `<path d="${ARC}" class="g-done" pathLength="100" stroke-dasharray="${Math.max(0.5, pct(done))} 100"/>` : ''}
      <line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" class="g-pace"/>
      <text x="${CX}" y="${CY - 22}" class="g-big">${Math.round(done * 100)}%</text>
      <text x="${CX}" y="${CY - 4}" class="g-small">of ${gbp(target)}</text>
      <text x="${CX - R}" y="${CY + 14}" class="g-end" text-anchor="start">£0</text>
      <text x="${CX + R}" y="${CY + 14}" class="g-end" text-anchor="end">${gbp(target)}</text>
    </svg>
    <figcaption><span class="g-state">${word}</span></figcaption>
  </figure>`;
}
