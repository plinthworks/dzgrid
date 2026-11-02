// The cell menu and the block (docs/behaviors/context-menu.md 6, 8; owner's rule; context-menu-plan §8 7–10): a
// right-click inside the block keeps the block and the focus, the menu acts on all of it; outside it, the cell is
// focused first (the block dropped) and the menu acts on that cell alone. The box is logical: RTL gives the same.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, fakeClipboard, R_, type R } from './support-context-menu.js';
import type { CellMenuContext } from '../src/context-menu.js';

let clip: ReturnType<typeof fakeClipboard> | null = null;
afterEach(() => (clip?.restore(), (clip = null), cleanup(), vi.restoreAllMocks()));

/** A grid whose app item records its context, with a block B2:D4 (rows r2–r4, columns n–q) focused on r2/n. */
const blockGrid = (lang: 'en' | 'ar' = 'en') => {
  const seen: CellMenuContext<R>[] = [];
  const t = cmake({ lang, menu: ({ range }) => ({ use: { range }, items: (c, d) => (seen.push(c), d) }) });
  t.focusAt('r2', 'n');
  t.api().set(R_(['r2', 'n'], ['r4', 'q']));
  return { t, seen };
};

/** The range's sentence after a copy of `n` cells, by hand from its bundles. */
const copied = (lang: 'en' | 'ar', n: number) => (lang === 'ar' ? `النسخ: ${n}` : `Cells copied: ${n}`);

for (const lang of ['en', 'ar'] as const) {
  describe(`${lang === 'ar' ? 'RTL' : 'LTR'}: a right-click and the block`, () => {
    it('inside the block (r3/s): block and focus unchanged, ctx.block is the block, « Copy » copies 3 × 3', () => {
      const { t, seen } = blockGrid(lang);
      clip = fakeClipboard({ write: 'ok' });
      const { m } = t.rclick(t.cell('r3', 's')!);
      expect(m.defaultPrevented).toBe(true);
      expect(t.block()).toBe('r2/n:r4/q');
      expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', column: 'n' });
      expect(seen.at(-1)!.block).toEqual(R_(['r2', 'n'], ['r4', 'q']));
      expect(seen.at(-1)!.column.id).toBe('s');
      expect(seen.at(-1)!.row.id).toBe('r3');
      t.item('copy')!.click();
      const data = (clip.calls[0]!.data as { data: Record<string, Blob> }[])[0]!.data;
      expect(Object.keys(data).sort()).toEqual(['text/html', 'text/plain']);
      expect(t.said().at(-1)).toBe(copied(lang, 9));
      expect(t.block()).toBe('r2/n:r4/q');
      expect(document.activeElement).toBe(t.cell('r2', 'n'));
    });

    it('outside the block (r7/q): the focus on r7/q, the block dropped, ctx.block null, « Copy » copies that cell alone', () => {
      const { t, seen } = blockGrid(lang);
      clip = fakeClipboard({ write: 'ok' });
      t.rclick(t.cell('r7', 'q')!);
      expect(t.block()).toBeNull();
      expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: R_(['r7', 'q'], ['r7', 'q']).anchor.row, column: 'q' });
      expect(seen.at(-1)!.block).toBeNull();
      expect(seen.at(-1)!.row.id).toBe('r7');
      t.item('copy')!.click();
      expect(t.said().at(-1)).toBe(copied(lang, 1));
      expect(document.activeElement).toBe(t.cell('r7', 'q'));
    });
  });
}

it('by the keys: the focused cell, inside the block when there is one: the menu acts on the block', () => {
  const { t, seen } = blockGrid();
  t.cell('r2', 'n')!.focus();
  t.key('F10', { shiftKey: true });
  expect(seen.at(-1)!.block).toEqual(R_(['r2', 'n'], ['r4', 'q']));
  expect(t.block()).toBe('r2/n:r4/q');
});

it('a pinned band’s cell is outside the body’s block', () => {
  const seen: CellMenuContext<R>[] = [];
  const t = cmake({ with: ['pinned'], top: [{ id: 'T1', name: 'Top', n: 1, s: 'x', q: 2 }], menu: ({ range, pinned }) => ({ use: { range, pinned: pinned! }, items: (c, d) => (seen.push(c), d) }) });
  t.focusAt('r2', 'n');
  t.api().set(R_(['r2', 'n'], ['r4', 'q']));
  t.rclick(t.pcell('top', 'T1', 's')!);
  expect(t.block()).toBeNull();
  expect(seen.at(-1)!.block).toBeNull();
  expect(seen.at(-1)!.band).toBe('top');
  expect(seen.at(-1)!.row.id).toBe('T1');
});

it('the context: row, key, column, value as read (an edit applied), band, kernel, grid, say', () => {
  const seen: CellMenuContext<R>[] = [];
  const t = cmake({ with: ['edit'], menu: ({ range, edit }) => ({ use: { range, edit: edit! }, items: (c, d) => (seen.push(c), d) }) });
  t.uses().edit!.api(t.g)!.commit([{ key: t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(5)!), column: 'n', input: { value: 42 } }]);
  t.rclick(t.cell('r5', 'n')!);
  const c = seen.at(-1)!;
  expect([c.row.id, c.column.id, c.value, c.band, c.block]).toEqual(['r5', 'n', 42, null, null]);
  expect(c.kernel).toBe(t.g.kernel);
  expect(c.grid.kernel).toBe(t.g.kernel);
  c.say('hello');
  expect(t.said().at(-1)).toBe('hello');
});

it('a cell in the block’s rows but past its columns is outside (the box is rows and columns)', () => {
  const seen: CellMenuContext<R>[] = [];
  const t = cmake({ lang: 'ar', menu: ({ range }) => ({ use: { range }, items: (c, d) => (seen.push(c), d) }) });
  t.focusAt('r2', 'n');
  t.api().set(R_(['r2', 'n'], ['r4', 's']));
  t.rclick(t.cell('r3', 'q')!);
  expect(seen.at(-1)!.block).toBeNull();
  expect(t.block()).toBeNull();
});
