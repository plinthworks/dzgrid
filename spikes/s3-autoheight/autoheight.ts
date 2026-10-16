/**
 * S3: a virtualised list whose rows take their height from wrapped content.
 * Heights start as estimates, are measured when a row first appears, and the
 * scroll position is corrected through an anchor row so that what is on screen
 * does not move when estimates are replaced by measurements.
 *
 * Modes:
 *  - `read`:  measure in the same rAF that mounts the rows (one batched read after all writes);
 *  - `ro`:    measure with a ResizeObserver (after layout, before paint);
 *  - `naive`: measure like `read`, but never correct scrollTop (baseline that shows the jump).
 */
export type Mode = 'read' | 'ro' | 'naive';

/** Fenwick tree over row heights: offset of a row and row at an offset in O(log n). */
export class PrefixSums {
  readonly n: number;
  private readonly t: Float64Array;
  private top = 1;
  total = 0;
  constructor(sizes: Float64Array) {
    this.n = sizes.length;
    this.t = new Float64Array(this.n + 1);
    for (let i = 0; i < this.n; i++) {
      this.t[i + 1]! += sizes[i]!;
      const j = i + 1 + ((i + 1) & -(i + 1));
      if (j <= this.n) this.t[j]! += this.t[i + 1]!;
      this.total += sizes[i]!;
    }
    while (this.top * 2 <= this.n) this.top *= 2;
  }
  add(i: number, d: number) { this.total += d; for (let k = i + 1; k <= this.n; k += k & -k) this.t[k]! += d; }
  /** Sum of sizes [0, i). */
  offsetOf(i: number) { let s = 0; for (let k = i; k > 0; k -= k & -k) s += this.t[k]!; return s; }
  /** Largest i with offsetOf(i) <= offset, clamped to [0, n-1]. */
  indexAt(offset: number) {
    if (offset <= 0) return 0;
    let pos = 0, rem = offset;
    for (let step = this.top; step > 0; step >>= 1) {
      const nx = pos + step;
      if (nx <= this.n && this.t[nx]! <= rem) { pos = nx; rem -= this.t[nx]!; }
    }
    return Math.min(pos, this.n - 1);
  }
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['patient', 'consultation', 'ordonnance', 'مراجعة', 'المريض', 'tension', 'HbA1c', 'سكري', 'radiologie',
  'الجناح', 'B-12', 'urgence', 'تحليل', 'CBC', 'suivi', 'العيادة', 'allergie', 'pénicilline', 'ضغط الدم', 'ID-4521', 'note'];

/** Row text from the row index alone (seeded), so any row can be rebuilt without storing it. */
export function rowText(i: number, seed: number): string {
  const r = mulberry32(seed ^ Math.imul(i + 1, 0x9e3779b1));
  // skewed: most rows short, some very long (1..~80 words)
  const n = 1 + Math.floor(Math.pow(r(), 2.2) * 80);
  let s = `#${i} `;
  for (let k = 0; k < n; k++) s += WORDS[Math.floor(r() * WORDS.length)] + ' ';
  return s;
}

export const CSS = `
.al { --al-line:#d0d7de; font: 14px/20px system-ui, "Geeza Pro", sans-serif; color:#1b1f24; background:#fff; }
.al-viewport { position: relative; overflow-y: auto; overflow-x: hidden; block-size: 600px; inline-size: 420px;
  border: 1px solid var(--al-line); overflow-anchor: none; contain: strict; }
.al-spacer { inline-size: 1px; }
.al-row { position: absolute; inset-block-start: 0; inset-inline: 0; box-sizing: border-box; padding: 4px 8px;
  border-block-end: 1px solid var(--al-line); overflow-wrap: anywhere; unicode-bidi: plaintext; contain: layout paint; }
.al-row:nth-child(even) { background: #f6f8fa; }
`;

export interface Options { count: number; mode: Mode; estimate: number; overscan: number; seed: number; place?: 'transform' | 'inset' }

export class AutoList {
  readonly viewport: HTMLDivElement;
  readonly spacer: HTMLDivElement;
  readonly heights: Float64Array;
  readonly measured: Uint8Array;
  readonly sums: PrefixSums;
  readonly mounted = new Map<number, HTMLDivElement>();
  private pool: HTMLDivElement[] = [];
  private ro: ResizeObserver | null = null;
  private dirty = false;
  /** Sum of the scrollTop changes this list made itself (what the user did not do). */
  corrections = 0;
  correctionsCount = 0;
  syncMs: number[] = [];
  measuredCount = 0;
  roLoopErrors = 0;

