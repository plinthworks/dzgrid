// Step 17, owner decision Q1 (closing Q2 of step 7): on browser pages, select-all over an include
// selection adds the page's rows (a union); other pages keep theirs. Server pages and an
// all-pages (everything-except) selection keep their rules (docs/behaviors/selection.md).
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type GridEvent, type PageOptions } from '@dzgrid/core';

type R = { id: string; n: number };
const k = (id: string) => dataKey(id)!;
const ids = (keys: Iterable<unknown>) => [...keys].map((x) => String(x)).sort();

function grid(n = 12, page: PageOptions | null = { pageSize: 5 }) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }]);
  const rows = clientRows<R>({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), ...(page && { page }) });
  const kernel = createKernel<R>({ rows, columns });
  const told: Extract<GridEvent<R>, { type: 'selectionChanged' }>[] = [];
  kernel.subscribe((e) => { if (e.type === 'selectionChanged') told.push(e); });
  return { kernel, rows, told };
}

describe('select-all on browser pages is a union with the selection', () => {
  it('selection.all on page 2 keeps the rows ticked on page 1 and adds page 2', () => {
    const { kernel, told } = grid();
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.mode).toBe('include');
    expect(ids(kernel.selection.keys)).toEqual(ids(['r1', 'r5', 'r6', 'r7', 'r8', 'r9'].map(k)));
    expect(told.at(-1)!.count).toBe(6);
    expect(kernel.headerState).toBe('all');
  });

  it('selection.allDisplayed is the same union while paged', () => {
    const { kernel } = grid();
    kernel.dispatch({ type: 'selection.toggle', row: k('r11') }, 'user');
    kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect(ids(kernel.selection.keys)).toEqual(ids(['r0', 'r1', 'r2', 'r3', 'r4', 'r11'].map(k)));
  });

  it('a page already ticked changes nothing and says nothing', () => {
    const { kernel, told } = grid();
    kernel.dispatch({ type: 'selection.all' }, 'user');
    const n = told.length;
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(told.length).toBe(n);
  });

  it('unpaged, select-all is still the displayed rows (an include set of them, nothing kept)', () => {
    const { kernel } = grid(6, null);
    kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 3 } }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(ids(kernel.selection.keys)).toEqual(ids(['r0', 'r1', 'r2'].map(k)));
  });

  it('over an all-pages selection, selection.all still ticks every unticked row again (stays everything-except)', () => {
    const { kernel } = grid();
    kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.mode).toBe('exclude');
    expect(kernel.selection.keys.size).toBe(0);
  });
});
