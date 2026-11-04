// Phase 7 step 2: the base seams a grouping shape needs (docs/phase-7-plan.md D14, docs/phase-7-steps/decisions.md
// « Seams in the base »; edit-reapply.md « Grouping columns »). A hand-made shape stands for the grouping one: these
// tests pin the model's side only.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, dataKey, localeCtx, makeQuery,
  type ModelChange, type RowKey, type RowShape, type ShapeInput, type ValueReader,
} from '@dzgrid/core';
import { flatDisplayed } from '@dzgrid/core/internal';

const flatShape = <T>(i: ShapeInput<T>) => flatDisplayed(i.snap, i.order, i.version);

type Row = { id: string; v: number; g: string };
const rows: Row[] = [
  { id: 'a', v: 3, g: 'x' },
  { id: 'b', v: 1, g: 'y' },
  { id: 'c', v: 2, g: 'x' },
];

function overlay() {
  const cells = new Map<string, Record<string, unknown>>();
  let version = 0;
  const reader: ValueReader<Row> = {
    get version() { return version; },
    overlay: true,
    value: (col, row, id) => (cells.get(id) && col.id in cells.get(id)! ? cells.get(id)![col.id] : col.read(row)),
  };
  return { reader, edit: (id: string, col: string, v: unknown) => (cells.set(id, { ...cells.get(id), [col]: v }), version++) };
}

/** A shape that shows the rows flat and records what the model tells it. */
function spy(extra: Partial<RowShape<Row>> = {}) {
  const log: { inputs: ShapeInput<Row>[]; values: (readonly string[] | undefined)[]; parents: unknown[][] } = { inputs: [], values: [], parents: [] };
  let redraw: ((kind?: 'rows' | 'expand', source?: 'user' | 'api' | 'data') => void) | null = null;
  const shape: RowShape<Row> = {
    kind: 'group',
    problems: [],
    build: (i) => (log.inputs.push(i), flatShape(i)),
    reads: () => ['g'],
    values: (changed) => void log.values.push(changed),
    parents: (...a: unknown[]) => (log.parents.push(a), []),
    attach: (_m, r) => void (redraw = r),
    ...extra,
  };
  return { shape, log, redraw: (k?: 'rows' | 'expand', s?: 'user' | 'api' | 'data') => redraw!(k, s) };
}

const columns = () => createColumnModel<Row>([{ id: 'v', type: 'number' }, { id: 'g' }]);
const ctx = localeCtx({ locale: 'en-US' });

describe('shape seams (Phase 7 step 2)', () => {
  it('an edit of a column the shape reads marks the order stale, as a sort column does', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    const o = overlay();
    o.edit('a', 'g', 'y');
    m.setReader(o.reader, ['g']);
    expect(m.orderStale).toBe(true);
  });

  it('an edit of a column nobody reads leaves the order fresh, and the shape is told the columns', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    const o = overlay();
    o.edit('a', 'v', 9);
    m.setReader(o.reader, ['v']);
    expect(m.orderStale).toBe(false);
    expect(s.log.values).toEqual([['v']]);
  });

  it('the shape hears an edit only when the reader moved; with no columns named, `undefined`', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    const o = overlay();
    m.setReader(o.reader, ['v']);
    expect(s.log.values).toEqual([]);
    o.edit('b', 'v', 4);
    m.setReader(o.reader);
    expect(s.log.values).toEqual([undefined]);
  });

  it('the shape is built with the model\'s column environment (columns, language, reader, cache)', () => {
    const s = spy();
    const cols = columns();
    clientRows<Row>({ rows, getRowId: (r) => r.id, columns: cols, ctx, shape: s.shape });
    const env = s.log.inputs[0]!.env!;
    expect(env.columns).toBe(cols);
    expect(env.ctx).toBe(ctx);
    expect(env.reader.version).toBe(0);
    expect(env.source.count).toBe(3);
    expect(typeof env.cache.keys).toBe('function');
  });

  it('a shape that opens levels at the first load is asked its parents with the environment', () => {
    const s = spy({ initial: 'all' });
    clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    expect(s.log.parents.length).toBe(1);
    const [, depth, shown, env] = s.log.parents[0]! as [unknown, number, unknown, { columns: unknown }];
    expect(depth).toBe(Infinity);
    expect(shown).toBeFalsy();
    expect(env.columns).toBeDefined();
  });

  it('a shape\'s redraw is told with the kind and the source it names; `expand` from `data` by default', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    const seen: [ModelChange<Row>['kind'], string][] = [];
    m.subscribe((c) => seen.push([c.kind, c.source]));
    s.redraw();
    s.redraw('rows', 'user');
    expect(seen).toEqual([['expand', 'data'], ['rows', 'user']]);
  });

  it('browser pages are refused beside a grouping shape (told, the rows shown whole), as beside a tree', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape, page: { pageSize: 2 } });
    expect(m.displayed.count).toBe(3);
    expect(m.page).toBeNull();
    expect(m.problems).toContainEqual({ code: 'unsupported-combination', severity: 'warning', path: 'pagination', detail: 'group' });
  });

  it('nothing changes on a flat grid: an edit stales only what the query reads', () => {
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx });
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    const o = overlay();
    o.edit('a', 'g', 'z');
    m.setReader(o.reader, ['g']);
    expect(m.orderStale).toBe(false);
    o.edit('a', 'v', 0);
    m.setReader(o.reader, ['v']);
    expect(m.orderStale).toBe(true);
  });

  it('the shape\'s read columns join the sort\'s: an edit with no columns named stales the order', () => {
    const s = spy();
    const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: columns(), ctx, shape: s.shape });
    const o = overlay();
    o.edit('c', 'v', 7);
    m.setReader(o.reader);
    expect(m.orderStale).toBe(true);
    const k: RowKey = dataKey('c')!;
    expect(m.row(k)?.id).toBe('c');
  });
});
