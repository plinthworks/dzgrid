import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, NO_OVERLAY, numberCodec, textCodec, type ColumnDef, type FilterModel } from '@dzgrid/core';
import { ColumnCache, compileFilter, createRowStore, filterIndices } from '@dzgrid/core/internal';
import { toWire, type WireFilter } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';

/** Gaps in the wire tests: formatting against Date, zones and eras outside the 13, B parity beyond well-typed filters. */
type Row = Record<string, unknown> & { id: string };
type Ranged = Extract<WireFilter, { resolved: unknown }>;
const DEFS: ColumnDef<Row>[] = [
  { id: 's' },
  { id: 'e', type: 'enum', enumOptions: [{ value: 'a' }, { value: 'b' }] } as ColumnDef<Row>,
  { id: 'n', type: 'number' },
  { id: 'd', type: 'day' },
  { id: 't', type: 'instant' },
  { id: 'b', type: 'boolean' },
  { id: 'h', hidden: true },
  { id: 'x', filter: false },
  { id: 'c', type: 'custom', codec: { ...textCodec, kind: 'custom' } } as ColumnDef<Row>,
  { id: 'cn', type: 'custom', codec: { ...numberCodec, kind: 'custom' } } as ColumnDef<Row>,
];
const columns = createColumnModel<Row>(DEFS);
const UTC = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

describe('wire instants are written like Date.prototype.toISOString (an independent writer)', () => {
  it('for 20 000 moments over 0000–9999, fractional and negative ones included', () => {
    const r = mulberry32(42);
    const MIN = -62167219200000; // 0000-01-01T00:00:00.000Z
    const MAX = 253402300799999; // 9999-12-31T23:59:59.999Z
    const edges = [MIN, MAX, -1, 0, 1, -0, -0.5, 0.5, -86400000, -86399999.5, -1e-9, MAX - 0.5, MIN + 0.25, -2208988800000, -11644473600000];
    const values = [...edges];
    for (let i = 0; i < 20_000; i++) {
      const base = MIN + Math.floor(r() * (MAX - MIN));
      values.push(r() < 0.3 ? base + r() : base);
    }
    for (const v of values) {
      const w = toWire({ t: { type: 'instant', op: 'before', at: v } } as unknown as FilterModel, { ctx: UTC, columns });
      expect(w.problems, String(v)).toEqual([]);
      expect((w.filter.t as Ranged).resolved.to, String(v)).toBe(new Date(Math.ceil(v)).toISOString());
    }
  });
});

/**
 * Zones and days the 13-zone list misses: second-precision LMT offsets, offsets of :45 and :30 west,
 * days skipped by a date-line jump, a day lived twice (Alaska 1867), clocks changing at midnight or 24:00,
 * a zone whose DST is negative (Dublin is in the list; Casablanca's Ramadan reversal is not), Troll's +2 DST.
 */
const MORE: [string, string[]][] = [
  ['America/St_Johns', ['2026-03-08', '2026-11-01', '1935-03-30', '1988-04-03']],
  ['Australia/Eucla', ['2026-01-01', '2008-03-30']],
  ['Asia/Tehran', ['2022-03-22', '2022-09-22', '1946-01-01', '1977-11-01']],
  ['Africa/Casablanca', ['2026-02-15', '2026-03-22', '2018-10-28', '2019-05-05']],
  ['America/Santiago', ['2026-04-05', '2026-09-06', '2022-09-11']],
  ['Asia/Beirut', ['2026-03-29', '2026-10-25']],
  ['Antarctica/Troll', ['2026-03-29', '2026-10-25']],
  ['Pacific/Kiritimati', ['1994-12-30', '1994-12-31', '1995-01-01']],
  ['Pacific/Kwajalein', ['1993-08-20', '1993-08-21', '1993-08-22']],
  ['Asia/Manila', ['1844-12-30', '1844-12-31', '1845-01-01']],
  ['America/Sitka', ['1867-10-17', '1867-10-18', '1867-10-19']],
  ['Europe/Amsterdam', ['1937-06-30', '1937-07-01', '1900-01-01']],
  ['Africa/Monrovia', ['1972-01-06', '1972-01-07', '1972-01-08']],
  ['Europe/Moscow', ['2011-03-27', '2014-10-26', '1919-07-01']],
  ['Asia/Pyongyang', ['2015-08-15', '2018-05-04', '2018-05-05']],
  ['Europe/Lisbon', ['1912-01-01', '1911-12-31', '1966-04-03']],
  ['America/Caracas', ['2007-12-09', '2016-05-01']],
  ['Asia/Gaza', ['2026-03-28', '2026-10-24']],
  ['Europe/Paris', ['1911-03-11', '1940-06-14', '1945-09-16', '1960-01-01']],
  ['Africa/Algiers', ['1971-04-25', '1977-10-21', '1980-04-25', '1981-05-01']],
];

