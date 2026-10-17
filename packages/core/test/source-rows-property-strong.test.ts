import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type OperationsInput, type SortItem } from '@dzgrid/core';
import { sourceRows, type DataSource, type PageWindow } from '@dzgrid/core/server';
import { fakeSource, type Call } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';

type R = { id: string; name: string };
type Config = 'offset' | 'cursor' | 'fetched';
const SIZES = [25, 50, 100];
const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));
const SORTS: (readonly SortItem[])[] = [[], [{ column: 'name', dir: 'asc' }], [{ column: 'name', dir: 'desc' }]];

/**
 * What the model must do, written from the behaviour sheet and sharing no
 * code with it: config 1 server pages by offset, config 2 by cursor, config 3
 * a fetched set (the search on the server) paged in the browser. Every ask
 * says which requests it makes and how many changes it gives; every accepted
 * answer is one change; what is shown, the page, the counts, the status and
 * the warnings are those of the last accepted answer of the current epoch.
 */
function oracle(config: Config) {
  const cursorMode = config === 'cursor';
  const o = {
    epoch: 0,
    quick: '',
    sort: 0,
    phase: 'loading' as 'loading' | 'idle' | 'error',
    failure: undefined as unknown,
    /** Server pages: the rows on screen. Fetched set: the rows held, in the answer's order. */
    screen: [] as string[],
    shown: null as { epoch: number; quick: string; index: number; size: number } | null,
    index: 0,
    size: 2,
    total: null as number | null,
    next: null as boolean | null,
    endAt: null as number | null,
    cursors: [null] as (string | null)[],
    warnings: [] as string[],
  };
  const ask = (): PageWindow | 'set' => {
    o.phase = 'loading';
    return config === 'fetched' ? 'set' : { index: o.index, size: o.size, offset: o.index * o.size, cursor: cursorMode ? o.cursors[o.index]! : null };
  };
  type Step = { calls: (PageWindow | 'set')[]; changes: number };
  const none: Step = { calls: [], changes: 0 };
  const sorted = (): string[] => {
    const rows = [...o.screen];
    if (o.sort === 1) rows.sort();
    if (o.sort === 2) rows.sort().reverse();
    return rows;
  };
  return {
    o,
    setPage(p: { index?: number; size?: number }): Step {
      let s = o.size;
      let i = o.index;
      const resized = p.size !== undefined && p.size !== s;
      if (resized) {
        i = cursorMode ? 0 : Math.floor((i * s) / p.size!);
        s = p.size!;
      }
      if (p.index !== undefined) i = p.index;
      if (config === 'fetched') i = Math.min(i, pageCount(o.screen.length, s) - 1);
      else if (o.total !== null) i = Math.min(i, pageCount(o.total, s) - 1);
      if (cursorMode) i = Math.min(i, (resized ? 1 : o.cursors.length) - 1);
      if (s === o.size && i === o.index) return none;
      o.size = s;
      o.index = i;
      if (config === 'fetched') return { calls: [], changes: 1 };
      if (resized && cursorMode) o.cursors = [null];
      return { calls: [ask()], changes: 1 };
    },
    setQuery(quick: string, sort: number): Step {
      const client = config === 'fetched' && sort !== o.sort;
      if (client) {
        o.sort = sort;
        o.index = 0;
      }
      if (quick === o.quick) return client ? { calls: [], changes: 1 } : none;
      o.epoch++;
      o.quick = quick;
      o.warnings = [];
      if (config !== 'fetched') {
        o.index = 0;
        o.total = null;
        o.next = null;
        o.endAt = null;
        o.cursors = [null];
      }
      return { calls: [ask()], changes: 1 };
    },
    invalidate(purge: boolean): Step {
      const quiet = o.phase === 'loading';
      o.endAt = null;
      if (purge) {
        o.screen = [];
        o.shown = null;
        o.warnings = [];
        if (config === 'fetched' || cursorMode) o.index = 0;
        if (cursorMode) o.cursors = [null];
      }
      return { calls: [ask()], changes: purge || !quiet ? 1 : 0 };
    },
    fail(error: unknown): Step {
      o.phase = 'error';
      o.failure = error;
      return { calls: [], changes: 1 };
    },
    answer(rows: string[], more: { total?: number; hasNext?: boolean; nextCursor?: string }): Step & { stepBack?: 'kept' | 'fetched' } {
      if (config === 'fetched') {
        // Another set (by its query, not its epoch: changed and changed back is the same set) starts on page 0.
        if (!o.shown || o.shown.quick !== o.quick) o.index = 0;
        o.screen = rows;
        o.shown = { epoch: o.epoch, quick: o.quick, index: 0, size: 0 };
        o.index = Math.min(o.index, pageCount(rows.length, o.size) - 1);
        o.phase = 'idle';
        return { calls: [], changes: 1 };
      }
      const t = more.total ?? null;
      let h = more.hasNext ?? null;
      const warnings: string[] = [];
      if (h === null && t === null) warnings.push('response.hasNext');
      let withCursor = false;
      if (cursorMode) {
        const said = h ?? (t !== null ? (o.index + 1) * o.size < t : rows.length >= o.size);
        if (said && typeof more.nextCursor !== 'string') {
          warnings.push('response.nextCursor');
          h = false;
        } else withCursor = said;
      }
      o.warnings = warnings;
      if (rows.length === 0 && o.index > 0 && t === null) {
        o.endAt = o.index * o.size;
        const known = o.shown && o.shown.epoch === o.epoch && o.shown.size === o.size && o.shown.index < o.index ? o.shown.index : -1;
        if (cursorMode) o.cursors.length = Math.min(o.cursors.length, o.index);
        o.index = Math.floor((known + o.index) / 2);
        if (o.index === known) {
          o.phase = 'idle';
          return { calls: [], changes: 1, stepBack: 'kept' };
        }
        return { calls: [ask()], changes: 1, stepBack: 'fetched' };
      }
      o.screen = rows;
      o.shown = { epoch: o.epoch, quick: o.quick, index: o.index, size: o.size };
      o.total = t;
      o.next = h ?? (t === null ? rows.length >= o.size : null);
      if (cursorMode) {
        o.cursors.length = o.index + 1;
        if (withCursor) o.cursors.push(more.nextCursor!);
      }
      if (rows.length === 0 && o.index === 0 && o.total === null && !o.next) o.total = 0;
      o.phase = 'idle';
      return { calls: [], changes: 1 };
    },
    displayed(): string[] {
      if (config !== 'fetched') return o.screen;
      return sorted().slice(o.index * o.size, (o.index + 1) * o.size);
    },
    page() {
      if (config === 'fetched') {
        const pc = pageCount(o.screen.length, o.size);
        return { index: o.index, size: o.size, sizes: SIZES, total: o.screen.length, pageCount: pc, hasNext: o.index < pc - 1, canJump: true };
      }
      const after = (o.index + 1) * o.size;
      const hasNext = !(o.endAt !== null && after >= o.endAt) && (o.next ?? (o.total !== null && after < o.total)) && (!cursorMode || o.index + 1 < o.cursors.length);
      return { index: o.index, size: o.size, sizes: SIZES, total: o.total, pageCount: o.total === null ? null : pageCount(o.total, o.size), hasNext, canJump: !cursorMode };
    },
    counts(shownCount: number) {
      if (config === 'fetched') {
        const fresh = o.shown !== null && o.shown.epoch === o.epoch;
        return { total: fresh && o.quick === '' ? o.screen.length : null, filtered: fresh ? o.screen.length : null, displayed: shownCount };
      }
      return { total: o.quick === '' ? o.total : null, filtered: o.total, displayed: shownCount };
    },
  };
}

