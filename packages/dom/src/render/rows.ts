import { isBlank, REBASE, type ColumnLayout, type DisplayedRows, type LocaleCtx, type ResolvedColumn, type RowKey } from '@dzgrid/core';

/**
 * Body rows: recycled in DOM order, rebound, never rebuilt (S9, D7). Every
 * write is compared with what is there first, so a render where nothing
 * changed touches nothing.
 */
export interface CellView {
  readonly el: HTMLElement;
  readonly value: HTMLElement;
  readonly text: Text;
  col: ResolvedColumn<any> | null;
  inlineStart: number;
  inlineSize: number;
}

export interface RowView {
  readonly el: HTMLElement;
  readonly segs: { readonly start: HTMLElement; readonly center: HTMLElement; readonly end: HTMLElement };
  key: RowKey | null;
  data: unknown;
  epoch: number;
  readonly cells: Map<string, CellView>;
  top: number;
  /** The selection box, first in the start segment, when the grid shows one (D8). */
  check: HTMLElement | null;
}

/** Width of the selection box column. */
export const CHECK_WIDTH = 40;

/** The text of one cell: the codec's display, blank for a blank or unreadable value. */
export function cellText<T>(col: ResolvedColumn<T>, row: Readonly<T>, ctx: LocaleCtx): string {
  let raw: unknown;
  try {
    raw = col.read(row);
  } catch {
    return '';
  }
  if (isBlank(raw)) return '';
  const v = col.codec.coerce(raw, ctx);
  return v === null ? '' : col.codec.format(v, ctx);
}

/** Free text reads in its own direction; numbers left to right inside any text (§3.9, S2). */
const valueClass = (col: ResolvedColumn<any>): string => (col.type === 'text' ? 'dzg-val dzg-free' : col.type === 'number' ? 'dzg-val dzg-num' : 'dzg-val');

export const setAttr = (el: Element, name: string, value: string | null): void => {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};
export const setPx = (el: HTMLElement, prop: string, v: number): void => {
  const s = `${v}px`;
  if (el.style.getPropertyValue(prop) !== s) el.style.setProperty(prop, s);
};

export interface Frame<T> {
  readonly displayed: DisplayedRows<T>;
  readonly layout: ColumnLayout;
  /** Centre columns to mount, by index into `layout.center`. */
  readonly cols: { readonly first: number; readonly last: number } | null;
  readonly rowHeight: number;
  readonly base: number;
  readonly ctx: LocaleCtx;
  /** Bumped when columns, widths, language or messages change: cells are rechecked. */
  readonly epoch: number;
  /** Row header: the identity column. */
  readonly rowHeader: string | null;
  /** The focused cell: its centre column stays mounted in its row out of the window (D6). */
  readonly focusRow: RowKey | null;
  readonly focusCenter: number;
  /** A selection box column before the start columns (D8): widths and indices shift by it. */
  readonly check: boolean;
  readonly colIndex: (id: string) => number;
  readonly rowAttrs: (key: RowKey, el: HTMLElement) => void;
}

export class RowRenderer<T> {
  readonly #doc: Document;
  readonly #layer: HTMLElement;
  readonly #mounted = new Map<RowKey, RowView>();
  /** Row element to its key: the DOM never holds a row's id. */
  readonly #keys = new WeakMap<Element, RowKey>();
  readonly #pool: RowView[] = [];
  /** Every row element made, for tests and the pool's high-water mark. */
  made = 0;

  constructor(doc: Document, layer: HTMLElement) {
    this.#doc = doc;
    this.#layer = layer;
  }

  get mounted(): ReadonlyMap<RowKey, RowView> {
    return this.#mounted;
  }

