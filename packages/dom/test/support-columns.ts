// Shared fixtures for `@dzgrid/dom/columns` (Phase 6 step 2, docs/behaviors/column-move.md, step02-plan §6): the block
// feature's grid (`rmake`: synchronous paints, a fake geometry, frames the test runs) with `columns()` added, the texts
// joined; a header's middle and a gap as client points (from the core's column layout, by hand), a header pressed,
// dragged, released, and the browser's click after it.
import { vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { columns, type ColumnsFeature, type ColumnsOptions } from '../src/columns.js';
import type { GridFeature } from '../src/features.js';
import type { RangeFeature } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';
import { CHECK_WIDTH } from '../src/render/write.js';
import { HEADER, join, rmake, type R, type RMake } from './support-range.js';

export { cleanup, COLUMNS, WIDE, HEADER, R_, k, join, rowsOf, type R } from './support-range.js';

export const CMSG = { en: join(EN, EN_RANGE, EN_COLUMNS), fr: join(FR, FR_RANGE, FR_COLUMNS), ar: join(AR, AR_RANGE, AR_COLUMNS) } as const;

export interface ColMake extends Omit<RMake, 'features'> {
  readonly cols?: ColumnsOptions;
  /** A `columns()` object to reuse (several grids, one feature). */
  readonly feature2?: ColumnsFeature;
  /** The block feature on the grid too (default: no). */
  readonly withRange?: boolean;
  readonly more?: readonly GridFeature[];
}

/** A grid with `columns()` (and, when asked, `range()` before it), synchronous paints, a fake geometry. */
export function colmake(o: ColMake = {}) {
  const f = o.feature2 ?? columns(o.cols);
  const lang = o.lang ?? 'en';
  const t = rmake({ ...o, messages: o.messages ?? CMSG[lang], features: (r: RangeFeature) => [...(o.withRange ? [r] : []), f, ...(o.more ?? [])] });
  const rtl = lang === 'ar';
  // The root's box: the view's (jsdom has no layout).
  t.ctx.el.root.getBoundingClientRect = () => t.vp.getBoundingClientRect();
  // The drag layer's box (inset 0 in the root): the view's too.
  const own = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('dzg-move') ? t.vp.getBoundingClientRect() : own.call(this);
  });
  const api = () => f.api(t.g)!;
  const hcell = (col: string) => t.ctx.el.header.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]:not(.dzg-hgroup):not(.dzg-hextra)`);
  const extra = () => (t.ctx.settings.selection?.checkbox && (t.ctx.settings.selection.mode ?? 'none') !== 'none' ? CHECK_WIDTH : 0);
  /** A logical x (from the view's start edge) as a client point in the header row. */
  const pt = (x: number, y = HEADER / 2) => ({ clientX: rtl ? 600 - x : x, clientY: y });
  /** The logical x of a header's middle. */
  const mid = (col: string) => {
    const p = t.at('r0', col);
    return rtl ? 600 - p.clientX : p.clientX;
  };
  /** Pressed on a header (or an element in it), mouse unless `init.pointerType`. */
  const hold = (col: string | Element, init: PointerEventInit = {}) => {
    const el = typeof col === 'string' ? hcell(col)! : col;
    const x = typeof col === 'string' ? mid(col) : mid(el.closest<HTMLElement>('.dzg-hcell')!.dataset['col']!);
    return t.down(el, pt(x), init);
  };
  let from: string | Element = '';
  /** A full drag from a header's middle to a logical x (and y), released there, with the browser's click on the header pressed. */
  const drag = (col: string | Element, x: number, o2: { y?: number; init?: PointerEventInit; noUp?: boolean; noClick?: boolean } = {}) => {
    from = col;
    hold(col, o2.init);
    const x0 = typeof col === 'string' ? mid(col) : mid((col as Element).closest<HTMLElement>('.dzg-hcell')!.dataset['col']!);
    t.move(pt(x0 + (x > x0 ? 5 : -5), o2.y), o2.init);
    t.move(pt(x, o2.y), o2.init);
    t.tick();
    if (o2.noUp) return;
    t.up(pt(x, o2.y), document, o2.init);
    if (!o2.noClick) t.click(typeof from === 'string' ? hcell(from) ?? t.ctx.el.header : from);
  };
  const shown = () => t.g.kernel.columns.visible().map((c) => c.id);
  const seg = (s: 'start' | 'center' | 'end') => t.g.kernel.columns.layout[s].columns.map((c) => c.id);
  const moved = () => t.events.filter((e) => e.type === 'columnsChanged');
  const sorted = () => t.events.filter((e) => e.type === 'sortChanged');
  const layer = () => t.ctx.el.root.querySelector<HTMLElement>(':scope > .dzg-move');
  const bar = () => layer()?.querySelector<HTMLElement>('.dzg-move-bar') ?? null;
  const ghost = () => layer()?.querySelector<HTMLElement>('.dzg-move-ghost') ?? null;
  const dragging = () => t.ctx.el.root.hasAttribute('data-dzg-dragging');
  /** A header focused (the kernel's focus and the DOM's), as a click would. */
  const focusHeader = (col: string) => {
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: col } }, 'api');
    hcell(col)!.focus();
  };
  const key = (k: string, mods: KeyboardEventInit = {}, at?: Element) => t.press(k, { shiftKey: true, ...mods }, at ?? (document.activeElement as Element));
  return { ...t, f, api, hcell, pt, mid, hold, drag, shown, seg, moved, sorted, layer, bar, ghost, dragging, focusHeader, key, extra };
}

/** Six columns: a, b, c, d, e, f of 100 px (600 px: no inline scroll); `over` changes some. */
export const SIX = (over: Partial<Record<string, Partial<ColumnDef<R, any>>>> = {}): ColumnDef<R, any>[] =>
  ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, header: id.toUpperCase(), width: 100, value: (r: R) => `${r.id}${id}`, ...over[id] }));
