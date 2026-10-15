/**
 * The sign-in page's moving dot grid, after the hero on clarke-lane.co.uk (one sine phase across the
 * grid, so every dot rises and fades in step). Stops when the page is hidden, and stays still for
 * anyone who has asked their computer for reduced motion.
 */
const GAP = 22, R = 1.4, AMP = 5;
let stopWave = null;

export function startWave(host) {
  if (stopWave) return;
  const cv = document.createElement('canvas');
  cv.className = 'gate-wave'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, cols = 0, rows = 0, raf = null, rt;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = host.clientWidth; h = host.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / GAP) + 2; rows = Math.ceil(h / GAP) + 2;
  }
  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = i * GAP, y = j * GAP, wave = Math.sin(x * 0.013 + y * 0.007 - t * 0.0014), a = 0.17 + wave * 0.13;
      if (a < 0.03) continue;
      ctx.beginPath(); ctx.arc(x, y + wave * AMP, R, 0, 6.2832);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.fill();
    }
  }
  const frame = t => { draw(t); raf = requestAnimationFrame(frame); };
  const start = () => { if (!raf && !reduce && !document.hidden) raf = requestAnimationFrame(frame); };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };
  const onVis = () => (document.hidden ? stop() : start());
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { size(); draw(performance.now()); }, 150); };

  size(); draw(0); start();
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize);
  stopWave = () => { stop(); document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', onResize); cv.remove(); stopWave = null; };
}
export function endWave() { stopWave?.(); }
