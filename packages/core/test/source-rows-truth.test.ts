import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, type Call } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';

type R = { id: string; name: string };

/**
 * From first principles, sharing nothing with the model's design (no endAt,
 * no halfway, no cursor list): a server holding N rows that answers every
 * request truthfully. After any sequence of asks, answers in any order,
 * failures, size changes, refreshes and data that grows or shrinks between
 * refreshes, once everything settled and the page shown was refreshed:
 *  - the rows shown are exactly the server's rows of the page shown;
 *  - when the server has rows, the page shown has rows (no page with rows
 *    lost to a step back, no stuck empty page);
 *  - hasNext is true exactly when rows follow the page shown;
 *  - from page 0, Next leads through every row, in order, and stops at the end.
 */
function run(paging: 'offset' | 'cursor', seed: number) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const fake = fakeSource();
  let n = int(14);
  // One server, one way of saying what follows: a total, hasNext, or nothing (inferred).
  const style = int(3);
  const data = () => Array.from({ length: n }, (_, i) => `r${i}`);
  const model = sourceRows<R>(fake.source as DataSource<R>, { paging }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<R>([{ id: 'name' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    page: { pageSize: 2, pageSizes: [2, 3, 4] } as never,
    operations: 'server',
  });
  const answered = new Set<Call>();
  const truth = (c: Call, failOk: boolean) => {
    answered.add(c);
    if (failOk && rnd() < 0.15) return c.reject(new Error('down'));
    const p = c.req.page!;
    const offset = paging === 'cursor' ? (p.cursor === null ? 0 : Number(p.cursor)) : p.offset;
    const rows = data().slice(offset, offset + p.size);
    const more = offset + p.size < n;
    const r: Record<string, unknown> = { rows: rows.map((id) => ({ id, name: id })) };
    if (style === 0) r.total = n;
    if (style === 1) r.hasNext = more;
    if (paging === 'cursor' && more) r.nextCursor = String(offset + p.size);
    c.resolve(r);
  };
  const settle = () => {
    for (let guard = 0; guard < 200; guard++) {
      const open = fake.calls.filter((c) => !answered.has(c));
      if (!open.length) return;
      truth(open[int(open.length)]!, false);
    }
    throw new Error('never settles');
  };
  const ids = () => Array.from({ length: model.displayed.count }, (_, i) => String(model.displayed.nodeAt(model.displayed.index(i)!).id));
  const trace: string[] = [];
  const why = (s: string) => `${paging} seed ${seed} n ${n}: ${s} (page ${JSON.stringify(model.page)})\n${trace.join('\n')}`;

  for (let step = 0; step < 25; step++) {
    const r = rnd();
    const open = fake.calls.filter((c) => !answered.has(c));
    const callsBefore = fake.calls.length;
    if (r < 0.4 && open.length) {
      const c = open[int(open.length)]!;
      truth(c, true);
      trace.push(`answer ${c.name}`);
    } else if (r < 0.65) {
      const i = int(9);
      model.setPage({ index: i });
      trace.push(`go ${i}`);
    } else if (r < 0.75) {
      trace.push(`next from ${model.page!.index}`);
      model.setPage({ index: model.page!.index + 1 });
    } else if (r < 0.85) {
      const s = 2 + int(3);
      model.setPage({ size: s });
      trace.push(`size ${s}`);
    } else {
      if (rnd() < 0.5) n = int(14);
      const purge = rnd() < 0.2;
      model.invalidate(purge ? { purge: true } : undefined);
      trace.push(`${purge ? 'purge' : 'refresh'} n=${n}`);
    }
    for (const c of fake.calls.slice(callsBefore)) trace.push(`  -> ${c.name} ${JSON.stringify(c.req.page)}`);
    trace.push(`  shown ${ids().join(',')} page ${JSON.stringify(model.page)}`);
  }
  settle();
  // Twice: a refresh of a page found empty steps back to the page shown and keeps it as it was
  // (see the stale-after-refresh test below); the second refresh asks that page itself.
  model.invalidate();
  settle();
  model.invalidate();
  settle();
  const { index, size } = model.page!;
  expect(ids(), why('rows shown')).toEqual(data().slice(index * size, (index + 1) * size));
  if (n > 0) expect(ids().length, why('a page with rows shown')).toBeGreaterThan(0);
  // Rows follow: Next is offered. None follow: Next may be offered only when the server did not say
  // (a full page, inferred), and pressing it comes back to this page with Next gone.
  if ((index + 1) * size < n) expect(model.page!.hasNext, why('hasNext')).toBe(true);
  else if (model.page!.hasNext) {
    const shown = ids();
    model.setPage({ index: index + 1 });
    settle();
    expect([model.page!.index, ids(), model.page!.hasNext], why('Next past the end comes back')).toEqual([index, shown, false]);
  }

  model.setPage({ index: 0 });
  settle();
  const walked: string[] = [];
  let at = -1;
  for (let guard = 0; guard < 50; guard++) {
    if (model.page!.index !== at) walked.push(...ids());
    at = model.page!.index;
    if (!model.page!.hasNext) break;
    model.setPage({ index: model.page!.index + 1 });
    settle();
  }
  expect(walked, why('Next walks every row')).toEqual(data());
  model.destroy();
}

describe('source rows against a truthful server (first principles)', () => {
  for (const paging of ['offset', 'cursor'] as const) {
    it(`${paging}: 1 500 seeds, every row reachable, hasNext true to the data`, () => {
      for (let seed = 1; seed <= 1500; seed++) run(paging, seed);
    });
  }
});

describe('found by the truthful server', () => {
  const make = (paging: 'offset' | 'cursor') => {
    const fake = fakeSource();
    const model = sourceRows<R>(fake.source as DataSource<R>, { paging }).create({
      getRowId: (r) => r.id,
      columns: createColumnModel<R>([{ id: 'name' }]),
      ctx: localeCtx({ locale: 'en-US' }),
      page: { pageSize: 2 },
      operations: 'server',
    });
    const ids = () => Array.from({ length: model.displayed.count }, (_, i) => String(model.displayed.nodeAt(model.displayed.index(i)!).id));
    return { fake, model, ids };
  };
  // BUG (documented, fails today): a refresh whose page is found empty steps back to the page
  // shown and keeps its rows from before the refresh: a row deleted on the server stays on screen.
  for (const paging of ['offset', 'cursor'] as const) {
    it(`${paging}: a refresh never keeps rows from before it`, () => {
      const { fake, model, ids } = make(paging);
      fake.last().resolve({ rows: [{ id: 'r0', name: 'r0' }, { id: 'r1', name: 'r1' }], hasNext: true, nextCursor: '2' });
      model.setPage({ index: 1 });
      fake.last().reject(new Error('503'));
      // r1 is deleted on the server; the user presses refresh on the failed page.
      model.invalidate();
      fake.last().resolve({ rows: [], hasNext: false });
      // A fixed model asks page 0 again (a fourth call); answered with what the server now holds.
      if (fake.calls.length === 4) fake.last().resolve({ rows: [{ id: 'r0', name: 'r0' }], hasNext: false });
      expect(ids()).toEqual(['r0']);
    });
  }
});
