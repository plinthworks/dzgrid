import type { ColumnLayout, ResolvedColumn } from '@dzgrid/core';
import { setAttr, setPx } from './rows.js';

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

  render(layout: ColumnLayout, cols: { first: number; last: number } | null, height: number, colIndex: (id: string) => number, decorate: (col: ResolvedColumn<any>, el: HTMLElement) => void): void {
    setPx(this.row, 'block-size', height);
    setPx(this.row, 'inline-size', layout.totalWidth);
    setPx(this.#segs.start, 'inline-size', layout.start.width);
    setPx(this.#segs.center, 'inline-size', layout.center.width);
    setPx(this.#segs.end, 'inline-size', layout.end.width);
    const wanted = new Set<string>();
    const place = (seg: HTMLElement, slice: ColumnLayout['start'], from: number, to: number, absolute: boolean) => {
      let cursor: ChildNode | null = seg.firstChild;
      for (let c = from; c <= to; c++) {
        const col = slice.columns[c]!;
        wanted.add(col.id);
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
    place(this.#segs.start, layout.start, 0, layout.start.columns.length - 1, false);
    if (cols) place(this.#segs.center, layout.center, cols.first, cols.last, true);
    place(this.#segs.end, layout.end, 0, layout.end.columns.length - 1, false);
    for (const [id, el] of this.#cells) {
      if (wanted.has(id)) continue;
      el.remove();
      this.#cells.delete(id);
    }
  }

  cell(column: string): HTMLElement | null {
    return this.#cells.get(column) ?? null;
  }
}
