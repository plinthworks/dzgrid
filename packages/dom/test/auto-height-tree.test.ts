// Automatic row height in a tree (Phase 6 step 9 §5, auto-height.md 9, tree-sticky.md): a pinned parent copies its
// row's measured height, the stack never more than half the view. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { autoHeight } from '../src/auto-height.js';
import { tmake, cleanup, wide, k, type T } from './support-tree.js';
import { measureStub } from './support-auto-height.js';

afterEach(cleanup);

const COLS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160, wrap: true },
  { id: 'n', header: 'N', type: 'number', width: 100 },
];
/** Service 0 with a long name (150 characters: 9 lines at 160 px, 189.4 → 190 px), its 40 patients short. */
const rows = (): T[] => wide(2, 40).map((r) => (r.id === 'S0' ? { ...r, name: 'word '.repeat(30) } : r));
/** Service 0 with a name of 3 lines (40 characters: 69.4 → 70 px). */
const rows3 = (): T[] => wide(2, 40).map((r) => (r.id === 'S0' ? { ...r, name: 'word '.repeat(8) } : r));

describe('auto height in a tree', () => {
  it('the pinned parent is a copy of its row: as tall as it was measured', () => {
    measureStub();
    const t = tmake({ rows: rows3(), tree: { initial: 'all', sticky: 3 }, features: [autoHeight()], settings: { columns: COLS } });
    const L = () => t.ctx.layout!;
    const d = () => t.g.kernel.rows.displayed;
    expect(L().heightOf(d().indexOf(k('S0')) as never)).toBe(70);
    // Into its children: S0 pinned at the top, its copy 70 px.
    t.scroll(70 + 32 * 10 + 4);
    const copy = t.host.querySelector<HTMLElement>('.dzg-sticky > .dzg-row');
    expect(copy).not.toBeNull();
    expect(copy!.style.blockSize).toBe('70px');
    expect(t.ctx.inset).toBe(70);
    // A child focused under it is seen whole below the copy (WCAG 2.4.11): the room is the measured height.
    expect(t.ctx.insetFor!(d().indexOf(k('S0-20')))).toBe(70);
  });

  it('a parent taller than half the view is not pinned: the outermost copies go beyond half the view in pixels (Q9-5)', () => {
    measureStub();
    const t = tmake({ rows: rows(), tree: { initial: 'all', sticky: 3 }, features: [autoHeight()], settings: { columns: COLS } });
    const d = () => t.g.kernel.rows.displayed;
    expect(t.ctx.layout!.heightOf(d().indexOf(k('S0')) as never)).toBe(190);
    t.scroll(190 + 32 * 10 + 4);
    expect(t.host.querySelector('.dzg-sticky > .dzg-row')).toBeNull();
    expect(t.ctx.inset ?? 0).toBe(0);
    // A child focused under it needs no room for a copy that is not there.
    expect(t.ctx.insetFor!(d().indexOf(k('S0-20')))).toBe(0);
  });
});