describe('onDay bounds outside the 13 zones and before 1970, read back with Intl', () => {
  it('from is the first moment of the day, to the first of the next (or from == to for a skipped day)', () => {
    const fails: string[] = [];
    for (const [zone, days] of MORE) {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const dayOf = (ms: number) => fmt.format(ms);
      for (const day of days) {
        const w = toWire({ t: { type: 'instant', op: 'onDay', day } } as FilterModel, { ctx: localeCtx({ locale: 'en-US', timeZone: zone }), columns });
        expect(w.problems, `${zone} ${day}`).toEqual([]);
        const t = w.filter.t as Ranged;
        expect(t.resolved.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        const from = Date.parse(t.resolved.from!);
        const to = Date.parse(t.resolved.to!);
        // The first time the wall clock reaches the day: the second before is an earlier day.
        const fromOk = dayOf(from - 1) < day && (from === to ? dayOf(from) > day : dayOf(from) === day);
        const toOk = from === to || (dayOf(to - 1) === day && dayOf(to) !== day);
        if (!fromOk || !toOk) fails.push(`${zone} ${day}: ${t.resolved.from} ${t.resolved.to} [${dayOf(from - 1)} ${dayOf(from)} ${dayOf(to - 1)} ${dayOf(to)}]`);
      }
    }
    expect(fails).toEqual([]);
  });
});

/**
 * B beyond the property test's generator: filters of the wrong kind for the column, enum and
 * custom-typed columns, text without caseSensitive, nulls, non-objects, unknown types, combined
 * to depth 4, junk inside combined. The wire's problems (code, path) and `active` must equal the browser's.
 */
function junkFilter(r: () => number, depth = 1): unknown {
  const pick = <V>(xs: readonly V[]): V => xs[Math.floor(r() * xs.length)]!;
  const p = r();
  if (p < 0.2) {
    return { type: 'combined', join: pick(['and', 'or', 'and', 'or', 'xor']), conditions: r() < 0.05 ? 'x' : Array.from({ length: Math.floor(r() * 3) }, () => junkFilter(r, depth + 1)) };
  }
  if (p < 0.25) return pick([null, 5, 'contains', [], { type: 'date', op: 'equals', value: 1 }, {}]);
  const type = pick(['text', 'number', 'day', 'instant', 'boolean', 'set']);
  switch (type) {
    case 'text':
      return { type, op: pick(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank', 'like']), value: pick(['a', '', undefined, 3, 'Äb', ' ']), ...(r() < 0.5 && { caseSensitive: pick([true, false, 'yes']) }) };
    case 'number':
      return { type, op: pick(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank', 'near']), value: pick([1, -0, undefined, Number.NaN, '1', null]), ...(r() < 0.5 && { valueTo: pick([2, undefined, Infinity, null]) }) };
    case 'day':
      return { type, op: pick(['equals', 'lt', 'between', 'blank', 'near']), value: pick(['2026-03-05', undefined, '2026-02-30', 5, null]), ...(r() < 0.5 && { valueTo: pick(['2026-01-01', undefined, 'x']) }) };
    case 'instant': {
      const op = pick(['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank', 'near']);
      return {
        type, op,
        ...(r() < 0.6 && { day: pick(['2026-03-29', '1900-01-01', '0000-01-01', '9999-12-31', '2026-02-30', undefined, null]) }),
        ...(r() < 0.4 && { dayTo: pick(['2026-03-30', undefined, 'x']) }),
        ...(r() < 0.5 && { at: pick([0, '2026-03-29T01:30:00Z', '2026-03-29T01:30', 'x', 8.64e15, -8.64e15, 253402300799999, null, Number.NaN]) }),
        ...(r() < 0.4 && { atTo: pick([1, '2026-03-30T00:00:00+02:00', undefined]) }),
      };
    }
    case 'boolean':
      return { type, value: pick([true, false, null, undefined, 'yes', 0]) };
    default:
      return { type, ...(r() < 0.5 ? { include: pick([['a'], [], [1], 'a']) } : r() < 0.8 ? { exclude: pick([['b'], []]) } : {}), ...(r() < 0.3 && { blanks: pick(['include', 'exclude', 'maybe']) }), ...(r() < 0.05 && { include: ['a'], exclude: ['b'] }) };
  }
}

describe('B: the wire validates as the browser does, beyond well-typed filters', () => {
  it('same problem codes and paths, same activity, for 6 000 junk-laden models in 4 zones', () => {
    const store = createRowStore<Row>((x) => x.id);
    store.replaceAll([{ id: '1', s: 'a', e: 'a', n: 1, d: '2026-03-05', t: '2026-03-29T00:00:00Z', b: true, h: 'x', x: 'y', c: 'a', cn: 1 }]);
    const cache = new ColumnCache<Row>();
    const ids = ['s', 'e', 'n', 'd', 't', 'b', 'h', 'x', 'c', 'cn', 'gone'];
    const depths = new Map<number, number>();
    const diffs: string[] = [];
    for (let seed = 1; seed <= 6000; seed++) {
      const r = mulberry32(seed);
      const zone = ['Europe/Paris', 'Pacific/Apia', 'Asia/Kolkata', 'America/St_Johns'][seed % 4]!;
      const ctx = localeCtx({ locale: 'en-US', timeZone: zone });
      const model: Record<string, unknown> = {};
      for (const c of ids) if (r() < 0.3) model[c] = junkFilter(r);
      const json = JSON.stringify(model);
      const depth = (json.match(/combined/g) ?? []).length;
      depths.set(Math.min(depth, 4), (depths.get(Math.min(depth, 4)) ?? 0) + 1);
      const compiled = compileFilter(model as FilterModel, { source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
      filterIndices(store.snapshot.count, [compiled]);
      const w = toWire(model as FilterModel, { ctx, columns });
      const a = JSON.stringify(compiled.problems.map((p) => [p.code, p.path]));
      const b = JSON.stringify(w.problems.map((p) => [p.code, p.path]).filter(([, path]) => !String(path).endsWith('.resolved')));
      const active = Object.keys(w.filter).length > 0;
      const outOfRange = w.problems.some((p) => String(p.path).endsWith('.resolved'));
      if (a !== b || (active !== compiled.active && !outOfRange)) diffs.push(`seed ${seed} ${zone} ${json}\n browser ${a} ${compiled.active}\n wire    ${b} ${active}`);
    }
    expect(diffs.slice(0, 5)).toEqual([]);
    expect(depths.get(4) ?? 0).toBeGreaterThan(50);
  });
});

describe('text: caseSensitive travels only when it is exactly true, as the browser reads it', () => {
  it('a truthy non-boolean is not sent as case-sensitive (the browser folds for it)', () => {
    for (const cs of ['yes', 1, {}, 'true']) {
      const w = toWire({ s: { type: 'text', op: 'contains', value: 'Ab', caseSensitive: cs } } as unknown as FilterModel, { ctx: UTC, columns });
      expect(w.filter.s, String(cs)).toEqual({ type: 'text', op: 'contains', value: 'Ab' });
    }
  });
});
