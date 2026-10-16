/**
 * One recycled-DOM grid, three switches, to compare how the visible window
 * is composed while scrolling:
 *
 *   position  'transform' — row at transform: translateY(y)
 *             'inset'     — row at inset-block-start: y
 *   contain   'none' | 'strict' | 'content' — `contain` on each row
 *             'cv-auto'   — content-visibility: auto (+ contain-intrinsic-size)
 *   strategy  'ordered'   — recycle; rows leaving one end are detached and the
 *                           entering ones inserted at the other, so DOM order
 *                           stays row order (what ARCHITECTURE.md §3.7 asks)
 *             'inplace'   — recycle; row r always uses view r % W, so nothing
 *                           moves in the DOM, but DOM order is not row order
 *             'rebuild'   — every change of window throws the rows away and
 *                           builds the window again from new elements
 *
 * Cells sit at inset-inline-start inside their row in every variant (logical,
 * so right-to-left needs nothing); column c uses cell slot c % S.
 * No ScrollMapper here: 100 000 × 32 px fits under every engine's cap (S1).
 */
export type Position = 'transform' | 'inset';
export type Containment = 'none' | 'strict' | 'content' | 'cv-auto';
export type Strategy = 'ordered' | 'inplace' | 'rebuild';
export interface Variant { readonly position: Position; readonly contain: Containment; readonly strategy: Strategy }

export interface ComposeOptions {
  readonly host: HTMLElement;
  readonly rowCount: number;
  readonly columns: readonly { readonly id: string; readonly width: number }[];
  readonly rowHeight: number;
  readonly headerHeight: number;
  readonly overscanRows: number;
  readonly overscanCols: number;
  readonly cellText: (row: number, col: number) => string;
  readonly variant: Variant;
}

interface Slot { readonly el: HTMLDivElement; readonly text: Text; col: number }
interface RowView { readonly el: HTMLDivElement; row: number; readonly slots: Slot[] }

export class ComposeGrid {
  readonly viewport: HTMLDivElement;
  readonly counters = { rowBinds: 0, cellWrites: 0, created: 0 };
  private readonly o: ComposeOptions;
  private readonly header: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly colStart: Float64Array;
  private readonly totalWidth: number;
  private readonly headerSlots: Slot[];
  private readonly slotCount: number;
  private readonly ringSize: number;
  private readonly bodyHeight: number;
  private readonly viewWidth: number;
  private readonly rowClass: string;
  private top = 0;
  private inlineStart = 0;
  private rowFirst = 0;
  private rowLast = -1;
  private colFirst = 0;
  private colLast = -1;
  private views: RowView[] = [];        // ordered / rebuild: in DOM order
  private ring: RowView[] = [];         // inplace: view of row r is ring[r % ringSize]
  private pool: RowView[] = [];

  constructor(o: ComposeOptions) {
    this.o = o;
    const n = o.columns.length;
    this.colStart = new Float64Array(n + 1);
    for (let c = 0; c < n; c++) this.colStart[c + 1] = this.colStart[c]! + o.columns[c]!.width;
    this.totalWidth = this.colStart[n]!;
    this.rowClass = 'dzg-row' + (o.variant.contain === 'none' ? '' : ' dzg-row--' + o.variant.contain);

    this.viewport = div('dzg-viewport');
    this.viewport.setAttribute('role', 'grid');
    this.header = div('dzg-header');
    this.header.style.inlineSize = this.totalWidth + 'px';
    this.header.style.blockSize = o.headerHeight + 'px';
    this.body = div('dzg-body');
    this.body.style.inlineSize = this.totalWidth + 'px';
    this.body.style.blockSize = o.rowCount * o.rowHeight + 'px';
    this.viewport.append(this.header, this.body);
    o.host.append(this.viewport);

    this.bodyHeight = this.viewport.clientHeight - o.headerHeight;
    this.viewWidth = this.viewport.clientWidth;
    // Fixed column widths here, so the widest window is simple to bound.
    const minWidth = Math.min(...o.columns.map((c) => c.width));
    this.slotCount = Math.min(n, Math.ceil(this.viewWidth / minWidth) + 1 + 2 * o.overscanCols);
    this.ringSize = Math.ceil(this.bodyHeight / o.rowHeight) + 1 + 2 * o.overscanRows;
    this.headerSlots = makeSlots(this.header, this.slotCount, 'dzg-hcell');
    this.viewport.addEventListener('scroll', () => this.syncFromScroll(), { passive: true });
    this.syncFromScroll();
  }

  /** Read phase, then render: scrollTop / scrollLeft are the only reads. */
  syncFromScroll(): void {
    this.top = this.viewport.scrollTop;
    this.inlineStart = Math.abs(this.viewport.scrollLeft);
    this.render();
  }

  /** For the correctness check: each mounted row with its index, in DOM order. */
  mountedInDomOrder(): { row: number; el: HTMLElement }[] {
    const byEl = new Map<Element, RowView>();
    for (const v of [...this.views, ...this.ring]) byEl.set(v.el, v);
    const out: { row: number; el: HTMLElement }[] = [];
    for (const el of this.body.children) {
      const v = byEl.get(el);
      if (v && !v.el.hidden) out.push({ row: v.row, el: v.el });
    }
    return out;
  }

