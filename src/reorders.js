/**
 * The reorder round (Philip, 21 Oct): repeat parts due again, as a weekly routine for Mandy and Levi. On Home
 * (compact, the top 5) and on CRM › Follow-ups (all of them). Each one: write an AI email, mark it asked after a
 * phone call, or not needed for 90 days. Asked and not-needed ones stay below, greyed, with their date; orders
 * that came back after an ask show as one line. The won value is Levi's only (md). Logic in core/reorders.js
 * (tested); this file only draws.
 */
import { icon } from './icons.js';
import { reorderAngle } from './core/reorders.js';

const days = n => `${n} day${n === 1 ? '' : 's'}`;
const first = s => String(s || '').split(/[ @.]/)[0].replace(/^./, c => c.toUpperCase());

/** round: reorderRound() rows; tally: reorderTally(); nudge: how many to ask, when it is Monday or nobody has asked for a week. */
export function renderReorders({ round, tally, md = false, compact = false, nudge = 0, loading = false, err = '' }, h) {
  const { esc, fmt, gbp } = h;
  const id = compact ? 'reround' : 'smart';
  if (err) return `<section class="panel reround" id="${id}"><h3>Reorder round</h3><p class="note">${esc(err)}</p></section>`;
  if (loading) return `<section class="panel reround" id="${id}"><h3>Reorder round</h3><p class="note">Reading Xero's invoices…</p></section>`;
  const due = round.filter(r => r.state === 'due'), done = round.filter(r => r.state === 'asked' || r.state === 'snoozed'), won = round.filter(r => r.state === 'won');
  const shown = compact ? due.slice(0, 5) : due;
  const t = tally;
  const head = `<div class="hsec-h"><h3>Reorder round</h3><span class="note">${t.due} to ask this week · this month asked ${t.asked} · won ${t.won}${md && t.won && t.wonValue != null ? ` (${gbp(t.wonValue)})` : ''}</span>
      ${compact ? `<button class="btn sm link" type="button" data-tab="sales" data-gosmart>See all${due.length ? ' ' + due.length : ''} on the CRM</button>` : ''}</div>
    ${nudge ? `<p class="renudge">${icon('spark')}<b>Monday reorder round:</b> ${nudge} to ask this week.</p>` : ''}
    ${compact ? '' : '<p class="note">Repeat parts past their usual gap, from Xero\'s invoices, the biggest customers first. Ask each one: an email, or a call then <b>Asked</b>. <b>Not needed</b> puts it away for 90 days. An order for the part after you asked shows as won.</p>'}`;
  const row = r => `<tr><td><b>${esc(r.customer)}</b></td><td>${esc(r.item)}</td>
      <td>every ${esc(days(r.every))}<small>${r.times} orders</small></td><td>${esc(fmt(r.last))}<small>${esc(days(r.since))} ago</small></td>
      <td class="act"><button class="btn sm pri" type="button" data-aiopen="${esc(r.key)}" data-angle="${esc(reorderAngle(r))}" data-reitem="${esc(r.item)}">${icon('mail')}Write an email</button>
        <button class="btn sm" type="button" data-reasked="${esc(r.key)}" data-reitem="${esc(r.item)}" title="You asked them another way, e.g. on the phone">Asked</button>
        <button class="btn sm" type="button" data-resnooze="${esc(r.key)}" data-reitem="${esc(r.item)}" title="Hide it for 90 days">Not needed</button>
        <button class="btn sm link" type="button" data-custpage="${esc(r.key)}" data-custname="${esc(r.customer)}">Customer page</button></td></tr>`;
  const list = shown.length ? `<div class="tbl-wrap"><table class="lines reorders"><thead><tr><th>Customer</th><th>Item</th><th>Usually</th><th>Last ordered</th><th class="act"><span class="sr">Action</span></th></tr></thead>
      <tbody>${shown.map(row).join('')}</tbody></table></div>${compact && due.length > shown.length ? `<p class="note">${due.length - shown.length} more on the CRM.</p>` : ''}`
    : `<p class="allclear ok">${round.length ? 'Every repeat part due has been asked about. Well done.' : 'No repeat parts are overdue.'}</p>`;
  const doneList = !compact && done.length ? `<ul class="redone">${done.map(r => `<li><b>${esc(r.customer)}</b> · ${esc(r.item)} · ${r.state === 'asked'
      ? `asked ${esc(fmt(r.asked))}${r.askedBy ? ' by ' + esc(first(r.askedBy)) : ''}` : `not needed until ${esc(fmt(r.snoozedUntil))}`}</li>`).join('')}</ul>` : '';
  const wonLine = won.length ? `<p class="rewon">${icon('ready')}Came back in: ${won.map(r => `<b>${esc(r.customer)}</b> (${esc(r.item)}, ${esc(r.wonOrder.so)})`).join(', ')}.</p>` : '';
  return `<section class="panel reround" id="${id}">${head}${list}${compact && done.length ? `<p class="note">${done.length} asked or not needed for now.</p>` : doneList}${wonLine}</section>`;
}
