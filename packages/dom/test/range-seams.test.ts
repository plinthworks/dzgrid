// The base's seam for blocks of cells (Phase 5 step 11a, step11a-plan.md findings 4 and 7): `GridContext.multi`
// makes the viewport say aria-multiselectable whatever the row selection, and makes a Shift+click on a cell the
// feature's (the click events still go out; a box still ticks rows); the renderers spawned from the base one (a
// tree's pinned parents) are reachable. The layering: range-layering.test.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { cleanup, join as joinMsg, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);


describe('range seams: the base', () => {
  it('multi: the viewport says aria-multiselectable at every paint, the row selection none or single', () => {
    const t = rmake({ settings: { selection: { mode: 'single' } }, features: () => [] });
    expect(t.vp.hasAttribute('aria-multiselectable')).toBe(false);
    t.ctx.multi = true;
    t.g.api.refresh();
    expect(t.vp.getAttribute('aria-multiselectable')).toBe('true');
    delete t.ctx.multi;
    t.g.api.refresh();
    expect(t.vp.hasAttribute('aria-multiselectable')).toBe(false);
  });

  it('multi: a Shift+click on a cell selects no rows (selection.click), the click events still go out; on the box it still does', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', click: true, checkbox: true } }, features: () => [] });
    t.click(t.cell('r1')!);
    t.ctx.multi = true;
    t.click(t.cell('r4', 'n')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(1);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(2);
    expect(t.events.filter((e) => e.type === 'rowClicked')).toHaveLength(2);
    t.click(t.rowEl('r3')!.querySelector('.dzg-check')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(3);
    // Without the flag, today's behaviour: Shift+click ticks the rows between.
    delete t.ctx.multi;
    t.click(t.cell('r6', 'n')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBeGreaterThan(3);
  });

  it('spawned: the renderers made from the base one (a tree\'s pinned parents), in order', () => {
    const rows: R[] = [{ ...rowsOf(1)[0]!, id: 'S', parent: null }, ...rowsOf(40).map((r) => ({ ...r, parent: 'S' }))];
    const t = rmake({ rows, messages: joinMsg(EN, EN_TREE), features: () => [tree<R>({ parentId: (x) => x.parent ?? null })] });
    expect(t.ctx.rowRenderer.spawned).toHaveLength(1);
    expect(t.ctx.rowRenderer.spawned[0]!.mounted.size).toBe(0);
    const bare = rmake({ features: () => [] });
    expect(bare.ctx.rowRenderer.spawned).toEqual([]);
  });
});
