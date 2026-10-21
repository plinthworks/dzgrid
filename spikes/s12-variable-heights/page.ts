// S12 — variable row heights (open details) under the real core's scaled scroll mapper.
// Throwaway: one file, rows computed from their index, no row objects.
// Displayed rows: N data rows, and after each open master one detail row (D7, D8).
import { scrollMapper, layerPlacement, uniformRowLayout, MAX_PHYSICAL, REBASE } from '/packages/core/src/index.ts';
import type { RowLayout } from '/packages/core/src/index.ts';
import { sparseRowLayout } from './sparse-layout.ts';

const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 1_000_000);
const D = Number(q.get('details') ?? 2000);
const DH = Number(q.get('height') ?? 240);
const INTERCEPT = q.get('intercept') !== '0';
const ANCHOR = q.get('anchor') !== '0'; // anchor=0: the witness that keeps the logical top instead
const ROW = 32, HEAD = 32, COLS = 8, OVERSCAN = 3;

// ---------- the displayed rows ----------
// Masters spread over the whole list, the first and the last row included.
const masters = new Float64Array(D);
for (let j = 0; j < D; j++) masters[j] = D === 1 ? 0 : Math.round((j * (N - 1)) / (D - 1));
const COUNT = N + D;
/** Display index of detail j: right after its master. */
const detAt = Float64Array.from(masters, (m, j) => m + j + 1);
const lowerBound = (a: Float64Array, x: number) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m]! < x) lo = m + 1; else hi = m; } return lo; };
/** Row key at a display index: `d<k>` for data row k, `x<k>` for the detail of master k. */
function keyAt(i: number): string {
  const j = lowerBound(detAt, i); // details before i
  if (j < D && detAt[j] === i) return `x${masters[j]}`;
  return `d${i - j}`;
}
function indexOf(key: string): number {
  const k = Number(key.slice(1));
  const j = lowerBound(masters, k); // masters before k
  return key[0] === 'x' ? k + j + 1 : k + j;
}
const isDetail = (key: string) => key[0] === 'x';

let layout: RowLayout = D === 0
  ? uniformRowLayout({ count: COUNT, index: (i: number) => i } as never, ROW)
  : sparseRowLayout(COUNT, ROW, detAt, new Float64Array(D).fill(DH));

