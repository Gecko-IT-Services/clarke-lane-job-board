import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// — Every table the migrations leave in place has RLS on and a policy. The site
//   is public and its key is public: a table without RLS is readable by anyone. —
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const sql = files.map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n').toLowerCase();

// — One version number per migration. The version is the 14-digit prefix; Supabase records only that, so
//   two files sharing one are one migration to it: the second never runs, and the push can fail on the
//   first (21 Oct: 20261021160000 was both customer_folders and anon_rpc, and the anon fix did not go live). —
const versions = files.map(f => f.slice(0, 14));
assert.ok(versions.every(v => /^\d{14}$/.test(v)), 'every migration starts with a 14-digit version');
assert.deepEqual(versions.filter((v, i) => versions.indexOf(v) !== i), [], 'no two migrations share a version');
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

// — The role helpers are never NULL: "if not is_office()" must raise for a caller who is not on
//   the staff list, and anon can execute nothing (see 20261022170000_anon_rpc.sql). —
const last = (name) => [...sql.matchAll(new RegExp(`create(?: or replace)? function public\\.${name}\\(\\)[^$]*\\$\\$([^$]*)\\$\\$`, 'g'))].at(-1)[1];
for (const h of ['is_staff', 'is_office', 'is_md', 'is_accounts']) assert.match(last(h), /coalesce\(.*, false\)/, `${h}() is never null`);
assert.ok(sql.includes('revoke execute on all functions in schema public from anon'), 'anon can call no function');
assert.ok(sql.includes('alter default privileges for role postgres in schema public revoke execute on functions from anon'), 'new functions are not granted to anon');
// Every "if not X()" guard uses a helper that is never null.
for (const m of sql.matchAll(/if not public\.(\w+)\(\)/g)) assert.ok(['is_staff', 'is_office', 'is_md', 'is_accounts'].includes(m[1]), `guard ${m[1]} is a known helper`);

// — The browser writes four tables directly; it may touch only the columns the board actually sets.
//   Everything else goes through the definer functions (see 20261022180000_delete_and_column_grants.sql). —
for (const [t, cols] of [['jobs', 'status, status_note, contact_email'], ['despatches', 'xero_invoice_no, sent_to_xero_at'],
  ['job_processes', 'done_by, done_at'], ['outwork', 'supplier, items, finish, sent_on, due_back, note, back_on, back_by']]) {
  assert.ok(sql.includes(`revoke update on public.${t} from authenticated`), `${t}: whole-row update revoked`);
  assert.ok(sql.includes(`grant update (${cols}) on public.${t} to authenticated`), `${t}: only ${cols}`);
}
assert.match(sql, /create policy jobs_office_delete on public\.jobs\s+for delete to authenticated using \(public\.is_office\(\) and public\.job_can_delete\(id\)\)/, 'a job with paperwork is never deleted');

// — The accountant (23 Oct) reads; he is not staff, so he can change nothing staff can. —
assert.match(last('is_staff'), /in \('md', 'office', 'floor'\)/, 'is_staff() leaves accounts out');
for (const t of ['jobs', 'job_lines', 'job_line_prices', 'despatches', 'despatch_lines', 'outwork', 'debt_chases'])
  assert.ok(sql.includes(`create policy ${t}_accounts_read on public.${t} for select to authenticated using (public.is_accounts())`), `${t}: accounts may read`);
assert.deepEqual([...sql.matchAll(/create policy (\w+) on public\.\w+ for (insert|update|delete|all)[^;]*is_accounts/g)].map(m => m[1]), ['debt_chases_accounts_add'],
  'accounts writes nothing but a chase note (24 Oct)');

// — Levi's nine processes, exactly. —
const procs = sql.match(/process\s+text not null check \(process in \(([^)]*)\)\)/)[1]
  .split(',').map(s => s.trim().replace(/'/g, ''));
assert.deepEqual(procs, ['laser', 'fold', 'roll drill', 'tap', 'insert', 'c/sink', 'weld',
  'p/coat paint', 'plating / anodising']);

console.log('supabase-migration: ok');
