/**
 * Prototype of a recycled-DOM grid: rows and columns virtualised inside one
 * scroll container, with a ScrollMapper when the logical height exceeds the
 * physical cap. Throwaway spike code, written to inform packages/dom.
 *
 * Geometry (block axis):
 *   viewport (scrolls) ─ header (sticky) ─ body (block-size = physical height)
 *     └ layer (inset-block-start = physicalTop − logicalTop + base)
 *         └ row (transform: translateY(row × rowHeight − base))
 * `base` is the logical offset rounded down to REBASE, so every number handed
 * to a transform stays small (a compositor keeps transforms in float32, which
 * holds integers exactly only up to 2^24 = 16 777 216 px). The one large
 * number, the layer's offset, goes through layout (fixed-point, exact).
 *
 * Inline axis: cells sit at `inset-inline-start` inside the row. Each row
 * owns `slotCount` cell elements; column c always uses slot c % slotCount,
 * so a one-column shift rewrites one cell per row, not all of them.
 */
import { scrollMapper, type ScrollMapper } from './scroll-mapper.ts';

export interface GridColumn { readonly id: string; readonly width: number }

export interface GridOptions {
  readonly host: HTMLElement;
  readonly rowCount: number;
  readonly columns: readonly GridColumn[];
  readonly rowHeight: number;
  readonly headerHeight: number;
  /** Cap on the scrollable content's physical height (header included). */
  readonly maxPhysical: number;
  readonly overscanRows: number;
  readonly overscanCols: number;
  readonly cellText: (row: number, col: number) => string;
}

const REBASE = 1 << 20;

interface Slot { readonly el: HTMLDivElement; readonly text: Text; col: number }
interface RowView { readonly el: HTMLDivElement; row: number; readonly slots: Slot[] }

export class VirtualGrid {
  readonly viewport: HTMLDivElement;
  readonly counters = { renders: 0, rowBinds: 0, cellWrites: 0, domInserts: 0 };
  mapper!: ScrollMapper;
  /** Source of truth for the block position; always an integer. */
  logicalTop = 0;

  private readonly o: GridOptions;
  private readonly header: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly colStart: Float64Array;
  private readonly totalWidth: number;
  private headerSlots: Slot[] = [];
  private slotCount = 0;
  private bodyHeight = 0;          // visible body block size (viewport minus header)
  private viewWidth = 0;
  private physicalTop = 0;
  private expectedPhysical = 0;
  private inlineStart = 0;
  private base = 0;
  private layerTop = NaN;
  private colFirst = 0;
  private colLast = -1;
  private views: RowView[] = [];
  private pool: RowView[] = [];
  private wheelRemainder = 0;
  private frame = 0;
  private readonly resize: ResizeObserver;

  constructor(o: GridOptions) {
    this.o = o;
    const n = o.columns.length;
    this.colStart = new Float64Array(n + 1);
    for (let c = 0; c < n; c++) this.colStart[c + 1] = this.colStart[c]! + o.columns[c]!.width;
    this.totalWidth = this.colStart[n]!;

    this.viewport = div('dzg-viewport');
    this.viewport.setAttribute('role', 'grid');
    this.viewport.setAttribute('aria-rowcount', String(o.rowCount + 1));
    this.viewport.setAttribute('aria-colcount', String(n));
    this.header = div('dzg-header');
    this.header.setAttribute('role', 'row');
    this.header.setAttribute('aria-rowindex', '1');
    this.header.style.inlineSize = this.totalWidth + 'px';
    this.header.style.blockSize = o.headerHeight + 'px';
    this.body = div('dzg-body');
    this.body.setAttribute('role', 'rowgroup');
    this.body.style.inlineSize = this.totalWidth + 'px';
    this.layer = div('dzg-layer');
    this.body.append(this.layer);
    this.viewport.append(this.header, this.body);
    o.host.append(this.viewport);

    this.viewport.addEventListener('scroll', this.onScroll, { passive: true });
    this.measure();
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(this.viewport);
  }

  destroy(): void {
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    this.viewport.removeEventListener('scroll', this.onScroll);
    this.viewport.removeEventListener('wheel', this.onWheel);
    this.viewport.remove();
  }

  get window() {
    const v = this.views;
    return {
      rows: { first: v.length ? v[0]!.row : 0, last: v.length ? v[v.length - 1]!.row : -1 },
      cols: { first: this.colFirst, last: this.colLast },
      mounted: v.length, pooled: this.pool.length, slotCount: this.slotCount,
    };
  }

  /** Programmatic scroll: sets the physical position and renders now. */
  scrollToLogical(y: number, render = true): void {
    const m = this.mapper;
    this.logicalTop = Math.round(Math.min(Math.max(y, 0), m.maxLogical));
    const p = Math.round(m.toPhysical(this.logicalTop));
    this.expectedPhysical = p;
    this.physicalTop = p;
    this.viewport.scrollTop = p;
    if (render) this.render(); else this.schedule();
  }

