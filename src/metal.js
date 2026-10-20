/**
 * Metal prices (Levi and Mandy): ask several suppliers for the same metal, put their prices side by side,
 * order from the one chosen (a draft PO in Xero), and look back at what each has charged. The logic is in
 * core/metal.js (tested); this file only draws. h: the formatting helpers from app.js.
 */
import { icon } from './icons.js';
import { MATERIALS, FORMS, UNITS, rfqRef, lineText, qtyText, compare, priceHistory, vsLast, billMatches } from './core/metal.js';

export function renderMetal({ rfqs, err, form, open, edit, jobs, suppliers, xeroSuppliers, xeroErr, bills, billsErr, q, poJob }, h) {
  const { esc, fmt, gbp } = h;
  const sel = (id, list, v, attrs = '') => `<select class="f" id="${id}" ${attrs}>${list.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  const openJobs = jobs.filter(j => j.status !== 'cancelled');
  const jobOpts = (v, blank) => `<option value="">${blank}</option>${openJobs.map(j => `<option value="${j.id}"${j.id === v ? ' selected' : ''}>${esc(j.so)} · ${esc(j.customer)}</option>`).join('')}`;

  const formHtml = !form ? '' : `<form class="panel mform" id="rfqf" autocomplete="off"><h3>Ask for prices</h3>
    <p class="note">Each supplier ticked gets the same enquiry as a draft in your Outlook Drafts. Check them and press Send. When they reply, type their prices in below.</p>
    <div class="row3"><label class="fl">For order (optional)<select class="f" id="rf-job">${jobOpts(form.jobId, 'Not for one order (stock)')}</select></label>
      <label class="fl">Needed by (optional)<input type="date" id="rf-need" value="${esc(form.needBy || '')}"></label>
      ${rfqs.length ? `<label class="fl">Copy the metal from an earlier enquiry<select class="f" id="rf-copy"><option value="">Choose one…</option>${rfqs.slice(0, 40).map(r => `<option value="${r.id}">${esc(rfqRef(r.id))} · ${esc(r.lines.map(lineText).join('; ').slice(0, 80))}</option>`).join('')}</select></label>` : '<span></span>'}</div>
    <div style="overflow-x:auto"><table class="lines mlines"><thead><tr><th>Material</th><th>Grade</th><th>Form</th><th>Thickness (mm)</th><th>Size</th><th>Qty</th><th>Unit</th><th></th></tr></thead><tbody>
      ${form.lines.map((l, i) => `<tr><td>${sel('rf-m' + i, MATERIALS, l.material)}</td><td><input type="text" id="rf-g${i}" value="${esc(l.grade)}" placeholder="5083, 304…" style="width:90px"></td>
        <td>${sel('rf-f' + i, FORMS, l.form)}</td><td><input type="text" id="rf-t${i}" value="${esc(l.thickness)}" placeholder="3" style="width:70px" inputmode="decimal"></td>
        <td><input type="text" id="rf-s${i}" value="${esc(l.size)}" placeholder="2500 × 1250, or 6m" style="width:160px"></td>
        <td><input type="number" id="rf-q${i}" min="0" step="any" value="${esc(l.qty)}" style="width:70px"></td><td>${sel('rf-u' + i, UNITS, l.unit)}</td>
        <td>${form.lines.length > 1 ? `<button class="btn sm link" type="button" data-rfdel="${i}" aria-label="Remove line ${i + 1}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="actions"><button class="btn sm" type="button" data-rfadd>${icon('plus')}Add a line</button></div>
    <h4>Suppliers to ask</h4>
    <div class="msups">${form.picked.map((x, i) => `<label class="msup"><input type="checkbox" data-rfpick="${i}" ${x.on ? 'checked' : ''}><b>${esc(x.supplier)}</b>
        <input type="email" id="rf-e${i}" value="${esc(x.email)}" placeholder="their sales email" aria-label="Email for ${esc(x.supplier)}">${x.supplierId ? '' : '<span class="note">not in Xero: add them there to order</span>'}</label>`).join('') || '<p class="note">None yet. Add one below.</p>'}</div>
    <div class="row2"><label class="fl">Add a supplier from Xero${xeroErr ? ` <span class="bad">${esc(xeroErr)}</span>` : ''}<select class="f" id="rf-addx"><option value="">${xeroSuppliers ? 'Choose a supplier…' : 'Reading Xero…'}</option>
        ${(xeroSuppliers || []).filter(c => !form.picked.some(p => p.supplierId === c.id)).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="fl">Note for the suppliers (optional)<input type="text" id="rf-note" value="${esc(form.note || '')}" placeholder="e.g. protective film one side, cut to size welcome"></label></div>
    <p class="bad" id="rf-err" hidden></p>
    <div class="actions"><button class="btn pri" type="submit" ${form.busy ? 'disabled' : ''}>${form.busy ? 'Making the drafts…' : `${icon('mail')}Draft the emails (${form.picked.filter(x => x.on).length})`}</button><button class="btn" type="button" data-rfcancel>Cancel</button></div></form>`;

  const state = r => r.status === 'ordered' ? `<span class="chip ok">Ordered from ${esc(r.orderedFrom || '')}${r.orderedPo ? ' · ' + esc(r.orderedPo) : ''}</span>`
    : r.status === 'closed' ? '<span class="chip">Closed</span>' : r.quotes.some(x => x.enteredAt) ? '<span class="chip soon">Prices in</span>' : '<span class="chip soon">Waiting for prices</span>';
  const detail = r => {
    const c = compare(r.lines, r.quotes), job = jobs.find(j => j.id === r.jobId);
    const cell = (x, i) => {
      if (edit === x.id) return `<td><input type="number" min="0" step="any" id="mq-p${i}" value="${esc(x.prices?.[i] ?? '')}" placeholder="£ each" style="width:90px"></td>`;
      const p = x.prices?.[i]; if (p == null || p === '') return '<td class="note">—</td>';
      const v = vsLast(p, priceHistory(r.lines[i], rfqs, r.id).filter(hh => hh.date < (x.enteredAt || '9').slice(0, 10)));
      const best = c.lineBest[i]?.suppliers.includes(x.supplier) && c.priced.length > 1;
      return `<td class="${best ? 'mbest' : ''}">${gbp(Number(p), 2)}${v && v.pct ? `<small class="${v.pct > 0 ? 'bad' : 'ok'}">${v.pct > 0 ? '↑' : '↓'} ${Math.abs(v.pct)}% on ${esc(fmt(v.last.date))} (${esc(v.last.supplier)})</small>` : ''}</td>`;
    };
    const head = c.rows.map(x => `<th class="${c.best?.supplier === x.supplier ? 'mbest' : ''}">${esc(x.supplier)}<small>${x.askedAt ? 'asked ' + esc(fmt(x.askedAt.slice(0, 10))) : 'not emailed yet'}</small></th>`).join('');
    const row = (label, f) => `<tr><th>${label}</th>${c.rows.map(f).join('')}</tr>`;
    const btns = x => {
      if (edit === x.id) return `<td><button class="btn sm pri" type="button" data-mqsave="${x.id}">Save</button> <button class="btn sm link" type="button" data-mqcancel>Cancel</button></td>`;
      const order = r.status === 'open' && x.complete ? (x.supplierId ? `<button class="btn sm${c.best?.supplier === x.supplier ? ' pri' : ''}" type="button" data-rforder="${x.id}">Order</button>` : '<span class="note">add to Xero to order</span>') : '';
      return `<td><button class="btn sm" type="button" data-mqedit="${x.id}">${x.any ? 'Change' : 'Enter prices'}</button> ${order}${!x.any ? ` <button class="btn sm link" type="button" data-rfmail="${x.id}" title="Make the draft email again">Email again</button>` : ''}</td>`;
    };
    const paid = r.lines.map(l => billMatches(l, bills || [])[0]).map((b, i) => b ? `<li>Line ${i + 1}: last paid <b>${gbp(b.unit, 2)}</b> each to ${esc(b.supplier)} on ${esc(fmt(b.date))} (${esc(b.number)}: ${esc(b.description)})</li>` : '').join('');
    return `<tr class="mdetail"><td colspan="6"><div class="mbox">
      <div style="overflow-x:auto"><table class="lines mcomp"><thead><tr><th>Metal</th>${head}</tr></thead><tbody>
        ${r.lines.map((l, i) => `<tr><th>${esc(lineText(l))}<small>${esc(qtyText(l))}</small></th>${c.rows.map(x => cell(x, i)).join('')}</tr>`).join('')}
        ${row('Delivery charge', x => edit === x.id ? `<td><input type="number" min="0" step="any" id="mq-c" value="${esc(x.carriage ?? '')}" placeholder="£" style="width:90px"></td>` : `<td>${x.carriage != null ? gbp(x.carriage, 2) : '<span class="note">—</span>'}</td>`)}
        ${row('Total', x => `<td class="${c.best?.supplier === x.supplier ? 'mbest' : ''}"><b>${x.any ? gbp(x.total, 2) : '—'}</b>${x.any && !x.complete ? '<small class="bad">not every line</small>' : ''}</td>`)}
        ${row('Lead time', x => edit === x.id ? `<td><input type="number" min="0" id="mq-l" value="${esc(x.leadDays ?? '')}" placeholder="days" style="width:70px"></td>` : `<td>${x.leadDays != null ? esc(x.leadDays) + ' day' + (x.leadDays === 1 ? '' : 's') : '—'}</td>`)}
        ${row('Valid until', x => edit === x.id ? `<td><input type="date" id="mq-v" value="${esc(x.validUntil || '')}"></td>` : `<td>${x.validUntil ? esc(fmt(x.validUntil)) : '—'}</td>`)}
        ${row('Note', x => edit === x.id ? `<td><input type="text" id="mq-n" value="${esc(x.note || '')}" placeholder="e.g. 4 in stock, rest Tuesday"></td>` : `<td class="note">${esc(x.note || '')}</td>`)}
        ${row('', btns)}</tbody></table></div>
      ${c.best && c.priced.length > 1 ? `<p><b>${esc(c.best.supplier)}</b> is cheapest at ${gbp(c.best.total, 2)}${c.saving ? `, ${gbp(c.saving, 2)} less than the next` : ''}.</p>` : ''}
      ${paid ? `<ul class="note mpaid">${paid}</ul>` : ''}
      ${r.status === 'open' ? `<div class="actions">${job ? `<span class="note">For <b>${esc(job.so)}</b> · ${esc(job.customer)}. Order makes a draft PO in Xero for it, on account 5000.</span>`
        : `<label class="fl">The PO needs an order: which is it for?<select class="f" id="rf-pojob" data-rfq="${r.id}">${jobOpts(poJob, 'Choose the order…')}</select></label>`}
        <button class="btn sm" type="button" data-rfclose="${r.id}" style="margin-left:auto">Close without ordering</button></div>` : ''}</div></td></tr>`;
  };
  const list = err ? `<div class="err">${esc(err)}</div>` : !rfqs.length ? '<p class="allclear">No enquiries yet. Press <b>Ask for prices</b>.</p>'
    : `<div class="tbl-wrap"><table class="lines mlist"><thead><tr><th>Enquiry</th><th>For</th><th>Metal</th><th>Suppliers</th><th>Cheapest</th><th></th></tr></thead><tbody>
      ${rfqs.map(r => { const c = compare(r.lines, r.quotes), job = jobs.find(j => j.id === r.jobId);
        return `<tr class="${open === r.id ? 'open' : ''}" data-rfopen="${r.id}" tabindex="0"><td><b class="mono">${esc(rfqRef(r.id))}</b><small>${esc(fmt(r.createdAt.slice(0, 10)))}</small></td>
          <td>${job ? esc(job.so) + '<small>' + esc(job.customer) + '</small>' : '<span class="note">Stock</span>'}</td>
          <td>${r.lines.map(l => esc(lineText(l)) + ' · ' + esc(qtyText(l))).join('<br>')}</td>
          <td>${c.priced.length} of ${r.quotes.length} priced</td><td>${c.best ? `${esc(c.best.supplier)}<small>${gbp(c.best.total, 2)}</small>` : '—'}</td><td>${state(r)}</td></tr>${open === r.id ? detail(r) : ''}`; }).join('')}</tbody></table></div>`;

  // Price history: every price a supplier has given here, and materials lines on Xero bills, filtered by what is typed.
  // "3.0MM", "3 mm" and "3mm" are the same thickness.
  const norm = t => String(t || '').toLowerCase().replace(/(\d+(?:\.\d*[1-9])?)(?:\.0+)?\s*mm\b/g, '$1mm').replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x').replace(/\s+/g, ' ');
  const words = norm(q).split(' ').filter(Boolean).map(w => new RegExp('(^|[^a-z0-9.])' + w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));   // from the start of a word: 3mm is not 13mm
  const hit = t => { const n = norm(t); return words.every(re => re.test(n)); };
  const quoted = rfqs.flatMap(r => r.lines.flatMap((l, i) => r.quotes.filter(x => x.prices?.[i] != null && x.prices[i] !== '').map(x => ({ date: (x.enteredAt || r.createdAt).slice(0, 10), what: lineText(l), supplier: x.supplier, unit: Number(x.prices[i]), ref: rfqRef(r.id) }))));
  const hq = words.length ? quoted.filter(x => hit(x.what)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30) : [];
  const hb = words.length ? (bills || []).filter(b => hit(b.description)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30) : [];
  const history = `<section class="panel"><h3>Price history</h3><p class="note">What suppliers have quoted here, and what was paid on Xero bills for materials (account 5000) in the last 12 months. Type a thickness, grade or material, e.g. <i>3mm 5083</i> or <i>304</i>.</p>
    <input type="search" id="msearch" value="${esc(q || '')}" placeholder="e.g. 3mm 5083" style="max-width:320px">
    ${billsErr ? `<p class="bad">Xero's bills could not be read: ${esc(billsErr)}</p>` : bills == null ? '<p class="note">Reading Xero\'s bills…</p>' : ''}
    ${words.length ? `<div class="row2 mhist"><div><h4>Quoted here</h4>${hq.length ? `<table class="lines"><thead><tr><th>Date</th><th>Metal</th><th>Supplier</th><th>Each</th></tr></thead><tbody>${hq.map(x => `<tr><td>${esc(fmt(x.date))}</td><td>${esc(x.what)}<small>${esc(x.ref)}</small></td><td>${esc(x.supplier)}</td><td>${gbp(x.unit, 2)}</td></tr>`).join('')}</tbody></table>` : '<p class="note">Nothing quoted yet that matches.</p>'}</div>
      <div><h4>Paid (Xero bills)</h4>${hb.length ? `<table class="lines"><thead><tr><th>Date</th><th>Line</th><th>Supplier</th><th>Each</th></tr></thead><tbody>${hb.map(b => `<tr><td>${esc(fmt(b.date))}</td><td>${esc(b.description)}<small>${esc(b.number)} · ${esc(b.qty)}</small></td><td>${esc(b.supplier)}</td><td>${gbp(b.unit, 2)}</td></tr>`).join('')}</tbody></table>` : `<p class="note">${bills ? 'No bill lines match.' : ''}</p>`}</div></div>` : ''}</section>`;

  return `<div class="hhead"><div><h2>Metal prices</h2><p class="sub">Ask several suppliers for the same metal at once, compare their prices side by side, then order from the one you choose. Every price is one a supplier gave; the board never guesses.</p></div>
      <div class="hbtns"><button class="btn" type="button" data-tab="orders">Sales orders</button>${form ? '' : `<button class="btn pri" type="button" data-rfnew>${icon('plus')}Ask for prices</button>`}</div></div>
    ${formHtml}<section class="panel"><h3>Enquiries</h3>${list}</section>${history}`;
}
