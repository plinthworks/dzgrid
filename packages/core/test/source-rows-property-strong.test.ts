import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, type Call } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';

type R = { id: string; name: string };

/**
 * One seeded script of 20 steps against server pages (offset): pages, sizes,
 * searches and refreshes asked, answers and failures in any order, and
 * optionally a destroy. The oracle is naive and shares nothing with the model:
 * the last call made is the one that counts; a row's id names its call.
 */
function runScenario(seed: number, withDestroy: boolean) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const fake = fakeSource();
  const model = sourceRows<R>(fake.source as DataSource<R>).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<R>([{ id: 'name' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    page: { pageSize: 2 },
  });
  let changes = 0;
  model.subscribe(() => changes++);
  const outcome = new Map<Call, { ok: true; rows: string[] } | { ok: false; error: unknown }>();
  /** Calls whose answer the oracle accepts: the last call when it arrived, before any destroy. */
  const accepted = new Set<string>();
  let destroyed = false;
  let changesAtDestroy = 0;
  const destroyAt = withDestroy ? int(20) : -1;
  const stats = { accepted: 0, dropped: 0, failed: 0 };
  /** The last accepted success: what must be on screen, and what the pager reads its total and next from. */
  let lastOk: { rows: string[]; total: number | null; hasNext: boolean | null; epoch: number } | null = null;
  // The query epoch: each change of the search starts one (and forgets the last total).
  let epoch = 0;
  let quickNow = '';
  const fail = (why: string) => `seed ${seed}${withDestroy ? ' (destroy)' : ''}: ${why}`;

  for (let step = 0; step < 20; step++) {
    if (step === destroyAt) {
      model.destroy();
      destroyed = true;
      changesAtDestroy = changes;
    }
    const before = changes;
    const acceptedBefore = stats.accepted;
    const open = fake.calls.filter((c) => !outcome.has(c));
    const r = rnd();
    if (r < 0.45 && open.length) {
      const c = open[int(open.length)]!;
      const latest = c === fake.last() && !destroyed;
      if (rnd() < 0.8) {
        const n = 1 + int(c.req.page!.size);
        const rows = Array.from({ length: n }, (_, i) => `${c.name}-${i}`);
        outcome.set(c, { ok: true, rows });
        const more = rnd() < 0.5 ? { total: 20 } : { hasNext: rnd() < 0.5 };
        if (latest) lastOk = { rows, total: 'total' in more ? (more.total ?? null) : null, hasNext: 'hasNext' in more ? (more.hasNext ?? null) : null, epoch };
        c.resolve({ rows: rows.map((id) => ({ id, name: id })), ...more });
      } else {
        const error = { from: c.name };
        outcome.set(c, { ok: false, error });
        c.reject(error);
        if (latest) stats.failed++;
      }
      if (latest) {
        accepted.add(c.name);
        stats.accepted++;
      } else stats.dropped++;
    } else if (r < 0.65) model.setPage({ index: int(5) });
    else if (r < 0.75) model.setPage({ size: 2 + int(2) });
    else if (r < 0.9) {
      const q = ['', 'a', 'b'][int(3)]!;
      if (q !== quickNow && !destroyed) {
        epoch++;
        quickNow = q;
      }
      model.setQuery(makeQuery({ quick: q }));
    }
    else model.invalidate();
    expect(changes - before, fail('one change per call at most')).toBeLessThanOrEqual(1);
    // An answer or a failure that counts always changes something (rows, or loading to error): said once.
    if (r < 0.45 && open.length && fake.calls.indexOf(fake.last()) >= 0 && stats.accepted > acceptedBefore) expect(changes - before, fail('accepted answer said')).toBe(1);

    // I3: what is shown came from an answer the oracle accepts.
    const d = model.displayed;
    for (let i = 0; i < d.count; i++) {
      const id = String(d.nodeAt(d.index(i)!).id);
      expect(accepted.has(id.split('-')[0]!), fail(`row ${id} from a superseded call`)).toBe(true);
    }
  }

  const last = fake.last();
  const got = outcome.get(last);
  const shown = Array.from({ length: model.displayed.count }, (_, i) => String(model.displayed.nodeAt(model.displayed.index(i)!).id));
  if (!destroyed || accepted.has(last.name)) {
    // I1: the last call's rows, when it succeeded and counted.
    if (got?.ok && accepted.has(last.name)) expect(shown, fail('I1')).toEqual(got.rows);
    // I4: the status follows the last call.
    if (!got) expect(model.status, fail('I4 loading')).toEqual({ phase: 'loading' });
    else if (got.ok) expect(model.status, fail('I4 idle')).toEqual({ phase: 'idle' });
    else expect(model.status, fail('I4 error')).toEqual({ phase: 'error', failure: got.error });
  }
  if (!destroyed) {
    // I1b: after a failure (or while loading) the rows of the last accepted success stay.
    expect(shown, fail('I1b rows kept')).toEqual(lastOk?.rows ?? []);
    // I7: total and next from the last accepted success of the current query, read at the page asked
    // now; a new query forgets the old one's (step 5 review).
    const p = model.page!;
    const current = lastOk && lastOk.epoch === epoch ? lastOk : null;
    const total = current?.total ?? null;
    expect(p.total, fail('I7 total')).toBe(total);
    const next = current?.hasNext ?? (total !== null && (p.index + 1) * p.size < total);
    expect(p.hasNext, fail('I7 hasNext')).toBe(next);
    expect(model.counts, fail('I7 counts')).toEqual({ total: last.req.quick === undefined ? total : null, filtered: total, displayed: shown.length });
  }
  // I2: the page reported is the last ask.
  expect({ index: model.page!.index, size: model.page!.size }, fail('I2')).toEqual({ index: last.req.page!.index, size: last.req.page!.size });
  // I5: nothing said after destroy.
  if (destroyed) expect(changes, fail('I5')).toBe(changesAtDestroy);
  // I6: every request went through the gate, once.
  expect(model.diagnostics.gate.begun, fail('I6')).toBe(fake.calls.length);
  expect(model.diagnostics.fetches).toBe(fake.calls.length);
  return stats;
}

describe('source rows under random orders, stronger oracle', () => {
  for (const withDestroy of [false, true]) {
    it(`1 000 seeds${withDestroy ? ' with a destroy' : ''}: the last ask wins, nothing superseded shows`, () => {
      const total = { accepted: 0, dropped: 0, failed: 0 };
      for (let seed = 1; seed <= 1000; seed++) {
        const s = runScenario(seed, withDestroy);
        total.accepted += s.accepted;
        total.dropped += s.dropped;
        total.failed += s.failed;
      }
      // Not vacuous: answers counted, answers dropped, failures that counted.
      expect(total.accepted).toBeGreaterThan(1000);
      expect(total.dropped).toBeGreaterThan(500);
      expect(total.failed).toBeGreaterThan(200);
    });
  }
});
