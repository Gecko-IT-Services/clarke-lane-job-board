/**
 * Deliveries: the driver's screen (Philip, 22 Oct). Phone-sized, opened from the home-screen icon: the notes out for
 * delivery as big cards; tap one for the address, Navigate, the parts and the Delivered form with a signature pad.
 * What is listed comes from core/deliveries.js (tested); this file draws it and runs the pad. Never shows prices.
 * h: { esc, fmt, fmtTime, lineHtml, phoneFor(job) → '' or a phone number }.
 */
import { deliveryRuns, deliveredToday } from './core/deliveries.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clock = s => { const d = new Date(s); return isNaN(d) ? '' : d.toTimeString().slice(0, 5); };

/** signing: { nobody, err } for the picked note's form; the boxes themselves are kept by app.js like any form. */
export function renderDeliveries({ jobs, today, now, me, pick, signing = {} }, h) {
  const { esc, lineHtml } = h;
  const officeUser = ['md', 'office'].includes(me?.role);
  const runs = deliveryRuns(jobs, today), r = pick != null ? runs.find(x => x.d.id === pick) : null;
  const date = (now || new Date()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const back = r ? '<button type="button" class="dback" data-dlist>← All deliveries</button>'
    : officeUser ? '<button type="button" class="dback" data-tab="dispatch">← Dispatch</button>' : '<button type="button" class="dback" data-tab="floor">← Shop floor</button>';
  const head = `<div class="dhead">${back}<div><h2>Deliveries</h2><p class="sub">${esc(date)}</p></div></div>`;

  if (r) {
    const j = r.job, d = r.d, phone = h.phoneFor ? h.phoneFor(j) : '';
    const tel = phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : '';
    return `<div class="deliv">${head}
      <section class="dsheet">
        <h3 class="cu">${esc(j.customer)}</h3>
        ${r.addressLines.length ? `<p class="addr">${r.addressLines.map(esc).join('<br>')}</p>` : '<p class="addr none">No delivery address on the order. Ask the office.</p>'}
        ${j.contactName ? `<p class="dcontact">${esc(j.contactName)}</p>` : ''}
        <div class="dacts">${r.mapsUrl ? `<a class="btn pri" href="${esc(r.mapsUrl)}" target="_blank" rel="noopener">Navigate</a>` : ''}${tel ? `<a class="btn" href="${esc(tel)}">Call ${esc(phone)}</a>` : ''}</div>
        <p class="meta"><span class="mono">${esc(d.dn)}</span> · <span class="mono">${esc(j.so)}</span> · ${r.po ? `Their PO <b class="mono">${esc(r.po)}</b>` : 'No PO'}</p>
        <ul class="dparts">${r.parts.map(p => `<li><b>${p.qty}</b> × ${lineHtml(p, esc)}</li>`).join('')}</ul>
      </section>
      <form class="dform" id="delivf" data-dnote="${d.id}" novalidate autocomplete="off">
        <h3>Delivered</h3>
        <div class="dwho${signing.nobody ? ' off' : ''}" id="dl-who">
          <label class="fl">Who signed<input type="text" id="dl-name" autocapitalize="words" enterkeyhint="done" placeholder="Their name"${signing.nobody ? ' disabled' : ''}></label>
          <div class="sigbox"><div class="sighead"><span>Sign here</span><button type="button" class="btn" data-sigclear${signing.nobody ? ' disabled' : ''}>Clear</button></div>
            <canvas id="dl-sig" aria-label="Signature box: the customer signs here with a finger"></canvas></div>
        </div>
        <label class="dchk"><input type="checkbox" id="dl-nobody"${signing.nobody ? ' checked' : ''}> Nobody to sign</label>
        <label class="fl" id="dl-leftwrap"${signing.nobody ? '' : ' hidden'}>Where it was left<input type="text" id="dl-note" placeholder="e.g. Left at goods-in, by the shutter"></label>
        <p class="bad" id="dl-err"${signing.err ? '' : ' hidden'}>${esc(signing.err || '')}</p>
        <button type="submit" class="btn pri dsave"${signing.busy ? ' disabled' : ''}>${signing.busy ? 'Saving…' : 'Save delivery'}</button>
      </form></div>`;
  }

  const total = r => r.parts.reduce((a, p) => a + p.qty, 0);
  const cards = runs.map(r => `<button type="button" class="dcard" data-dpick="${r.d.id}">
      <b class="cu">${esc(r.job.customer)}</b>
      <span class="addr">${r.firstLine ? esc(r.firstLine) : 'No address on the order'}</span>
      <span class="meta"><span class="mono">${esc(r.d.dn)}</span> · <span class="mono">${esc(r.job.so)}</span> · ${plural(total(r), 'part')}</span></button>`).join('');
  const done = deliveredToday(jobs, today);
  const doneRows = done.map(({ job: j, d }) => `<li><b>${esc(j.customer)}</b><span>${d.deliveredAt ? clock(d.deliveredAt) : ''}</span>
      <span class="sig">${d.receivedBy ? 'Signed by ' + esc(d.receivedBy) : d.deliveryNote ? 'Nobody to sign' : 'Delivered'}</span></li>`).join('');
  return `<div class="deliv">${head}
    ${runs.length ? `<p class="note">${runs.length === 1 ? '1 delivery' : runs.length + ' deliveries'} out. Tap one when you get there.</p>` : ''}
    <div class="dlist">${cards || '<p class="allclear ok">Nothing out for delivery.</p>'}</div>
    ${doneRows ? `<section class="ddone"><h3>Delivered today</h3><ul>${doneRows}</ul></section>` : ''}</div>`;
}

/**
 * The signature pad: a finger, stylus or mouse draws on the canvas. Kept small on purpose (its own CSS size, at most
 * 600 × 200, not the screen's pixel density) so the PNG stays a few KB. value: a data URL to draw back after a
 * redraw of the screen. onStart: a stroke began; onEnd(dataUrl): a stroke finished.
 */
export function signaturePad(canvas, { value = '', onStart, onEnd } = {}) {
  canvas.width = Math.max(1, Math.min(600, Math.round(canvas.clientWidth || 300)));
  canvas.height = Math.max(1, Math.min(200, Math.round(canvas.clientHeight || 180)));
  const g = canvas.getContext('2d');
  const pen = () => { g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = '#111214'; };
  pen();
  if (value) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0); im.src = value; }
  let last = null;
  const at = e => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * canvas.width / b.width, (e.clientY - b.top) * canvas.height / b.height]; };
  canvas.onpointerdown = e => {
    if (canvas.closest('.off')) return;
    e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    last = at(e); g.beginPath(); g.arc(last[0], last[1], g.lineWidth / 2, 0, 2 * Math.PI); g.fill();
    onStart?.();
  };
  canvas.onpointermove = e => {
    if (!last) return;
    e.preventDefault();
    for (const ev of e.getCoalescedEvents?.() || [e]) { const p = at(ev); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; }
  };
  const end = () => { if (!last) return; last = null; onEnd?.(canvas.toDataURL('image/png')); };
  canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onlostpointercapture = end;
  return { clear() { g.clearRect(0, 0, canvas.width, canvas.height); pen(); } };
}
