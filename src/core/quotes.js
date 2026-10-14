/**
 * Reading Levi's quotes from SharePoint (site FactoryJobs, lists Quotes and QuoteLines).
 * Read only: the board never writes to these lists.
 *
 * Power Apps shows display names; Graph returns internal names, and the two differ
 * ("Customer" vs CustomerName, "Thickness (mm)" vs Thickness_x0028_mm_x0029_). So the
 * columns are matched at run time from the list's own column list, and a missing
 * required column is an error that names the list and the column.
 */

export const QUOTE_FIELDS = {
  quoteNo:      { required: true, names: ['QuoteNo', 'Quote No'] },
  customer:     { required: true, names: ['Customer', 'CustomerName', 'Customer Name'] },
  status:       { required: true, names: ['Status'] },
  contactName:  { names: ['ContactName', 'Contact Name'] },
  contactEmail: { names: ['ContactEmail', 'Contact Email'] },
  quoteDate:    { names: ['QuoteDate', 'Quote Date'] },
  deliveryDays: { names: ['DeliveryDays', 'Delivery Days'] },
  carriage:     { names: ['CarriageCost', 'Carriage Cost'] },
  sellTotal:    { names: ['SellTotal', 'TotalSell', 'Sell Total'] },
};

export const LINE_FIELDS = {
  qty:       { required: true, names: ['Quantity', 'Qty'] },
  sellTotal: { required: true, names: ['SellTotal', 'Sell Total'] },
  lineNo:    { names: ['LineNo', 'Line No'] },
  desc:      { names: ['DescriptionInput', 'Drawing/Description', 'Description', 'Title'] },
  thickness: { names: ['ThicknessMM', 'Thickness (mm)', 'Thickness'] },
  material:  { names: ['Material'] },
  process:   { names: ['Process'] },
  folds:     { names: ['FoldCount', 'Fold Count'] },
  weld:      { names: ['WeldLength', 'Weld Length'] },
  inserts:   { names: ['InsertCount', 'Insert Count'] },
  paint:     { names: ['PaintRequired', 'Paint Required'] },
  plating:   { names: ['PlatingCost', 'Plating Cost'] },
  hole1:     { names: ['HoleQty1'] },
  hole2:     { names: ['HoleQty2'] },
  hole3:     { names: ['HoleQty3'] },
};

/** "Thickness_x0028_mm_x0029_" → "thickness(mm)" → "thicknessmm" */
export const norm = s => String(s || '')
  .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * columns: Graph's [{ name, displayName }]. Returns { logical: internalName } or throws
 * an Error listing every required column it could not find.
 */
export function resolveColumns(columns, wanted, listName) {
  const out = {}, missing = [];
  for (const [key, { names, required }] of Object.entries(wanted)) {
    const want = names.map(norm);
    const hit = want.map(w => columns.find(c => norm(c.name) === w || norm(c.displayName) === w)).find(Boolean);
    if (hit) out[key] = hit.name;
    else if (required) missing.push(names[0]);
  }
  if (missing.length) {
    const e = new Error(`The SharePoint list "${listName}" has no column ${missing.map(m => `"${m}"`).join(', ')}. ` +
      'The board needs it to read quotes. Check the list in Factory Jobs.');
    e.code = 'MISSING_COLUMN';
    throw e;
  }
  return out;
}

/** The lookup column on QuoteLines that points at Quotes ("Quote"). */
export function quoteLookupColumn(columns, quotesListId) {
  const c = columns.find(c => c.lookup && c.lookup.listId && c.lookup.listId.toLowerCase() === quotesListId.toLowerCase());
  if (!c) {
    const e = new Error('QuoteLines has no lookup column pointing at Quotes, so the board cannot tell which lines belong to which quote.');
    e.code = 'MISSING_COLUMN';
    throw e;
  }
  return c.name;
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const choice = v => (v && typeof v === 'object') ? (v.Value ?? v.value ?? '') : (v ?? '');

/** One SharePoint Quotes item → the board's quote. */
export function toQuote(item, col) {
  const f = item.fields || {};
  return {
    spId: Number(item.id),
    quoteNo: String(f[col.quoteNo] ?? ''),
    customer: String(f[col.customer] ?? '').trim(),
    status: String(choice(f[col.status])),
    contactName: String(f[col.contactName] ?? ''),
    contactEmail: String(f[col.contactEmail] ?? ''),
    quoteDate: String(f[col.quoteDate] ?? '').slice(0, 10),
    deliveryDays: num(f[col.deliveryDays]),
    carriage: num(f[col.carriage]),
    sellTotal: col.sellTotal ? num(f[col.sellTotal]) : null,
  };
}

/** One SharePoint QuoteLines item → a quote line. */
export function toLine(item, col) {
  const f = item.fields || {};
  const pick = k => col[k] ? f[col[k]] : undefined;
  return {
    lineNo: num(pick('lineNo')),
    qty: num(pick('qty')),
    sellTotal: num(pick('sellTotal')),
    desc: String(pick('desc') ?? ''),
    thickness: num(pick('thickness')),
    material: String(pick('material') ?? ''),
    process: String(choice(pick('process'))),
    folds: num(pick('folds')),
    weld: num(pick('weld')),
    inserts: num(pick('inserts')),
    paint: pick('paint') === true || pick('paint') === 'Yes',
    plating: num(pick('plating')),
    holes: num(pick('hole1')) + num(pick('hole2')) + num(pick('hole3')),
  };
}
