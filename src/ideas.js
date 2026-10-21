/**
 * Ideas (Levi and Mandy, part of CRM): AI ideas for winning more work from what the board knows, and what each
 * customer's website and public pages say about them. Logic in core/ideas.js (tested); this file only draws.
 * Nothing is sent: ideas become emails (Outlook drafts) or tasks when Levi picks them.
 */
import { icon } from './icons.js';

const ACTION = { email: 'Email', call: 'Call', visit: 'Visit', other: 'Idea' };
const STATUS = { new: 'New', doing: 'Doing it', done: 'Done', no: 'Not for us' };

export function renderIdeas({ board, research, customers, busy, rs, err }, h) {
  const { esc, fmt } = h;
  const idea = i => `<li class="idea st-${i.status}"><div class="ih"><span class="chip">${ACTION[i.action] || 'Idea'}</span><b>${esc(i.title)}</b>${i.status !== 'new' ? `<span class="chip ${i.status === 'done' ? 'ok' : i.status === 'doing' ? 'soon' : ''}">${STATUS[i.status]}</span>` : ''}</div>
      ${i.why ? `<p class="note">${esc(i.why)}</p>` : ''}
      <div class="acts">${i.key && i.action !== 'other' ? `<button class="btn sm" type="button" data-ideaemail="${i.id}">${icon('mail')}Write an email</button>` : ''}
        <button class="btn sm" type="button" data-ideatask="${i.id}">${icon('plus')}Make a task</button>
        ${i.key ? `<button class="btn sm link" type="button" data-custpage="${esc(i.key)}" data-custname="${esc(i.customer)}">${esc(i.customer)}</button>` : ''}
        <span class="sp"></span>${['doing', 'done', 'no'].filter(s => s !== i.status).map(s => `<button class="btn sm" type="button" data-ideastatus="${s}" data-id="${i.id}">${STATUS[s]}</button>`).join('')}</div></li>`;
  const ideasBox = `<section class="panel" id="ideasbox"><div class="ph"><h3>Ideas to win more work</h3>
      <button class="btn pri" type="button" data-ideasgo ${busy.ideas ? 'disabled' : ''}>${busy.ideas ? 'Thinking…' : `${icon('spark')}${board.at ? 'Think of new ideas' : 'Think of ideas'}`}</button></div>
    <p class="note">AI reads what the board knows: what each customer buys and how often, who is growing or going quiet, repeat parts due, work they have never had from us, quotes and enquiries, and the customer research below. No prices are sent. About 3p a time.</p>
    ${board.latest.length ? `<p class="note">From ${esc(fmt(board.at.slice(0, 10)))}</p><ul class="ideas">${board.latest.map(idea).join('')}</ul>` : busy.ideas ? '' : '<p class="allclear">No ideas yet. Press <b>Think of ideas</b>.</p>'}
    ${board.older.length ? `<details><summary>${board.older.length} earlier idea${board.older.length === 1 ? '' : 's'} still open</summary><ul class="ideas">${board.older.map(idea).join('')}</ul></details>` : ''}</section>`;

  const card = r => `<article class="rcard"><div class="ph"><h4><button class="btn link" type="button" data-custpage="${esc(r.key)}" data-custname="${esc(r.customer)}">${esc(r.customer)}</button></h4>
      <span class="note">${r.website ? esc(r.website) + ' · ' : ''}checked ${esc(fmt(r.at.slice(0, 10)))}</span>
      <button class="btn sm" type="button" data-research="${esc(r.key)}" data-custname="${esc(r.customer)}" data-site="${esc(r.website)}" ${busy.research ? 'disabled' : ''}>${icon('refresh')}Check again</button></div>
    <p>${esc(r.about)}</p>
    ${r.news.length ? `<h5>What's new</h5><ul>${r.news.map(n => `<li>${esc(n.text)}${/^https?:\/\//i.test(n.url || '') ? ` <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</li>`).join('')}</ul>` : ''}
    ${r.openings.length ? `<h5>Where we could help</h5><ul class="ideas">${r.openings.map((o, i) => `<li class="idea"><b>${esc(o.idea)}</b><p class="note">${esc(o.why)}</p>
        <div class="acts"><button class="btn sm" type="button" data-rsemail="${esc(r.key)}" data-i="${i}">${icon('mail')}Write an email</button><button class="btn sm" type="button" data-rstask="${esc(r.key)}" data-i="${i}">${icon('plus')}Make a task</button></div></li>`).join('')}</ul>` : ''}</article>`;
  const researchBox = `<section class="panel" id="rsbox"><h3>Customer research <small>their website, LinkedIn, Facebook and news</small></h3>
    <p class="note">AI looks up a customer's own website and public pages for what is new with them (a new product, a new site, hiring, a contract won) and where we could help. Pages are read on the web; nothing is posted or sent. About 10 to 20p a customer.</p>
    <form class="row3 rsform" id="rsf" autocomplete="off">
      <label class="fl">Customer<input type="text" id="rs-cust" list="rs-custs" required value="${esc(rs.customer || '')}" placeholder="Start typing a customer"><datalist id="rs-custs">${customers.map(c => `<option value="${esc(c.customer)}"></option>`).join('')}</datalist></label>
      <label class="fl">Website <span class="note">(guessed from their emails; change if wrong)</span><input type="text" id="rs-site" value="${esc(rs.website || '')}" placeholder="e.g. example.co.uk"></label>
      <div class="fl"><span>&nbsp;</span><button class="btn pri" type="submit" ${busy.research ? 'disabled' : ''}>${busy.research ? esc(busy.research) : `${icon('search')}Research`}</button></div></form>
    ${err ? `<p class="bad">${esc(err)}</p>` : ''}
    ${research.length ? `<div class="rcards">${research.map(card).join('')}</div>` : '<p class="note">Nobody researched yet. Start with your best customers, or one gone quiet.</p>'}</section>`;
  return ideasBox + researchBox;
}
