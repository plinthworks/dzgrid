import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, headerSelection, intentFor, localeCtx, makeQuery, selectOnly,
  type DisplayedRows, type GridEvent, type RowKey,
} from '@dzgrid/core';

type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;
const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }));
const odd = makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'odd' } } });
function setup(n = 6) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }, { id: 'fixed', sortable: false, value: () => 1 }]);
  const model = clientRows<R>({ rows: rowsOf(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  return { model, columns, kernel: createKernel<R>({ rows: model, columns }) };
}

describe('phase 2 kernel review', () => {
  it('delivers events in order to every listener when one dispatches while being told', () => {
    const { kernel } = setup();
    kernel.subscribe((e) => {
      if (e.type === 'selectionChanged' && e.selection.keys.size) kernel.dispatch({ type: 'selection.clear' }, 'user');
    });
    const seen: number[] = [];
    kernel.subscribe((e) => { if (e.type === 'selectionChanged') seen.push(e.selection.keys.size); });
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(seen).toEqual([1, 0]);
  });

  it('does not call a listener removed during an emit', () => {
    const { kernel } = setup();
    let off: () => void = () => {};
    let calls = 0;
    kernel.subscribe(() => off());
    off = kernel.subscribe(() => { calls++; });
    kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    expect(calls).toBe(0);
  });

  it('has reconciled selection and focus when modelUpdated is heard, and tells them after', () => {
    const { kernel, model } = setup(4);
    kernel.dispatch({ type: 'selection.set', selection: selectOnly([k('r1'), k('r2')]) }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 'n' } }, 'user');
    const order: string[] = [];
    let focusAtUpdate: unknown;
    let selectedAtUpdate = -1;
    kernel.subscribe((e) => {
      order.push(e.type);
      if (e.type === 'modelUpdated') { focusAtUpdate = kernel.focus; selectedAtUpdate = kernel.selection.keys.size; }
    });
    model.applyTransaction({ remove: ['r1'] });
    expect(order).toEqual(['modelUpdated', 'selectionChanged', 'focusChanged']);
    expect(focusAtUpdate).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    expect(selectedAtUpdate).toBe(1);
  });

  it('keeps the anchor when the host echoes a selection without its row', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'selection.toggle', row: k('r5') }, 'user');
    kernel.dispatch({ type: 'selection.toggle', row: k('r5') }, 'user'); // unticked, still the anchor
    kernel.dispatch({ type: 'selection.set', selection: kernel.selection }, 'host');
    kernel.dispatch({ type: 'selection.set', selection: selectOnly([]) }, 'host');
    expect(kernel.anchor).toBe(k('r5'));
    expect(kernel.dispatch({ type: 'selection.range', target: k('r3'), additive: false }, 'user')).toEqual({ ok: true });
  });

  it('emits nothing for a selection equal to the current one', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'selection.set', selection: selectOnly([k('r1')]) }, 'user');
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    kernel.dispatch({ type: 'selection.set', selection: selectOnly([k('r1')]) }, 'host');
    expect(events).toEqual([]);
  });

  it('refuses to select or anchor a row that does not exist', () => {
    const { kernel } = setup();
    const ghost = 'd:4:nope' as RowKey;
    expect(kernel.dispatch({ type: 'selection.toggle', row: ghost }, 'user')).toMatchObject({ ok: false, reason: 'unknown-row' });
    expect(kernel.dispatch({ type: 'selection.only', row: ghost }, 'user')).toMatchObject({ ok: false, reason: 'unknown-row' });
    expect(kernel.selection.keys.size).toBe(0);
    expect(kernel.anchor).toBeNull();
  });

  it('does not report a sort change for a query whose sort is the same written another way', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    const events: GridEvent<R>[] = [];
    kernel.subscribe((e) => events.push(e));
    const sort = [JSON.parse('{"dir":"asc","column":"n"}')];
    kernel.dispatch({ type: 'query.set', query: makeQuery({ sort, filter: { n: { type: 'number', op: 'gt', value: 1 } } }) }, 'user');
    expect(events.filter((e) => e.type === 'sortChanged')).toEqual([]);
  });

  it('reads the header box of all displayed rows without walking them', () => {
    const { kernel, model } = setup(1000);
    kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    let walked = 0;
    const d = model.displayed;
    const counting: DisplayedRows<R> = { ...d, version: d.version, count: d.count, nodeAt: d.nodeAt, keyAt: (i) => { walked++; return d.keyAt(i); }, indexOf: d.indexOf, index: d.index, nextData: d.nextData };
    expect(headerSelection(kernel.selection, counting)).toBe('all');
    expect(walked).toBe(0);
  });

  it('selects all with Ctrl+A on a layout where A is another letter', () => {
    expect(intentFor({ key: 'ش', code: 'KeyA', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, { dir: 'rtl', owner: 'cell', mac: false })).toEqual({ kind: 'selectAll' });
    expect(intentFor({ key: 'ش', code: 'KeyA', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: 'rtl', owner: 'cell', mac: false })).toBeNull();
  });

  describe('test analysis', () => {
    const log = (kernel: ReturnType<typeof setup>['kernel']) => {
      const events: string[] = [];
      kernel.subscribe((e) => events.push(`${e.type}:${e.source}${e.type === 'modelUpdated' ? ':' + e.kind : ''}`));
      return events;
    };

    it('keeps the selection and the anchor of rows a filter hides', () => {
      const { kernel } = setup();
      kernel.dispatch({ type: 'selection.only', row: k('r2') }, 'user');
      const events = log(kernel);
      kernel.dispatch({ type: 'query.set', query: odd }, 'user');
      expect([...kernel.selection.keys]).toEqual([k('r2')]);
      expect(kernel.anchor).toBe(k('r2'));
      expect(events).toEqual(['modelUpdated:user:query']);
    });

    it('is deaf to the model once destroyed', () => {
      const { kernel, model } = setup();
      kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
      kernel.destroy();
      model.applyTransaction({ remove: ['r1'] });
      expect([...kernel.selection.keys]).toEqual([k('r1')]);
      expect(kernel.anchor).toBe(k('r1'));
    });

    it('keeps the filter and the search when the sort changes', () => {
      const { kernel, model } = setup();
      kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: odd.filter, quick: '3' }) }, 'user');
      kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
      expect(model.query.filter).toEqual(odd.filter);
      expect(model.query.quick).toBe('3');
      expect(model.counts.filtered).toBe(1);
    });

    it('refuses a width that is not a positive finite number', () => {
      const { kernel } = setup();
      for (const width of [-5, Number.NaN, Number.POSITIVE_INFINITY, 0]) {
        const events = log(kernel);
        expect(kernel.dispatch({ type: 'column.resize', column: 'n', width, finished: true }, 'user')).toMatchObject({ ok: false, reason: 'invalid-width' });
        expect(events).toEqual([]);
      }
    });

    it('emits the exact sequence for each command, with its source', () => {
      const { kernel } = setup(4);
      let events = log(kernel);
      kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'host');
      expect(events).toEqual(['modelUpdated:host:query', 'sortChanged:host']);
      events = log(kernel); kernel.destroy;
      const { kernel: k2 } = setup(4);
      k2.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r0'), column: 't' } }, 'user');
      events = log(k2);
      k2.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: true }] }, 'user');
      expect(events).toEqual(['modelUpdated:user:context', 'focusChanged:data']);
      expect(k2.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
    });

    it('reconciles a set selection: unknown keys dropped, exclude counted, anchor kept only with its row', () => {
      const { kernel } = setup(6);
      let count: number | null = -1;
      kernel.subscribe((e) => { if (e.type === 'selectionChanged') count = e.count; });
      kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r1'), 'd:5:ghost' as RowKey]) } }, 'user');
      expect([...kernel.selection.keys]).toEqual([k('r1')]);
      expect(count).toBe(5);
    });

    it('adds a range through the kernel, in include and exclude modes; refuses a target not displayed', () => {
      const { kernel } = setup(6);
      kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
      kernel.dispatch({ type: 'selection.toggle', row: k('r4') }, 'user');
      kernel.dispatch({ type: 'selection.range', target: k('r5'), additive: true }, 'user');
      expect([...kernel.selection.keys].sort()).toEqual([k('r0'), k('r4'), k('r5')].sort());
      kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r2'), k('r3')]) } }, 'user');
      kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
      kernel.dispatch({ type: 'selection.range', target: k('r3'), additive: true }, 'user');
      expect(kernel.selection).toMatchObject({ mode: 'exclude' });
      expect(kernel.selection.keys.size).toBe(0);
      kernel.dispatch({ type: 'query.set', query: odd }, 'user');
      kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
      const events = log(kernel);
      expect(kernel.dispatch({ type: 'selection.range', target: k('r2'), additive: false }, 'user')).toMatchObject({ ok: false, reason: 'target-not-displayed' });
      expect(events).toEqual([]);
    });

    it('lets a refresh with the same ids, and a transaction that changes nothing, keep everything quietly', () => {
      const { kernel, model } = setup(6);
      kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 'n' } }, 'user');
      const events = log(kernel);
      model.setRows(rowsOf(6), 'host');
      model.applyTransaction({ remove: ['zzz'] });
      expect(events.filter((e) => !e.startsWith('modelUpdated'))).toEqual([]);
      expect(kernel.anchor).toBe(k('r1'));
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
    });

    it('moves focus when an update filters its row out', () => {
      const { kernel, model } = setup(6);
      kernel.dispatch({ type: 'query.set', query: odd }, 'user');
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r3'), column: 'n' } }, 'user');
      model.applyTransaction({ update: [{ id: 'r3', n: 3, t: 'even' }] });
      expect(kernel.focus).toEqual({ kind: 'cell', row: k('r5'), column: 'n' });
    });

    it('moves a header focus off a hidden column, drops it with the last column, and dedups focus.set', () => {
      const { kernel } = setup(2);
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 't' } }, 'user');
      kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: true }] }, 'user');
      expect(kernel.focus).toEqual({ kind: 'header', column: 'n' });
      expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 't' } }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
      kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }, { id: 'fixed', hidden: true }] }, 'user');
      expect(kernel.focus).toBeNull();
      const { kernel: k2 } = setup(2);
      const events = log(k2);
      for (const f of [{ kind: 'cell', row: k('r0'), column: 'n' }, { kind: 'cell', row: k('r0'), column: 'n' }, null, null] as const) k2.dispatch({ type: 'focus.set', focus: f }, 'user');
      expect(events).toEqual(['focusChanged:user', 'focusChanged:user']);
    });

    it('checks sort.set like sort.toggle', () => {
      const { kernel } = setup();
      const events = log(kernel);
      expect(kernel.dispatch({ type: 'sort.set', sort: [{ column: 'fixed', dir: 'asc' }] }, 'user')).toMatchObject({ ok: false, reason: 'not-sortable' });
      expect(kernel.dispatch({ type: 'sort.set', sort: [{ column: 'zz', dir: 'asc' }] }, 'user')).toMatchObject({ ok: false, reason: 'unknown-column' });
      expect(events).toEqual([]);
    });
  });
});
