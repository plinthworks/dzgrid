// Shared fixtures for `@dzgrid/dom/column-menu` (Phase 6 step 3, docs/behaviors/column-menu.md, step03-plan §7): the
// block feature's grid (`rmake`: synchronous paints, a fake geometry) with the menu and, when asked, `edit()`, `range()`,
// `fill()`, `filters()`, `columns()` in a chosen order; every text joined. The ⋮ button pressed as a browser does it
// (pointerdown, mousedown, the native focus when not prevented, click), a right-click (button 2, then `contextmenu`),
// the open menu's items as `id` lists.
import type { ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { columnMenu, type ColumnMenuFeature, type ColumnMenuOptions } from '../src/column-menu.js';
import { columns, type ColumnsFeature } from '../src/columns.js';
import { edit } from '../src/edit.js';
import { fill, type FillFeature } from '../src/fill.js';
import { filters } from '../src/filters.js';
import type { GridFeature } from '../src/features.js';
import type { RangeFeature } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';
import { EN_FILL } from '../src/locales/en-fill.js';
import { FR_FILL } from '../src/locales/fr-fill.js';
import { AR_FILL } from '../src/locales/ar-fill.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { FR_COLUMN_MENU } from '../src/locales/fr-column-menu.js';
import { AR_COLUMN_MENU } from '../src/locales/ar-column-menu.js';
import { HEADER, join, rmake, type R, type RMake } from './support-range.js';

export { cleanup, join, R_, k, rowsOf, HEADER, type R } from './support-range.js';

export const MMSG = {
  en: join(EN, EN_RANGE, EN_EDIT, EN_FILL, EN_FILTERS, EN_COLUMNS, EN_COLUMN_MENU),
  fr: join(FR, FR_RANGE, FR_EDIT, FR_FILL, FR_FILTERS, FR_COLUMNS, FR_COLUMN_MENU),
  ar: join(AR, AR_RANGE, AR_EDIT, AR_FILL, AR_FILTERS, AR_COLUMNS, AR_COLUMN_MENU),
} as const;

/** Four editable columns of 100 px and more (the ⋮ drawn: ≥ 96 px), 420 px in the 600 px view; `over` changes some. */
export const MCOLS = (over: Partial<Record<string, Partial<ColumnDef<R, any>>>> = {}): ColumnDef<R, any>[] => [
  { id: 'name', header: 'Name', width: 120, editable: true, ...over['name'] },
  { id: 'n', header: 'N', type: 'number', width: 100, editable: true, ...over['n'] },
  { id: 's', header: 'S', width: 100, editable: true, ...over['s'] },
  { id: 'q', header: 'Q', type: 'number', width: 100, editable: true, ...over['q'] },
];

type With = 'edit' | 'range' | 'fill' | 'filters' | 'columns';
export interface MMake extends Omit<RMake, 'features' | 'columns' | 'feature'> {
  readonly columns?: ColumnDef<R, any>[];
  readonly menu?: ColumnMenuOptions | ((f: { range: RangeFeature; fill: FillFeature | null; columns: ColumnsFeature | null }) => ColumnMenuOptions);
  /** The other features on the grid (default: none). */
  readonly with?: readonly With[];
  /** The menu listed first (default: last). */
  readonly first?: boolean;
  /** The filters feature's own options. */
  readonly filters?: Parameters<typeof filters>[0];
  /** A menu feature object to reuse (several grids). */
  readonly menuFeature?: ColumnMenuFeature;
  readonly more?: readonly GridFeature[];
}

/** A grid with `columnMenu()` and the asked features; synchronous paints; the save records its requests. */
export function mmake(o: MMake = {}) {
  const w = new Set(o.with ?? []);
  const requests: SaveRequest<R>[] = [];
  let menu: ColumnMenuFeature | null = o.menuFeature ?? null;
  let cols: ColumnsFeature | null = null;
  let fil: FillFeature | null = null;
  const { menuFeature: _m, ...rest } = o;
  const t = rmake({
    ...rest,
    columns: o.columns ?? MCOLS(),
    messages: o.messages ?? MMSG[o.lang ?? 'en'],
    features: (r) => {
      cols = w.has('columns') ? columns() : null;
      fil = w.has('fill') ? fill(r) : null;
      const opts = typeof o.menu === 'function' ? o.menu({ range: r, fill: fil, columns: cols }) : o.menu;
      menu ??= columnMenu(opts);
      const rest: GridFeature[] = [
        ...(w.has('edit') || w.has('fill') ? [edit<R>({ save: (req) => void requests.push(req) }) as GridFeature] : []),
        ...(w.has('range') || w.has('fill') ? [r] : []),
        ...(fil ? [fil] : []),
        ...(w.has('filters') ? [filters(o.filters)] : []),
        ...(cols ? [cols] : []),
        ...(o.more ?? []),
      ];
      return o.first ? [menu, ...rest] : [...rest, menu];
    },
  });
  const { ctx } = t;
  const hcell = (col: string) => ctx.el.header.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]:not(.dzg-hgroup):not(.dzg-hextra)`);
  const btn = (col: string) => hcell(col)?.querySelector<HTMLButtonElement>(':scope > .dzg-mbtn') ?? null;
  const popup = () => ctx.el.root.querySelector<HTMLElement>('.dzg-popup:has([role=menu])');
  const list = () => ctx.el.root.querySelector<HTMLElement>('.dzg-popup [role=menu]');
  const items = () => [...(list()?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];
  const item = (id: string) => items().find((x) => x.dataset['id'] === id) ?? null;
  /** The entries of the open menu in order: item ids, `|` for a separator. */
  const entries = () => [...(list()?.querySelectorAll<HTMLElement>('[role^=menuitem], [role=separator]') ?? [])].map((x) => (x.getAttribute('role') === 'separator' ? '|' : x.dataset['id']!));
  const ids = () => items().map((x) => x.dataset['id']!);
  const off = (id: string) => item(id)?.getAttribute('aria-disabled') === 'true';
  const checked = (id: string) => item(id)?.getAttribute('aria-checked') === 'true';
  const focused = () => (document.activeElement as HTMLElement | null)?.dataset['id'] ?? null;
  /** A press as the browser makes it: pointerdown, mousedown, the native focus when neither is prevented; the click after (`click: false`: none). */
  const press = (el: Element, init: MouseEventInit & { pointerType?: string; click?: boolean } = {}) => {
    const r = el.getBoundingClientRect();
    const pt = { clientX: init.clientX ?? r.left + 1, clientY: init.clientY ?? r.top + 1 };
    const p = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: init.button ?? 0, buttons: 1, pointerId: 1, pointerType: init.pointerType ?? 'mouse', isPrimary: true, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, shiftKey: !!init.shiftKey, ...pt });
    el.dispatchEvent(p);
    const m = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: init.button ?? 0, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, shiftKey: !!init.shiftKey, ...pt });
    if (!p.defaultPrevented) el.dispatchEvent(m);
    if (!p.defaultPrevented && !m.defaultPrevented) el.closest<HTMLElement>('[tabindex], button, input')?.focus();
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: init.button ?? 0, pointerId: 1, pointerType: init.pointerType ?? 'mouse', isPrimary: true, ...pt }));
    if (init.click !== false) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: init.button ?? 0, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, shiftKey: !!init.shiftKey, ...pt }));
    return { p, m };
  };
  /** The ⋮ button pressed with the mouse (its click toggles the menu). */
  const open = (col: string) => press(btn(col)!);
  /** A `contextmenu` event on `el` at a point (0, 0: one a key made); returns it. */
  const context = (el: Element, init: MouseEventInit = {}) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 0, clientY: 0, ...init });
    el.dispatchEvent(e);
    return e;
  };
  /** A right-click on a header: the press with button 2 (no click), then `contextmenu` at the point. */
  const rclick = (col: string, init: MouseEventInit = {}) => {
    const el = hcell(col)!;
    const pt = { clientX: 30, clientY: 20, ...init };
    const { m } = press(el, { ...init, ...pt, button: 2, click: false });
    return { m, e: context(el, { ...init, ...pt }) };
  };
  /** A header focused (the kernel's focus and the DOM's), as a click would. */
  const focusHeader = (col: string) => {
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: col } }, 'api');
    hcell(col)!.focus();
  };
  /** A key on the focused element (or `at`). */
  const key = (k: string, mods: KeyboardEventInit = {}, at?: Element) => t.press(k, mods, at ?? (document.activeElement as Element));
  const menuApi = () => menu!.api(t.g)!;
  const order = () => t.g.kernel.columns.visible().map((c) => c.id);
  const of = (type: string) => t.events.filter((e) => e.type === type);
  return { ...t, requests, menu: () => menu!, cols: () => cols, fil: () => fil, hcell, btn, popup, list, items, item, entries, ids, off, checked, focused, press, open, context, rclick, focusHeader, key, menuApi, order, of, HEADER };
}
