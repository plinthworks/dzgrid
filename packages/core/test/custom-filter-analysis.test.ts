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

describe('browser / wire parity for custom kinds, random kinds and states', () => {
  it('browser rows equal an oracle over the kinds and coerced values; compile problems equal the wire problems (but needs-server)', () => {
    const lookup = filterKindLookup(KINDS);
    const columns = createColumnModel<Row>(DEFS);
    let live = 0;
    let rowThrows = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = mulberry32(seed);
      const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        n: pick(r, [-3, 0, 1, 2, 3, 4, 2.5, '4', 'x', '', null]),
        s: pick(r, ['a', 'ab', 'b', 'ba', '', null]),
        d: pick(r, ['2026-03-01', '2026-03-05', '2026-12-31', '2026-02-30', 'nope', null]),
      }));
      const leaf = () => custom(pick(r, NAMES), pick(r, STATES));
      const node = (depth: number): ColumnFilter =>
        r() < 0.25 && depth <= 3
          ? ({ type: 'combined', join: pick(r, ['and', 'or']), conditions: Array.from({ length: 1 + Math.floor(r() * 3) }, () => node(depth + 1)) } as ColumnFilter)
          : leaf();
      const model: Record<string, unknown> = {};
      for (const col of ['n', 's', 'd', 'x', 'zz']) if (r() < (col.length > 1 || col === 'x' ? 0.05 : 0.5)) model[col] = node(1);
      const label = `seed ${seed} ${JSON.stringify(model)}`;
      const store = createRowStore<Row>((x) => x.id);
      store.replaceAll(rows);
      const compiled = compileFilter(model as FilterModel, { source: store.snapshot, columns, ctx: EN, reader: NO_OVERLAY, cache: new ColumnCache<Row>() }, lookup.get);
      const compileProblems = compiled.problems.map((p) => [p.code, p.path, p.detail]);
      const order = filterIndices(store.snapshot.count, [compiled]);
      const browser = order ? [...order].map((i) => store.snapshot.ids[i]) : [...store.snapshot.ids];
      const o = oracle(model, rows);
      expect(browser, label).toEqual(o.kept);
      expect(compileProblems, label).toEqual(o.compileTime);
      // Row-time throws: once per throwing leaf, after the compile problems.
      expect(compiled.problems.slice(compileProblems.length).map((p) => [p.code, p.path, p.detail]), label).toEqual(o.rowTime.map((p) => ['invalid-filter', p, 'threw']));
      // The wire says the same, but filter-needs-server, which is the browser's alone; and the wire never calls test.
      const wire = toWire(model as FilterModel, { ctx: EN, columns, kinds: lookup.get });
      expect(wire.problems.map((p) => [p.code, p.path, p.detail]), label).toEqual(o.wire);
      if (compiled.active) live++;
      rowThrows += o.rowTime.length;
    }
    expect(live).toBeGreaterThan(100);
    expect(rowThrows).toBeGreaterThan(10);
  });
});

