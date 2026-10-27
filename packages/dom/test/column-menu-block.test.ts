// The block survives the menu (Phase 6 step 3, owner S12-Q12 and Q3-1; step03-plan §3): « Fill down » / « Fill right »
// in the ⋮ menu are the fill's ≥ 24 px pointer way (WCAG 2.5.8). Opening the menu with a pointer (the ⋮ press, a
// right-click, a Mac's Ctrl+click) does not move the grid's focus, so a block of cells survives; the item acts once on
// it as the key would (source `user`, the key's sentence), the block kept, the focus back on the block's cell. Escape
// keeps the block. Opened by the keys from a header (the block then gone with the focus): the fill items disabled.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, mmake, R_ } from './support-column-menu.js';
import { flush } from './support-clip.js';

afterEach(cleanup);

const blockOf = (t: ReturnType<typeof mmake>) => {
  const r = (t.feature.api(t.g) as { get(): { anchor: { row: string; column: string }; focus: { row: string; column: string } } | null }).get();
  const id = (k: string) => String(k).replace(/^d:\d+:/, '');
  return r && `${id(r.anchor.row)}/${r.anchor.column}:${id(r.focus.row)}/${r.focus.column}`;
};

const grid = () => mmake({ with: ['fill'], menu: ({ range, fill }) => ({ use: { range, fill: fill! } }) });

describe('a block, then the menu by a pointer (S12-Q12, Q3-1)', () => {
  for (const how of ['button', 'right-click'] as const) {
    it(`${how}: the block kept, « Fill down » enabled; it fills once as Ctrl+D (user, said), the block kept, the focus back on its cell`, async () => {
      const t = grid();
      t.g.api.focusCell(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!), 'n');
      t.cell('r1', 'n')!.focus();
      t.feature.api(t.g)!.set(R_(['r1', 'n'], ['r3', 's']));
      expect(blockOf(t)).toBe('r1/n:r3/s');
      if (how === 'button') t.open('q');
      else t.rclick('q');
      expect(blockOf(t)).toBe('r1/n:r3/s');
      expect(t.off('fill.down')).toBe(false);
      expect(t.item('fill.down')!.getAttribute('aria-keyshortcuts')).toBe('Control+D');
      expect(t.item('fill.end')!.getAttribute('aria-keyshortcuts')).toBe('Control+R');
      t.item('fill.down')!.click();
      expect(t.requests).toHaveLength(1);
      expect(t.requests[0]!.origin).toBe('fill');
      // The first row copied into the others: n 1, s "s1" (rows r2, r3).
      expect(t.requests[0]!.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}/${c.column}=${JSON.stringify(c.value)}`)).toEqual(['r2/n=1', 'r2/s="s1"', 'r3/n=1', 'r3/s="s1"']);
      expect((t.of('cellEdited') as { source: string }[]).map((e) => e.source)).toEqual(['user', 'user', 'user', 'user']);
      expect(blockOf(t)).toBe('r1/n:r3/s');
      expect(t.list()).toBeNull();
      expect(document.activeElement).toBe(t.cell('r1', 'n'));
      await flush();
      expect(t.said().at(-1)).toMatch(/^Cells filled: 4/);
    });
  }

  it('Escape in the menu keeps the block', () => {
    const t = grid();
    t.g.api.focusCell(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!), 'n');
    t.feature.api(t.g)!.set(R_(['r1', 'n'], ['r3', 's']));
    t.open('s');
    t.key('Escape');
    expect(t.list()).toBeNull();
    expect(blockOf(t)).toBe('r1/n:r3/s');
  });

  it('a Mac: the items show ⌘D / ⌘R and declare Meta', () => {
    const t = mmake({ mac: true, with: ['fill'], menu: ({ range, fill }) => ({ use: { range, fill: fill! } }) });
    t.open('n');
    expect(t.item('fill.down')!.getAttribute('aria-keyshortcuts')).toBe('Meta+D');
    expect(t.item('fill.down')!.querySelector('[aria-hidden=true]')!.textContent).toBe('⌘D');
    expect(t.item('fill.end')!.querySelector('[aria-hidden=true]')!.textContent).toBe('⌘R');
  });
});

describe('by the keys from a header (S12-Q12)', () => {
  it('the block went with the focus: the fill items disabled, inert', () => {
    const t = grid();
    t.focusHeader('n');
    t.key('F10', { shiftKey: true });
    expect([t.off('fill.down'), t.off('fill.end')]).toEqual([true, true]);
    t.item('fill.down')!.click();
    expect(t.requests).toHaveLength(0);
  });

  it('without the fill or the block feature: no fill items', () => {
    const t = mmake({ with: ['range'] });
    t.open('n');
    expect(t.item('fill.down')).toBeNull();
  });
});

describe('a pinned cell focused (step 8b-2, pinned-rows.md 17)', () => {
  it('« Fill down » enabled on a focused pinned cell; it copies the band\'s row above, never the body\'s', async () => {
    const { pinnedRows } = await import('../src/pinned-rows.js');
    const { EN_PINNED } = await import('../src/locales/en-pinned.js');
    const { pinnedKey } = await import('@dzgrid/core');
    const { MMSG } = await import('./support-column-menu.js');
    const { join } = await import('./support-range.js');
    const row = (id: string, n: number) => ({ id, name: id, n, s: 's', q: 0 });
    const t = mmake({ with: ['fill'], messages: join(MMSG.en, EN_PINNED), more: [pinnedRows({ top: [row('a', 4), row('b', 9)] })], menu: ({ range, fill }) => ({ use: { range, fill: fill! } }) });
    const b = pinnedKey('top', 'b')!;
    t.g.api.focusCell(b, 'n');
    t.open('q');
    expect(t.off('fill.down')).toBe(false);
    t.item('fill.down')!.click();
    expect(t.requests.flatMap((r) => r.changes.map((c) => [c.key, c.column, c.value]))).toEqual([[b, 'n', 4]]);
  });
});
