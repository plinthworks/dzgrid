import type { FocusPos, KeyOwner, ResolvedColumn, Side } from '@dzgrid/core';
import { makeQuery } from '@dzgrid/core';
import { emit, isCellKey } from '@dzgrid/core/internal';
import type { GridFeature } from '../features.js';
import { menuKey, menuList, needTexts } from '@dzgrid/dom/internal';
import type { ColumnMenuMessageKey } from '../part-texts.js';
import type { Frame } from '../render/rows.js';
import { widthOf } from '../render/header-decor.js';
import { pointOf, type Point } from '../dir.js';
import { setAttr } from '../render/write.js';
import type { MenuContext, MenuEntry, MenuGrid, MenuItem } from '../menu/types.js';

/** The texts `columnMenu()` needs, from `@dzgrid/dom/locales/<lang>-column-menu` (owner Q3-2). */
export const COLUMN_MENU_KEYS = [
  ...'button label sort sortAsc sortDesc sortNone pin pinStart pinEnd pinNone sizeAuto sizeAutoAll sizeWiden sizeNarrow sizeResize width moveStart moveEnd fillDown fillEnd filter hide choose reset pinnedStart pinnedEnd unpinned hidden resetDone'.split(' ').map((k) => `menu.${k}`),
  ...'label compact comfortable spacious changed'.split(' ').map((k) => `density.${k}`),
] as readonly ColumnMenuMessageKey[];
/** A built-in item's text: `density.<d>` its id, else `menu.` and its id in camel case (`sort.asc`: `menu.sortAsc`). */
const keyOf = (id: string): ColumnMenuMessageKey => (id[0] === 'd' ? id : `menu.${id.replace(/\.(.)/, (_, c: string) => c.toUpperCase())}`) as ColumnMenuMessageKey;