  scrollInlineTo(x: number): void {
    this.viewport.scrollLeft = x;
    this.syncFromScroll();
  }

  /**
   * Read phase: takes the browser's scroll position. A physical position we
   * did not set ourselves (scrollbar drag, keyboard, browser wheel) re-derives
   * the logical one; ours is ignored, so the logical value never drifts.
   */
  syncFromScroll(render = true): void {
    const st = this.viewport.scrollTop;
    if (Math.abs(st - this.expectedPhysical) >= 1) {
      this.physicalTop = st;
      this.expectedPhysical = st;
      this.logicalTop = Math.round(this.mapper.toLogical(st));
    }
    // RTL scrollLeft is negative in current engines (spike S2); its magnitude is the logical offset.
    this.inlineStart = Math.abs(this.viewport.scrollLeft);
    if (render) this.render(); else this.schedule();
  }

  /** Test hook: paints one mounted row in a flat colour. */
  mark(row: number, colour: string | null): boolean {
    for (const v of this.views) if (v.row === row) { v.el.style.background = colour ?? ''; return true; }
    return false;
  }

  /** Every mounted row with its index, for geometry checks. */
  mountedRows(): readonly { row: number; el: HTMLElement }[] {
    return this.views.map((v) => ({ row: v.row, el: v.el }));
  }

  get headerHeight(): number { return this.o.headerHeight; }

  private onScroll = () => this.syncFromScroll(false);