  constructor(host: HTMLElement, readonly o: Options) {
    this.viewport = document.createElement('div');
    this.viewport.className = 'al-viewport';
    this.spacer = document.createElement('div');
    this.spacer.className = 'al-spacer';
    this.viewport.append(this.spacer);
    host.append(this.viewport);
    this.heights = new Float64Array(o.count).fill(o.estimate);
    this.measured = new Uint8Array(o.count);
    this.sums = new PrefixSums(this.heights);
    this.spacer.style.blockSize = `${this.sums.total}px`;
    if (o.mode === 'ro') this.ro = new ResizeObserver((es) => this.onResize(es));
    this.viewport.addEventListener('scroll', () => this.schedule(), { passive: true });
    this.sync();
  }

  schedule() {
    if (this.dirty) return;
    this.dirty = true;
    requestAnimationFrame(() => { this.dirty = false; this.sync(); });
  }

  /** Anchor: the first row on screen that was already measured (it has been painted at its true size). */
  private anchor(): { i: number; delta: number } {
    const st = this.viewport.scrollTop, end = st + this.viewport.clientHeight;
    // at the very end, the end is the anchor: the last row stays at the bottom while rows above get measured
    if (st > 0 && end >= this.sums.total - 1) return { i: -1, delta: 0 };
    for (let i = this.sums.indexAt(st); i < this.o.count; i++) {
      const top = this.sums.offsetOf(i);
      if (top >= end) break;
      if (this.measured[i] && this.mounted.has(i)) return { i, delta: st - top };
    }
    const i = this.sums.indexAt(st);
    return { i, delta: st - this.sums.offsetOf(i) };
  }

  private setHeight(i: number, h: number): boolean {
    this.measured[i] || this.measuredCount++;
    this.measured[i] = 1;
    const d = h - this.heights[i]!;
    if (Math.abs(d) < 0.01) return false;
    this.heights[i] = h;
    this.sums.add(i, d);
    return true;
  }

  private correct(a: { i: number; delta: number }) {
    this.spacer.style.blockSize = `${this.sums.total}px`;
    if (this.o.mode === 'naive') return;
    const st = this.viewport.scrollTop;
    const target = a.i < 0 ? this.sums.total - this.viewport.clientHeight : this.sums.offsetOf(a.i) + a.delta;
    if (Math.abs(target - st) < 0.5) return;
    this.viewport.scrollTop = target;
    const moved = this.viewport.scrollTop - st;
    this.corrections += moved;
    this.correctionsCount++;
  }

  /** Mount the window for the current scrollTop; returns rows mounted now. */
  private mountWindow(): HTMLDivElement[] {
    const st = this.viewport.scrollTop, vh = this.viewport.clientHeight;
    const first = Math.max(0, this.sums.indexAt(st) - this.o.overscan);
    const last = Math.min(this.o.count - 1, this.sums.indexAt(st + vh) + this.o.overscan);
    for (const [i, el] of this.mounted) {
      if (i < first || i > last) { this.mounted.delete(i); this.ro?.unobserve(el); el.remove(); this.pool.push(el); }
    }
    const fresh: HTMLDivElement[] = [];
    for (let i = first; i <= last; i++) {
      if (this.mounted.has(i)) continue;
      const el = this.pool.pop() ?? document.createElement('div');
      el.className = 'al-row';
      el.dataset.i = String(i);
      el.textContent = rowText(i, this.o.seed);
      this.viewport.append(el);
      this.mounted.set(i, el);
      this.ro?.observe(el);
      fresh.push(el);
    }
    return fresh;
  }

  private place() {
    if (this.o.place === 'inset') for (const [i, el] of this.mounted) el.style.insetBlockStart = `${this.sums.offsetOf(i)}px`;
    else for (const [i, el] of this.mounted) el.style.transform = `translateY(${this.sums.offsetOf(i)}px)`;
  }

  sync() {
    const t0 = performance.now();
    for (let pass = 0; pass < 6; pass++) {
      const a = this.anchor();
      const fresh = this.mountWindow();
      this.place();
      if (this.o.mode === 'ro') break; // the observer measures after layout
      // batched read: one layout for all fresh rows
      let changed = false;
      const hs = fresh.map((el) => el.getBoundingClientRect().height);
      fresh.forEach((el, k) => { if (this.setHeight(Number(el.dataset.i), hs[k]!)) changed = true; });
      if (!changed) break;
      this.correct(a);
      this.place();
    }
    this.syncMs.push(performance.now() - t0);
  }

  private onResize(entries: ResizeObserverEntry[]) {
    const t0 = performance.now();
    const a = this.anchor();
    let changed = false;
    for (const e of entries) {
      const el = e.target as HTMLDivElement;
      if (!el.isConnected) continue;
      const h = e.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
      if (this.setHeight(Number(el.dataset.i), h)) changed = true;
    }
    if (changed) {
      this.correct(a);
      this.place();
      // the window may need more rows now; they are observed now and measured next frame
      const fresh = this.mountWindow();
      if (fresh.length) this.place();
    }
    this.syncMs.push(performance.now() - t0);
  }

  destroy() { this.ro?.disconnect(); this.viewport.remove(); }
}
