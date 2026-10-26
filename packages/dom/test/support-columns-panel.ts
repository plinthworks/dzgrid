// Shared fixtures for `@dzgrid/dom/columns-panel` (Phase 6 step 4, docs/behaviors/columns-chooser.md, step04-plan §5): the
// block feature's grid (`rmake`: synchronous paints, a fake geometry) with the chooser and, when asked, the column menu
// (`use.chooser`) and the moves; every text joined. The dialog's parts by their classes, a key on the focused element, a
// press outside, rows' boxes for the drag (jsdom has no layout: 32 px a row from y = 100, in the list's order).
import { vi } from 'vitest';
import type { ColumnDef, ColumnOrGroup } from '@dzgrid/core';
import { columnsChooser, type ColumnsChooserFeature, type ColumnsChooserOptions } from '../src/columns-panel.js';
import { columnMenu, type ColumnMenuFeature } from '../src/column-menu.js';
import { columns } from '../src/columns.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { FR_COLUMN_MENU } from '../src/locales/fr-column-menu.js';
import { AR_COLUMN_MENU } from '../src/locales/ar-column-menu.js';
import { join, rmake, type R, type RMake } from './support-range.js';
import { LiveRegion } from '../src/a11y/live-region.js';

export { cleanup, type R } from './support-range.js';

export const CMSG = {
  en: join(EN, EN_COLUMNS, EN_COLUMN_MENU),
  fr: join(FR, FR_COLUMNS, FR_COLUMN_MENU),
  ar: join(AR, AR_COLUMNS, AR_COLUMN_MENU),
} as const;

const c = (id: string, header: string, o: Partial<ColumnDef<R, any>> & { chooser?: false } = {}): ColumnDef<R, any> => ({ id, header, width: 120, value: (r: R) => r.id, ...o });
/** Six columns: Ref pinned to the start, Qty hidden, Note pinned to the end; `over` changes some. */
export const CCOLS = (over: Partial<Record<string, Partial<ColumnDef<R, any>> & { chooser?: false }>> = {}): ColumnDef<R, any>[] => [
  c('ref', 'Ref', { pinned: 'start', ...over['ref'] }),
  c('name', 'Name', over['name']),
  c('date', 'Date', over['date']),
  c('qty', 'Qty', { hidden: true, ...over['qty'] }),
  c('amount', 'Amount', over['amount']),
  c('note', 'Note', { pinned: 'end', ...over['note'] }),
];
export { c as ccol };

export interface CMake extends Omit<RMake, 'features' | 'columns' | 'feature'> {
  readonly columns?: readonly ColumnOrGroup<R>[];
  readonly chooser?: ColumnsChooserOptions;
  /** The menu (with `use.chooser`) and the moves. */
  readonly menu?: boolean;
}

