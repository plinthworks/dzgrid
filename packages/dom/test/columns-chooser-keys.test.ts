// The chooser's keys and ▲ ▼ (Phase 6 step 4, docs/behaviors/columns-chooser.md 7, 16–19; owner Q-H; a11y §21 153–154,
// 165): ArrowDown from the search box to the first box, the arrows / Home / End between boxes, ArrowUp on the first back
// to the search; Alt+ArrowUp / ArrowDown (Option on a Mac) one place in the list, the place said among ALL listed
// columns (hidden ones counted: « place 5 of 12 »), the focus staying on the moved box; the segment's and group's edges
// and locked columns said; ▲ ▼ the same patch and sentence, disabled at the edges and for a locked column, the focus
// back on the row's box; Tab: search → list → Show all → Reset → Close → search.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, ccol } from './support-columns-panel.js';
import { fullOrder } from '../src/columns/order.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Twelve columns, C2 and C3 hidden. */
const TWELVE = () => Array.from({ length: 12 }, (_, i) => ccol(`c${i + 1}`, `C${i + 1}`, { hidden: i === 1 || i === 2 }));

describe('moving between boxes', () => {
  it('search ↓ first box; ↓ ↑ next / previous; Home / End; ↑ on the first: the search', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.key('ArrowDown');
    expect(t.focused()).toBe('ref');
    t.key('ArrowDown');
    expect(t.focused()).toBe('name');
    t.key('End');
    expect(t.focused()).toBe('note');
    t.key('ArrowDown');
    expect(t.focused()).toBe('note');
    t.key('ArrowUp');
    expect(t.focused()).toBe('amount');
    t.key('Home');
    expect(t.focused()).toBe('ref');
    t.key('ArrowUp');
    expect(t.focused()).toBe('search');
  });

  it('a disabled box is still reached by the arrows', () => {
    const t = cmake({ columns: [ccol('a', 'A', { hideable: false }), ccol('b', 'B')] });
    t.api().open(t.appButton);
    t.key('ArrowDown');
    expect(t.focused()).toBe('a');
  });
});

describe('Alt+arrows (Q-H)', () => {
  it('one place down: the place among all listed columns, hidden ones counted (5 of 12); the focus stays on the box', () => {
    const t = cmake({ columns: TWELVE() });
    t.api().open(t.appButton);
    t.box('c4')!.focus();
    const n = t.columnsChanged().length;
    t.key('ArrowDown', { altKey: true });
    expect(fullOrder(t.g.kernel.columns).slice(0, 6)).toEqual(['c1', 'c2', 'c3', 'c5', 'c4', 'c6']);
    expect(t.columnsChanged().length - n).toBe(1);
    expect(t.said().at(-1)).toBe('C4: place 5 of 12');
    expect(t.focused()).toBe('c4');
    t.key('ArrowUp', { altKey: true });
    t.key('ArrowUp', { altKey: true });
    expect(t.said().at(-1)).toBe('C4: place 3 of 12');
    expect(fullOrder(t.g.kernel.columns).slice(0, 4)).toEqual(['c1', 'c2', 'c4', 'c3']);
  });

  it('a Mac: Option+arrows (altKey) the same', () => {
    const t = cmake({ columns: TWELVE(), mac: true });
    t.api().open(t.appButton);
    t.box('c1')!.focus();
    t.key('ArrowDown', { altKey: true });
    expect(t.said().at(-1)).toBe('C1: place 2 of 12');
  });

  it('at a segment\'s edge (never across a pin, O2): « already at the edge »; a locked column: « cannot be moved »', () => {
    const t = cmake({ columns: [ccol('ref', 'Ref', { pinned: 'start' }), ccol('name', 'Name'), ccol('lock', 'Lock', { movable: false })] });
    t.api().open(t.appButton);
    t.box('name')!.focus();
    const n = t.columnsChanged().length;
    t.key('ArrowUp', { altKey: true });
    expect(t.said().at(-1)).toBe('Name: already at the edge');
    t.box('ref')!.focus();
    t.key('ArrowDown', { altKey: true });
    expect(t.said().at(-1)).toBe('Ref: already at the edge');
    t.box('lock')!.focus();
    t.key('ArrowUp', { altKey: true });
    expect(t.said().at(-1)).toBe('Lock: cannot be moved');
    expect(t.columnsChanged().length).toBe(n);
  });

  it('inside a group only: its top says « already at the edge »', () => {
    const t = cmake({ columns: [ccol('a', 'A'), { id: 'g', header: 'G', children: [ccol('g1', 'G1'), ccol('g2', 'G2')] }] as never });
    t.api().open(t.appButton);
    t.box('g1')!.focus();
    t.key('ArrowUp', { altKey: true });
    expect(t.said().at(-1)).toBe('G1: already at the edge');
    t.key('ArrowDown', { altKey: true });
    expect(fullOrder(t.g.kernel.columns)).toEqual(['a', 'g2', 'g1']);
  });
});

describe('▲ ▼ (WCAG 2.5.7)', () => {
  it('the same patch and sentence as the keys; the focus on the row\'s box', () => {
    const t = cmake({ columns: TWELVE() });
    t.api().open(t.appButton);
    t.click(t.act('c4', 'down')!);
    expect(t.said().at(-1)).toBe('C4: place 5 of 12');
    expect(t.focused()).toBe('c4');
    t.click(t.act('c4', 'up')!);
    expect(t.said().at(-1)).toBe('C4: place 4 of 12');
  });

  it('disabled at the segment\'s edges and for a locked column; a press on a disabled one does nothing', () => {
    const t = cmake({ columns: [ccol('ref', 'Ref', { pinned: 'start' }), ccol('name', 'Name'), ccol('date', 'Date'), ccol('lock', 'Lock', { movable: false })] });
    t.api().open(t.appButton);
    const dis = (id: string, a: string) => t.act(id, a)!.getAttribute('aria-disabled') === 'true';
    expect([dis('ref', 'up'), dis('ref', 'down'), dis('name', 'up'), dis('name', 'down'), dis('date', 'down'), dis('lock', 'up'), dis('lock', 'down')]).toEqual([true, true, true, false, true, true, true]);
    expect(t.act('lock', 'drag')!.getAttribute('aria-disabled')).toBe('true');
    const n = t.columnsChanged().length;
    t.click(t.act('name', 'up')!);
    expect(t.columnsChanged().length).toBe(n);
  });
});

describe('Tab (165)', () => {
  it('search → the list (one stop) → Show all → Reset → Close → search, and back', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.foot('close')!.focus();
    t.key('Tab');
    expect(t.focused()).toBe('search');
    t.key('Tab', { shiftKey: true });
    expect(t.focused()).toBe('close');
  });
});

describe('Tab is the chooser\'s own (every engine: WebKit skips buttons)', () => {
  it('from the search to the list\'s one stop, the three buttons, and round', () => {
    const t = cmake();
    t.api().open(t.appButton);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const e = t.key('Tab');
      expect(e.defaultPrevented).toBe(true);
      seen.push(t.focused());
    }
    expect(seen).toEqual(['ref', 'all', 'reset', 'close', 'search']);
    t.key('Tab', { shiftKey: true });
    expect(t.focused()).toBe('close');
  });

  it('a click focuses the box or button it pressed (WebKit focuses nothing on a click)', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.click(t.foot('all')!);
    expect(t.focused()).toBe('all');
    t.click(t.box('date')!);
    expect(t.focused()).toBe('date');
  });
});
