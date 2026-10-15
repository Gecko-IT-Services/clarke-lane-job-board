/**
 * Delivery map: Leaflet + OpenStreetMap tiles (no key), postcodes placed with postcodes.io (free UK
 * lookup, no key; only postcodes are sent, never names). One pin per postcode, coloured by the most
 * urgent job there; the popup lists the jobs and the other drops within a few miles, so Levi can see
 * when a second delivery fits the same run. The live van position is not here yet (no tracker).
 */
import { nearbyStops } from './core/geo.js';

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
let ready, map, layer;
function loadLeaflet() {
  ready ??= new Promise((ok, no) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = LEAFLET + 'leaflet.min.js'; js.onload = ok;
    js.onerror = () => { ready = null; no(new Error('Could not load the map. Check the internet connection and try again.')); };
    document.head.append(js);
  });
  return ready;
}

const CACHE_KEY = 'clj.postcodes';
let cache;
function cached() {
  if (cache) return cache;
  try { cache = new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'))); } catch { cache = new Map(); }
  return cache;
}
/** postcode → { lat, lng } | null (not found). Looked up 100 at a time and remembered on this computer. */
export async function placePostcodes(postcodes) {
  const c = cached(), want = [...new Set(postcodes)].filter(p => p && !c.has(p));
  for (let i = 0; i < want.length; i += 100) {
    const res = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: want.slice(i, i + 100) }) }).catch(() => null);
    if (!res || !res.ok) throw new Error('Could not look up the postcodes. Check the internet connection and try again.');
    for (const r of (await res.json()).result || []) c.set(r.query, r.result ? { lat: r.result.latitude, lng: r.result.longitude } : null);
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(c))); } catch { /* looked up again next time */ }
  return c;
}

export const KINDS = {
  late: { label: 'Running late', colour: '#B4321F', rank: 0 },
  out: { label: 'Out for delivery', colour: '#2557A7', rank: 1 },
  ready: { label: 'Ready to dispatch', colour: '#25744A', rank: 2 },
  soon: { label: 'Due in the next 7 days', colour: '#B45309', rank: 3 },
  later: { label: 'Later', colour: '#64646A', rank: 4 },
};

/**
 * el: the map's element. items: [{ postcode, kind, html }] (html = one line for the popup, already escaped).
 * miles: how near counts as "on the way".
 */
export async function drawMap(el, items, miles, esc) {
  await loadLeaflet();
  const L = window.L;
  const places = await placePostcodes(items.map(i => i.postcode));
  const byPc = new Map();
  for (const it of items) { const p = places.get(it.postcode); if (!p) continue; (byPc.get(it.postcode) || byPc.set(it.postcode, { key: it.postcode, ...p, items: [] }).get(it.postcode)).items.push(it); }
  const stops = [...byPc.values()];
  const near = nearbyStops(stops, miles);
  if (!map || map.getContainer() !== el) {
    map = L.map(el, { scrollWheelZoom: false }).setView([50.92, -1.40], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  layer.clearLayers();
  for (const s of stops) {
    const top = s.items.slice().sort((a, b) => KINDS[a.kind].rank - KINDS[b.kind].rank)[0];
    const k = KINDS[top.kind];
    const around = near[s.key].map(n => `<li>${esc(n.key)} · ${n.miles.toFixed(1)} mi: ${byPc.get(n.key).items.map(i => i.short).join(', ')}</li>`).join('');
    L.circleMarker([s.lat, s.lng], { radius: 8 + Math.min(6, s.items.length * 2), color: '#fff', weight: 2, fillColor: k.colour, fillOpacity: 0.95 })
      .bindPopup(`<div class="mpop"><b>${esc(s.key)}</b><ul>${s.items.map(i => `<li>${i.html}</li>`).join('')}</ul>
        ${around ? `<div class="near">Within ${miles} miles:</div><ul>${around}</ul>` : `<div class="near">Nothing else within ${miles} miles.</div>`}</div>`, { maxWidth: 320 })
      .addTo(layer);
  }
  if (stops.length) map.fitBounds(L.latLngBounds(stops.map(s => [s.lat, s.lng])).pad(0.2), { maxZoom: 12 });
  setTimeout(() => map.invalidateSize(), 50);
  return { placed: new Set(byPc.keys()), missing: items.filter(i => !places.get(i.postcode)) };
}
