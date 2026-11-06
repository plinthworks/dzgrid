// Shared fixtures for `@dzgrid/dom/row-drag` (Phase 9, docs/behaviors/row-move.md; row-drag-plan.md R2–R3): the block
// feature's grid (`rmake`: synchronous paints, a fake geometry, frames the test runs) with `rowDrag()` added, the texts
// joined; a row's grip, a point at a fraction of a row's height (from the row layout, by hand), a grip pressed, dragged,
// released, and the browser's click after it. `app()`: an application that gives the rows back in their new order.
import { vi } from 'vitest';
import { dataKey, type GridEvent, type RowKey } from '@dzgrid/core';
import { moveRows } from '@dzgrid/core/row-drag';
import { rowDrag, type RowDragFeature, type RowDragOptions } from '../src/row-drag.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_ROW_DRAG } from '../src/locales/en-row-drag.js';
import { FR_ROW_DRAG } from '../src/locales/fr-row-drag.js';
import { AR_ROW_DRAG } from '../src/locales/ar-row-drag.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { HEADER, join, rmake, rowsOf, type R, type RMake } from './support-range.js';

export { cleanup, COLUMNS, HEADER, k, join, rowsOf, type R } from './support-range.js';

export const DMSG = { en: join(EN, EN_RANGE, EN_ROW_DRAG, EN_TREE), fr: join(FR, FR_RANGE, FR_ROW_DRAG, FR_TREE), ar: join(AR, AR_RANGE, AR_ROW_DRAG, AR_TREE) } as const;

export interface DragMake extends Omit<RMake, 'features'> {
  readonly drag?: RowDragOptions<R>;
  /** Features before `rowDrag()` (a tree, the selection rules…). */
  readonly before?: readonly GridFeature[];
  readonly after?: readonly GridFeature[];
  /** The block feature on the grid too (default: no). */
  readonly withRange?: boolean;
}

export type Moved = Extract<GridEvent<R>, { type: 'rowMove' }>;

/** A grid with `rowDrag()`, synchronous paints, a fake geometry. */
export function dmake(o: DragMake = {}) {
  const f: RowDragFeature<R> = rowDrag<R>(o.drag);
  const lang = o.lang ?? 'en';
  const t = rmake({ ...o, messages: o.messages ?? DMSG[lang], features: (r) => [...(o.withRange ? [r] : []), ...(o.before ?? []), f, ...(o.after ?? [])] });
  const rtl = lang === 'ar';
  t.ctx.el.root.getBoundingClientRect = () => t.vp.getBoundingClientRect();
  const own = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('dzg-rmove') ? t.vp.getBoundingClientRect() : own.call(this);
  });
  const K = (id: string): RowKey => dataKey(id)!;
  const api = () => f.api(t.g)!;
  const grip = (id: string) => t.rowEl(id)?.querySelector<HTMLElement>('.dzg-grip') ?? null;
  const grips = () => [...t.ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-grip')];
  /** A point over row `id` at `frac` of its height (0 its top), at logical x (default 60). */
  const over = (id: string, frac: number, x = 60) => {
    const d = t.g.kernel.rows.displayed;
    // never: the row is shown (its index, not -1), the layout's branded index
    const i = d.indexOf(K(id)) as never;
    const L = t.ctx.layout!;
    return { clientX: rtl ? 600 - x : x, clientY: HEADER + L.offsetOf(i) - t.ctx.scroll.logicalTop + L.heightOf(i) * frac };
  };
  /** Pressed on a row's grip. */
  const hold = (id: string, init: PointerEventInit = {}) => t.down(grip(id)!, over(id, 0.5, 10), init);
  /** A full drag from a row's grip to a point (or over a row at a fraction), released there, the browser's click after. */
  const drag = (id: string, to: { clientX: number; clientY: number } | [string, number], o2: { init?: PointerEventInit; noUp?: boolean } = {}) => {
    const p = Array.isArray(to) ? over(to[0], to[1]) : to;
    hold(id, o2.init);
    const p0 = over(id, 0.5, 10);
    t.move({ clientX: p0.clientX, clientY: p0.clientY + (p.clientY > p0.clientY ? 5 : -5) }, o2.init);
    t.move(p, o2.init);
    t.tick();
    if (o2.noUp) return;
    t.up(p, document, o2.init);
    t.click(t.ctx.el.root);
  };
  const moves = () => t.events.filter((e): e is Moved => e.type === 'rowMove');
  const layer = () => t.ctx.el.root.querySelector<HTMLElement>(':scope > .dzg-rmove');
  const bar = () => layer()?.querySelector<HTMLElement>('.dzg-rmove-bar') ?? null;
  const inside = () => layer()?.querySelector<HTMLElement>('.dzg-rmove-in') ?? null;
  const ghost = () => layer()?.querySelector<HTMLElement>('.dzg-rmove-ghost') ?? null;
  const dragging = () => t.ctx.el.root.hasAttribute('data-dzg-dragging');
  const order = () => {
    const d = t.g.kernel.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'data' ? (n.data as R).id : `(${n.kind})`;
    });
  };
  /** The application: gives the rows back in their new order on each event (`parent`: a parentId tree). */
  let rows: R[] | null = null;
  const app = (given: R[], tree = false) => {
    rows = given;
    t.g.kernel.subscribe((e) => {
      if (e.type !== 'rowMove' || e.applied) return;
      rows = moveRows(rows!, e, (r) => r.id, tree ? { parentId: (r) => r.parent, setParent: (r, p) => ({ ...r, parent: p === null ? null : String(p) }) } : {});
      (t.g.kernel.rows as { setRows(r: R[]): unknown }).setRows(rows);
    });
  };
  const altShift = (key: string, at?: Element) => t.press(key, { altKey: true, shiftKey: true }, at);
  return { ...t, f, K, api, grip, grips, over, hold, drag, moves, layer, bar, inside, ghost, dragging, order, app, altShift, rows: () => rows };
}

/** Rows r0…r{n-1} (the support's), and a tree: P0 (a0, a1, a2), P1 (b0, b1), P2 — every parent open by the caller. */
export const flatRows = (n = 6): R[] => rowsOf(n);
export const treeRows = (): R[] => {
  const r = (id: string, parent: string | null, n: number): R => ({ id, name: id, n, s: 's', q: n, parent });
  return [r('P0', null, 0), r('a0', 'P0', 1), r('a1', 'P0', 2), r('a2', 'P0', 3), r('P1', null, 4), r('b0', 'P1', 5), r('b1', 'P1', 6), r('P2', null, 7)];
};
