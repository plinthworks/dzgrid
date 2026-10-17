import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, NO_OVERLAY, zoneDayBounds, parseDay, type ColumnDef, type ColumnFilter, type FilterModel } from '@dzgrid/core';
import { ColumnCache, compileFilter, createRowStore, filterIndices } from '@dzgrid/core/internal';
import { toWire, type WireFilter } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';

/**
 * The wire form says what the browser does (docs/behaviors/server-filter.md).
 * A: for seeded rows and filters, the browser's rows equal those of an oracle
 * that reads the wire form ONLY — instants as fixed-millisecond ISO strings
 * compared as strings, days as strings, the rest by its raw op — and shares
 * no code with the core (it never resolves a day itself). B: the wire's
 * problems equal the browser's, so the two validators cannot drift apart.
 */
const ZONES = [
  'Africa/Algiers', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Chatham', 'Australia/Lord_Howe', 'Pacific/Apia',
  'America/Sao_Paulo', 'America/Havana', 'America/Los_Angeles', 'Pacific/Auckland', 'Europe/Dublin', 'UTC',
];
/** Clock changes somewhere among the zones: spring, fall, a skipped day, a midnight that never was. */
const DAYS = [
  '2026-03-08', '2026-03-29', '2026-04-05', '2026-09-27', '2026-10-04', '2026-10-25', '2026-11-01', '2026-03-05',
  '2011-12-29', '2011-12-30', '2011-12-31', '2018-11-04', '2018-11-03', '2026-03-07', '2026-11-08', '2026-12-31',
];
const TEXTS = ['abc', 'ABC', 'abd', 'xbc', 'b', 'bc', null];
const SETS = ['a', 'b', 'c', null];
const NUMS = [-2.5, -1, 0, 1, 3, 7, null];
const CDAYS = ['2026-03-01', '2026-03-05', '2026-03-10', '2025-12-31', null];

/** An instant filter with bounds. */
type Ranged = Extract<WireFilter, { resolved: unknown }>;
type Row = { id: string; t: string | null; n: number | null; d: string | null; b: boolean | null; k: string | null; s: string | null };
const DEFS: ColumnDef<Row>[] = [
  { id: 't', type: 'instant' as const }, { id: 'n', type: 'number' as const }, { id: 'd', type: 'day' as const },
  { id: 'b', type: 'boolean' as const }, { id: 'k' }, { id: 's', hidden: true }, { id: 'x', filter: false },
];

