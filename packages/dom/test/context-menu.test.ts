// The cell menu, opening (docs/behaviors/context-menu.md 1–5, 7; owner Q-CM1 A, Q-CM2 A; context-menu-plan §8 1–6): a
// right-click on a body cell, Shift+F10 and the Menu key on a focused cell (the `contextmenu` they may also send
// swallowed: one menu), a Mac's Ctrl+click (the block kept, the click after swallowed), and where it never opens:
// headers, an open editor's field, a nested grid, touch and pen, nothing to offer.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, k, R_, rowsOf } from './support-context-menu.js';

afterEach(() => (cleanup(), vi.restoreAllMocks()));

describe('opening (context-menu.md 1)', () => {
  it('a right-click on a body cell: one menu named « Cell menu », its first item focused, the browser menu prevented', () => {
    const t = cmake();
    const { e } = t.rclick(t.cell('r2', 'n')!);
    expect(e.defaultPrevented).toBe(true);
    expect(t.lists()).toHaveLength(1);
    expect(t.list()!.getAttribute('aria-label')).toBe('Cell menu');
    expect(t.ids()).toEqual(['copy', 'copy.headers']);
    expect(t.focused()).toBe('copy');
    expect(t.menuApi().current()).toEqual({ row: k('r2'), column: 'n' });
  });

  it('in French and Arabic: the menu named by the locale', () => {
    const fr = cmake({ lang: 'fr' });
    fr.rclick(fr.cell('r1', 'n')!);
    expect(fr.list()!.getAttribute('aria-label')).toBe('Menu de la cellule');
    cleanup();
    const ar = cmake({ lang: 'ar' });
    ar.rclick(ar.cell('r1', 'n')!);
    expect(ar.list()!.getAttribute('aria-label')).toBe('قائمة الخلية');
    expect(ar.list()!.closest('.dzg-popup')!.getAttribute('dir')).toBe('rtl');
  });

  it('Shift+right-click: the browser menu (not prevented), no menu', () => {
    const t = cmake();
    const { e } = t.rclick(t.cell('r2', 'n')!, { shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
  });

  for (const k of [['F10', { shiftKey: true }], ['ContextMenu', {}]] as const) {
    it(`${k[0]} on a focused cell opens one menu; the contextmenu the key also sends is swallowed (never two)`, () => {
      const t = cmake();
      t.focusAt('r3', 's');
      const kd = t.key(k[0], k[1]);
      expect(kd.defaultPrevented).toBe(true);
      expect(t.lists()).toHaveLength(1);
      expect(t.focused()).toBe('copy');
      // The key's own contextmenu, at 0, 0, on what has the focus now (the menu's item).
      const e = t.context(document.activeElement!);
      expect(e.defaultPrevented).toBe(true);
      expect(t.lists()).toHaveLength(1);
      expect(t.focused()).toBe('copy');
    });
  }

  it('a contextmenu made by a key on a focused cell (no keydown seen): one menu, placed by the cell', () => {
    const t = cmake();
    t.focusAt('r3', 's');
    const e = t.context(t.cell('r3', 's')!);
    expect(e.defaultPrevented).toBe(true);
    expect(t.lists()).toHaveLength(1);
  });

  it('Escape closes it, the focus back on the cell', () => {
    const t = cmake();
    t.focusAt('r3', 's');
    t.key('F10', { shiftKey: true });
    t.key('Escape');
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.cell('r3', 's'));
  });

  it('Tab closes it, the focus back on the cell', () => {
    const t = cmake();
    t.focusAt('r3', 's');
    t.key('ContextMenu');
    t.key('Tab');
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.cell('r3', 's'));
  });

  it('ArrowDown / ArrowUp wrap; Home / End', () => {
    const t = cmake({ with: ['edit'] });
    t.focusAt('r3', 's');
    t.key('ContextMenu');
    expect(t.ids()).toEqual(['copy', 'copy.headers', 'cut', 'paste', 'undo', 'redo']);
    t.key('ArrowUp');
    expect(t.focused()).toBe('redo');
    t.key('ArrowDown');
    expect(t.focused()).toBe('copy');
    t.key('End');
    expect(t.focused()).toBe('redo');
    t.key('Home');
    expect(t.focused()).toBe('copy');
  });

  it('api.open on a shown cell opens it; on a row not shown, false', () => {
    const t = cmake();
    const key = t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(2)!);
    expect(t.menuApi().open({ row: key, column: 'n' })).toBe(true);
    expect(t.lists()).toHaveLength(1);
    expect(t.menuApi().current()).toEqual({ row: key, column: 'n' });
    t.menuApi().close();
    expect(t.list()).toBeNull();
    expect(t.menuApi().current()).toBeNull();
    const far = t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(190)!);
    expect(t.menuApi().open({ row: far, column: 'n' })).toBe(false);
  });
});

describe('a Mac (context-menu.md 7)', () => {
  it('Ctrl+click inside a block keeps the block, opens the menu, and the click after it is swallowed', () => {
    const t = cmake({ mac: true, settings: { selection: { mode: 'multi', click: true } } });
    t.focusAt('r1', 'n');
    t.api().set(R_(['r1', 'n'], ['r3', 's']));
    const clicks = vi.fn();
    t.g.kernel.subscribe((e) => void (e.type === 'rowClicked' && clicks()));
    const { e, click } = t.rclick(t.cell('r2', 's')!, { ctrl: true });
    expect(t.block()).toBe('r1/n:r3/s');
    expect(e.defaultPrevented).toBe(true);
    expect(t.lists()).toHaveLength(1);
    expect(click!.defaultPrevented).toBe(true);
    expect(clicks).not.toHaveBeenCalled();
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });
});

