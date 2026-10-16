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
}

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
  readonly colIndex: (id: string) => number;
  readonly rowAttrs: (key: RowKey, el: HTMLElement) => void;
}

export class RowRenderer<T> {
  readonly #doc: Document;
  readonly #layer: HTMLElement;
  readonly #mounted = new Map<RowKey, RowView>();
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
    return { el, segs, key: null, data: undefined, epoch: -1, cells: new Map(), top: Number.NaN };
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

  #bind(v: RowView, key: RowKey, d: DisplayedRows<T>, f: Frame<T>): void {
    const node = d.nodeAt(d.index(d.indexOf(key) as number)!);
    const data = node.kind === 'data' ? node.data : undefined;
    const same = v.key === key && v.data === data && v.epoch === f.epoch;
    v.key = key;
    if (same && this.#centerMatches(v, f)) return;
    v.data = data;
    v.epoch = f.epoch;
    setPx(v.el, 'block-size', f.rowHeight);
    setPx(v.el, 'inline-size', f.layout.totalWidth);
    setPx(v.segs.start, 'inline-size', f.layout.start.width);
    setPx(v.segs.center, 'inline-size', f.layout.center.width);
    setPx(v.segs.end, 'inline-size', f.layout.end.width);
    const wanted = new Set<string>();
    const place = (seg: HTMLElement, cols: readonly ResolvedColumn<any>[], widths: ColumnLayout['start']['widths'], from: number, to: number, absolute: boolean) => {
      let cursor: ChildNode | null = seg.firstChild;
      for (let c = from; c <= to; c++) {
        const col = cols[c]!;
        wanted.add(col.id);
        let cell = v.cells.get(col.id);
        if (!cell) {
          cell = this.#reuse(v) ?? this.#makeCell();
          v.cells.set(col.id, cell);
        }
        this.#fillCell(cell, col, data, f, widths.sizeAt(c), absolute ? widths.offsetOf(c) : null);
        if (cell.el === cursor) cursor = cursor.nextSibling;
        else seg.insertBefore(cell.el, cursor);
      }
    };
    const L = f.layout;
    place(v.segs.start, L.start.columns, L.start.widths, 0, L.start.columns.length - 1, false);
    if (f.cols) place(v.segs.center, L.center.columns, L.center.widths, f.cols.first, f.cols.last, true);
    place(v.segs.end, L.end.columns, L.end.widths, 0, L.end.columns.length - 1, false);
    for (const [id, cell] of v.cells) {
      if (wanted.has(id)) continue;
      cell.el.remove();
      v.cells.delete(id);
      cell.col = null;
      this.#spare.push(cell);
    }
  }

  readonly #spare: CellView[] = [];
  #reuse(_v: RowView): CellView | null {
    return this.#spare.pop() ?? null;
  }

  /** True when the row's centre cells are exactly the window's: then nothing needs placing. */
  #centerMatches(v: RowView, f: Frame<T>): boolean {
    const L = f.layout;
    const n = L.start.columns.length + L.end.columns.length + (f.cols ? f.cols.last - f.cols.first + 1 : 0);
    if (v.cells.size !== n) return false;
    if (!f.cols) return true;
    for (let c = f.cols.first; c <= f.cols.last; c++) if (!v.cells.has(L.center.columns[c]!.id)) return false;
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
