import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, reconcileFocus, resolveColumns,
  type ColumnDef, type ColumnOrGroup, type FocusOwner, type FocusPos,
} from '@dzgrid/core';
import { setFocusOwner } from '@dzgrid/core/internal';
import { leaves } from '../src/columns/defs.js';

/** Step 9b, commit 1: the seams the spans plug into, which change nothing without them. */
type R = { id: string; n: number; t: string };
const k = (id: string) => dataKey(id)!;
const rows = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, t: `t${i}` }));

describe('leaves: the columns of a tree of groups', () => {
  it('gives a flat list back as it is, the same definitions in the same order', () => {
    const a: ColumnDef<R> = { id: 'a' };
    const b: ColumnDef<R> = { id: 'b', header: 'B' };
    const out = leaves<R>([a, b]);
    expect(out).toEqual([a, b]);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });

  it('replaces each group by its columns, in order, at any depth', () => {
    const tree: ColumnOrGroup<R>[] = [
      { id: 'a' },
      { id: 'patient', header: 'Patient', children: [{ id: 'name' }, { id: 'g2', children: [{ id: 'age' }, { id: 'sex' }] }, { id: 'ward' }] },
      { id: 'z' },
    ];
    expect(leaves(tree).map((c) => c.id)).toEqual(['a', 'name', 'age', 'sex', 'ward', 'z']);
  });

  it('an empty group gives nothing; a `children` that is not an array is not a group', () => {
    expect(leaves<R>([{ id: 'g', children: [] }, { id: 'a' }]).map((c) => c.id)).toEqual(['a']);
    const odd = { id: 'odd', children: 'x' } as unknown as ColumnDef<R>;
    expect(leaves<R>([odd])).toEqual([odd]);
  });

  it('keeps a null where it was, for the checks after it', () => {
    expect(leaves<R>([null as never, { id: 'a' }])).toEqual([null, { id: 'a' }]);
    expect(leaves<R>([{ id: 'g', children: [{ id: 'a' }, null as never] }])).toEqual([{ id: 'a' }, null]);
  });
});

describe('column groups where definitions enter', () => {
  it('resolveColumns keeps the leaves; a problem path counts the leaves', () => {
    const r = resolveColumns<R>([{ id: 'g', header: 'G', children: [{ id: 'n', type: 'number' }, { id: 'n' }] }, { id: 't' }]);
    expect(r.columns.map((c) => c.id)).toEqual(['n', 't']);
    expect(r.problems.map((p) => [p.code, p.path])).toEqual([['duplicate-column-id', 'columns[1]']]);
  });

  it('a column model and the kernel’s columns.set take groups', () => {
    const columns = createColumnModel<R>([{ id: 'g', children: [{ id: 'n' }, { id: 't' }] }]);
    expect(columns.visible().map((c) => c.id)).toEqual(['n', 't']);
    const model = clientRows<R>({ rows: rows(3), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    const kernel = createKernel<R>({ rows: model, columns });
    expect(kernel.dispatch({ type: 'columns.set', defs: [{ id: 't' }, { id: 'g', children: [{ id: 'n' }] }] }, 'host').ok).toBe(true);
    expect(columns.visible().map((c) => c.id)).toEqual(['t', 'n']);
  });
});

describe('reconcileFocus with an owner', () => {
  const setup = () => {
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = clientRows<R>({ rows: rows(4), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    return { columns, model };
  };
  // Every cell of column t belongs to the cell of r0 (one tall cell, say).
  const owner: FocusOwner<unknown> = (f) => (f.column === 't' ? { kind: 'cell', row: k('r0'), column: 't' } : f);

  it('without an owner, nothing changes', () => {
    const { columns, model } = setup();
    const d = model.displayed;
    const f: FocusPos = { kind: 'cell', row: k('r2'), column: 't' };
    expect(reconcileFocus(f, d, d, columns)).toBe(f);
  });

  it('sends a cell kept or replaced to the cell owning its place', () => {
    const { columns, model } = setup();
    const before = model.displayed;
    expect(reconcileFocus({ kind: 'cell', row: k('r2'), column: 't' }, before, before, columns, owner)).toEqual({ kind: 'cell', row: k('r0'), column: 't' });
    expect(reconcileFocus({ kind: 'cell', row: k('r2'), column: 'n' }, before, before, columns, owner)).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    model.setRows(rows(4).filter((r) => r.id !== 'r2'), 'host');
    // r2 gone: the row now at its place (r3), then its owner.
    expect(reconcileFocus({ kind: 'cell', row: k('r2'), column: 'n' }, before, model.displayed, columns, owner)).toEqual({ kind: 'cell', row: k('r3'), column: 'n' });
    expect(reconcileFocus({ kind: 'cell', row: k('r2'), column: 't' }, before, model.displayed, columns, owner)).toEqual({ kind: 'cell', row: k('r0'), column: 't' });
  });

  it('never asks the owner for a header, or when no row is left', () => {
    const { columns, model } = setup();
    const before = model.displayed;
    let asked = 0;
    const counting: FocusOwner<unknown> = (f) => (asked++, f);
    expect(reconcileFocus({ kind: 'header', column: 't', level: -1 }, before, before, columns, counting)).toEqual({ kind: 'header', column: 't', level: -1 });
    model.setRows([], 'host');
    expect(reconcileFocus({ kind: 'cell', row: k('r1'), column: 't' }, before, model.displayed, columns, counting)).toEqual({ kind: 'header', column: 't' });
    expect(asked).toBe(0);
  });
});

describe('setFocusOwner: the kernel’s hook', () => {
  it('reconciles through the owner once set, and as before once removed', () => {
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = clientRows<R>({ rows: rows(4), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    const kernel = createKernel<R>({ rows: model, columns });
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 't' } }, 'user');
    setFocusOwner<R>(kernel, (f) => (f.column === 't' ? { kind: 'cell', row: k('r0'), column: 't' } : f));
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 't' });
    setFocusOwner(kernel);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 't' } }, 'user');
    kernel.dispatch({ type: 'sort.set', sort: [] }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 't' });
  });
});

describe('setFocusOwner on focus.set (step 9b, commit 3 fixes)', () => {
  it('a focus set on a cell goes through the owner at once; a header focus, or no owner, as asked', () => {
    const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
    const model = clientRows<R>({ rows: rows(4), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    const kernel = createKernel<R>({ rows: model, columns });
    const seen: FocusPos[] = [];
    kernel.subscribe((e) => { if (e.type === 'focusChanged' && e.focus) seen.push(e.focus); });
    let asked = 0;
    setFocusOwner<R>(kernel, (f, d) => {
      asked++;
      expect(d).toBe(model.displayed);
      return f.column === 't' && f.row !== k('r0') ? { kind: 'cell', row: k('r0'), column: 't' } : f;
    });
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 't' } }, 'api').ok).toBe(true);
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 't' });
    // One change, straight to the owner: never the covered place first.
    expect(seen).toEqual([{ kind: 'cell', row: k('r0'), column: 't' }]);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 'n' } }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    const before = asked;
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 't' } }, 'user');
    kernel.dispatch({ type: 'focus.set', focus: null }, 'user');
    expect(asked).toBe(before);
    setFocusOwner(kernel);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r2'), column: 't' } }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 't' });
  });
});
