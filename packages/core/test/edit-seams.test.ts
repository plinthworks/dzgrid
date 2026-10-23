// Phase 5 step 2: the kernel's edit seams (docs/phase-5-steps/step02-plan.md; edit-reapply.md 1–2, 10;
// editing.md 1–2). Conformance `edit-order` and `editable` hold the rows' side; this file the commands,
// the events and the refusals.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, detailKey, editableAt, groupKey, localeCtx, makeQuery, NO_OVERLAY,
  type ColumnDef, type GridEvent, type RowKey, type RowModel, type RowNode, type ValueReader,
} from '@dzgrid/core';
import { lockColumns } from '@dzgrid/core/internal';

type Row = { id: string; v: number; n: string; p?: string | null };
const rows: Row[] = [
  { id: 'a', v: 3, n: 'x' },
  { id: 'b', v: 1, n: 'y' },
  { id: 'c', v: 2, n: 'x' },
  { id: 'd', v: 0, n: 'y' },
];
const k = (id: string) => dataKey(id)!;

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

function setup(defs: ColumnDef<Row, any>[] = [{ id: 'v', type: 'number', editable: true }, { id: 'n' }], wrap?: (m: RowModel<Row>) => RowModel<Row>) {
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  const kernel = createKernel<Row>({ rows: wrap ? wrap(model) : model, columns, query: makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }) });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const o = overlay();
  const edit = (id: string, col: string, v: unknown, source: 'user' | 'api' = 'user') => {
    o.edit(id, col, v);
    return kernel.dispatch({ type: 'edits.reader', reader: o.reader, columns: [col] }, source);
  };
  const stale = () => events.filter((e) => e.type === 'orderStale').map((e) => [(e as { stale: boolean }).stale, e.source]);
  return { model, kernel, events, o, edit, stale };
}
/** A model without the edit seams: a server binding of an older shape, say. */
const without = (...names: string[]) => (m: RowModel<Row>): RowModel<Row> =>
  new Proxy(m, { get: (t, p) => (names.includes(p as string) ? undefined : Reflect.get(t, p, t)) });

describe('edits.reader', () => {
  it('starts with no overlay, and takes the reader given', () => {
    const s = setup();
    expect(s.kernel.reader).toBe(NO_OVERLAY);
    expect(s.edit('d', 'v', 99)).toEqual({ ok: true });
    expect(s.kernel.reader).toBe(s.o.reader);
  });

  it('refuses a reader without a value function or with a version that is not a finite number, and keeps the one it had', () => {
    const s = setup();
    for (const bad of [{ version: 1, overlay: true }, { version: Number.NaN, overlay: true, value: () => 1 }, { version: Infinity, overlay: true, value: () => 1 }, null]) {
      const r = s.kernel.dispatch({ type: 'edits.reader', reader: bad as never }, 'api');
      expect(r.ok).toBe(false);
      expect((r as { reason: string }).reason).toBe('invalid-reader');
    }
    expect(s.kernel.reader).toBe(NO_OVERLAY);
  });

  it('a model that takes no reader (none shipped is one) still gives the kernel its reader; nothing goes stale', () => {
    const s = setup(undefined, without('setReader'));
    s.o.edit('d', 'v', 99);
    expect(s.kernel.dispatch({ type: 'edits.reader', reader: s.o.reader, columns: ['v'] }, 'api')).toEqual({ ok: true });
    expect(s.kernel.reader).toBe(s.o.reader);
    expect(s.kernel.orderStale).toBe(false);
  });

  it('takes a reader whose version did not move as nothing', () => {
    const s = setup();
    s.kernel.dispatch({ type: 'edits.reader', reader: s.o.reader, columns: ['v'] }, 'user');
    expect(s.kernel.orderStale).toBe(false);
    expect(s.stale()).toEqual([]);
  });

  it('without the columns named, counts every column as changed', () => {
    const s = setup();
    s.o.edit('d', 'n', 'q');
    s.kernel.dispatch({ type: 'edits.reader', reader: s.o.reader }, 'user');
    expect(s.kernel.orderStale).toBe(true);
  });
});

