import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, localeCtx, makeQuery, NO_OVERLAY,
  type AnyFilterKind, type ColumnDef, type ColumnFilter, type FilterModel, type GridEvent, type LocaleCtx, type ValueReader,
} from '@dzgrid/core';
import { ColumnCache, compileFilter, createRowStore, filterIndices, filterKindLookup } from '@dzgrid/core/internal';
import { sourceRows, toWire, type DataSource } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';

/** Step 8 test analysis: docs/behaviors/filter-custom.md */
type Row = { id: string; n?: unknown; s?: unknown; d?: unknown; x?: unknown };
const DEFS: ColumnDef<Row>[] = [{ id: 'n', type: 'number' }, { id: 's' }, { id: 'd', type: 'day' }, { id: 'x', filter: false }];
const EN = localeCtx({ locale: 'en-US', timeZone: 'UTC' });
const custom = (kind: string, state: unknown): ColumnFilter => ({ type: 'custom', kind, state } as unknown as ColumnFilter);
const pick = <V>(r: () => number, xs: readonly V[]): V => xs[Math.floor(r() * xs.length)]!;
const idsOf = (m: { displayed: { count: number; nodeAt(i: number): unknown } }): string[] =>
  Array.from({ length: m.displayed.count }, (_, i) => (m.displayed.nodeAt(i as never) as { id: string }).id);

type Range = { lo: number | null; hi: number | null };
const isRange = (o: unknown): o is Range =>
  o !== null && typeof o === 'object' && !Array.isArray(o) && ['lo', 'hi'].every((k) => (o as Record<string, unknown>)[k] === null || typeof (o as Record<string, unknown>)[k] === 'number');

/** The kinds of the property: each a different branch of read/active/test/types. */
const KINDS: AnyFilterKind[] = [
  { name: 'between', types: ['number'], read: (s) => (isRange(s) ? s : 'invalid'), active: (s: Range) => s.lo !== null && s.hi !== null, test: (s: Range) => (v) => v !== null && v >= s.lo! && v <= s.hi! },
  { name: 'prefix', types: ['text'], read: (s) => (typeof s === 'string' ? s : 'invalid'), active: (s) => s !== '', test: (s: string) => (v) => typeof v === 'string' && v.startsWith(s) },
  { name: 'blank', read: (s) => (typeof s === 'boolean' ? s : 'invalid'), active: () => true, test: (s: boolean) => (v) => (v === null) === s },
  { name: 'after', types: ['day'], read: (s) => (typeof s === 'string' ? s : 'invalid'), active: (s) => s.length === 10, test: (s: string) => (v) => typeof v === 'string' && v > s },
  { name: 'server', read: (s) => s, active: (s) => s !== 0 },
  { name: 'read-boom', read: (s) => { if (s === 13) throw new Error('read'); return s; }, active: () => true, test: () => (v) => v !== null },
  { name: 'make-boom', read: (s) => s, active: () => true, test: (s) => { if (s === 13) throw new Error('make'); return (v) => v !== null; } },
  { name: 'row-boom', read: (s) => s, active: () => true, test: () => (v) => { if (v === 3 || v === 'b') throw new Error('row'); return v !== null; } },
];
const NAMES = [...KINDS.map((k) => k.name), 'nope'];
const STATES: unknown[] = [
  { lo: 1, hi: 4 }, { lo: -2, hi: 3 }, { lo: 2, hi: null }, { lo: '1', hi: 2 }, 'a', 'b', '', true, false,
  '2026-03-04', '2026', 0, 1, 13, null, [1, 2],
];

/** The value as each column's codec should read it, written here without the core. */
const coerce = (col: string, raw: unknown): unknown => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (col === 'n') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) return Number(raw);
    return null;
  }
  if (col === 'd') {
    const m = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
    if (!m) return null;
    const t = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
    return t.getUTCMonth() === +m[2]! - 1 && t.getUTCDate() === +m[3]! ? raw : null;
  }
  return typeof raw === 'string' ? raw : null;
};

