// Opening the column menu (Phase 6 step 3, column-menu.md 1–7, owner Q-M2, Q-K1, Q3-1; « Step 1 follow-ups » O11, C3,
// Mac; step03-plan §2): the ⋮ button (named, out of the tab order, its press never moving the focus, never sorting,
// gone under 96 px), a right-click (Shift+right-click left to the browser), Shift+F10 and the Menu key (one menu even
// when the browser sends its `contextmenu` after), Alt+ArrowDown only where the column has no filter popup (both feature
// orders), Ctrl+click on a Mac (its click never sorts); never on a group, a floating cell, `menu: false`, out of the
// column window, with an editor open, nor from a nested grid; one menu per grid; the decorations' order.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { spans } from '../src/spans.js';
import { cleanup, mmake, MCOLS, type R } from './support-column-menu.js';

afterEach(cleanup);

describe('the ⋮ button (column-menu.md 1–3)', () => {
  it('on each column header of 96 px and more: a button out of the tab order, named, a menu popup, collapsed; not with `menu: false` nor under 96 px', () => {
    const t = mmake({ columns: MCOLS({ n: { width: 95 }, s: { width: 96 }, q: { menu: false } }) });
    const b = t.btn('name')!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.type).toBe('button');
    expect(b.tabIndex).toBe(-1);
    expect(b.getAttribute('aria-haspopup')).toBe('menu');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe('Name column menu');
    expect(t.btn('n')).toBeNull();
    expect(t.btn('s')).not.toBeNull();
    expect(t.btn('q')).toBeNull();
    // The header keeps its own name: the button's never joins it.
    expect(t.hcell('name')!.getAttribute('aria-label')).toBe('Name');
    // Widened past 96 px: drawn; narrowed: gone.
    t.g.kernel.dispatch({ type: 'column.resize', column: 'n', width: 100, finished: true }, 'user');
    expect(t.btn('n')).not.toBeNull();
    t.g.kernel.dispatch({ type: 'column.resize', column: 's', width: 60, finished: true }, 'user');
    expect(t.btn('s')).toBeNull();
  });

  it('a press neither moves the focus nor sorts nor drags; its click opens the menu (first item focused), a second closes it', () => {
    const t = mmake({ with: ['columns'] });
    const before = document.activeElement;
    const { p, m } = t.open('name');
    expect(m.defaultPrevented).toBe(true);
    expect(p.defaultPrevented).toBe(false);
    expect(t.list()).not.toBeNull();
    expect(t.list()!.getAttribute('aria-label')).toBe('Name column');
    expect(t.focused()).toBe(t.ids()[0]);
    expect(t.btn('name')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.hcell('name')!.hasAttribute('data-dzg-menu')).toBe(true);
    expect(t.of('sortChanged')).toEqual([]);
    expect(t.ctx.el.root.hasAttribute('data-dzg-dragging')).toBe(false);
    expect(t.menuApi().current()).toBe('name');
    t.open('name');
    expect(t.list()).toBeNull();
    expect(t.btn('name')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.hcell('name')!.hasAttribute('data-dzg-menu')).toBe(false);
    expect(t.of('sortChanged')).toEqual([]);
    // Nothing focused before (the page): the focus never landed on the header nor the button by the press.
    expect(before === document.body ? document.activeElement !== t.btn('name') : true).toBe(true);
  });

  it('the ⋮ after the sort mark and the filter button in the DOM, whatever the features\' order (their visual order is the theme\'s `order`)', () => {
    for (const first of [false, true]) {
      const t = mmake({ with: ['filters'], first });
      t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'api');
      const kids = [...t.hcell('name')!.children].map((c) => c.className.split(' ')[0] ?? '').filter((c) => /dzg-(sort|fbtn|mbtn)$/.test(c));
      expect(kids.at(-1), String(first)).toBe('dzg-mbtn');
      expect([...kids].sort(), String(first)).toEqual(['dzg-fbtn', 'dzg-mbtn', 'dzg-sort']);
      t.g.destroy();
    }
  });
});

