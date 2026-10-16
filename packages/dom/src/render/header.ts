import type { ColumnLayout, ResolvedColumn } from '@dzgrid/core';
import { CHECK_WIDTH, setAttr, setPx } from './rows.js';

/**
 * The header row, virtualised with the body's column window: assistive
 * technologies pair a header with a cell by DOM position (S4), so both hold
 * the same columns in the same order.
 */
export class HeaderRenderer {
  readonly row: HTMLElement;
  readonly #doc: Document;
  readonly #segs: { readonly start: HTMLElement; readonly center: HTMLElement; readonly end: HTMLElement };
  readonly #cells = new Map<string, HTMLElement>();
  /** The select-all box's header cell, when the grid shows a selection column. */
  check: HTMLElement | null = null;
  checkBox: HTMLElement | null = null;

  constructor(doc: Document, group: HTMLElement) {
    this.#doc = doc;
    this.row = doc.createElement('div');
    this.row.className = 'dzg-hrow';
    this.row.setAttribute('role', 'row');
    this.row.setAttribute('aria-rowindex', '1');
    const seg = (name: string) => {
      const s = doc.createElement('div');
      s.className = `dzg-seg dzg-seg-${name}`;
      s.setAttribute('role', 'presentation');
      this.row.append(s);
      return s;
    };
    this.#segs = { start: seg('start'), center: seg('center'), end: seg('end') };
    group.append(this.row);
  }

  render(layout: ColumnLayout, cols: { first: number; last: number } | null, height: number, colIndex: (id: string) => number, decorate: (col: ResolvedColumn<any>, el: HTMLElement) => void, keep = -1, check = false): void {
    const extra = check ? CHECK_WIDTH : 0;
    setPx(this.row, 'block-size', height);
    setPx(this.row, 'inline-size', layout.totalWidth + extra);
    setPx(this.#segs.start, 'inline-size', layout.start.width + extra);
    this.#checkCell(check);
    setPx(this.#segs.center, 'inline-size', layout.center.width);
    setPx(this.#segs.end, 'inline-size', layout.end.width);
    // The centre window, and the focused header's column out of it (D6).
    const center: number[] = [];
    if (cols) for (let c = cols.first; c <= cols.last; c++) center.push(c);
    if (keep >= 0 && !center.includes(keep)) {
      center.push(keep);
      center.sort((a, b) => a - b);
    }
    const wanted = new Set<string>([...layout.start.columns, ...center.map((c) => layout.center.columns[c]!), ...layout.end.columns].map((c) => c.id));
    for (const [id, el] of this.#cells) {
      if (wanted.has(id)) continue;
      el.remove();
      this.#cells.delete(id);
    }
    const place = (seg: HTMLElement, slice: ColumnLayout['start'], indices: readonly number[], absolute: boolean) => {
      let cursor: ChildNode | null = seg.firstChild;
      if (cursor && cursor === this.check) cursor = cursor.nextSibling;
      for (const c of indices) {
        const col = slice.columns[c]!;
        let el = this.#cells.get(col.id);
        if (!el) {
          el = this.#doc.createElement('div');
          el.className = 'dzg-hcell';
          el.setAttribute('role', 'columnheader');
          el.tabIndex = -1;
          el.dataset['col'] = col.id;
          const label = this.#doc.createElement('span');
          label.className = 'dzg-hlabel';
          el.append(label);
          this.#cells.set(col.id, el);
        }
        setAttr(el, 'aria-colindex', String(colIndex(col.id)));
        setPx(el, 'inline-size', slice.widths.sizeAt(c));
        if (absolute) setPx(el, 'inset-inline-start', slice.widths.offsetOf(c));
        else if (el.style.getPropertyValue('inset-inline-start')) el.style.removeProperty('inset-inline-start');
        // The host's own words (`header`), already translated; the id otherwise.
        const label = el.firstChild as HTMLElement;
        const text = col.def.header ?? col.id;
        if (label.textContent !== text) label.textContent = text;
        decorate(col, el);
        if (el === cursor) cursor = cursor.nextSibling;
        else seg.insertBefore(el, cursor);
      }
    };
    const range = (n: number) => Array.from({ length: n }, (_, i) => i);
    place(this.#segs.start, layout.start, range(layout.start.columns.length), false);
    place(this.#segs.center, layout.center, center, true);
    place(this.#segs.end, layout.end, range(layout.end.columns.length), false);
  }

  /** The select-all box: a real checkbox for assistive technologies, tri-state (D8). */
  #checkCell(on: boolean): void {
    if (!on) {
      this.check?.remove();
      this.check = this.checkBox = null;
      return;
    }
    if (!this.check) {
      const cell = this.#doc.createElement('div');
      cell.className = 'dzg-hcell dzg-check';
      cell.setAttribute('role', 'columnheader');
      cell.setAttribute('aria-colindex', '1');
      const box = this.#doc.createElement('span');
      box.className = 'dzg-box';
      box.setAttribute('role', 'checkbox');
      box.tabIndex = -1;
      cell.append(box);
      setPx(cell, 'inline-size', CHECK_WIDTH);
      this.check = cell;
      this.checkBox = box;
    }
    if (this.#segs.start.firstChild !== this.check) this.#segs.start.prepend(this.check);
  }

  cell(column: string): HTMLElement | null {
    return this.#cells.get(column) ?? null;
  }
}