// ---------- instrumentation ----------
let maxWritten = 0;
const scrolls: { native: boolean; top: number }[] = [];
const events: string[] = [];
const renderMs: number[] = [];
const px = (el: HTMLElement, prop: string, v: number) => {
  if (Math.abs(v) > maxWritten) maxWritten = Math.abs(v);
  el.style.setProperty(prop, `${v}px`);
};
const describe = (t: EventTarget | null): string => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return String(t);
  const cell = el.closest?.('[data-col]') as HTMLElement | null;
  const row = el.closest?.('[data-key]') as HTMLElement | null;
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${row ? ` ${row.dataset.key}/${cell?.dataset.col ?? ''}` : el.classList.contains('vp') ? ' vp' : ''}`;
};
for (const type of ['blur', 'focusout', 'focus', 'focusin']) document.addEventListener(type, (e) => events.push(`${type} ${describe(e.target)}`), true);

// ---------- DOM ----------
const host = document.getElementById('host')!;
const vp = document.createElement('div');
vp.className = 'vp';
vp.setAttribute('role', 'treegrid');
vp.setAttribute('aria-label', 'S12');
vp.setAttribute('aria-rowcount', String(COUNT + 1));
vp.setAttribute('aria-colcount', String(COLS));
vp.tabIndex = -1;
const head = document.createElement('div');
head.className = 'head';
head.setAttribute('role', 'row');
head.setAttribute('aria-rowindex', '1');
for (let c = 0; c < COLS; c++) {
  const h = document.createElement('div');
  h.className = 'c';
  h.setAttribute('role', 'columnheader');
  h.textContent = `Col ${c}`;
  head.append(h);
}
const body = document.createElement('div');
body.className = 'body';
body.setAttribute('role', 'rowgroup');
const layer = document.createElement('div');
layer.className = 'layer';
body.append(layer);
vp.append(head, body);
host.append(vp);

const BODY_VIEW = vp.clientHeight - HEAD;
let mapper = scrollMapper(layout.total, MAX_PHYSICAL, BODY_VIEW);
px(body, 'block-size', mapper.physicalHeight);

interface RowView { el: HTMLElement; key: string; cells: HTMLElement[]; detail: boolean }
const mounted = new Map<string, RowView>();
const pools = { data: [] as RowView[], detail: [] as RowView[] };
function makeRow(detail: boolean): RowView {
  const el = document.createElement('div');
  el.className = detail ? 'row detail' : 'row';
  el.setAttribute('role', 'row');
  el.style.contain = 'content';
  const cells: HTMLElement[] = [];
  const n = detail ? 1 : COLS;
  for (let c = 0; c < n; c++) {
    const d = document.createElement('div');
    d.className = detail ? 'dcell' : 'c';
    d.setAttribute('role', 'gridcell');
    if (detail) d.setAttribute('aria-colspan', String(COLS));
    d.dataset.col = String(c);
    d.tabIndex = -1;
    cells.push(d);
    el.append(d);
  }
  return { el, key: '', cells, detail };
}
function bind(v: RowView, key: string, i: number) {
  v.key = key;
  v.el.dataset.key = key;
  v.el.setAttribute('aria-rowindex', String(i + 2));
  px(v.el, 'block-size', layout.heightOf(i as never));
  if (v.detail) v.cells[0]!.textContent = `Detail of row ${key.slice(1)} (${layout.heightOf(i as never)} px)`;
  else for (let c = 0; c < COLS; c++) v.cells[c]!.textContent = `r${key.slice(1)} c${c}`;
  for (let c = 0; c < v.cells.length; c++) v.cells[c]!.tabIndex = focus.key === key && (v.detail || focus.col === c) ? 0 : -1;
}

// ---------- state ----------
let logicalTop = 0;
let expected = 0;
let lastIntent = -10;
let frame = 0;
(function tick() { frame++; requestAnimationFrame(tick); })();
const focus = { key: 'd0', col: 3 };

function writeTop(physical: number) {
  vp.scrollTop = Math.max(0, Math.min(mapper.maxPhysical, physical));
  expected = vp.scrollTop;
}
/** S11 D4: the retained row at its true distance, bounded; the body clips. */
const retainedTop = (off: number, base: number) => Math.max(-2 * REBASE, Math.min(2 * REBASE, off - base));

let win = { first: 0, last: 0 };
function render() {
  const t0 = performance.now();
  const top = vp.scrollTop;
  const place = layerPlacement(logicalTop, top);
  px(layer, 'inset-block-start', place.layerTop);
  const first = Math.max(0, layout.indexAt(logicalTop) - OVERSCAN);
  const last = Math.min(COUNT - 1, layout.indexAt(logicalTop + BODY_VIEW) + OVERSCAN);
  win = { first, last };
  const want: string[] = [];
  for (let i = first; i <= last; i++) want.push(keyAt(i));
  const fi = indexOf(focus.key);
  const retain = fi < first || fi > last;
  if (retain) { want.push(focus.key); want.sort((a, b) => indexOf(a) - indexOf(b)); }
  const wanted = new Set(want);
  for (const [k, v] of mounted) if (!wanted.has(k)) { v.el.remove(); mounted.delete(k); (v.detail ? pools.detail : pools.data).push(v); }
  const retained = mounted.get(focus.key) ?? null;
  for (const k of want) {
    let v = mounted.get(k);
    if (!v) { const det = isDetail(k); v = (det ? pools.detail : pools.data).pop() ?? makeRow(det); mounted.set(k, v); }
    const i = indexOf(k);
    bind(v, k, i);
    const off = layout.offsetOf(i as never);
    px(v.el, 'inset-block-start', k === focus.key && retain ? retainedTop(off, place.base) : off - place.base);
  }
  // Never move the retained row: the others are placed around it, in order.
  let cursor: ChildNode | null = layer.firstChild;
  for (const k of want) {
    const el = mounted.get(k)!.el;
    if (retained && el === retained.el) { cursor = el.isConnected ? el.nextSibling : (layer.insertBefore(el, cursor), el.nextSibling); continue; }
    if (el === cursor) cursor = cursor.nextSibling;
    else layer.insertBefore(el, cursor);
  }
  renderMs.push(performance.now() - t0);
}

function scrollToLogical(l: number) {
  logicalTop = Math.max(0, Math.min(mapper.maxLogical, l));
  writeTop(mapper.toPhysical(logicalTop));
  render();
}
function ensureVisible(key: string) {
  const i = indexOf(key);
  const off = layout.offsetOf(i as never), h = layout.heightOf(i as never);
  if (off < logicalTop) scrollToLogical(off);
  else if (off + h > logicalTop + BODY_VIEW) scrollToLogical(Math.min(off, off + h - BODY_VIEW));
}
function cellOf(key: string, col: number) { const v = mounted.get(key); return v ? v.cells[v.detail ? 0 : col] ?? null : null; }
function focusCell(key: string, col: number) {
  const old = cellOf(focus.key, focus.col);
  focus.key = key; focus.col = col; // the goal column is kept on a detail (MoveShape.whole)
  if (old) old.tabIndex = -1;
  render();
  ensureVisible(key);
  const c = cellOf(key, col)!;
  c.tabIndex = 0;
  c.focus({ preventScroll: true });
}

vp.addEventListener('scroll', () => {
  const top = vp.scrollTop;
  const native = Math.abs(top - expected) > 1;
  scrolls.push({ native, top });
  if (!native) { render(); return; }
  logicalTop = mapper.toLogical(top); // absolute: scrollbar drag, native keys when not intercepted
  expected = top;
  render();
  if (frame - lastIntent <= 2 && vp.contains(document.activeElement) && document.activeElement !== vp) ensureVisible(focus.key);
});

const wheels: { mode: number; dy: number }[] = [];
vp.addEventListener('wheel', (e) => {
  wheels.push({ mode: e.deltaMode, dy: e.deltaY });
  if (!mapper.scaled || !INTERCEPT) return;
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * ROW : e.deltaMode === 2 ? e.deltaY * BODY_VIEW : e.deltaY;
  scrollToLogical(logicalTop + dy);
}, { passive: false });
vp.addEventListener('focusin', () => { lastIntent = frame; });

/** One page: the content moves by the body's height; focus goes to the row now at its old screen place. */
const pageMoves: { from: string; to: string; drift: number }[] = [];
function page(dir: 1 | -1) {
  const i = indexOf(focus.key);
  const screen = layout.offsetOf(i as never) - logicalTop;
  const target = Math.max(0, Math.min(layout.total - 1, layout.offsetOf(i as never) + dir * BODY_VIEW));
  const t = layout.indexAt(target);
  const from = focus.key, to = keyAt(t);
  scrollToLogical(logicalTop + dir * BODY_VIEW);
  focusCell(to, focus.col);
  pageMoves.push({ from, to, drift: (layout.offsetOf(t as never) - logicalTop) - screen });
}
function move(e: KeyboardEvent): boolean {
  const i = indexOf(focus.key);
  let ni = i, nc = focus.col;
  const whole = isDetail(focus.key);
  switch (e.key) {
    case 'ArrowDown': ni = i + 1; break;
    case 'ArrowUp': ni = i - 1; break;
    case 'ArrowRight': if (!whole) nc++; break;
    case 'ArrowLeft': if (!whole) nc--; break;
    case 'PageDown': page(1); return true;
    case 'PageUp': page(-1); return true;
    case 'Home': if (e.ctrlKey || e.metaKey) ni = 0; else nc = 0; break;
    case 'End': if (e.ctrlKey || e.metaKey) ni = COUNT - 1; else nc = COLS - 1; break;
    default: return false;
  }
  ni = Math.max(0, Math.min(COUNT - 1, ni));
  nc = Math.max(0, Math.min(COLS - 1, nc));
  focusCell(keyAt(ni), nc);
  return true;
}
vp.addEventListener('keydown', (e) => {
  lastIntent = frame;
  if (e.target === vp && !INTERCEPT) return;
  if (move(e)) e.preventDefault();
});

/** D7: a detail height change above the viewport keeps the top row where it is (anchorNext). */
function resizeDetail(masterKey: number, height: number) {
  const i = indexOf(`x${masterKey}`);
  const atEnd = logicalTop >= mapper.maxLogical - 0.5;
  const anchor = layout.indexAt(logicalTop);
  const delta = logicalTop - layout.offsetOf(anchor);
  if (!layout.setHeight(i as never, height)) return false;
  mapper = scrollMapper(layout.total, MAX_PHYSICAL, BODY_VIEW);
  px(body, 'block-size', mapper.physicalHeight);
  scrollToLogical(!ANCHOR ? logicalTop : atEnd ? mapper.maxLogical : layout.offsetOf(anchor) + delta);
  return true;
}

render();

// ---------- probes ----------
const vpBox = () => { const v = vp.getBoundingClientRect(); return { top: v.top + vp.clientTop + HEAD, bottom: v.top + vp.clientTop + vp.clientHeight }; };
(window as any).api = {
  N, D, COUNT, ROW, DH, BODY_VIEW, masters: () => Array.from(masters),
  mapper: () => ({ scaled: mapper.scaled, ratio: mapper.ratio, maxPhysical: mapper.maxPhysical, maxLogical: mapper.maxLogical, logicalHeight: mapper.logicalHeight }),
  layout: () => ({ total: layout.total }),
  indexOf, keyAt, offsetOf: (i: number) => layout.offsetOf(i as never), heightOf: (i: number) => layout.heightOf(i as never), indexAt: (o: number) => layout.indexAt(o),
  focusCell, scrollToLogical, resizeDetail,
  scrollToIndex: (i: number) => scrollToLogical(layout.offsetOf(i as never)),
  scrollToEnd: () => scrollToLogical(mapper.maxLogical),
  nativeScrollTop: (p: number) => { vp.scrollTop = p; },
  logicalTop: () => logicalTop,
  reset: () => { events.length = 0; scrolls.length = 0; pageMoves.length = 0; wheels.length = 0; renderMs.length = 0; },
  /** Every mounted row against where the layout says it is: the largest error in px. */
  placement: () => {
    const v = vpBox();
    let err = 0, worst = '';
    for (const [k, r] of mounted) {
      const i = indexOf(k);
      if (i < win.first || i > win.last) continue; // the retained row
      const off = layout.offsetOf(i as never);
      const b = r.el.getBoundingClientRect();
      const e1 = Math.abs(b.top - (v.top + off - logicalTop));
      const e2 = Math.abs(b.height - layout.heightOf(i as never));
      if (Math.max(e1, e2) > err) { err = Math.max(e1, e2); worst = k; }
    }
    return { err, worst };
  },
  /** First row's top error at the top, last row's bottom error at the end (screen px). */
  ends: () => {
    const v = vpBox();
    const firstEl = mounted.get(keyAt(0))?.el, lastEl = mounted.get(keyAt(COUNT - 1))?.el;
    const lastData = mounted.get(`d${N - 1}`)?.el;
    return {
      topErr: firstEl ? firstEl.getBoundingClientRect().top - v.top : null,
      bottomErr: lastEl ? lastEl.getBoundingClientRect().bottom - v.bottom : null,
      lastDataShown: !!lastData && lastData.getBoundingClientRect().top < v.bottom && lastData.getBoundingClientRect().bottom > v.top,
      lastKey: keyAt(COUNT - 1),
    };
  },
  rowTop: (key: string) => { const el = mounted.get(key)?.el; return el ? el.getBoundingClientRect().top - vpBox().top : null; },
  topRow: () => keyAt(layout.indexAt(logicalTop)),
  state: () => {
    const a = document.activeElement as HTMLElement;
    const rows = [...layer.children] as HTMLElement[];
    const idx = rows.map((r) => Number(r.getAttribute('aria-rowindex')));
    const cell = cellOf(focus.key, focus.col);
    const r = cell?.getBoundingClientRect(), v = vpBox();
    return {
      active: describe(a), focus: { ...focus }, logicalTop, scrollTop: vp.scrollTop,
      visible: !!r && r.top >= v.top - 0.5 && r.bottom <= v.bottom + 0.5,
      orderOk: idx.every((x, i) => i === 0 || x > idx[i - 1]!),
      maxWritten, scrollHeight: vp.scrollHeight, scrollTopOk: vp.scrollTop <= mapper.maxPhysical + 1,
      native: scrolls.filter((s) => s.native).length, ours: scrolls.filter((s) => !s.native).length,
      blurs: events.filter((e) => /^(blur|focusout) /.test(e)).length,
      pageMoves: pageMoves.slice(), wheels: wheels.slice(),
      renderMedian: renderMs.length ? [...renderMs].sort((x, y) => x - y)[renderMs.length >> 1] : null,
      win,
      events: events.slice(-10),
    };
  },
  /** The layout against a brute-force oracle (an offset for every row), then after random resizes. */
  oracle: (seed: number) => {
    let s = seed >>> 0;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const hts = new Float64Array(COUNT).fill(ROW);
    for (let j = 0; j < D; j++) hts[detAt[j]!] = layout.heightOf(detAt[j]! as never);
    const L = sparseRowLayout(COUNT, ROW, detAt, Float64Array.from(detAt, (i) => hts[i]!));
    let bad = 0, checked = 0;
    const offs = new Float64Array(COUNT + 1);
    const build = () => { for (let i = 0; i < COUNT; i++) offs[i + 1] = offs[i]! + hts[i]!; };
    const at = (o: number) => { let lo = 0, hi = COUNT; while (lo < hi) { const m = (lo + hi) >>> 1; if (offs[m + 1]! <= o) lo = m + 1; else hi = m; } return Math.min(lo, COUNT - 1); };
    const probe = () => {
      if (L.total !== offs[COUNT]) bad++;
      for (let n = 0; n < 5000; n++) {
        const i = n < 2 * D ? Math.max(0, detAt[n >> 1]! - (n & 1)) : Math.floor(rnd() * COUNT);
        checked += 3;
        if (L.offsetOf(i as never) !== offs[i]) bad++;
        if (L.heightOf(i as never) !== hts[i]) bad++;
        const o = n % 3 === 0 ? offs[i]! : n % 3 === 1 ? offs[i + 1]! - 0.25 : rnd() * offs[COUNT]!;
        if (L.indexAt(o) !== at(o)) bad++;
      }
    };
    build(); probe();
    for (let r = 0; r < 50; r++) {
      const j = Math.floor(rnd() * D);
      const H = 40 + Math.floor(rnd() * 600);
      L.setHeight(detAt[j]! as never, H); hts[detAt[j]!] = H;
      build(); probe();
    }
    return { bad, checked };
  },
  /** Cost of the prototype: build, offsetOf, indexAt and setHeight for D open details over COUNT rows. */
  timing: (d: number) => {
    const cnt = N + d;
    const at = new Float64Array(d);
    for (let j = 0; j < d; j++) at[j] = Math.round((j * (N - 1)) / Math.max(1, d - 1)) + j + 1;
    let t = performance.now();
    const L = sparseRowLayout(cnt, ROW, at, new Float64Array(d).fill(DH));
    const build = performance.now() - t;
    const K = 200_000;
    let sink = 0;
    t = performance.now();
    for (let n = 0; n < K; n++) sink += L.offsetOf(((n * 7919) % cnt) as never);
    const offsetNs = ((performance.now() - t) / K) * 1e6;
    t = performance.now();
    for (let n = 0; n < K; n++) sink += L.indexAt(((n * 7919.5) % L.total));
    const indexNs = ((performance.now() - t) / K) * 1e6;
    const R = d > 20_000 ? 200 : 2000;
    t = performance.now();
    for (let n = 0; n < R; n++) L.setHeight(at[(n * 13) % d]! as never, 200 + (n % 80));
    const setUs = ((performance.now() - t) / R) * 1e3;
    return { details: d, buildMs: +build.toFixed(3), offsetOfNs: +offsetNs.toFixed(1), indexAtNs: +indexNs.toFixed(1), setHeightUs: +setUs.toFixed(2), sink: sink > 0 };
  },
};
(window as any).ready = true;
