import { editableAt, pinnedKey, type CellRange, type DisplayIndex, type FocusPos, type GridKernel, type KeyOwner, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { menuKey, menuList, needTexts } from '@dzgrid/dom/internal';
import type { GridFeature } from '../features.js';
import type { ContextMenuMessageKey } from '../part-texts.js';
import { pointOf, type Point } from '../dir.js';
import type { MenuEntry, MenuGrid, MenuItem } from '../menu/types.js';

export type { MenuEntry, MenuItem };
/** The texts `contextMenu()` needs, from `@dzgrid/dom/locales/<lang>-context-menu`. */
export const CONTEXT_MENU_KEYS = 'label copy copyHeaders cut paste useCopyKey usePasteKey fillDown fillEnd undo redo expand collapse pinTop pinBottom unpin pinnedTop pinnedBottom unpinned exportCsv'
  .split(' ').map((k) => `cmenu.${k}`) as readonly ContextMenuMessageKey[];

type Grid = MenuGrid;
/** What `range()` gives the menu (its `api(grid)`): the block and the clipboard's text. */
export interface RangeApiLike {
  get(): CellRange | null;
  box(): { readonly top: number; readonly bottom: number; readonly start: number; readonly end: number } | null;
  copy(o?: { readonly headers?: boolean }): { readonly text: string; readonly html: string } | null;
  cut(): unknown;
  paste(text: string): unknown;
}
/** What `fill()` gives it: Ctrl+D and Ctrl+R, its one way (`along`), whether a key would be taken now. */
export interface FillApiLike {
  down(o?: { readonly user?: boolean }): unknown;
  end(o?: { readonly user?: boolean }): unknown;
  readonly along?: 'row' | 'column';
  can?(end: boolean): boolean;
}
/** What `edit()` gives it: undo and redo. */
export interface EditApiLike {
  undo(): unknown;
  redo(): unknown;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
/** What `tree()` gives it: a row's state and its toggle. */
export interface TreeApiLike {
  state(key: RowKey): 'open' | 'closed' | 'fixed' | null;
  toggle(key: RowKey, open?: boolean): boolean;
}
/** What `pinnedRows()` gives it: the bands' rows, as the application gave them. */
export interface PinnedRowsApiLike<T> {
  set(rows: { readonly top?: readonly T[]; readonly bottom?: readonly T[] }): void;
  get(): { readonly top: readonly T[]; readonly bottom: readonly T[] };
}
/** What `statusBar()` gives it: the block's figures said on demand (« Read the totals »). */
export interface StatusApiLike {
  announce(): void;
  stats(): object | null;
}
/** What the cell menu's items act on (and the application's items get). */
export interface CellMenuContext<T = unknown> {
  /** The data row (a band's row too). */
  readonly row: T;
  readonly key: RowKey;
  readonly column: ResolvedColumn<T>;
  /** As the grid reads it (the edits applied), not formatted. */
  readonly value: unknown;
  /** The block the menu acts on; null: the cell alone. */
  readonly block: CellRange | null;
  readonly band: 'top' | 'bottom' | null;
  readonly kernel: GridKernel<T, any>;
  readonly grid: Grid;
  /** A sentence for the grid's live region. */
  say(text: string): void;
}
export interface ContextMenuOptions<T = unknown> {
  /** The features the default items drive, through their `api(grid)` only (typed: the menu ships none of them). Absent: their items are absent. */
  readonly use?: {
    /** Copy, Copy with headers; with `edit` Cut and Paste. */
    readonly range?: { api(grid: Grid): RangeApiLike | null };
    /** Fill down / Fill right, by its `along`. */
    readonly fill?: { api(grid: Grid): FillApiLike | null };
    /** Undo / Redo; Cut and Paste need it too. */
    readonly edit?: { api(grid: Grid): EditApiLike | null };
    /** Export to CSV (the displayed rows). */
    readonly csv?: { run(scope?: 'displayed'): Promise<unknown> };
    /** Expand / Collapse on a parent row. */
    readonly tree?: { api(grid: Grid): TreeApiLike | null };
    /** Pin / Unpin the row (owner Q-CM3 A). */
    readonly pinned?: { api(grid: Grid): PinnedRowsApiLike<T> | null };
    /** « Read the totals » on a cell of the block (`statusBar()`, owner Q-SB3; its label from the status bar's texts). */
    readonly status?: { api(grid: Grid): StatusApiLike | null };
  };
  /** The application's items: the defaults kept, reordered, removed or added to. A throw: the defaults, reported. */
  readonly items?: (c: CellMenuContext<T>, defaults: readonly MenuEntry<CellMenuContext<T>>[]) => readonly MenuEntry<CellMenuContext<T>>[];
  /** Host classes (Tailwind, Bootstrap): on the list and on every item. */
  readonly classes?: { readonly menu?: string; readonly item?: string };
  /** Told after « Pin » / « Unpin » changed a band (Q-CM3 A): the application keeps its pinned rows. */
  readonly onPin?: (rows: { readonly top: readonly T[]; readonly bottom: readonly T[] }) => void;
}
export interface ContextMenuApi {
  /** Opens on a shown data cell (an app's own button, Q-CM1), at a point or under the cell; false when it cannot. */
  open(at: { readonly row: RowKey; readonly column: string }, point?: Point): boolean;
  close(): void;
  /** The cell whose menu is open, or null. */
  current(): { readonly row: RowKey; readonly column: string } | null;
}
export interface ContextMenuFeature<T = unknown> extends GridFeature {
  /** The menu of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: Grid): ContextMenuApi | null;
  /** Type only: the rows' type. */
  readonly __rows?: T;
}

type Cell = { readonly row: RowKey; readonly column: string };

/**
 * `contextMenu(options)`: the cell menu (docs/behaviors/context-menu.md; context-menu-plan; owner Q-CM1–Q-CM4). A
 * right-click on a body or band cell (Shift+right-click keeps the browser's), Shift+F10 and the Menu key on a focused
 * cell, a Mac's Ctrl+click: the column menu's list (shared, one menu per grid) with copy, cut, paste, fill, undo, the
 * tree's toggle, pin and export, each as its key, then the application's items. Inside the block it acts on the block;
 * outside, the cell is focused first. Nothing to offer, a finger, a pen, an open editor: the browser's own menu.
 */
export function contextMenu<T = unknown>(o: ContextMenuOptions<T> = {}): ContextMenuFeature<T> {
  const apis = new WeakMap<object, ContextMenuApi>();
  return {
    id: 'context-menu',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      needTexts(g, CONTEXT_MENU_KEYS, 'context-menu');
      const { kernel, el, scope, columns: m } = g;
      const grid = { kernel };
      const L = menuList(g);
      const mine = {};
      const say = (t: string): void => g.live.announce(t);
      const T = (k: string, p?: Record<string, string>): string => g.msg(`cmenu.${k}` as ContextMenuMessageKey, p);
      const mod = g.mac ? 'Meta+' : 'Control+';
      const R = (): RangeApiLike | null | undefined => o.use?.range?.api(g);
      let cur: (Cell & { readonly dir: string; readonly ctx: object }) | null = null;
      let kind = '';

      const nodeOf = (key: RowKey) => {
        const d = g.rowsOf?.(key) || g.rows.displayed;
        const i = d.indexOf(key);
        const n = i < 0 ? null : d.nodeAt(i as DisplayIndex);
        return n?.kind === 'data' ? n : null;
      };
      /** A data cell of this grid under the target (a body's or a band's); none for a control in it, a filler, a detail, a nested grid. */
      const cellOf = (t: Element): (Cell & { readonly el: HTMLElement }) | null => {
        const c = t.closest?.<HTMLElement>('.dzg-cell');
        const row = c?.closest('.dzg-row');
        const key = row && c!.closest('.dzg') === el.root && !t.closest('input, textarea, select, button, a[href], [contenteditable]') && g.rowRenderer.keyOf(row);
        return key && nodeOf(key) ? { row: key, column: c!.dataset['col']!, el: c! } : null;
      };
      /** The block when the cell is inside it (its box: the rows of its band, the visible columns), else null. */
      const inBlock = (c: Cell): CellRange | null => {
        const r = R();
        const b = r?.box();
        const x = r?.get();
        if (!b || !x) return null;
        const i = (g.rowsOf?.(x.anchor.row) || g.rows.displayed).indexOf(c.row);
        const j = m.visible().indexOf(m.get(c.column)!);
        return i >= b.top && i <= b.bottom && j >= b.start && j <= b.end ? x : null;
      };
      const ctxOf = (c: Cell, block: CellRange | null): CellMenuContext<T> | null => {
        const n = nodeOf(c.row);
        const col = m.get(c.column) as ResolvedColumn<T> | undefined;
        if (!n || !col) return null;
        let value: unknown;
        try {
          value = g.edit ? g.edit.read(col as ResolvedColumn<unknown>, n.data, c.row) : col.read(n.data as T);
        } catch {}
        return { row: n.data as T, key: c.row, column: col, value, block, band: n.pinned ?? null, kernel: kernel as GridKernel<T, any>, grid, say };
      };

      // ---- The system clipboard (ARCHITECTURE §3.8): asked inside the gesture, before any wait; refused, a sentence. ----
      /** Refused or missing: « Use Ctrl+C to copy » (`C`) or « … to paste » (`V`), ⌘ on a Mac. */
      const no = (k: 'C' | 'V') => (): void => say(T(k > 'C' ? 'usePasteKey' : 'useCopyKey', { keys: (g.mac ? '⌘' : 'Ctrl+') + k }));
      /** A call to the clipboard: its promise, or its throw (none there, an insecure page) as a refusal. */
      const ask = <X>(f: (c: Clipboard) => Promise<X>): Promise<X> => {
        try {
          return f(g.win!.navigator.clipboard);
        } catch (err) {
          return Promise.reject(err);
        }
      };
      const put = (x: { readonly text: string; readonly html: string } | null): Promise<unknown> | undefined => {
        const Item = (g.win as { ClipboardItem?: typeof ClipboardItem } | null)?.ClipboardItem;
        const b = (s: string, type: string) => new Blob([s], { type });
        return x ? ask((c) => (Item && c.write ? c.write([new Item({ 'text/plain': b(x.text, 'text/plain'), 'text/html': b(x.html, 'text/html') })]) : c.writeText(x.text))) : undefined;
      };

      /** The built-in entries for a cell, by section (context-menu.md 9–15), separators between the sections. */
      const defaults = (c: CellMenuContext<T>): MenuEntry<CellMenuContext<T>>[] => {
        const it = (id: string, action: () => unknown, disabled = false, k?: string): MenuItem<CellMenuContext<T>> =>
          ({ id, label: T(id.replace(/\.(.)/, (_, x: string) => x.toUpperCase())), action, disabled, ...(k && { keys: k[1] ? k : mod + k }) });
        const r = R();
        const f = o.use?.fill?.api(g);
        const e = o.use?.edit?.api(g);
        const tr = o.use?.tree?.api(g)?.state(c.key);
        const p = o.use?.pinned?.api(g);
        const csv = o.use?.csv;
        const st = o.use?.status?.api(g);
        const b = c.block && r?.box();
        // Cut: disabled when no cell of the block (or the cell) is editable; Paste: when its target (the block's first cell) is read-only.
        const d = g.rowsOf?.(c.block?.anchor.row ?? c.key) || g.rows.displayed;
        // The cell alone: a box of one (its row, its column).
        const i0 = d.indexOf(c.key);
        const j0 = m.visible().indexOf(c.column as never);
        const x = b || { top: i0, bottom: i0, start: j0, end: j0 };
        const can = (i: number, j: number) => editableAt(d.nodeAt(i as DisplayIndex), m.visible()[j]!, g.ctx);
        let cut = false;
        for (let i = x.top; i <= x.bottom; i++) for (let j = x.start; j <= x.end; j++) cut ||= can(i, j);
        const paste = can(x.top, x.start);
        const id = (side: 'top' | 'bottom', x: T) => pinnedKey(side, g.settings.getRowId(x as never));
        const pin = (side: 'top' | 'bottom', rows: readonly T[]) => () => {
          p!.set({ [side]: rows });
          o.onPin?.(p!.get());
          say(T(c.band ? 'unpinned' : side === 'top' ? 'pinnedTop' : 'pinnedBottom'));
        };
        const sig = (): string => JSON.stringify([r!.get(), kernel.focus]);
        const S: (MenuItem<CellMenuContext<T>> | false | null | undefined)[][] = [
          r ? [
            it('copy', () => put(r.copy())?.catch(no('C')), false, 'C'),
            it('copy.headers', () => put(r.copy({ headers: true }))?.catch(no('C'))),
            e && it('cut', () => {
              const was = sig();
              // Cleared only once the copy is on the clipboard, and the block still the same (never data lost).
              put(r.copy())?.then(() => sig() === was && r.cut(), no('C'));
            }, !cut, 'X'),
            e && it('paste', () => ask((c) => c.readText()).then((s) => r.paste(s), no('V')), !paste, 'V'),
          ] : [],
          f && r ? [
            f.along !== 'row' && it('fill.down', () => f.down({ user: true }), f.can?.(false) === false, 'D'),
            f.along !== 'column' && it('fill.end', () => f.end({ user: true }), f.can?.(true) === false, 'R'),
          ] : [],
          e ? [it('undo', () => e.undo(), !e.canUndo, 'Z'), it('redo', () => e.redo(), !e.canRedo, g.mac ? 'Shift+Meta+Z' : 'Y')] : [],
          [(tr === 'open' || tr === 'closed') && it(tr === 'open' ? 'collapse' : 'expand', () => o.use!.tree!.api(g)?.toggle(c.key))],
          p ? (c.band
            ? [it('unpin', pin(c.band, p.get()[c.band].filter((x) => id(c.band!, x) !== c.key)))]
            : (['top', 'bottom'] as const).map((s) => it(`pin.${s}`, pin(s, [...p.get()[s], c.row]), p.get()[s].some((x) => id(s, x) === id(s, c.row))))) : [],
          [csv && it('export.csv', () => void csv.run('displayed'))],
          [c.block && st?.stats() && { id: 'status.read', label: g.msg('status.read'), action: () => st.announce() }],
        ].map((x) => x.filter(Boolean) as MenuItem<CellMenuContext<T>>[]);
        return (S as MenuItem<CellMenuContext<T>>[][]).filter((s) => s.length).flatMap((s, i) => (i ? [{ separator: true } as const, ...s] : s));
      };
      const entries = (c: CellMenuContext<T>): readonly MenuEntry<CellMenuContext<T>>[] => {
        const d = defaults(c);
        try {
          return o.items ? o.items(c, d) : d;
        } catch (err) {
          g.report(err);
          return d;
        }
      };
      /** Opens on cell `at` (its element `anchor`) at a point or under it; the focus first on it when it is outside the block. */
      const open = (at: Cell, point?: Point | null, anchor = g.rowRenderer.cell(at.row, at.column)): boolean => {
        if (!anchor?.isConnected || g.editor) return false;
        const block = inBlock(at);
        let c = ctxOf(at, block);
        if (!c) return false;
        let list: readonly MenuEntry<CellMenuContext<T>>[] | null = entries(c);
        // Nothing to offer (Q-CM2 A): the browser's own menu.
        if (!list.some((e) => !('separator' in e))) return false;
        const f = kernel.focus;
        // Outside the block: the cell focused first (unchanged, the kernel keeps the same focus object).
        if (!block && (kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: at.row, column: at.column } }, 'user'), kernel.focus !== f)) {
          if (point) g.restoreFocus();
          // The items again, once the focus (and so the block) moved: the fill and the app's items see the cell alone.
          list = entries((c = ctxOf(at, null) ?? c));
        }
        const me = { ...at, dir: g.dir, ctx: g.ctx };
        L.open<CellMenuContext<T>>({
          owner: mine, id: at.column, anchor, from: point ?? anchor, label: T('label'), classes: o.classes,
          // The first list drawn is the one checked above; an item keeping the menu open asks again.
          entries: () => list ?? entries(ctxOf(at, inBlock(at)) ?? c), ctx: () => c, part: () => ({ column: c.column, row: c.row, menu: 'cell' }),
          onClose: () => void (cur === me && (cur = null)),
        });
        list = null;
        cur = me;
        return true;
      };

      // ---- Pointers (context-menu.md 1–7) ----
      scope.on(el.viewport, 'pointerdown', (e: PointerEvent) => void (kind = e.pointerType), { capture: true });
      // A right press (a Mac's Ctrl+click) inside the block: no native focus, the block and the focus stay (6).
      scope.on(el.viewport, 'mousedown', (e: MouseEvent) => {
        const c = (e.button === 2 || (g.mac && e.ctrlKey && !e.button)) && !e.shiftKey && cellOf(e.target as Element);
        if (c && inBlock(c)) e.preventDefault();
      });
      scope.on(el.root, 'contextmenu', (e: MouseEvent) => {
        // Inside the open menu: the list's (the key's own contextmenu once the menu holds the focus: one menu).
        const t = e.target as Element;
        const at = pointOf(e);
        const pt = (e as PointerEvent).pointerType || (at ? kind : '');
        const c = !e.shiftKey && pt !== 'touch' && pt !== 'pen' && cellOf(t);
        // The click a Mac's Ctrl+click sends after: swallowed (never a row ticked, never a row click).
        if (c && open(c, at, c.el)) e.preventDefault(), L.swallow(el.viewport);
      });

      apis.set(kernel, {
        open: (at, point) => open(at, point),
        close: () => void (cur && L.close()),
        current: () => cur && { row: cur.row, column: cur.column },
      });
      return {
        keys: (e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean => owner === 'cell' && at?.kind === 'cell' && menuKey(e) && open(at),
        afterRows() {
          const c = cur;
          // Its row or column gone, the direction or the language changed (21).
          if (c && (!nodeOf(c.row) || !m.visible().includes(m.get(c.column)!) || g.dir !== c.dir || g.ctx !== c.ctx)) L.close();
        },
        destroy() {
          if (cur) L.close(true);
          apis.delete(kernel);
        },
      };
    },
  };
}
