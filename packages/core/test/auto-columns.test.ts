import { describe, expect, it } from 'vitest';
import { autoColumns } from '@dzgrid/core/auto-columns';
import { resolveColumns } from '@dzgrid/core';

/** docs/behaviors/auto-columns.md, rule by rule; expectations written by hand. Made-up rows (a kite club). */
type Kite = Record<string, unknown>;
const kites: Kite[] = [
  { id: 'k1', name: 'Red falcon', span: 1.4, flown: true, bought: '2025-04-02', last: '2026-03-01T09:30:00Z', owner: { n: 'x' }, notes: null },
  { id: 'k2', name: 'Blue wren', span: 2, flown: false, bought: '2024-12-31', last: '2026-03-02T10:00:00+02:00', owner: { n: 'y' }, notes: '' },
];

describe('autoColumns: fields and order (1–3)', () => {
  it('takes the fields in the order first met, once each, skipping object-only fields', () => {
    const { columns, problems } = autoColumns<Kite>([...kites, { extra: 3, id: 'k3' }]);
    expect(columns.map((c) => c.id)).toEqual(['id', 'name', 'span', 'flown', 'bought', 'last', 'notes', 'extra']);
    expect(problems).toEqual([]);
  });

  it('inspects only `sample` rows', () => {
    expect(autoColumns<Kite>([{ a: 1 }, { b: 2 }], { sample: 1 }).columns.map((c) => c.id)).toEqual(['a']);
  });

  it('skips rows that are not plain objects', () => {
    // Rows that are not objects, on purpose (bad input never throws).
    expect(autoColumns<Kite>([null as never, 5 as never, [1] as never, { a: 1 }]).columns.map((c) => c.id)).toEqual(['a']);
  });

  it('puts `order` first, the rest in data order, an unknown name told by its path', () => {
    const { columns, problems } = autoColumns<Kite>(kites, { order: ['span', 'nope', 'name'] });
    expect(columns.map((c) => c.id)).toEqual(['span', 'name', 'id', 'flown', 'bought', 'last', 'notes']);
    expect(problems).toEqual([{ code: 'unknown-column', severity: 'warning', path: 'autoColumns.order[1]', detail: 'nope' }]);
  });

  it('gives no `field`: the id is the field (a dotted name read as the row’s own property by the core)', () => {
    const { columns } = autoColumns<Kite>([{ 'a.b': 4 }]);
    expect(columns).toEqual([{ id: 'a.b', header: 'a.b', type: 'number' }]);
    const r = resolveColumns(columns);
    // A plain row for the resolved reader, typed loosely on purpose.
    expect(r.columns[0]!.read({ 'a.b': 4 } as never)).toBe(4);
  });
});

describe('autoColumns: types (4–8)', () => {
  const typeOf = (values: unknown[]) => autoColumns<Kite>(values.map((v) => ({ v }))).columns[0]!.type;

  it('numbers, booleans', () => {
    expect(typeOf([1, 2.5, null, -3])).toBe('number');
    expect(typeOf([true, false, ''])).toBe('boolean');
    expect(typeOf([1, Infinity])).toBeUndefined();
  });

  it('days written YYYY-MM-DD with a real month and day', () => {
    expect(typeOf(['2026-01-31', '1999-12-01'])).toBe('day');
    expect(typeOf(['2026-13-01'])).toBeUndefined();
    expect(typeOf(['2026-02-00'])).toBeUndefined();
    expect(typeOf(['2026-1-05'])).toBeUndefined();
  });

  it('instants only with an offset; a date-time without one stays text', () => {
    expect(typeOf(['2026-03-01T09:30:00Z', '2026-03-01T09:30:00.250+05:30', '2026-03-01T09:30-01:00'])).toBe('instant');
    expect(typeOf(['2026-03-01T09:30:00'])).toBeUndefined();
    expect(typeOf(['2026-03-01T09:30:00Z', '2026-03-01'])).toBeUndefined();
  });

  it('a mix, or nothing but blanks, is text (no type written)', () => {
    expect(typeOf([1, '1'])).toBeUndefined();
    expect(typeOf([null, undefined, ''])).toBeUndefined();
    expect('type' in autoColumns<Kite>([{ v: 'x' }]).columns[0]!).toBe(false);
  });

  it('the kites', () => {
    const t = Object.fromEntries(autoColumns<Kite>(kites).columns.map((c) => [c.id, c.type ?? 'text']));
    expect(t).toEqual({ id: 'text', name: 'text', span: 'number', flown: 'boolean', bought: 'day', last: 'instant', notes: 'text' });
  });
});

