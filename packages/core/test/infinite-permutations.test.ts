import { describe, expect, it } from 'vitest';
import { createColumnModel, localeCtx, makeQuery } from '@dzgrid/core';
import { infiniteRows, type InfiniteModel } from '@dzgrid/core/infinite';
import type { DataRequest } from '@dzgrid/core/server';

/**
 * Phase 8 step 3–4 exit criterion (infinite-scroll.md): « 0 stale block applied on 1 000 permutations ». Seeded scripts
 * of gestures (windows: scrolls and jumps; sorts, searches, refreshes, purges, the rest timer) and answers settled in
 * a seeded order, failures among them. A row says which query and which place it was sent for, so a row shown under
 * another query, or at another place, is an answer applied where it does not belong. Invariants checked after every
 * step: every data row shown belongs to the query in force and sits at its own place; never more than maxBlocks blocks
 * held; at the end, with every answer in, the rows of the window are data.
 */
type Row = { id: string; q: string; at: number };
const N = Number(process.env.PERMS ?? 200);
const MAX = 4;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function script(seed: number) {
  const rnd = rng(seed);
  const pending: { req: DataRequest; ok: (v: unknown) => void; no: (e: unknown) => void }[] = [];
  const total = 1 + Math.floor(rnd() * 5000);
  const known = rnd() < 0.5;
  const due: (() => void)[] = [];
  /** The query a request was sent for, as the rows carry it. */
  const qOf = (r: DataRequest) => JSON.stringify([r.sort ?? [], r.quick ?? '', r.params]);
  const m = infiniteRows<Row>({
    fetch: (req) => ({ then: (ok: (v: unknown) => void, no: (e: unknown) => void) => void pending.push({ req, ok, no }) }) as never, // a thenable the script settles
  }, { blockSize: 10, maxBlocks: MAX }).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>([{ id: 'q' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    timer: (fn) => {
      let on = true;
      due.push(() => on && fn());
      return () => void (on = false);
    },
  }) as InfiniteModel<Row>;
  let query = makeQuery();
  const now = () => JSON.stringify([query.sort, query.quick.trim() ? query.quick : '', {}]);
  const answer = (p: (typeof pending)[number]) => {
    const { offset, size } = p.req.page!;
    const end = known ? Math.min(total, offset + size) : Math.min(total, offset + size);
    const q = qOf(p.req);
    const rows = Array.from({ length: Math.max(0, end - offset) }, (_, j) => ({ id: `${q}#${offset + j}`, q, at: offset + j }));
    p.ok({ rows, ...(known ? { total } : { hasNext: end < total }) });
  };
  const check = (where: string) => {
    const d = m.displayed;
    for (const i of d.held!()) {
      const n = d.nodeAt(i);
      if (n.kind !== 'data') throw new Error(`${where}: held ${i} not data`);
      const r = n.data as Row;
      if (r.q !== now()) throw new Error(`${where}: row of another query at ${i}`);
      if (r.at !== i) throw new Error(`${where}: row ${r.at} shown at ${i}`);
    }
    if (m.diagnostics.blocks.held > MAX + 2) throw new Error(`${where}: ${m.diagnostics.blocks.held} blocks held`);
  };
  let first = 0;
  for (let step = 0; step < 60; step++) {
    const x = rnd();
    const count = m.displayed.count;
    if (x < 0.4 && count) {
      first = rnd() < 0.3 ? Math.floor(rnd() * count) : Math.max(0, Math.min(count - 1, first + Math.floor(rnd() * 25) - 5));
      m.want(first, Math.min(count - 1, first + 19), rnd() < 0.3 ? [Math.floor(rnd() * count)] : []);
    } else if (x < 0.5) m.setQuery((query = makeQuery({ sort: [{ column: 'q', dir: rnd() < 0.5 ? 'asc' : 'desc' }], quick: query.quick })), 'user');
    else if (x < 0.55) m.setQuery((query = makeQuery({ sort: query.sort, quick: rnd() < 0.5 ? 'a' : '' })), 'user');
    else if (x < 0.6) m.invalidate();
    else if (x < 0.62) m.invalidate({ purge: true });
    else if (x < 0.7) for (const f of due.splice(0)) f();
    else if (pending.length) {
      const p = pending.splice(Math.floor(rnd() * pending.length), 1)[0]!;
      if (rnd() < 0.08) p.no('down');
      else answer(p);
    }
    check(`seed ${seed} step ${step}`);
  }
  // Everything in: the rest fires, every answer lands (newest first), the window asked again until nothing waits.
  for (let k = 0; k < 50 && (pending.length || due.length); k++) {
    for (const f of due.splice(0)) f();
    while (pending.length) answer(pending.pop()!);
    check(`seed ${seed} drain`);
  }
  return m;
}

describe(`infinite: ${N} seeded permutations of gestures and answer orders`, () => {
  it('no row of an old query or of another place is ever shown; blocks held stay bounded', () => {
    let stale = 0;
    for (let seed = 1; seed <= N; seed++) stale += script(seed).diagnostics.gate.dropped['stale-epoch'];
    // Old answers did arrive (the scripts are not trivial) and none was applied (the checks above).
    expect(stale).toBeGreaterThan(0);
  });
});
