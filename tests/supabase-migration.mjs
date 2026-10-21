import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// — Every table the migrations leave in place has RLS on and a policy. The site
//   is public and its key is public: a table without RLS is readable by anyone. —
const dir = new URL('../supabase/migrations/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n').toLowerCase();
const created = [...sql.matchAll(/create table (?:if not exists )?(public\.\w+)/g)].map(m => m[1]);
const dropped = new Set([...sql.matchAll(/drop table (public\.\w+)/g)].map(m => m[1]));
const live = created.filter(t => !dropped.has(t));
assert.ok(live.includes('public.staff'), 'staff table exists');
for (const t of live) {
  assert.ok(sql.includes(`alter table ${t} enable row level security`), `${t} has RLS on`);
  assert.ok(new RegExp(`create policy \\w+ on ${t.replace('.', '\\.')}`).test(sql), `${t} has a policy`);
}

// — Prices are readable by the office only, never by the shop floor. —
assert.match(sql, /create policy \w+ on public\.job_line_prices\s+for select to authenticated using \(public\.is_office\(\)\)/);
assert.ok(!/job_lines \([^;]*price/.test(sql), 'job_lines carries no price column');

// — Levi's nine processes, exactly. —
const procs = sql.match(/process\s+text not null check \(process in \(([^)]*)\)\)/)[1]
  .split(',').map(s => s.trim().replace(/'/g, ''));
assert.deepEqual(procs, ['laser', 'fold', 'roll drill', 'tap', 'insert', 'c/sink', 'weld',
  'p/coat paint', 'plating / anodising']);

console.log('supabase-migration: ok');