type O = { t: 'refused' } | { t: 'inactive' } | { t: 'test'; fn: (row: Row) => boolean };
const TYPES: Record<string, string> = { n: 'number', s: 'text', d: 'day' };

/** The browser's rules, as the behaviour sheet states them, over the kinds' own functions. */
function oracle(model: Record<string, unknown>, rows: Row[]) {
  const compileTime: [string, string, string | undefined][] = [];
  /** Indices into compileTime the wire never says: filter-needs-server, and a throw from test() (never called there). */
  const browserOnly = new Set<number>();
  const rowTime: string[] = [];
  const one = (col: string, f: unknown, path: string, depth: number): O => {
    const bad = (detail?: string): O => (compileTime.push(['invalid-filter', path, detail]), { t: 'refused' });
    const c = f as { type: string; kind: unknown; state: unknown; join: string; conditions: unknown[] };
    if (c.type === 'combined') {
      if (depth >= 3) return bad();
      const parts = c.conditions.map((x, i) => one(col, x, `${path}.conditions[${i}]`, depth + 1));
      if (parts.some((p) => p.t === 'refused')) return { t: 'refused' };
      const live = parts.filter((p): p is Extract<O, { t: 'test' }> => p.t === 'test');
      if (!live.length) return { t: 'inactive' };
      return { t: 'test', fn: c.join === 'and' ? (r) => live.every((p) => p.fn(r)) : (r) => live.some((p) => p.fn(r)) };
    }
    const kind = KINDS.find((k) => k.name === c.kind);
    if (!kind) return bad('unknown kind');
    if (kind.types && !kind.types.includes(TYPES[col] as never)) return bad('column type');
    let pred: (v: unknown, row: Readonly<unknown>) => boolean;
    try {
      const s = kind.read(c.state);
      if (s === 'invalid') return bad('invalid state');
      if (!kind.active(s)) return { t: 'inactive' };
      if (!kind.test) return (browserOnly.add(compileTime.push(['filter-needs-server', path, c.kind as string]) - 1), { t: 'refused' });
      try {
        pred = kind.test(s, EN);
      } catch {
        browserOnly.add(compileTime.length);
        return bad('threw');
      }
    } catch {
      return bad('threw');
    }
    let threw = false;
    return {
      t: 'test',
      fn: (row) => {
        try {
          return pred(coerce(col, row[col as keyof Row]), row);
        } catch {
          if (!threw) rowTime.push(path);
          threw = true;
          return false;
        }
      },
    };
  };
  const tests: ((r: Row) => boolean)[] = [];
  for (const [col, f] of Object.entries(model)) {
    const path = `filter.${col}`;
    if (!(col in TYPES) && col !== 'x') { compileTime.push(['unknown-column', path, undefined]); continue; }
    if (col === 'x') { compileTime.push(['invalid-filter', path, undefined]); continue; }
    const o = one(col, f, path, 1);
    if (o.t === 'test') tests.push(o.fn);
  }
  const kept = rows.filter((r) => tests.every((t) => t(r))).map((r) => r.id);
  return { kept, compileTime, rowTime, wire: compileTime.filter((_, i) => !browserOnly.has(i)) };
}

