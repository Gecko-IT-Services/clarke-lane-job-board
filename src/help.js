/**
 * Help: how the board works, step by step, with small illustrations of the real screens.
 * The pictures are built from the board's own styles with made-up customers, so they always look
 * like the app. They are pictures only (aria-hidden, not clickable). The shop floor sees only
 * the parts that apply to it.
 */
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const n = k => `<span class="hn">${k}</span>`;                        // numbered pointer
const box = (done, big) => `<span class="tick ${big ? 'big' : ''} ${done ? 'done' : ''}">${done ? TICK : ''}</span>`;
const pic = (html, caption) => `<figure class="hpic"><div class="hframe" aria-hidden="true">${html}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
const steps = items => `<ol class="hsteps">${items.map(t => `<li>${t}</li>`).join('')}</ol>`;

/** The whole journey of an order, left to right like the tabs. */
function flow(office) {
  const all = [
    ['Won quotes', 'Quotes Levi has marked Ordered', 'M4 6h16v12H4z M4 6l8 7 8-7', 'quotes'],
    ['Sales orders', 'The order is checked and saved', 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4', 'form'],
    ['Jobs', 'It goes on the job board', 'M4 5h16v14H4z M4 10h16 M9 10v9', 'jobs'],
    ['Shop floor', 'Each process is ticked off', 'M5 12.5l4.5 4.5L19 7.5', 'floor'],
    ['Dispatch', 'Delivery note, emailed, delivered', 'M3 7h11v9H3z M14 10h4l3 3v3h-7z M7 19a1.5 1.5 0 1 0 0-.01 M17 19a1.5 1.5 0 1 0 0-.01', 'dispatch'],
    ['Xero', 'Draft invoice for Keith', 'M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h3', 'xero'],
  ].filter(s => office || ['floor', 'dispatch'].includes(s[3]));
  return `<div class="hflow">${all.map(([t, d, path, k], i) => `${i ? '<span class="harrow" aria-hidden="true">→</span>' : ''}
    <a class="hstep" href="#help-${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>
      <b>${t}</b><span>${d}</span></a>`).join('')}</div>`;
}

function newOrders() {
  return `<section class="hsec" id="help-quotes"><h3>1 · Won quotes</h3>
    <p>Levi prices the job in his quote calculator as normal. When the customer orders, he presses <b>Mark as Ordered</b> there. Within a minute the quote appears on <b>Won quotes</b>, with the one waiting longest at the top. It turns amber after 2 working days and red after 5.</p>
    ${pic(`<table class="lines inbox"><thead><tr><th>Customer</th><th>Won</th><th>Contact</th><th>Value</th><th></th></tr></thead><tbody>
      <tr><td><b>Example Fabrications Ltd</b><div class="note mono">Q-0309 · quote</div></td><td>7 Oct <span class="chip late">6 days</span></td><td>A Buyer</td><td class="num">£386.50</td>
        <td><div class="acts"><span class="btn sm pri">Create sales order</span>${n(1)}<span class="btn sm">Not a job</span>${n(2)}</div></td></tr>
      <tr><td><b>Sample Engineering Co</b><div class="note mono">Q-0312 · quote</div></td><td>14 Oct <span class="chip">1 day</span></td><td></td><td class="num">£1,240.00</td>
        <td><div class="acts"><span class="btn sm pri">Create sales order</span><span class="btn sm">Not a job</span></div></td></tr></tbody></table>`)}
    ${steps([`${n(1)} <b>Create sales order</b> opens the order form with the customer, parts, quantities and prices copied from the quote. The processes it can tell from the quote (folds, welds, inserts, paint…) are already ticked.`,
      `${n(2)} <b>Not a job</b> stops a quote being offered here, for example one already finished some other way. The quote itself is not changed, and <b>Put back</b> undoes it.`,
      'Not there yet? Press <b>Refresh</b>, and check the quote is marked Ordered in the calculator.',
      'An order that came by phone or email with no quote: <b>Sales orders › New order</b>.'])}
  </section>`;
}

function orderForm() {
  return `<section class="hsec" id="help-form"><h3>2 · Sales orders</h3>
    <p>The office's list of every order, like Sage's Sales Order Processing: value, customer PO, next due date, and whether it has been dispatched and invoiced. Click an order to open it. The switch above the list shows <b>Outstanding</b> (soonest due first), <b>Dispatched</b>, <b>On hold</b> or <b>Cancelled</b>; the search looks through every order.</p>
    ${pic(`<table class="lines home orders"><thead><tr><th>Customer</th><th>Ordered</th><th>Next due</th><th>Progress</th><th class="num">Net</th></tr></thead><tbody>
      <tr><td><b>Sample Engineering Co</b><span class="ref mono">SO-9790 · no PO</span></td><td>15 Oct</td><td><span class="chip soon">20 Nov</span></td><td><span class="chip">Not dispatched</span> <span class="chip">Not invoiced</span></td><td class="num">£386.50</td></tr>
      <tr><td><b>Demo Metals Ltd</b><span class="ref mono">SO-9781 · PO-1</span></td><td>14 Oct</td><td></td><td><span class="chip ok">Dispatched</span> <span class="chip ok">Invoiced</span></td><td class="num">£1,068.00</td></tr></tbody></table>`)}
    <p><b>Create sales order</b> on Won quotes, or <b>New order</b> at the top of this tab, opens the order form. It works like a Sage sales order. Check it, then press <b>Create order</b>.</p>
    ${pic(`<div class="hform">
      <div class="hrow"><label>Customer ${n(1)}<span class="f">Example Fabrications Ltd</span></label><label>Customer PO ${n(2)}<span class="f">PO-4471</span></label></div>
      <table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Qty</th><th>Price</th><th>Due ${n(3)}</th></tr></thead><tbody>
        <tr><td style="text-align:left">Bracket, 3mm S275</td><td>50</td><td>£12.40</td><td>23 Oct</td></tr>
        <tr><td style="text-align:left">Bracket, 3mm S275</td><td>50</td><td>£12.40</td><td>30 Oct</td></tr></tbody></table>
      <div class="hrow"><span class="btn sm">Split into call-offs</span>${n(4)}<span style="flex:1"></span><span class="btn sm pri">Create order</span></div>
      <div class="hchecks">${['Laser', 'Fold', 'Weld', 'P/Coat Paint'].map((p, i) => `<span class="hcheck">${box(i < 2)} ${p}</span>`).join('')}${n(5)}</div></div>`)}
    ${steps([`${n(1)} The customer list comes from Xero, and picking one fills in the contact, email and delivery address.`,
      `${n(2)} Type the customer's order number. It goes on every document and on the invoice.`,
      `${n(3)} Each line has its own due date. Two lines of the same part with different dates are two deliveries.`,
      `${n(4)} <b>Split into call-offs</b> turns one line into several deliveries. See <a href="#help-calloffs">Call-offs</a> below.`,
      `${n(5)} Tick the processes the job needs. Only these appear as boxes on the shop floor.`,
      'After saving, the <b>order acknowledgement</b> opens. Press <b>Email to customer</b> to put it in your Outlook Drafts with the PDF attached.'])}
  </section>`;
}

/** Call-offs: one order, delivered in parts on set dates (Sage: one order line per delivery). */
function calloffs() {
  const line = (qty, due, extra = '') => `<tr><td style="text-align:left">Bracket, 3mm S275</td><td>${qty}</td><td>£12.40</td><td>${due}</td>${extra}</tr>`;
  return `<section class="hsec key" id="help-calloffs"><h3>3 · Call-offs</h3>
    <p>A call-off is one order delivered in parts on set dates, for example 200 brackets, 50 a week for four weeks. As in Sage, each delivery is its own <b>line on the order with its own due date</b>. Everything else follows from that: the board, the shop floor, the dispatch notes and the invoices all work one delivery at a time.</p>

    <h4>Setting one up</h4>
    ${pic(`<div class="hform">
      <table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Qty</th><th>Price</th><th>Due</th></tr></thead><tbody>${line('<b>200</b> ' + n(1), '23 Oct')}</tbody></table>
      <div class="panel"><div class="hrow"><span class="btn sm">Split into call-offs…</span>${n(2)}</div>
        <div class="hrow"><label>Deliveries<span class="f">4</span></label><label>How often<span class="f">Weekly ▾</span></label><label>First delivery<span class="f">23/10/2026</span></label>${n(3)}</div>
        <div class="hrow"><span class="btn sm">Split the lines</span>${n(4)}</div></div></div>`, 'Before: one line for the whole quantity.')}
    ${pic(`<table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Qty</th><th>Price</th><th>Due ${n(5)}</th></tr></thead><tbody>
      ${line(50, '23 Oct')}${line(50, '30 Oct')}${line(50, '6 Nov')}${line(50, '13 Nov')}</tbody></table>`, 'After: one line per delivery. The order total is unchanged.')}
    ${steps([`${n(1)} On the order form, enter the part with the <b>full quantity</b> and the price, as one line.`,
      `${n(2)} Press <b>Split into call-offs…</b> under the lines.`,
      `${n(3)} Say how many <b>deliveries</b>, <b>how often</b> (weekly, every 2 weeks or monthly) and the date of the <b>first delivery</b>.`,
      `${n(4)} Press <b>Split the lines</b>. Every line on the order is shared out across the deliveries. If it does not divide exactly, the first deliveries take the extra (201 in 4 = 51, 50, 50, 50).`,
      `${n(5)} Check the lines. You can change any quantity or date before saving, just like in Sage, then press <b>Create order</b>.`,
      '<b>An uneven schedule</b> (say 80 now, 60 in a fortnight, the rest when called for): skip the split and use <b>Add a line</b> instead, typing each delivery\'s quantity and date yourself.'])}

    <h4>While it runs</h4>
    ${pic(`<table class="jobs"><thead><tr><th>Customer</th><th>Sales order</th><th>Due</th></tr></thead><tbody>
      <tr><td class="cust"><b>Example Fabrications Ltd</b><div class="meta"><span class="chip">Delivery 2 of 4</span> ${n(6)}</div></td><td class="so">SO-9786</td><td><span class="chip soon">30 Oct</span></td></tr></tbody></table>
      <div class="panel" style="margin-top:10px"><table class="lines"><thead><tr><th style="text-align:left">Part</th><th>Due</th><th>Ordered</th><th>Outstanding</th><th>This dispatch</th></tr></thead><tbody>
        <tr><td style="text-align:left">Bracket, 3mm S275</td><td>30 Oct</td><td>50</td><td>50</td><td><span class="f">50</span> ${n(7)}</td></tr>
        <tr><td style="text-align:left">Bracket, 3mm S275</td><td>6 Nov</td><td>50</td><td>50</td><td><span class="f">0</span></td></tr>
        <tr><td style="text-align:left">Bracket, 3mm S275</td><td>13 Nov</td><td>50</td><td>50</td><td><span class="f">0</span></td></tr></tbody></table></div>`)}
    ${steps([`${n(6)} The job board and shop floor show which delivery is next (<b>Delivery 2 of 4</b>) and its due date. The shop floor shows how many are needed for the next delivery.`,
      `${n(7)} On <b>Dispatch</b>, the quantities are already filled in for <b>the next delivery only</b>; later deliveries stay at 0 until their turn. Change them if the customer wants more now.`,
      'Each delivery gets its own <b>dispatch note</b>, which lists what is still to come on the order, and its own <b>draft invoice</b> in Xero once delivered. So the customer is invoiced per call-off, for exactly what went.',
      'The order stays on the board until the last delivery has gone, then moves to <b>Finished</b>.'])}

    <h4>When the customer changes a call-off</h4>
    ${steps(['Open the order on <b>Sales orders</b> and press <b>Amend</b>.',
      '<b>Earlier or later:</b> change that line\'s due date. If it is now urgent, bring the job forward on <b>Jobs</b> with ⤒.',
      '<b>More or fewer:</b> change that line\'s quantity. It can\'t go below what has already been dispatched on it.',
      '<b>An extra delivery:</b> press <b>Add a line</b> with the part, quantity, price and date.',
      '<b>A delivery no longer wanted:</b> delete its line (only possible while nothing has been sent on it).',
      '<b>A new PO for each call-off:</b> when the customer\'s call-off PO arrives, press <b>Amend</b> and type it in that line\'s <b>Call-off PO</b> box. Leave the box blank to use the order\'s own PO. The delivery note, its email and the Xero invoice for that delivery then quote the call-off PO.'])}
  </section>`;
}

function jobsBoard() {
  const pt = (name, done) => `<span class="pt ${done ? 'done' : ''}"><span class="bx">${done ? TICK : ''}</span>${name}</span>`;
  const row = (o, mv, cust, ref, due, pills, ready) => `<tr class="${ready ? 'ready' : ''}"><td class="ord"><span class="n ${mv ? 'placed' : ''}">${o}</span><span class="mv"><span class="btn sm">⤒</span><span class="btn sm">▲</span><span class="btn sm">▼</span></span></td>
    <td><b>${cust}</b><span class="ref mono">${ref}</span>${ready ? '<div class="chips"><span class="chip ok">Ready to dispatch</span></div>' : ''}</td><td>${due}</td><td>${pills}</td></tr>`;
  return `<section class="hsec" id="help-jobs"><h3>4 · Jobs</h3>
    <p>Every open order, one row each. <b>Not started</b> has nothing ticked or sent, <b>In progress</b> has something ticked or sent, <b>Finished</b> is all dispatched.</p>
    ${pic(`<table class="lines home board"><thead><tr><th>Order ${n(1)}</th><th>Customer</th><th>Due</th><th>Processes ${n(2)}</th></tr></thead><tbody>
      ${row(1, true, 'Sample Engineering Co', 'SO-9790 · PO-114', '<span class="chip soon">20 Nov</span>', pt('Laser') + pt('Weld') + pt('P/Coat'))}
      ${row(2, false, 'Example Fabrications Ltd', 'SO-9786 · no PO', '<span class="chip late">17 Oct</span>', pt('Laser', true) + pt('Fold', true) + pt('P/Coat', true), true)}
      ${row(3, false, 'Demo Metals Ltd', 'SO-9788 · PO-92', '<span class="chip">29 Oct</span>', pt('Laser', true) + pt('Fold'))}</tbody></table>`)}
    ${steps([`${n(1)} <b>Bring a job forward:</b> ⤒ sends it to the top, and ▲ ▼ move it one place. The shop floor follows this order straight away. <b>Put everything back in date order</b> (under the table) undoes it all.`,
      `${n(2)} <b>Tick a process</b> by clicking its pill when that step is finished. Click it again to undo.`,
      'A green row means every process is ticked: the job is ready to dispatch.',
      '<b>Job sheet</b> (open the job, or from the order acknowledgement): a printed copy for the job folder with the drawing. It has the parts, due dates and a box for each process, and no prices. Before printing, <b>What is this sheet for?</b> lets you set <b>To make</b> for each line, for example just this week\'s call-off for VFS or Wessex. It starts on the next delivery; <b>Everything outstanding</b> fills in the rest. This only changes the sheet, never the order. The board is still the live record, so tick processes there too.',
      'Click a row to open the whole order. From there: <b>Amend</b>, <b>Hold</b> / <b>Release</b>, <b>Cancel</b>, <b>Repeat order</b>, <b>Order acknowledgement</b> and <b>Dispatch…</b>.',
      'Prices and values are on <b>Sales orders</b>; the shop floor never sees them.'])}
  </section>`;
}

function shopFloor(office) {
  return `<section class="hsec" id="help-floor"><h3>${office ? '5 · ' : ''}Shop floor</h3>
    <p>${office ? 'The screen the factory uses on the touch screen. ' : ''}Jobs are listed in the order the office wants them done: anything brought forward first, then soonest due.</p>
    ${pic(`<div class="stations"><span class="sbtn">All jobs <span class="c">6</span></span><span class="sbtn on">Laser <span class="c">3</span></span>${n(1)}<span class="sbtn">Fold <span class="c">2</span></span><span class="sbtn">Weld <span class="c">1</span></span></div>
      <table class="jobs floor"><thead><tr><th>Due</th><th>Sales order</th><th>Customer and parts</th><th class="p focus">Laser</th><th class="p">Fold</th><th class="p">Weld</th></tr></thead><tbody>
        <tr><td><span class="chip late">17 Oct</span></td><td class="so">SO-9786</td><td class="cust"><b>Example Fabrications Ltd</b><div class="parts"><b>50</b> × Bracket, 3mm S275</div></td>
          <td class="p focus">${box(false, true)} ${n(2)}</td><td class="p">${box(false, true)}</td><td class="p"><span class="na">–</span></td></tr>
        <tr class="ready"><td><span class="chip">24 Oct</span></td><td class="so">SO-9781</td><td class="cust"><b>Demo Metals Ltd</b><div class="parts"><b>12</b> × Cabinet</div><div class="meta"><span class="chip ok">Ready to dispatch</span></div></td>
          <td class="p focus">${box(true, true)}<small>09:42</small></td><td class="p">${box(true, true)}<small>11:05</small></td><td class="p">${box(true, true)}<small>14:20</small></td></tr></tbody></table>`)}
    ${steps([`${n(1)} Tap your <b>station</b> to see only the jobs waiting for it. The number shows how many. The screen remembers it.`,
      `${n(2)} When your process is finished on a job, <b>tap its box</b>. It turns green with the time.`,
      'Tapped the wrong one? Tap it again, or press <b>Undo</b> on the message at the bottom.',
      'A dash means that job does not need that process.',
      'When every box on a job is green, the row turns green: <b>Ready to dispatch</b>. The Dispatch tab shows it too.',
      '<span class="chip late">Brought forward</span> means the office has moved this job up. Do it first.',
      'Tap the <b>sales order number</b> to see the full job.'])}
  </section>`;
}

function dispatch(office) {
  return `<section class="hsec" id="help-dispatch"><h3>${office ? '6 · ' : ''}Dispatch</h3>
    <p>The <b>Dispatch</b> tab shows <span class="badge go">2 ready</span> when jobs are finished.</p>
    ${pic(`<div class="panel ready"><h3>Ready to dispatch</h3><table class="lines"><thead><tr><th style="text-align:left">Order</th><th style="text-align:left">Customer</th><th>Due</th><th style="text-align:left">To send</th><th></th></tr></thead><tbody>
      <tr><td class="mono" style="text-align:left">SO-9781</td><td style="text-align:left"><b>Demo Metals Ltd</b></td><td><span class="chip">24 Oct</span></td><td style="text-align:left"><b>12</b> × Cabinet</td><td><span class="btn sm pri">Dispatch</span>${n(1)}</td></tr></tbody></table></div>
      <div class="panel" style="margin-top:10px"><h3>Out for delivery</h3><table class="lines"><thead><tr><th>Note</th><th style="text-align:left">Customer</th><th>Emailed</th><th>Delivered</th></tr></thead><tbody>
      <tr><td class="mono">DN-0007</td><td style="text-align:left">Demo Metals Ltd</td><td><span class="btn sm">Email…</span>${n(2)}</td><td><span class="f sm">Signed by (optional)</span> <span class="btn sm pri">Mark delivered</span>${n(3)}</td></tr></tbody></table></div>`)}
    ${steps([`${n(1)} <b>Dispatch</b> opens the delivery note with everything due filled in. Change a quantity to send part of it: the rest stays outstanding, as in Sage. Press <b>Create dispatch note</b>, then print it to go with the goods.`,
      `${n(2)} <b>Email…</b> opens the delivery note. <b>Email to customer</b> puts it in Outlook Drafts with the PDF.`,
      `${n(3)} When the goods have arrived, type who signed for them (if known) and press <b>Mark delivered</b>.${office ? ' Only delivered notes can be invoiced.' : ''}`,
      ...(office ? ['<b>Made a note by mistake, or the goods came back?</b> Press <b>Cancel</b> beside it, then <b>Yes</b>. It stays on the list crossed out (its number is never reused) and the quantities go back to outstanding. A note already invoiced in Xero can only be credited in Xero.'] : [])])}
  </section>`;
}

function xero() {
  return `<section class="hsec" id="help-xero"><h3>7 · Invoicing in Xero</h3>
    <p>Every delivered note waits under <b>Dispatch › Waiting for Xero</b>.</p>
    ${pic(`<div class="panel"><h3>Waiting for Xero</h3><table class="lines"><thead><tr><th></th><th>Note</th><th style="text-align:left">Customer</th><th style="text-align:left">Xero contact</th><th>Net</th></tr></thead><tbody>
      <tr><td>${box(true)}</td><td class="mono">DN-0007</td><td style="text-align:left">Demo Metals Ltd</td><td style="text-align:left">Demo Metals Limited ${n(1)}</td><td>£1,068.00</td></tr></tbody></table>
      <div class="hrow"><span class="btn pri">Create 1 draft invoice in Xero</span>${n(2)}</div></div>`)}
    ${steps([`${n(1)} The board matches each customer to their Xero contact. If it cannot be sure, pick the contact once and it is remembered.`,
      `${n(2)} <b>Create draft invoices</b> makes one <b>draft</b> invoice per delivery note in Xero, for exactly what was sent, with the SO, PO and DN numbers on it.`,
      'Keith checks and approves them in Xero as usual. The board never approves, sends or deletes anything in Xero.',
      '<b>Preview with Xero\'s order book:</b> on the Xero tab, <b>Start the preview</b> shows every open sales order in Xero as a job on every screen, to see the board with real orders. An orange PREVIEW bar shows across the top; nothing is saved and Xero is not changed. Ticks and moving jobs work on that screen only. <b>Leave preview</b> puts everything back.',
      '<b>Changeover day:</b> on the Xero tab, press <b>Import open sales orders</b> once. It brings Xero\'s open sales orders onto Won quotes. After that, orders are only raised on the board.'])}
  </section>`;
}

function mapAndCustomers(office) {
  return `<section class="hsec" id="help-map"><h3>Map</h3>
    <p>Where the open orders are going, one pin per postcode, so Levi can see when a second delivery fits the same run.</p>
    ${pic(`<div class="hfilters">${[['Running late', '#B4321F', 1, true], ['Out for delivery', '#2557A7', 1, true], ['Ready to dispatch', '#25744A', 2, true], ['Due in the next 7 days', '#B45309', 3, true], ['Later', '#64646A', 6, false]]
        .map(([t, c, k, on]) => `<span class="hpill ${on ? 'on' : ''}" style="--k:${c}"><span class="hbox">${on ? '✓' : ''}</span>${t} <small>${k}</small></span>`).join('')} ${n(1)}</div>
      <div class="hmap"><span class="hpin" style="--k:#B4321F;left:58%;top:22%"></span><span class="hpin" style="--k:#2557A7;left:44%;top:70%"></span><span class="hpin" style="--k:#25744A;left:52%;top:52%"></span><span class="hpin" style="--k:#B45309;left:30%;top:40%"></span>
        <div class="hpop">${n(2)} <b>SO14 3TJ</b><br>SO-9781 · out for delivery<br><small><b>Within 10 miles:</b> SO-9782 (6.1 mi), SO-9783 (6.4 mi)</small></div></div>`)}
    ${steps([`${n(1)} The coloured boxes along the top switch each kind of job on or off. Filled in with a tick = shown on the map; outline only = hidden. The number is how many jobs of that kind there are. <b>Later</b> (grey) is off to start with.`,
      `${n(2)} Click a pin to see the jobs at that address and <b>what else is within 10 miles</b> (change it to 5, 15 or 25 next to the boxes). Click an order number to open it.`,
      'A pin takes the colour of the most urgent job at that address, so check the list in its popup: a delivery and a late job at the same customer share one pin.',
      'The postcode comes from the order\'s delivery address, else the customer\'s usual delivery address in Customers' + (office ? ', else their address in Xero' : '') + '. Orders with no postcode are listed under the map in <b>Not on the map</b>; give them an address and they appear.',
      'The van\'s live position is not shown yet; it can be added later if the van gets a tracker or the driver shares his phone\'s location.'])}
  </section>
  ${office ? `<section class="hsec" id="help-customers"><h3>Customers (contact book)</h3>
    <p>Xero's contacts are often the customer's accounts people. The <b>Customers</b> tab keeps the people operations actually deal with, and where goods go. Xero is not changed.</p>
    ${steps(['Pick a customer on the left (or type one under the list and press <b>Open</b>).',
      '<b>Add a person</b> with a role: Orders / buyer, Goods in / deliveries, Accounts or Other. Tick <b>Main contact</b> for the one to use first.',
      '<b>Add a delivery address</b>, with the postcode, and tick <b>Usual delivery address</b> for the normal one.',
      'New orders then fill in the <b>main Orders / buyer</b> contact and the <b>usual address</b> instead of Xero\'s. Other saved addresses are in <b>Saved delivery addresses</b> on the order form, and saved people appear when you click in <b>Contact</b>.',
      'Delivery notes are emailed to the <b>main Goods in / deliveries</b> contact when there is one, otherwise to the order\'s contact.',
      'On the order form, <b>Save contact and address to the contact book</b> keeps what you typed for next time.'])}
  </section>` : ''}`;
}

function emails(office) {
  return `<section class="hsec" id="help-email"><h3>Emails</h3>
    ${pic(`<div class="hmail"><div class="hmail-h"><b>Drafts</b> · Outlook</div><div class="hmail-r"><b>Demo Metals Ltd</b><span>Delivery note DN-0007 for order SO-9781</span><span class="chip">PDF</span></div></div>`)}
    ${steps(['The board never sends an email itself. <b>Email to customer</b> puts a ready-made email, with the PDF attached, in <b>your own Outlook Drafts</b> and opens it.',
      'Check it, then press <b>Send</b> in Outlook. If you do not send it, nothing reaches the customer.',
      office ? 'The first time you email, Microsoft may ask you to sign in again. That happens once.' : ''].filter(Boolean))}
  </section>`;
}

function faq(office) {
  const q = [
    ['I ticked the wrong box.', 'Tap it again, or press Undo on the message at the bottom of the screen.'],
    ['The screen looks out of date.', 'It updates by itself when anyone makes a change. If in doubt, refresh the page.'],
    ['How do I print a job sheet?', 'Open the job (tap its sales order number) and press Job sheet. Check the To make quantities (they start on the next delivery and can be changed for this sheet only), then press Print.'],
    ['It says I am not on the staff list.', 'Ask Gecko IT to add your Microsoft 365 address.'],
  ];
  if (office) q.push(
    ['A quote I marked Ordered is not on Won quotes.', 'Press Refresh. If it is still missing, check the quote says Ordered in the calculator.'],
    ['I made an order by mistake.', 'Open it and press Delete (made by mistake). That only works while nothing has been dispatched; after that, use Cancel.'],
    ['A dispatch note was made by mistake, or the goods came back.', 'On the Dispatch tab press Cancel beside the note, then Yes. The note stays on the list marked cancelled, and its quantities go back to outstanding on the order. Once a note is invoiced in Xero it can only be credited in Xero.'],
    ['The customer wants to change the order.', 'Open it and press Amend: change quantities, prices or dates, or add lines. Lines already dispatched cannot go below what was sent.'],
    ['Hold an order?', 'Open it and press Hold. A held order cannot be dispatched until you press Release.'],
    ['The same order again?', 'Open the old one and press Repeat order. You get a new order with the same parts and prices, new dates and a blank PO.'],
  );
  return `<section class="hsec" id="help-faq"><h3>Questions</h3>${q.map(([a, b]) => `<details class="hq"><summary>${a}</summary><p>${b}</p></details>`).join('')}
    <p class="note">Anything else: contact Gecko IT.</p></section>`;
}

export function renderHelp(office) {
  const parts = office ? [newOrders(), orderForm(), calloffs(), jobsBoard(), shopFloor(true), dispatch(true), mapAndCustomers(true), xero(), emails(true), faq(true)]
    : [shopFloor(false), dispatch(false), mapAndCustomers(false), faq(false)];
  return `<div class="sec-h"><h2>Help</h2><span class="sub">${office ? 'How an order goes from quote to invoice. The pictures are examples, not real orders.' : 'How to use the shop floor screen. The pictures are examples.'}</span></div>
    <p class="hkey">The board is at <b>jobs.clarke-lane.co.uk</b>. Sign in with your Clarke Lane Microsoft account.</p>
    ${office ? `<div class="htabs">${[['Home', 'start of the day: what needs attention, what is going out, stations'], ['Won quotes', 'Levi\'s ordered quotes, to become sales orders'], ['Sales orders', 'every order, value, dispatched, invoiced; New order'],
      ['Jobs', 'the job board in running order; bring jobs forward'], ['Shop floor', 'the factory touch screen: tick processes'], ['Dispatch', 'ready to go, dispatch notes, delivered, Xero'],
      ['Map', 'where deliveries are going, what is nearby'], ['Customers', 'contact book: buyers, goods in, delivery addresses'], ['Xero', 'connection, preview, changeover import']]
      .map(([t, d]) => `<div><b>${t}</b><span>${d}</span></div>`).join('')}</div>` : ''}
    <p class="hkey">The <b>Home</b> tab is the place to start each day. The cards at the top count what is late, due in the next 7 days and ready to dispatch${office ? ', and the order book' : ''}. <b>Station snapshot</b> shows how many jobs are waiting at each station and how many of those are late; tap one to open the shop floor there. <b>Needs attention</b> lists what is late, at risk (due within 3 working days with processes still to do), on hold or ready to go${office ? ', plus won quotes waiting and deliveries to invoice' : ''}, worst first, each with one button for the next step. Switch to <b>Going out</b> to see everything due from today to the Friday of next week.</p>
    ${flow(office)}${office ? '<p class="hkey">Most asked: <a href="#help-calloffs">how to set up and change call-offs</a>.</p>' : ''}<div class="help">${parts.join('')}</div>`;
}
