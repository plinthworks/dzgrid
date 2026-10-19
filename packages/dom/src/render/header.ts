import type { ColumnLayout, ResolvedColumn } from '@dzgrid/core';
import { CHECK_WIDTH, setAttr, setPx, range } from './rows.js';

/**
 * A header row beyond the column headers (a floating filter row): the grid
 * makes its cells, one per mounted column, with the column headers' window
 * and order; `mount` fills a cell once per column, `update` at each paint.
 */
export interface HeaderRowSpec {
  readonly id: string;
  mount(cell: HTMLElement, column: ResolvedColumn<unknown>): void;
  update?(cell: HTMLElement, column: ResolvedColumn<unknown>): void;
  /** Its height; the row height otherwise. */
  readonly height?: number;
}

/** A header row's three segments. */
export interface HeaderSegments {
  readonly start: HTMLElement;
  readonly center: HTMLElement;
  readonly end: HTMLElement;
}

/**
 * A group row above the column headers (the spans feature): the grid makes
 * the row, its segments and its place; the feature fills the segments with
 * its group cells (`.dzg-hcell.dzg-hgroup`, a negative `data-level`).
 */
export interface HeaderBandSpec {
  readonly id: string;
  /** Fills the row's segments, at each paint. */
  paint(segs: HeaderSegments, p: HeaderPaint): void;
  /** The group cell over a column: where the focus goes. */
  cell(column: string): HTMLElement | null;
  /** Its height; the row height otherwise. */
  readonly height?: number;
}

export interface HeaderPaint {
  readonly layout: ColumnLayout;
  readonly cols: { readonly first: number; readonly last: number } | null;
  readonly height: number;
  readonly colIndex: (id: string) => number;
  readonly decorate: (col: ResolvedColumn<any>, el: HTMLElement) => void;
  /** A part drawing a column header's label (the slots feature): true when it did, the grid's text otherwise. */
  readonly content?: ((col: ResolvedColumn<any>, label: HTMLElement) => boolean) | undefined;
  /** The focused header cell: its centre column stays mounted in its row out of the window (D6). */
  readonly keep: { readonly center: number; readonly level: number } | null;
  readonly check: boolean;
  readonly selectAll: boolean;
  readonly extra: readonly HeaderRowSpec[];
  /** Group rows above the column headers, top to bottom. */
  readonly bands?: readonly HeaderBandSpec[];
}

/**
 * One header row: three segments, cells by column id. Its level is signed:
 * negative for the group rows above the column headers, 0 for them, positive
 * for the rows the features add under them.
 */
class HeaderRowView {
  readonly el: HTMLElement;
  readonly segs: HeaderSegments;
  readonly cells = new Map<string, HTMLElement>();
  check: HTMLElement | null = null;
  readonly level: number;
  readonly spec: HeaderRowSpec | null;
  readonly band: HeaderBandSpec | null;

  constructor(doc: Document, level: number, spec: HeaderRowSpec | null, band: HeaderBandSpec | null = null) {
    this.level = level;
    this.spec = spec;
    this.band = band;
    this.el = doc.createElement('div');
    this.el.className = 'dzg-hrow';
    this.el.setAttribute('role', 'row');
    this.el.setAttribute('aria-rowindex', String(level + 1));
    const seg = (name: string) => {
      const s = doc.createElement('div');
      s.className = `dzg-seg dzg-seg-${name}`;
      s.setAttribute('role', 'presentation');
      this.el.append(s);
      return s;
    };
    this.segs = { start: seg('start'), center: seg('center'), end: seg('end') };
  }
}

/**
 * The header rows, virtualised with the body's column window: assistive
 * technologies pair a header with a cell by DOM position (S4), so every row
 * holds the same columns in the same order.
 */
