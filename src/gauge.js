/**
 * Levi's month (MD only), the same two lines every month: break-even and the ideal target, both typed
 * in on the board (board_settings), never in this public code. Drawn as a horizontal steel tube from
 * £0 to the target that fills left to right, in Levi's three words (20 Oct): Invoiced (solid: amber
 * below break-even, green above it), Work in progress (blue: open orders due by the month end) and the
 * Gap to target (the empty steel left over). A ring marks break-even and a small arrow where an even
 * pace would be by today. The same three figures sit above the tube, and the status is said in words.
 * Numbers come from monthProgress() in core/jobs.js, which adds this month's Xero invoices raised outside the board.
 */
const k = n => (n >= 1000 ? `£${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k` : `£${Math.round(n)}`);

/** Where the month stands against the two lines, in words. */
export function monthState({ dispatched, dueByEnd }, breakeven, target) {
  const be = breakeven || null, tg = target || null;
  if (tg && dispatched >= tg) return { tone: 'top', word: 'Target hit' };
  if (be && dispatched >= be) return { tone: 'ok', word: tg ? `Past break-even · ${k(tg - dispatched)} to target` : 'Past break-even' };
  if (be) return { tone: 'warn', word: `${k(be - dispatched)} to break-even`, short: Math.max(0, be - dispatched - dueByEnd) };
  return { tone: 'warn', word: `${k(tg - dispatched)} to target`, short: Math.max(0, tg - dispatched - dueByEnd) };
}

let grown = false;   // the tube fills with a short animation the first time only, not on every redraw
export function monthGauge(mp, breakeven, target, st, money) {
  const top = Math.max(target || 0, breakeven || 0) || 1;
  const f = n => Math.min(100, Math.max(0, (100 * n) / top)).toFixed(2);
  const be = breakeven && target && breakeven < target ? f(breakeven) : null;
  const pace = f((target || breakeven) * mp.pace);
  const grow = grown ? '' : ' grow'; grown = true;
  const end = Math.min(top, mp.dispatched + mp.dueByEnd), gapW = 100 - Number(f(end));
  return `<div class="tube${grow}" aria-hidden="true">
      <div class="tube-body">
        <div class="tube-could" style="width:${f(end)}%"></div>
        <div class="tube-fill t-${st.tone}" style="width:${f(mp.dispatched)}%"></div>
        ${target && gapW >= 14 ? `<div class="tube-gap" style="left:${f(end)}%"><span>Gap ${k(target - end)}</span></div>` : ''}
        ${be ? `<div class="tube-ring" style="left:${be}%"></div>` : ''}
      </div>
      ${be ? `<div class="tube-tag" style="left:${be}%">Break-even ${k(breakeven)}</div>` : ''}
      <div class="tube-pace" style="left:${pace}%" title="Even pace to today: ${money(Math.round((target || breakeven) * mp.pace))}"></div>
      <div class="tube-scale"><span>£0</span><span>${target ? 'Target ' : 'Break-even '}${k(top)}</span></div>
    </div>`;
}

/**
 * The "This month" panel for Home and Jobs. mp: monthProgress(); settings: { breakeven, target };
 * edit: show the form (Jobs only); compact: Home's short version with a link to Jobs.
 */