const ms = (iso: string) => Date.parse(iso);
const isoOf = (v: number) => new Date(v).toISOString();
/** A moment written in some offset, as a host might send it; or epoch ms; rarely with no offset at all. */
function writeAt(v: number, r: () => number): string | number {
  const p = r();
  if (p < 0.15) return v;
  if (p < 0.2) return isoOf(v).slice(0, 19); // no offset: ambiguous
  const [sign, h, m] = [[1, 5, 45], [-1, 3, 0], [1, 14, 0], [1, 0, 0]][Math.floor(r() * 4)]! as [number, number, number];
  const local = isoOf(v + sign * (h * 3600e3 + m * 60e3)).slice(0, 23);
  return `${local}${sign < 0 ? '-' : '+'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function rows(zone: string, r: () => number): { rows: Row[]; instants: number[] } {
  const instants = new Set<number>();
  for (const day of DAYS) {
    const b = zoneDayBounds(parseDay(day)!, zone);
    for (const edge of [b.from, b.to]) for (const dt of [-1000, -1, 0, 1, 1000]) instants.add(edge + dt);
    // Through the day, every 20 minutes: a fall-back overlap is crossed.
    if (r() < 0.3) for (let t: number = b.from; t < b.to; t += 20 * 60e3) instants.add(t);
  }
  const list = [...instants];
  const pick = <V>(xs: readonly V[]) => xs[Math.floor(r() * xs.length)]!;
  const out: Row[] = list.map((t, i) => ({
    id: String(i), t: r() < 0.05 ? null : isoOf(t), n: pick(NUMS), d: pick(CDAYS), b: pick([true, false, null]), k: pick(SETS), s: pick(TEXTS),
  }));
  return { rows: out, instants: list };
}

function filterFor(col: string, r: () => number, instants: number[], depth = 1): unknown {
  const pick = <V>(xs: readonly V[]) => xs[Math.floor(r() * xs.length)]!;
  if (r() < 0.12 && depth <= 3) {
    const n = 1 + Math.floor(r() * 3);
    return { type: 'combined', join: pick(['and', 'or']), conditions: Array.from({ length: n }, () => filterFor(col, r, instants, depth + 1)) };
  }
  const junk = r() < 0.06;
  switch (col) {
    case 't': {
      const op = pick(['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank']);
      const day = () => (junk ? '2026-02-30' : r() < 0.06 ? undefined : pick(DAYS));
      const at = () => (r() < 0.06 ? undefined : writeAt(pick(instants) + pick([0, 0, 1, -1, 999]), r));
      if (op === 'onDay') return { type: 'instant', op, day: day() };
      if (op === 'betweenDays') return { type: 'instant', op, day: day(), dayTo: day() };
      if (op === 'between') return { type: 'instant', op, at: at(), atTo: at() };
      if (op === 'before' || op === 'after') return r() < 0.5 ? { type: 'instant', op, at: at() } : { type: 'instant', op, day: day() };
      return { type: 'instant', op };
    }
    case 'n': {
      const op = pick(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank', ...(junk ? ['near'] : [])]);
      const v = () => (junk ? pick([Number.NaN, Infinity, '3']) : r() < 0.08 ? undefined : pick(NUMS.filter((x) => x !== null)));
      return { type: 'number', op, value: v(), ...(r() < 0.6 && { valueTo: v() }) };
    }
    case 'd': {
      const op = pick(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank']);
      const v = () => (junk ? '2026-13-01' : r() < 0.08 ? undefined : pick(CDAYS.filter((x) => x !== null)));
      return { type: 'day', op, value: v(), ...(r() < 0.6 && { valueTo: v() }) };
    }
    case 'b':
      return { type: 'boolean', value: junk ? 'yes' : pick([true, false, null]) };
    case 'k': {
      const sub = SETS.filter((x): x is string => x !== null && r() < 0.5);
      const blanks = pick([undefined, 'include', 'exclude', ...(junk ? ['maybe'] : [])]);
      const which = junk && r() < 0.5 ? { include: sub, exclude: sub } : r() < 0.5 ? { include: sub } : r() < 0.9 ? { exclude: sub } : {};
      return { type: 'set', ...which, ...(blanks && { blanks }) };
    }
    default: {
      // ASCII, case-sensitive: the browser's exact comparison, which a server can do the same way.
      const op = pick(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']);
      if (junk) return { type: 'text', op, value: 5, caseSensitive: true };
      return { type: 'text', op, value: pick(['', 'b', 'bc', 'ab', 'abc', 'A', 'ABC', 'x']), caseSensitive: true };
    }
  }
}

/** The oracle: one cell against one wire filter, from the wire's fields alone. */
function keeps(w: WireFilter, cell: unknown): boolean {
  const blank = cell === null || cell === undefined || cell === '';
  switch (w.type) {
    case 'combined':
      return w.join === 'and' ? w.conditions.every((c) => keeps(c, cell)) : w.conditions.some((c) => keeps(c, cell));
    case 'instant': {
      if (w.op === 'blank') return blank;
      if (w.op === 'notBlank') return !blank;
      if (blank) return false;
      const iso = isoOf(ms(cell as string));
      const { from, to } = (w as Ranged).resolved;
      return (from === null || iso >= from) && (to === null || iso < to);
    }
    case 'number':
    case 'day': {
      if (w.op === 'blank') return blank;
      if (w.op === 'notBlank') return !blank;
      const c = cell as number | string;
      const v = w.value!;
      switch (w.op) {
        case 'equals': return !blank && c === v;
        case 'notEqual': return blank || c !== v;
        case 'lt': return !blank && c < v;
        case 'lte': return !blank && c <= v;
        case 'gt': return !blank && c > v;
        case 'gte': return !blank && c >= v;
        case 'between': return !blank && c >= v && c <= w.valueTo!;
      }
      throw new Error(`op ${w.op}`);
    }
    case 'boolean':
      return cell === w.value;
    case 'set':
      if (blank) return w.include ? w.blanks === 'include' : w.blanks !== 'exclude';
      return w.include ? w.include.includes(cell as string) : !w.exclude!.includes(cell as string);
    case 'text': {
      if (w.op === 'blank') return blank;
      if (w.op === 'notBlank') return !blank;
      const c = blank ? null : (cell as string);
      const v = w.value!;
      const has = c !== null && c.includes(v);
      const eq = c !== null && c === v;
      switch (w.op) {
        case 'contains': return has;
        case 'notContains': return !has;
        case 'equals': return eq;
        case 'notEqual': return !eq;
        case 'startsWith': return c !== null && c.startsWith(v);
        case 'endsWith': return c !== null && c.endsWith(v);
      }
      throw new Error(`op ${w.op}`);
    }
    default:
      throw new Error(`kind ${w.type}`);
  }
}

describe('the wire form is what the browser filters (seeded)', () => {
  it('A: same rows, from the wire alone; B: same problems', () => {
    const columns = createColumnModel<Row>(DEFS);
    let checked = 0;
    let withRows = 0;
    let instantChecks = 0;
    for (let seed = 1; seed <= 260; seed++) {
      const r = mulberry32(seed);
      const zone = ZONES[seed % ZONES.length]!;
      const ctx = localeCtx({ locale: 'en-US', timeZone: zone });
      const { rows: data, instants } = rows(zone, r);
      const store = createRowStore<Row>((x) => x.id);
      store.replaceAll(data);
      const cache = new ColumnCache<Row>();
      for (let q = 0; q < 6; q++) {
        const model: Record<string, unknown> = {};
        for (const c of ['t', 'n', 'd', 'b', 'k', 's']) if (r() < 0.45) model[c] = filterFor(c, r, instants);
        if (r() < 0.05) model.x = { type: 'text', op: 'contains', value: 'a' };
        if (r() < 0.05) model.gone = { type: 'number', op: 'gt', value: 1 };
        const label = `seed ${seed} zone ${zone} ${JSON.stringify(model)}`;

        const compiled = compileFilter(model as FilterModel, { source: store.snapshot, columns, ctx, reader: NO_OVERLAY, cache });
        const order = filterIndices(store.snapshot.count, [compiled]);
        const browser = order ? [...order].map((i) => store.snapshot.ids[i]) : [...store.snapshot.ids];

        const w = toWire(model as FilterModel, { ctx, columns });
        // What the server receives: through JSON.
        const sent = JSON.parse(JSON.stringify(w.filter)) as Record<string, WireFilter>;
        expect(sent, label).toEqual(w.filter);
        const oracle = data.filter((row) => Object.entries(sent).every(([col, f]) => keeps(f, row[col as keyof Row]))).map((row) => row.id);
        expect(browser, label).toEqual(oracle);
        expect(w.problems.map((p) => [p.code, p.path]), label).toEqual(compiled.problems.map((p) => [p.code, p.path]));
        // A filter refused or half-typed is not sent; every one sent is live in the browser too.
        expect(Object.keys(sent).length > 0, label).toBe(compiled.active);

        checked++;
        if (browser.length > 0 && browser.length < data.length) withRows++;
        if (sent.t) instantChecks++;
      }
    }
    // The run reached what it means to test.
    expect(checked).toBe(1560);
    expect(withRows).toBeGreaterThan(600);
    expect(instantChecks).toBeGreaterThan(300);
  });

  it('the bounds sent for a day are the first instants of that day and the next, read back with Intl', () => {
    // A third way, through Intl alone: the instant before `from` is the day before, `from` is the day.
    for (const zone of ZONES) {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const columns = createColumnModel<Row>(DEFS);
      for (const day of DAYS) {
        const w = toWire({ t: { type: 'instant', op: 'onDay', day } as ColumnFilter }, { ctx: localeCtx({ locale: 'en-US', timeZone: zone }), columns });
        const t = w.filter.t as Ranged;
        const from = ms(t.resolved.from!);
        const to = ms(t.resolved.to!);
        expect(t.resolved.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        if (from === to) {
          // A skipped day: the instant there is already the next day.
          expect(fmt.format(from) > day, `${zone} ${day}`).toBe(true);
          expect(fmt.format(from - 1) < day, `${zone} ${day}`).toBe(true);
          continue;
        }
        expect([fmt.format(from - 1) < day, fmt.format(from), fmt.format(to - 1), fmt.format(to) > day], `${zone} ${day}`).toEqual([true, day, day, true]);
      }
    }
  });
});
