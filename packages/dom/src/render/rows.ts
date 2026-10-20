import { isolationFor } from './bidi.js';
import type { PartHandle, SlotContext, SlotPart } from '../part.js';
import { isBlank, REBASE, type ColumnLayout, type DisplayedRows, type LocaleCtx, type ResolvedColumn, type RowKey } from '@dzgrid/core';

/**
 * Body rows: recycled in DOM order, rebound, never rebuilt (S9, D7). Every
 * write is compared with what is there first, so a render where nothing
 * changed touches nothing.
 */
export interface CellView {
  readonly el: HTMLElement;
  /** The isolating span, made when a value first needs one; attached only while it does. */
  value: HTMLElement | null;
  readonly text: Text;
  col: ResolvedColumn<any> | null;
  inlineStart: number;
  inlineSize: number;
  /** A part drawing this cell, when its column has one (the text node is then detached). */
  part: SlotPart<'cell'> | null;
  handle: PartHandle<SlotContext['cell']> | null;
  /** The row a part failed on: not tried again until the cell shows another row, or this one changed. */
  failed: unknown;
  /** The context the part last had: `update` only when it changed. */
  last: SlotContext['cell'] | null;
  lastRev: number;
  /** The classes `ui.cellClass` gave it, as given (step 26). */
  cls: string;
}

export interface RowView {
  readonly el: HTMLElement;
  readonly segs: { readonly start: HTMLElement; readonly center: HTMLElement; readonly end: HTMLElement };
  key: RowKey | null;
  data: unknown;
  epoch: number;
  /** The focused column when the focus is in this row: a part is told `focused`. */
  focusCol: string | null;
  readonly cells: Map<string, CellView>;
  top: number;
  /** The selection box, first in the start segment, when the grid shows one (D8). */
  check: HTMLElement | null;
  /** The span plan the row was bound with (null: plain cells). */
  plan: RowPlan | null;
}

/** A cell where a span starts: what it covers, and its width (the columns it covers). */
export interface SpanPlace {
  readonly rows: number;
  readonly cols: number;
  readonly width: number;
}

/**
 * How one row's cells are laid out when spans are on (the spans feature makes
 * it). Columns are counted over the visible ones: start, centre, end.
 */
export interface RowPlan {
  /** Slots covered by a span from another cell: no element there. */
  readonly covered: ReadonlySet<number>;
  /** Cells where a span starts. */
  readonly cells: ReadonlyMap<number, SpanPlace>;
  /** Centre cells to mount out of the column window (a colspan across its edge). */
  readonly mount?: readonly number[];
  /** The row hosts a span cell (`data-spans`: its own stacking). */
  readonly spans: boolean;
}

/** The spans feature's side of the paint (`@dzgrid/dom/spans`); the base has none. */
export interface RowSpans {
  /** A row's plan, by display index; null for plain cells. */
  plan(index: number, key: RowKey): RowPlan | null;
}

export { CHECK_WIDTH, setAttr, setPx } from './write.js';
import { CHECK_WIDTH, setAttr, setPx } from './write.js';

/** One cell's value (coerced) and text (the codec's display): blank for a blank or unreadable value. */
export function cellValue<T>(col: ResolvedColumn<T>, row: Readonly<T>, ctx: LocaleCtx): { value: unknown; text: string } {
  let raw: unknown;
  try {
    raw = col.read(row);
  } catch {
    return { value: null, text: '' };
  }
  if (isBlank(raw)) return { value: null, text: '' };
  // A host codec that throws costs its cell, never the paint.
  try {
    const v = col.codec.coerce(raw, ctx);
    return v === null ? { value: null, text: '' } : { value: v, text: col.codec.format(v, ctx) };
  } catch {
    return { value: null, text: '' };
  }
}

export const cellText = <T>(col: ResolvedColumn<T>, row: Readonly<T>, ctx: LocaleCtx): string => cellValue(col, row, ctx).text;


export const range = (n: number) => Array.from({ length: n }, (_, i) => i);


