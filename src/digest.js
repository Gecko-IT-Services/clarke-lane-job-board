/**
 * Three things today (Philip, 21 Oct): the panel at the very top of Levi's and Mandy's Home. Three numbered rows, each
 * the thing to do (bold), the AI's sentence on why it matters today, and Open. The picks come from digestPicks() in
 * core/digest.js (tested); this file only draws. Black, silver and white like the rest of Home.
 */
import { icon } from './icons.js';

export function renderDigest({ greeting = '', picks = [], lines = [], busy = false, fallback = false }, h) {
  const { esc } = h;
  if (!picks.length) return '';
  const row = (p, i) => `<li class="dg-row"><span class="dg-n">${i + 1}</span><div class="dg-t"><b>${esc(p.title)}</b>
      <span class="${busy && !lines[i] ? 'note' : ''}">${lines[i] ? esc(lines[i]) : busy ? 'Working out why it matters today…' : ''}</span></div>
      <button class="btn sm" type="button" ${p.open?.attrs || ''}>Open</button></li>`;
  return `<section class="panel digest" id="digest"><div class="hsec-h"><h3>${icon('spark')}Three things today</h3>
      <span class="note">${esc(greeting || 'the few things most worth doing first')}</span>
      <span class="dg-act"><button class="btn sm link" type="button" data-digestrefresh ${busy ? 'disabled' : ''} title="Pick again from what the board knows now">${icon('refresh')}Refresh</button>
      <button class="btn sm link" type="button" data-digesthide title="Hide this until tomorrow">Not today</button></span></div>
    <ol class="dg-list">${picks.map(row).join('')}</ol>
    ${fallback ? '<p class="note">Written without AI this time (it could not be reached).</p>' : ''}</section>`;
}
