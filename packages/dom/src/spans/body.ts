import type { CellFocus, DisplayedRows, RowKey } from '@dzgrid/core';
import type { RowSpanPlan } from '@dzgrid/core/spans';
import type { GridContext } from '../context.js';
import type { CellView, Frame, RowView } from '../render/rows.js';
import { CHECK_WIDTH, setAttr, setPx } from '../render/write.js';

/**
 * The spans feature's paint (step 9b blueprint B, spike S12), once the base
 * has placed the rows: tall cells drawn over the window, their travelling
 * label, the pinned cells of rows a tall cell touches, the stacking of the rows hosting tall cells, full-width rows. Reads no layout;
 * every write is compared first, so an unchanged repaint writes nothing.
 */

/** A tall cell as last drawn: the cell, and the rows it is drawn over (the window's part of it), for the pointer. */
interface Drawn {
  readonly at: CellFocus;
  readonly first: number;
  readonly last: number;
}

/** The pointer over a tall cell: the cell, and the row under the pointer. */
export interface Under {
  readonly at: CellFocus;
  readonly row: RowKey;
}

export interface Body {
  /** `win`: the rows of the window (with its margin), as the anchors were asked for. */
  paint(f: Frame<unknown>, win: { readonly first: number; readonly last: number } | null): void;
  /** The pointer over a tall cell: that cell and the row under the pointer; undefined elsewhere. */
  under(e: MouseEvent): Under | undefined;
}

export function createBody(g: GridContext<unknown>): Body {
  const { doc, el, rowRenderer } = g;
  const labels = new WeakMap<HTMLElement, HTMLElement>();
  let drawn = new Map<HTMLElement, Drawn>();
  /** Pinned cells this feature placed (a spanning row's): the renderer does not know of that write. */
  let placed = new Set<CellView>();
  let frame: Frame<unknown> | null = null;

  /** The cell's content into its label (the grid writes the cell's text, or a part, into the cell itself). */
  function wrap(cell: HTMLElement): void {
    let label = labels.get(cell);
    if (!label) {
      label = doc.createElement('div');
      label.className = 'dzg-span-label';
      labels.set(cell, label);
    }
    // A tree's toggle stays the cell's first child (`tree()` finds it there, spans.md « In a tree »).
    for (const n of [...cell.childNodes]) if (n !== label && !(n as Element).classList?.contains('dzg-toggle')) label.append(n);
    if (label.parentNode !== cell) cell.append(label);
  }

  /** A cell no longer tall: its content back in place, its geometry the row's. */
  function unwrap(cell: HTMLElement): void {
    const label = labels.get(cell);
    if (label?.parentNode === cell) label.replaceWith(...label.childNodes);
    for (const p of ['inset-block-start', 'block-size', '--dzg-span-at']) cell.style.removeProperty(p);
  }

  function paint(f: Frame<unknown>, win: { readonly first: number; readonly last: number } | null): void {
    frame = f;
    const root = el.root;
    // The label sticks under every header row; a full-width cell starts after the selection box.
    const h = g.rowHeight();
    setPx(root, '--dzg-header-h', [...g.bands, null, ...g.headerRows].reduce((s, r) => s + (r?.height ?? h), 0));
    const extra = f.check ? CHECK_WIDTH : 0;
    setPx(root, '--dzg-check-w', extra);
    const now = new Map<HTMLElement, Drawn>();
    const put = new Set<CellView>();
    const hosts: RowView[] = [];
    const rest: RowView[] = [];
    for (const rowEl of el.layer.children) {
      const v = rowRenderer.mounted.get(rowRenderer.keyOf(rowEl)!);
      if (!v) continue;
      const p = v.plan as RowSpanPlan | null;
      setAttr(v.el, 'data-full', p?.full ? '' : null);
      // A covered pinned slot leaves no hole: the pinned cells of the row are placed.
      if (p?.spans && !p.full) {
        for (const [id, x, start] of p.pinned) {
          const cell = v.cells.get(id);
          if (cell) {
            setPx(cell.el, 'inset-inline-start', x + (start ? extra : 0));
            put.add(cell);
          }
        }
      }
      for (const [id, s] of p?.tall ?? []) {
        const cell = v.cells.get(id)?.el;
        if (!cell) continue;
        // Drawn over the window (and its margin), never its whole extent; a focused cell far
        // from the window keeps one row.
        const end = s.row + s.rows - 1;
        let a = Math.max(s.row, win?.first ?? s.row);
        let b = Math.min(end, win?.last ?? end);
        if (a > b) a = b = s.row;
        const y = f.rowTop(a);
        const size = f.rowTop(b) + f.rowHeight(b) - y;
        setPx(cell, 'inset-block-start', y - v.top);
        setPx(cell, 'block-size', size);
        // The label at the span's centre, inside the part drawn; sticky does the rest.
        const lh = f.rowHeight(s.row);
        const mid = (f.rowTop(s.row) + f.rowTop(end) + f.rowHeight(end) - lh) / 2;
        setPx(cell, '--dzg-span-at', Math.max(0, Math.min(size - lh, mid - y)));
        wrap(cell);
        now.set(cell, { at: { kind: 'cell', row: v.key!, column: id }, first: a, last: b });
      }
      (p?.tall.length ? hosts : rest).push(v);
    }
    for (const cell of drawn.keys()) if (!now.has(cell)) unwrap(cell);
    drawn = now;
    // A pinned cell back in the flow (its row no longer spans, a full-width row, a spare cell):
    // its place goes, unless the renderer now owns it (a centre cell, placed by the grid).
    for (const c of placed) if (!put.has(c) && Number.isNaN(c.inlineStart)) c.el.style.removeProperty('inset-inline-start');
    placed = put;
    // By rank: an earlier host above the later ones (its tall cell covers them), all under the header.
    const z = (v: RowView, value: string) => {
      for (const seg of [v.segs.start, v.segs.end]) if (seg.style.zIndex !== value) seg.style.zIndex = value;
    };
    hosts.forEach((v, k) => z(v, `${2 + hosts.length - k}`));
    for (const v of rest) z(v, '');
  }

  function under(e: MouseEvent): Under | undefined {
    const cell = (e.target as Element | null)?.closest?.<HTMLElement>('.dzg-cell[aria-rowspan]');
    const at = cell ? drawn.get(cell) : undefined;
    const f = frame;
    if (!cell || !at || !f) return undefined;
    // From the cell's top, through the row layout: the last row starting above the pointer.
    const dy = e.clientY - cell.getBoundingClientRect().top + f.rowTop(at.first);
    let r = at.first;
    while (r < at.last && f.rowTop(r + 1) <= dy) r++;
    const d: DisplayedRows<unknown> = f.displayed;
    return { at: at.at, row: d.keyAt(d.index(r)!) };
  }

  return { paint, under };
}
