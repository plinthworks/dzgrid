import { AutoList, CSS, type Mode } from './autoheight.ts';

const style = document.createElement('style');
style.textContent = CSS;
document.head.append(style);
const host = document.getElementById('host')!;
host.className = 'al';

let roLoopErrors = 0;
window.addEventListener('error', (e) => { if (String(e.message).includes('ResizeObserver')) { roLoopErrors++; e.preventDefault(); } });

const raf = () => new Promise<number>((r) => requestAnimationFrame(r));

interface Sample { st: number; corr: number; tops: Map<number, number>; blank: number }

function sample(list: AutoList): Sample {
  const v = list.viewport, vr = v.getBoundingClientRect();
  const top = vr.top + v.clientTop, bottom = top + v.clientHeight;
  const tops = new Map<number, number>();
  const spans: [number, number][] = [];
  for (const [i, el] of list.mounted) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top && r.top < bottom) { tops.set(i, r.top); spans.push([Math.max(r.top, top), Math.min(r.bottom, bottom)]); }
  }
  // uncovered height inside the viewport (blank area), from the painted rows
  spans.sort((a, b) => a[0] - b[0]);
  let covered = 0, cur = top;
  for (const [a, b] of spans) { if (b > cur) { covered += b - Math.max(a, cur); cur = b; } }
  return { st: v.scrollTop, corr: list.corrections, tops, blank: Math.max(0, v.clientHeight - covered) };
}

/**
 * Drives the scroll from rAF, one step per frame, and compares consecutive
 * samples (taken at the start of a frame = what the previous frame painted).
 * Visible jump of a row = its screen displacement + the user's scroll in between,
 * where the user's scroll = change of scrollTop minus the list's own corrections.
 */
async function drive(list: AutoList, steps: number[]) {
  const jumps: number[] = [], anchorJumps: number[] = [], blanks: number[] = [];
  let prev = sample(list);
  for (let k = 0; k <= steps.length; k++) {
    await raf();
    const s = sample(list);
    const user = (s.st - prev.st) - (s.corr - prev.corr);
    let worst = 0;
    for (const [i, t] of s.tops) {
      const p = prev.tops.get(i);
      if (p === undefined) continue;
      worst = Math.max(worst, Math.abs(t - p + user));
    }
    // anchor = the row at the middle of the viewport in the previous frame
    const vr = list.viewport.getBoundingClientRect(), mid = vr.top + list.viewport.clientHeight / 2;
    let mi = -1, md = Infinity;
    for (const [i, t] of prev.tops) { const d = Math.abs(t - mid); if (d < md && s.tops.has(i)) { md = d; mi = i; } }
    if (mi >= 0) anchorJumps.push(Math.abs(s.tops.get(mi)! - prev.tops.get(mi)! + user));
    jumps.push(worst);
    blanks.push(s.blank);
    prev = s;
    if (k < steps.length) list.viewport.scrollTop += steps[k]!; // the "user"
  }
  const sorted = [...jumps].sort((a, b) => a - b);
  return {
    frames: jumps.length,
    maxJump: +Math.max(...jumps).toFixed(2),
    p99Jump: +sorted[Math.floor(sorted.length * 0.99)]!.toFixed(2),
    framesOver0_5px: jumps.filter((j) => j > 0.5).length,
    maxAnchorJump: +Math.max(0, ...anchorJumps).toFixed(2),
    framesWithBlank: blanks.filter((b) => b > 0.5).length,
    maxBlankPx: +Math.max(...blanks).toFixed(1),
  };
}

const rep = (n: number, d: number) => Array.from({ length: n }, () => d);

async function settle(list: AutoList, frames = 4) { for (let i = 0; i < frames; i++) await raf(); void list; }

async function run(cfg: { count: number; mode: Mode; estimate?: number; seed?: number; place?: 'transform' | 'inset' }) {
  roLoopErrors = 0;
  const make = () => new AutoList(host, { count: cfg.count, mode: cfg.mode, estimate: cfg.estimate ?? 48, overscan: 4, seed: cfg.seed ?? 42, place: cfg.place ?? 'transform' });
  let list = make();
  await settle(list);
  let v = list.viewport;
  const out: Record<string, unknown> = { count: cfg.count, mode: cfg.mode, place: cfg.place ?? 'transform', estimate: cfg.estimate ?? 48, initialTotal: list.sums.total };

  // 1. down from the top: slow then fast
  v.scrollTop = 0; await settle(list);
  out.downFromTop = await drive(list, [...rep(120, 40), ...rep(40, 400)]);
  // 2. jump to the middle (nothing measured around), then up: slow then fast
  v.scrollTop = list.sums.total / 2; await settle(list);
  out.upFromMiddle = await drive(list, [...rep(120, -40), ...rep(40, -400)]);
  // 3. jump to the end, then up
  v.scrollTop = 1e9; await settle(list);
  const last = list.mounted.get(cfg.count - 1)?.getBoundingClientRect();
  const vr = v.getBoundingClientRect();
  out.endReached = last ? +((vr.top + v.clientTop + v.clientHeight) - last.bottom).toFixed(2) : 'last row not mounted';
  out.upFromEnd = await drive(list, rep(100, -120));
  // 4. jump near the top (row 300, unmeasured), then scroll up past scrollTop 0: row 0 must sit at the top
  // (a fresh list: the first scenario measured the top rows already)
  const keep = { syncMs: list.syncMs, corr: list.corrections, n: list.correctionsCount };
  list.destroy(); list = make(); await settle(list);
  list.syncMs.unshift(...keep.syncMs); list.corrections += keep.corr; list.correctionsCount += keep.n;
  v = list.viewport;
  v.scrollTop = list.sums.offsetOf(300); await settle(list);
  out.upToTop = await drive(list, rep(400, -100));
  await settle(list);
  const r0 = list.mounted.get(0)?.getBoundingClientRect();
  out.topReached = { scrollTop: v.scrollTop, row0Offset: r0 ? +(r0.top - (vr.top + v.clientTop)).toFixed(2) : 'row 0 not mounted' };

  const ms = [...list.syncMs].sort((a, b) => a - b);
  out.syncMs = { n: ms.length, median: +ms[Math.floor(ms.length / 2)]!.toFixed(3), p95: +ms[Math.floor(ms.length * 0.95)]!.toFixed(3), max: +ms[ms.length - 1]!.toFixed(3) };
  out.corrections = { count: list.correctionsCount, sumPx: +list.corrections.toFixed(1) };
  let sumH = 0, n = 0, minH = Infinity, maxH = 0;
  for (let i = 0; i < cfg.count; i++) if (list.measured[i]) { const h = list.heights[i]!; sumH += h; n++; minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
  out.measured = { rows: n, meanHeight: +(sumH / n).toFixed(1), minH, maxH, finalTotal: +list.sums.total.toFixed(0) };
  out.roLoopErrors = roLoopErrors;
  list.destroy();
  return out;
}

(window as any).spike = { run };
(window as any).ready = true;
