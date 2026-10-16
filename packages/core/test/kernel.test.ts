import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, headerSelection, localeCtx, makeQuery, nextSort, selectOnly,
  type GridEvent, type RowKey,
} from '@dzgrid/core';

type R = { id: string; n: number; t: string };
const rows = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
const k = (id: string) => dataKey(id)!;

function setup(n = 6) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }, { id: 'fixed', sortable: false, value: () => 1 }]);
  const model = clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { model, columns, kernel, events };
}

describe('nextSort', () => {
  it('cycles ascending, descending, none, and replaces other columns without multi', () => {
    let s = nextSort([], 'a', false);
    expect(s).toEqual([{ column: 'a', dir: 'asc' }]);
    s = nextSort(s, 'a', false);
    expect(s).toEqual([{ column: 'a', dir: 'desc' }]);
    expect(nextSort(s, 'a', false)).toEqual([]);
    expect(nextSort([{ column: 'a', dir: 'asc' }], 'b', false)).toEqual([{ column: 'b', dir: 'asc' }]);
  });

  it('with multi, appends a new column and cycles one in place', () => {
    const two = nextSort([{ column: 'a', dir: 'asc' }], 'b', true);
    expect(two).toEqual([{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'asc' }]);
    expect(nextSort(two, 'a', true)).toEqual([{ column: 'a', dir: 'desc' }, { column: 'b', dir: 'asc' }]);
    expect(nextSort([{ column: 'a', dir: 'desc' }, { column: 'b', dir: 'asc' }], 'a', true)).toEqual([{ column: 'b', dir: 'asc' }]);
  });

  it('keeps a column of a multi sort, alone, when clicked without multi', () => {
    expect(nextSort([{ column: 'a', dir: 'asc' }, { column: 'b', dir: 'asc' }], 'b', false)).toEqual([{ column: 'b', dir: 'desc' }]);
  });
});

