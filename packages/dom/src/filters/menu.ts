import { instantToDayIn, type ResolvedColumn } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import type { Frame } from '../render/rows.js';
import { mounted, type Mounted } from '@dzgrid/dom/internal';
import { popupsFor, type PopupRef } from '../popup.js';
import type { Commit } from './commit.js';
import type { Opener } from './floating.js';
import type { Resolve } from './resolve.js';

type C = SlotContext['filter'];

export interface Menu extends Opener {
  /** Opens the column's popup at `anchor` (by default the header button, else the header cell, else the floating cell). */
  open(column: string, anchor?: HTMLElement | null): boolean;
  close(): void;
  /** The header's button and mark; returns its name (`FeatureHandle.decorateHeader`). */
  decorate(col: ResolvedColumn<unknown>, cell: HTMLElement, label: string | null): string | void;
  /** At each paint: the open popup follows the grid, or closes. */
  paint(f: Frame<unknown>): void;
}

const name = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
/** One empty list for every paint: a new one would make the part's context new each time. */
const NONE: readonly string[] = Object.freeze([]);
const set = (el: Element, k: string, v: string | null): void => {
  if (v === null) el.removeAttribute(k);
  else if (el.getAttribute(k) !== v) el.setAttribute(k, v);
};

/**
 * The filter popup (docs/behaviors/filter-ui.md, step 13): one per grid, a modal dialog in the
 * popup host, holding the column's `filter.<kind>` part. Opened by the header's button (a
 * second click closes it), Alt+ArrowDown on a header or floating cell (owner decision O2: the
 * feature's key, not the core's), a floating summary, or `openFilter`. Opening flushes the
 * column's pending edit; closing (Apply, Escape, the button again, a pointer down outside: owner
 * Q4 of step 18, revising O7) applies the pending one in the browser, destroys the part, and puts the focus back on the
 * anchor (the grid's own focus when the anchor left). An anchor that leaves while its cell stays
 * (the floating summary emptied by All or Clear) gives way to the cell. It closes when its cell
 * leaves the page or its column the column window, the column's part changes, goes or throws, or
 * the direction changes (O9). A column out of the window does not open (Alt+ArrowDown on a focused
 * header kept mounted out of view, D6, is left unhandled). While open, each paint updates the
 * part's context and places it again; nothing is moved or written as the grid goes.
 */
export function menu(g: GridContext<unknown>, resolve: Resolve, commit: Commit, on: boolean): Menu {
  let cur: { readonly column: string; anchor: HTMLElement; readonly cell: HTMLElement; readonly ref: PopupRef; readonly m: Mounted<C>; readonly host: HTMLElement; readonly part: Part<C>; readonly dir: string } | null = null;
  let frame: Frame<unknown> | null = null;
  /** The column is in the centre and out of the column window (its header kept mounted only for the focus). */
  const out = (column: string): boolean => {
    const at = frame ? frame.layout.center.columns.findIndex((c) => c.id === column) : -1;
    return at >= 0 && (!frame!.cols || at < frame!.cols.first || at > frame!.cols.last);
  };
  const can = (col: ResolvedColumn<unknown>): boolean => on && !!resolve(col, 'filter').part;
  const expanded = (el: HTMLElement, v: boolean): void => {
    if (el.hasAttribute('aria-haspopup')) el.setAttribute('aria-expanded', String(v));
  };
  const close = (): void => cur?.ref.close();
  /** The part's context: the shared edits, the column's own operators, today, and `close`. */
  const draw = (m: Mounted<C>, host: HTMLElement, col: ResolvedColumn<unknown>, part: Part<C>): boolean => {
    const f = col.def.filter;
    const today = instantToDayIn((g.settings.clock ?? Date.now)() as never, g.ctx.timeZone) ?? '1970-01-01';
    return m.set(host, part, { ...commit.edits(col, resolve(col, 'filter').kind, host), ops: (f && f.ops) || NONE, today, close, values: (o) => g.kernel.values(col.id, o) });
  };

  function open(column: string, anchor?: HTMLElement | null): boolean {
    const col = g.columns.get(column);
    const part = col && can(col) ? (resolve(col, 'filter').part as Part<C>) : null;
    const header = g.headerRenderer.cell(column);
    const at = anchor ?? header?.querySelector<HTMLElement>(':scope > .dzg-fbtn') ?? header ?? g.headerRenderer.cell(column, 1);
    if (!part || !at?.isConnected || !g.partBase || out(column)) return false;
    close();
    // The floating box's edit first: the popup starts from the filter in force.
    commit.flush(column);
    const host = g.doc.createElement('div');
    host.className = 'dzg-fpop';
    // For a host's global CSS (the popup is in the top layer, out of a component's scoped styles; owner Q5).
    host.dataset['column'] = column;
    host.dataset['kind'] = resolve(col!, 'filter').kind;
    const m = mounted<C>(g);
    if (!draw(m, host, col!, part)) return false;
    const ref = popupsFor(g).open(at, host, {
      placement: 'block-end', modal: true, label: g.msg('filter.popupLabel', { column: name(col!) }),
      // Only the control that toggles it is spared a press (a header cell's label or grip is outside).
      opener: (a) => (a.matches('[aria-haspopup]') ? a : a.querySelector<HTMLElement>(':scope>.dzg-fbtn,.dzg-hextra [aria-haspopup]')),
      onClose() {
        if (cur === it) cur = null;
        // Closing applies what is pending in the browser; a grid going applies nothing.
        if (!g.scope.isDisposed) commit.flush(column);
        m.clear();
        expanded(it.anchor, false);
        g.schedule();
      },
    });
    // A field shown or hidden changes its size.
    host.addEventListener('change', () => ref.reposition());
    const it = (cur = { column, anchor: at, cell: at.closest<HTMLElement>('[data-col]') ?? at, ref, m, host, part, dir: g.dir });
    expanded(at, true);
    m.focus();
    g.schedule();
    return true;
  }

  const toggle = (column: string, anchor: HTMLElement | null): void => void (cur?.column === column ? close() : open(column, anchor));

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
    decorate(col, cell, label) {
      const filtered = Object.hasOwn(g.kernel.query.filter, col.id);
      const has = can(col);
      let b = cell.querySelector<HTMLButtonElement>(':scope > .dzg-fbtn');
      set(cell, 'data-dzg-filtered', filtered ? '' : null);
      // The base's name (the sort's, or none); the filter's joins it. With a button, the header
      // keeps its own name: the button's must not join it.
      const own = label ?? name(col);
      const named = filtered ? g.msg('header.withFilter', { header: own }) : has ? own : undefined;
      if (!has) return b?.remove(), named;
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
      return named;
    },
    paint(f) {
      frame = f;
      if (!cur) return;
      const { column, cell, ref, m, host, part, dir } = cur;
      const col = g.columns.get(column);
      // The anchor gone, its cell kept (the floating summary emptied): the popup stays, on the cell.
      if (!cur.anchor.isConnected && cell.isConnected) ref.move((cur.anchor = cell));
      if (!col || out(column) || !cell.isConnected || g.dir !== dir || (can(col) ? resolve(col, 'filter').part : null) !== part || !draw(m, host, col, part)) return close();
      set(ref.el, 'aria-label', g.msg('filter.popupLabel', { column: name(col) }));
      ref.reposition();
    },
  };
}
