import { fold, type FocusPos, type GridKernel, type KeyOwner, type ResolvedColumn, type Side } from '@dzgrid/core';
import { emit, isDataKey } from '@dzgrid/core/internal';
import type { GridFeature } from '../features.js';
import type { ColumnMenuMessageKey } from '../part-texts.js';
import type { Frame } from '../render/rows.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { widthOf } from '../render/header-decor.js';
import { pointOf, type Point } from '../dir.js';
import { setAttr } from '../render/write.js';

/** The texts `columnMenu()` needs, from `@dzgrid/dom/locales/<lang>-column-menu` (owner Q3-2). */
export const COLUMN_MENU_KEYS = [
  ...'button label sort sortAsc sortDesc sortNone pin pinStart pinEnd pinNone sizeAuto sizeAutoAll sizeWiden sizeNarrow sizeResize width moveStart moveEnd fillDown fillEnd filter hide choose reset pinnedStart pinnedEnd unpinned hidden resetDone'.split(' ').map((k) => `menu.${k}`),
  ...'label compact comfortable spacious changed'.split(' ').map((k) => `density.${k}`),
] as readonly ColumnMenuMessageKey[];
/** A built-in item's text: `density.<d>` its id, else `menu.` and its id in camel case (`sort.asc`: `menu.sortAsc`). */
const keyOf = (id: string): ColumnMenuMessageKey => (id[0] === 'd' ? id : `menu.${id.replace(/\.(.)/, (_, c: string) => c.toUpperCase())}`) as ColumnMenuMessageKey;

