// The application's items in the cell menu (docs/behaviors/context-menu.md 16, 18, 20; context-menu-plan §8 22–26):
// `items(ctx, defaults)` adds, removes, throws; submenus (the shared list's: the column menu gets them too) open toward
// the inline end by the forward arrow (ArrowLeft in Arabic), close alone by the back arrow or Escape, a press inside
// one never closes its parent; an item's `part` draws in an inert, hidden host; the focus back after an item.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, fakeClipboard, R_, type R } from './support-context-menu.js';
import { definePart } from '../src/part.js';
import type { MenuEntry, CellMenuContext } from '../src/context-menu.js';

let clip: ReturnType<typeof fakeClipboard> | null = null;
afterEach(() => (clip?.restore(), (clip = null), cleanup(), vi.restoreAllMocks()));

describe('items(ctx, defaults) (context-menu.md 16)', () => {
  it('added after a separator; acting gets the context; the menu closes, the focus back on the cell', () => {
    const act = vi.fn();
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: (_c, d) => [...d, { separator: true }, { id: 'mine', label: 'Mine', action: act }] }) });
    t.focusAt('r2', 'n');
    t.key('F10', { shiftKey: true });
    expect(t.entries()).toEqual(['copy', 'copy.headers', '|', 'mine']);
    t.item('mine')!.click();
    expect(act).toHaveBeenCalledTimes(1);
    expect((act.mock.calls[0]![0] as CellMenuContext<R>).row.id).toBe('r2');
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.cell('r2', 'n'));
  });

  it('defaults filtered away; app items alone with no feature', () => {
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: (_c, d) => d.filter((x) => !('id' in x) || x.id !== 'copy.headers') }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.ids()).toEqual(['copy']);
    cleanup();
    const a = cmake({ menu: { items: () => [{ id: 'a', label: 'A' }] } });
    expect(a.rclick(a.cell('r2', 'n')!).e.defaultPrevented).toBe(true);
    expect(a.ids()).toEqual(['a']);
  });

  it('a throwing items: the defaults, reported; a throwing action: closed, reported', () => {
    const reported = vi.fn();
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: () => { throw new Error('boom'); } }) });
    t.ctx.report = reported;
    t.rclick(t.cell('r2', 'n')!);
    expect(t.ids()).toEqual(['copy', 'copy.headers']);
    expect(reported).toHaveBeenCalledTimes(1);
    cleanup();
    const a = cmake({ menu: { items: () => [{ id: 'x', label: 'X', action: () => { throw new Error('bad'); } }] } });
    a.ctx.report = reported;
    a.rclick(a.cell('r2', 'n')!);
    a.item('x')!.click();
    expect(a.list()).toBeNull();
    expect(reported).toHaveBeenCalledTimes(2);
  });
});

