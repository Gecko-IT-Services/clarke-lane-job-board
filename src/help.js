/**
 * Help: how the board works, step by step, with small illustrations of the real screens.
 * The pictures are built from the board's own styles with made-up customers, so they always look
 * like the app. They are pictures only (aria-hidden, not clickable). The shop floor sees only
 * the parts that apply to it.
 */
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const n = k => `<span class="hn">${k}</span>`;                        // numbered pointer
const box = done => `<span class="tick ${done ? 'done' : ''}">${done ? TICK : ''}</span>`;
const pic = (html, caption) => `<figure class="hpic"><div class="hframe" aria-hidden="true">${html}</div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
const head = (k, title) => `<h3>${k ? `<span class="hno">${k}</span> ` : ''}${title}</h3>`;
/** Items starting with a numbered pointer explain the picture above; the rest go in a "Good to know" box. */
const steps = items => {
  const isNum = t => t.startsWith('<span class="hn">');
  const num = items.filter(isNum), tips = items.filter(t => !isNum(t));
  return (num.length ? `<ol class="hsteps">${num.map(t => `<li>${t}</li>`).join('')}</ol>` : '')
    + (tips.length ? `<div class="htips">${num.length ? '<b>Good to know</b>' : ''}<ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></div>` : '');
};

/** The whole journey of an order, left to right like the tabs. */
function flow(office) {
  const all = [
    ['Won quotes', 'Levi\'s quotes marked Ordered (and, once, Xero\'s open orders), waiting to become orders', 'M4 6h16v12H4z M4 6l8 7 8-7', 'quotes'],
    ['Sales orders', 'Checked and saved; value, dispatched, invoiced', 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4', 'form'],
    ['Jobs', 'The job board in running order', 'M4 5h16v14H4z M4 10h16 M9 10v9', 'jobs'],
    ['Shop floor', 'The factory ticks off each process', 'M5 12.5l4.5 4.5L19 7.5', 'floor'],
    ['Dispatch', 'Delivery note, emailed, delivered', 'M3 7h11v9H3z M14 10h4l3 3v3h-7z M7 19a1.5 1.5 0 1 0 0-.01 M17 19a1.5 1.5 0 1 0 0-.01', 'dispatch'],
    ['Xero', 'Draft invoice for Keith to approve', 'M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h3', 'xero'],
  ].filter(s => office || ['floor', 'dispatch'].includes(s[3]));
  const more = [['Home', 'Start of the day: what needs attention', 'home'], ['Delivery map', 'On Dispatch: where deliveries are going, what is nearby', 'map'],
    ...(office ? [['Customers', 'On Sales orders: buyers, goods in, delivery addresses', 'customers']] : [])];
  return `<div class="hjourney"><b class="hlbl">${office ? 'From quote to invoice' : 'Where your part fits'}</b>
    <div class="hflow" style="--n:${all.length}">${all.map(([t, d, path, k]) => `<a class="hstep" href="#help-${k}"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg></span>
      <span><b>${t}</b><small>${d}</small></span></a>`).join('')}</div>
    <div class="hmore"><b class="hlbl">Also on the board</b>${more.map(([t, d, k]) => `<a href="#help-${k}"><b>${t}</b><small>${d}</small></a>`).join('')}</div></div>`;
}

/** The whole process as a short video (made from the practice board: made-up customers only; see dev/video). */
const video = () => `<section class="hsec" id="help-video">${head(0, 'Watch: from order to invoice (about 5 minutes, with sound)')}
    <figure class="hvideo"><video controls preload="none" playsinline poster="/help/walkthrough.jpg?v=1020b" src="/help/walkthrough.mp4?v=1020b"></video>
    <figcaption>Every step, spoken and captioned: the Xero changeover, making an order, drawings and what they need, purchase orders, pro forma, job sheet, ticking orders for a total, Parts, Jobs, the shop floor, powder coat sent out, dispatch and saving notes, Xero and aged debt. Practice data only.</figcaption></figure>
  </section>`;

/** Changeover day: bring Xero's open sales orders across once, then the board is where orders are raised. */
const changeover = () => `<section class="hsec key" id="help-changeover">${head(0, 'Changeover day: moving from Xero to the board')}
    ${steps(['<span class="hn">1</span> On the <b>Xero</b> tab, press <b>Import open sales orders</b> once. Every open sales order in Xero appears on <b>Won quotes</b>.',
      '<span class="hn">2</span> On <b>Won quotes</b>, press <b>Create sales order</b> on each one. Check the lines and the customer PO, tick the processes, and save. It goes onto Jobs and the shop floor.',
      '<span class="hn">3</span> From then on, raise sales orders <b>only on the board</b>, not in Xero. The board keeps its SO numbers after the last one in Xero.',
      'Nothing is ever deleted or changed in Xero by the board. Invoices and purchase orders go to Xero as <b>drafts</b> for Keith.'])}
  </section>`;

/** Drawings, purchase orders and pro formas: everything else on an order. */
const orderExtras = () => `<section class="hsec" id="help-extras">${head(0, 'On each order: drawings, purchase orders, pro forma')}
    <p>Open an order from <b>Sales orders</b> and scroll down: each has its own section.</p>
    ${steps([
      '<b>Drawings:</b> press <b>Attach drawings</b>, or drag the PDFs from your desktop or an email onto the order\'s <b>Drawings</b> section (it outlines in blue when you can let go). Files are saved in SharePoint (Factory Jobs › Documents › Job drawings › the SO number). The shop floor gets a <b>Drawing</b> button on the job and it opens full screen. <b>Remove</b> only takes it off the job; the file stays in SharePoint.',
      '<b>Parts</b> (Sales orders › <b>Parts</b>): repeat parts and their drawings, by customer and part number. When a new order (or a repeat, or one made from Xero) has a line naming a part number in the list for that customer, the part\'s current drawing is attached automatically and marked <b>from Parts</b>; it is the same SharePoint file, not a copy. Add parts there with <b>Add a part</b>, or press <b>Keep for this part</b> when a drawing attached to an order shows its part number. A new revision dropped on a part becomes the current one for new orders; orders already made keep the one they had. Under the list, <b>Found on your orders</b> shows part numbers spotted on existing orders that are not in Parts yet: drag the drawing onto one (or press <b>Attach drawing</b>) and the part is added with it. Whenever a part gets a drawing, it is also attached to the open orders that name it.',
      '<b>Processes from the drawing:</b> when a PDF drawing is attached (or press <b>Check processes</b> beside one), the board reads its text, such as the material, thickness, finish, holes, chamfers, flat pattern and powder coat, and says which processes the order seems to be missing, with the words it found. <b>Add</b> them or press <b>Not needed</b>. It also says when something is not one of the nine processes (bar stock, an outside thread, engraving). It cannot see bends that are only drawn, or read scanned drawings, so always check by eye. On a new order, typing a part made before ticks the processes it had then.',
      '<b>Back-to-back</b> (bought in and sent on): tick <b>Back-to-back</b> on the new sales order; once it is saved, its purchase order opens ready with the same parts and quantities, and the supplier and costs from the last PO for those parts. No processes are needed if nothing is made here. On an existing order, <b>Back-to-back PO</b> does the same.',
      '<b>Purchase orders:</b> press <b>New purchase order</b>. To repeat an earlier one, pick it under <b>Copy a previous PO</b> (POs for the same parts come first, then others for the same customer): it fills in the supplier, account and lines, and you check the quantities and costs. Otherwise choose the supplier from Xero, pick the account (materials such as steel are 5000; for consumables or subcontract work type that code, or choose <b>Not sure</b> and Keith codes it), add lines and costs (<b>Copy this order\'s parts</b> helps), then <b>Create draft PO in Xero</b>. It goes to Xero as a draft with the SO number as its reference; approve and send it from Xero, and Keith matches the supplier\'s bill to it.',
      '<b>Pro forma:</b> press <b>New pro forma</b>, choose the quantities, then <b>Make the pro forma</b> (PF-0001…). <b>Email to customer</b> makes an Outlook draft copied to Keith; the customer pays quoting the PF number. Press <b>Mark paid</b> when it arrives: the order\'s later draft invoices in Xero then say it was paid in advance. It is not a VAT invoice and never goes to Xero itself.'])}
  </section>`;

/** Home: the start of the day. */
function home(office) {
  const card = (t, d, tone) => `<div class="hcardx ${tone}"><b>${t}</b><span>${d}</span></div>`;
  return `<section class="hsec" id="help-home">${head(0, 'Home: start here each day')}
    <div class="hcardsx">
      ${card('Counts at the top', `What is late, due in the next 7 days and ready to dispatch${office ? ', and the order book. Below them: <b>Delivered, not invoiced</b> (notes not yet sent to Xero) and <b>In Xero, not approved</b> (draft invoices the board made that nobody has approved in Xero yet; checked every 15 minutes) and <b>Over 60 days</b> (customers with invoices more than 60 days old and past due in Xero, most owed first). On that list, <b>Draft a chase email</b> puts a polite reminder in your Outlook Drafts, to the customer\'s accounts contact, listing each invoice with a pay-online link and copied to Keith; it is never sent for you, and the list shows who chased and when. A new sales order, and its quote on Won quotes, show the same warning for that customer: you can still go ahead. Click a card to see its list' : ''}.`, 't-bad')}
      ${card('Station snapshot', 'How many jobs are waiting at each station, and how many of those are late. Tap one to open the shop floor there.', 't-info')}
      ${card('Needs attention', `What is late, at risk (due within 3 working days with processes still to do), on hold or ready to go${office ? ', plus won quotes waiting and deliveries to invoice' : ''}. Worst first, each with one button for the next step.`, 't-warn')}
      ${card('Going out', 'Switch to this to see everything due from today to the Friday of next week.', 't-ok')}</div>
  </section>`;
}

function newOrders() {
  return `<section class="hsec" id="help-quotes">${head(1, 'Won quotes')}
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
  return `<section class="hsec" id="help-form">${head(2, 'Sales orders')}
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
      '<b>Part:</b> start typing and pick from the list: this customer\'s parts from earlier orders first (with the last price charged), then other customers\' parts, then Xero\'s Products and services. Picking one fills in the price; change it if needed, or just type a new part.',
      `${n(4)} <b>Split into call-offs</b> turns one line into several deliveries. See <a href="#help-calloffs">Call-offs</a> below.`,
      `${n(5)} Tick the processes the job needs. Only these appear as boxes on the shop floor.`,
      'After saving, the <b>order acknowledgement</b> opens. Press <b>Email to customer</b> to put it in your Outlook Drafts with the PDF attached.'])}
  </section>`;
}