export interface Frame<T> {
  readonly displayed: DisplayedRows<T>;
  readonly layout: ColumnLayout;
  /** Centre columns to mount, by index into `layout.center`. */
  readonly cols: { readonly first: number; readonly last: number } | null;
  /** Where a displayed row sits in the layer, and its height (from the row layout). */
  readonly rowTop: (i: number) => number;
  readonly rowHeight: (i: number) => number;
  readonly ctx: LocaleCtx;
  /** Bumped when columns, widths, language or messages change: cells are rechecked. */
  readonly epoch: number;
  /** Row header: the identity column. */
  readonly rowHeader: string | null;
  /** The focused cell: its centre column stays mounted in its row out of the window (D6). */
  readonly focusRow: RowKey | null;
  readonly focusCenter: number;
  /** The focused cell's column, when the focus is on a cell. */
  readonly focusColumn: string | null;
  /** Bumped when what a part's context carries changes beyond its row (messages). */
  readonly partRev: number;
  /** A selection box column before the start columns (D8): widths and indices shift by it. */
  readonly check: boolean;
  /** The grid's direction: whether a value needs isolating depends on it. */
  readonly dir: 'ltr' | 'rtl';
  /** Header rows above the body: body row i has aria-rowindex headerRows + 1 + i. */
  readonly headerRows: number;
  /** The cell part a column has, if any. */
  readonly partFor: (col: ResolvedColumn<any>) => SlotPart<'cell'> | null;
  /** What every part gets (language, direction, messages). */
  readonly partBase: Omit<SlotContext['cell'], 'value' | 'text' | 'row' | 'key' | 'column' | 'focused'>;
  /** A part's error: reported, its cell left empty. */
  readonly report: (err: unknown) => void;
  readonly colIndex: (id: string) => number;
  readonly rowAttrs: (key: RowKey, el: HTMLElement) => void;
  /** Span plans, when the spans feature is on. */
  readonly spans?: RowSpans | null;
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

  readonly #report: (err: unknown) => void;

  /** The part drawing a mounted cell, if any (Enter hands it the focus). */
  partAt(key: RowKey, column: string): PartHandle<SlotContext['cell']> | null {
    return this.#mounted.get(key)?.cells.get(column)?.handle ?? null;
  }

  constructor(doc: Document, layer: HTMLElement, report: (err: unknown) => void = () => {}) {
    this.#report = report;
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
    return { el, segs, key: null, data: undefined, epoch: -1, focusCol: null, cells: new Map(), top: Number.NaN, check: null, plan: null };
  }