describe('orderStale', () => {
  it('is told on each flip only, with the source of what flipped it', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    s.edit('c', 'v', 98);
    s.edit('a', 'n', 'z');
    expect(s.stale()).toEqual([[true, 'user']]);
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'api');
    expect(s.stale()).toEqual([[true, 'user'], [false, 'api']]);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'api');
    expect(s.stale()).toEqual([[true, 'user'], [false, 'api']]);
  });

  it('flips back with the source of a new sort, and of a host update that moves rows', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    s.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'v', dir: 'desc' }] }, 'user');
    s.edit('a', 'v', -1, 'api');
    s.model.applyTransaction({ patch: [{ id: 'b', set: { v: 10 } }] }, 'host');
    expect(s.stale()).toEqual([[true, 'user'], [false, 'user'], [true, 'api'], [false, 'host']]);
  });

  it('is told after the rows it describes: whoever hears it reads the reapplied rows', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    const types: string[] = [];
    s.kernel.subscribe((e) => types.push(e.type));
    s.kernel.dispatch({ type: 'rows.reapply' }, 'user');
    expect(types.indexOf('modelUpdated')).toBeLessThan(types.indexOf('orderStale'));
  });
});

describe('what else clears a stale order', () => {
  it('a language change while stale runs whole, with the edits, and clears it (C2)', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    s.kernel.dispatch({ type: 'context.set', ctx: localeCtx({ locale: 'fr-FR' }) }, 'host');
    expect(s.kernel.orderStale).toBe(false);
    expect(s.stale()).toEqual([[true, 'user'], [false, 'host']]);
    expect((s.model.displayed.nodeAt(s.model.displayed.index(3)!) as { id: unknown }).id).toBe('d');
  });

  it('a refresh (invalidate) clears it (C4)', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(s.kernel.orderStale).toBe(false);
  });

  it('the client model tells reapply and setApp as api by default (C7, C8)', () => {
    const s = setup();
    const kinds: [string, string][] = [];
    s.model.subscribe((c) => kinds.push([c.kind, c.source]));
    s.model.reapply();
    expect(kinds).toEqual([['order', 'api']]);
    const columns = createColumnModel<Row>([{ id: 'v', type: 'number' }]);
    const m = clientRows<Row>({
      rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }),
      filterKinds: () => ({ name: 'any', read: (x) => x, active: () => true, test: () => () => true }),
    });
    m.setQuery(makeQuery({ filter: { v: { type: 'custom', kind: 'any', state: {} } } }));
    const seen: string[] = [];
    m.subscribe((c) => seen.push(c.source));
    m.setApp({ x: 1 });
    expect(seen).toEqual(['api']);
  });
});

describe('rows.reapply', () => {
  it('reruns once, told as an order change with the command source (api from the app, never user)', () => {
    const s = setup();
    s.edit('d', 'v', 99);
    s.kernel.dispatch({ type: 'rows.reapply' }, 'api');
    const updates = s.events.filter((e) => e.type === 'modelUpdated');
    expect(updates.map((e) => [(e as { kind: string }).kind, e.source])).toEqual([['order', 'api']]);
  });

  it('is refused by a model that cannot reapply', () => {
    const s = setup(undefined, without('reapply'));
    expect(s.kernel.dispatch({ type: 'rows.reapply' }, 'api')).toMatchObject({ ok: false, reason: 'reapply-off' });
  });
});

describe('context.app', () => {
  it('keeps the application context the kernel hands to editable rules', () => {
    const s = setup([{ id: 'v', type: 'number', editable: (_r, c) => (c as { on?: boolean } | undefined)?.on === true }, { id: 'n' }]);
    expect(s.kernel.app).toBeUndefined();
    expect(s.kernel.editable(k('a'), 'v')).toBe(false);
    const ctx = { on: true };
    expect(s.kernel.dispatch({ type: 'context.app', value: ctx }, 'host')).toEqual({ ok: true });
    expect(s.kernel.app).toBe(ctx);
    expect(s.kernel.editable(k('a'), 'v')).toBe(true);
  });
});