/** Call-offs: one order, delivered in parts on set dates (Sage: one order line per delivery). */
function calloffs() {
  const line = (qty, due, extra = '') => `<tr><td style="text-align:left">Bracket, 3mm S275</td><td>${qty}</td><td>£12.40</td><td>${due}</td>${extra}</tr>`;
  return `<section class="hsec key" id="help-calloffs">${head(3, 'Call-offs')}
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
      '<b>Earlier or later:</b> on <b>Jobs</b>, click the due date and pick the new one (with more than one delivery, that moves the next one), or Amend the line\'s due date on Sales orders. If it is now urgent, bring the job forward on <b>Jobs</b> with ⤒.',
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
  return `<section class="hsec" id="help-jobs">${head(4, 'Jobs')}
    <p>Every open order, one row each. <b>Not started</b> has nothing ticked or sent, <b>In progress</b> has something ticked or sent, <b>Finished</b> is all dispatched.</p>
    ${pic(`<table class="lines home board"><thead><tr><th>Order ${n(1)}</th><th>Customer</th><th>Due</th><th>Processes ${n(2)}</th></tr></thead><tbody>
      ${row(1, true, 'Sample Engineering Co', 'SO-9790 · PO-114', '<span class="chip soon">20 Nov</span>', pt('Laser') + pt('Weld') + pt('P/Coat'))}
      ${row(2, false, 'Example Fabrications Ltd', 'SO-9786 · no PO', '<span class="chip late">17 Oct</span>', pt('Laser', true) + pt('Fold', true) + pt('P/Coat', true), true)}
      ${row(3, false, 'Demo Metals Ltd', 'SO-9788 · PO-92', '<span class="chip">29 Oct</span>', pt('Laser', true) + pt('Fold'))}</tbody></table>`)}
    ${steps([`${n(1)} <b>Moving jobs</b> (Levi and Mandy). <b>All open</b> lists every job not yet sent, soonest due first; jobs moved by hand stay where they were put, the rest follow in date order underneath.
        <ul><li><b>Drag</b> a job by ⠿ at the left of its row; a green line shows where it will land.</li>
        <li><b>⤒</b> puts it at the top, <b>▲ ▼</b> move it one place.</li>
        <li><b>Change the due date:</b> click the date and pick a new one; the job moves to its place in date order.</li>
        <li><b>Biggest first:</b> click the <b>Outstanding</b> heading to list jobs by value, then ⤒ to bring a big one to the top (handy for the month's target); click the heading again to go back.</li>
        <li>Every move has <b>Undo</b> on the message for a few seconds. <b>Put everything back in date order</b> (under the table) clears all the hand moves.</li>
        <li>Moving is off while there is something in the search box: clear it and the handles come back.</li></ul>
        The shop floor follows this order straight away.`,
      `<b>This month</b> (Levi only) is one line above the Jobs list (invoiced, work in progress, the gap, and how much more is due later to bring forward); the full panel is on Home, which shows three figures and a steel tube from £0 to the ideal target: <b>Invoiced</b> so far this month (the solid fill: amber until break-even, green past it), <b>Work in progress</b> (blue: open orders due by the month end) and the <b>Gap to target</b> (the empty steel left after both). Invoiced counts work dispatched on the board and sales invoices approved in Xero that the board did not raise (the weeks before changeover, or one typed straight into Xero), less credit notes; the line under the tube says how much came from each. The ring marks break-even and the small arrow underneath is where an even pace would be by today. If there is a gap, it says how much more is on order but due later, which could be brought forward. <b>Set break-even and target</b> (on Home) types both figures in once; they apply to every month.`,
      `${n(2)} <b>Tick a process</b> by clicking its pill when that step is finished. Click it again to undo.`,
      'A green row means every process is ticked: the job is ready to dispatch.',
      '<b>Job sheet</b> (open the job, or from the order acknowledgement): a printed copy for the job folder with the drawing. It has the parts, due dates and a box for each process, and no prices. Before printing, <b>What is this sheet for?</b> lets you set <b>To make</b> for each line, for example just this week\'s call-off for VFS or Wessex. It starts on the next delivery; <b>Everything outstanding</b> fills in the rest. This only changes the sheet, never the order. The board is still the live record, so tick processes there too.',
      'Click a row to open the whole order. From there: <b>Amend</b>, <b>Hold</b> / <b>Release</b>, <b>Cancel</b>, <b>Repeat order</b>, <b>Order acknowledgement</b> and <b>Dispatch…</b>.',
      'Prices and values are on <b>Sales orders</b>; the shop floor never sees them.',
      '<b>Adding orders up:</b> on <b>Sales orders</b>, tick the box at the start of each order (Shift-click to tick a run of them, or the box in the heading for every order shown). A panel in the corner keeps a running total: how many, their order value, and what is still to dispatch. <b>Clear</b> unticks them all.'])}
  </section>`;
}

function shopFloor(office) {
  const step = (p, done, here) => `<span class="step${done ? ' done' : ''}${here ? ' here' : ''}"><span class="bx">${done ? TICK : ''}</span><span><b>${p}</b><small>${done ? 'Done 09:42' : here ? 'Tap when done' : 'To do'}</small></span></span>`;
  return `<section class="hsec" id="help-floor">${head(office && 5, 'Shop floor')}
    <p>${office ? 'The screen the factory uses on the touch screen. ' : ''}Jobs are listed in the order the office wants them done: anything brought forward first, then soonest due.</p>
    ${pic(`<div class="kiosk"><div class="tiles">
        <span class="tile hot"><span class="nm">Laser ${n(1)}</span><span><span class="ct"><b>3</b>jobs waiting</span><span class="tag late">1 late</span></span></span>
        <span class="tile"><span class="nm">Fold</span><span><span class="ct"><b>2</b>jobs waiting</span><span class="tag ok">On time</span></span></span>
        <span class="tile idle"><span class="nm">Weld</span><span><span class="ct"><b>0</b>jobs waiting</span><span class="tag">Nothing waiting</span></span></span></div>
      <div class="fcard late"><div class="ftop"><span class="pos">1</span><div><div class="cu">Example Fabrications Ltd<span class="so">SO-9786</span></div><div class="parts"><span><b>50</b> × Bracket, 3mm S275</span></div></div>
        <div class="side"><span class="tag late">2 days late</span></div></div>
        <div class="route">${step('Laser', true)}<span class="arrow">→</span>${step('Fold', false, true)} ${n(2)}<span class="arrow">→</span>${step('P/Coat')}</div>
        <p class="fstat">1 of 3 done · next: <b>Fold</b></p></div></div>`)}
    ${steps([`${n(1)} The screen starts on the <b>station tiles</b>. Tap your station to see only the jobs waiting for it, in the order to do them. <b>All jobs</b> shows everything.`,
      '<b>Changing the order at one station</b> (Levi and Mandy, signed in on their own computer): open the station, then ⤒ (to the top), ▲ ▼ (one place) on a job. Only that station changes; the other stations and Jobs keep the running order. <b>Back to the running order</b> (top of the station) clears the moves there. Every move has <b>Undo</b>. The workshop screen just follows the order, without the buttons.',
      `${n(2)} Each job shows its whole route. When your process is finished, <b>tap its step</b>. It turns green with the time, and the message at the bottom says what comes next.`,
      'Tapped the wrong one? Tap the green step again, or press <b>Undo</b> on the message.',
      'When every step is green the job is <b>ready to dispatch</b> and goes back to the office. The Dispatch tab shows it too.',
      'A job <b>on hold</b> can\'t be ticked: the office has paused it, so don\'t start it.',
      '<span class="chip late">Brought forward</span> means the office has moved this job up. Do it first.',
      'Tap <b>Drawing</b> on a job to see its drawing full screen; <b>Close</b> goes back. <b>Job details</b> shows the full job.',
      'The shop floor login (workshop@) only has this screen: no other tabs and no prices.',
      'After <b>2 minutes</b> untouched the screen goes back to the tiles. <b>Kiosk mode</b> (under the tiles) is for the shared screen: it goes full screen where the browser allows it, hides the header and tabs so the screen stays on the Shop floor, and is remembered on that screen. <b>Leave kiosk mode</b> brings them back.'])}
  </section>`;
}

function dispatch(office) {
  const seg = on => `<div class="seg">${[['Ready', 2], ['Out for delivery', 1], ...(office ? [['Waiting for Xero', 1]] : []), ['All notes', 6]]
    .map(([t, k]) => `<button type="button" aria-pressed="${t === on}">${t} <em>${k}</em></button>`).join('')}</div>`;
  return `<section class="hsec" id="help-dispatch">${head(office && 6, 'Dispatch')}
    <p>The <b>Dispatch</b> tab shows <span class="badge go">2 ready</span> when jobs are finished. The cards count what is ready, not emailed, out for delivery and${office ? ' waiting for Xero' : ' sent this week'}. The switch shows <b>Ready</b>, <b>Out for delivery</b>, ${office ? '<b>Waiting for Xero</b> and ' : 'and '}<b>All notes</b>; it opens on the first with something in it.</p>
    ${pic(`<div class="hrow">${seg('Ready')}</div>
      <table class="lines home dispatch"><thead><tr><th>Customer</th><th>Due</th><th>To send</th><th class="act">Next step</th></tr></thead><tbody>
      <tr><td><b>Demo Metals Ltd</b><span class="ref mono">SO-9781 · PO-1</span></td><td><span class="chip soon">24 Oct</span></td><td><b>12</b> × Cabinet</td><td class="act"><span class="btn sm pri">Dispatch</span>${n(1)}</td></tr></tbody></table>
      <div class="hrow" style="margin-top:14px">${seg('Out for delivery')}</div>
      <table class="lines home dispatch"><thead><tr><th>Note</th><th>Customer</th><th>Emailed</th><th class="act">Next step</th></tr></thead><tbody>
      <tr><td class="mono">DN-0007</td><td><b>Demo Metals Ltd</b><span class="ref mono">SO-9781 · PO-1</span></td><td><span class="chip soon">Not emailed</span></td>
        <td class="act"><div class="next"><span class="btn sm pri">Email note…</span>${n(2)} <form class="inv"><input type="text" placeholder="Signed by (optional)"><span class="btn sm">Mark delivered</span></form>${n(3)}</div></td></tr></tbody></table>`)}
    ${steps([`${n(1)} <b>Dispatch</b> opens the delivery note with everything due filled in. It opens above the list; <b>Close</b> puts it away. Change a quantity to send part of it: the rest stays outstanding, as in Sage. Press <b>Create dispatch note</b>, then print it to go with the goods. To send part of a job that isn't finished, choose it under the Ready list.`,
      `${n(2)} <b>Email note…</b> opens the delivery note. <b>Email to customer</b> puts it in Outlook Drafts with the PDF.`,
      `${n(3)} When the goods have arrived, type who signed for them (if known) and press <b>Mark delivered</b>.${office ? ' Only delivered notes can be invoiced.' : ''}`,
      ...(office ? ['<b>Made a note by mistake, or the goods came back?</b> On <b>All notes</b> press <b>Cancel</b> beside it, then <b>Yes</b>. It stays on the list crossed out (its number is never reused) and the quantities go back to outstanding. A note already invoiced in Xero can only be credited in Xero.'] : [])])}
  </section>`;
}

function xero() {
  return `<section class="hsec" id="help-xero">${head(7, 'Invoicing in Xero')}
    <p>Every delivered note waits under <b>Dispatch › Waiting for Xero</b>.</p>
    ${pic(`<div class="hrow"><div class="seg">${[['Ready', 2], ['Out for delivery', 1], ['Waiting for Xero', 1], ['All notes', 6]].map(([t, k]) => `<button type="button" aria-pressed="${t === 'Waiting for Xero'}">${t} <em>${k}</em></button>`).join('')}</div><span class="btn pri">Create 1 draft invoice in Xero</span>${n(2)}</div>
      <table class="lines home xero"><thead><tr><th></th><th>Note</th><th>Customer</th><th>Xero contact</th><th class="num">Net</th></tr></thead><tbody>
      <tr><td>${box(true)}</td><td class="mono">DN-0007</td><td>Demo Metals Ltd</td><td>Demo Metals Limited ${n(1)}</td><td class="num">£1,068.00</td></tr></tbody></table>`)}
    ${steps([`${n(1)} The board matches each customer to their Xero contact. If it cannot be sure, pick the contact once and it is remembered.`,
      `${n(2)} <b>Create draft invoices</b> makes one <b>draft</b> invoice per delivery note in Xero, for exactly what was sent, with the SO, PO and DN numbers on it.`,
      'Keith checks and approves them in Xero as usual. The board never approves, sends or deletes anything in Xero.',
      '<b>Changeover day:</b> on the Xero tab, press <b>Import open sales orders</b> once. It brings Xero\'s open sales orders onto Won quotes. After that, orders are only raised on the board.'])}
  </section>`;
}

function mapAndCustomers(office) {
  return `<section class="hsec" id="help-map">${head(0, 'Map')}
    <p>Where the open orders are going, one pin per postcode, so Levi can see when a second delivery fits the same run. Open it with <b>Delivery map</b> at the top of <b>Dispatch</b>.</p>
    ${pic(`<div class="hfilters">${[['Running late', '#B4321F', 1, true], ['Out for delivery', '#2557A7', 1, true], ['Ready to dispatch', '#25744A', 2, true], ['Due in the next 7 days', '#B45309', 3, true], ['Later', '#64646A', 6, false]]
        .map(([t, c, k, on]) => `<span class="hpill ${on ? 'on' : ''}" style="--k:${c}"><span class="hbox">${on ? '✓' : ''}</span>${t} <small>${k}</small></span>`).join('')} ${n(1)}</div>
      <div class="hmap"><span class="hpin" style="--k:#B4321F;left:58%;top:22%"></span><span class="hpin" style="--k:#2557A7;left:44%;top:70%"></span><span class="hpin" style="--k:#25744A;left:52%;top:52%"></span><span class="hpin" style="--k:#B45309;left:30%;top:40%"></span>
        <div class="hpop">${n(2)} <b>SO14 3TJ</b><br>SO-9781 · out for delivery<br><small><b>Within 10 miles:</b> SO-9782 (6.1 mi), SO-9783 (6.4 mi)</small></div></div>`)}
    ${steps([`${n(1)} The coloured boxes along the top switch each kind of job on or off. Filled in with a tick = shown on the map; outline only = hidden. The number is how many jobs of that kind there are. <b>Later</b> (grey) is off to start with.`,
      `${n(2)} Click a pin (the number is how many jobs are there) to see the jobs at that address and <b>what else is within 10 miles</b> (change it to 5, 15 or 25 next to the boxes). Click an order number to open it.`,
      '<b>Stops</b>, beside the map (under it on a phone), lists every address, most urgent first, with how many other stops are nearby. Click one to zoom to it; the dashed ring shows the nearby distance. <b>Show all</b> zooms back out.',
      'A pin takes the colour of the most urgent job at that address, so check the list in its popup: a delivery and a late job at the same customer share one pin.',
      'The postcode comes from the order\'s delivery address, else the customer\'s usual delivery address in Customers' + (office ? ', else their address in Xero' : '') + '. Orders with no postcode are listed under the map in <b>Not on the map</b>; give them an address and they appear.',
      'The van\'s live position is not shown yet; it can be added later if the van gets a tracker or the driver shares his phone\'s location.'])}
  </section>
  ${office ? `<section class="hsec" id="help-customers">${head(0, 'Customers (contact book)')}
    <p>Xero's contacts are often the customer's accounts people. <b>Customers</b> (the button at the top of <b>Sales orders</b>) keeps the people operations actually deal with, and where goods go. Xero is not changed.</p>
    ${steps(['Pick a customer on the left (or type one under the list and press <b>Open</b>).',
      '<b>Add a person</b> with a role: Orders / buyer, Goods in / deliveries, Accounts or Other. Tick <b>Main contact</b> for the one to use first.',
      '<b>Add a delivery address</b>, with the postcode, and tick <b>Usual delivery address</b> for the normal one.',
      'New orders then fill in the <b>main Orders / buyer</b> contact and the <b>usual address</b> instead of Xero\'s. Other saved addresses are in <b>Saved delivery addresses</b> on the order form, and saved people appear when you click in <b>Contact</b>.',
      'Delivery notes are emailed to the <b>main Goods in / deliveries</b> contact when there is one, otherwise to the order\'s contact.',
      'On the order form, <b>Save contact and address to the contact book</b> keeps what you typed for next time.'])}
  </section>` : ''}`;
}

function emails(office) {
  return `<section class="hsec" id="help-email">${head(0, 'Emails')}
    ${pic(`<div class="hmail"><div class="hmail-h"><b>Drafts</b> · Outlook</div><div class="hmail-r"><b>Demo Metals Ltd</b><span>Delivery note DN-0007 for order SO-9781</span><span class="chip">PDF</span></div></div>`)}
    ${steps(['The board never sends an email itself. <b>Email to customer</b> puts a ready-made email, with the PDF attached, in <b>your own Outlook Drafts</b> and opens it.',
      'Check it, then press <b>Send</b> in Outlook. If you do not send it, nothing reaches the customer.',
      office ? 'The first time you email, Microsoft may ask you to sign in again. That happens once.' : ''].filter(Boolean))}
  </section>`;
}

function faq(office) {
  const q = [
    ['How do I see the drawing?', 'Press Drawing on the job (or open Job details and pick it under Drawings). It opens full screen; press Close to go back.'],
    ['I ticked the wrong box.', 'Tap it again, or press Undo on the message at the bottom of the screen.'],
    ['How do I go back?', 'Press ← Back (top left, or at the top of an open order), or your browser\'s Back button. Each press steps back one screen: closing an order, then a list opened from a card, then the tab before.'],
    ['I did something by mistake.', 'Most things show a message at the bottom with Undo for a few seconds: ticking a process, moving a job, changing a due date, making a dispatch note, marking delivered, hold, release and cancel. Things that cannot be undone ask Are you sure first.'],
    ['The screen looks out of date.', 'It updates by itself when anyone makes a change. If in doubt, refresh the page.'],
    ['How do I print a job sheet?', 'Open the job (tap its sales order number) and press Job sheet. Check the To make quantities (they start on the next delivery and can be changed for this sheet only), then press Print.'],
    ['It says I am not on the staff list.', 'Ask Gecko IT to add your Microsoft 365 address.'],
  ];
  if (office) q.push(
    ['A quote I marked Ordered is not on Won quotes.', 'Press Refresh. If it is still missing, check the quote says Ordered in the calculator.'],
    ['I made an order by mistake.', 'Open it and press Delete (made by mistake). That only works while nothing has been dispatched; after that, use Cancel.'],
    ['A dispatch note was made by mistake, or the goods came back.', 'On the Dispatch tab, under All notes, press Cancel beside the note, then Yes. The note stays on the list marked cancelled, and its quantities go back to outstanding on the order. Once a note is invoiced in Xero it can only be credited in Xero.'],
    ['The customer wants to change the order.', 'Open it and press Amend: change quantities, prices or dates, or add lines. Lines already dispatched cannot go below what was sent.'],
    ['Hold an order?', 'Open it and press Hold. A held order cannot be dispatched until you press Release.'],
    ['Sending work out for powder coating or plating?', 'On the Shop floor, the job card at P/Coat (or Plating) has <b>Send out</b>. Put in the company, what is going, the colour, the date it went and when it is due back (five working days unless you change it), then press <b>Sent out</b>. The <b>Sent out</b> tile on the Shop floor is the whiteboard: every job at each company, overdue ones in red, and jobs ready to go out. When it comes back press <b>Back in</b>: that ticks the process done (Undo puts it back). Levi and Mandy also see a Sent out card on Home and the send on the job\'s details.'],
    ['Keeping a copy of a delivery note?', 'Open the delivery note and press <b>Save PDF</b>. It saves to your Downloads named with the customer, the note number and the order, e.g. <i>Example Ltd - Delivery note - DN-0012 - SO-9781.pdf</i>. If you print and choose Save as PDF instead, it suggests the same name. Order acknowledgements and pro formas work the same way.'],
    ['Buying parts or outside work for an order (purchase order)?', 'Open the sales order and press New purchase order. Choose the supplier from Xero, add the lines (Copy this order\'s parts fills one line per part), put in the unit costs and press Create draft PO in Xero. It goes to Xero as a draft purchase order with the SO number as the reference; approve and send it from Xero. When the supplier\'s invoice comes in, Keith matches it to the PO in Xero. The PO is listed on the order with a link to it in Xero.'],
    ['Where do drawings go?', 'Open the order and press Attach drawings (PDFs and pictures show on the board; other files open in SharePoint). They are saved in SharePoint: Factory Jobs › Documents › Job drawings › the SO number. The shop floor sees a Drawing button on the job and it opens full screen. Remove only takes it off the job; the file stays in SharePoint.'],
    ['The customer must pay before we send (pro forma)?', 'Open the order and press New pro forma. Choose the quantities (everything still to send, or one call-off) and press Make the pro forma: it gets a PF number. Email it from there: the draft is copied to the accounts address (Keith) and asks the customer to quote the PF number when paying. When the money arrives press Mark paid; the order\'s draft invoices in Xero will then say Paid in advance with the PF number, so Keith can match the payment. A pro forma is not a VAT invoice and never goes to Xero itself. The first time, type the payment details and Keith\'s address in the box shown; they are kept for everyone in the office.'],
    ['The same order again?', 'Open the old one and press Repeat order. You get a new order with the same parts and prices, new dates and a blank PO.'],
  );
  return `<section class="hsec" id="help-faq">${head(0, 'Questions')}<div class="hfaq">${q.map(([a, b]) => `<details class="hq"><summary>${a}</summary><p>${b}</p></details>`).join('')}</div>
    <p class="note">Anything else: contact Gecko IT.</p></section>`;
}

export function renderHelp(office) {
  const parts = office ? [video(), changeover(), home(true), newOrders(), orderForm(), orderExtras(), calloffs(), jobsBoard(), shopFloor(true), dispatch(true), mapAndCustomers(true), xero(), emails(true), faq(true)]
    : [home(false), shopFloor(false), dispatch(false), mapAndCustomers(false), faq(false)];
  const toc = office ? [['video', 'Watch the video'], ['changeover', 'Changeover day'], ['home', 'Home'], ['quotes', 'Won quotes', 1], ['form', 'Sales orders', 2], ['extras', 'Drawings, POs, pro forma'], ['calloffs', 'Call-offs', 3], ['jobs', 'Jobs', 4], ['floor', 'Shop floor', 5],
    ['dispatch', 'Dispatch', 6], ['xero', 'Xero', 7], ['map', 'Map'], ['customers', 'Customers'], ['email', 'Emails'], ['faq', 'Questions']]
    : [['home', 'Home'], ['floor', 'Shop floor'], ['dispatch', 'Dispatch'], ['map', 'Map'], ['faq', 'Questions']];
  return `<div class="sec-h"><h2>Help</h2><span class="sub">${office ? 'How an order goes from quote to invoice.' : 'How to use the shop floor screen.'} The pictures are examples, not real orders. Sign in at <b>jobs.clarke-lane.co.uk</b> with your Clarke Lane Microsoft account.</span></div>
    <div class="hlayout"><nav class="htoc" aria-label="Help sections">${toc.map(([k, t, no]) => `<a href="#help-${k}">${no ? `<small>${no}</small>` : '<small class="dot"></small>'}${t}</a>`).join('')}</nav>
    <div class="help">${flow(office)}${office ? '<a class="hcallout" href="#help-calloffs"><b>Most asked</b> How to set up and change call-offs <span aria-hidden="true">→</span></a>' : ''}${parts.join('')}</div></div>`;
}