  private render(): void {
    const o = this.o, rh = o.rowHeight;
    const first = Math.max(0, Math.floor(this.top / rh) - o.overscanRows);
    const last = Math.min(o.rowCount - 1, Math.ceil((this.top + this.bodyHeight) / rh) - 1 + o.overscanRows);
    const nc = o.columns.length;
    const cf = Math.max(0, columnAt(this.colStart, this.inlineStart) - o.overscanCols);
    const cl = Math.min(nc - 1, columnAt(this.colStart, this.inlineStart + this.viewWidth - 1) + o.overscanCols);
    const colsChanged = cf !== this.colFirst || cl !== this.colLast;
    const rowsChanged = first !== this.rowFirst || last !== this.rowLast;
    if (!colsChanged && !rowsChanged) return;
    this.colFirst = cf; this.colLast = cl;
    if (colsChanged) this.syncSlots(this.headerSlots, -1, false);
    switch (o.variant.strategy) {
      case 'ordered': this.renderOrdered(first, last, colsChanged); break;
      case 'inplace': this.renderInPlace(first, last, colsChanged); break;
      case 'rebuild': this.renderRebuild(first, last); break;
    }
    this.rowFirst = first; this.rowLast = last;
  }

  private renderOrdered(first: number, last: number, colsChanged: boolean): void {
    const views = this.views;
    const mf = views.length ? views[0]!.row : 0;
    const ml = mf + views.length - 1;
    if (!views.length || last < mf || first > ml) {
      const need = last - first + 1;
      while (views.length > need) this.release(views.pop()!);
      for (let k = 0; k < views.length; k++) this.bind(views[k]!, first + k);
      if (need > views.length) {
        const frag = document.createDocumentFragment();
        for (let k = views.length; k < need; k++) { const v = this.acquire(); this.bind(v, first + k); frag.append(v.el); views.push(v); }
        this.body.append(frag);
      }
      return;
    }
    while (views[0]!.row < first) this.release(views.shift()!);
    while (views[views.length - 1]!.row > last) this.release(views.pop()!);
    if (colsChanged) for (const v of views) this.syncSlots(v.slots, v.row, false);
    const head = views[0]!.row;
    if (first < head) {
      const frag = document.createDocumentFragment();
      const add: RowView[] = [];
      for (let r = first; r < head; r++) { const v = this.acquire(); this.bind(v, r); frag.append(v.el); add.push(v); }
      this.body.insertBefore(frag, views[0]!.el);
      views.unshift(...add);
    }
    const tail = views[views.length - 1]!.row;
    if (last > tail) {
      const frag = document.createDocumentFragment();
      for (let r = tail + 1; r <= last; r++) { const v = this.acquire(); this.bind(v, r); frag.append(v.el); views.push(v); }
      this.body.append(frag);
    }
  }

  private renderInPlace(first: number, last: number, colsChanged: boolean): void {
    const W = this.ringSize;
    if (!this.ring.length) {
      const frag = document.createDocumentFragment();
      for (let k = 0; k < W; k++) { const v = this.create(); v.el.hidden = true; frag.append(v.el); this.ring.push(v); }
      this.body.append(frag);
    }
    for (let r = first; r <= last; r++) {
      const v = this.ring[r % W]!;
      if (v.row !== r) { if (v.el.hidden) v.el.hidden = false; this.bind(v, r); }
      else if (colsChanged) this.syncSlots(v.slots, r, false);
    }
    // Ring entries outside the window (only at the very start or end of the rows).
    for (let r = last + 1; r < first + W; r++) {
      const v = this.ring[r % W]!;
      if (v.row !== -1 && (v.row < first || v.row > last)) { v.el.hidden = true; v.row = -1; }
    }
  }

  private renderRebuild(first: number, last: number): void {
    const frag = document.createDocumentFragment();
    const views: RowView[] = [];
    for (let r = first; r <= last; r++) {
      const el = div(this.rowClass);
      el.setAttribute('role', 'row');
      el.style.inlineSize = this.totalWidth + 'px';
      el.style.blockSize = this.o.rowHeight + 'px';
      const slots: Slot[] = [];
      for (let c = this.colFirst; c <= this.colLast; c++) {
        const cell = div('dzg-cell');
        cell.style.insetInlineStart = this.colStart[c] + 'px';
        cell.style.inlineSize = this.o.columns[c]!.width + 'px';
        const text = document.createTextNode(this.o.cellText(r, c));
        cell.append(text);
        el.append(cell);
        slots.push({ el: cell, text, col: c });
        this.counters.cellWrites++;
      }
      const v: RowView = { el, row: r, slots };
      this.place(v);
      el.setAttribute('aria-rowindex', String(r + 2));
      frag.append(el);
      views.push(v);
      this.counters.rowBinds++;
      this.counters.created++;
    }
    this.body.replaceChildren(frag);
    this.views = views;
  }

  private place(v: RowView): void {
    const y = v.row * this.o.rowHeight;
    if (this.o.variant.position === 'transform') v.el.style.transform = `translateY(${y}px)`;
    else v.el.style.insetBlockStart = y + 'px';
  }

  private bind(v: RowView, r: number): void {
    v.row = r;
    this.place(v);
    v.el.setAttribute('aria-rowindex', String(r + 2));
    this.syncSlots(v.slots, r, true);
    this.counters.rowBinds++;
  }

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

  private create(): RowView {
    const el = div(this.rowClass);
    el.setAttribute('role', 'row');
    el.style.inlineSize = this.totalWidth + 'px';
    el.style.blockSize = this.o.rowHeight + 'px';
    this.counters.created++;
    return { el, row: -1, slots: makeSlots(el, this.slotCount, 'dzg-cell') };
  }

  private acquire(): RowView { return this.pool.pop() ?? this.create(); }

  private release(v: RowView): void { v.el.remove(); this.pool.push(v); }
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
    el.hidden = true;
    const text = document.createTextNode('');
    el.append(text);
    parent.append(el);
    out.push({ el, text, col: -1 });
  }
  return out;
}

function columnAt(colStart: Float64Array, x: number): number {
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
