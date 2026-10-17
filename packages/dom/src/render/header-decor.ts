import { formattersFor, type SortItem } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import { setAttr } from './rows.js';

/** The last column pinned to the end: its resize handle is on its start edge, the drag reversed (S2). */
export function isLastEnd<T>(g: GridContext<T>, id: string): boolean {
  const end = g.columns.layout.end.columns;
  return end.length > 0 && end[end.length - 1]!.id === id;
}

export function widthOf<T>(g: GridContext<T>, id: string): number {
  const L = g.columns.layout;
  for (const slice of [L.start, L.center, L.end]) {
    const i = slice.columns.findIndex((c) => c.id === id);
    if (i !== -1) return slice.widths.sizeAt(i);
  }
  return 0;
}

/**
 * A header's sort state (APG): `aria-sort` on the first sorted column only;
 * the direction and, in a multi-column sort, the precedence shown, the
 * precedence also in the header's name. And its resize handle.
 */
export function decorateHeader<T>(g: GridContext<T>, col: { id: string; sortable: boolean; def: { header?: string; resizable?: boolean } }, el: HTMLElement, sort: readonly SortItem[]): void {
  el.classList.toggle('dzg-sortable', col.sortable);
  let grip = el.querySelector<HTMLElement>(':scope > .dzg-resize');
  if (col.def.resizable === false) grip?.remove();
  else {
    if (!grip) {
      grip = g.doc.createElement('span');
      grip.className = 'dzg-resize';
      grip.setAttribute('aria-hidden', 'true');
      el.append(grip);
    }
    grip.classList.toggle('dzg-resize-start', isLastEnd(g, col.id));
  }
  const at = sort.findIndex((s) => s.column === col.id);
  setAttr(el, 'aria-sort', at === 0 ? (sort[0]!.dir === 'asc' ? 'ascending' : 'descending') : null);
  let mark = el.querySelector<HTMLElement>(':scope > .dzg-sort');
  if (at === -1) {
    mark?.remove();
    setAttr(el, 'aria-label', null);
    return;
  }
  if (!mark) {
    mark = g.doc.createElement('span');
    mark.className = 'dzg-sort';
    mark.setAttribute('aria-hidden', 'true');
    el.append(mark);
  }
  setAttr(mark, 'data-dir', sort[at]!.dir);
  const n = sort.length > 1 ? formattersFor(g.ctx).number()(at + 1) : '';
  if (mark.textContent !== n) mark.textContent = n;
  setAttr(el, 'aria-label', sort.length > 1 ? g.msg('header.withSort', { header: col.def.header ?? col.id, priority: g.msg('sort.priority', { n: at + 1 }) }) : null);
}