describe('the kernel', () => {
  it('sorts on sort.toggle and says so, with the source given', () => {
    const { kernel, model, events } = setup();
    expect(kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user')).toEqual({ ok: true });
    kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(model.displayed.keyAt(model.displayed.index(0)!)).toBe(k('r5'));
    const sorts = events.filter((e) => e.type === 'sortChanged');
    expect(sorts.map((e) => e.type === 'sortChanged' && e.sort)).toEqual([[{ column: 'n', dir: 'asc' }], [{ column: 'n', dir: 'desc' }]]);
    expect(events.every((e) => e.source === 'user')).toBe(true);
    expect(events.some((e) => e.type === 'modelUpdated')).toBe(true);
  });

  it('refuses to sort a column that cannot sort, or does not exist, and changes nothing', () => {
    const { kernel, events } = setup();
    const r = kernel.dispatch({ type: 'sort.toggle', column: 'fixed', multi: false }, 'user');
    expect(r).toMatchObject({ ok: false, reason: 'not-sortable' });
    expect(kernel.dispatch({ type: 'sort.toggle', column: 'nope', multi: false }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
    expect(events).toEqual([]);
  });

  it('never emits user for a host dispatch', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 't', dir: 'asc' }] }, 'host');
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'host');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 'n' } }, 'host');
    expect(events.length).toBeGreaterThan(2);
    expect(events.every((e) => e.source === 'host')).toBe(true);
  });

  it('emits nothing for a sort equal to the current one', () => {
    const { kernel, events } = setup();
    kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    expect(events).toEqual([]);
  });

  describe('focus', () => {
    it('goes to the row now at its index when its row is removed, then to the previous one at the end', () => {
      const { kernel, model, events } = setup(4);
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 't' } }, 'user');
      events.length = 0;
      model.applyTransaction({ remove: ['r1'] });
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 't' });
      expect(events.find((e) => e.type === 'focusChanged')?.source).toBe('data');
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r3'), column: 't' } }, 'user');
      model.applyTransaction({ remove: ['r3'] });
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 't' });
    });

    it('goes to the header when no row is left, and to the first column when its column goes', () => {
      const { kernel, model } = setup(2);
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r0'), column: 't' } }, 'user');
      kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: true }] }, 'user');
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
      model.setRows([]);
      expect(kernel.focus).toEqual({ kind: 'header', column: 'n' });
    });

    it('goes to the row now at its place when its row is filtered out', () => {
      const { kernel } = setup(6);
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 'n' } }, 'user');
      kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }) }, 'user');
      // displayed now r1 r3 r5; r2 was at index 2 → r5
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r5'), column: 'n' });
    });

    it('keeps the focused row when it is still displayed after a sort', () => {
      const { kernel } = setup(6);
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 'n' } }, 'user');
      kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    });
  });

  describe('selection', () => {
    it('toggles and sets the anchor; a range runs from the anchor in the order on screen', () => {
      const { kernel } = setup(6);
      kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
      kernel.dispatch({ type: 'selection.toggle', row: k('r4') }, 'user');
      expect(kernel.anchor).toBe(k('r4'));
      kernel.dispatch({ type: 'selection.range', target: k('r2'), additive: false }, 'user');
      expect([...kernel.selection.keys].sort()).toEqual([k('r2'), k('r3'), k('r4')].sort());
      expect(kernel.anchor).toBe(k('r4'));
    });

    it('cancels a range whose anchor is filtered out', () => {
      const { kernel, events } = setup(6);
      kernel.dispatch({ type: 'selection.only', row: k('r2') }, 'user');
      kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }) }, 'user');
      events.length = 0;
      const r = kernel.dispatch({ type: 'selection.range', target: k('r5'), additive: false }, 'user');
      expect(r).toMatchObject({ ok: false, reason: 'anchor-not-displayed' });
      expect(events.filter((e) => e.type === 'selectionChanged')).toEqual([]);
    });

    it('selects only the displayed rows on allDisplayed (D8)', () => {
      const { kernel } = setup(6);
      kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }) }, 'user');
      kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
      expect(kernel.selection.mode).toBe('include');
      expect([...kernel.selection.keys].sort()).toEqual([k('r1'), k('r3'), k('r5')].sort());
    });

    it('drops removed rows and says so with source data', () => {
      const { kernel, model, events } = setup(6);
      kernel.dispatch({ type: 'selection.set', selection: selectOnly([k('r1'), k('r2')]) }, 'user');
      events.length = 0;
      model.applyTransaction({ remove: ['r2'] });
      expect([...kernel.selection.keys]).toEqual([k('r1')]);
      const e = events.find((x) => x.type === 'selectionChanged');
      expect(e).toMatchObject({ source: 'data', count: 1 });
      model.setRows(rows(6).filter((r) => r.id !== 'r1'));
      expect(kernel.selection.keys.size).toBe(0);
    });

    it('drops the anchor with its row', () => {
      const { kernel, model } = setup(4);
      kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
      model.applyTransaction({ remove: ['r1'] });
      expect(kernel.anchor).toBeNull();
    });

    it('reads the header box as none, some or all of the displayed rows', () => {
      const { kernel, model } = setup(4);
      expect(headerSelection(kernel.selection, model.displayed)).toBe('none');
      kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
      expect(headerSelection(kernel.selection, model.displayed)).toBe('some');
      kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
      expect(headerSelection(kernel.selection, model.displayed)).toBe('all');
      // all of the displayed rows, even when hidden rows are not selected
      kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'odd' } } }) }, 'user');
      kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
      expect(headerSelection(kernel.selection, model.displayed)).toBe('all');
      model.setRows([]);
      expect(headerSelection(kernel.selection, model.displayed)).toBe('none');
    });
  });

  it('resizes a column and reports whether the drag is finished', () => {
    const { kernel, columns, events } = setup();
    kernel.dispatch({ type: 'column.resize', column: 'n', width: 222, finished: false }, 'user');
    kernel.dispatch({ type: 'column.resize', column: 'n', width: 240, finished: true }, 'user');
    expect(columns.state().find((s) => s.id === 'n')?.width).toBe(240);
    expect(events.filter((e) => e.type === 'columnResized').map((e) => e.type === 'columnResized' && [e.width, e.finished])).toEqual([[222, false], [240, true]]);
    expect(kernel.dispatch({ type: 'column.resize', column: 'nope', width: 1, finished: true }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
  });

  it('stops listening to the model on destroy', () => {
    const { kernel, model, events } = setup(4);
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    kernel.destroy();
    events.length = 0;
    model.applyTransaction({ remove: ['r1'] });
    expect(events).toEqual([]);
    expect(kernel.dispatch({ type: 'selection.clear' }, 'user')).toMatchObject({ ok: false, reason: 'destroyed' });
  });

  it('refuses a focus on a row or column that is not displayed', () => {
    const { kernel } = setup(4);
    const bad = 'd:nope' as RowKey;
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: bad, column: 'n' } }, 'user')).toMatchObject({ ok: false, reason: 'row-not-displayed' });
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'zzz' } }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
  });
});
