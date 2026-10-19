import type { ResolvedColumn } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import type { Frame } from '../render/rows.js';
import { mounted, type Mounted } from '../mounted.js';
import { popupsFor, type PopupRef } from '../popup.js';
import type { Commit } from './commit.js';
import type { Opener } from './floating.js';
import type { Resolve } from './resolve.js';

type C = SlotContext['filter'];

export interface Menu extends Opener {
  /** Opens the column's popup at `anchor` (by default the header button, else the header cell, else the floating cell). */
  open(column: string, anchor?: HTMLElement | null): boolean;
  close(): void;
  /** The header's button, mark and name (`FeatureHandle.decorateHeader`). */
  decorate(col: ResolvedColumn<unknown>, cell: HTMLElement): void;
  /** At each paint: the open popup follows the grid, or closes. */
  paint(f: Frame<unknown>): void;
}

const name = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
const set = (el: Element, k: string, v: string | null): void => {
  if (v === null) el.removeAttribute(k);
  else if (el.getAttribute(k) !== v) el.setAttribute(k, v);
};

/**
 * The filter popup (docs/behaviors/filter-ui.md, step 13): one per grid, a modal dialog in the
 * popup host, holding the column's `filter.<kind>` part. Opened by the header's button (a
 * second click closes it), Alt+ArrowDown on a header or floating cell (owner decision O2: the
 * feature's key, not the core's), a floating summary, or `openFilter`. Opening flushes the
 * column's pending edit; closing (Apply, Escape, the button again; never a click outside, O7)
 * applies the pending one in the browser, destroys the part, and puts the focus back on the
 * anchor (the grid's own focus when the anchor left). It closes too when its anchor leaves the
 * page or its column the column window (a focused header kept mounted out of view, D6), the
 * column's part changes or goes, or the direction changes (O9). While open, each
 * paint updates the part's context and places it again.
 */
export function menu(g: GridContext<unknown>, resolve: Resolve, commit: Commit, on: boolean): Menu {
  let cur: { readonly column: string; readonly anchor: HTMLElement; readonly ref: PopupRef; readonly m: Mounted<C>; readonly host: HTMLElement; readonly part: Part<C>; readonly dir: string } | null = null;
  const can = (col: ResolvedColumn<unknown>): boolean => on && !!resolve(col, 'filter').part;
  const expanded = (el: HTMLElement, v: boolean): void => {
    if (el.hasAttribute('aria-haspopup')) el.setAttribute('aria-expanded', String(v));
  };
  const close = (): void => cur?.ref.close();
  /** The part's context: the shared edits, the column's own operators, and `close`. */
  const draw = (m: Mounted<C>, host: HTMLElement, col: ResolvedColumn<unknown>, part: Part<C>): boolean => {
    const f = col.def.filter;
    return m.set(host, part, { ...commit.edits(col, resolve(col, 'filter').kind), ops: (f && f.ops) || [], close });
  };

  function open(column: string, anchor?: HTMLElement | null): boolean {
    const col = g.columns.get(column);
    const part = col && can(col) ? (resolve(col, 'filter').part as Part<C>) : null;
    const header = g.headerRenderer.cell(column);
    const at = anchor ?? header?.querySelector<HTMLElement>(':scope > .dzg-fbtn') ?? header ?? g.headerRenderer.cell(column, 1);
    if (!part || !at?.isConnected || !g.partBase) return false;
    close();
    // The floating box's edit first: the popup starts from the filter in force.
    commit.flush(column);
    const host = g.doc.createElement('div');
    host.className = 'dzg-fpop';
    const m = mounted<C>(g);
    if (!draw(m, host, col!, part)) return false;
    const ref = popupsFor(g).open(at, host, {
      placement: 'block-end', modal: true, label: g.msg('filter.popupLabel', { column: name(col!) }),
      onClose() {
        if (cur?.ref === ref) cur = null;
        // Closing applies what is pending in the browser; a grid going applies nothing.
        if (!g.scope.isDisposed) commit.flush(column);
        m.clear();
        expanded(at, false);
        g.schedule();
      },
    });
    // A field shown or hidden changes its size.
    host.addEventListener('change', () => ref.reposition());
    cur = { column, anchor: at, ref, m, host, part, dir: g.dir };
    expanded(at, true);
    m.focus();
    g.schedule();
    return true;
  }

  const toggle = (column: string, anchor: HTMLElement): void => void (cur?.column === column ? close() : open(column, anchor));

  // Alt+ArrowDown on a header or floating cell itself (not a box inside it, not a group header).
  g.scope.on(g.el.header, 'keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'ArrowDown' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !t.matches('.dzg-hcell:not(.dzg-hgroup)')) return;
    if (!open(t.dataset['col'] ?? '', t)) return;
    e.preventDefault();
    e.stopPropagation();
  });
  g.scope.on(g.el.header, 'click', (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.dzg-fbtn');
    const id = b?.closest<HTMLElement>('.dzg-hcell')?.dataset['col'];
    if (id) toggle(id, b!);
  });

  return {
    open,
    close,
    can,
    toggle,
    decorate(col, cell) {
      const filtered = col.id in g.kernel.query.filter;
      const has = can(col);
      let b = cell.querySelector<HTMLButtonElement>(':scope > .dzg-fbtn');
      set(cell, 'data-dzg-filtered', filtered ? '' : null);
      // The base set the sort's name (or none); the filter's joins it. With a button, the header
      // keeps its own name: the button's must not join it.
      const label = cell.getAttribute('aria-label') ?? name(col);
      set(cell, 'aria-label', filtered ? g.msg('header.withFilter', { header: label }) : has ? label : cell.getAttribute('aria-label'));
      set(cell, 'aria-keyshortcuts', has ? 'Alt+ArrowDown' : null);
      if (!has) return void b?.remove();
      if (!b) {
        b = g.doc.createElement('button');
        b.type = 'button';
        b.className = 'dzg-fbtn';
        b.tabIndex = -1;
        b.setAttribute('aria-haspopup', 'dialog');
        cell.append(b);
      }
      set(b, 'aria-label', g.msg('filter.popupLabel', { column: name(col) }));
      set(b, 'aria-expanded', String(cur?.column === col.id));
    },
    paint(f) {
      if (!cur) return;
      const { column, anchor, ref, m, host, part, dir } = cur;
      const col = g.columns.get(column);
      const at = f.layout.center.columns.findIndex((c) => c.id === column);
      const out = at >= 0 && (!f.cols || at < f.cols.first || at > f.cols.last);
      if (!col || out || !anchor.isConnected || g.dir !== dir || (can(col) ? resolve(col, 'filter').part : null) !== part) return close();
      draw(m, host, col, part);
      set(ref.el, 'aria-label', g.msg('filter.popupLabel', { column: name(col) }));
      ref.reposition();
    },
  };
}