describe('a right-click on a header (column-menu.md 4, O11)', () => {
  it('replaces the browser\'s menu: our menu at the pointer, the press not moving the focus; never sorts', () => {
    const t = mmake();
    const { m, e } = t.rclick('s');
    expect(m.defaultPrevented).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(t.menuApi().current()).toBe('s');
    expect(t.focused()).toBe(t.ids()[0]);
    expect(t.of('sortChanged')).toEqual([]);
  });

  it('Shift+right-click keeps the browser\'s menu: not prevented, no menu; inside an open menu a contextmenu is always prevented, never reopened', () => {
    const t = mmake();
    const { e } = t.rclick('s', { shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
    t.open('n');
    const first = t.list();
    const e2 = t.context(t.items()[1]!, { shiftKey: true, clientX: 5, clientY: 5 });
    expect(e2.defaultPrevented).toBe(true);
    expect(t.list()).toBe(first);
    expect(t.menuApi().current()).toBe('n');
  });

  it('on a body cell: left alone (no menu on cells in this phase)', () => {
    const t = mmake();
    const e = t.context(t.cell('r1', 'n')!, { clientX: 10, clientY: 80 });
    expect(e.defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('a Mac: Ctrl+click arrives as contextmenu: the press does not move the focus, the menu opens, the click after does not sort', () => {
    const t = mmake({ mac: true });
    const el = t.hcell('n')!;
    const { m } = t.press(el, { ctrlKey: true, click: false, clientX: 30, clientY: 20 });
    expect(m.defaultPrevented).toBe(true);
    t.context(el, { ctrlKey: true, button: 0, clientX: 30, clientY: 20 });
    expect(t.menuApi().current()).toBe('n');
    const c = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    el.dispatchEvent(c);
    expect(t.of('sortChanged')).toEqual([]);
    // The next plain click sorts again.
    t.press(el);
    expect(t.of('sortChanged')).toHaveLength(1);
  });
});

describe('the keys on a focused header (column-menu.md 4, Q-K1, C3)', () => {
  it('Shift+F10: prevented, the menu, its first item focused; the contextmenu the browser sends after: prevented, still one menu', () => {
    const t = mmake();
    t.focusHeader('s');
    const e = t.key('F10', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    const menu = t.list();
    expect(t.menuApi().current()).toBe('s');
    expect(t.focused()).toBe(t.ids()[0]);
    // Some engines fire it on the focused element (now the item), others at the header: both swallowed.
    expect(t.context(document.activeElement!).defaultPrevented).toBe(true);
    expect(t.context(t.hcell('s')!).defaultPrevented).toBe(true);
    expect(t.list()).toBe(menu);
    expect(t.ctx.el.root.querySelectorAll('[role=menu]')).toHaveLength(1);
  });

  it('the Menu key (ContextMenu); a contextmenu a key made (at 0, 0) on a focused header opens it under the header', () => {
    const t = mmake();
    t.focusHeader('q');
    expect(t.key('ContextMenu').defaultPrevented).toBe(true);
    expect(t.menuApi().current()).toBe('q');
    t.key('Escape');
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.hcell('q'));
    expect(t.context(t.hcell('q')!).defaultPrevented).toBe(true);
    expect(t.menuApi().current()).toBe('q');
  });

  it('modifiers other than Shift: F10 with Ctrl, Alt or Meta is not ours', () => {
    const t = mmake();
    t.focusHeader('s');
    for (const m of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      t.key('F10', { shiftKey: true, ...m });
      expect(t.list(), JSON.stringify(m)).toBeNull();
    }
    t.key('F10');
    expect(t.list()).toBeNull();
  });

  for (const first of [false, true]) {
    it(`Alt+ArrowDown: the filter popup where the column has one, the menu where it has none (C3; the menu ${first ? 'first' : 'last'})`, () => {
      const t = mmake({ with: ['filters'], first, columns: MCOLS({ q: { filter: false } }) });
      t.focusHeader('name');
      t.key('ArrowDown', { altKey: true });
      expect(t.list()).toBeNull();
      expect(t.ctx.el.root.querySelector('.dzg-popup [role=dialog], .dzg-popup[role=dialog]')).not.toBeNull();
      t.key('Escape');
      t.focusHeader('q');
      expect(t.key('ArrowDown', { altKey: true }).defaultPrevented).toBe(true);
      expect(t.menuApi().current()).toBe('q');
    });
  }

  it('Alt+ArrowDown without the filters feature: the menu; with Shift or Ctrl: not', () => {
    const t = mmake();
    t.focusHeader('n');
    t.key('ArrowDown', { altKey: true, shiftKey: true });
    t.key('ArrowDown', { altKey: true, ctrlKey: true });
    expect(t.list()).toBeNull();
    t.key('ArrowDown', { altKey: true });
    expect(t.menuApi().current()).toBe('n');
  });
});

describe('never opened (column-menu.md 2, 6; step03-plan §2 « Common »)', () => {
  it('`menu: false`: no button, keys and right-click left to the page', () => {
    const t = mmake({ columns: MCOLS({ s: { menu: false } }) });
    t.focusHeader('s');
    expect(t.key('F10', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.key('ArrowDown', { altKey: true }).defaultPrevented).toBe(false);
    expect(t.rclick('s').e.defaultPrevented).toBe(false);
    expect(t.menuApi().open('s')).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('under 96 px the keys and the right-click still open it', () => {
    const t = mmake({ columns: MCOLS({ n: { width: 80 } }) });
    expect(t.btn('n')).toBeNull();
    t.rclick('n');
    expect(t.menuApi().current()).toBe('n');
    t.key('Escape');
    t.focusHeader('n');
    t.key('F10', { shiftKey: true });
    expect(t.menuApi().current()).toBe('n');
  });

  it('a group header, a floating filter cell: nothing', () => {
    const cols: ColumnOrGroup<R>[] = [{ id: 'g', header: 'G', children: MCOLS().slice(0, 2) }, ...MCOLS().slice(2)];
    const t = mmake({ columns: cols as never, with: ['filters'], filters: { floating: true }, more: [spans()] });
    const group = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hgroup')!;
    expect(group.querySelector('.dzg-mbtn')).toBeNull();
    expect(t.context(group, { clientX: 20, clientY: 5 }).defaultPrevented).toBe(false);
    const floating = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hextra')!;
    expect(floating.querySelector('.dzg-mbtn')).toBeNull();
    expect(t.context(floating, { clientX: 20, clientY: 60 }).defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('an editor open in a cell: nothing (the key left unhandled)', () => {
    const t = mmake();
    t.focusHeader('n');
    (t.ctx as { editor?: unknown }).editor = { key: 'x', column: 'n', cell: t.cell('r1', 'n'), field: document.createElement('input') };
    expect(t.key('F10', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
    (t.ctx as { editor?: unknown }).editor = null;
  });

  it('a column out of the column window (its header kept mounted for the focus): nothing', () => {
    const cols = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100 }));
    const t = mmake({ columns: cols as never });
    t.focusHeader('c0');
    t.box.scrollInline = 800;
    t.vp.dispatchEvent(new Event('scroll'));
    expect(t.hcell('c0')).not.toBeNull();
    expect(t.key('F10', { shiftKey: true }, t.hcell('c0')!).defaultPrevented).toBe(false);
    expect(t.menuApi().open('c0')).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('a grid nested in this one: its header opens its own menu only', () => {
    const outer = mmake();
    const inner = mmake({ host: outer.ctx.el.root.appendChild(document.createElement('div')) });
    inner.rclick('n');
    expect(inner.menuApi().current()).toBe('n');
    expect(outer.menuApi().current()).toBeNull();
  });
});

describe('one menu per grid (column-menu.md 6)', () => {
  it('opening another closes the first; the API opens and closes', () => {
    const t = mmake();
    t.open('name');
    t.rclick('q');
    expect(t.ctx.el.root.querySelectorAll('[role=menu]')).toHaveLength(1);
    expect(t.menuApi().current()).toBe('q');
    expect(t.btn('name')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.menuApi().open('s')).toBe(true);
    expect(t.menuApi().current()).toBe('s');
    t.menuApi().close();
    expect(t.list()).toBeNull();
    expect(t.menuApi().open('nope')).toBe(false);
  });

  it('closes on its own: its column hidden, the direction or the language changed, new definitions without it, the grid destroyed (no focus moved then)', () => {
    const t = mmake();
    t.menuApi().open('s');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'api');
    expect(t.list()).toBeNull();
    t.menuApi().open('n');
    t.g.update({ direction: 'rtl' });
    expect(t.list()).toBeNull();
    t.menuApi().open('n');
    t.g.update({ locale: 'fr-FR' });
    expect(t.list()).toBeNull();
    t.menuApi().open('n');
    t.g.update({ columns: MCOLS().filter((c) => c.id !== 'n') });
    expect(t.list()).toBeNull();
    t.menuApi().open('name');
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    t.g.destroy();
    expect(t.list()).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });
});
