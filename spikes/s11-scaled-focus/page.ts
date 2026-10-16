// S11 — the retained row in scaled mode (> ~125 000 rows), on the real core's mapper.
// Throwaway: one file, rows computed from their index, no row objects.
import { scrollMapper, layerPlacement, MAX_PHYSICAL, REBASE } from '/packages/core/src/index.ts';

const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 1_000_000);
const RETAIN = (q.get('retain') ?? 'image') as 'image' | 'clamped' | 'none';
const SCROLL = (q.get('scroll') ?? 'absolute') as 'absolute' | 'relative';
const INTERCEPT = q.get('intercept') !== '0';
const DIR = q.get('dir') === 'rtl' ? 'rtl' : 'ltr';
document.documentElement.dir = DIR;

const ROW = 32, HEAD = 32, VP_H = 600;
let BODY_VIEW = VP_H - HEAD;  // replaced by the measured client height below
const START = 2, CENTER = 20, END = 1, COLS = START + CENTER + END;
const OVERSCAN = 3;

// ---------- instrumentation ----------
let maxWritten = 0;
const writes: { top: number; maxP: number }[] = [];
const scrolls: { native: boolean; top: number }[] = [];
const events: string[] = [];
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

// ---------- data: key k sits at index k, or N-1-k once reversed ----------
let reversed = false;
const indexOf = (key: number) => (reversed ? N - 1 - key : key);
const keyAt = (i: number) => (reversed ? N - 1 - i : i);

// ---------- DOM ----------
const host = document.getElementById('host')!;
const vp = document.createElement('div');
vp.className = 'vp';
vp.setAttribute('role', 'grid');
vp.setAttribute('aria-label', 'S11');
vp.setAttribute('aria-rowcount', String(N + 1));
vp.setAttribute('aria-colcount', String(COLS));
vp.tabIndex = -1;
vp.dataset.contain = q.get('contain') ?? 'strict';
const head = document.createElement('div');
head.className = 'head';
head.setAttribute('role', 'row');
head.setAttribute('aria-rowindex', '1');
const body = document.createElement('div');
body.className = 'body';
body.setAttribute('role', 'rowgroup');
const layer = document.createElement('div');
layer.className = 'layer';
body.append(layer);
vp.append(head, body);
host.append(vp);

function segments(parent: HTMLElement, make: (c: number) => HTMLElement) {
  const segs = [['start', 0, START], ['center', START, START + CENTER], ['end', START + CENTER, COLS]] as const;
  for (const [name, from, to] of segs) {
    const s = document.createElement('div');
    s.className = `seg ${name}`;
    s.setAttribute('role', 'presentation');
    for (let c = from; c < to; c++) s.append(make(c));
    parent.append(s);
  }
}
segments(head, (c) => {
  const h = document.createElement('div');
  h.className = 'c';
  h.setAttribute('role', 'columnheader');
  h.setAttribute('aria-colindex', String(c + 1));
  h.dataset.col = String(c);
  h.textContent = `Col ${c}`;
  return h;
});

BODY_VIEW = vp.clientHeight - HEAD;
const mapper = scrollMapper(N * ROW, MAX_PHYSICAL, BODY_VIEW);
px(body, 'block-size', mapper.physicalHeight);

interface RowView { el: HTMLElement; key: number; cells: HTMLElement[] }
const mounted = new Map<number, RowView>();
const pool: RowView[] = [];
function makeRow(): RowView {
  const el = document.createElement('div');
  el.className = 'row';
  el.setAttribute('role', 'row');
  const contain = (q.get('contain') ?? 'strict').replace(/\+/g, ' ');
  if (contain !== 'none') el.style.contain = contain;
  const cells: HTMLElement[] = [];
  segments(el, (c) => {
    const d = document.createElement('div');
    d.className = 'c';
    d.setAttribute('role', 'gridcell');
    d.setAttribute('aria-colindex', String(c + 1));
    d.dataset.col = String(c);
    d.tabIndex = -1;
    cells.push(d);
    return d;
  });
  return { el, key: -1, cells };
}
function bind(v: RowView, key: number) {
  v.key = key;
  v.el.dataset.key = String(key);
  for (let c = 0; c < COLS; c++) {
    const cell = v.cells[c]!;
    if (!cell.querySelector('input')) cell.textContent = `r${key} c${c}`;
    cell.tabIndex = focus.key === key && focus.col === c ? 0 : -1;
  }
}

// ---------- state ----------
let logicalTop = 0;
let expected = 0;           // the scrollTop our last write left
let dragging = false;       // pointer on the scrollbar: absolute mapping
let lastIntent = -10;       // frame of the last focusin / grid keydown
let frame = 0;
(function tick() { frame++; requestAnimationFrame(tick); })();
const focus = { key: 0, col: 3 };
let editor: HTMLInputElement | null = null;

