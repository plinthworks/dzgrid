// The combined review of Phase 6 steps 5–6: the surviving mutants of `@dzgrid/core/state` pinned (grid-state.md 4, 10–13;
// step05-plan §4). Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { captureState, restoreState } from '@dzgrid/core/state';

type Row = { id: string };
const DEFS: ColumnDef<Row>[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const make = (page = false) => {
  const columns = createColumnModel<Row>(DEFS);
  return createKernel<Row>({ rows: clientRows<Row>({ rows: [{ id: 'r1' }, { id: 'r2' }], getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'fr-FR' }), ...(page && { page: { pageSize: 1 } }) }), columns });
};
const ids = (k: ReturnType<typeof make>) => k.columns.visible().map((c) => c.id);
const paths = (p: { code: string; path: string }[]) => p.filter((x) => x.code === 'state-field').map((x) => x.path);

describe('restoreState: what is refused', () => {
  it('a sort with dir « up »: state-field at sort.0, the sort not applied', () => {
    const k = make();
    const p = restoreState(k, { v: 1, sort: [{ column: 'a', dir: 'up' }] });
    expect(paths(p)).toEqual(['sort.0']);
    expect(k.query.sort).toEqual([]);
  });

  it('widths 0 and −5: state-field at columns.N.width, the widths kept', () => {
    const k = make();
    const p = restoreState(k, { v: 1, columns: [{ id: 'a', order: 0, pinned: null, width: 0 }, { id: 'b', order: 1, pinned: null, width: -5 }] });
    expect(paths(p)).toEqual(['columns.0.width', 'columns.1.width']);
    expect(k.columns.state().filter((s) => s.width !== undefined)).toEqual([]);
  });

  it('entries without `order` keep the state\'s list order', () => {
    const k = make();
    restoreState(k, { v: 1, columns: [{ id: 'c', pinned: null }, { id: 'a', pinned: null }, { id: 'b', pinned: null }] });
    expect(ids(k)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('captureState', () => {
  it('mixed explicit and absent `order` values: the full order as the model shows it (an explicit order first on a tie)', () => {
    const k = make();
    k.dispatch({ type: 'column.state', patch: [{ id: 'd', order: 0 }] }, 'api');
    expect(ids(k)).toEqual(['d', 'a', 'b', 'c']);
    expect(captureState(k).columns.map((c) => [c.id, c.order])).toEqual([['d', 0], ['a', 1], ['b', 2], ['c', 3]]);
  });

  it('exclude: [\'page\'] drops pageSize too', () => {
    const k = make(true);
    const all = captureState(k);
    expect([all.page, all.pageSize]).toEqual([0, 1]);
    const s = captureState(k, {}, { exclude: ['page'] }) as unknown as Record<string, unknown>;
    expect('page' in s || 'pageSize' in s).toBe(false);
    expect(s['columns']).toBeDefined();
  });

  it('exclude, directly: the parts named are absent, the others written', () => {
    const k = make();
    const s = captureState(k, {}, { exclude: ['sort', 'filter', 'quick'] }) as unknown as Record<string, unknown>;
    expect(Object.keys(s).sort()).toEqual(['columns', 'v']);
  });
});

describe('groups restored replace the grid’s (Phase 6 step 7)', () => {
  it('a state with `groups: {}` brings the definitions back: the adapter is set once, with nothing', async () => {
    const { createColumnModel, createKernel, clientRows, localeCtx } = await import('@dzgrid/core');
    const { restoreState } = await import('@dzgrid/core/state');
    const m = createColumnModel<{ id: string }>([{ id: 'a' }]);
    const k = createKernel({ rows: clientRows({ rows: [], getRowId: (r: { id: string }) => r.id, columns: m, ctx: localeCtx({ locale: 'fr-FR' }) }), columns: m });
    const sets: unknown[] = [];
    const problems = restoreState(k, { v: 1, groups: {} }, { groups: { collapsible: () => true, get: () => ({}), set: (o) => void sets.push(o) } });
    expect(problems).toEqual([]);
    expect(sets).toEqual([{}]);
  });
});
