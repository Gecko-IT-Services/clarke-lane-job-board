/**
 * Delivery map helpers: UK postcodes out of free-text addresses, distances, and which deliveries
 * are near each other (so a second drop can go on the same run). Pure: tested in tests/geo.mjs.
 */

/** The last UK postcode in an address ("Unit 4, Example Park\nSouthampton SO15 1AA" → "SO15 1AA"). */
export function postcodeOf(text) {
  const all = [...String(text || '').toUpperCase().matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/g)];
  if (!all.length) return '';
  const m = all[all.length - 1];
  return `${m[1]} ${m[2]}`;
}

/** Straight-line miles between two { lat, lng } points. */
export function milesBetween(a, b) {
  const r = x => (x * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Stops: [{ key, lat, lng, ... }] (one per postcode). For each, the other stops within `miles`,
 * nearest first: { [key]: [{ key, miles }] }.
 */
export function nearbyStops(stops, miles) {
  const out = {};
  for (const a of stops) {
    out[a.key] = stops.filter(b => b !== a).map(b => ({ key: b.key, miles: milesBetween(a, b) }))
      .filter(x => x.miles <= miles).sort((x, y) => x.miles - y.miles);
  }
  return out;
}