  #makeRow(): RowView {
    const el = this.#doc.createElement('div');
    el.className = 'dzg-row';
    el.setAttribute('role', 'row');
    const seg = (name: string) => {
      const s = this.#doc.createElement('div');
      s.className = `dzg-seg dzg-seg-${name}`;
      s.setAttribute('role', 'presentation');
      el.append(s);
      return s;
    };
    const segs = { start: seg('start'), center: seg('center'), end: seg('end') };
    this.made++;
    return { el, segs, key: null, data: undefined, epoch: -1, cells: new Map(), top: Number.NaN, check: null };
  }

  #makeCell(): CellView {
    const el = this.#doc.createElement('div');
    el.className = 'dzg-cell';
    el.tabIndex = -1;
    const value = this.#doc.createElement('span');
    const text = this.#doc.createTextNode('');
    value.append(text);
    el.append(value);
    return { el, value, text, col: null, inlineStart: Number.NaN, inlineSize: Number.NaN };
  }

  /**
   * Mounts `wanted` (display indices, ascending) plus `retained` (a key kept
   * mounted wherever it is: the focused row, S10). The retained row is never
   * moved in the DOM; the others are placed around it, in order.
   */
  render(f: Frame<T>, wanted: readonly number[], retained: RowKey | null): void {
    const d = f.displayed;
    const keys: RowKey[] = wanted.map((i) => d.keyAt(d.index(i)!));
    const retainedAt = retained === null ? -1 : d.indexOf(retained);
    if (retained !== null && retainedAt !== -1 && !keys.includes(retained)) {
      // In display order, like the rest.
      let at = 0;
      while (at < keys.length && d.indexOf(keys[at]!) < retainedAt) at++;
      keys.splice(at, 0, retained);
    }
    const want = new Set(keys);
    for (const [k, v] of this.#mounted) {
      if (want.has(k)) continue;
      v.el.remove();
      this.#mounted.delete(k);
      v.key = null;
      this.#pool.push(v);
    }
    const kept = retained !== null ? this.#mounted.get(retained) ?? null : null;
    for (const k of keys) {
      let v = this.#mounted.get(k);
      if (!v) {
        v = this.#pool.pop() ?? this.#makeRow();
        this.#mounted.set(k, v);
      }
      const i = d.indexOf(k) as number;
      this.#keys.set(v.el, k);
      this.#bind(v, k, d, f);
      // A row far from the window sits at its true distance, bounded (S11): never over the
      // visible rows, never past what the body (which clips) can hold.
      const top = Math.max(-2 * REBASE, Math.min(2 * REBASE, i * f.rowHeight - f.base));
      if (v.top !== top) {
        v.top = top;
        setPx(v.el, 'inset-block-start', top);
      }
      setAttr(v.el, 'aria-rowindex', String(i + 2));
      f.rowAttrs(k, v.el);
    }
    let cursor: ChildNode | null = this.#layer.firstChild;
    for (const k of keys) {
      const el = this.#mounted.get(k)!.el;
      if (kept && el === kept.el && el.parentNode === this.#layer) {
        cursor = el.nextSibling;
        continue;
      }
      if (el === cursor) cursor = cursor.nextSibling;
      else this.#layer.insertBefore(el, cursor);
    }
  }

  /** The centre columns a row mounts: the window, and the focused column in the focused row. */
  #centerOf(key: RowKey, f: Frame<T>): number[] {
    const out: number[] = [];
    if (f.cols) for (let c = f.cols.first; c <= f.cols.last; c++) out.push(c);
    if (key === f.focusRow && f.focusCenter >= 0 && !(f.cols && f.focusCenter >= f.cols.first && f.focusCenter <= f.cols.last)) {
      out.push(f.focusCenter);
      out.sort((a, b) => a - b);
    }
    return out;
  }

  #bind(v: RowView, key: RowKey, d: DisplayedRows<T>, f: Frame<T>): void {
    const node = d.nodeAt(d.index(d.indexOf(key) as number)!);
    const data = node.kind === 'data' ? node.data : undefined;
    const center = this.#centerOf(key, f);
    const L = f.layout;
    const same = v.key === key && v.data === data && v.epoch === f.epoch;
    v.key = key;
    if (same && this.#matches(v, f, center)) return;
    v.data = data;
    v.epoch = f.epoch;
    setPx(v.el, 'block-size', f.rowHeight);
    const extra = f.check ? CHECK_WIDTH : 0;
    setPx(v.el, 'inline-size', L.totalWidth + extra);
    setPx(v.segs.start, 'inline-size', L.start.width + extra);
    this.#checkCell(v, f.check);
    setPx(v.segs.center, 'inline-size', L.center.width);
    setPx(v.segs.end, 'inline-size', L.end.width);
    // Cells that go are taken out first: a focused cell is then never moved past them (a move blurs).
    const wanted = new Set<string>();
    for (const c of L.start.columns) wanted.add(c.id);
    for (const c of center) wanted.add(L.center.columns[c]!.id);
    for (const c of L.end.columns) wanted.add(c.id);
    for (const [id, cell] of v.cells) {
      if (wanted.has(id)) continue;
      cell.el.remove();
      v.cells.delete(id);
      cell.col = null;
      this.#spare.push(cell);
    }
    const place = (seg: HTMLElement, cols: readonly ResolvedColumn<any>[], widths: ColumnLayout['start']['widths'], indices: Iterable<number>, absolute: boolean) => {
      let cursor: ChildNode | null = seg.firstChild;
      if (cursor && cursor === v.check) cursor = cursor.nextSibling;
      for (const c of indices) {
        const col = cols[c]!;
        let cell = v.cells.get(col.id);
        if (!cell) {
          cell = this.#spare.pop() ?? this.#makeCell();
          v.cells.set(col.id, cell);
        }
        this.#fillCell(cell, col, data, f, widths.sizeAt(c), absolute ? widths.offsetOf(c) : null);
        if (cell.el === cursor) cursor = cursor.nextSibling;
        else seg.insertBefore(cell.el, cursor);
      }
    };
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    place(v.segs.start, L.start.columns, L.start.widths, range(L.start.columns.length), false);
    place(v.segs.center, L.center.columns, L.center.widths, center, true);
    place(v.segs.end, L.end.columns, L.end.widths, range(L.end.columns.length), false);
  }

  readonly #spare: CellView[] = [];

  /** The row's selection box: a cell for the column count, its box decorative (the row's aria-selected is the truth). */
  #checkCell(v: RowView, on: boolean): void {
    if (!on) {
      v.check?.remove();
      v.check = null;
      return;
    }
    if (!v.check) {
      const el = this.#doc.createElement('div');
      el.className = 'dzg-check';
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-colindex', '1');
      el.tabIndex = -1;
      const box = this.#doc.createElement('span');
      box.className = 'dzg-box';
      box.setAttribute('aria-hidden', 'true');
      el.append(box);
      setPx(el, 'inline-size', CHECK_WIDTH);
      v.check = el;
    }
    if (v.segs.start.firstChild !== v.check) v.segs.start.prepend(v.check);
  }

  /** True when the row holds exactly the cells it should: then nothing needs placing. */
  #matches(v: RowView, f: Frame<T>, center: readonly number[]): boolean {
    const L = f.layout;
    if (!!v.check !== f.check) return false;
    if (v.cells.size !== L.start.columns.length + L.end.columns.length + center.length) return false;
    for (const c of center) if (!v.cells.has(L.center.columns[c]!.id)) return false;
    return true;
  }

  #fillCell(cell: CellView, col: ResolvedColumn<any>, data: unknown, f: Frame<T>, w: number, x: number | null): void {
    if (cell.col !== col) {
      cell.col = col;
      setAttr(cell.el, 'data-col', col.id);
      setAttr(cell.el, 'data-align', col.def.align ?? (col.type === 'number' ? 'end' : null));
      const cls = valueClass(col);
      if (cell.value.className !== cls) cell.value.className = cls;
    }
    // The identity column is the frame's (it moves when columns are hidden or moved).
    setAttr(cell.el, 'role', col.id === f.rowHeader ? 'rowheader' : 'gridcell');
    setAttr(cell.el, 'aria-colindex', String(f.colIndex(col.id)));
    if (cell.inlineSize !== w) {
      cell.inlineSize = w;
      setPx(cell.el, 'inline-size', w);
    }
    if (x === null) {
      if (!Number.isNaN(cell.inlineStart)) {
        cell.inlineStart = Number.NaN;
        cell.el.style.removeProperty('inset-inline-start');
      }
    } else if (cell.inlineStart !== x) {
      cell.inlineStart = x;
      setPx(cell.el, 'inset-inline-start', x);
    }
    const text = data === undefined ? '' : cellText(col, data as never, f.ctx);
    if (cell.text.data !== text) cell.text.data = text;
  }

  /** Each mounted row, for attributes that follow state rather than data (selection). */
  forEach(fn: (key: RowKey, v: RowView) => void): void {
    for (const [k, v] of this.#mounted) fn(k, v);
  }

  keyOf(rowEl: Element): RowKey | undefined {
    return this.#keys.get(rowEl);
  }

  /** The cell element for a row and column, when mounted. */
  cell(key: RowKey, column: string): HTMLElement | null {
    return this.#mounted.get(key)?.cells.get(column)?.el ?? null;
  }

  clear(): void {
    for (const v of this.#mounted.values()) v.el.remove();
    this.#mounted.clear();
    this.#pool.length = 0;
  }
}
