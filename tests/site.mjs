import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// — The stale-module guard in index.html lists every module the site loads. —
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const listed = JSON.parse(html.match(/var MODULES = (\[[^\]]*\])/)[1].replace(/'/g, '"')).sort();
const dir = d => readdirSync(new URL(`../${d}/`, import.meta.url)).filter(f => f.endsWith('.js')).map(f => `${d}/${f}`);
assert.deepEqual(listed, [...dir('src'), ...dir('src/core')].sort(), 'index.html MODULES matches the files in src/');
console.log('site: ok');