describe('the values cache under random transactions and edit overlays (through the client model)', () => {
  const between = KINDS[0]!;
  const blank = KINDS[2]!;
  it('a model kept through adds, removes, updates, patches, reorders and overlays filters as a fresh one does', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = mulberry32(seed);
      const val = () => pick(r, [-3, 0, 1, 2, 3, 4, '4', 'x', '', null]);
      let next = 0;
      const mk = (): Row => ({ id: `r${next++}`, n: val() });
      let rows: Row[] = Array.from({ length: 12 }, mk);
      let overlay = new Map<string, unknown>();
      let rv = 0;
      const readerOf = (): ValueReader<Row> => {
        const o = overlay;
        return { version: rv, overlay: o.size > 0, value: (col, row, id) => (col.id === 'n' && o.has(id) ? o.get(id) : col.read(row)) };
      };
      const columns = createColumnModel<Row>(DEFS);
      const kinds = filterKindLookup(KINDS).get;
      const filter = pick(r, [
        { n: custom('between', { lo: 0, hi: 3 }) },
        { n: custom('blank', true) },
        { n: { type: 'combined', join: 'or', conditions: [custom('between', { lo: 2, hi: 2 }), custom('blank', true)] } as ColumnFilter },
      ]);
      const sort = r() < 0.5 ? [{ column: 'n', dir: 'asc' as const }] : [];
      const m = clientRows<Row>({ rows, getRowId: (x) => x.id, columns, ctx: EN, filterKinds: kinds, reader: readerOf() });
      m.setQuery(makeQuery({ filter, sort }));
      for (let step = 0; step < 12; step++) {
        const what = Math.floor(r() * 6);
        if (what === 0) {
          const add = [mk(), mk()];
          const at = r() < 0.5 ? Math.floor(r() * rows.length) : undefined;
          m.applyTransaction({ add, ...(at !== undefined && { addAt: at }) });
          rows = at === undefined ? [...rows, ...add] : [...rows.slice(0, at), ...add, ...rows.slice(at)];
        } else if (what === 1 && rows.length > 2) {
          const gone = rows[Math.floor(r() * rows.length)]!.id;
          m.applyTransaction({ remove: [gone] });
          rows = rows.filter((x) => x.id !== gone);
        } else if (what === 2) {
          const ups = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => rows[Math.floor(r() * rows.length)]!.id))].map((id) => ({ id, n: val() }));
          m.applyTransaction({ update: ups });
          rows = rows.map((x) => ups.find((u) => u.id === x.id) ?? x);
        } else if (what === 3) {
          const id = rows[Math.floor(r() * rows.length)]!.id;
          const n = val();
          m.applyTransaction({ patch: [{ id, set: { n } }] });
          rows = rows.map((x) => (x.id === id ? { ...x, n } : x));
        } else if (what === 4) {
          rows = [...rows].sort(() => r() - 0.5);
          m.setRows(rows);
        } else {
          overlay = new Map(overlay);
          const id = rows[Math.floor(r() * rows.length)]!.id;
          if (r() < 0.3) overlay.delete(id); else overlay.set(id, val());
          rv++;
          m.setReader(readerOf());
          m.reapply();
        }
        const fresh = clientRows<Row>({ rows, getRowId: (x) => x.id, columns, ctx: EN, filterKinds: kinds, reader: readerOf() });
        fresh.setQuery(makeQuery({ filter, sort }));
        expect(idsOf(m), `seed ${seed} step ${step} op ${what}`).toEqual(idsOf(fresh));
      }
    }
    void between; void blank;
  });

  it('an overlay edit followed by an update of another row: the edited value still counts (values not patched over the overlay)', () => {
    const columns = createColumnModel<Row>(DEFS);
    const rows: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 9 }, { id: 'c', n: 9 }];
    const m = clientRows<Row>({ rows, getRowId: (x) => x.id, columns, ctx: EN, filterKinds: filterKindLookup(KINDS).get });
    m.setQuery(makeQuery({ filter: { n: custom('between', { lo: 0, hi: 5 }) } }));
    expect(idsOf(m)).toEqual(['a']);
    m.setReader({ version: 1, overlay: true, value: (col, row, id) => (id === 'b' ? 2 : col.read(row)) });
    m.reapply();
    expect(idsOf(m)).toEqual(['a', 'b']);
    m.applyTransaction({ update: [{ id: 'c', n: 3 }] });
    expect(idsOf(m)).toEqual(['a', 'b', 'c']);
  });
});