function runScenario(config: Config, seed: number, withDestroy: boolean) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const fake = fakeSource();
  const operations: OperationsInput = config === 'fetched' ? { page: 'client', quick: 'server' } : 'server';
  const model = sourceRows<R>(fake.source as DataSource<R>, { paging: config === 'cursor' ? 'cursor' : 'offset' }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<R>([{ id: 'name' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    page: { pageSize: 2 },
    operations,
  });
  const want = oracle(config);
  let changes = 0;
  model.subscribe(() => changes++);
  const answered = new Set<Call>();
  /** Calls whose answer counted: the last call when it arrived, before any destroy. */
  const accepted = new Set<string>();
  let destroyed = false;
  const destroyAt = withDestroy ? int(20) : -1;
  const stats = { accepted: 0, dropped: 0, failed: 0, empty: 0, kept: 0, fetchedBack: 0, noCursor: 0, newEpochAnswers: 0 };
  const fail = (why: string) => `${config} seed ${seed}${withDestroy ? ' (destroy)' : ''}: ${why}`;
  const ids = () => Array.from({ length: model.displayed.count }, (_, i) => String(model.displayed.nodeAt(model.displayed.index(i)!).id));

  const check = (label: string) => {
    expect(ids(), fail(`${label}: rows shown`)).toEqual(want.displayed());
    expect(model.page, fail(`${label}: page`)).toEqual(want.page());
    expect(model.counts, fail(`${label}: counts`)).toEqual(want.counts(want.displayed().length));
    const status = want.o.phase === 'error' ? { phase: 'error', failure: want.o.failure } : { phase: want.o.phase };
    expect(model.status, fail(`${label}: status`)).toEqual(status);
    expect(model.problems.map((p) => p.path), fail(`${label}: warnings`)).toEqual(want.o.warnings);
  };
  check('start');

  for (let step = 0; step < 20; step++) {
    if (step === destroyAt) {
      model.destroy();
      destroyed = true;
    }
    const before = changes;
    const callsBefore = fake.calls.length;
    const open = fake.calls.filter((c) => !answered.has(c));
    let expected: { calls: (PageWindow | 'set')[]; changes: number } = { calls: [], changes: 0 };
    let label: string;
    const r = rnd();
    if (r < 0.45 && open.length) {
      const c = open[int(open.length)]!;
      answered.add(c);
      const counts = c === fake.last() && !destroyed;
      label = `answer ${c.name}`;
      if (rnd() < 0.8) {
        // Some answers are empty: past the end, or an empty set.
        const n = config === 'fetched' ? int(6) : rnd() < 0.2 ? 0 : 1 + int(c.req.page!.size);
        const order = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
        const rows = order.map((i) => `${c.name}-${i}`);
        const more: { total?: number; hasNext?: boolean; nextCursor?: string } = rnd() < 0.5 ? { total: 20 } : { hasNext: rnd() < 0.5 };
        if (config === 'cursor' && rnd() < 0.85) more.nextCursor = `${c.name}>`;
        if (counts) {
          const freshEpoch = !want.o.shown || want.o.shown.epoch !== want.o.epoch;
          const a = want.answer(rows, more);
          expected = a;
          if (n === 0) stats.empty++;
          if (a.stepBack === 'kept') stats.kept++;
          if (a.stepBack === 'fetched') stats.fetchedBack++;
          if (want.o.warnings.includes('response.nextCursor')) stats.noCursor++;
          if (freshEpoch && !a.stepBack) stats.newEpochAnswers++;
        }
        c.resolve({ rows: rows.map((id) => ({ id, name: id })), ...more });
      } else {
        const error = { from: c.name };
        if (counts) {
          expected = want.fail(error);
          stats.failed++;
        }
        c.reject(error);
      }
      if (counts) {
        accepted.add(c.name);
        stats.accepted++;
      } else stats.dropped++;
    } else if (r < 0.65) {
      const index = int(5);
      label = `go ${index}`;
      if (!destroyed) expected = want.setPage({ index });
      model.setPage({ index });
    } else if (r < 0.75) {
      const size = 2 + int(2);
      label = `size ${size}`;
      if (!destroyed) expected = want.setPage({ size });
      model.setPage({ size });
    } else if (r < 0.9) {
      const quick = ['', 'a', 'b'][int(3)]!;
      const sort = config === 'fetched' ? int(3) : 0;
      label = `query ${quick}/${sort}`;
      if (!destroyed) expected = want.setQuery(quick, sort);
      model.setQuery(makeQuery({ quick, sort: SORTS[sort]! }));
    } else {
      const purge = rnd() < 0.3;
      label = purge ? 'purge' : 'refresh';
      if (!destroyed) expected = want.invalidate(purge);
      model.invalidate(purge ? { purge: true } : undefined);
    }

    // One change per call, exactly as many as the sheet says; none after destroy.
    expect(changes - before, fail(`${label}: changes`)).toBe(destroyed ? 0 : expected.changes);
    // The requests the sheet says, with what they ask.
    const made = fake.calls.slice(callsBefore);
    expect(made.length, fail(`${label}: requests`)).toBe(destroyed ? 0 : expected.calls.length);
    made.forEach((c, i) => {
      const w = expected.calls[i]!;
      if (w === 'set') expect('page' in c.req, fail(`${label}: no page in a fetched set`)).toBe(false);
      else expect(c.req.page, fail(`${label}: window`)).toEqual(w);
      expect(c.req.quick, fail(`${label}: quick`)).toBe(want.o.quick === '' ? undefined : want.o.quick);
    });
    // Nothing superseded ever shows.
    for (const id of ids()) expect(accepted.has(id.split('-')[0]!), fail(`row ${id} from a superseded call`)).toBe(true);
    check(label);
  }
  // Every request went through the gate, once.
  expect(model.diagnostics.gate.begun, fail('gate')).toBe(fake.calls.length);
  expect(model.diagnostics.fetches).toBe(fake.calls.length);
  return stats;
}

describe('source rows under random orders, stronger oracle', () => {
  const floors: Record<Config, Partial<Record<keyof ReturnType<typeof runScenario>, number>>> = {
    offset: { accepted: 1000, dropped: 500, failed: 200, empty: 200, kept: 8, fetchedBack: 20 },
    // By cursor a step back fetches only when the page asked is below the page shown (the unit tests cover it).
    cursor: { accepted: 1000, dropped: 500, failed: 200, empty: 200, kept: 20, noCursor: 100 },
    fetched: { accepted: 1000, dropped: 300, failed: 200, empty: 200, newEpochAnswers: 300 },
  };
  for (const config of ['offset', 'cursor', 'fetched'] as const) {
    for (const withDestroy of [false, true]) {
      it(`${config}: 1 000 seeds${withDestroy ? ' with a destroy' : ''}: the sheet, step by step`, () => {
        const total = { accepted: 0, dropped: 0, failed: 0, empty: 0, kept: 0, fetchedBack: 0, noCursor: 0, newEpochAnswers: 0 };
        for (let seed = 1; seed <= 1000; seed++) {
          const s = runScenario(config, seed, withDestroy);
          for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += s[key];
        }
        // Not vacuous: answers counted and dropped, failures, empty answers, both step backs, missing cursors, new sets.
        const floor = floors[config];
        for (const key of Object.keys(floor) as (keyof typeof total)[]) {
          expect(total[key], `${key}: ${JSON.stringify(total)}`).toBeGreaterThan(withDestroy ? floor[key]! / 2 : floor[key]!);
        }
      });
    }
  }
});