type Grid = { readonly kernel: GridKernel<any, any> };
type Density = 'compact' | 'comfortable' | 'spacious';
/** What `columns()` gives the menu: the moves now; auto-size and the keyboard resize at Phase 6 step 7 (their items appear then). */
export interface ColumnsApiLike {
  move(column: string, by: -1 | 1, o?: { readonly say?: boolean }): unknown;
  autoSize?(ids?: readonly string[]): void;
  autoSizeAll?(): void;
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
export type MenuEntry = MenuItem | { readonly separator: true };
export interface MenuItem {
  /** Built-ins: `sort.asc` `sort.desc` `sort.none` `pin.start` `pin.end` `pin.none` `size.auto` `size.autoAll` `size.widen` `size.narrow` `size.resize` `move.start` `move.end` `fill.down` `fill.end` `filter` `hide` `choose` `reset` `density.<d>`; an application's own is free. */
  readonly id: string;
  readonly label: string;
  /** `menuitem` (default), `menuitemradio` (radios of one `group` in one named `role="group"`), `menuitemcheckbox`. */
  readonly kind?: 'item' | 'radio' | 'check';
  readonly group?: string;
  readonly checked?: boolean;
  /** Focusable, `aria-disabled`, does nothing (APG). */
  readonly disabled?: boolean;
  /** `aria-keyshortcuts` words; shown as a hint (Ctrl, ⌘). */
  readonly keys?: string;
  /** Stays open after it acts (« Widen » / « Narrow »). */
  readonly keepOpen?: boolean;
  /** A class for an icon the host's CSS draws; never HTML. */
  readonly icon?: string;
  readonly action?: (c: MenuContext) => void;
}
export interface MenuContext {
  readonly column: string;
  readonly grid: Grid;
  /** A sentence for the grid's live region. */
  say(text: string): void;
}
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

type Open = { readonly id: string; readonly ref: PopupRef; readonly list: HTMLElement; readonly prev: Element | null; readonly dir: string; readonly ctx: object; shown: MenuItem[] };
const ROLE = { radio: 'menuitemradio', check: 'menuitemcheckbox', item: 'menuitem' } as const;

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
      const missing = COLUMN_MENU_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
      if (missing.length) throw new TypeError(`column-menu: missing ${missing.join(', ')}`);
      const { kernel, columns: m, el, doc, scope } = g;
      const grid = { kernel };
      const say = (t: string): void => g.live.announce(t);
      const name = (id: string): string => m.get(id)?.def.header ?? id;
      const text = (k: ColumnMenuMessageKey, id: string, p?: Record<string, string | number>): string => g.msg(k, { column: name(id), ...p });
      const who = {};
      let cur: Open | null = null;
      let frame: Frame<unknown> | null = null;
      let quiet = false;
      let handed = false;
      let swallow = false;
      let buf = '';
      let hush = (): void => {};
      let hushBuf = (): void => {};

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
        const noFill = !range?.get() && !(f?.kind === 'cell' && isDataKey(f.row));
        const mod = g.mac ? 'Meta+' : 'Control+';
        const filter = g.features.find((x) => x.filter)?.filter?.edits(col, who);
        const chooser = o.use?.chooser?.api(g);
        const now = g.settings.density ?? 'comfortable';
        const S: (MenuItem | false | null | undefined)[][] = [
          col.sortable && radios('menu.sort', ['sort.asc', 'sort.desc', 'sort.none'], `sort.${sort.find((s) => s.column === id)?.dir ?? 'none'}`,
            (d) => kernel.dispatch({ type: 'sort.set', sort: d === 'none' ? sort.filter((s) => s.column !== id) : [{ column: id, dir: d as 'asc' }] }, 'user')),
          radios('menu.pin', ['pin.start', 'pin.end', 'pin.none'], `pin.${side ?? 'none'}`, (v) => {
            const p = v === 'none' ? null : (v as Side);
            state({ id, pinned: p });
            say(text(p ? (p === 'start' ? 'menu.pinnedStart' : 'menu.pinnedEnd') : 'menu.unpinned', id));
          }, locked),
          [
            cols?.autoSize && it('size.auto', () => cols.autoSize!([id])),
            cols?.autoSizeAll && it('size.autoAll', () => cols.autoSizeAll!()),
            def.resizable !== false && it('size.widen', size(10), w >= Math.max(min, def.maxWidth ?? Infinity), { keepOpen: true }),
            def.resizable !== false && it('size.narrow', size(-10), w <= min, { keepOpen: true }),
            cols?.resizeMode && it('size.resize', () => cols.resizeMode!(id)),
          ],
          cols ? [it('move.start', () => cols.move(id, -1, { say: true }), locked || !at), it('move.end', () => cols.move(id, 1, { say: true }), locked || at === seg.length - 1)] : [],
          fill && range ? [it('fill.down', () => fill.down({ user: true }), noFill, { keys: `${mod}D` }), it('fill.end', () => fill.end({ user: true }), noFill, { keys: `${mod}R` })] : [],
          [filter?.canOpen && it('filter', () => ((handed = true), filter.openFilter()))],
          [
            it('hide', () => (state({ id, hidden: true }), say(text('menu.hidden', id))), def.hideable === false || m.visible().length < 2),
            chooser && it('choose', () => ((handed = true), chooser.open(g.headerRenderer.cell(id) ?? undefined))),
            // Back to the definitions in one patch (Q3-3: `width: null` gives a flexible column back); sort and filters kept.
            it('reset', () => {
              kernel.dispatch({ type: 'column.state', patch: m.state().map((s, order) => ({ id: s.id, order, width: null, hidden: !!m.get(s.id)!.def.hidden, pinned: m.get(s.id)!.def.pinned ?? null })) }, 'user');
              say(g.msg('menu.resetDone'));
            }, !m.state().some((s, i) => {
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
      const items = (): HTMLElement[] => [...(cur?.list.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])];
      /** The item `i` focused, the only one in the tab order (roving), wrapping. */
      const go = (i: number): void => {
        const all = items();
        const n = all.length;
        all.forEach((x, j) => (x.tabIndex = j === (((i % n) + n) % n) ? 0 : -1));
        const x = all[((i % n) + n) % n];
        x?.focus({ preventScroll: true });
        // In view inside a menu that scrolls (never the page jumping).
        x?.scrollIntoView?.({ block: 'nearest' });
      };
      /** The list drawn from `list`: roles, groups, separators (never first, last or doubled). */
      const draw = (c: Open, list: readonly MenuEntry[]): void => {
        const L = c.list;
        L.textContent = '';
        c.shown = [];
        let grp: HTMLElement | null = null;
        const add = (role: string, parent: HTMLElement = L): HTMLElement => {
          const x = doc.createElement('div');
          x.setAttribute('role', role);
          parent.append(x);
          return x;
        };
        for (const e of list) {
          if ('separator' in e) {
            grp = null;
            if (L.lastElementChild && L.lastElementChild.getAttribute('role') !== 'separator') add('separator');
            continue;
          }
          if (!e.group) grp = null;
          else if (grp?.getAttribute('aria-label') !== e.group) setAttr((grp = add('group')), 'aria-label', e.group);
          const x = add(ROLE[e.kind ?? 'item'], grp ?? L);
          x.tabIndex = -1;
          x.dataset['id'] = e.id;
          if (o.classes?.item) x.className = o.classes.item;
          if (e.kind && e.kind !== 'item') x.setAttribute('aria-checked', String(!!e.checked));
          if (e.disabled) x.setAttribute('aria-disabled', 'true');
          /** A part of the item the reader skips (its icon, its keys' hint). */
          const aside = (cls: string): HTMLElement => {
            const s = doc.createElement('span');
            s.className = cls;
            s.setAttribute('aria-hidden', 'true');
            x.append(s);
            return s;
          };
          if (e.icon) aside(`dzg-micon ${e.icon}`);
          x.append(e.label);
          if (e.keys) {
            x.setAttribute('aria-keyshortcuts', e.keys);
            aside('dzg-mkeys').textContent = g.mac ? e.keys.replace('Meta+', '⌘') : e.keys.replace('Control', 'Ctrl');
          }
          c.shown.push(e);
        }
        if (L.lastElementChild?.getAttribute('role') === 'separator') L.lastElementChild.remove();
      };

      /** Where the focus goes back: where it was outside the grid, else the grid's own focus (the header when it had none). */
      const back = (c: Open): void => {
        const p = c.prev as HTMLElement | null;
        if (p && p !== doc.body && p.isConnected && !el.root.contains(p)) return p.focus({ preventScroll: true });
        if (!kernel.focus && m.visible().some((x) => x.id === c.id)) kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: c.id } }, 'user');
        g.restoreFocus();
      };
      /** Closed; `still`: no focus moved (an item acting first, or another menu opening). */
      const close = (still?: boolean): void => {
        quiet = !!still;
        cur?.ref.close();
        quiet = false;
      };
      const run = (i: number): void => {
        const c = cur!;
        const e = c.shown[i];
        if (!e || e.disabled) return;
        handed = false;
        if (!e.keepOpen) close(true);
        try {
          e.action?.(ctxOf(c.id));
        } catch (err) {
          g.report(err);
          close(true);
        }
        if (cur === c) {
          draw(c, entries(c.id));
          go(i);
        } else if (!handed) back(c);
      };

      const open = (id: string, at?: Point | null): boolean => {
        const col = m.get(id);
        const cell = g.headerRenderer.cell(id);
        if (!col || col.def.menu === false || !cell?.isConnected || !m.visible().includes(col) || g.editor || out(id)) return false;
        const prev = cur ? cur.prev : doc.activeElement;
        close(true);
        const btn = cell.querySelector<HTMLElement>(':scope > .dzg-mbtn');
        const list = doc.createElement('div');
        list.setAttribute('role', 'menu');
        list.className = `dzg-menu ${o.classes?.menu ?? ''}`.trim();
        setAttr(list, 'aria-label', text('menu.label', id));
        const c: Open = { id, list, prev, dir: g.dir, ctx: g.ctx, shown: [], ref: null! };
        draw(c, entries(id));
        cur = c;
        (c as { ref: PopupRef }).ref = popupsFor(g).open(cell, list, {
          placement: 'block-end', from: at ?? btn ?? cell, ...(!at && { align: 'end' as const }), fit: true, opener: () => btn,
          back: () => void (quiet || back(c)),
          onClose: () => void (cur === c && ((cur = null), g.schedule())),
        });
        list.addEventListener('keydown', key);
        list.addEventListener('click', (e) => {
          const x = (e.target as Element).closest<HTMLElement>('[role^=menuitem]');
          if (x) run(items().indexOf(x));
        });
        go(0);
        g.schedule();
        return true;
      };
      /** The menu's keys (APG): it owns them all but Escape, the popup host's. */
      const key = (e: KeyboardEvent): void => {
        const k = e.key;
        const arrow = k.startsWith('Arrow');
        // The browser's own keys (F5, Ctrl/Cmd+R, Alt+letter…) stay the browser's; Escape is the popup host's.
        if (k === 'Escape' || e.ctrlKey || e.metaKey || (e.altKey && !arrow) || ([...k].length > 1 && !arrow && !/^(Home|End|Enter|Tab)$/.test(k))) return;
        e.preventDefault();
        const i = items().indexOf(doc.activeElement as HTMLElement);
        if (k === 'ArrowDown' || k === 'ArrowUp') go(i + (k === 'ArrowDown' ? 1 : -1));
        else if (k === 'Home' || k === 'End') go(k === 'Home' ? 0 : -1);
        else if (k === 'Enter' || k === ' ') run(i);
        else if (k === 'Tab') close();
        else if ([...k].length === 1) {
          // Type-ahead (folded as the quick search): a prefix typed within 500 ms; one letter again goes on to the next.
          hushBuf();
          hushBuf = scope.timeout(() => (buf = ''), 500);
          buf += k;
          const f = fold(buf);
          const one = [...f].every((x) => x === f[0]);
          const shown = cur!.shown;
          const find = (q: string, from: number): number => {
            for (let j = 0; j < shown.length; j++) if (fold(shown[(from + j) % shown.length]!.label).startsWith(q)) return (from + j) % shown.length;
            return -1;
          };
          let x = one ? find(f[0]!, i + 1) : find(f, i);
          if (x < 0 && !one) (buf = k), (x = find(fold(k), i + 1));
          if (x >= 0) go(x);
        }
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
        const t = e.target as Element;
        // Inside the open menu: never the browser's, never another (Shift too).
        if (cur?.ref.el.contains(t)) return e.preventDefault();
        const c = header(t);
        const id = c?.dataset['col'];
        if (!id || e.shiftKey) return;
        // Made by a key (Shift+F10, the Menu key; at 0, 0): under the header, and once only.
        const at = pointOf(e);
        if ((!at && cur?.id === id) || open(id, at)) e.preventDefault(), (swallow = true);
      });
      // The click a Mac's Ctrl+click may send after its contextmenu: swallowed (never a sort); the next press lets go.
      scope.on(el.root, 'pointerdown', () => void (swallow = false), { capture: true });
      scope.on(el.root, 'click', (e) => void (swallow && el.header.contains(e.target as Node) && ((swallow = false), e.stopPropagation(), e.preventDefault())), { capture: true });

      apis.set(kernel, { open: (id) => open(id), close: () => close(), current: () => cur?.id ?? null });
      return {
        keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
          if (owner !== 'header' || at?.kind !== 'header' || at.level || e.ctrlKey || e.metaKey) return false;
          const k = e.key;
          // Alt+ArrowDown reaches here only where the filters left it (no popup on the column, C3).
          return ((k === 'F10' && e.shiftKey && !e.altKey) || (k === 'ContextMenu' && !e.altKey) || (k === 'ArrowDown' && e.altKey && !e.shiftKey)) && open(at.column);
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
          hushBuf();
          close(true);
          apis.delete(kernel);
        },
      };
    },
  };
}
