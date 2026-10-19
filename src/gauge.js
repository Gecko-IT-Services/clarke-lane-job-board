/**
 * Levi's month (MD only), the same two lines every month: break-even and the ideal target, both typed
 * in on the board (board_settings), never in this public code. Drawn as a horizontal steel tube from
 * £0 to the target that fills left to right: amber below break-even, green above it; a hatched part
 * beyond the fill is where the month ends if everything due by then goes out; a marked ring shows
 * break-even and a small arrow where an even pace would be by today. The status is said in words too.
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
  return `<div class="tube${grow}" aria-hidden="true">
      <div class="tube-body">
        <div class="tube-could" style="width:${f(mp.dispatched + mp.dueByEnd)}%"></div>
        <div class="tube-fill t-${st.tone}" style="width:${f(mp.dispatched)}%"></div>
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
  const lines = set ? [
    breakeven ? `Break-even ${gbp(breakeven)}: ${mp.dispatched >= breakeven ? '<b class="ok">passed</b>' : `<b>${gbp(breakeven - mp.dispatched)}</b> to go`}` : '',
    target ? `Target ${gbp(target)}: ${mp.dispatched >= target ? '<b class="ok">hit</b>' : `<b>${gbp(target - mp.dispatched)}</b> to go`}` : '',
  ].filter(Boolean).join(' · ') : '';
  const due = `${gbp(mp.dueByEnd)} still to send on jobs due by ${fmt(mp.end)}`;
  // Where the done figure comes from: the board's dispatch notes, plus Xero invoices raised outside it.
  const from = xeroNote === 'checking' ? 'Checking Xero for invoices raised outside the board…'
    : xeroNote ? `Not counting invoices raised in Xero outside the board: ${xeroNote}`
    : mp.fromXero ? `${gbp(mp.onBoard)} dispatched on the board and ${gbp(mp.fromXero)} invoiced in Xero outside it (${mp.xeroCount} invoice${mp.xeroCount === 1 ? '' : 's'}).` : '';
  const pace = set ? `At an even pace you would be at ${gbp((target || breakeven) * mp.pace)} by today.` : '';
  const warn = st?.short > 0 ? `<p class="bad">${gbp(st.short)} short of ${breakeven && mp.dispatched < breakeven ? 'break-even' : 'target'}, even if all of it goes: bring later jobs forward.</p>` : '';
  const link = compact ? `<a href="#jobs" data-tab="jobs">${set ? 'See the jobs →' : 'Set break-even and target on Jobs →'}</a>`
    : edit ? form : `<button type="button" class="btn link sm" data-edittarget>${set ? 'Change break-even / target' : 'Set break-even and target'}</button>`;
  return `<section class="month${set ? ' has-gauge' : ''}${compact ? ' compact' : ''}" aria-label="${esc(name)} against break-even and target">
    <div class="mhead"><h3>${esc(name)}</h3><span class="mbig">${gbp(mp.dispatched)}</span><span class="note">${mp.fromXero ? 'so far' : 'dispatched'}</span>
      ${set ? `<span class="g-state g-${st.tone}">${esc(st.word)}</span>` : ''}</div>
    ${set ? `<figure class="gwrap" role="img" aria-label="${esc(`${name}: ${gbp(mp.dispatched)} ${mp.fromXero ? 'so far' : 'dispatched'}. ${st.word}.`)}">${monthGauge(mp, breakeven, target, st, gbp)}</figure>` : ''}
    <div class="minfo">${lines ? `<p>${lines}</p>` : ''}${from ? `<p class="note">${esc(from)}</p>` : ''}<p class="note">${due}.${pace ? ' ' + pace : ''}</p>${warn}
      ${set && !compact ? `<ul class="tkey"><li><i class="k-done"></i>${mp.fromXero ? 'Dispatched or invoiced' : 'Dispatched'}</li><li><i class="k-could"></i>If all due by ${fmt(mp.end)} goes</li><li><i class="k-pace"></i>Even pace to today</li></ul>` : ''}
      ${link}</div></section>`;
}
