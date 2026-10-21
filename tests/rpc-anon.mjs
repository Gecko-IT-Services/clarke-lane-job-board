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
const dummy = { bigint: 0, integer: 0, text: '', date: '2026-01-01', jsonb: {}, 'bigint[]': [], timestamptz: '2026-01-01T00:00:00Z' };
const fns = [...new Set([...sql.matchAll(/create(?: or replace)? function public\.(\w+)\(([^)]*)\)/g)].map(m => m[1] + '|' + m[2]))]
  .map(s => { const [name, params] = s.split('|'); return { name, params }; })
  .filter(f => f.name !== 'touch_modified_at' && f.name !== 'set_running_order');
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
  return { name: f.name, status: res.status, code: body.code, message: body.message };
};

let results;
try { results = await Promise.all(fns.map(probe)); }
catch (e) { if (!e.offline) throw e; console.log(`rpc-anon: skipped (no network: ${e.cause?.cause?.code || e.cause?.message})`); process.exit(0); }
const open = results.filter(r => r.code !== '42501');
for (const r of open) console.log(`  OPEN to anon: ${r.name} → ${r.status} ${r.code || ''} ${r.message || ''}`);
assert.equal(open.length, 0, `${open.length} of ${results.length} functions answer to the publishable key`);
console.log(`rpc-anon: ok (${results.length} functions refuse anon)`);