  /** Only when scaled: a wheel notch must move rows by its own delta, not by delta × ratio. */
  private onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return;                   // pinch / zoom stays the browser's
    e.preventDefault();
    const k = e.deltaMode === 1 ? this.o.rowHeight : e.deltaMode === 2 ? this.bodyHeight : 1;
    this.wheelRemainder += e.deltaY * k;
    const step = Math.trunc(this.wheelRemainder);
    this.wheelRemainder -= step;
    if (e.deltaX) this.viewport.scrollLeft += e.deltaX * k;
    if (step) this.scrollToLogical(this.logicalTop + step, false);
    else this.syncFromScroll(false);
  };

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }

  private measure(): void {
    const o = this.o;
    this.bodyHeight = Math.max(0, this.viewport.clientHeight - o.headerHeight);
    this.viewWidth = this.viewport.clientWidth;
    const wasScaled = this.mapper?.scaled ?? false;
    this.mapper = scrollMapper(o.rowCount * o.rowHeight, o.maxPhysical - o.headerHeight, this.bodyHeight);
    this.body.style.blockSize = this.mapper.physicalHeight + 'px';
    if (this.mapper.scaled !== wasScaled) {
      if (this.mapper.scaled) this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
      else this.viewport.removeEventListener('wheel', this.onWheel);
    }
    const s = maxColumnsInWidth(this.colStart, this.viewWidth) + 2 * o.overscanCols;
    if (s > this.slotCount) {
      // Rows were built with too few slots: throw them away, rebuild on render.
      for (const v of this.views) v.el.remove();
      this.views = [];
      this.pool = [];
      this.slotCount = s;
      this.header.replaceChildren();
      this.headerSlots = makeSlots(this.header, s, 'dzg-hcell');
      this.colFirst = 0; this.colLast = -1;
    }
    this.scrollToLogical(this.logicalTop);
  }

  render(): void {
    const o = this.o;
    this.counters.renders++;
    const n = o.rowCount;
    if (n === 0) return;
    const rh = o.rowHeight;
    const L = this.logicalTop;
    const first = Math.max(0, Math.floor(L / rh) - o.overscanRows);
    const last = Math.min(n - 1, Math.ceil((L + this.bodyHeight) / rh) - 1 + o.overscanRows);
    const nc = o.columns.length;
    const cf = Math.max(0, columnAt(this.colStart, this.inlineStart) - o.overscanCols);
    const cl = Math.min(nc - 1, columnAt(this.colStart, this.inlineStart + this.viewWidth - 1) + o.overscanCols);

    const base = Math.floor(L / REBASE) * REBASE;
    const rebased = base !== this.base;
    this.base = base;
    const top = this.physicalTop - L + base;
    if (top !== this.layerTop) { this.layerTop = top; this.layer.style.insetBlockStart = top + 'px'; }

    const colsChanged = cf !== this.colFirst || cl !== this.colLast;
    this.colFirst = cf; this.colLast = cl;
    if (colsChanged) this.syncSlots(this.headerSlots, -1, false);

    const views = this.views;
    const mf = views.length ? views[0]!.row : 0;
    const ml = mf + views.length - 1;
    if (!views.length || last < mf || first > ml) {
      // A jump: rebind what is mounted in DOM order, then add or drop at the tail.
      const need = last - first + 1;
      while (views.length > need) this.release(views.pop()!);
      for (let k = 0; k < views.length; k++) this.bind(views[k]!, first + k);
      if (need > views.length) {
        const frag = document.createDocumentFragment();
        for (let k = views.length; k < need; k++) {
          const v = this.acquire(); this.bind(v, first + k); frag.append(v.el); views.push(v);
        }
        this.layer.append(frag);
        this.counters.domInserts++;
      }
      return;
    }
    // A slide: drop at either end, keep the middle untouched, add at either end.
    while (views[0]!.row < first) this.release(views.shift()!);
    while (views[views.length - 1]!.row > last) this.release(views.pop()!);
    if (rebased || colsChanged) {
      for (const v of views) {
        if (rebased) v.el.style.transform = `translateY(${v.row * rh - base}px)`;
        if (colsChanged) this.syncSlots(v.slots, v.row, false);
      }
    }
    const head = views[0]!.row;
    if (first < head) {
      const frag = document.createDocumentFragment();
      const add: RowView[] = [];
      for (let r = first; r < head; r++) { const v = this.acquire(); this.bind(v, r); frag.append(v.el); add.push(v); }
      this.layer.insertBefore(frag, views[0]!.el);
      views.unshift(...add);
      this.counters.domInserts++;
    }
    const tail = views[views.length - 1]!.row;
    if (last > tail) {
      const frag = document.createDocumentFragment();
      for (let r = tail + 1; r <= last; r++) { const v = this.acquire(); this.bind(v, r); frag.append(v.el); views.push(v); }
      this.layer.append(frag);
      this.counters.domInserts++;
    }
  }

  private bind(v: RowView, r: number): void {
    v.row = r;
    v.el.style.transform = `translateY(${r * this.o.rowHeight - this.base}px)`;
    v.el.setAttribute('aria-rowindex', String(r + 2));
    this.syncSlots(v.slots, r, true);
    this.counters.rowBinds++;
  }

  /** Brings a row's (or the header's, row = −1) slots in line with the column window. */
  private syncSlots(slots: Slot[], row: number, rowChanged: boolean): void {
    const S = this.slotCount, cf = this.colFirst, cl = this.colLast, o = this.o;
    for (let c = cf; c <= cl; c++) {
      const s = slots[c % S]!;
      if (s.col !== c) {
        s.el.style.insetInlineStart = this.colStart[c] + 'px';
        s.el.style.inlineSize = o.columns[c]!.width + 'px';
        if (s.col === -1) s.el.hidden = false;
        s.col = c;
        s.text.data = row < 0 ? o.columns[c]!.id : o.cellText(row, c);
        this.counters.cellWrites++;
      } else if (rowChanged) {
        s.text.data = o.cellText(row, c);
        this.counters.cellWrites++;
      }
    }
    for (let k = cl + 1; k < cf + S; k++) {
      const s = slots[k % S]!;
      if (s.col !== -1) { s.el.hidden = true; s.col = -1; }
    }
  }

  private acquire(): RowView {
    const pooled = this.pool.pop();
    if (pooled) return pooled;
    const el = div('dzg-row');
    el.setAttribute('role', 'row');
    el.style.inlineSize = this.totalWidth + 'px';
    el.style.blockSize = this.o.rowHeight + 'px';
    return { el, row: -1, slots: makeSlots(el, this.slotCount, 'dzg-cell') };
  }

  private release(v: RowView): void {
    v.el.remove();
    this.pool.push(v);
  }
}

function div(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function makeSlots(parent: HTMLElement, count: number, cls: string): Slot[] {
  const out: Slot[] = [];
  for (let k = 0; k < count; k++) {
    const el = div(cls);
    el.setAttribute('role', cls === 'dzg-hcell' ? 'columnheader' : 'gridcell');
    el.hidden = true;
    const text = document.createTextNode('');
    el.append(text);
    parent.append(el);
    out.push({ el, text, col: -1 });
  }
  return out;
}

/** Index of the column containing offset x (clamped). */
export function columnAt(colStart: Float64Array, x: number): number {
  const n = colStart.length - 1;
  if (x <= 0) return 0;
  if (x >= colStart[n]!) return n - 1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (colStart[mid]! <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The most columns any window of this width can intersect (a partial column at each edge). */
function maxColumnsInWidth(colStart: Float64Array, width: number): number {
  const n = colStart.length - 1;
  let best = 1;
  for (let c = 0; c < n; c++) {
    const end = columnAt(colStart, colStart[c]! + Math.max(0, width - 1));
    best = Math.max(best, end - c + 2);
  }
  return Math.min(best, n);
}