describe('never opened (context-menu.md 2–4)', () => {
  it('on a header: with the column menu, its menu; without it, the browser menu (not prevented)', () => {
    const t = cmake();
    const h = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    expect(t.context(h, { clientX: 20, clientY: 10 }).defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
    cleanup();
    const c = cmake({ with: ['column-menu'] });
    const h2 = c.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    expect(c.context(h2, { clientX: 20, clientY: 10 }).defaultPrevented).toBe(true);
    expect(c.list()!.getAttribute('aria-label')).toBe('N column');
  });

  it('Shift+F10 on a header without the column menu: no cell menu', () => {
    const t = cmake();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'n' } }, 'api');
    t.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.focus();
    t.key('F10', { shiftKey: true });
    expect(t.list()).toBeNull();
  });

  for (const pointerType of ['touch', 'pen']) {
    it(`a long press by ${pointerType}: nothing of ours, not prevented (Q-CM1 A)`, () => {
      const t = cmake();
      const { e } = t.rclick(t.cell('r2', 'n')!, { pointerType });
      expect(e.defaultPrevented).toBe(false);
      expect(t.list()).toBeNull();
    });
  }

  it('inside an open editor’s field: the browser menu (not prevented)', () => {
    const t = cmake({ with: ['edit'] });
    const cell = t.cell('r2', 's')!;
    const field = document.createElement('input');
    cell.append(field);
    t.ctx.editor = { key: t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(2)!), column: 's', cell, field };
    expect(t.context(field, { clientX: 20, clientY: 70 }).defaultPrevented).toBe(false);
    // Another cell while the editor stays open (its refusal kept it): the browser's too.
    expect(t.context(t.cell('r4', 'n')!, { clientX: 20, clientY: 140 }).defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('a filler or a detail panel’s content: not ours', () => {
    const t = cmake();
    const odd = document.createElement('div');
    odd.className = 'dzg-row';
    odd.innerHTML = '<div class="dzg-cell" data-col="n">x</div>';
    t.ctx.el.layer.append(odd);
    expect(t.context(odd.firstElementChild!, { clientX: 20, clientY: 70 }).defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
  });

  it('a nested grid’s cell: never the outer grid’s menu', () => {
    const outer = cmake();
    const inner = cmake({ host: outer.cell('r1', 'n')!.appendChild(document.createElement('div')) });
    inner.rclick(inner.cell('r2', 's')!);
    expect(outer.lists().filter((l) => !inner.ctx.el.root.contains(l))).toHaveLength(0);
    expect(inner.lists()).toHaveLength(1);
  });

  it('nothing to offer (no use, no items; or items giving []): the browser menu (Q-CM2 A)', () => {
    const t = cmake({ menu: {} });
    expect(t.rclick(t.cell('r2', 'n')!).e.defaultPrevented).toBe(false);
    expect(t.list()).toBeNull();
    cleanup();
    const u = cmake({ menu: ({ range }) => ({ use: { range }, items: () => [] }) });
    expect(u.rclick(u.cell('r2', 'n')!).e.defaultPrevented).toBe(false);
    expect(u.list()).toBeNull();
    // By the keys: not taken either.
    u.focusAt('r3', 's');
    expect(u.key('F10', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(u.list()).toBeNull();
    // A separator alone is nothing.
    cleanup();
    const s = cmake({ menu: { items: () => [{ separator: true }] } });
    expect(s.rclick(s.cell('r2', 'n')!).e.defaultPrevented).toBe(false);
  });
});

describe('one menu per grid (context-menu.md 5)', () => {
  it('a cell menu open, a header right-click: the column menu, the cell menu closed; and back', () => {
    const t = cmake({ with: ['column-menu'] });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.list()!.getAttribute('aria-label')).toBe('Cell menu');
    const h = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell[data-col="s"]')!;
    t.context(h, { clientX: 20, clientY: 10 });
    expect(t.lists()).toHaveLength(1);
    expect(t.list()!.getAttribute('aria-label')).toBe('S column');
    expect(t.menuApi().current()).toBeNull();
    t.rclick(t.cell('r3', 'q')!);
    expect(t.lists()).toHaveLength(1);
    expect(t.list()!.getAttribute('aria-label')).toBe('Cell menu');
  });
});

describe('closing on its own (context-menu.md 21)', () => {
  it('its row filtered away, its column hidden, the direction changed, the grid destroyed: closed', () => {
    const t = cmake();
    t.rclick(t.cell('r2', 'n')!);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    expect(t.list()).toBeNull();
    t.rclick(t.cell('r2', 's')!);
    t.g.update({ rows: rowsOf(200).filter((r) => r.id !== 'r2') });
    expect(t.list()).toBeNull();
    cleanup();
    const d = cmake();
    d.rclick(d.cell('r2', 's')!);
    d.g.update({ direction: 'rtl' });
    expect(d.list()).toBeNull();
    d.rclick(d.cell('r2', 's')!);
    const root = d.ctx.el.root;
    d.g.destroy();
    expect(root.querySelector('[role=menu]')).toBeNull();
  });
});