type Grid = MenuGrid;
type Density = 'compact' | 'comfortable' | 'spacious';
/** What `columns()` gives the menu: the moves, auto-size and the keyboard resize (Phase 6 step 6; their items appear with them). */
export interface ColumnsApiLike {
  move(column: string, by: -1 | 1, o?: { readonly say?: boolean }): unknown;
  autoSize?(ids: readonly string[], o?: { readonly say?: boolean }): void;
  autoSizeAll?(o?: { readonly say?: boolean }): void;
  resizeMode?(column: string): boolean;
}
export interface ColumnMenuOptions {
  /** The features the items drive, reached through their `api(grid)` only (typed: the menu ships none of them). Absent: their items are absent. */
  readonly use?: {
    readonly columns?: { api(grid: Grid): ColumnsApiLike | null };
    /** With `fill`: « Fill down » / « Fill right » on the current block (owner S12-Q12). */
    readonly range?: { api(grid: Grid): { get(): unknown } | null };
    readonly fill?: { api(grid: Grid): { down(o?: { readonly user?: boolean }): unknown; end(o?: { readonly user?: boolean }): unknown } | null };
    /** « Choose columns… » (Phase 6 step 4), opened by the column's header. */
    readonly chooser?: { api(grid: Grid): { open(anchor?: HTMLElement): boolean } | null };
    /** « Group by this column » / « Stop grouping by this column » (Phase 7, `grouping()`; the way without dragging, WCAG 2.5.7). */
    readonly grouping?: { api(grid: Grid): { by(): readonly string[]; setBy(by: readonly string[], o?: { readonly user?: boolean }): void } | null };
  };
  /** The density line (off by default, C5; absent when `rowHeight` is a number). */
  readonly density?: boolean;
  /** Told after the density line changed the grid's density (owner Q3-4). */
  readonly onDensity?: (density: Density) => void;
  /** The application's items: the defaults reordered, removed or added to. A throw: the defaults, the error reported. */
  readonly items?: (column: ResolvedColumn<unknown>, defaults: readonly MenuEntry[], c: MenuContext) => readonly MenuEntry[];
  /** Host classes (Tailwind, Bootstrap): on the list and on every item. */
  readonly classes?: { readonly menu?: string; readonly item?: string };
}
export type { MenuContext, MenuEntry, MenuItem };
export interface ColumnMenuApi {
  /** As a key on the header: false when it cannot open (no such shown column, `menu: false`, out of the column window, an editor open). */
  open(column: string): boolean;
  close(): void;
  /** The column whose menu is open, or null. */
  current(): string | null;
}
export interface ColumnMenuFeature extends GridFeature {
  /** The menu of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: Grid): ColumnMenuApi | null;
}

type Open = { readonly id: string; readonly dir: string; readonly ctx: object };


/**
 * `columnMenu(options)`: the column ⋮ menu (docs/behaviors/column-menu.md; step03-plan; owner Q-M1, Q-M2, Q-K1, Q3-1–Q3-4).
 * A ⋮ button on each column header of 96 px and more (out of the tab order; its press never moves the focus), a
 * right-click (Shift+right-click keeps the browser's), Shift+F10 and the Menu key, Alt+ArrowDown where the column has
 * no filter popup, a Mac's Ctrl+click: an APG menu in the popup host — sort, pin, size, move, fill, filter, hide,
 * choose, reset, density — each item one command (source `user`), said. Opened by a pointer, the grid's focus (and its
 * block of cells) stays; the focus comes back where it was. One feature object may serve several grids.
 *
 * ```ts
 * import { columnMenu } from '@dzgrid/dom/column-menu';
 * import { FR_COLUMN_MENU } from '@dzgrid/dom/locales/fr-column-menu';
 * import '@dzgrid/theme/columns.css';
 * const moves = columns();
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_COLUMN_MENU.text } }, features: [moves, columnMenu({ use: { columns: moves } })] });
 * ```
 */
export function columnMenu(o: ColumnMenuOptions = {}): ColumnMenuFeature {
  const apis = new WeakMap<object, ColumnMenuApi>();
  return {
    id: 'column-menu',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      needTexts(g, COLUMN_MENU_KEYS, 'column-menu');
      // Its items' texts and sentences come with grouping's (`locales/<lang>-group`).
      if (o.use?.grouping) needTexts(g, ['menu.groupBy', 'menu.groupOff', 'zone.grouped', 'zone.removed'], 'column-menu');
      const { kernel, columns: m, el, doc, scope } = g;
      const grid = { kernel };
      const say = (t: string): void => g.live.announce(t);
      const name = (id: string): string => m.get(id)?.def.header ?? id;
      const text = (k: ColumnMenuMessageKey, id: string, p?: Record<string, string | number>): string => g.msg(k, { column: name(id), ...p });
      const who = {};
      const L = menuList(g);
      const mine = {};
      let cur: Open | null = null;
      let frame: Frame<unknown> | null = null;
      let hush = (): void => {};

      /** The column is in the centre and out of the column window (its header kept mounted only for the focus). */
      const out = (id: string): boolean => {
        const at = frame ? frame.layout.center.columns.findIndex((c) => c.id === id) : -1;
        return at >= 0 && (!frame!.cols || at < frame!.cols.first || at > frame!.cols.last);
      };
      const sideOf = (id: string): Side | null => (['start', 'end'] as const).find((s) => m.layout[s].columns.some((c) => c.id === id)) ?? null;
      const state = (patch: object): void => void kernel.dispatch({ type: 'column.state', patch: [patch as never] }, 'user');

      /** The built-in entries for a column, by section (step03-plan §4), separators between the sections; an item's text from its id. */
      const defaults = (col: ResolvedColumn<unknown>): MenuEntry[] => {
        const { id, def } = col;
        const it = (i: string, action: () => unknown, disabled = false, x?: Partial<MenuItem>): MenuItem => ({ id: i, label: g.msg(keyOf(i)), action, disabled, ...x });
        /** A radio group: its items, the one checked, each acting with its id's last word. */
        const radios = (group: ColumnMenuMessageKey, ids: readonly string[], on: string, act: (v: string) => unknown, disabled?: boolean): MenuItem[] =>
          ids.map((i) => it(i, () => act(i.slice(i.indexOf('.') + 1)), disabled, { kind: 'radio', group: g.msg(group), checked: i === on }));
        const sort = kernel.query.sort;
        const side = sideOf(id);
        const cols = o.use?.columns?.api(g);
        const w = widthOf(g, id);
        const min = def.minWidth ?? 40;
        const size = (by: number) => () => {
          kernel.dispatch({ type: 'column.resize', column: id, width: widthOf(g, id) + by, finished: true }, 'user');
          hush();
          hush = scope.timeout(() => say(text('menu.width', id, { width: widthOf(g, id) })), 400);
        };
        const seg = m.layout[side ?? 'center'].columns;
        const at = seg.findIndex((c) => c.id === id);
        const locked = def.movable === false;
        const fill = o.use?.fill?.api(g);
        const range = o.use?.range?.api(g);
        const f = kernel.focus;
        // Fill: a block, or a focused data cell (as Ctrl+D); a pointer opening kept them (Q3-1).
        const noFill = !range?.get() && !(f?.kind === 'cell' && isCellKey(f.row));
        const mod = g.mac ? 'Meta+' : 'Control+';
        const filter = g.features.find((x) => x.filter)?.filter?.edits(col, who);
        const chooser = o.use?.chooser?.api(g);
        const grp = o.use?.grouping?.api(g);
        const by = grp?.by();
        const now = g.settings.density ?? 'comfortable';
        // The query with every filter and the search emptied, the sort kept: differs while one is on (find.md 15).
        const clear = makeQuery({ sort });
        const S: (MenuItem | false | null | undefined)[][] = [
          col.sortable && radios('menu.sort', ['sort.asc', 'sort.desc', 'sort.none'], `sort.${sort.find((s) => s.column === id)?.dir ?? 'none'}`,
            (d) => kernel.dispatch({ type: 'sort.set', sort: d === 'none' ? sort.filter((s) => s.column !== id) : [{ column: id, dir: d as 'asc' }] }, 'user')),
          radios('menu.pin', ['pin.start', 'pin.end', 'pin.none'], `pin.${side ?? 'none'}`, (v) => {
            const p = v === 'none' ? null : (v as Side);
            state({ id, pinned: p });
            say(text(p ? (p === 'start' ? 'menu.pinnedStart' : 'menu.pinnedEnd') : 'menu.unpinned', id));
          }, locked),
          [
            cols?.autoSize && it('size.auto', () => cols.autoSize!([id], { say: true })),
            cols?.autoSizeAll && it('size.autoAll', () => cols.autoSizeAll!({ say: true })),
            def.resizable !== false && it('size.widen', size(10), w >= Math.max(min, def.maxWidth ?? Infinity), { keepOpen: true }),
            def.resizable !== false && it('size.narrow', size(-10), w <= min, { keepOpen: true }),
            // The mode put the focus on the header: handed over, never sent back outside (the focus going out would end it).
            cols?.resizeMode && it('size.resize', () => cols.resizeMode!(id) && L.hand()),
          ],
          cols ? [it('move.start', () => cols.move(id, -1, { say: true }), locked || !at), it('move.end', () => cols.move(id, 1, { say: true }), locked || at === seg.length - 1)] : [],
          // Grouping (column-menu.md « Grouping »): by this column, or no longer; the column stays shown (Q-H A).
          [grp && def.groupable !== false && (by!.includes(id) ? it('group.off', () => (grp.setBy(by!.filter((c) => c !== id), { user: true }), say(g.msg('zone.removed', { column: name(id) })))) : it('group.by', () => (grp.setBy([...by!, id], { user: true }), say(g.msg('zone.grouped', { column: name(id) })))))],
          fill && range ? [it('fill.down', () => fill.down({ user: true }), noFill, { keys: `${mod}D` }), it('fill.end', () => fill.end({ user: true }), noFill, { keys: `${mod}R` })] : [],
          [filter?.canOpen && it('filter', () => (L.hand(), filter.openFilter())), 
            // « Clear all filters » (find.md 15): while a filter or the search is on, its text given; as `clearFilters()` (the sort kept, one command).
            clear.key !== kernel.query.key && g.settings.messages.text['menu.clearFilters'] && it('clearFilters', () => kernel.dispatch({ type: 'query.set', query: clear }, 'user'))],
          [
            it('hide', () => (state({ id, hidden: true }), say(text('menu.hidden', id))), def.hideable === false || m.visible().length < 2),
            chooser && it('choose', () => (L.hand(), chooser.open(g.headerRenderer.cell(id) ?? undefined))),
            // Back to the definitions in one patch (Q3-3: `width: null` gives a flexible column back); sort and filters kept.
            it('reset', () => {
              kernel.dispatch({ type: 'column.state', patch: m.state().map((s, order) => ({ id: s.id, order, width: null, hidden: !!m.get(s.id)!.def.hidden, pinned: m.get(s.id)!.def.pinned ?? null })) }, 'user');
              // The header groups' states too (header-groups.md 6), in the same gesture.
              g.groups?.reset({ user: true });
              say(g.msg('menu.resetDone'));
            }, !Object.keys(g.groups?.get() ?? {}).length && !m.state().some((s, i) => {
              const d = m.get(s.id)!.def;
              return s.width != null || (s.order ?? i) !== i || (s.hidden ?? !!d.hidden) !== !!d.hidden || (s.pinned === undefined ? false : s.pinned !== (d.pinned ?? null));
            })),
          ],
          o.density && typeof g.settings.rowHeight !== 'number' && radios('density.label', ['density.compact', 'density.comfortable', 'density.spacious'], `density.${now}`, (d) => {
            g.settings = { ...g.settings, density: d as Density };
            g.schedule();
            // density.md 2: what the state feature saves (Phase 6 step 5); the same density again says nothing.
            if (d !== now) emit(kernel, { type: 'densityChanged', source: 'user', density: d as Density });
            o.onDensity?.(d as Density);
            say(g.msg('density.changed', { density: g.msg(`density.${d as Density}`) }));
          }),
        ].map((x) => (x || []).filter(Boolean) as MenuItem[]);
        return (S as MenuItem[][]).filter((s) => s.length).flatMap((s, i) => (i ? [{ separator: true } as const, ...s] : s));
      };

      const entries = (id: string): readonly MenuEntry[] => {
        const col = m.get(id)!;
        const d = defaults(col);
        try {
          return o.items ? o.items(col, d, ctxOf(id)) : d;
        } catch (err) {
          g.report(err);
          return d;
        }
      };
      const ctxOf = (column: string): MenuContext => ({ column, grid, say });
      /** The focus going back to the grid with none there: the header first. */
      const back = (id: string): unknown => !kernel.focus && m.visible().some((x) => x.id === id) && kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: id } }, 'user');
      const close = (still?: boolean): void => void (cur && L.close(still));

      const open = (id: string, at?: Point | null): boolean => {
        const col = m.get(id);
        const cell = g.headerRenderer.cell(id);
        if (!col || col.def.menu === false || !cell?.isConnected || !m.visible().includes(col) || g.editor || out(id)) return false;
        const btn = cell.querySelector<HTMLElement>(':scope > .dzg-mbtn');
        const c: Open = { id, dir: g.dir, ctx: g.ctx };
        L.open({
          owner: mine, id, anchor: cell, from: at ?? btn ?? cell, ...(!at && { align: 'end' as const }), opener: () => btn, label: text('menu.label', id), classes: o.classes,
          entries: () => entries(id), ctx: () => ctxOf(id), part: () => ({ column: m.get(id)!, menu: 'column' }), back: () => back(id),
          onClose: () => void (cur === c && ((cur = null), g.schedule())),
        });
        cur = c;
        g.schedule();
        return true;
      };

      // ---- Pointers (column-menu.md 3–4; Q3-1: a press opening the menu never moves the grid's focus) ----
      const header = (t: EventTarget | null): HTMLElement | null => {
        const c = (t as Element).closest?.<HTMLElement>('.dzg-hcell');
        return c && !c.matches('.dzg-hgroup, .dzg-hextra') && c.closest('.dzg') === el.root ? c : null;
      };
      scope.on(el.header, 'mousedown', (e: MouseEvent) => {
        if ((e.target as Element).closest('.dzg-mbtn') || ((e.button === 2 || (g.mac && e.ctrlKey)) && header(e.target))) e.preventDefault();
      });
      scope.on(el.header, 'click', (e: MouseEvent) => {
        const b = (e.target as Element).closest('.dzg-mbtn');
        const id = b && header(b)?.dataset['col'];
        if (id) cur?.id === id ? close() : open(id);
      });
      scope.on(el.root, 'contextmenu', (e: MouseEvent) => {
        // Inside the open menu: the list's (never the browser's, never another).
        const c = header(e.target);
        const id = c?.dataset['col'];
        if (!id || e.shiftKey) return;
        // Made by a key (Shift+F10, the Menu key; at 0, 0): under the header, and once only.
        const at = pointOf(e);
        if ((!at && cur?.id === id) || open(id, at)) e.preventDefault(), L.swallow(el.header);
      });

      apis.set(kernel, { open: (id) => open(id), close: () => close(), current: () => cur?.id ?? null });
      return {
        keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
          if (owner !== 'header' || at?.kind !== 'header' || at.level || e.ctrlKey || e.metaKey) return false;
          const k = e.key;
          // Alt+ArrowDown reaches here only where the filters left it (no popup on the column, C3).
          return (menuKey(e) || (k === 'ArrowDown' && e.altKey && !e.shiftKey)) && open(at.column);
        },
        shortcuts: (col) => (col.def.menu === false ? '' : 'Alt+ArrowDown Shift+F10'),
        decorateHeader(col, cell, label) {
          let b = cell.querySelector<HTMLButtonElement>(':scope > .dzg-mbtn');
          const on = cur?.id === col.id;
          setAttr(cell, 'data-dzg-menu', on ? '' : null);
          // Under 96 px of column width the ⋮ is not drawn (2a): the keys and the right-click still open the menu.
          if (col.def.menu === false || widthOf(g, col.id) < 96) return void b?.remove();
          if (!b) {
            b = doc.createElement('button');
            b.type = 'button';
            b.className = 'dzg-mbtn';
            b.tabIndex = -1;
            b.setAttribute('aria-haspopup', 'menu');
          }
          // After the filter button, before the reapply mark (the theme orders them too).
          const r = cell.querySelector(':scope > .dzg-reapply');
          if (b.nextElementSibling !== r || !b.parentNode) cell.insertBefore(b, r);
          setAttr(b, 'aria-label', text('menu.button', col.id));
          setAttr(b, 'aria-expanded', String(on));
          // With a button the header keeps its own name: the button's must not join it.
          return label ?? name(col.id);
        },
        afterRows(f) {
          frame = f;
          const c = cur;
          const col = c && m.get(c.id);
          // Its column gone, hidden, out of the window, `menu: false`; the direction or the language changed (24).
          if (c && (!col || col.def.menu === false || !m.visible().includes(col) || out(c.id) || g.dir !== c.dir || g.ctx !== c.ctx)) close();
        },
        destroy() {
          hush();
          close(true);
          apis.delete(kernel);
        },
      };
    },
  };
}