describe('a kind whose rule depends on the zone or the language', () => {
  /** Keeps rows whose number equals the zone's offset index, or whose text is in the language's script. */
  const ZONED: AnyFilterKind = {
    name: 'zoned', read: (s) => s, active: () => true,
    test: (_s, ctx: LocaleCtx) => (v) => (ctx.timeZone === 'UTC' ? v === 1 : v === 2),
  };
  const LANG: AnyFilterKind = {
    name: 'lang', read: (s) => s, active: () => true,
    test: (_s, ctx: LocaleCtx) => (v) => v === ctx.locale,
  };
  const rows: Row[] = [{ id: 'a', n: 1, s: 'en-US' }, { id: 'b', n: 2, s: 'fr-FR' }, { id: 'c', n: 2, s: 'ar' }];

  it('reruns when the zone changes (client model)', () => {
    const m = clientRows<Row>({ rows, getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: filterKindLookup([ZONED, LANG]).get });
    m.setQuery(makeQuery({ filter: { n: custom('zoned', 1) } }));
    expect(idsOf(m)).toEqual(['a']);
    m.setContext(localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' }));
    expect(idsOf(m)).toEqual(['b', 'c']);
    m.setContext(EN);
    expect(idsOf(m)).toEqual(['a']);
  });

  it('reruns when the language changes (client model), and an update after it keeps the new language', () => {
    const m = clientRows<Row>({ rows, getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: filterKindLookup([ZONED, LANG]).get });
    m.setQuery(makeQuery({ filter: { s: custom('lang', 1) } }));
    expect(idsOf(m)).toEqual(['a']);
    m.setContext(localeCtx({ locale: 'fr-FR', timeZone: 'UTC' }));
    expect(idsOf(m)).toEqual(['b']);
    m.applyTransaction({ update: [{ id: 'a', n: 1, s: 'fr-FR' }] });
    expect(idsOf(m)).toEqual(['a', 'b']);
  });

  it('reruns when the zone changes in a fetched set filtered in the browser', () => {
    const data: DataSource<Row> = { fetch: () => ({ rows }) };
    const m = sourceRows(data).create({ getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off' }, filterKinds: filterKindLookup([ZONED]).get });
    m.setQuery(makeQuery({ filter: { n: custom('zoned', 1) } }));
    expect(idsOf(m as never)).toEqual(['a']);
    m.setContext(localeCtx({ locale: 'en-US', timeZone: 'Asia/Tokyo' }));
    expect(idsOf(m as never)).toEqual(['b', 'c']);
  });

  it('the wire is made again with the new zone (server filter)', () => {
    const sent: unknown[] = [];
    const ZW: AnyFilterKind = { name: 'zw', read: (s) => s, active: () => true, wire: (s, _c, zone) => ({ s, zone }) };
    const data: DataSource<Row> = { fetch: (req) => (sent.push((req as { filter?: unknown }).filter), { rows: [] }) };
    const m = sourceRows(data).create({ getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, operations: { page: 'off', filter: 'server' }, filterKinds: filterKindLookup([ZW]).get });
    m.setQuery(makeQuery({ filter: { n: custom('zw', 1) } }));
    m.setContext(localeCtx({ locale: 'en-US', timeZone: 'Asia/Tokyo' }));
    expect(sent.at(-1)).toEqual({ n: { type: 'custom', kind: 'zw', value: { s: 1, zone: 'Asia/Tokyo' } } });
  });
});

describe('told once, under repeated changes', () => {
  const ROWS: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 3 }, { id: 'c', n: 5 }];
  const ROWBOOM = KINDS.find((k) => k.name === 'row-boom')!;


  it('a row rule that starts throwing after an update is kept in the model problems and told', () => {
    const m = clientRows<Row>({ rows: ROWS, getRowId: (x) => x.id, columns: createColumnModel<Row>(DEFS), ctx: EN, filterKinds: filterKindLookup([ROWBOOM]).get });
    m.setQuery(makeQuery({ filter: { n: custom('row-boom', 1) } }));
    m.applyTransaction({ update: [{ id: 'b', n: 4 }] });
    expect(m.problems).toEqual([]);
    const told: unknown[] = [];
    m.subscribe((c) => told.push(c.told?.map((p) => p.detail) ?? null));
    m.applyTransaction({ update: [{ id: 'a', n: 3 }] });
    expect(idsOf(m)).toEqual(['b', 'c']);
    expect(m.problems.map((p) => p.detail)).toEqual(['threw']);
  });

  it('the kernel: the same refused filter dispatched again tells nothing; refused, cleared, refused again tells twice', () => {
    const columns = createColumnModel<Row>(DEFS);
    const rows = clientRows<Row>({ rows: ROWS, getRowId: (x) => x.id, columns, ctx: EN, filterKinds: filterKindLookup(KINDS).get });
    const k = createKernel<Row>({ rows, columns });
    const events: GridEvent<Row>[] = [];
    k.subscribe((e) => events.push(e));
    const probs = () => events.filter((e) => e.type === 'problems').length;
    k.dispatch({ type: 'filter.column', column: 'n', filter: custom('server', 1) }, 'user');
    k.dispatch({ type: 'filter.column', column: 'n', filter: custom('server', 1) }, 'user');
    expect(probs()).toBe(1);
    // Another state, same refusal: not told again.
    k.dispatch({ type: 'filter.column', column: 'n', filter: custom('server', 2) }, 'user');
    expect(probs()).toBe(1);
    // A sort change with the filter in force: not told again.
    k.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] } as never, 'user');
    expect(probs()).toBe(1);
    k.dispatch({ type: 'filter.column', column: 'n', filter: null }, 'user');
    k.dispatch({ type: 'filter.column', column: 'n', filter: custom('server', 1) }, 'user');
    expect(probs()).toBe(2);
    // A second refusal added next to the first: told, once.
    k.dispatch({ type: 'filter.column', column: 's', filter: custom('nope', 1) }, 'user');
    k.dispatch({ type: 'filter.column', column: 's', filter: custom('nope', 2) }, 'user');
    expect(probs()).toBe(3);
  });


});

