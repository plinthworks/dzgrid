// One sort only (docs/behaviors/sort.md « One sort only », step 16a): the kernel's rule.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, makeQuery, type GridEvent } from '@dzgrid/core';

type R = { id: string; a: number; b: string };
function setup(multiSort?: boolean) {
  const columns = createColumnModel<R>([{ id: 'a', type: 'number' }, { id: 'b' }]);
  const rows = clientRows<R>({ rows: [{ id: '1', a: 2, b: 'x' }, { id: '2', a: 1, b: 'y' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  const kernel = createKernel<R>({ rows, columns, ...(multiSort !== undefined && { multiSort }) });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { kernel, events };
}

describe('multiSort: false', () => {
  it('turns a multi toggle into a plain one: the column becomes the only sort, asc → desc → none', () => {
    const { kernel } = setup(false);
    kernel.dispatch({ type: 'sort.toggle', column: 'a', multi: false }, 'user');
    kernel.dispatch({ type: 'sort.toggle', column: 'b', multi: true }, 'user');
    expect(kernel.query.sort).toEqual([{ column: 'b', dir: 'asc' }]);
    kernel.dispatch({ type: 'sort.toggle', column: 'b', multi: true }, 'user');
    expect(kernel.query.sort).toEqual([{ column: 'b', dir: 'desc' }]);
    kernel.dispatch({ type: 'sort.toggle', column: 'b', multi: true }, 'user');
    expect(kernel.query.sort).toEqual([]);
  });

  it("keeps the application's own commands: sort.set and query.set of two items", () => {
    const { kernel } = setup(false);
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'desc' }] }, 'host');
    expect(kernel.query.sort).toEqual([{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'desc' }]);
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'b', dir: 'asc' }, { column: 'a', dir: 'asc' }] }) }, 'host');
    expect(kernel.query.sort).toEqual([{ column: 'b', dir: 'asc' }, { column: 'a', dir: 'asc' }]);
    // A user's multi toggle then leaves only its column.
    kernel.dispatch({ type: 'sort.toggle', column: 'a', multi: true }, 'user');
    expect(kernel.query.sort).toEqual([{ column: 'a', dir: 'desc' }]);
  });

  it('by default (and with true) a multi toggle still adds the column', () => {
    for (const m of [undefined, true]) {
      const { kernel } = setup(m);
      kernel.dispatch({ type: 'sort.toggle', column: 'a', multi: false }, 'user');
      kernel.dispatch({ type: 'sort.toggle', column: 'b', multi: true }, 'user');
      expect(kernel.query.sort).toEqual([{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'asc' }]);
    }
  });
});
