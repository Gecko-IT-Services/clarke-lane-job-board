// Help video, step 1: drives the smoke page (made-up data only) through the whole process in headless Chrome
// and saves one screenshot per step plus its caption (frames.json). Then run make-video.mjs.
import { open } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const b = await open();
const frames = [];
const W = ms => b.sleep(ms);
async function step(name, caption, code, wait = 900) {
  if (code) { const r = await b.js(code); if (r) console.log(name, '→', r); }
  await W(wait);
  if (!['xero','soa','drawing','dn'].includes(name)) await b.js(`document.getElementById('toast').hidden = true;`);
  const f = `f${String(frames.length + 1).padStart(2, '0')}-${name}.jpg`;
  await b.shot(f); frames.push({ f, caption }); console.log('shot', f);
}
const click = sel => `const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'MISSING ${sel.replace(/'/g,'')}'; e.scrollIntoView({block:'center'}); e.click();`;
await b.go('http://localhost:8080/dev/smoke.html#xero');
await b.js(`sessionStorage.setItem('fakeXero','1'); localStorage.clear(); location.reload();`); await W(3000);

await step('xero', 'Changeover day: on the Xero tab, press "Import open sales orders" once. It brings every open sales order in Xero onto Won quotes.', click('[data-xero="import"]'), 2500);
await step('won', 'Won quotes lists the orders brought in from Xero, and quotes Levi marks Ordered in the quote calculator. Press "Make order" on one.', click('[data-tab="quotes"]'), 1500);
await step('form', 'The order form fills itself in: customer, lines, prices and due dates. Check the customer PO and tick the processes the job needs.', click('[data-start]'), 2000);
await step('soa', 'Press "Create sales order". It gets the next SO number and the order acknowledgement is ready to email to the customer.',
  `document.getElementById('of-po') && (document.getElementById('of-po').value='PO 4471'); document.querySelector('[data-orderform]').requestSubmit();`, 2500);
await step('order', 'Open the order from Sales orders to see everything about it: lines, drawings, processes, dispatches, purchase orders and pro formas.',
  `const so = document.querySelector('#doc .dno')?.innerText.trim(); window.__so = so; document.querySelector('[data-closedoc]')?.click(); document.querySelector('[data-tab="orders"]').click(); await new Promise(r=>setTimeout(r,500)); const row=[...document.querySelectorAll('#v-orders tr[data-open]')].find(r=>r.innerText.includes(so)); if(!row) return 'NO ROW '+so; row.click(); return so;`, 1500);
await step('drawing', 'Attach drawings: they are saved in SharePoint (Factory Jobs › Job drawings › the SO number) and open full screen on the shop floor.',
  `const c=document.createElement('canvas');c.width=900;c.height=560;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,900,560);g.strokeStyle='#111';g.lineWidth=3;g.strokeRect(120,120,660,300);g.beginPath();g.arc(300,270,46,0,7);g.stroke();g.beginPath();g.arc(600,270,46,0,7);g.stroke();g.font='26px sans-serif';g.fillStyle='#111';g.fillText('VALVE GUARD  2mm Zintec  Rev A',220,490);
   const blob=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'valve-guard-rev-A.png',{type:'image/png'}));const i=document.querySelector('[data-attach]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));
   await new Promise(r=>setTimeout(r,800)); [...document.querySelectorAll('#drawer h3')].find(h=>h.innerText==='Drawings').scrollIntoView({block:'start'});`, 1200);
await step('po', 'Buying parts or outside work for the job? "New purchase order": pick the supplier from Xero, add the lines and costs, and it goes to Xero as a draft PO with the SO number on it.',
  `document.querySelector('[data-ponew]').click(); await new Promise(r=>setTimeout(r,900)); document.getElementById('po-sup').value='00000000-0000-0000-0000-0000000000a1'; document.getElementById('po-d0').value='Powder coat RAL 9005, 10 valve guards'; document.getElementById('po-u0').value='85';`, 1200);
await step('pf', 'Customer to pay first? "New pro forma" makes PF-0001. Email it: the draft is copied to Keith, and the customer pays quoting the PF number. Press "Mark paid" when the money arrives.',
  `document.querySelector('[data-pocreate]').click(); await new Promise(r=>setTimeout(r,1500)); document.querySelector('[data-pfnew]').click(); await new Promise(r=>setTimeout(r,700));
   if (document.getElementById('pf-pay')) { document.getElementById('pf-pay').value='Example Bank · Sort code 00-00-00 · Account 00000000\\nPayment before dispatch, please.'; document.getElementById('pf-cc').value='accounts@example.com'; document.querySelector('[data-pfsettings]').requestSubmit(); await new Promise(r=>setTimeout(r,700)); }
   document.querySelector('[data-pfcreate]').click();`, 1800);
await step('sheet', 'Print the job sheet for the job folder: what to make, the processes to tick, and no prices.',
  `document.querySelector('[data-closedoc]').click(); await new Promise(r=>setTimeout(r,500)); document.querySelector('[data-jobsheet]').click(); await new Promise(r=>setTimeout(r,600)); document.querySelector('#doc .paper').scrollIntoView({block:'start'});`, 1200);
await step('jobs', 'Jobs lists every open job, soonest due first. Click a due date to change it, drag ⠿ to bring a job forward. The shop floor follows this order.',
  `document.querySelector('[data-closedoc]').click(); document.querySelector('[data-close]')?.click(); await new Promise(r=>setTimeout(r,400)); document.querySelector('[data-tab="jobs"]').click(); window.scrollTo(0,0);`, 1200);
await step('floor', 'The shop floor screen: tap your station to see the jobs waiting there, in the running order.',
  `document.querySelector('[data-tab="floor"]').click(); window.scrollTo(0,0);`, 1200);
await step('station', 'Tap a step when it is finished; it turns green. Press "Drawing" to see the drawing full screen. Tap a green step again to undo.',
  `document.querySelector('[data-station="Laser"]').click(); await new Promise(r=>setTimeout(r,600)); const card=[...document.querySelectorAll('#v-floor .fcard')].find(c=>c.innerText.includes(window.__so))||document.querySelector('#v-floor .fcard'); card.scrollIntoView({block:'center'}); card.querySelector('.step:not(.done)')?.click();`, 1400);
await step('ready', 'When every process is ticked, the job shows "Ready to dispatch" and appears on the Dispatch tab.',
  `document.querySelector('[data-tab="dispatch"]').click(); window.scrollTo(0,0);`, 1200);
await step('dn', 'Dispatch: choose what is going (all or part), press "Create dispatch note", then email it to the customer or print it.',
  `document.querySelector('[data-desp]')?.click(); await new Promise(r=>setTimeout(r,700)); document.getElementById('mkdn')?.click();`, 1800);
await step('xero', 'Once delivered, notes wait under "Waiting for Xero". Tick them and press "Send to Xero": one draft invoice per note, for exactly what was sent. Keith approves in Xero.',
  `document.querySelector('[data-closedoc]')?.click(); await new Promise(r=>setTimeout(r,300)); document.querySelector('[data-dispview="xero"]')?.click(); window.scrollTo(0,0);`, 1500);
await step('home', 'Home, every morning: what is late, due this week and ready to go, invoicing to do, and (for Levi) the month against break-even and target.',
  `document.querySelector('[data-tab="home"]').click(); window.scrollTo(0,0);`, 1500);
writeFileSync('frames.json', JSON.stringify(frames, null, 1));
b.close();
