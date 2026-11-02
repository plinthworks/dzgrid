// Shared fixtures for `@dzgrid/dom/context-menu` (Phase 9, docs/behaviors/context-menu.md, context-menu-plan §8): the
// block feature's grid (`rmake`: synchronous paints, a fake geometry) with the cell menu and, when asked, `edit()`,
// `fill()`, `tree()`, `pinnedRows()`, `csvExport()` (a stub with `run`), `columnMenu()`; every text joined. A right-click
// as a browser makes it (pointerdown, mousedown, the native focus when not prevented, then `contextmenu` at the point),
// the keys, the open menu's items as `id` lists.
import { vi, type Mock } from 'vitest';
import { pinnedKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { contextMenu, type ContextMenuFeature, type ContextMenuOptions } from '../src/context-menu.js';
import { columnMenu } from '../src/column-menu.js';
import { edit, type EditFeature } from '../src/edit.js';
import { fill, type FillFeature } from '../src/fill.js';
import { tree } from '../src/tree.js';
import { pinnedRows, type PinnedRowsFeature } from '../src/pinned-rows.js';
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
import { EN_TREE } from '../src/locales/en-tree.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { FR_PINNED } from '../src/locales/fr-pinned.js';
import { AR_PINNED } from '../src/locales/ar-pinned.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { FR_COLUMN_MENU } from '../src/locales/fr-column-menu.js';
import { AR_COLUMN_MENU } from '../src/locales/ar-column-menu.js';
import { EN_CONTEXT_MENU } from '../src/locales/en-context-menu.js';
import { FR_CONTEXT_MENU } from '../src/locales/fr-context-menu.js';
import { AR_CONTEXT_MENU } from '../src/locales/ar-context-menu.js';
import { join, rmake, rowsOf, type R, type RMake } from './support-range.js';

export { cleanup, join, R_, k, rowsOf, idOf, type R } from './support-range.js';

export const CMSG = {
  en: join(EN, EN_RANGE, EN_EDIT, EN_FILL, EN_TREE, EN_PINNED, EN_COLUMN_MENU, EN_CONTEXT_MENU),
  fr: join(FR, FR_RANGE, FR_EDIT, FR_FILL, FR_TREE, FR_PINNED, FR_COLUMN_MENU, FR_CONTEXT_MENU),
  ar: join(AR, AR_RANGE, AR_EDIT, AR_FILL, AR_TREE, AR_PINNED, AR_COLUMN_MENU, AR_CONTEXT_MENU),
} as const;

/** Four columns of 100 px and more; `name` read-only unless `over` says so. */
export const CCOLS = (over: Partial<Record<string, Partial<ColumnDef<R, any>>>> = {}): ColumnDef<R, any>[] => [
  { id: 'name', header: 'Name', width: 120, ...over['name'] },
  { id: 'n', header: 'N', type: 'number', width: 100, editable: true, ...over['n'] },
  { id: 's', header: 'S', width: 100, editable: true, ...over['s'] },
  { id: 'q', header: 'Q', type: 'number', width: 100, editable: true, ...over['q'] },
];

type With = 'edit' | 'fill' | 'tree' | 'pinned' | 'csv' | 'column-menu';
type Uses = { range: RangeFeature; fill: FillFeature | null; edit: EditFeature<R> | null; tree: ReturnType<typeof tree<R>> | null; pinned: PinnedRowsFeature<R> | null; csv: { run: Mock<(scope?: 'displayed') => Promise<unknown>> } | null };
export interface CMake extends Omit<RMake, 'features' | 'columns' | 'feature'> {
  readonly columns?: ColumnDef<R, any>[];
  /** The menu's options, or a function of the features made (`use` filled from them by default). */
  readonly menu?: ContextMenuOptions<R> | ((u: Uses) => ContextMenuOptions<R>);
  readonly with?: readonly With[];
  readonly along?: 'row' | 'column';
  /** `tree({ fixedOpen })`. */
  readonly fixedOpen?: (row: R) => boolean;
  /** `range({ canCopy })`. */
  readonly canCopy?: () => boolean;
  readonly top?: R[];
  readonly bottom?: R[];
  readonly more?: readonly GridFeature[];
}

/** A grid with `contextMenu()` (by default `use` = every feature made) and the asked features; synchronous paints. */
export function cmake(o: CMake = {}) {
  const w = new Set(o.with ?? []);
  const requests: SaveRequest<R>[] = [];
  let menu!: ContextMenuFeature<R>;
  let u!: Uses;
  const t = rmake({
    ...o,
    ...(o.canCopy && { range: { canCopy: o.canCopy } }),
    rows: o.rows ?? (w.has('tree') ? [{ ...rowsOf(1)[0]!, id: 'S', name: 'Service 1', parent: null }, ...rowsOf(3).map((r) => ({ ...r, id: `c${r.id}`, parent: 'S' })), ...rowsOf(10).map((r) => ({ ...r, parent: null }))] : undefined),
    columns: o.columns ?? CCOLS(),
    messages: o.messages ?? CMSG[o.lang ?? 'en'],
    features: (r) => {
      u = {
        range: r,
        fill: w.has('fill') ? fill(r, o.along ? { along: o.along } : {}) : null,
        edit: w.has('edit') || w.has('fill') ? edit<R>({ save: (req) => void requests.push(req) }) : null,
        tree: w.has('tree') ? tree<R>({ parentId: (x) => x.parent ?? null, ...(o.fixedOpen && { fixedOpen: o.fixedOpen }) }) : null,
        pinned: w.has('pinned') ? pinnedRows<R>({ ...(o.top && { top: o.top }), ...(o.bottom && { bottom: o.bottom }) }) : null,
        csv: w.has('csv') ? { run: vi.fn<(scope?: 'displayed') => Promise<unknown>>(async () => 'done') } : null,
      };
      const use = { range: r, ...(u.fill && { fill: u.fill }), ...(u.edit && { edit: u.edit }), ...(u.tree && { tree: u.tree }), ...(u.pinned && { pinned: u.pinned }), ...(u.csv && { csv: u.csv }) };
      menu = contextMenu<R>(typeof o.menu === 'function' ? o.menu(u) : (o.menu ?? { use }));
      return [
        ...(u.pinned ? [u.pinned] : []),
        ...(u.edit ? [u.edit as GridFeature] : []),
        r,
        ...(u.fill ? [u.fill] : []),
        ...(u.tree ? [u.tree] : []),
        ...(w.has('column-menu') ? [columnMenu({ use: { range: r } })] : []),
        ...(o.more ?? []),
        menu,
      ];
    },
  });
  const { ctx } = t;
  const list = () => ctx.el.root.querySelector<HTMLElement>('.dzg-popup [role=menu]');
  /** Every open menu list (the root, then its submenus). */
  const lists = () => [...ctx.el.root.querySelectorAll<HTMLElement>('.dzg-popup [role=menu]')];
  const items = (l = list()) => [...(l?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];
  const item = (id: string) => lists().flatMap((l) => items(l)).find((x) => x.dataset['id'] === id) ?? null;
  /** The open menu's entries in order: item ids, `|` for a separator. */
  const entries = () => [...(list()?.querySelectorAll<HTMLElement>('[role^=menuitem], [role=separator]') ?? [])].map((x) => (x.getAttribute('role') === 'separator' ? '|' : x.dataset['id']!));
  const ids = () => items().map((x) => x.dataset['id']!);
  const off = (id: string) => item(id)?.getAttribute('aria-disabled') === 'true';
  const focused = () => (document.activeElement as HTMLElement | null)?.dataset['id'] ?? null;
  /** A `contextmenu` event on `el` at a point (none: one a key made, at 0, 0); returns it. */
  const context = (el: Element, init: MouseEventInit & { pointerType?: string } = {}) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 0, clientY: 0, ...init });
    if (init.pointerType) Object.defineProperty(e, 'pointerType', { value: init.pointerType });
    el.dispatchEvent(e);
    return e;
  };
  /**
   * A right-click on a cell as the browser makes it: pointerdown and mousedown with button 2, the native focus when
   * neither is prevented, then `contextmenu` at the point. `ctrl`: a Mac's Ctrl+click (button 0, then the click after).
   */
  const rclick = (el: Element, init: { shiftKey?: boolean; pointerType?: string; ctrl?: boolean } = {}) => {
    const r = el.getBoundingClientRect();
    const pt = { clientX: r.left + 5 || 30, clientY: r.top + 5 || 60 };
    const button = init.ctrl ? 0 : 2;
    const mods = { shiftKey: !!init.shiftKey, ctrlKey: !!init.ctrl };
    const p = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button, buttons: button ? 2 : 1, pointerId: 1, pointerType: init.pointerType ?? 'mouse', isPrimary: true, ...pt, ...mods });
    el.dispatchEvent(p);
    const m = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button, ...pt, ...mods });
    if (!p.defaultPrevented) el.dispatchEvent(m);
    if (!p.defaultPrevented && !m.defaultPrevented) el.closest<HTMLElement>('[tabindex], input, button')?.focus();
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button, pointerId: 1, pointerType: init.pointerType ?? 'mouse', isPrimary: true, ...pt }));
    const e = context(el, { ...pt, ...mods, ...(init.pointerType && { pointerType: init.pointerType }) });
    let click: MouseEvent | null = null;
    if (init.ctrl) el.dispatchEvent((click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...pt, ...mods })));
    return { e, m, click };
  };
  /** A key on the focused element (or `at`). */
  const key = (k: string, mods: KeyboardEventInit = {}, at?: Element) => t.press(k, mods, at ?? (document.activeElement as Element));
  const menuApi = () => menu.api(t.g)!;
  const of = (type: string) => t.events.filter((e) => e.type === type);
  /** A band's cell (pinned rows). */
  const pcell = (side: 'top' | 'bottom', id: string, col = 'name') =>
    [...t.host.querySelectorAll<HTMLElement>('.dzg-pins > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === pinnedKey(side, id))?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  /** The cell `id/col` focused as a click would (the kernel's focus and the DOM's). */
  const focusAt = (id: string, col = 'name') => {
    t.focus(id, col);
    t.cell(id, col)!.focus();
  };
  return { ...t, requests, menu: () => menu, uses: () => u, list, lists, items, item, entries, ids, off, focused, context, rclick, key, menuApi, of, pcell, focusAt };
}

/** A fake `navigator.clipboard`: `write`, `writeText`, `readText` recorded; each resolves, rejects, or is missing. */
export function fakeClipboard(o: { write?: 'ok' | 'no' | 'missing'; writeText?: 'ok' | 'no'; read?: 'ok' | 'no' | 'missing'; text?: string; item?: boolean } = {}) {
  const calls: { kind: string; data?: unknown; sync: boolean }[] = [];
  let tick = false;
  const mark = () => (queueMicrotask(() => (tick = true)), !tick);
  const settle = (how: string | undefined, v?: unknown) => (how === 'no' ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : Promise.resolve(v));
  const clip: Record<string, unknown> = {
    writeText: vi.fn((s: string) => (calls.push({ kind: 'writeText', data: s, sync: mark() }), settle(o.writeText))),
  };
  if (o.write !== 'missing') clip['write'] = vi.fn((x: unknown) => (calls.push({ kind: 'write', data: x, sync: mark() }), settle(o.write)));
  if (o.read !== 'missing') clip['readText'] = vi.fn(() => (calls.push({ kind: 'readText', sync: mark() }), settle(o.read, o.text ?? '')));
  const had = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clip });
  const g = globalThis as { ClipboardItem?: unknown };
  const hadItem = g.ClipboardItem;
  if (o.item === false) delete g.ClipboardItem;
  else g.ClipboardItem = class { constructor(readonly data: Record<string, Blob>) {} };
  /** Marks the start of a gesture: calls made before the next microtask count as synchronous. */
  const begin = () => (tick = false);
  const restore = () => {
    if (had) Object.defineProperty(navigator, 'clipboard', had);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    if (hadItem === undefined) delete g.ClipboardItem;
    else g.ClipboardItem = hadItem;
  };
  return { calls, begin, restore, clip };
}