export function monthPanel({ mp, breakeven, target, name, edit = false, compact = false, xeroNote = '' }, { gbp, esc, fmt }) {
  if (mp.dispatched == null) return '';
  const set = breakeven || target;
  const st = set ? monthState(mp, breakeven, target) : null;
  const form = `<form class="tform" data-targetform>
      <label>Break-even, every month (net £) <input type="number" id="be-in" min="1" step="1" inputmode="numeric" value="${breakeven ?? ''}" placeholder="£ per month"></label>
      <label>Ideal target, every month (net £) <input type="number" id="target-in" min="1" step="1" inputmode="numeric" value="${target ?? ''}" placeholder="£ per month"></label>
      <button class="btn sm pri" type="submit">Save</button><button class="btn sm" type="button" data-edittarget="close">Cancel</button></form>`;
  const tgt = target || breakeven, wip = mp.dueByEnd, gap = set ? Math.max(0, tgt - mp.dispatched - wip) : null;
    // Where the invoiced figure comes from: the board's dispatch notes, plus Xero invoices raised outside it.
  const from = xeroNote === 'checking' ? 'Checking Xero for invoices raised outside the board…'
    : xeroNote ? `Not counting invoices raised in Xero outside the board: ${xeroNote}`
    : mp.fromXero ? `${gbp(mp.fromXero)} invoiced in Xero (${mp.xeroCount} invoice${mp.xeroCount === 1 ? '' : 's'}) and ${gbp(mp.onBoard)} dispatched on the board.` : '';
  const figs = `<div class="mfigs">
      <div class="mfig f-inv${st && st.tone !== 'warn' ? ' good' : ''}"><span>Invoiced</span><b>${gbp(mp.dispatched)}</b><small>so far this month</small></div>
      <div class="mfig f-wip"><span>Work in progress</span><b>${gbp(wip)}</b><small>due by ${fmt(mp.end)}</small></div>
      ${set ? `<div class="mfig f-gap${gap ? '' : ' none'}"><span>Gap to ${target ? 'target' : 'break-even'}</span><b>${gap ? gbp(gap) : 'None'}</b><small>${gap ? 'after work in progress' : 'if it all goes out'}</small></div>` : ''}</div>`;
  const lines = set ? [
    breakeven ? `Break-even ${gbp(breakeven)}: ${mp.dispatched >= breakeven ? '<b class="ok">passed</b>' : `<b>${gbp(breakeven - mp.dispatched)}</b> still to invoice`}` : '',
    target ? `Target ${gbp(target)}: ${mp.dispatched >= target ? '<b class="ok">hit</b>' : `<b>${gbp(target - mp.dispatched)}</b> still to invoice`}` : '',
  ].filter(Boolean).join(' · ') : '';
  const pace = set ? `At an even pace you would have invoiced ${gbp(tgt * mp.pace)} by today.` : '';
  const later = gap && mp.dueLater > 0 ? `<p class="note">${gbp(mp.dueLater)} more is on order but due after ${fmt(mp.end)}: bringing some of it forward closes the gap.</p>` : '';
  const warn = st?.short > 0 && !later ? `<p class="bad">${gbp(st.short)} short of ${breakeven && mp.dispatched < breakeven ? 'break-even' : 'target'}, even if all the work in progress goes out.</p>` : '';
  const link = compact ? `<a href="#jobs" data-tab="jobs">${set ? 'See the jobs →' : 'Set break-even and target on Jobs →'}</a>`
    : edit ? form : `<button type="button" class="btn link sm" data-edittarget>${set ? 'Change break-even / target' : 'Set break-even and target'}</button>`;
  return `<section class="month${set ? ' has-gauge' : ''}${compact ? ' compact' : ''}" aria-label="${esc(name)}: invoiced, work in progress and the gap to target">
    <div class="mhead"><h3>${esc(name)}</h3>${set ? `<span class="g-state g-${st.tone}">${esc(st.word)}</span>` : ''}</div>
    ${figs}
    ${set ? `<figure class="gwrap" role="img" aria-label="${esc(`${name}: ${gbp(mp.dispatched)} invoiced, ${gbp(wip)} work in progress${gap ? `, gap ${gbp(gap)}` : ''}. ${st.word}.`)}">${monthGauge(mp, breakeven, target, st, gbp)}</figure>` : ''}
    <div class="minfo">${lines ? `<p>${lines}</p>` : ''}${from ? `<p class="note">${esc(from)}</p>` : ''}${pace ? `<p class="note">${pace}</p>` : ''}${later}${warn}
      ${set && !compact ? `<ul class="tkey"><li><i class="k-done"></i>Invoiced</li><li><i class="k-could"></i>Work in progress, due by ${fmt(mp.end)}</li>${target ? '<li><i class="k-gap"></i>Gap to target</li>' : ''}<li><i class="k-pace"></i>Even pace to today</li></ul>` : ''}
      ${link}</div></section>`;
}