describe('editable', () => {
  it('editableAt: data rows only, the column saying exactly true, never a locked column', () => {
    const columns = createColumnModel<Row>([{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: () => 1 as never }, { id: 'p', editable: true }]);
    const data: RowNode<Row> = { key: k('a'), kind: 'data', level: 0, id: 'a', data: rows[0]! };
    const detail: RowNode<Row> = { key: detailKey(k('a')), kind: 'detail', level: 1, master: k('a'), data: rows[0]! };
    expect(editableAt(data, columns.get('v'), undefined)).toBe(true);
    expect(editableAt(detail, columns.get('v'), undefined)).toBe(false);
    expect(editableAt(undefined, columns.get('v'), undefined)).toBe(false);
    const filler: RowNode<Row> = { key: groupKey(['f']), kind: 'group', level: 0, label: 'f', path: ['f'] };
    const loading: RowNode<Row> = { key: `l:${k('a')}` as RowKey, kind: 'loading', level: 1, parent: k('a'), failed: false };
    expect(editableAt(filler, columns.get('v'), undefined)).toBe(false);
    expect(editableAt(loading, columns.get('v'), undefined)).toBe(false);
    expect(editableAt(data, undefined, undefined)).toBe(false);
    expect(editableAt(data, columns.get('n'), undefined)).toBe(false);
    expect(editableAt(data, columns.get('p'), undefined, new Set(['p']))).toBe(false);
  });

  it('a rule that throws: false, and one warning per column for the kernel', () => {
    const s = setup([{ id: 'v', type: 'number', editable: () => { throw new Error('x'); } }, { id: 'n', editable: () => { throw new Error('y'); } }]);
    for (let i = 0; i < 3; i++) for (const c of ['v', 'n']) expect(s.kernel.editable(k('a'), c)).toBe(false);
    const told = s.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: unknown[] }).problems);
    expect(told).toEqual([
      { code: 'invalid-column', severity: 'warning', path: 'columns.v.editable', detail: 'threw' },
      { code: 'invalid-column', severity: 'warning', path: 'columns.n.editable', detail: 'threw' },
    ]);
  });

  it('a locked column marked editable is told once while it stays so, again only after it stopped (R3); lockColumns tells as host, columns.set with its source (K5)', () => {
    const s = setup([{ id: 'v', type: 'number' }, { id: 'p', editable: true }]);
    const told = () => s.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems.filter((p) => p.code === 'edit-structure').map((p) => [p.path, e.source]));
    lockColumns(s.kernel, ['p']);
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number' }, { id: 'p', header: 'P', editable: () => true }] }, 'api');
    expect(told()).toEqual([['columns.p.editable', 'host']]);
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number' }, { id: 'p' }] }, 'api');
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number', editable: true }, { id: 'p', editable: true }] }, 'api');
    expect(told()).toEqual([['columns.p.editable', 'host'], ['columns.p.editable', 'api']]);
    expect(s.kernel.editable(k('a'), 'p')).toBe(false);
  });

  it('new definitions forget which rules threw: a rule that throws again is told again (R4), with source data (K4)', () => {
    const boom = () => { throw new Error('x'); };
    const s = setup([{ id: 'v', type: 'number', editable: boom }]);
    s.kernel.editable(k('a'), 'v');
    s.kernel.dispatch({ type: 'columns.set', defs: [{ id: 'v', type: 'number', editable: boom }] }, 'host');
    s.kernel.editable(k('a'), 'v');
    const told = s.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { detail?: string }[] }).problems.filter((p) => p.detail === 'threw').map(() => e.source));
    expect(told).toEqual(['data', 'data']);
  });
});