function writeTop(physical: number) {
  const p = Math.max(0, Math.min(mapper.maxPhysical, physical));
  writes.push({ top: p, maxP: mapper.maxPhysical });
  vp.scrollTop = p;
  expected = vp.scrollTop;
}

/** Where the retained row goes, relative to the layer, when it is out of the window. */
function retainedTop(off: number, place: { base: number; layerTop: number }): number {
  if (!mapper.scaled) return off - place.base;
  if (RETAIN === 'image') return mapper.toPhysical(off) - place.layerTop;
  return Math.max(-2 * REBASE, Math.min(2 * REBASE, off - place.base));
}

function render() {
  const top = vp.scrollTop;
  const place = layerPlacement(logicalTop, top);
  px(layer, 'inset-block-start', place.layerTop);
  const first = Math.max(0, Math.floor(logicalTop / ROW) - OVERSCAN);
  const last = Math.min(N - 1, Math.ceil((logicalTop + BODY_VIEW) / ROW) + OVERSCAN);
  const want: number[] = [];
  for (let i = first; i <= last; i++) want.push(keyAt(i));
  const fi = indexOf(focus.key);
  const retain = RETAIN !== 'none' && (fi < first || fi > last);
  if (retain) want.push(focus.key);
  want.sort((a, b) => indexOf(a) - indexOf(b));
  const wanted = new Set(want);
  for (const [k, v] of mounted) if (!wanted.has(k)) { v.el.remove(); mounted.delete(k); pool.push(v); }
  const retained = mounted.get(focus.key) ?? null;
  for (const k of want) {
    let v = mounted.get(k);
    if (!v) { v = pool.pop() ?? makeRow(); mounted.set(k, v); }
    bind(v, k);
    const i = indexOf(k);
    v.el.setAttribute('aria-rowindex', String(i + 2));
    px(v.el, 'inset-block-start', k === focus.key && retain ? retainedTop(i * ROW, place) : i * ROW - place.base);
  }
  // Never move the retained row: the others are placed around it, in order.
  let cursor: ChildNode | null = layer.firstChild;
  for (const k of want) {
    const el = mounted.get(k)!.el;
    if (retained && el === retained.el) { cursor = el.isConnected ? el.nextSibling : (layer.insertBefore(el, cursor), el.nextSibling); continue; }
    if (el === cursor) cursor = cursor.nextSibling;
    else layer.insertBefore(el, cursor);
  }
}

function scrollToLogical(l: number) {
  logicalTop = Math.max(0, Math.min(mapper.maxLogical, l));
  writeTop(mapper.toPhysical(logicalTop));
  render();
}
function ensureVisible(key: number) {
  const off = indexOf(key) * ROW;
  if (off < logicalTop) scrollToLogical(off);
  else if (off + ROW > logicalTop + BODY_VIEW) scrollToLogical(off + ROW - BODY_VIEW);
  // Inline: the pinned segments cover the edges of the centre.
  const cell = mounted.get(key)?.cells[focus.col];
  if (cell && focus.col >= START && focus.col < START + CENTER) {
    const r = cell.getBoundingClientRect(), v = vp.getBoundingClientRect();
    const startW = START * 100, endW = END * 100;
    const lo = DIR === 'ltr' ? v.left + startW : v.left + endW;
    const hi = DIR === 'ltr' ? v.right - endW - (vp.offsetWidth - vp.clientWidth) : v.right - startW - (vp.offsetWidth - vp.clientWidth);
    if (r.left < lo) vp.scrollLeft += r.left - lo;
    else if (r.right > hi) vp.scrollLeft += r.right - hi;
  }
}
function cellOf(key: number, col: number) { return mounted.get(key)?.cells[col] ?? null; }
function focusCell(key: number, col: number) {
  const old = cellOf(focus.key, focus.col);
  focus.key = key; focus.col = col;
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
  if (SCROLL === 'relative' && !dragging) {
    logicalTop = Math.max(0, Math.min(mapper.maxLogical, logicalTop + (top - expected)));
    if (top <= 0) logicalTop = 0;
    if (top >= mapper.maxPhysical) logicalTop = mapper.maxLogical;
    writeTop(mapper.toPhysical(logicalTop));
  } else {
    logicalTop = mapper.toLogical(top);
    expected = top;
  }
  render();
  // A native scroll right after focus moved or a key was pressed is the
  // browser bringing the focused element into view, physically: redo it logically.
  if (frame - lastIntent <= 2 && vp.contains(document.activeElement) && document.activeElement !== vp) ensureVisible(focus.key);
});

vp.addEventListener('wheel', (e) => {
  if (!mapper.scaled || !INTERCEPT) return;
  e.preventDefault();
  vp.scrollLeft += e.deltaX;
  scrollToLogical(logicalTop + e.deltaY);
}, { passive: false });

