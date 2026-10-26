// The keys inside the column menu (Phase 6 step 3, column-menu.md 18–21, APG « menu »; step03-plan §3–4): Down / Up
// wrap, Home / End, disabled items focusable and inert, type-ahead folded (French accents, Arabic hamza forms), Enter
// and Space act and close (a radio too), Left / Right nothing, Escape / Tab / Shift+Tab close with the focus back on
// the header it was opened from; the menu owns its keys (the grid never moves under them); roving tabindex.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, mmake, MCOLS } from './support-column-menu.js';

afterEach(cleanup);

/** Opened by Shift+F10 on a focused header. */
const byKeys = (t: ReturnType<typeof mmake>, col: string) => {
  t.focusHeader(col);
  t.key('F10', { shiftKey: true });
};

describe('moving inside (APG)', () => {
  it('Down / Up wrap, Home / End; one item tabbable at a time (roving)', () => {
    const t = mmake();
    byKeys(t, 'n');
    const all = t.ids();
    expect(all[0]).toBe('sort.asc');
    expect(t.focused()).toBe('sort.asc');
    t.key('ArrowDown');
    expect(t.focused()).toBe(all[1]);
    t.key('ArrowUp');
    t.key('ArrowUp');
    expect(t.focused()).toBe(all.at(-1));
    t.key('ArrowDown');
    expect(t.focused()).toBe(all[0]);
    t.key('End');
    expect(t.focused()).toBe(all.at(-1));
    t.key('Home');
    expect(t.focused()).toBe(all[0]);
    expect(t.items().filter((x) => x.tabIndex === 0).map((x) => x.dataset['id'])).toEqual(['sort.asc']);
  });

  it('a disabled item is focusable, said disabled, and does nothing (Enter, Space, a click)', () => {
    // The last visible column cannot be hidden (O1).
    const t = mmake({ columns: MCOLS({ name: { hidden: true }, n: { hidden: true }, s: { hidden: true } }) });
    byKeys(t, 'q');
    expect(t.off('hide')).toBe(true);
    while (t.focused() !== 'hide') t.key('ArrowDown');
    t.key('Enter');
    t.key(' ');
    t.item('hide')!.click();
    expect(t.list()).not.toBeNull();
    expect(t.order()).toEqual(['q']);
  });

  it('Left / Right: nothing (no submenu); the grid never moves under the menu\'s keys', () => {
    const t = mmake();
    byKeys(t, 'n');
    t.key('ArrowDown');
    const at = t.focused();
    t.key('ArrowLeft');
    t.key('ArrowRight');
    t.key('PageDown');
    expect(t.focused()).toBe(at);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
    expect(t.popup()!.dataset['dzgOwner']).toBe('popup');
  });
});

describe('type-ahead (column-menu.md 18)', () => {
  it('French: a letter goes to the next item starting with it, accents folded; the same letter again goes on', () => {
    const t = mmake({ lang: 'fr' });
    byKeys(t, 'n');
    t.key('e');
    expect(t.focused()).toBe('pin.start');
    t.key('e');
    expect(t.focused()).toBe('pin.end');
    t.key('E');
    expect(t.focused()).toBe('size.widen');
    t.key('m');
    expect(t.focused()).toBe('hide');
    // A key with Ctrl is not a letter typed.
    t.key('r', { ctrlKey: true });
    expect(t.focused()).toBe('hide');
  });

  it('a prefix typed within 500 ms; after the pause a new search', () => {
    vi.useFakeTimers();
    const t = mmake({ lang: 'fr' });
    byKeys(t, 'n');
    t.key('r');
    expect(t.focused()).toBe('size.narrow');
    t.key('e');
    // « re »: Rétrécir still matches (the search starts on the focused item).
    expect(t.focused()).toBe('size.narrow');
    t.key('i');
    // « rei »: Réinitialiser.
    expect(t.focused()).toBe('reset');
    vi.advanceTimersByTime(600);
    t.key('t');
    expect(t.focused()).toBe('sort.asc');
  });

  it('Arabic: a bare alef finds « إخفاء العمود » (hamza forms folded), then « إعادة تعيين الأعمدة »', () => {
    const t = mmake({ lang: 'ar' });
    byKeys(t, 'n');
    t.key('ا');
    expect(t.focused()).toBe('hide');
    t.key('ا');
    expect(t.focused()).toBe('reset');
  });
});

describe('acting and closing (column-menu.md 19–20)', () => {
  it('Enter on a radio item: done, closed, the focus back on the header', () => {
    const t = mmake();
    byKeys(t, 'n');
    t.key('Enter');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.hcell('n'));
  });

  it('Space acts too', () => {
    const t = mmake();
    byKeys(t, 'n');
    t.key('ArrowDown');
    t.key(' ');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(t.list()).toBeNull();
  });

  for (const [k, mods] of [['Escape', {}], ['Tab', {}], ['Tab', { shiftKey: true }]] as const) {
    it(`${k}${'shiftKey' in mods ? ' with Shift' : ''}: closes, nothing done, the focus back on the header`, () => {
      const t = mmake();
      byKeys(t, 's');
      t.key('ArrowDown');
      const e = t.key(k, mods);
      expect(e.defaultPrevented).toBe(true);
      expect(t.list()).toBeNull();
      expect(document.activeElement).toBe(t.hcell('s'));
      expect(t.g.kernel.query.sort).toEqual([]);
      expect(t.btn('s')!.getAttribute('aria-expanded')).toBe('false');
    });
  }

  it('a click on an item acts and closes', () => {
    const t = mmake();
    byKeys(t, 's');
    t.item('sort.desc')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 's', dir: 'desc' }]);
    expect(t.list()).toBeNull();
    expect(document.activeElement).toBe(t.hcell('s'));
  });

  it('a press outside closes it as Escape: nothing done (the press\'s own target then acts)', () => {
    const t = mmake();
    byKeys(t, 's');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(t.list()).toBeNull();
    expect(t.g.kernel.query.sort).toEqual([]);
  });
});

describe('review of steps 3–4: the browser\'s own keys; the focused item in view', () => {
  it('Ctrl/Cmd+R, F5, Ctrl+F, Alt+letter are left to the browser (not prevented, the menu open); the menu\'s keys still prevented', () => {
    const t = mmake();
    byKeys(t, 'n');
    for (const [k, mods] of [['r', { ctrlKey: true }], ['r', { metaKey: true }], ['F5', {}], ['f', { ctrlKey: true }], ['x', { altKey: true }], ['l', { metaKey: true }]] as const) {
      expect(t.key(k, mods).defaultPrevented, `${k} ${JSON.stringify(mods)}`).toBe(false);
    }
    expect(t.list()).not.toBeNull();
    expect(t.focused()).toBe('sort.asc');
    for (const k of ['ArrowDown', 'Home', 'End']) expect(t.key(k).defaultPrevented, k).toBe(true);
  });

  it('each item the keys focus is scrolled into view (nearest), the menu may scroll inside', () => {
    const into = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = into;
    try {
      const t = mmake();
      byKeys(t, 'n');
      t.key('End');
      expect(into).toHaveBeenLastCalledWith({ block: 'nearest' });
      expect(into.mock.instances.at(-1)).toBe(document.activeElement);
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});