  #makeCell(): CellView {
    const el = this.#doc.createElement('div');
    el.className = 'dzg-cell';
    el.tabIndex = -1;
    const text = this.#doc.createTextNode('');
    el.append(text);
    return { el, value: null, text, col: null, inlineStart: Number.NaN, inlineSize: Number.NaN, part: null, handle: null, failed: undefined, last: null, lastRev: -1, cls: '' };
  }

  /**
   * Mounts `wanted` (display indices, ascending) plus `retained` (keys kept
   * mounted wherever they are: the focused row first, S10, then the anchors
   * of tall cells). The focused row is never moved in the DOM; the others are
   * placed around it, in order.
   */
  render(f: Frame<T>, wanted: readonly number[], retained: readonly RowKey[]): void {
    const d = f.displayed;
    const keys: RowKey[] = wanted.map((i) => d.keyAt(d.index(i)!));
    for (const r of retained) {
      const ra = d.indexOf(r);
      if (ra === -1 || keys.includes(r)) continue;
      // In display order, like the rest.
      let at = 0;
      while (at < keys.length && d.indexOf(keys[at]!) < ra) at++;
      keys.splice(at, 0, r);
    }
    const want = new Set(keys);
    for (const [k, v] of this.#mounted) {
      if (want.has(k)) continue;
      v.el.remove();
      this.#mounted.delete(k);
      v.key = null;
      v.data = undefined;
      this.#pool.push(v);
    }
    // Only the focused row is never moved (S10); anchors are placed like any row.
    const kept = retained[0] !== undefined && retained[0] === f.focusRow ? this.#mounted.get(retained[0]) ?? null : null;
    for (const k of keys) {
      let v = this.#mounted.get(k);
      if (!v) {
        v = this.#pool.pop() ?? this.#makeRow();
        this.#mounted.set(k, v);
      }
      const i = d.indexOf(k) as number;
      this.#keys.set(v.el, k);
      this.#bind(v, k, i, d, f);
      // A row far from the window sits at its true distance, bounded (S11): never over the
      // visible rows, never past what the body (which clips) can hold.
      const top = Math.max(-2 * REBASE, Math.min(2 * REBASE, f.rowTop(i)));
      if (v.top !== top) {
        v.top = top;
        setPx(v.el, 'inset-block-start', top);
      }
      setAttr(v.el, 'aria-rowindex', String(f.headerRows + 1 + i));
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

  /**
   * The centre columns a row mounts, ascending: the window, the focused column
   * in the focused row, and the cells its plan asks for; never a covered slot.
   */
  #centerOf(key: RowKey, f: Frame<T>, plan: RowPlan | null): number[] {
    const out: number[] = [];
    if (f.cols) for (let c = f.cols.first; c <= f.cols.last; c++) out.push(c);
    const n = out.length;
    const add = (c: number) => {
      if (c >= 0 && !out.includes(c)) out.push(c);
    };
    if (key === f.focusRow) add(f.focusCenter);
    const s = f.layout.start.columns.length;
    if (plan) for (const c of plan.mount ?? []) add(c - s);
    if (out.length > n) out.sort((a, b) => a - b);
    return plan ? out.filter((c) => !plan.covered.has(s + c)) : out;
  }

  #bind(v: RowView, key: RowKey, i: number, d: DisplayedRows<T>, f: Frame<T>): void {
    const node = d.nodeAt(d.index(i)!);
    const data = node.kind === 'data' ? node.data : undefined;
    const plan = f.spans ? f.spans.plan(i, key) : null;
    const center = this.#centerOf(key, f, plan);
    const L = f.layout;
    const focusCol = key === f.focusRow ? f.focusColumn : null;
    const same = v.key === key && v.data === data && v.epoch === f.epoch && v.focusCol === focusCol && v.plan === plan;
    v.key = key;
    v.focusCol = focusCol;
    if (same && this.#matches(v, f, center, plan)) return;
    v.data = data;
    v.epoch = f.epoch;
    v.plan = plan;
    setPx(v.el, 'block-size', f.rowHeight(i));
    if (f.spans) setAttr(v.el, 'data-spans', plan?.spans ? '' : null);
    const extra = f.check ? CHECK_WIDTH : 0;
    setPx(v.el, 'inline-size', L.totalWidth + extra);
    setPx(v.segs.start, 'inline-size', L.start.width + extra);
    this.#checkCell(v, f.check);
    setPx(v.segs.center, 'inline-size', L.center.width);
    setPx(v.segs.end, 'inline-size', L.end.width);
    // Cells that go are taken out first: a focused cell is then never moved past them (a move blurs).
    const sn = L.start.columns.length;
    const en = sn + L.center.columns.length;
    const open = (at: number) => (c: number) => !plan?.covered.has(at + c);
    const starts = range(sn).filter(open(0));
    const ends = range(L.end.columns.length).filter(open(en));
    const wanted = new Set<string>();
    for (const c of starts) wanted.add(L.start.columns[c]!.id);
    for (const c of center) wanted.add(L.center.columns[c]!.id);
    for (const c of ends) wanted.add(L.end.columns[c]!.id);
    for (const [id, cell] of v.cells) {
      if (wanted.has(id)) continue;
      cell.el.remove();
      v.cells.delete(id);
      // A part never follows its host to another column.
      this.#unpart(cell);
      cell.col = null;
      this.#spare.push(cell);
    }
    const place = (seg: HTMLElement, cols: readonly ResolvedColumn<any>[], widths: ColumnLayout['start']['widths'], indices: Iterable<number>, absolute: boolean, at: number) => {
      let cursor: ChildNode | null = seg.firstChild;
      if (cursor && cursor === v.check) cursor = cursor.nextSibling;
      for (const c of indices) {
        const col = cols[c]!;
        let cell = v.cells.get(col.id);
        if (!cell) {
          cell = this.#spare.pop() ?? this.#makeCell();
          v.cells.set(col.id, cell);
        }
        // With spans on, every cell says whether one starts there (undefined: spans off).
        const span = f.spans ? plan?.cells.get(at + c) ?? null : undefined;
        this.#fillCell(cell, col, data, key, f, span?.width ?? widths.sizeAt(c), absolute ? widths.offsetOf(c) : null, span);
        if (cell.el === cursor) cursor = cursor.nextSibling;
        else seg.insertBefore(cell.el, cursor);
      }
    };
    place(v.segs.start, L.start.columns, L.start.widths, starts, false, 0);
    place(v.segs.center, L.center.columns, L.center.widths, center, true, sn);
    place(v.segs.end, L.end.columns, L.end.widths, ends, false, en);
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
  #matches(v: RowView, f: Frame<T>, center: readonly number[], plan: RowPlan | null): boolean {
    const L = f.layout;
    if (!!v.check !== f.check) return false;
    let n = center.length;
    for (const c of center) if (!v.cells.has(L.center.columns[c]!.id)) return false;
    // Every pinned slot not covered has its cell, and nothing else is there.
    const en = L.start.columns.length + L.center.columns.length;
    const pinned = (cols: readonly ResolvedColumn<any>[], at: number): boolean => {
      for (let c = 0; c < cols.length; c++) {
        if (plan?.covered.has(at + c)) continue;
        n++;
        if (!v.cells.has(cols[c]!.id)) return false;
      }
      return true;
    };
    return pinned(L.start.columns, 0) && pinned(L.end.columns, en) && v.cells.size === n;
  }

  /** Destroys a cell's part and gives the cell back its text node. */
  #unpart(cell: CellView): void {
    if (!cell.part) return;
    const handle = cell.handle;
    cell.part = null;
    cell.handle = null;
    cell.failed = undefined;
    cell.last = null;
    try {
      handle?.destroy?.();
    } catch (err) {
      // A part failing to clean up costs nothing more: reported, the cell given back.
      this.#report(err);
    }
    cell.el.replaceChildren(cell.text);
  }

  #fillCell(cell: CellView, col: ResolvedColumn<any>, data: unknown, key: RowKey, f: Frame<T>, w: number, x: number | null, span?: SpanPlace | null): void {
    if (cell.col !== col) {
      cell.col = col;
      setAttr(cell.el, 'data-col', col.id);
      setAttr(cell.el, 'data-align', col.def.align ?? (col.type === 'number' ? 'end' : null));
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
    // Spans on: what this cell covers, said only from two (null removes it).
    if (span !== undefined) {
      setAttr(cell.el, 'aria-rowspan', span && span.rows > 1 ? String(span.rows) : null);
      setAttr(cell.el, 'aria-colspan', span && span.cols > 1 ? String(span.cols) : null);
      setAttr(cell.el, 'data-span', span ? '' : null);
    }
    const { value, text } = data === undefined ? { value: null, text: '' } : cellValue(col, data as never, f.ctx);
    // The host's classes from the data (step 26, cell-class.md): diffed, never the grid's own (dzg-).
    const rule = col.def.ui?.cellClass;
    if (rule || cell.cls) {
      let next = '';
      try {
        if (rule && data !== undefined) next = rule({ value, text, row: data as never, key, column: col.id, context: f.partBase.context }) ?? '';
      } catch (err) {
        f.report(err);
      }
      if (next !== cell.cls) {
        const cut = (t: string) => t.split(/\s+/).filter((c) => c && !c.startsWith('dzg-'));
        const add = cut(next);
        for (const c of cut(cell.cls)) if (!add.includes(c)) cell.el.classList.remove(c);
        cell.el.classList.add(...add);
        cell.cls = next;
      }
    }
    const part = f.partFor(col);
    if (part || cell.part) {
      if (cell.part && cell.part !== part) this.#unpart(cell);
      if (part) {
        // A part that threw on this very row is not tried again at every paint.
        if (!cell.handle && cell.part === part && cell.failed === data) return;
        const focused = key === f.focusRow && col.id === f.focusColumn;
        const l = cell.last;
        // A rebind for the row height, the box column or the column window changes nothing a part sees.
        if (cell.handle && l && l.key === key && l.row === data && Object.is(l.value, value) && l.text === text && l.column === col && l.focused === focused && l.ctx === f.partBase.ctx && l.dir === f.partBase.dir && cell.lastRev === f.partRev) return;
        const c: SlotContext['cell'] = { ...f.partBase, value, text, row: data as never, key, column: col, focused };
        cell.last = c;
        cell.lastRev = f.partRev;
        try {
          if (!cell.handle) {
            cell.part = part;
            cell.el.replaceChildren();
            cell.handle = part.part.mount(cell.el, c);
          } else cell.handle.update?.(c);
        } catch (err) {
          // A part that throws costs its cell, for this row only: destroyed, the cell empty, the
          // error reported; the next row (or this one changed) mounts it afresh.
          this.#unpart(cell);
          cell.part = part;
          cell.failed = data;
          cell.el.replaceChildren();
          f.report(err);
        }
        return;
      }
    }
    if (cell.text.data !== text) cell.text.data = text;
    // Free text in its own direction, numbers left to right — only when the value needs it (S2).
    const iso = isolationFor(text, col.type, f.dir);
    if (iso) {
      if (!cell.value) cell.value = this.#doc.createElement('span');
      const cls = iso === 'free' ? 'dzg-free' : 'dzg-num';
      if (cell.value.className !== cls) cell.value.className = cls;
      if (cell.text.parentNode !== cell.value) cell.value.append(cell.text);
      if (cell.value.parentNode !== cell.el) cell.el.append(cell.value);
    } else if (cell.text.parentNode !== cell.el) {
      cell.el.append(cell.text);
      cell.value?.remove();
    }
  }

  /** What pooled rows still hold (tests: nothing). */
  pooledData(): unknown[] {
    return this.#pool.map((v) => v.data);
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

  /** The grid's end: every part destroyed, every row removed. */
  clear(): void {
    for (const v of [...this.#mounted.values(), ...this.#pool]) {
      for (const cell of v.cells.values()) this.#unpart(cell);
      v.el.remove();
    }
    for (const cell of this.#spare) this.#unpart(cell);
    this.#mounted.clear();
    this.#pool.length = 0;
  }
}