export class HeaderRenderer {
  readonly #doc: Document;
  readonly #group: HTMLElement;
  readonly #rows: HeaderRowView[] = [];
  /** The group rows, top to bottom (levels -depth to -1). */
  readonly #bands: HeaderRowView[] = [];
  /** The select-all box's header cell, when the grid shows a selection column. */
  check: HTMLElement | null = null;
  checkBox: HTMLElement | null = null;
  /** The box column's name when there is no select-all box (single mode). */
  checkName: HTMLElement | null = null;

  constructor(doc: Document, group: HTMLElement) {
    this.#doc = doc;
    this.#group = group;
    this.#rows.push(new HeaderRowView(doc, 0, null));
    group.append(this.#rows[0]!.el);
  }



  /** Paints every header row; returns their total height. */
  render(p: HeaderPaint): number {
    this.#syncRows(p.extra);
    this.#syncBands(p.bands ?? []);
    const depth = this.#bands.length;
    let total = 0;
    for (const view of this.#bands) total += this.#frame(view, p, depth);
    for (const view of this.#rows) total += this.#renderRow(view, p, depth);
    return total;
  }

  #syncBands(bands: readonly HeaderBandSpec[]): void {
    // Made once: the features (and so their group rows) are set up with the grid.
    if (bands.length === this.#bands.length) return;
    bands.forEach((b, i) => {
      const view = new HeaderRowView(this.#doc, i - bands.length, null, b);
      this.#bands.push(view);
      this.#group.insertBefore(view.el, this.#rows[0]!.el);
    });
  }

  /** A row's size, its place among the header rows, and its box column; returns its height. */
  #frame(view: HeaderRowView, p: HeaderPaint, depth: number): number {
    const { layout } = p;
    const height = (view.spec ?? view.band)?.height ?? p.height;
    const extra = p.check ? CHECK_WIDTH : 0;
    setAttr(view.el, 'aria-rowindex', String(view.level + depth + 1));
    setPx(view.el, 'block-size', height);
    setPx(view.el, 'inline-size', layout.totalWidth + extra);
    setPx(view.segs.start, 'inline-size', layout.start.width + extra);
    setPx(view.segs.center, 'inline-size', layout.center.width);
    setPx(view.segs.end, 'inline-size', layout.end.width);
    this.#checkCell(view, p.check, p.selectAll);
    view.band?.paint(view.segs, p);
    return height;
  }

  #syncRows(extra: readonly HeaderRowSpec[]): void {
    // Extra rows by spec identity: a feature that keeps its spec keeps its row and its cells.
    for (let i = 1; i < this.#rows.length; i++) {
      if (this.#rows[i]!.spec !== extra[i - 1]) {
        for (const v of this.#rows.splice(i)) v.el.remove();
        break;
      }
    }
    for (let i = this.#rows.length - 1; i < extra.length; i++) {
      const view = new HeaderRowView(this.#doc, i + 1, extra[i]!);
      this.#rows.push(view);
      this.#group.append(view.el);
    }
  }

  #renderRow(view: HeaderRowView, p: HeaderPaint, depth: number): number {
    const { layout } = p;
    const height = this.#frame(view, p, depth);
    // The centre window, and the focused header's column out of it, in its own row (D6).
    const center: number[] = [];
    if (p.cols) for (let c = p.cols.first; c <= p.cols.last; c++) center.push(c);
    const keep = p.keep && p.keep.level === view.level ? p.keep.center : -1;
    if (keep >= 0 && !center.includes(keep)) {
      center.push(keep);
      center.sort((a, b) => a - b);
    }
    const wanted = new Set<string>([...layout.start.columns, ...center.map((c) => layout.center.columns[c]!), ...layout.end.columns].map((c) => c.id));
    for (const [id, el] of view.cells) {
      if (wanted.has(id)) continue;
      el.remove();
      view.cells.delete(id);
    }
    const place = (seg: HTMLElement, slice: ColumnLayout['start'], indices: readonly number[], absolute: boolean) => {
      let cursor: ChildNode | null = seg.firstChild;
      if (cursor && cursor === view.check) cursor = cursor.nextSibling;
      for (const c of indices) {
        const col = slice.columns[c]!;
        let el = view.cells.get(col.id);
        if (!el) {
          el = this.#makeCell(view, col);
          view.cells.set(col.id, el);
        }
        setAttr(el, 'aria-colindex', String(p.colIndex(col.id)));
        setPx(el, 'inline-size', slice.widths.sizeAt(c));
        if (absolute) setPx(el, 'inset-inline-start', slice.widths.offsetOf(c));
        else if (el.style.getPropertyValue('inset-inline-start')) el.style.removeProperty('inset-inline-start');
        if (view.spec) view.spec.update?.(el, col);
        else {
          // The host's own words (`header`), already translated; the id otherwise. Or a part's.
          const label = el.firstChild as HTMLElement;
          const text = col.def.header ?? col.id;
          if (!p.content?.(col, label) && label.textContent !== text) label.textContent = text;
          p.decorate(col, el);
        }
        if (el === cursor) cursor = cursor.nextSibling;
        else seg.insertBefore(el, cursor);
      }
    };
    place(view.segs.start, layout.start, range(layout.start.columns.length), false);
    place(view.segs.center, layout.center, center, true);
    place(view.segs.end, layout.end, range(layout.end.columns.length), false);
    return height;
  }

  #makeCell(view: HeaderRowView, col: ResolvedColumn<any>): HTMLElement {
    const el = this.#doc.createElement('div');
    el.tabIndex = -1;
    el.dataset['col'] = col.id;
    if (view.spec) {
      // A cell of an extra row: no column header, no sort; its content is the feature's.
      el.className = 'dzg-hcell dzg-hextra';
      el.setAttribute('role', 'gridcell');
      el.dataset['level'] = String(view.level);
      view.spec.mount(el, col);
    } else {
      el.className = 'dzg-hcell';
      el.setAttribute('role', 'columnheader');
      const label = this.#doc.createElement('span');
      label.className = 'dzg-hlabel';
      el.append(label);
    }
    return el;
  }

  /** The select-all box (main row), or an empty cell keeping the column in the extra rows (D8). */
  #checkCell(view: HeaderRowView, on: boolean, selectAll: boolean): void {
    if (!on) {
      view.check?.remove();
      view.check = null;
      if (view.level === 0) this.check = this.checkBox = this.checkName = null;
      return;
    }
    if (!view.check) {
      const cell = this.#doc.createElement('div');
      cell.className = 'dzg-hcell dzg-check';
      cell.setAttribute('role', view.level === 0 ? 'columnheader' : 'gridcell');
      cell.setAttribute('aria-colindex', '1');
      setPx(cell, 'inline-size', CHECK_WIDTH);
      view.check = cell;
      if (view.level === 0) this.check = cell;
    }
    if (view.segs.start.firstChild !== view.check) view.segs.start.prepend(view.check);
    if (view.level !== 0) return;
    // The select-all box only where all can be selected (multi); the column stays for alignment.
    if (selectAll && !this.checkBox) {
      const box = this.#doc.createElement('span');
      box.className = 'dzg-box';
      box.setAttribute('role', 'checkbox');
      box.tabIndex = -1;
      view.check.append(box);
      this.checkBox = box;
    } else if (!selectAll && this.checkBox) {
      this.checkBox.remove();
      this.checkBox = null;
    }
    // A header needs words, not only a label (axe empty-table-header): read, not shown.
    if (!selectAll && !this.checkName) {
      this.checkName = this.#doc.createElement('span');
      this.checkName.className = 'dzg-sr';
      view.check.append(this.checkName);
    } else if (selectAll && this.checkName) {
      this.checkName.remove();
      this.checkName = null;
    }
  }

  cell(column: string, level = 0): HTMLElement | null {
    if (level < 0) return this.#bands[this.#bands.length + level]?.band!.cell(column) ?? null;
    return this.#rows[level]?.cells.get(column) ?? null;
  }
}
