/**
 * S2: one scroll container, sticky header row, sticky pinned segments at
 * inline-start and inline-end, centre cells absolutely placed with
 * `inset-inline-start`. Logical CSS only; physical sides appear only in the
 * measurements (and in dir.ts).
 */
import { type Dir, clientBox, logicalX, maxScrollX, readScrollX, scrollConvention, toPhysicalScrollLeft, writeScrollX } from './dir.ts';

export interface Col { id: string; title: string; width: number; pin?: 'start' | 'end'; numeric?: boolean }

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['أمينة بن علي', 'Karim Haddad', 'يوسف Mansouri', 'Lina بوزيد', 'سارة خليل', 'Omar العربي', 'Nadia Ferhat', 'إلياس Benali'];
const WARDS = ['الجناح B', 'Ward 3 — الطابق 2', 'مستشفى مصطفى باشا', 'CHU Oran', 'العيادة 12A'];
const DX = ['ضغط الدم 140/90 mmHg', 'HbA1c 7.2 %', 'سكري النوع 2', 'Fracture ص 3', 'ID-4521 مراجعة', 'تحليل CBC'];
const STATUS = ['نشط', 'مغلق', 'Pending', 'قيد المراجعة'];

export const ROWS = 60;
export const ROW_H = 32;

export function makeColumns(): Col[] {
  const cols: Col[] = [
    { id: 'n', title: '#', width: 56, pin: 'start', numeric: true },
    { id: 'name', title: 'الاسم / Name', width: 150, pin: 'start' },
  ];
  for (let i = 0; i < 20; i++) cols.push({ id: `c${i}`, title: `عمود ${i} · col ${i}`, width: 120 + (i % 3) * 20, numeric: i % 4 === 3 });
  cols.push({ id: 'status', title: 'الحالة', width: 110, pin: 'end' });
  return cols;
}

