import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// — No public function answers to the publishable key alone. The site and its key are public, so
//   every RPC the board has must say "permission denied" (42501) to a caller who has not signed in. —
// Live check against the real project. Skipped when there is no network; fails until the
// 20261022170000_anon_rpc migration has been applied there (merge to main).
const { CONFIG } = await import('../src/config.js');
const dir = new URL('../supabase/migrations/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');

// Every function with a browser-facing signature, and a harmless argument for each. Harmless
// matters only while the hole is open: these arguments fail before any row changes (no such id,
// empty list, no such process). set_running_order is left out because any argument rewrites
// priorities; the static test covers its grant.
const dummy = { bigint: 0, integer: 0, int: 0, smallint: 0, numeric: 0, double: 0, real: 0, boolean: false, text: '', varchar: '', uuid: '00000000-0000-0000-0000-000000000000',
  date: '2026-01-01', jsonb: {}, json: {}, 'bigint[]': [], 'text[]': [], timestamptz: '2026-01-01T00:00:00Z', timestamp: '2026-01-01T00:00:00' };   // 'double precision' parses as 'double'
const fns = [...new Set([...sql.matchAll(/create(?: or replace)? function public\.(\w+)\(([^)]*)\)\s+returns\s+(\w+)/g)].filter(m => m[3] !== 'trigger').map(m => m[1] + '|' + m[2]))]
  .map(s => { const [name, params] = s.split('|'); return { name, params }; })
  .filter(f => f.name !== 'set_running_order');
assert.ok(fns.some(f => f.name === 'amend_job') && fns.some(f => f.name === 'me'), 'found the RPCs');

const probe = async f => {
  const args = {};
  for (const p of f.params.split(',').map(s => s.trim()).filter(Boolean)) {
    const [name, type] = p.split(/\s+/);
    assert.ok(type in dummy, `${f.name}: no dummy for type ${type}`);
    args[name] = dummy[type];
  }
  if (f.name === 'set_station_order') args.p_process = 'no-such-process';
  let res;
  try {
    res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${f.name}`, { method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args) });
  } catch (e) { throw Object.assign(new Error('offline'), { offline: true, cause: e }); }
  const body = (await res.json().catch(() => null)) || {};   // a function returning null is the literal "null"
  // PGRST202: not in the database yet (a migration in the checkout that has not been applied). Nothing to probe.
  return { name: f.name, status: res.status, code: body.code === 'PGRST202' ? '42501' : body.code, message: body.message, missing: body.code === 'PGRST202' };
};

let results;
try { results = await Promise.all(fns.map(probe)); }
catch (e) { if (!e.offline) throw e; console.log(`rpc-anon: skipped (no network: ${e.cause?.cause?.code || e.cause?.message})`); process.exit(0); }
const open = results.filter(r => r.code !== '42501');
for (const r of open) console.log(`  OPEN to anon: ${r.name} → ${r.status} ${r.code || ''} ${r.message || ''}`);
assert.equal(open.length, 0, `${open.length} of ${results.length} functions answer to the publishable key`);
const missing = results.filter(r => r.missing).map(r => r.name);
console.log(`rpc-anon: ok (${results.length - missing.length} functions refuse anon${missing.length ? `; not deployed yet: ${missing.join(', ')}` : ''})`);
