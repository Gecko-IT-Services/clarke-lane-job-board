// Help video, step 2: turns the frames from walk.mjs into help/walkthrough.mp4 (H.264, 10 fps, captions burned in)
// with Chrome's own encoder (WebCodecs) and mp4-muxer; no ffmpeg. Run from dev/video with the smoke server on :8080.
// Turns the frames into a captioned video inside headless Chrome (canvas + MediaRecorder). No ffmpeg needed.
import { open } from './cdp.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const frames = JSON.parse(readFileSync('frames.json', 'utf8')).map(x => ({ caption: x.caption, src: 'data:image/jpeg;base64,' + readFileSync(x.f).toString('base64') }));
// With narration (audio/durations.json from the "say" step), each step stays up as long as its voice-over.
const durs = existsSync('audio/durations.json') ? JSON.parse(readFileSync('audio/durations.json', 'utf8')) : null;
const TITLE_S = durs ? Math.max(4, durs[0] + 1) : 4, HOLDS = frames.map((_, k) => durs ? Math.max(6, durs[k + 1] + 1.4) : 7);
const starts = [0, ...HOLDS.map((_, k) => TITLE_S + HOLDS.slice(0, k).reduce((a, h) => a + h, 0))];
writeFileSync('timeline.json', JSON.stringify({ starts: starts.map(t => t + (t ? 0.4 : 0.3)), total: TITLE_S + HOLDS.reduce((a, h) => a + h, 0) }));
const b = await open({ width: 1300, height: 800 });
await b.go('http://localhost:8080/dev/smoke.html');   // same origin as the fonts (Archivo)
await b.js(`window.__frames = ${JSON.stringify(frames)}; window.__holds = ${JSON.stringify(HOLDS)}; window.__title = ${TITLE_S}; return 1;`);
const out = await b.js(`
  await document.fonts.ready; await document.fonts.load('600 56px Archivo'); await document.fonts.load('400 24px Archivo');
  const W = 1280, H = 800, c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  const imgs = await Promise.all(__frames.map(f => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = f.src; })));
  const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs');
  const FPS = 10, target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { throw e; } });
  enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 700000, framerate: FPS });
  const font = (w, s) => \`\${w} \${s}px Archivo, -apple-system, 'Segoe UI', sans-serif\`;
  const wrap = (text, max) => { const words = text.split(' '), lines = []; let l = ''; for (const w of words) { const t = l ? l + ' ' + w : w; if (g.measureText(t).width > max && l) { lines.push(l); l = w; } else l = t; } lines.push(l); return lines; };
  function title(a) {
    g.globalAlpha = 1; g.fillStyle = '#0C0C0E'; g.fillRect(0, 0, W, H); g.globalAlpha = a;
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = font(600, 56); g.fillText('Clarke Lane Job Board', W / 2, 340);
    g.font = font(400, 30); g.fillStyle = '#C8C8CD'; g.fillText('From a sales order to the invoice, step by step', W / 2, 400);
    g.font = font(400, 20); g.fillStyle = '#8C8C93'; g.fillText('Practice data only · ' + __frames.length + ' steps · about ' + Math.round(total / 60 * 2) / 2 + ' minutes', W / 2, 460);
    g.globalAlpha = 1; g.textAlign = 'left';
  }
  function frame(i, a) {
    const im = imgs[i]; g.globalAlpha = a;
    const s = Math.min(W / im.width, (H - 120) / im.height), w = im.width * s, h = im.height * s;
    g.fillStyle = '#0C0C0E'; g.fillRect(0, 0, W, H); g.drawImage(im, (W - w) / 2, 0, w, h);
    g.fillStyle = '#0C0C0E'; g.fillRect(0, H - 120, W, 120);
    g.fillStyle = '#fff'; g.font = font(600, 22); g.fillText((i + 1) + ' / ' + imgs.length, 28, H - 76);
    g.font = font(400, 24); g.fillStyle = '#EDEDEF';
    wrap(__frames[i].caption, W - 170).slice(0, 3).forEach((l, k) => g.fillText(l, 120, H - 82 + k * 30));
    g.fillStyle = '#3A3A40'; g.fillRect(0, H - 4, W, 4); g.fillStyle = '#fff'; g.fillRect(0, H - 4, W * (i + 1) / imgs.length, 4);
    g.globalAlpha = 1;
  }
  const FADE = 0.5, TITLE = __title, ends = __holds.map((_, k) => TITLE + __holds.slice(0, k + 1).reduce((a, h) => a + h, 0));   // seconds
  const total = ends[ends.length - 1], n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    if (t < TITLE) title(Math.min(1, t / FADE));
    else { const k = Math.min(imgs.length - 1, ends.findIndex(e => t < e)), into = t - (k ? ends[k - 1] : TITLE);
      if (into < FADE && k > 0) { frame(k - 1, 1); frame(k, into / FADE); } else if (into < FADE) { title(1); frame(k, into / FADE); } else frame(k, 1); }
    const px = g.getImageData(0, 0, W, H).data;
    if (f === 400) { let s0 = 0; for (let k = 0; k < px.length; k += 4 * 97) s0 += px[k]; window.__dbg = 'canvas avg at 40s ' + Math.round(s0 / (px.length / (4 * 97))) + ', imgs ' + imgs.map(i => i.width).join(','); }   // pixels, not the canvas: headless Chrome hands the encoder a blank canvas
    const vf = new VideoFrame(px, { format: 'RGBA', codedWidth: W, codedHeight: H, timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: f % (FPS * 5) === 0 }); vf.close();
    if (enc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 5));
  }
  await enc.flush(); muxer.finalize();
  const buf = new Uint8Array(target.buffer); let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
  const type = 'video/mp4';
  return { type, b64: btoa(bin) };`);
writeFileSync('walkthrough.mp4', Buffer.from(out.b64, 'base64'));
console.log(out.type, Math.round(out.b64.length * 0.75 / 1024) + ' KB');
b.close();
