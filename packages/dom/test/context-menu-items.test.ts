// The cell menu's default items by the features present (docs/behaviors/context-menu.md 9–15; owner Q-CM3 A;
// context-menu-plan §8 11–18): absent when their feature is absent, disabled when they cannot act now; each does what
// its key does, with the key's sentence; sections in a fixed order, separators between (never first, last or doubled).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, k, CCOLS, type R } from './support-context-menu.js';
import { pinnedKey } from '@dzgrid/core';

afterEach(() => (cleanup(), vi.restoreAllMocks()));

const open = (t: ReturnType<typeof cmake>, id = 'r2', col = 'n') => t.rclick(t.cell(id, col)!);

describe('present by the features', () => {
  it('range only: Copy, Copy with headers; nothing else', () => {
    const t = cmake();
    open(t);
    expect(t.entries()).toEqual(['copy', 'copy.headers']);
    expect(t.item('copy')!.getAttribute('aria-keyshortcuts')).toBe('Control+C');
    expect(t.item('copy')!.textContent).toBe('CopyCtrl+C');
  });

  it('every feature: the sections in order, one separator between each', () => {
    const t = cmake({ with: ['edit', 'fill', 'pinned', 'csv'] });
    open(t);
    expect(t.entries()).toEqual(['copy', 'copy.headers', 'cut', 'paste', '|', 'fill.down', 'fill.end', '|', 'undo', 'redo', '|', 'pin.top', 'pin.bottom', '|', 'export.csv']);
  });

  it('a Mac: ⌘ hints and Meta shortcuts; redo ⇧⌘Z', () => {
    const t = cmake({ mac: true, with: ['edit'] });
    open(t);
    expect(t.item('copy')!.getAttribute('aria-keyshortcuts')).toBe('Meta+C');
    expect(t.item('copy')!.querySelector('.dzg-mkeys')!.textContent).toBe('⌘C');
    expect(t.item('redo')!.getAttribute('aria-keyshortcuts')).toBe('Shift+Meta+Z');
    expect(t.item('redo')!.querySelector('.dzg-mkeys')!.textContent).toBe('⇧⌘Z');
    expect(t.item('undo')!.getAttribute('aria-keyshortcuts')).toBe('Meta+Z');
  });

  it('range and edit: Cut and Paste; on a read-only cell both disabled, focusable and inert', () => {
    const t = cmake({ with: ['edit'] });
    open(t, 'r2', 'name');
    expect([t.off('cut'), t.off('paste')]).toEqual([true, true]);
    t.key('ArrowDown');
    t.key('ArrowDown');
    expect(t.focused()).toBe('cut');
    t.item('cut')!.click();
    expect(t.list()).not.toBeNull();
    expect(t.requests).toHaveLength(0);
    t.key('Escape');
    open(t, 'r2', 'n');
    expect([t.off('cut'), t.off('paste')]).toEqual([false, false]);
  });
});

describe('fill (context-menu.md 11)', () => {
  it('default: both, with the keys’ hints; « Fill down » fills as Ctrl+D', () => {
    const t = cmake({ with: ['fill'] });
    t.focusAt('r1', 'n');
    t.api().set({ anchor: { row: k('r1'), column: 'n' }, focus: { row: k('r3'), column: 'n' } });
    open(t, 'r2', 'n');
    expect(t.item('fill.down')!.getAttribute('aria-keyshortcuts')).toBe('Control+D');
    expect(t.item('fill.end')!.getAttribute('aria-keyshortcuts')).toBe('Control+R');
    t.item('fill.down')!.click();
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('fill');
  });

  it('along row: no « Fill down »; along column: no « Fill right »', () => {
    const r = cmake({ with: ['fill'], along: 'row' });
    open(r);
    expect(r.ids().filter((x) => x.startsWith('fill'))).toEqual(['fill.end']);
    cleanup();
    const c = cmake({ with: ['fill'], along: 'column' });
    open(c);
    expect(c.ids().filter((x) => x.startsWith('fill'))).toEqual(['fill.down']);
  });

  it('a single cell on the first row: « Fill down » disabled (nothing above), « Fill right » enabled (a cell before it)', () => {
    const t = cmake({ with: ['fill'] });
    open(t, 'r0', 'n');
    expect([t.off('fill.down'), t.off('fill.end')]).toEqual([true, false]);
  });
});