export function cmake(o: CMake = {}) {
  let ch: ColumnsChooserFeature | null = null;
  let menu: ColumnMenuFeature | null = null;
  // Every sentence, the grid's live region's and the dialog's own (review of steps 3–4: inside the dialog while open).
  const spoken = vi.spyOn(LiveRegion.prototype, 'announce');
  const t = rmake({
    ...o,
    columns: (o.columns ?? CCOLS()) as ColumnDef<R, any>[],
    messages: o.messages ?? CMSG[o.lang ?? 'en'],
    features: () => {
      ch = columnsChooser(o.chooser);
      if (!o.menu) return [ch];
      const moves = columns();
      menu = columnMenu({ use: { columns: moves, chooser: ch } });
      return [moves, menu, ch];
    },
  });
  const { ctx } = t;
  /** The application's own button, outside the grid. */
  const appButton = document.body.appendChild(Object.assign(document.createElement('button'), { textContent: 'Columns' }));
  const api = () => ch!.api(t.g)!;
  const dialog = () => document.querySelector<HTMLElement>('.dzg-popup[role=dialog]');
  const panel = () => dialog()?.querySelector<HTMLElement>('.dzg-cp') ?? null;
  const search = () => panel()?.querySelector<HTMLInputElement>('input[type=search]') ?? null;
  const rowEls = () => [...(panel()?.querySelectorAll<HTMLElement>('li.dzg-cp-row') ?? [])];
  /** The listed columns, in the list's order. */
  const rows = () => rowEls().map((r) => r.dataset['col']!);
  const row = (id: string) => rowEls().find((r) => r.dataset['col'] === id) ?? null;
  const box = (id: string) => row(id)?.querySelector<HTMLInputElement>('input[type=checkbox]') ?? null;
  const act = (id: string, a: string) => row(id)?.querySelector<HTMLButtonElement>(`button[data-act=${a}]`) ?? null;
  const foot = (a: string) => panel()?.querySelector<HTMLButtonElement>(`.dzg-cp-foot button[data-act=${a}]`) ?? null;
  const checked = () => rowEls().filter((r) => r.querySelector<HTMLInputElement>('input')!.checked).map((r) => r.dataset['col']!);
  const off = (id: string) => box(id)?.getAttribute('aria-disabled') === 'true';
  const focused = () => {
    const a = document.activeElement as HTMLElement | null;
    return a === search() ? 'search' : a?.closest<HTMLElement>('li.dzg-cp-row')?.dataset['col'] ?? a?.dataset['act'] ?? a?.className ?? null;
  };
  /** A key on the focused element (or `at`). */
  const key = (k: string, mods: KeyboardEventInit = {}, at?: Element) => t.press(k, mods, at ?? (document.activeElement as Element));
  /** Types into the search box (one input event). */
  const type = (text: string) => {
    const s = search()!;
    s.value = text;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** A click as a browser makes it on a checkbox (its default flips it, then `change`) or on anything else. */
  const click = (el: Element) => {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true });
    if (el instanceof HTMLInputElement && el.type === 'checkbox') return void el.click();
    el.dispatchEvent(e);
  };
  /** Space on a checkbox as a browser makes it: keydown, then (not prevented) the click that flips it. */
  const space = (el: HTMLInputElement) => {
    const e = key(' ', {}, el);
    if (!e.defaultPrevented) el.click();
  };
  const outside = () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 9 }));
  const columnsChanged = () => t.events.filter((e) => e.type === 'columnsChanged');
  const shown = () => t.g.kernel.columns.visible().map((x) => x.id);
  /** Boxes for the drag: each row 32 px high from y = 100 in the list's order; a group's item spans its rows; the list 100–400. */
  const layout = () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const all = rowEls();
      const mine = this.matches('li.dzg-cp-row') ? [this] : this.matches('li') ? [...this.querySelectorAll<HTMLElement>('li.dzg-cp-row')] : [];
      const box = (top: number, bottom: number) => ({ left: 0, right: 300, top, bottom, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
      if (this.matches('.dzg-cp-list')) return box(100, 400);
      if (!mine.length) return box(0, 0);
      const ys = mine.map((r) => 100 + all.indexOf(r) * 32);
      return box(Math.min(...ys), Math.max(...ys) + 32);
    });
  };
  /** The middle of a row (its top half: `- 8`, its bottom half: `+ 8`). */
  const yOf = (id: string) => 100 + rows().indexOf(id) * 32 + 16;
  const pdown = (el: Element, y: number, init: PointerEventInit = {}) => {
    const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: 290, clientY: y, ...init });
    el.dispatchEvent(e);
    return e;
  };
  const pmove = (y: number, init: PointerEventInit = {}) => document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, buttons: 1, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: 290, clientY: y, ...init }));
  const pup = (y: number, init: PointerEventInit = {}) => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: 290, clientY: y, ...init }));
  const bar = () => panel()?.querySelector<HTMLElement>('.dzg-cp-bar') ?? null;
  const said = () => spoken.mock.calls.map((c) => c[0]);
  return { ...t, said, spoken, ch: () => ch!, menu: () => menu, appButton, api, dialog, panel, search, rowEls, rows, row, box, act, foot, checked, off, focused, key, type, click, space, outside, columnsChanged, shown, layout, yOf, pdown, pmove, pup, bar };
}