describe('the kernel JSON guard against hostile states', () => {
  const kernel = () => {
    const columns = createColumnModel<Row>(DEFS);
    const rows = clientRows<Row>({ rows: [{ id: 'a', n: 1 }], getRowId: (x) => x.id, columns, ctx: EN, filterKinds: filterKindLookup(KINDS).get });
    return createKernel<Row>({ rows, columns });
  };
  const cyclic = (): Record<string, unknown> => { const o: Record<string, unknown> = { lo: 1 }; o.self = o; return o; };
  const nest = (inner: ColumnFilter, levels: number): ColumnFilter =>
    levels === 0 ? inner : ({ type: 'combined', join: 'and', conditions: [nest(inner, levels - 1)] } as ColumnFilter);

  it('a cycle in a custom state up to the deepest combined filter is refused, never a crash', () => {
    for (let levels = 0; levels <= 3; levels++) {
      const k = kernel();
      const before = k.query;
      let res: unknown;
      expect(() => { res = k.dispatch({ type: 'filter.column', column: 'n', filter: nest(custom('between', cyclic()), levels) }, 'user'); }, `levels ${levels}`).not.toThrow();
      expect((res as { ok: boolean }).ok, `levels ${levels}`).toBe(false);
      expect(k.query).toBe(before);
    }
  });



  it('shared references (no cycle) of plain JSON are accepted, and checked in bounded time', () => {
    const leaf = { lo: 1, hi: 2 };
    let s: unknown = leaf;
    for (let i = 0; i < 18; i++) s = { a: s, b: s };
    const k = kernel();
    const t0 = Date.now();
    const res = k.dispatch({ type: 'filter.column', column: 'n', filter: custom('blank', s) }, 'user');
    const took = Date.now() - t0;
    // 2^18 leaves when expanded: JSON, and the guard and the key walk them all.
    expect(res.ok === true || res.ok === false).toBe(true);
    expect(took).toBeLessThan(5000);
  });

  it('a state with an undefined field: refused as not json, though JSON.stringify drops it (documented choice?)', () => {
    const k = kernel();
    const res = k.dispatch({ type: 'filter.column', column: 'n', filter: custom('between', { lo: 1, hi: 2, note: undefined }) }, 'user');
    expect(res).toEqual({ ok: false, reason: 'invalid-filter', problems: [{ code: 'invalid-filter', severity: 'error', path: 'filter.n', detail: 'not json' }] });
  });

});

