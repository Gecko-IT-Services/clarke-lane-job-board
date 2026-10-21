/**
 * Levi's month (MD only), the same two lines every month: break-even and the ideal target, both typed
 * in on the board (board_settings), never in this public code. Drawn as an upright steel tube from £0 at
 * the bottom to the target at the top (21 Oct), in Levi's three words (20 Oct): Invoiced (solid: amber
 * below break-even, green above it), Work in progress (blue: open orders due by the month end) and the
 * Gap to target (the empty steel left over). A ring marks break-even and a small arrow where an even
 * pace would be by today. The same three figures sit beside the tube, and the status is said in words.
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
/** The steel tube, upright (Levi, 21 Oct: "vertical, fatter and smaller"): fills from £0 at the bottom to the target at the top. */
export function monthGauge(mp, breakeven, target, st, money) {
  const top = Math.max(target || 0, breakeven || 0) || 1;
  const f = n => Math.min(100, Math.max(0, (100 * n) / top)).toFixed(2);
  const be = breakeven && target && breakeven < target ? f(breakeven) : null;
  const pace = f((target || breakeven) * mp.pace);
  const grow = grown ? '' : ' grow'; grown = true;
  const end = Math.min(top, mp.dispatched + mp.dueByEnd);
  return `<div class="vtube${grow}" aria-hidden="true">
      <div class="vt-body">
        <div class="vt-could" style="height:${f(end)}%"></div>
        <div class="vt-fill t-${st.tone}" style="height:${f(mp.dispatched)}%"></div>
        ${be ? `<div class="vt-ring" style="bottom:${be}%"></div>` : ''}
      </div>
      <div class="vt-marks">
        <span class="vt-top" style="bottom:100%">${target ? 'Target' : 'Break-even'} <b>${k(top)}</b></span>
        ${be ? `<span style="bottom:${be}%">Break-even <b>${k(breakeven)}</b></span>` : ''}
        <span class="vt-pace" style="bottom:${pace}%" title="Even pace to today: ${money(Math.round((target || breakeven) * mp.pace))}"></span>
        <span class="vt-zero" style="bottom:0">£0</span>
      </div>
    </div>`;
}

/**
 * The "This month" panel for Home and Jobs. mp: monthProgress(); settings: { breakeven, target };
 * edit: show the form (Jobs only); compact: Home's short version with a link to Jobs.
 */
export function monthPanel({ mp, breakeven, target, name, edit = false, compact = false, xeroNote = '', xeroStale = '' }, { gbp, esc, fmt }) {
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
    : mp.fromXero ? `${gbp(mp.fromXero)} invoiced in Xero (${mp.xeroCount} invoice${mp.xeroCount === 1 ? '' : 's'}) and ${gbp(mp.onBoard)} dispatched on the board.${xeroStale ? ` ${esc(xeroStale)}.` : ''}` : '';
  const figs = `<div class="mfigs">
      <div class="mfig f-inv${st && st.tone !== 'warn' ? ' good' : ''}"><span>Invoiced</span><b>${gbp(mp.dispatched)}</b><small>so far this month</small></div>
      <div class="mfig f-wip"><span>Work in progress</span><b>${gbp(wip)}</b><small>due by ${fmt(mp.end)}</small></div>
      ${set ? `<div class="mfig f-gap${gap ? '' : ' none'}"><span>Gap to ${target ? 'target' : 'break-even'}</span><b>${gap ? gbp(gap) : 'None'}</b><small>${gap ? 'after work in progress' : 'if it all goes out'}</small></div>` : ''}</div>`;
  const lines = set ? [
    breakeven ? `Break-even ${gbp(breakeven)}: ${mp.dispatched >= breakeven ? '<b class="ok">passed</b>' : `<b>${gbp(breakeven - mp.dispatched)}</b> still to invoice`}` : '',
    target ? `Target ${gbp(target)}: ${mp.dispatched >= target ? '<b class="ok">hit</b>' : `<b>${gbp(target - mp.dispatched)}</b> still to invoice`}` : '',
  ].filter(Boolean).join(' · ') : '';
  const later = gap && mp.dueLater > 0 ? `<p class="note">${gbp(mp.dueLater)} more is on order but due after ${fmt(mp.end)}: bringing some of it forward closes the gap.</p>` : '';
  const warn = st?.short > 0 && !later ? `<p class="bad">${gbp(st.short)} short of ${breakeven && mp.dispatched < breakeven ? 'break-even' : 'target'}, even if all the work in progress goes out.</p>` : '';
  const link = compact ? `<a href="#jobs" data-tab="jobs">${set ? 'See the jobs →' : 'Set break-even and target on Jobs →'}</a>`
    : edit ? form : `<button type="button" class="btn link sm" data-edittarget>${set ? 'Change break-even / target' : 'Set break-even and target'}</button>`;
  return `<section class="month${set ? ' has-gauge' : ''}${compact ? ' compact' : ''}" aria-label="${esc(name)}: invoiced, work in progress and the gap to target">
    <div class="mhead"><h3>${esc(name)}</h3>${set ? `<span class="g-state g-${st.tone}">${esc(st.word)}</span>` : ''}</div>
    <div class="mbody">
      ${set ? `<figure class="gwrap" role="img" aria-label="${esc(`${name}: ${gbp(mp.dispatched)} invoiced, ${gbp(wip)} work in progress${gap ? `, gap ${gbp(gap)}` : ''}. ${st.word}.`)}">${monthGauge(mp, breakeven, target, st, gbp)}</figure>` : ''}
      <div class="mside">${figs}
        <div class="minfo">${lines ? `<p>${lines}</p>` : ''}${later}${warn}${from ? `<p class="note">${esc(from)}</p>` : ''}${link}</div></div></div></section>`;
}

/** Jobs' one line (MD only): invoiced · work in progress · gap, and what is due later to bring forward. */
export function monthLine({ mp, breakeven, target, name }, { gbp, esc, fmt }) {
  if (mp.dispatched == null) return '';
  const tgt = target || breakeven;
  if (!tgt) return `<p class="mline"><b>${esc(name)}</b> <a href="#home" data-tab="home">Set break-even and target on Home →</a></p>`;
  const gap = Math.max(0, tgt - mp.dispatched - mp.dueByEnd);
  const st = monthState(mp, breakeven, target);
  return `<p class="mline"><b>${esc(name)}:</b> ${gbp(mp.dispatched)} invoiced · <span class="wip">${gbp(mp.dueByEnd)} work in progress</span> ·
    ${gap ? `<b class="gap">gap ${gbp(gap)}</b> to ${target ? 'target' : 'break-even'}` : `<b class="ok">no gap</b> if it all goes out`}
    ${gap && mp.dueLater > 0 ? ` · ${gbp(mp.dueLater)} more due after ${fmt(mp.end)}: bring some forward` : ''}
    <span class="g-state g-${st.tone}">${esc(st.word)}</span> <a href="#home" data-tab="home">Details on Home →</a></p>`;
}
