// Opening and closing the column chooser (Phase 6 step 4, docs/behaviors/columns-chooser.md 1–5; step04-plan §0, §2,
// §4; owner Q-C1, O12): a modal dialog named by its visible title, the focus in its search box; one dialog however often
// it is opened; Escape, « Close », a press outside, the grid destroyed and new definitions close it, the focus back to
// the opener (the application's button; the grid's own focus for a header); the menu's « Choose columns… » opens it
// (the step 3 seam) and unticking the opener's own column keeps it open (anchored on the grid's root, §0.1); its keys
// never reach the grid (§0.4); `api()` null before its setup and after the grid is destroyed.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { columnsChooser } from '../src/columns-panel.js';
import { cleanup, cmake, CCOLS } from './support-columns-panel.js';
import { k } from './support-range.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('opening', () => {
  it('a modal dialog named by its visible title; the focus in the search box, which has a visible label', () => {
    const t = cmake();
    expect(t.api().isOpen).toBe(false);
    expect(t.api().open(t.appButton)).toBe(true);
    expect(t.api().isOpen).toBe(true);
    const d = t.dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(d.getAttribute('aria-labelledby')!)!;
    expect(title.textContent).toBe('Choose columns');
    expect(t.panel()!.contains(title)).toBe(true);
    expect(d.hasAttribute('aria-label')).toBe(false);
    expect(t.focused()).toBe('search');
    expect(t.search()!.closest('label')!.textContent).toContain('Search a column');
    expect(t.search()!.hasAttribute('placeholder')).toBe(false);
    // The list named; « Show all », « Reset », « Close » after it.
    expect(t.panel()!.querySelector('.dzg-cp-list')!.getAttribute('aria-label')).toBe('Columns');
    expect(t.panel()!.querySelector('.dzg-cp-list')!.getAttribute('role')).toBe('list');
    expect(['all', 'reset', 'close'].map((a) => t.foot(a)?.textContent)).toEqual(['Show all', 'Reset', 'Close']);
  });

  it('opened twice: one dialog, the focus back in the search box', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.box('name')!.focus();
    expect(t.api().open(t.appButton)).toBe(true);
    expect(document.querySelectorAll('.dzg-popup[role=dialog]').length).toBe(1);
    expect(t.focused()).toBe('search');
  });

  it('nothing to list (every column `chooser: false`): false, no dialog; opens without an anchor too', () => {
    const none = cmake({ columns: CCOLS({ ref: { chooser: false }, name: { chooser: false }, date: { chooser: false }, qty: { chooser: false }, amount: { chooser: false }, note: { chooser: false } }) });
    expect(none.api().open()).toBe(false);
    expect(none.dialog()).toBeNull();
    cleanup();
    const t = cmake();
    expect(t.api().open()).toBe(true);
    expect(t.dialog()).not.toBeNull();
  });
});

describe('closing', () => {
  it('Escape (an empty search box): closed, the focus back on the application\'s button, onClose told once', () => {
    const onClose = vi.fn();
    const t = cmake({ chooser: { onClose } });
    t.appButton.focus();
    t.api().open(t.appButton);
    t.key('Escape');
    expect(t.dialog()).toBeNull();
    expect(t.api().isOpen).toBe(false);
    expect(document.activeElement).toBe(t.appButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('« Close », api.close(), a press outside: closed', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.click(t.foot('close')!);
    expect(t.dialog()).toBeNull();
    expect(document.activeElement).toBe(t.appButton);
    t.api().open(t.appButton);
    t.api().close();
    expect(t.dialog()).toBeNull();
    t.api().open(t.appButton);
    t.outside();
    expect(t.dialog()).toBeNull();
  });

  it('a press on the application\'s button while open keeps it open (its click opens it again, the focus in the search)', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.appButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
    expect(t.dialog()).not.toBeNull();
  });

  it('the grid destroyed: closed, no focus moved; the api null after', () => {
    const t = cmake();
    const f = t.ch();
    t.api().open(t.appButton);
    t.g.destroy();
    expect(t.dialog()).toBeNull();
    expect(f.api(t.g)).toBeNull();
  });

  it('new definitions from the host (another set of columns): closed; the same set again: kept', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.g.update({ columns: CCOLS({ name: { header: 'Full name' } }) as never });
    expect(t.dialog()).not.toBeNull();
    expect(t.row('name')!.textContent).toContain('Full name');
    t.g.update({ columns: CCOLS().slice(1) as never });
    expect(t.dialog()).toBeNull();
  });
});

describe('from the column menu (the step 3 seam)', () => {
  it('« Choose columns… » opens it under the header; unticking that same column keeps it open; Escape: the grid\'s focus back', () => {
    const t = cmake({ menu: true });
    expect(t.menu()!.api(t.g)!.open('name')).toBe(true);
    const item = document.querySelector<HTMLElement>('[role=menuitem][data-id=choose]')!;
    expect(item.textContent).toBe('Choose columns…');
    item.click();
    expect(t.dialog()).not.toBeNull();
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(t.focused()).toBe('search');
    t.click(t.box('name')!);
    expect(t.shown()).not.toContain('name');
    expect(t.dialog()).not.toBeNull();
    t.key('Escape');
    expect(t.dialog()).toBeNull();
    // The header it came from is gone: the grid's own focus.
    expect(t.ctx.el.root.contains(document.activeElement)).toBe(true);
  });

  it('opened from a header still shown: Escape gives the focus to that header', () => {
    const t = cmake({ menu: true });
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'date' } }, 'api');
    t.menu()!.api(t.g)!.open('date');
    document.querySelector<HTMLElement>('[role=menuitem][data-id=choose]')!.click();
    t.key('Escape');
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('date');
  });
});

describe('the keys stay inside', () => {
  it('arrows, Space, Home, End, Alt+arrows, Ctrl/Cmd+Shift+arrows in the dialog never move the grid\'s focus', () => {
    const t = cmake({ menu: true });
    t.focus('r3', 'name');
    t.api().open(t.appButton);
    t.key('ArrowDown');
    for (const [key, mods] of [['ArrowDown', {}], ['End', {}], ['Home', {}], ['ArrowUp', { altKey: true }], ['ArrowRight', { ctrlKey: true, shiftKey: true }], ['PageDown', {}]] as const) t.key(key, mods);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('r3'), column: 'name' });
    expect(t.dialog()).not.toBeNull();
  });
});

describe('one feature object, several grids; before its setup', () => {
  it('api() null for a grid it is not set up on', () => {
    const f = columnsChooser();
    const t = cmake();
    expect(f.api(t.g)).toBeNull();
  });
});