describe('the items of a cell outside the block (context-menu.md 6)', () => {
  // By the api (an app's own button: no native focus first; a right-click's press focuses the cell before).
  it('built after the focus moved: the old block is gone for the fill and for the app’s items', () => {
    const seen: unknown[] = [];
    const t = cmake({ with: ['fill'], menu: ({ range, fill }) => ({ use: { range, fill: fill! }, items: (c, d) => (seen.push([c.block, t.g.kernel.focus, range.api(t.g)!.get()]), d) }) });
    t.focusAt('r2', 'n');
    t.api().set({ anchor: { row: k('r2'), column: 'n' }, focus: { row: k('r5'), column: 'n' } });
    expect(t.menuApi().open({ row: k('r0'), column: 'n' })).toBe(true);
    expect(t.off('fill.down')).toBe(true);
    expect(seen.at(-1)).toEqual([null, { kind: 'cell', row: k('r0'), column: 'n' }, null]);
  });
});

describe('Cut and Paste by the cells they write (context-menu.md 9)', () => {
  // `n` editable on r3 only; s and q never.
  const grid = () => cmake({ with: ['edit'], columns: CCOLS({ n: { editable: (r: R) => r.id === 'r3' }, s: { editable: false }, q: { editable: false } }) });
  it('a block whose first row is read-only but holds an editable cell: Cut enabled, Paste (its first cell) disabled', () => {
    const t = grid();
    t.focusAt('r2', 'n');
    t.api().set({ anchor: { row: k('r2'), column: 'n' }, focus: { row: k('r4'), column: 's' } });
    open(t, 'r2', 's');
    expect([t.off('cut'), t.off('paste')]).toEqual([false, true]);
  });
  it('a block starting on the editable cell: both enabled; a block with no editable cell: both disabled', () => {
    const t = grid();
    t.focusAt('r3', 'n');
    t.api().set({ anchor: { row: k('r3'), column: 'n' }, focus: { row: k('r4'), column: 's' } });
    open(t, 'r4', 's');
    expect([t.off('cut'), t.off('paste')]).toEqual([false, false]);
    t.key('Escape');
    t.api().set({ anchor: { row: k('r4'), column: 'n' }, focus: { row: k('r5'), column: 'q' } });
    open(t, 'r5', 's');
    expect([t.off('cut'), t.off('paste')]).toEqual([true, true]);
  });
});

describe('canCopy refusing (context-menu.md 9)', () => {
  it('Copy stays enabled; acting writes nothing to the clipboard and says the range’s « Copying not allowed »', () => {
    const t = cmake({ canCopy: () => false });
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write, writeText: write } });
    open(t);
    expect(t.off('copy')).toBe(false);
    t.item('copy')!.click();
    expect(write).not.toHaveBeenCalled();
    expect(t.said().at(-1)).toBe('Copying not allowed');
    delete (navigator as { clipboard?: unknown }).clipboard;
  });
});

describe('undo (context-menu.md 12)', () => {
  it('disabled at first; after an edit, « Undo » undoes it as Ctrl+Z, said; then « Redo » enabled', async () => {
    const t = cmake({ with: ['edit'] });
    open(t);
    expect([t.off('undo'), t.off('redo')]).toEqual([true, true]);
    t.key('Escape');
    t.uses().edit!.api(t.g)!.commit([{ key: k('r2'), column: 'n', input: { value: 7 } }], { source: 'user' });
    open(t);
    expect(t.off('undo')).toBe(false);
    t.item('undo')!.click();
    expect(t.list()).toBeNull();
    expect(t.uses().edit!.api(t.g)!.canRedo).toBe(true);
    await Promise.resolve();
    expect(t.said().some((x) => /^Undone/.test(x))).toBe(true);
    open(t);
    expect(t.off('redo')).toBe(false);
  });
});

