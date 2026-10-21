/**
 * CRM, was Sales (Levi only; renamed 21 Oct): the month against his target, quotes to chase today, every open quote by stage, what his
 * quote history says, and customers to get back in touch with (from Xero's invoices), with emails drafted by
 * the board or written by AI from the facts. Logic in core/sales.js (tested); this file only draws.
 */
import { icon } from './icons.js';
import { STAGES } from './core/sales.js';

export const LOST_REASONS = ['Price', 'Lead time', 'Went elsewhere', 'No reply', 'Job cancelled', 'Other'];
const pc = x => x == null ? '—' : Math.round(x * 100) + '%';
const later = x => x <= 0.01 ? 'almost none are ordered' : pc(x) + ' are ordered';

export function renderSales({ loading, err, open, chase, stats, month, view, openId, actions, base, quiet, histErr, histEarliest, ai, today, reorders = [], more = [], news = null, enquiriesBox = '' }, h) {
  const { esc, fmt, gbp } = h;
  if (err) return `<div class="hhead"><div><h2>CRM</h2></div></div><div class="err">${esc(err)} <button class="btn sm" type="button" data-salesreload>Try again</button></div>`;
  if (loading) return `<div class="hhead"><div><h2>CRM</h2></div></div><p class="note">Reading your quotes from the quote calculator…</p>`;
  const days = n => `${n} day${n === 1 ? '' : 's'}`;
  const touched = q => q.lastAction ? `${{ email: 'Emailed', call: 'Called', note: 'Note', reopen: 'Reopened', lost: 'Lost' }[q.lastAction.kind] || 'Touched'} ${esc(fmt(q.lastAction.at.slice(0, 10)))}` : 'Not chased yet';
  const stageChip = q => `<span class="chip ${{ due: 'late', follow: 'soon', cold: 'soon', dead: '', fresh: 'ok', booked: 'ok' }[q.stage]}">${esc(STAGES[q.stage])}${q.stage === 'booked' && q.nextOn ? ' ' + esc(fmt(q.nextOn)) : ''}</span>`;
  const acts = q => `<div class="sacts">
      <button class="btn sm pri" type="button" data-qchase="${q.spId}"${q.contactEmail ? '' : ' title="No contact email on the quote: the draft opens without one"'}>${icon('mail')}Draft follow-up email</button>
      <button class="btn sm" type="button" data-qcall="${q.spId}">Log a call</button>
      <label class="sinline">Follow up on <input type="date" data-qnext="${q.spId}" value="${esc(q.nextOn || '')}" min="${esc(today)}"></label>
      <label class="sinline">Lost: <select data-qlost="${q.spId}"><option value="">reason…</option>${LOST_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select></label></div>`;

  // This month against the target.
  const m = month;
  const monthBox = `<section class="panel smonth"><h3>This month</h3>
    <div class="hcards">
      <div class="hcard"><div><b>${gbp(m.booked)}</b><span>Orders booked so far</span></div></div>
      <div class="hcard"><div><b>${m.target ? gbp(m.target) : '—'}</b><span>${m.target ? 'Your monthly target' : 'No target set: set it on Home'}</span></div></div>
      <div class="hcard${m.gap ? ' t-warn' : m.target ? ' t-ok' : ''}"><div><b>${m.gap == null ? '—' : m.gap ? gbp(m.gap) : 'Reached'}</b><span>Gap to target</span></div></div>
      <div class="hcard t-info"><div><b>${gbp(m.likely)}</b><span>Likely from open quotes</span></div></div></div>
    ${m.gap ? `<p class="sline">${m.afterLikely ? `Even if the likely quotes come in, <b>${gbp(m.afterLikely)}</b> is still to find.` : 'If the likely quotes come in, the target is reached.'}
      ${m.quotesNeeded ? ` At your win rate (${pc(stats.rate)}) and average won order (${gbp(stats.avgWon)}), that is about <b>${m.quotesNeeded} more quote${m.quotesNeeded === 1 ? '' : 's'}</b> to send, or chase the ones below.` : ''}</p>` : ''}</section>`;

  const chaseBox = `<section class="panel"><h3>Chase these today <small>${chase.length ? 'most likely value first' : ''}</small></h3>
    ${chase.length ? `<div class="schase">${chase.map(q => `<article class="scard">
        <div class="stop"><div><b>${esc(q.customer)}</b><span class="mono">${esc(q.quoteNo)}</span>${q.contactName ? `<small>${esc(q.contactName)}</small>` : ''}</div>
          <div class="sval"><b>${gbp(q.value)}</b><small>${pc(q.chance)} chance · sent ${esc(days(q.age))} ago</small></div></div>
        <p class="note">${stageChip(q)} ${touched(q)}${q.note ? ' · ' + esc(q.note) : ''}</p>${acts(q)}</article>`).join('')}</div>`
      : '<p class="allclear ok">Nothing to chase today. Fresh quotes appear here after a week, and follow-ups on their day.</p>'}</section>`;

  const counts = Object.fromEntries(Object.keys(STAGES).map(k => [k, open.filter(q => q.stage === k).length]));
  // Opens on the live quotes; the likely dead (old quotes nobody ordered) have their own tab.
  const live = open.filter(q => q.stage !== 'dead'), v = view || 'live';
  const shown = v === 'live' ? live : v === 'all' ? open : open.filter(q => q.stage === v);
  const hist = q => (actions || []).filter(a => a.spId === q.spId);
  const listBox = `<section class="panel"><h3>Open quotes <small>${live.length} live · ${gbp(live.reduce((a, q) => a + q.value, 0))} quoted · ${gbp(live.reduce((a, q) => a + q.likely, 0))} likely</small></h3>
    <div class="seg sseg"><button type="button" data-sview="live" aria-pressed="${v === 'live'}">Live <em>${live.length}</em></button>${Object.entries(STAGES).map(([k, t]) => counts[k] ? `<button type="button" data-sview="${k}" aria-pressed="${v === k}">${esc(t)} <em>${counts[k]}</em></button>` : '').join('')}</div>
    ${v === 'dead' ? `<p class="note">These are well past the point your won quotes usually come in, so they are rarely ordered now. Mark them lost with a reason to tidy up (the reasons show what to fix), or chase one if it still matters.</p>` : ''}
    ${shown.length ? `<div class="tbl-wrap"><table class="lines slist"><thead><tr><th>Quote</th><th>Customer</th><th class="num">Value</th><th class="num">Sent</th><th class="num">Chance</th><th class="num">Likely</th><th>Stage</th><th>Last</th></tr></thead><tbody>
      ${shown.map(q => `<tr data-sopen="${q.spId}" class="${openId === q.spId ? 'open' : ''}" tabindex="0"><td class="mono">${esc(q.quoteNo)}</td><td>${esc(q.customer)}</td><td class="num">${gbp(q.value)}</td><td class="num">${esc(days(q.age))} ago</td>
        <td class="num">${pc(q.chance)}</td><td class="num">${gbp(q.likely)}</td><td>${stageChip(q)}</td><td class="note">${touched(q)}</td></tr>
        ${openId === q.spId ? `<tr class="sdetail"><td colspan="8">${acts(q)}
          <label class="fl">Note<input type="text" data-qnote="${q.spId}" value="${esc(q.note)}" placeholder="e.g. waiting on their customer, call Thursday"></label>
          ${hist(q).length ? `<ul class="shist">${hist(q).map(a => `<li>${esc(fmt(a.at.slice(0, 10)))}: ${esc({ email: 'Email drafted', call: 'Call', note: 'Note', lost: 'Marked lost', reopen: 'Reopened' }[a.kind])}${a.note ? ' · ' + esc(a.note) : ''}</li>`).join('')}</ul>` : ''}</td></tr>` : ''}`).join('')}</tbody></table></div>`
      : '<p class="note">None at this stage.</p>'}</section>`;

  // What his own quotes say.
  const s = stats;
  const says = `<section class="panel"><h3>What your quotes say</h3>${s.decided ? `<ul class="ssays">
      <li>Over the last 12 months you won <b>${s.won} of ${s.decided}</b> quotes (${pc(s.rate)}), and ${pc(s.rateValue)} of the value quoted.</li>
      ${s.medianDays != null ? `<li>A won quote usually comes in within <b>${days(Math.round(s.medianDays))}</b>; 8 in 10 within ${days(s.p80Days)}. After that the chance drops fast, so chase in the first week or two.</li>` : ''}
      ${s.own ? `<li>Of quotes still open after 30 days, ${later(s.curve.find(([a]) => a === 30)[1])}; after 60 days, ${later(s.curve.find(([a]) => a === 60)[1])}.</li>` : `<li>Only ${s.decided} quotes are decided so far, so the chances use a cautious general curve until there are ${15}.</li>`}
      ${[...s.byCustomer.values()].filter(c => c.decided >= 3).sort((a, b) => b.won / b.decided - a.won / a.decided).slice(0, 3).map(c => `<li><b>${esc(c.customer)}</b> orders ${c.won} of ${c.decided} quotes.</li>`).join('')}
    </ul>` : '<p class="note">No decided quotes in the last 12 months yet.</p>'}</section>`;

  // Customers gone quiet.
  // Writing to one customer: its own panel, opened from any list (quiet, reorder, could buy more, the customer page).
  const aiC = ai ? (base || []).find(c => c.key === ai.key) : null;
  const aiBox = !aiC ? '' : `<section class="panel saipanel" id="saibox"><h3>Email to ${esc(aiC.customer)}</h3>${ai.draft ? `<div class="saibox">
        <label class="fl">To<input type="text" id="ai-to" value="${esc(ai.to || '')}" placeholder="their email"></label>
        <label class="fl">Subject<input type="text" id="ai-subj" value="${esc(ai.draft.subject)}"></label>
        <label class="fl">Email (edit anything)<textarea id="ai-body" rows="8">${esc([ai.draft.greeting, ...ai.draft.paragraphs].join('\n\n'))}</textarea></label>
        <p class="note">Written by AI from what ${esc(aiC.customer)} buys and when${ai.angle ? ', and your words' : ''}: check it before sending. Your name and Clarke Lane are added at the end.</p>
        <div class="actions"><button class="btn pri" type="button" data-aidraft="${esc(aiC.key)}">${icon('mail')}Put in my Outlook Drafts</button><button class="btn" type="button" data-aiwrite="${esc(aiC.key)}">Write it again</button><button class="btn" type="button" data-aiclose>Close</button></div></div>`
      : `<div class="saibox"><label class="fl">Anything to say? (optional)<input type="text" id="ai-angle" value="${esc(ai.angle || '')}" placeholder="e.g. we have laser capacity next week; new powder coat colours; check their next batch"></label>
        <div class="actions"><button class="btn pri" type="button" data-aiwrite="${esc(aiC.key)}" ${ai.busy ? 'disabled' : ''}>${ai.busy ? 'Writing…' : 'Write the email with AI'}</button><button class="btn" type="button" data-aiclose>Cancel</button>
        <span class="note">About 1p an email. It only uses what they buy, when, and your words above: never prices.</span></div></div>`}</section>`;
  const writeBtn = (c, angle = '') => `<button class="btn sm pri" type="button" data-aiopen="${esc(c.key)}" data-angle="${esc(angle)}">Write an email</button>`;
  const custBox = `<section class="panel"><h3>Customers to get back in touch with</h3>
    ${histErr ? `<div class="err">Xero's invoices could not be read: ${esc(histErr)}</div>` : !base ? '<p class="note">Reading Xero\'s invoices…</p>'
      : `<p class="note">From Xero's sales invoices${histEarliest ? ` (back to ${esc(fmt(histEarliest))})` : ''}: regular customers who have gone quiet for well past their usual gap, and customers who have not ordered for 6 months.${histEarliest && histEarliest > new Date(Date.parse(today) - 200 * 864e5).toISOString().slice(0, 10) ? ' <b>Xero only has a few months of history</b>, so this fills in as orders build up.' : ''}</p>
      ${quiet.length ? `<div class="tbl-wrap"><table class="lines squiet"><thead><tr><th>Customer</th><th>Usually orders</th><th>Last order</th><th class="num">Last 12 months</th><th>They buy</th><th></th></tr></thead><tbody>
        ${quiet.slice(0, 25).map(c => `<tr><td><b>${esc(c.customer)}</b>${c.lapsed ? ' <span class="chip late">Lapsed</span>' : ' <span class="chip soon">Gone quiet</span>'}</td>
          <td>${c.usual ? 'every ' + esc(days(c.usual)) : '—'}<small>${c.orders} orders</small></td><td>${esc(fmt(c.last))}<small>${esc(days(c.since))} ago</small></td>
          <td class="num">${gbp(c.yearNet)}${c.prevNet > c.yearNet ? `<small>was ${gbp(c.prevNet)}</small>` : ''}</td>
          <td>${c.items.slice(0, 2).map(i => esc(i.item)).join('<br>') || '—'}</td>
          <td>${writeBtn(c)} <button class="btn sm" type="button" data-ccall="${esc(c.key)}">Log a call</button> <button class="btn sm link" type="button" data-custpage="${esc(c.key)}">Page</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="allclear ok">Nobody has gone quiet.</p>'}`}</section>`;

  // Repeat parts due again, and work a regular customer could also give us.
  const reorderBox = `<section class="panel" id="smart"><h3>Due a reorder <small>repeat items past their usual gap</small></h3>${!base ? '<p class="note">Reading Xero\'s invoices…</p>' : reorders.length
      ? `<div class="tbl-wrap"><table class="lines"><thead><tr><th>Customer</th><th>Item</th><th>Usually</th><th>Last ordered</th><th></th></tr></thead><tbody>${reorders.slice(0, 20).map(r => `<tr><td><b>${esc(r.customer)}</b></td><td>${esc(r.item)}</td>
          <td>every ${esc(days(r.every))}<small>${r.times} orders</small></td><td>${esc(fmt(r.last))}<small>${esc(days(r.since))} ago</small></td>
          <td>${writeBtn(r, `Their regular order of "${r.item}" looks due: they usually order it about every ${r.every} days and last ordered it on ${r.last}. Ask whether they need the next batch.`)} <button class="btn sm" type="button" data-ccall="${esc(r.key)}">Log a call</button></td></tr>`).join('')}</tbody></table></div>`
      : '<p class="note">No repeat items are overdue.</p>'}</section>`;
  const moreBox = more.length ? `<section class="panel"><h3>Could give us more <small>regular customers who have never had these from us</small></h3>
      <div class="tbl-wrap"><table class="lines"><thead><tr><th>Customer</th><th>Has from us</th><th>Worth asking about</th><th></th></tr></thead><tbody>${more.slice(0, 15).map(x => `<tr><td><b>${esc(x.customer)}</b></td>
        <td>${esc(x.has.join(', '))}</td><td>${esc(x.missing.join(', '))}</td><td>${writeBtn(x, `Mention that we also do ${x.missing.join(' and ')} in-house or through our partners, so they can send the whole job to one supplier. Do not assume they need it.`)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">From the processes on their orders and the words on their invoices: a prompt to ask, not a guess about their business.</p></section>` : '';
  // The monthly news email: one personal draft per ticked customer.
  const active = (base || []).filter(c => c.since != null && c.since <= 365 && c.yearNet > 0);
  const newsBox = !base ? '' : `<section class="panel" id="snews"><h3>Email your customers <small>a short personal note to each, e.g. once a month</small></h3>
    <label class="fl">What's new? (in your words)<textarea id="news-text" rows="3" placeholder="e.g. We have a new press brake so we can fold up to 3m; laser capacity next week; new RAL colours in stock">${esc(news?.text || '')}</textarea></label>
    <p class="note">Each ticked customer gets their own email, written by AI from what they buy and your words above, as a draft in your Outlook Drafts to check and send (about 1p each).</p>
    <div class="snewslist">${active.slice(0, 60).map((c, i) => `<label><input type="checkbox" data-newspick="${esc(c.key)}" ${(news?.picked ? news.picked.includes(c.key) : i < 15) ? 'checked' : ''}> ${esc(c.customer)}</label>`).join('')}</div>
    <div class="actions"><button class="btn pri" type="button" data-newsgo ${news?.busy ? 'disabled' : ''}>${news?.busy ? esc(news.busy) : `${icon('mail')}Draft the emails`}</button></div></section>`;

  return `<div class="hhead"><div><h2>CRM</h2><p class="sub">Your open quotes to chase, what your quote history says, and customers to get back in touch with. Only you see this page.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-salesreload>${icon('refresh')}Refresh</button></div></div>
    ${monthBox}${enquiriesBox}${aiBox}${chaseBox}${listBox}${reorderBox}${moreBox}${custBox}${newsBox}${says}`;
}