function cellText(r: number, c: Col, rnd: () => number): string {
  if (c.id === 'n') return String(r + 1);
  if (c.id === 'name') return NAMES[Math.floor(rnd() * NAMES.length)]!;
  if (c.id === 'status') return STATUS[Math.floor(rnd() * STATUS.length)]!;
  if (c.numeric) return (rnd() * 100000).toFixed(2);
  const k = Number(c.id.slice(1)) % 3;
  if (k === 0) return DX[Math.floor(rnd() * DX.length)]!;
  if (k === 1) return WARDS[Math.floor(rnd() * WARDS.length)]!;
  return `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
}

export const CSS = `
.dzg { --dzg-bg:#fff; --dzg-fg:#1b1f24; --dzg-line:#d0d7de; --dzg-head:#eef1f4; --dzg-pin:#f6f8fa; --dzg-handle:#0969da;
  font: 13px/1.2 system-ui, "Geeza Pro", sans-serif; color: var(--dzg-fg); background: var(--dzg-bg); inline-size: 640px; }
.dzg-viewport { position: relative; overflow: auto; block-size: 320px; border: 1px solid var(--dzg-line); overflow-anchor: none; }
.dzg-header { position: sticky; inset-block-start: 0; z-index: 3; display: flex; block-size: 34px; background: var(--dzg-head); }
.dzg-body { position: relative; }
.dzg-row { position: absolute; inset-block-start: 0; inset-inline-start: 0; display: flex; block-size: ${ROW_H}px; }
.dzg-seg { position: relative; display: flex; flex: none; block-size: 100%; }
.dzg-seg--start { position: sticky; inset-inline-start: 0; z-index: 2; background: var(--dzg-pin); border-inline-end: 2px solid var(--dzg-line); }
.dzg-seg--end { position: sticky; inset-inline-end: 0; z-index: 2; background: var(--dzg-pin); border-inline-start: 2px solid var(--dzg-line); }
.dzg-header .dzg-seg--start, .dzg-header .dzg-seg--end { background: var(--dzg-head); }
.dzg-seg--center { z-index: 1; }
.dzg-cell { box-sizing: border-box; flex: none; block-size: 100%; padding-inline: 6px; display: flex; align-items: center;
  border-block-end: 1px solid var(--dzg-line); border-inline-end: 1px solid var(--dzg-line); overflow: hidden; white-space: nowrap;
  text-align: start; unicode-bidi: isolate; }
.dzg-seg--center > .dzg-cell { position: absolute; inset-block-start: 0; }
.dzg-cell--num { justify-content: flex-end; }
.dzg-cell--num > span { direction: ltr; unicode-bidi: isolate; }
.dzg-hcell { position: relative; font-weight: 600; overflow: visible; }
.dzg-handle { position: absolute; inset-block: 0; inset-inline-end: -5px; inline-size: 10px; z-index: 5; cursor: col-resize; }
.dzg-handle::after { content: ""; position: absolute; inset-block: 6px; inset-inline-start: 4px; inline-size: 2px; background: var(--dzg-handle); }
.dzg-seg--end .dzg-hcell:last-child .dzg-handle { inset-inline-end: auto; inset-inline-start: -5px; }
.dzg-viewport.padded { scroll-padding-block-start: 34px; }
.dzg-sb .dzg-viewport::-webkit-scrollbar { inline-size: 14px; block-size: 14px; width: 14px; height: 14px; background: #e5e5e5; }
.dzg-sb .dzg-viewport::-webkit-scrollbar-thumb { background: #888; }
`;

export class Grid {
  readonly root: HTMLDivElement;
  readonly viewport: HTMLDivElement;
  readonly header: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly cols: Col[];
  dir: Dir;
  private resizeStart: { id: string; x0: number; w0: number; rect: DOMRectReadOnly } | null = null;
  readonly resizeLog: { id: string; dx: number; w: number }[] = [];

  constructor(host: HTMLElement, dir: Dir, seed = 7) {
    this.dir = dir;
    this.cols = makeColumns();
    this.root = document.createElement('div');
    this.root.className = 'dzg';
    this.root.dir = dir;
    this.viewport = document.createElement('div');
    this.viewport.className = 'dzg-viewport';
    this.header = document.createElement('div');
    this.header.className = 'dzg-header';
    this.body = document.createElement('div');
    this.body.className = 'dzg-body';
    this.viewport.append(this.header, this.body);
    this.root.append(this.viewport);
    host.append(this.root);
    const rnd = mulberry32(seed);
    this.buildRow(this.header, -1, rnd);
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'dzg-row';
      row.dataset.r = String(r);
      row.style.transform = `translateY(${r * ROW_H}px)`;
      this.buildRow(row, r, rnd);
      this.body.append(row);
    }
    this.body.style.blockSize = `${ROWS * ROW_H}px`;
    this.layout();
    this.header.addEventListener('pointerdown', (e) => this.onDown(e));
    this.header.addEventListener('pointermove', (e) => this.onMove(e));
    this.header.addEventListener('pointerup', () => (this.resizeStart = null));
  }

  private buildRow(row: HTMLElement, r: number, rnd: () => number) {
    const seg = (k: string) => { const s = document.createElement('div'); s.className = `dzg-seg dzg-seg--${k}`; row.append(s); return s; };
    const segs = { start: seg('start'), center: seg('center'), end: seg('end') };
    for (const c of this.cols) {
      const cell = document.createElement('div');
      cell.className = `dzg-cell${r < 0 ? ' dzg-hcell' : ''}${c.numeric && r >= 0 ? ' dzg-cell--num' : ''}`;
      cell.dataset.col = c.id;
      if (r < 0) {
        cell.textContent = c.title;
        const h = document.createElement('div');
        h.className = 'dzg-handle';
        h.dataset.resize = c.id;
        cell.append(h);
      } else if (c.numeric) {
        const s = document.createElement('span'); s.textContent = cellText(r, c, rnd); cell.append(s);
      } else cell.textContent = cellText(r, c, rnd);
      segs[c.pin ?? 'center'].append(cell);
    }
  }

  get pinStartWidth() { return this.cols.filter((c) => c.pin === 'start').reduce((a, c) => a + c.width, 0) + 2; }
  get pinEndWidth() { return this.cols.filter((c) => c.pin === 'end').reduce((a, c) => a + c.width, 0) + 2; }
  get centerCols() { return this.cols.filter((c) => !c.pin); }
  get centerWidth() { return this.centerCols.reduce((a, c) => a + c.width, 0); }
  get totalWidth() { return this.pinStartWidth + this.centerWidth + this.pinEndWidth; }
  /** Logical x of a centre column's start edge inside the scrolled content. */
  centerX(id: string) { let x = 0; for (const c of this.centerCols) { if (c.id === id) return x; x += c.width; } return NaN; }

  layout() {
    const total = this.totalWidth;
    for (const row of [this.header, ...this.body.children] as HTMLElement[]) {
      row.style.inlineSize = `${total}px`;
      const center = row.querySelector<HTMLElement>('.dzg-seg--center')!;
      center.style.inlineSize = `${this.centerWidth}px`;
      for (const cell of row.querySelectorAll<HTMLElement>('.dzg-cell')) {
        const c = this.cols.find((k) => k.id === cell.dataset.col)!;
        cell.style.inlineSize = `${c.width}px`;
        if (!c.pin) cell.style.insetInlineStart = `${this.centerX(c.id)}px`;
      }
    }
    this.header.style.inlineSize = `${total}px`;
    this.body.style.inlineSize = `${total}px`;
  }

  setDir(dir: Dir) { this.dir = dir; this.root.dir = dir; }
  get scrollX() { return readScrollX(this.viewport, this.dir); }
  set scrollX(x: number) { writeScrollX(this.viewport, x, this.dir); }
  get maxX() { return maxScrollX(this.viewport); }

  /** ensureVisible by geometry: what the grid would do, cells need not be mounted. */
  ensureVisible(colId: string, r: number) {
    const x = this.centerX(colId), w = this.cols.find((c) => c.id === colId)!.width;
    const avail = this.viewport.clientWidth - this.pinStartWidth - this.pinEndWidth;
    let sx = this.scrollX;
    if (x < sx) sx = x;
    else if (x + w > sx + avail) sx = x + w - avail;
    this.scrollX = sx;
    const top = r * ROW_H, availH = this.viewport.clientHeight - 34;
    let st = this.viewport.scrollTop;
    if (top < st) st = top; else if (top + ROW_H > st + availH) st = top + ROW_H - availH;
    this.viewport.scrollTop = st;
  }

  private onDown(e: PointerEvent) {
    const id = (e.target as HTMLElement).dataset?.resize;
    if (!id) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = this.root.getBoundingClientRect();
    const col = this.cols.find((c) => c.id === id)!;
    // The end-pinned column's handle sits at its inline-start edge: dragging towards start widens it.
    this.resizeStart = { id, x0: logicalX(e.clientX, rect, this.dir), w0: col.width, rect };
    e.preventDefault();
  }
  private onMove(e: PointerEvent) {
    const s = this.resizeStart;
    if (!s) return;
    const col = this.cols.find((c) => c.id === s.id)!;
    let dx = logicalX(e.clientX, s.rect, this.dir) - s.x0;
    if (col.pin === 'end') dx = -dx;
    col.width = Math.max(40, s.w0 + dx);
    this.resizeLog.push({ id: s.id, dx, w: col.width });
    this.layout();
  }
}

// ---------- measurements (physical sides allowed here: this is what we check) ----------

const R = (r: DOMRect) => ({ left: +r.left.toFixed(2), right: +r.right.toFixed(2), top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2) });

export function scrollbarInfo(g: Grid) {
  return scrollbarOf(g.viewport);
}
export function scrollbarOf(v: HTMLElement) {
  const cs = getComputedStyle(v);
  const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth);
  const sbW = v.offsetWidth - v.clientWidth - bl - br;
  const sbH = v.offsetHeight - v.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
  const onLeftByClientLeft = v.clientLeft - bl > 0.5;
  const r = v.getBoundingClientRect(), y = r.top + 150;
  const hitL = document.elementFromPoint(r.left + bl + 3, y), hitR = document.elementFromPoint(r.right - br - 3, y);
  return {
    verticalScrollbarWidth: sbW, horizontalScrollbarHeight: sbH,
    clientLeftMinusBorder: v.clientLeft - bl,
    side: sbW < 0.5 ? `overlay(hit:${hitL === v ? 'left' : hitR === v ? 'right' : 'none'})` : hitL === v ? 'left' : hitR === v ? 'right' : '?',
    clientLeftIncludesScrollbar: onLeftByClientLeft,
    hitTestLeftEdgeIsViewport: hitL === v, hitTestRightEdgeIsViewport: hitR === v,
  };
}

/** Every geometric check at the current scroll position. */
export function measure(g: Grid) {
  const box = clientBox(g.viewport, scrollbarOf(g.viewport).side === 'left');
  const rtl = g.dir === 'rtl';
  const hStart = g.header.querySelector('.dzg-seg--start')!.getBoundingClientRect();
  const hEnd = g.header.querySelector('.dzg-seg--end')!.getBoundingClientRect();
  const headBottom = g.header.getBoundingClientRect().bottom;
  // a body row visible under the header
  const rows = [...g.body.children] as HTMLElement[];
  const row = rows.find((r) => r.getBoundingClientRect().top >= headBottom + 1 && r.getBoundingClientRect().bottom <= box.bottom)!;
  const bStart = row.querySelector('.dzg-seg--start')!.getBoundingClientRect();
  const bEnd = row.querySelector('.dzg-seg--end')!.getBoundingClientRect();
  // pinned at the right physical side?
  const startEdge = rtl ? box.right : box.left, endEdge = rtl ? box.left : box.right;
  const stuck = {
    headerStartOff: +(rtl ? hStart.right - startEdge : hStart.left - startEdge).toFixed(2),
    bodyStartOff: +(rtl ? bStart.right - startEdge : bStart.left - startEdge).toFixed(2),
    headerEndOff: +(rtl ? hEnd.left - endEdge : hEnd.right - endEdge).toFixed(2),
    bodyEndOff: +(rtl ? bEnd.left - endEdge : bEnd.right - endEdge).toFixed(2),
  };
  // header/body alignment, every column, also offscreen ones (they share the same layout)
  let maxMisalign = 0; const worst: string[] = [];
  for (const c of g.cols) {
    const h = g.header.querySelector(`[data-col="${c.id}"]`)!.getBoundingClientRect();
    const b = row.querySelector(`[data-col="${c.id}"]`)!.getBoundingClientRect();
    const d = Math.max(Math.abs(h.left - b.left), Math.abs(h.right - b.right));
    if (d > maxMisalign) maxMisalign = d;
    if (d > 1) worst.push(`${c.id}:${d.toFixed(2)}`);
  }
  // column order: physical positions of start edges must be monotonic in logical order (at this scroll, centre only)
  const centers = g.centerCols.map((c) => g.header.querySelector(`[data-col="${c.id}"]`)!.getBoundingClientRect());
  const mono = centers.every((r, i) => i === 0 || (rtl ? r.right <= centers[i - 1]!.left + 0.5 : r.left >= centers[i - 1]!.right - 0.5));
  // paint order: what is visible at the centre of the pinned body cells
  const hit = (r: DOMRect) => document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) as HTMLElement | null;
  const nameCell = row.querySelector('[data-col="name"]')!.getBoundingClientRect();
  const statusCell = row.querySelector('[data-col="status"]')!.getBoundingClientRect();
  const hc = g.header.querySelector('[data-col="name"]')!.getBoundingClientRect();
  return {
    dir: g.dir, scrollLeft: +g.viewport.scrollLeft.toFixed(2), scrollX: +g.scrollX.toFixed(2), maxX: g.maxX, scrollTop: g.viewport.scrollTop,
    row: Number(row.dataset.r),
    stuck, maxMisalign: +maxMisalign.toFixed(3), misaligned: worst, centreOrderMirrored: mono,
    pinnedPaintsOnTop: {
      name: hit(nameCell)?.closest('[data-col]')?.getAttribute('data-col') === 'name',
      status: hit(statusCell)?.closest('[data-col]')?.getAttribute('data-col') === 'status',
      headerOverBody: hit(hc)?.closest('.dzg-header') != null,
    },
    pinStartRectBody: R(bStart), pinEndRectBody: R(bEnd), clientBox: box,
  };
}

/** Is a cell fully in the unobstructed area (between pinned segments, under the header)? */
export function cellVisibility(g: Grid, colId: string, r: number) {
  const row = g.body.children[r] as HTMLElement;
  const cell = row.querySelector<HTMLElement>(`[data-col="${colId}"]`)!;
  const c = cell.getBoundingClientRect();
  const box = clientBox(g.viewport, scrollbarOf(g.viewport).side === 'left');
  const s = g.header.querySelector('.dzg-seg--start')!.getBoundingClientRect();
  const e = g.header.querySelector('.dzg-seg--end')!.getBoundingClientRect();
  const headBottom = g.header.getBoundingClientRect().bottom;
  const [lo, hi] = g.dir === 'rtl' ? [e.right, s.left] : [s.right, e.left];
  // upper part of the cell: the bottom ~15 px of a viewport can be under an overlay scrollbar (WebKit)
  const hitEl = document.elementFromPoint((c.left + c.right) / 2, c.top + 8);
  return {
    fullyUnobstructed: c.left >= lo - 0.5 && c.right <= hi + 0.5 && c.top >= headBottom - 0.5 && c.bottom <= box.bottom + 0.5,
    hitIsCell: hitEl === cell || cell.contains(hitEl),
    hit: hitEl ? `${hitEl.className}[${(hitEl as HTMLElement).dataset?.col ?? ''}] row=${hitEl.closest<HTMLElement>('.dzg-row')?.dataset.r ?? '-'}` : null,
    cell: R(c), lo, hi, headBottom,
    scrollX: +g.scrollX.toFixed(2), scrollLeft: +g.viewport.scrollLeft.toFixed(2), scrollTop: g.viewport.scrollTop,
  };
}

export { scrollConvention, toPhysicalScrollLeft, readScrollX, writeScrollX };