describe('tree (context-menu.md 13)', () => {
  it('a closed parent: « Expand », acting says « Service 1 expanded, 3 rows »; then « Collapse »; a leaf: neither', () => {
    const t = cmake({ with: ['tree'] });
    open(t, 'S', 'name');
    expect(t.ids()).toContain('expand');
    expect(t.ids()).not.toContain('collapse');
    t.item('expand')!.click();
    expect(t.said().at(-1)).toBe('Service 1 expanded, 3 rows');
    open(t, 'S', 'name');
    expect(t.ids()).toContain('collapse');
    t.key('Escape');
    open(t, 'cr1', 'name');
    expect(t.ids().filter((x) => x === 'expand' || x === 'collapse')).toEqual([]);
  });
});

it('a parent always open (fixedOpen): no Expand nor Collapse', () => {
  const t = cmake({ with: ['tree'], fixedOpen: (r) => r.id === 'S' });
  open(t, 'S', 'name');
  expect(t.ids().filter((x) => x === 'expand' || x === 'collapse')).toEqual([]);
});

describe('pinned rows (context-menu.md 14, Q-CM3 A)', () => {
  it('« Pin to the top » copies the row into the band (it stays in the body), says it, tells onPin; disabled when already there', () => {
    const told: { top: readonly R[]; bottom: readonly R[] }[] = [];
    const t = cmake({ with: ['pinned'], menu: ({ range, pinned }) => ({ use: { range, pinned: pinned! }, onPin: (x) => void told.push(x) }) });
    open(t, 'r4', 's');
    expect(t.ids()).toEqual(['copy', 'copy.headers', 'pin.top', 'pin.bottom']);
    t.item('pin.top')!.click();
    const api = t.uses().pinned!.api(t.g)!;
    expect(api.get().top.map((r) => r.id)).toEqual(['r4']);
    expect(t.g.kernel.rows.displayed.indexOf(k('r4'))).toBe(4);
    expect(t.said().at(-1)).toBe('Row pinned to the top');
    expect(told.map((x) => [x.top.map((r) => r.id), x.bottom.map((r) => r.id)])).toEqual([[['r4'], []]]);
    open(t, 'r4', 's');
    expect([t.off('pin.top'), t.off('pin.bottom')]).toEqual([true, false]);
    t.key('Escape');
    // On the band's row: « Unpin » only, which takes it out of the band.
    t.rclick(t.pcell('top', 'r4', 's')!);
    expect(t.ids()).toEqual(['copy', 'copy.headers', 'unpin']);
    t.item('unpin')!.click();
    expect(api.get().top).toEqual([]);
    expect(api.rows('top').indexOf(pinnedKey('top', 'r4')!)).toBe(-1);
    expect(t.said().at(-1)).toBe('Row unpinned');
    expect(told).toHaveLength(2);
  });
});

describe('export (context-menu.md 15)', () => {
  it('« Export to CSV » runs the displayed rows once', () => {
    const t = cmake({ with: ['csv'] });
    open(t);
    t.item('export.csv')!.click();
    expect(t.uses().csv!.run).toHaveBeenCalledTimes(1);
    expect(t.uses().csv!.run).toHaveBeenCalledWith('displayed');
  });
});

it('a column with `menu: false` keeps the cell menu (that flag is the column menu’s)', () => {
  const t = cmake({ columns: CCOLS({ n: { menu: false } }) });
  open(t);
  expect(t.ids()).toEqual(['copy', 'copy.headers']);
});
