// Tiny Chrome DevTools driver (no packages): launch headless Chrome, run steps, save screenshots.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function open({ width = 1440, height = 900, scheme = 'light' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'clj-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${dir}`, `--window-size=${width},${height}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 50; i++) { try { list = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });   // always the files as they are now
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  const api = {
    go: async url => { await send('Page.navigate', { url }); await api.sleep(2500); },
    js: async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; },
    shot: async file => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    close: () => { ws.close(); ch.kill(); },
  };
  return api;
}