/** Bug reproductions from the step 8 test analysis: each fails today. */
describe('told once (bugs)', () => {
  const ROWS: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 3 }, { id: 'c', n: 5 }];
  const ROWBOOM = KINDS.find((k) => k.name === 'row-boom')!;

  it('a row rule that throws stays in the model problems after an update of another row', () => {
    const m = clientRows<Row>({ rows: ROWS, getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: filterKindLookup([ROWBOOM]).get });
    m.setQuery(makeQuery({ filter: { n: custom('row-boom', 1) } }));
    const threw = [{ code: 'invalid-filter', severity: 'error', path: 'filter.n', detail: 'threw' }];
    expect(m.problems).toEqual(threw);
    expect(idsOf(m)).toEqual(['a', 'c']);
    // 'c' stays in, nothing moves: the update path keeps the stages.
    m.applyTransaction({ update: [{ id: 'c', n: 6 }] });
    expect(idsOf(m)).toEqual(['a', 'c']);
    // Row 'b' still throws and is still dropped: the problem must still be said.
    expect(m.problems).toEqual(threw);
  });

  it('server filter: a refusal whose detail changes at the same path is told, as in the browser', () => {
    const data: DataSource<Row> = { fetch: () => ({ rows: [] }) };
    const m = sourceRows(data).create({ getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off', filter: 'server' }, filterKinds: filterKindLookup(KINDS).get });
    const told: unknown[] = [];
    m.subscribe((c) => { if (c.told) told.push(c.told.map((p) => p.detail)); });
    m.setQuery(makeQuery({ filter: { n: custom('nope', 1) } }));
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 'x', hi: 1 }) } }));
    expect(told).toEqual([['unknown kind'], ['invalid state']]);
  });

  it('server filter: a refused filter that comes with another, accepted, change of the request is told', () => {
    const data: DataSource<Row> = { fetch: () => ({ rows: [] }) };
    const m = sourceRows(data).create({ getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off', filter: 'server' }, filterKinds: filterKindLookup(KINDS).get });
    const told: unknown[] = [];
    m.subscribe((c) => { if (c.told) told.push(c.told.map((p) => [p.path, p.detail])); });
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 1, hi: 2 }), s: custom('nope', 1) } }));
    expect(m.problems.map((p) => [p.path, p.detail])).toEqual([['filter.s', 'unknown kind']]);
    expect(told).toEqual([[['filter.s', 'unknown kind']]]);
  });
});

describe('the kernel JSON guard (bugs)', () => {
  const kernel = () => {
    const columns = createColumnModel<Row>(DEFS);
    const rows = clientRows<Row>({ rows: [{ id: 'a', n: 1 }], getRowId: (x) => x.id, columns, ctx: EN, filterKinds: filterKindLookup(KINDS).get });
    return createKernel<Row>({ rows, columns });
  };
  const cyclic = (): Record<string, unknown> => { const o: Record<string, unknown> = { lo: 1 }; o.self = o; return o; };
  const nest = (inner: ColumnFilter, levels: number): ColumnFilter =>
    levels === 0 ? inner : ({ type: 'combined', join: 'and', conditions: [nest(inner, levels - 1)] } as ColumnFilter);

  it('a cycle at any nesting depth is refused, never a crash, also past the depth the guard walks', () => {
    for (let levels = 4; levels <= 6; levels++) {
      const k = kernel();
      const before = k.query;
      let res: unknown;
      expect(() => { res = k.dispatch({ type: 'filter.column', column: 'n', filter: nest(custom('between', cyclic()), levels) }, 'user'); }, `levels ${levels}`).not.toThrow();
      expect((res as { ok: boolean }).ok, `levels ${levels}`).toBe(false);
      expect(k.query).toBe(before);
    }
  });

  it('a getter that throws is refused, never a crash', () => {
    const state = { lo: 1, get hi(): number { throw new Error('getter'); } };
    const k = kernel();
    let res: unknown;
    expect(() => { res = k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', state) }, 'user'); }).not.toThrow();
    expect((res as { ok: boolean }).ok).toBe(false);
  });

  it('a getter is read once or refused: the state the key is made of is the state the kind reads', () => {
    let i = 0;
    const state = { lo: 0, get hi(): unknown { return i++ === 0 ? 5 : 10n; } };
    const k = kernel();
    let res: unknown;
    expect(() => { res = k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', state) }, 'user'); }).not.toThrow();
    void res;
  });

  it('a built-in filter holding a cycle (not a custom state) does not crash the dispatch', () => {
    const list: unknown[] = ['a'];
    list.push(list);
    const k = kernel();
    expect(() => k.dispatch({ type: 'filter.column', column: 's', filter: { type: 'set', include: list } as unknown as ColumnFilter }, 'user')).not.toThrow();
  });
});
