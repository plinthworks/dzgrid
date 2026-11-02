import { fold, intentFor, problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import { mounted, type Mounted } from '../internal/mounted.js';
import type { SlotContext } from '../part.js';
import { popupsFor, type PopupRef } from '../popup.js';
import type { Point } from '../dir.js';
import type { MenuEntry, MenuItem } from './types.js';

/** One opening of the list: who opened it, where, what it shows, where the focus goes back. */
export interface MenuOpen<C> {
  /** The feature that opened it (its own token) and what for (a column, a cell). */
  readonly owner: object;
  readonly id: string;
  readonly anchor: HTMLElement;
  readonly from?: HTMLElement | Point;
  readonly align?: 'end';
  readonly opener?: (anchor: HTMLElement) => HTMLElement | null;
  readonly label: string;
  readonly classes?: { readonly menu?: string; readonly item?: string } | undefined;
  /** The entries, asked again when an item keeps the menu open. */
  readonly entries: () => readonly MenuEntry<C>[];
  readonly ctx: () => C;
  /** What a `menuItem` part's context adds (the column, the row…). */
  readonly part: () => object;
  /** Before the focus goes back to the grid's own (a column menu with no focus in the grid: its header first). */
  readonly back?: () => void;
  readonly onClose?: () => void;
}
export interface MenuList {
  /** Opens (another menu of the grid closed first, quietly). */
  open<C>(o: MenuOpen<C>): void;
  /** Closed; `still`: no focus moved (an item acting first, or another menu opening). */
  close(still?: boolean): void;
  /** The open menu's owner and id, or null. */
  current(): { readonly owner: object; readonly id: string } | null;
  /** Said by an item's action: it handed the focus on (a popup it opened); the focus is not sent back. */
  hand(): void;
  /** The node is inside the open menu (a submenu too). */
  has(n: Node): boolean;
  /** The click a Mac's Ctrl+click may send in `region` after the `contextmenu` that opened a menu: swallowed; the next press lets go. */
  swallow(region: Element): void;
}

type Level = { readonly list: HTMLElement; ref: PopupRef; shown: MenuItem<any>[]; ms: Mounted<SlotContext['menuItem']>[]; readonly up: Level | null; sub: Level | null; readonly at: HTMLElement | null };
type Cur = { readonly o: MenuOpen<any>; readonly prev: Element | null; readonly root: Level };
const ROLE = { radio: 'menuitemradio', check: 'menuitemcheckbox', item: 'menuitem' } as const;
const lists = new WeakMap<object, MenuList>();

/** A feature's texts all there, else a `TypeError` at its setup naming the missing ones. */
export const needTexts = (g: GridContext<unknown>, keys: readonly string[], who: string): void => {
  const missing = keys.filter((k) => g.settings.messages.text[k as never] === undefined);
  if (missing.length) throw new TypeError(`${who}: missing ${missing.join(', ')}`);
};
/** The keys that open a menu on a focused header or cell (APG): Shift+F10 and the ContextMenu key (Fn+Shift+F10 on a Mac). */
export const menuKey = (e: KeyboardEvent): boolean => !e.altKey && !e.ctrlKey && !e.metaKey && ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu');

/**
 * The grid's menu list (Phase 9, moved from the column menu): an APG menu in the popup host — roles, radio groups,
 * separators, icons, keys' hints, `menuItem` parts, roving focus, type-ahead, submenus — one per grid, whichever feature
 * opens it (the column menu, the cell menu): opening one closes the other (column-menu.md 6, context-menu.md 5).
 */
export function menuList(g: GridContext<unknown>): MenuList {
  let made = lists.get(g);
  if (made) return made;
  const { kernel, doc, scope, el } = g;
  let cur: Cur | null = null;
  let quiet = false;
  let handed = false;
  let buf = '';
  let hushBuf = (): void => {};
  let hover = (): void => {};
  /** The last press's path, read before any popup's own (this listener is the grid's first on the page's presses). */
  let path: EventTarget[] = [];
  let sw: Element | null = null;
  scope.on(doc, 'pointerdown', (e) => void ((path = e.composedPath()), (sw = null)), { capture: true });
  scope.on(el.root, 'click', (e) => void (sw?.contains(e.target as Node) && ((sw = null), e.stopPropagation(), e.preventDefault())), { capture: true });
  // Inside the open menu: never the browser's menu, never another one (Shift too; the key's own once the menu has the focus).
  scope.on(el.root, 'contextmenu', (e) => void (made!.has(e.target as Node) && e.preventDefault()));
  /** Where the focus goes back: where it was outside the grid (an app's button), else the grid's own focus. */
  const back = (c: Cur): void => {
    const p = c.prev as HTMLElement | null;
    if (p && p !== doc.body && p.isConnected && !el.root.contains(p)) p.focus({ preventScroll: true });
    else c.o.back?.(), g.restoreFocus();
  };
  /** What a level's popup leaves to its own click: a submenu under it the press landed in, else its opener. */
  const keep = (L: Level, or: (a: HTMLElement) => HTMLElement | null) => (a: HTMLElement): HTMLElement | null => {
    for (let x = L.sub; x; x = x.sub) if (path.includes(x.ref.el)) return x.ref.el;
    return or(a);
  };
  /** A level's submenus closed, the deepest first (each one's focus back on its item). */
  const shut = (L: Level | null | undefined): void => void (L && (hover(), shut(L.sub), L.ref.close()));

  const items = (L: Level): HTMLElement[] => [...L.list.querySelectorAll<HTMLElement>('[role^=menuitem]')];
  /** The item `i` focused, the only one in the tab order (roving), wrapping. */
  const go = (L: Level, i: number): void => {
    const all = items(L);
    const n = all.length;
    const j = ((i % n) + n) % n;
    all.forEach((x, k) => (x.tabIndex = k === j ? 0 : -1));
    const x = all[j];
    x?.focus({ preventScroll: true });
    // In view inside a menu that scrolls (never the page jumping).
    x?.scrollIntoView?.({ block: 'nearest' });
  };
  /** The items' parts destroyed. */
  const drop = (L: Level): void => void (L.ms.forEach((p) => p.clear()), (L.ms = []));
  /** The list drawn from `list`: roles, groups, separators (never first, last or doubled). */
  const draw = (L: Level, list: readonly MenuEntry<any>[], o: MenuOpen<any>): void => {
    const R = L.list;
    drop(L);
    R.textContent = '';
    L.shown = [];
    let grp: HTMLElement | null = null;
    const add = (role: string, parent: HTMLElement = R): HTMLElement => {
      const x = doc.createElement('div');
      x.setAttribute('role', role);
      parent.append(x);
      return x;
    };
    for (const e of list) {
      if ('separator' in e) {
        grp = null;
        if (R.lastElementChild && R.lastElementChild.getAttribute('role') !== 'separator') add('separator');
        continue;
      }
      if (!e.group) grp = null;
      else if (grp?.getAttribute('aria-label') !== e.group) (grp = add('group')).setAttribute('aria-label', e.group);
      const x = add(ROLE[e.kind ?? 'item'], grp ?? R);
      x.tabIndex = -1;
      x.dataset['id'] = e.id;
      if (o.classes?.item) x.className = o.classes.item;
      if (e.kind && e.kind !== 'item') x.setAttribute('aria-checked', String(!!e.checked));
      if (e.disabled) x.setAttribute('aria-disabled', 'true');
      if (e.submenu) x.setAttribute('aria-haspopup', 'menu'), x.setAttribute('aria-expanded', 'false');
      /** A part of the item the reader skips (its icon, its keys' hint). */
      const aside = (cls: string): HTMLElement => {
        const s = doc.createElement('span');
        s.className = cls;
        s.setAttribute('aria-hidden', 'true');
        // Out of reach as well (a part's host: its controls take no focus); nothing else in an aside can.
        s.setAttribute('inert', '');
        x.append(s);
        return s;
      };
      if (e.icon) aside(`dzg-micon ${e.icon}`);
      // Its content by a part (Q12-2): drawn, the item named by its text; else (none, it threw, unknown) the text.
      const sp = e.part && g.parts()[e.part];
      if (e.part && !sp) emit(kernel, { type: 'problems', source: 'host', problems: [problem('unknown-part', 'error', `menu.${e.id}.part`, e.part)] });
      const p = mounted<SlotContext['menuItem']>(g);
      L.ms.push(p);
      if (sp && sp.slot === 'menuItem' && p.set(aside('dzg-mpart'), sp.part as never, { ...e, kind: e.kind ?? 'item', checked: !!e.checked, disabled: !!e.disabled, ...o.part() } as never)) x.setAttribute('aria-label', e.label);
      else x.append(e.label);
      if (e.keys) {
        x.setAttribute('aria-keyshortcuts', e.keys);
        aside('dzg-mkeys').textContent = g.mac ? e.keys.replace('Meta+', '⌘').replace('Shift+', '⇧') : e.keys.replace('Control', 'Ctrl');
      }
      // The submenu's mark, toward the inline end (the theme draws it, mirrored in RTL).
      if (e.submenu) aside('dzg-msub');
      L.shown.push(e);
    }
    if (R.lastElementChild?.getAttribute('role') === 'separator') R.lastElementChild.remove();
  };

  const close = (still?: boolean): void => {
    quiet = !!still;
    shut(cur?.root);
    quiet = false;
  };
  const run = (L: Level, i: number): void => {
    const c = cur!;
    const e = L.shown[i];
    if (!e || e.disabled) return;
    if (e.submenu) return sub(L, i, true);
    handed = false;
    if (!e.keepOpen || L.up) close(true);
    try {
      e.action?.(c.o.ctx());
    } catch (err) {
      g.report(err);
      close(true);
    }
    if (cur === c) {
      draw(c.root, c.o.entries(), c.o);
      go(c.root, i);
    } else if (!handed) back(c);
  };
  /** The submenu of item `i` of `L`, opened beside it (its first item focused when `focus`). */
  const sub = (L: Level, i: number, focus: boolean): void => {
    const at = items(L)[i]!;
    if (L.sub?.at !== at) {
      shut(L.sub);
      const lv = level(at, L);
      lv.list.setAttribute('aria-label', L.shown[i]!.label);
      draw(lv, L.shown[i]!.submenu!, cur!.o);
      L.sub = lv;
      at.setAttribute('aria-expanded', 'true');
      lv.ref = popupsFor(g).open(at, lv.list, {
        placement: 'inline-end', opener: keep(lv, (a) => a), back: () => at.isConnected && at.focus({ preventScroll: true }),
        onClose: () => void (drop(lv), L.sub === lv && ((L.sub = null), at.setAttribute('aria-expanded', 'false'))),
      });
    }
    if (focus) go(L.sub!, 0);
  };
  /** A level's list and its handlers (a root's popup is opened by `open`, a submenu's by `sub`). */
  const level = (at: HTMLElement | null, up: Level | null): Level => {
    const list = doc.createElement('div');
    list.setAttribute('role', 'menu');
    list.className = `dzg-menu ${cur?.o.classes?.menu ?? ''}`.trim();
    const L: Level = { list, ref: null!, shown: [], ms: [], up, sub: null, at };
    list.addEventListener('keydown', (e) => key(L, e));
    list.addEventListener('click', (e) => {
      const x = (e.target as Element).closest<HTMLElement>('[role^=menuitem]');
      if (x) run(L, items(L).indexOf(x));
    });
    // A pointer resting 300 ms on an item opens its submenu (and closes another one), never moving the focus.
    list.addEventListener('pointerover', (e) => {
      const x = (e.target as Element).closest<HTMLElement>('[role^=menuitem]');
      const i = x ? items(L).indexOf(x) : -1;
      hover();
      if (i >= 0 && L.sub?.at !== x) hover = scope.timeout(() => (L.shown[i]?.submenu ? sub(L, i, false) : shut(L.sub)), 300);
    });
    return L;
  };
  /** The menu's keys (APG): it owns them all but Escape, the popup host's. */
  const key = (L: Level, e: KeyboardEvent): void => {
    const k = e.key;
    const arrow = k.startsWith('Arrow');
    // The browser's own keys (F5, Ctrl/Cmd+R, Alt+letter…) stay the browser's; Escape is the popup host's.
    if (k === 'Escape' || e.ctrlKey || e.metaKey || (e.altKey && !arrow) || ([...k].length > 1 && !arrow && !/^(Home|End|Enter|Tab)$/.test(k))) return;
    e.preventDefault();
    const i = items(L).indexOf(doc.activeElement as HTMLElement);
    // The forward arrow opens a submenu, the back arrow closes it: the grid's own reading (mirrored right to left).
    const step = arrow && intentFor(e, { dir: g.dir, owner: 'cell', mac: g.mac });
    if (k === 'ArrowDown' || k === 'ArrowUp') go(L, i + (k === 'ArrowDown' ? 1 : -1));
    else if (k === 'Home' || k === 'End') go(L, k === 'Home' ? 0 : -1);
    else if (k === 'Enter' || k === ' ') run(L, i);
    else if (k === 'Tab') close();
    else if (step && step.kind === 'move' && step.axis === 'col') step.delta > 0 ? L.shown[i]?.submenu && sub(L, i, true) : L.up && shut(L);
    else if ([...k].length === 1) {
      // Type-ahead (folded as the quick search): a prefix typed within 500 ms; one letter again goes on to the next.
      hushBuf();
      hushBuf = scope.timeout(() => (buf = ''), 500);
      buf += k;
      const f = fold(buf);
      const one = [...f].every((x) => x === f[0]);
      const shown = L.shown;
      const find = (q: string, from: number): number => {
        for (let j = 0; j < shown.length; j++) if (fold(shown[(from + j) % shown.length]!.label).startsWith(q)) return (from + j) % shown.length;
        return -1;
      };
      let x = one ? find(f[0]!, i + 1) : find(f, i);
      if (x < 0 && !one) (buf = k), (x = find(fold(k), i + 1));
      if (x >= 0) go(L, x);
    }
  };

  made = {
    open(o) {
      const prev = cur ? cur.prev : doc.activeElement;
      close(true);
      const c: Cur = { o, prev, root: null! };
      cur = c;
      const root = ((c as { root: Level }).root = level(null, null));
      root.list.setAttribute('aria-label', o.label);
      draw(root, o.entries(), o);
      root.ref = popupsFor(g).open(o.anchor, root.list, {
        placement: 'block-end', from: o.from ?? o.anchor, ...(o.align && { align: o.align }), fit: true, opener: keep(root, o.opener ?? ((a) => a)),
        back: () => void (quiet || back(c)),
        onClose: () => void (hover(), shut(root.sub), drop(root), cur === c && ((cur = null), o.onClose?.())),
      });
      go(root, 0);
    },
    close,
    current: () => cur && { owner: cur.o.owner, id: cur.o.id },
    hand: () => void (handed = true),
    swallow: (r) => void (sw = r),
    has(n) {
      for (let L = cur?.root ?? null; L; L = L.sub) if (L.ref.el.contains(n)) return true;
      return false;
    },
  };
  lists.set(g, made);
  return made;
}
