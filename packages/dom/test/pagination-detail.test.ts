// The pagination footer over master/detail rows (step 8 review; master-detail.md, pagination-footer.md):
// a page holds its data rows, the details under its open masters are not counted in its range.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { detailShape } from '@dzgrid/core/detail';
import { pagination } from '../src/pagination.js';
import { definePart, type SlotContext } from '../src/part.js';
import { cleanup, pmake, ROWS } from './support-pagination.js';

afterEach(cleanup);

const detail = { id: 'detail', shape: () => detailShape() as never, setup: () => ({ destroy() {} }) };

function make(rows = ROWS) {
  let last: SlotContext['footer'] | null = null;
  const part = definePart('footer', { mount(_h, c) { last = c; return { update: (n) => void (last = n) }; } });
  const t = pmake({ rows, features: [detail as never, pagination()], settings: { parts: { 'footer.count': part } } });
  const open = (ids: string[]) => t.g.kernel.dispatch({ type: 'rows.expand', rows: ids.map((id) => dataKey(id)!), expanded: true }, 'user');
  return { t, open, ctx: () => last! };
}

describe('the footer over open details', () => {
  it('the range counts the page’s data rows, not the details under its open masters', () => {
    const { t, open, ctx } = make();
    open(['r0', 'r1', 'r2']);
    expect(t.g.kernel.rows.displayed.count).toBe(13);
    expect(ctx().range).toEqual({ from: 1, to: 10 });
    // aria-rowcount still counts every row shown, the details too (and the header row).
    expect(t.host.querySelector('[aria-rowcount]')!.getAttribute('aria-rowcount')).toBe('14');
  });

  it('"Select all" is still offered when the details would have made the page look as large as the rows matched', () => {
    const { t, open, ctx } = make(ROWS.slice(0, 12));
    open(['r0', 'r1', 'r2']);
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(ctx().selection).toMatchObject({ shown: 10, canSelectAll: true });
    expect(ctx().range).toEqual({ from: 1, to: 10 });
  });

  it('the header box on a page of an all-pages selection unticks the page’s data rows, never a detail key', () => {
    const { t, open } = make();
    open(['r0', 'r1']);
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    t.host.querySelector<HTMLElement>('.dzg-header [role=checkbox]')!.click();
    const keys = [...t.g.kernel.selection.keys];
    expect(keys.length).toBe(10);
    expect(keys.every((key) => key.startsWith('d:'))).toBe(true);
  });

  it('the default count says the data rows of the page', () => {
    const t = pmake({ features: [detail as never, pagination()] });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.countText()).toBe('1 to 10 of 30');
  });
});
