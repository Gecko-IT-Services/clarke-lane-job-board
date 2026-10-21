/**
 * Delivery map: Leaflet + OpenStreetMap tiles (no key), postcodes placed with postcodes.io (free UK
 * lookup, no key; only postcodes are sent, never names). One pin per postcode, coloured by the most
 * urgent job there; the popup lists the jobs and the other drops within a few miles, so Levi can see
 * when a second delivery fits the same run. The van shows while the driver's phone is sharing (showVans).
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
 * el: the map's element. items: [{ postcode, kind, html, j }] (html = one line for the popup, already escaped).
 * miles: how near counts as "on the way". Returns the stops (most urgent first) for the list beside the map.
 */
let markers = new Map(), ring;
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
    // The "nearby" ring follows whichever pin is open, and the list beside the map marks the same stop.
    map.on('popupopen', e => { const s = e.popup._source?.stop; if (!s) return;   // the van's popup has no ring
      ring = L.circle([s.lat, s.lng], { radius: s.miles * 1609.34, color: s.colour, weight: 1.5, dashArray: '5 5', fillOpacity: 0.06, interactive: false }).addTo(map); mark(s.key); });
    map.on('popupclose', () => { ring?.remove(); ring = null; mark(''); });
  }
  layer.clearLayers(); markers = new Map();
  for (const s of stops) {
    s.items.sort((a, b) => KINDS[a.kind].rank - KINDS[b.kind].rank || String(a.due).localeCompare(String(b.due)));
    s.kind = s.items[0].kind; s.near = near[s.key];
    const k = KINDS[s.kind];
    const around = s.near.map(n => `<li><button class="btn link" type="button" data-mapstop="${esc(n.key)}">${esc(n.key)}</button> <span class="mi">${n.miles.toFixed(1)} mi</span> ${byPc.get(n.key).items.map(i => i.short).join(', ')}</li>`).join('');
    const m = L.marker([s.lat, s.lng], { title: s.key, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12],
      html: `<span class="mpin" style="--k:${k.colour}">${s.items.length}</span>` }) })
      .bindPopup(`<div class="mpop"><div class="mh"><b>${esc(s.key)}</b><span>${s.items.length} ${s.items.length === 1 ? 'job' : 'jobs'}</span></div><ul class="mj">${s.items.map(i => `<li>${i.html}</li>`).join('')}</ul>
        ${around ? `<div class="near">Within ${miles} miles</div><ul class="mn">${around}</ul>` : `<div class="near">Nothing else within ${miles} miles</div>`}</div>`, { maxWidth: 340, minWidth: 260 })
      .addTo(layer);
    m.stop = { key: s.key, lat: s.lat, lng: s.lng, miles, colour: k.colour };
    markers.set(s.key, m);
  }
  fitAll();
  setTimeout(() => map.invalidateSize(), 50);
  stops.sort((a, b) => KINDS[a.kind].rank - KINDS[b.kind].rank || String(a.items[0].due).localeCompare(String(b.items[0].due)));
  return { stops, missing: items.filter(i => !places.get(i.postcode)) };
}
function mark(key) { document.querySelectorAll('#mapstops [data-mapstop]').forEach(b => b.setAttribute('aria-current', b.dataset.mapstop === key)); }
/** Zoom to one stop and open its popup (from the list beside the map, or a "nearby" link). */
export function focusStop(key) {
  const m = markers.get(key); if (!m) return;
  map.getContainer().scrollIntoView({ block: 'nearest', behavior: 'smooth' });   // phones: the list is under the map
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 11)); m.openPopup();
}
export function fitAll() {
  const all = [...markers.values(), ...vanMarkers.values()];
  if (!map || !all.length) return;
  map.closePopup();
  map.fitBounds(window.L.latLngBounds(all.map(m => m.getLatLng())).pad(0.2), { maxZoom: 12 });
}

/** The van(s): vans are vanStatus() results (core/deliveries.js); iconHtml the van icon. Draws nothing until the map exists. */
let vanLayer, vanMarkers = new Map();
export function showVans(vans, esc, iconHtml) {
  if (!map) return;
  const L = window.L;
  vanLayer ??= L.layerGroup().addTo(map);
  vanLayer.clearLayers(); vanMarkers = new Map();
  for (const v of vans) {
    const m = L.marker([v.lat, v.lng], { title: v.name, zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -16],
      html: `<span class="mvan${v.stale ? ' stale' : ''}">${iconHtml}</span>` }) })
      .bindPopup(`<div class="mpop"><div class="mh"><b>${esc(v.name)}</b><span>${v.stale ? 'last heard ' : ''}${esc(v.ago)}</span></div>
        <div class="note">${v.mph ? `${v.mph} mph` : 'Not moving'}${v.accuracy ? ` · position good to ${v.accuracy} m` : ''}${v.stale ? ' · the phone may be locked or out of signal' : ''}</div></div>`, { maxWidth: 300 })
      .addTo(vanLayer);
    vanMarkers.set(v.name, m);
  }
}
export function focusVan(name) {
  const m = vanMarkers.get(name); if (!m) return;
  map.getContainer().scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 12)); m.openPopup();
}