vp.addEventListener('pointerdown', (e) => {
  const r = vp.getBoundingClientRect();
  dragging = e.clientX > r.left + vp.clientWidth || e.clientY > r.top + vp.clientHeight;
  if (!dragging && !(e.target as HTMLElement).closest('[role=gridcell]')) { e.preventDefault(); focusCell(focus.key, focus.col); }
});
addEventListener('pointerup', () => { dragging = false; });
vp.addEventListener('focusin', () => { lastIntent = frame; });

const PAGE = Math.floor(BODY_VIEW / ROW) - 1;
function move(e: KeyboardEvent): boolean {
  const i = indexOf(focus.key);
  const inline = DIR === 'rtl' ? -1 : 1;
  let ni = i, nc = focus.col;
  switch (e.key) {
    case 'ArrowDown': ni = i + 1; break;
    case 'ArrowUp': ni = i - 1; break;
    case 'ArrowRight': nc += inline; break;
    case 'ArrowLeft': nc -= inline; break;
    case 'PageDown': ni = i + PAGE; break;
    case 'PageUp': ni = i - PAGE; break;
    case 'Home': if (e.ctrlKey) ni = 0; nc = 0; break;
    case 'End': if (e.ctrlKey) ni = N - 1; nc = COLS - 1; break;
    case ' ': ni = i + PAGE; break;   // the grid's choice for Space here: a page, like the page would do
    default: return false;
  }
  ni = Math.max(0, Math.min(N - 1, ni));
  nc = Math.max(0, Math.min(COLS - 1, nc));
  focusCell(keyAt(ni), nc);
  return true;
}
vp.addEventListener('keydown', (e) => {
  lastIntent = frame;
  if (editor && e.target === editor) {
    if (e.key === 'Escape') { stopEdit(); e.preventDefault(); }
    return;
  }
  if (e.key === 'F2' && e.target !== vp) { startEdit(focus.key, focus.col); e.preventDefault(); return; }
  if (e.target === vp && !INTERCEPT) return;
  if (move(e)) e.preventDefault();
});

function startEdit(key: number, col: number) {
  focusCell(key, col);
  const cell = cellOf(key, col)!;
  editor = document.createElement('input');
  editor.setAttribute('aria-label', 'edit');
  cell.textContent = '';
  cell.append(editor);
  editor.focus({ preventScroll: true });
}
function stopEdit() {
  const cell = editor?.parentElement;
  editor?.remove();
  editor = null;
  if (cell) { cell.textContent = `r${focus.key} c${focus.col}`; cell.focus({ preventScroll: true }); }
}

render();

// ---------- probes ----------
(window as any).api = {
  N, mapper: { scaled: mapper.scaled, ratio: mapper.ratio, maxPhysical: mapper.maxPhysical, maxLogical: mapper.maxLogical },
  focusCell: (k: number, c: number) => focusCell(k, c),
  scrollToIndex: (i: number) => scrollToLogical(i * ROW),
  scrollToEnd: () => scrollToLogical(mapper.maxLogical),
  startEdit,
  reverse: () => { reversed = !reversed; render(); },
  setScrollLeft: (x: number) => { vp.scrollLeft = x; },
  reset: () => { events.length = 0; scrolls.length = 0; writes.length = 0; },
  state: () => {
    const a = document.activeElement as HTMLElement;
    const rows = [...layer.children] as HTMLElement[];
    const idx = rows.map((r) => Number(r.getAttribute('aria-rowindex')));
    const cell = cellOf(focus.key, focus.col);
    const r = cell?.getBoundingClientRect(), v = vp.getBoundingClientRect();
    const visible = !!r && r.top >= v.top + vp.clientTop + HEAD - 0.5 && r.bottom <= v.top + vp.clientTop + vp.clientHeight + 0.5;
    return {
      active: describe(a), inEditor: a?.tagName === 'INPUT' && !!editor, value: editor?.value ?? null,
      caret: editor ? [editor.selectionStart, editor.selectionEnd] : null,
      focus: { ...focus }, logicalTop, scrollTop: vp.scrollTop, scrollLeft: vp.scrollLeft,
      retained: rows.filter((el) => { const i = Number(el.getAttribute('aria-rowindex')) - 2; return i * ROW + ROW < logicalTop - OVERSCAN * ROW || i * ROW > logicalTop + BODY_VIEW + OVERSCAN * ROW; }).map((el) => Number(el.dataset.key)),
      orderOk: idx.every((x, i) => i === 0 || x > idx[i - 1]!),
      rowindexOk: rows.every((el) => Number(el.getAttribute('aria-rowindex')) === indexOf(Number(el.dataset.key)) + 2),
      visible, cellTop: r ? r.top - v.top : null,
      maxWritten, overMaxP: writes.filter((w) => w.top > w.maxP + 0.5).length,
      native: scrolls.filter((s) => s.native).length, ours: scrolls.filter((s) => !s.native).length,
      blurs: events.filter((e) => /^(blur|focusout) /.test(e) && !/#(before|after)/.test(e)).length,
      events: events.slice(-20),
    };
  },
};
(window as any).ready = true;