describe('submenus (context-menu.md 18)', () => {
  const sub = (act = vi.fn()) => (_c: unknown, d: readonly MenuEntry<CellMenuContext<R>>[]) => [...d, { id: 'more', label: 'More', submenu: [{ id: 'one', label: 'One', action: act }, { id: 'two', label: 'Two' }] }];

  for (const lang of ['en', 'ar'] as const) {
    const [fwd, back] = lang === 'ar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
    it(`${lang}: ${fwd} opens it (focus on its first item), ${back} closes it back to its item; Escape closes it alone`, () => {
      const t = cmake({ lang, menu: ({ range }) => ({ use: { range }, items: sub() }) });
      t.focusAt('r2', 'n');
      t.key('F10', { shiftKey: true });
      t.key('End');
      expect(t.focused()).toBe('more');
      const more = t.item('more')!;
      expect([more.getAttribute('aria-haspopup'), more.getAttribute('aria-expanded')]).toEqual(['menu', 'false']);
      t.key(back);
      expect(t.lists()).toHaveLength(1);
      t.key(fwd);
      expect(t.lists()).toHaveLength(2);
      expect(t.lists()[1]!.getAttribute('aria-label')).toBe('More');
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(t.focused()).toBe('one');
      t.key(back);
      expect(t.lists()).toHaveLength(1);
      expect(t.focused()).toBe('more');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      t.key('Enter');
      expect(t.focused()).toBe('one');
      t.key('Escape');
      expect(t.lists()).toHaveLength(1);
      expect(t.focused()).toBe('more');
    });
  }

  it('an item inside acts and closes everything, the focus back on the cell; a press inside never closes the parent', () => {
    const act = vi.fn();
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: sub(act) }) });
    t.focusAt('r2', 'n');
    t.key('ContextMenu');
    t.item('more')!.click();
    expect(t.lists()).toHaveLength(2);
    const one = t.item('one')!;
    one.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
    expect(t.lists()).toHaveLength(2);
    one.click();
    expect(act).toHaveBeenCalledTimes(1);
    expect(t.lists()).toHaveLength(0);
    expect(document.activeElement).toBe(t.cell('r2', 'n'));
  });

  it('a press outside both closes both', () => {
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: sub() }) });
    t.focusAt('r2', 'n');
    t.key('ContextMenu');
    t.item('more')!.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
    expect(t.lists()).toHaveLength(0);
  });

  it('a 300 ms hover opens it without moving the focus', () => {
    vi.useFakeTimers();
    try {
      const t = cmake({ menu: ({ range }) => ({ use: { range }, items: sub() }) });
      t.focusAt('r2', 'n');
      t.key('ContextMenu');
      t.item('more')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(299);
      expect(t.lists()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(t.lists()).toHaveLength(2);
      expect(t.focused()).toBe('copy');
    } finally {
      vi.useRealTimers();
    }
  });
});

it('a hover timer is cancelled when its menu closes (no submenu opening after)', () => {
  vi.useFakeTimers();
  try {
    const t = cmake({ menu: ({ range }) => ({ use: { range }, items: (_c, d) => [...d, { id: 'more', label: 'More', submenu: [{ id: 'one', label: 'One' }] }] }) });
    t.focusAt('r2', 'n');
    t.key('ContextMenu');
    t.item('more')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    t.key('Escape');
    t.key('ContextMenu');
    vi.advanceTimersByTime(400);
    expect(t.lists()).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

describe('an item’s part (slot menuItem)', () => {
  it('drawn in an inert, hidden host; the item named by its label; its context has the row and menu: cell', () => {
    const seen: unknown[] = [];
    const t = cmake({
      settings: { parts: { mine: definePart('menuItem', { mount: (host, c) => (seen.push(c), host.append(Object.assign(document.createElement('b'), { textContent: c.label })), {}) }) } },
      menu: ({ range }) => ({ use: { range }, items: (_c, d) => [...d, { id: 'p', label: 'Part item', part: 'mine' }] }),
    });
    t.rclick(t.cell('r2', 'n')!);
    const host = t.item('p')!.querySelector<HTMLElement>('.dzg-mpart')!;
    expect([host.getAttribute('aria-hidden'), host.hasAttribute('inert')]).toEqual(['true', true]);
    expect(t.item('p')!.getAttribute('aria-label')).toBe('Part item');
    expect(seen[0]).toMatchObject({ id: 'p', menu: 'cell', column: { id: 'n' }, row: { id: 'r2' } });
  });
});

describe('the focus back (context-menu.md 20)', () => {
  it('after « Copy »: on the cell it was on, the block intact', () => {
    const t = cmake();
    clip = fakeClipboard({ write: 'ok' });
    t.focusAt('r2', 'n');
    t.api().set(R_(['r2', 'n'], ['r3', 's']));
    t.rclick(t.cell('r3', 's')!);
    t.item('copy')!.click();
    expect(document.activeElement).toBe(t.cell('r2', 'n'));
    expect(t.block()).toBe('r2/n:r3/s');
  });
});
