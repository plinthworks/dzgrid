import { isolationFor } from './bidi.js';
import type { PartHandle, SlotContext, SlotPart } from '../part.js';
import { isBlank, REBASE, type ColumnLayout, type DetailNode, type DisplayedRows, type LocaleCtx, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { EditSeam } from '../features.js';

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
  /** A detail row's one cell (D8), where its part mounts; null on any other row. */
  slot: HTMLElement | null;
  /** The part mounted in `slot` (`@dzgrid/dom/detail`): destroyed by the base when the row goes. */
  part: PartHandle<SlotContext['detail']> | null;
  /** The classes `rowClass` gave it, as given (showcase themes step 6). */
  cls: string;
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
import { CHECK_WIDTH, setAttr, setPx, swapClasses } from './write.js';

/**
 * One cell's value (coerced) and text (the codec's display): blank for a blank or unreadable value. `read`:
 * the edit seam (the overlay, Phase 5 step 4), asked instead of the column for the row `key`.
 */
export function cellValue<T>(col: ResolvedColumn<T>, row: Readonly<T>, ctx: LocaleCtx, read?: EditSeam['read'] | null, key?: RowKey): { value: unknown; text: string } {
  let raw: unknown;
  try {
    raw = read ? read(col as ResolvedColumn<unknown>, row, key!) : col.read(row);
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
  /** The host's classes for a data row (`settings.rowClass`). */
  readonly rowClass?: ((c: { row: any; key: RowKey; context: unknown; pinned?: 'top' | 'bottom' }) => string | null | undefined) | undefined;
  /** The view's inline size: a detail row's cell is as wide (never wider than the columns). */
  readonly view?: number;
  /** The edit seam's reader (a feature's `edit`), else null: the column's own. */
  readonly read?: EditSeam['read'] | null | undefined;
  /** Some visible column is editable: whether a data cell cannot be edited (`aria-readonly`); null: none is. */
  readonly ro?: ((key: RowKey, column: string) => boolean) | null;
  /** The cell an editor is open in (retained-row contract 5): its value, part and classes are left alone. */
  readonly active?: { readonly key: RowKey; readonly column: string } | null | undefined;
}

export class RowRenderer<T> {
  readonly #doc: Document;
  readonly #layer: HTMLElement;
  readonly #mounted = new Map<RowKey, RowView>();
  /** Row element to its key: the DOM never holds a row's id. */
  readonly #keys = new WeakMap<Element, RowKey>();
  readonly #pool: RowView[] = [];
  /** The renderers spawned from this one (a tree's pinned parents): a touch reaches them. */
  readonly #spawned: RowRenderer<T>[] = [];
  /** Those spawned as peers (the pinned rows' bands, step 8b-1): their rows are the grid's too (`keyOf`, `cell`, `partAt`, `forEach`). */
  readonly #peers: RowRenderer<T>[] = [];
  /** Every row element made, for tests and the pool's high-water mark. */
  made = 0;
  /** Bumped by `touch` of a mounted row: a renderer that redraws on a signature (the pinned parents) redraws. */
  rev = 0;

  readonly #report: (err: unknown) => void;

  /** The part drawing a mounted cell, or a detail row's part, if any (Enter hands it the focus). */
  partAt(key: RowKey, column: string): PartHandle<SlotContext['cell']> | PartHandle<SlotContext['detail']> | null {
    const v = this.#mounted.get(key);
    return (v?.slot ? v.part : v?.cells.get(column)?.handle) ?? this.#peer((r) => r.partAt(key, column)) ?? null;
  }

  /** The first peer's answer: asked only when this renderer has none (a band's row is never the body's). */
  #peer<R>(fn: (r: RowRenderer<T>) => R | null | undefined): R | null | undefined {
    let x: R | null | undefined;
    for (const r of this.#peers) if ((x = fn(r))) break;
    return x;
  }

  constructor(doc: Document, layer: HTMLElement, report: (err: unknown) => void = () => {}) {
    this.#report = report;
    this.#doc = doc;
    this.#layer = layer;
  }

  /**
   * Another renderer of the same grid into `layer` (its own rows and pool): a tree's pinned parents (copies, never
   * focused), or with `peer` the pinned rows' bands (step 8b-1: real rows, found through this one).
   */
  spawn(layer: HTMLElement, peer?: boolean): RowRenderer<T> {
    const r = new RowRenderer<T>(this.#doc, layer, this.#report);
    this.#spawned.push(r);
    if (peer) this.#peers.push(r);
    return r;
  }

  /**
   * These rows bind again at the next paint (an edit shown: no event, the same data), here and in the spawned
   * renderers; `rev` moves only when a touched row is mounted here (a pinned stack redraws for its own rows).
   */
  touch(keys: Iterable<RowKey>): void {
    for (const k of keys) {
      const v = this.#mounted.get(k);
      if (v) (v.epoch = -1), this.rev++;
      for (const r of this.#spawned) r.touch([k]);
    }
  }

  get mounted(): ReadonlyMap<RowKey, RowView> {
    return this.#mounted;
  }

  /** The renderers spawned from this one (a tree's pinned parents): what a feature decorates on them (a block's tint). */
  get spawned(): readonly RowRenderer<T>[] {
    return this.#spawned;
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
    return { el, segs, key: null, data: undefined, epoch: -1, focusCol: null, cells: new Map(), top: Number.NaN, check: null, plan: null, slot: null, part: null, cls: '' };
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
      // A detail's part goes with its row (D8: destroyed when it leaves the window).
      this.#unslot(v);
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
    // Not a data row (a tree's filler, a detail): marked, never selected (tree-selection.md).
    setAttr(v.el, 'data-kind', data ? null : node.kind);
    if (node.kind === 'detail') return this.#whole(v, key, node, i, f);
    if (v.slot) this.#unslot(v);
    const plan = f.spans ? f.spans.plan(i, key) : null;
    const center = this.#centerOf(key, f, plan);
    const L = f.layout;
    const focusCol = key === f.focusRow ? f.focusColumn : null;
    const same = v.key === key && v.data === data && v.epoch === f.epoch && v.focusCol === focusCol && v.plan === plan;
    v.key = key;
    v.focusCol = focusCol;
    // Before the rest: a row of the same data laid out again (a measure, auto height) takes its new height.
    setPx(v.el, 'block-size', f.rowHeight(i));
    if (same && this.#matches(v, f, center, plan)) return;
    v.data = data;
    v.epoch = f.epoch;
    v.plan = plan;
    this.#rowClass(v, key, data, f);
    if (f.spans) setAttr(v.el, 'data-spans', plan?.spans ? '' : null);
    const extra = f.check ? CHECK_WIDTH : 0;
    setPx(v.el, 'inline-size', L.totalWidth + extra);
    setPx(v.segs.start, 'inline-size', L.start.width + extra);
    this.#checkCell(v, f.check, !!data);
    // The box is not a value to edit: read-only once the grid edits.
    if (v.check) setAttr(v.check, 'aria-readonly', f.ro ? 'true' : null);
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

  /**
   * A detail row (D8): no cells, no box, one gridcell over every column, named after the master's row
   * header, as wide as the view (sticky at the inline start, base CSS). Its height is written at every
   * render: a height set on the layout changes no epoch.
   */
  #whole(v: RowView, key: RowKey, node: DetailNode<unknown>, i: number, f: Frame<T>): void {
    const L = f.layout;
    const width = L.totalWidth + (f.check ? CHECK_WIDTH : 0);
    setPx(v.el, 'block-size', f.rowHeight(i));
    setPx(v.el, 'inline-size', width);
    // Another master's detail: its part is not this one's.
    if (v.key !== key) this.#unslot(v);
    v.key = key;
    v.focusCol = null;
    v.plan = null;
    this.#rowClass(v, key, undefined, f);
    for (const cell of v.cells.values()) {
      cell.el.remove();
      this.#unpart(cell);
      cell.col = null;
      this.#spare.push(cell);
    }
    v.cells.clear();
    this.#checkCell(v, false);
    let s = v.slot;
    if (!s) {
      s = this.#doc.createElement('div');
      s.className = 'dzg-dcell';
      s.setAttribute('role', 'gridcell');
      s.setAttribute('aria-colindex', '1');
      s.tabIndex = -1;
      v.el.append(s);
      v.slot = s;
    }
    setPx(s, 'inline-size', Math.min(f.view ?? width, width));
    setAttr(s, 'aria-colspan', String(L.start.columns.length + L.center.columns.length + L.end.columns.length + (f.check ? 1 : 0)));
    setAttr(s, 'aria-readonly', f.ro ? 'true' : null);
    // A new key comes from the pool or another detail: its data differs (a pooled row holds none).
    if (v.data !== node.data || v.epoch !== f.epoch) {
      v.data = node.data;
      v.epoch = f.epoch;
      const col = [...L.start.columns, ...L.center.columns, ...L.end.columns].find((c) => c.id === f.rowHeader);
      setAttr(s, 'aria-label', col ? cellText(col, node.data, f.ctx) : null);
    }
  }

  /** The host's classes for a data row from its data (none on a filler or a detail); a rule that throws is reported, its classes cleared. */
  #rowClass(v: RowView, key: RowKey, data: unknown, f: Frame<T>): void {
    let next = '';
    if (f.rowClass && data !== undefined) {
      try {
        next = f.rowClass({ row: data, key, context: f.partBase.context }) ?? '';
      } catch (err) {
        f.report(err);
      }
    }
    v.cls = swapClasses(v.el, v.cls, next);
  }

  /** A detail row's part destroyed (an error reported), its cell removed. */
  #unslot(v: RowView): void {
    const p = v.part;
    v.part = null;
    try {
      p?.destroy?.();
    } catch (err) {
      this.#report(err);
    }
    v.slot?.remove();
    v.slot = null;
  }

  /** The row's selection box: a cell for the column count, its box decorative (the row's aria-selected is the truth). */
  #checkCell(v: RowView, on: boolean, box?: boolean): void {
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
    // A row that cannot be selected keeps the cell (the columns line up), not its box.
    (v.check.firstChild as HTMLElement).hidden = !box;
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
      setAttr(cell.el, 'data-wrap', col.def.wrap ? '' : null);
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
    // Some column editable: a cell that cannot be edited says so (editing.md 3; a filler's, a loading row's too).
    setAttr(cell.el, 'aria-readonly', f.ro && (data === undefined || f.ro(key, col.id)) ? 'true' : null);
    // The cell an editor is open in keeps what it shows (retained-row contract 5).
    if (f.active && f.active.key === key && f.active.column === col.id) return;
    const { value, text } = data === undefined ? { value: null, text: '' } : cellValue(col, data as never, f.ctx, f.read, key);
    // The host's classes from the data (step 26, cell-class.md): diffed, never the grid's own (dzg-).
    const rule = col.def.ui?.cellClass;
    if (rule || cell.cls) {
      let next = '';
      try {
        if (rule && data !== undefined) next = rule({ value, text, row: data as never, key, column: col.id, context: f.partBase.context }) ?? '';
      } catch (err) {
        f.report(err);
      }
      cell.cls = swapClasses(cell.el, cell.cls, next);
    }
    // A part expects a row: none on a filler or a detail (their cells stay empty).
    const part = data === undefined ? null : f.partFor(col);
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

  /** Each mounted row, for attributes that follow state rather than data (selection), the peers' after. */
  forEach(fn: (key: RowKey, v: RowView) => void): void {
    for (const [k, v] of this.#mounted) fn(k, v);
    for (const r of this.#peers) r.forEach(fn);
  }

  keyOf(rowEl: Element): RowKey | undefined {
    return this.#keys.get(rowEl) ?? this.#peer((r) => r.keyOf(rowEl)) ?? undefined;
  }

  /** The cell element for a row and column, when mounted (a detail row's one cell, whatever the column). */
  cell(key: RowKey, column: string): HTMLElement | null {
    const v = this.#mounted.get(key);
    return v?.slot ?? v?.cells.get(column)?.el ?? this.#peer((r) => r.cell(key, column)) ?? null;
  }

  /** The grid's end: every part destroyed, every row removed. */
  clear(): void {
    for (const v of [...this.#mounted.values(), ...this.#pool]) {
      this.#unslot(v);
      for (const cell of v.cells.values()) this.#unpart(cell);
      v.el.remove();
    }
    for (const cell of this.#spare) this.#unpart(cell);
    this.#mounted.clear();
    this.#pool.length = 0;
  }
}