describe('autoColumns: the developer’s say (9–14)', () => {
  it('header(field) for every made column; the field name otherwise', () => {
    const { columns } = autoColumns<Kite>(kites, { header: (f) => `«${f}»`, sample: 1 });
    expect(columns[1]).toEqual({ id: 'name', header: '«name»' });
    expect(autoColumns<Kite>([{ a: 'x' }]).columns[0]!.header).toBe('a');
  });

  it('override lays any part over the guess (id kept); an unknown field told', () => {
    // `id` in an override is not part of its type: given on purpose, to see it ignored.
    const { columns, problems } = autoColumns<Kite>(kites, { override: { span: { header: 'Span (m)', type: 'text', width: 90, id: 'zzz' } as never, ghost: { width: 1 } } });
    expect(columns.find((c) => c.id === 'span')).toEqual({ id: 'span', header: 'Span (m)', type: 'text', width: 90 });
    expect(problems).toEqual([{ code: 'unknown-column', severity: 'warning', path: 'autoColumns.override.ghost', detail: 'ghost' }]);
  });

  it('hide makes hidden columns, kept in the list', () => {
    const { columns, problems } = autoColumns<Kite>(kites, { hide: ['id', 'nope'] });
    expect(columns[0]).toEqual({ id: 'id', header: 'id', hidden: true });
    expect(problems).toEqual([{ code: 'unknown-column', severity: 'warning', path: 'autoColumns.hide[1]', detail: 'nope' }]);
  });

  it('merge: a new column at its first source’s place, reading the sources joined; the sources hidden', () => {
    const rows = [{ id: 1, from: '2026-01-01T08:00:00Z', to: '2026-01-01T09:00:00Z', room: 'B' }, { id: 2, from: '', to: '2026-01-02T09:00:00Z', room: 'C' }];
    const { columns, problems } = autoColumns<(typeof rows)[number]>(rows, { merge: { slot: { from: ['from', 'to'], header: 'Slot', width: 200 } } });
    expect(problems).toEqual([]);
    expect(columns.map((c) => c.id)).toEqual(['id', 'slot', 'from', 'to', 'room']);
    const slot = columns[1]!;
    expect(slot.header).toBe('Slot');
    expect(slot.width).toBe(200);
    expect(slot.type).toBeUndefined();
    expect(slot.value!(rows[0]!)).toBe('2026-01-01T08:00:00Z – 2026-01-01T09:00:00Z');
    expect(slot.value!(rows[1]!)).toBe('2026-01-02T09:00:00Z');
    expect(columns[2]).toEqual({ id: 'from', header: 'from', type: 'instant', hidden: true });
    expect(columns[3]!.hidden).toBe(true);
  });

  it('merge: the app’s own value wins; a source shown again by override; bad sources and ids told', () => {
    const rows = [{ a: 1, b: 2 }];
    const { columns, problems } = autoColumns<(typeof rows)[number]>(rows, {
      merge: { ab: { from: ['a', 'zz'], value: (r) => r.a + r.b, type: 'number' }, b: { from: ['a'] } },
      override: { a: { hidden: false } },
    });
    expect(columns.map((c) => [c.id, c.hidden ?? false])).toEqual([['ab', false], ['a', false], ['b', false]]);
    expect(columns[0]!.value!(rows[0]!)).toBe(3);
    expect(columns[0]!.type).toBe('number');
    expect(problems).toEqual([
      { code: 'unknown-column', severity: 'warning', path: 'autoColumns.merge.ab.from[1]', detail: 'zz' },
      { code: 'duplicate-column-id', severity: 'warning', path: 'autoColumns.merge.b', detail: 'b' },
    ]);
  });

  it('add puts columns absent from the data after the data’s, or where `order` says', () => {
    const actions = { id: 'actions', header: 'Actions', sortable: false };
    expect(autoColumns<Kite>([{ a: 1 }], { add: [actions] }).columns.map((c) => c.id)).toEqual(['a', 'actions']);
    expect(autoColumns<Kite>([{ a: 1 }], { add: [actions], order: ['actions'] }).columns.map((c) => c.id)).toEqual(['actions', 'a']);
  });

  it('bad options and bad rows: warnings, never a throw', () => {
    // Rows that are not an array, on purpose.
    expect(autoColumns(null as never)).toEqual({ columns: [], problems: [{ code: 'invalid-setting', severity: 'warning', path: 'autoColumns.rows' }] });
    // Every option of the wrong kind, on purpose (each told, none throws).
    const { columns, problems } = autoColumns<Kite>([{ a: 1 }], { order: 'a' as never, hide: 3 as never, override: [] as never, merge: 'x' as never, add: {} as never, header: 4 as never, sample: -2 });
    expect(columns).toEqual([{ id: 'a', header: 'a', type: 'number' }]);
    expect(problems.map((p) => p.path)).toEqual(['autoColumns.order', 'autoColumns.hide', 'autoColumns.override', 'autoColumns.merge', 'autoColumns.add', 'autoColumns.header', 'autoColumns.sample']);
  });
});

describe('autoColumns: the result (15–16)', () => {
  it('gives columns the grid takes, problems without a value, the rows untouched, the same result twice', () => {
    const before = JSON.stringify(kites);
    const a = autoColumns<Kite>(kites);
    expect(resolveColumns(a.columns).problems).toEqual([]);
    expect(JSON.stringify(kites)).toBe(before);
    expect(autoColumns<Kite>(kites)).toEqual(a);
    const secret = autoColumns<Kite>([{ ssn: '123-45' }], { order: ['123-45x'] }).problems;
    expect(JSON.stringify(secret)).not.toContain('123-45"');
  });
});
