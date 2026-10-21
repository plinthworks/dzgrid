import { describe, it, expect } from 'vitest';
import { makeQuery, type RowKey, type SortItem } from '@dzgrid/core';
import type { TreeRows } from '@dzgrid/core/tree';
import { mulberry32 } from './support/rng.js';
import { flush, k, setupA, type LR } from './support/lazy.js';
import { setupB } from './support/lazy-server.js';

/**
 * Lazy children under every ordering (Phase 4 step 7, exit criterion « lazy children 1 000
 * permutations 0 stale »; docs/behaviors/tree-lazy.md). Seeded walks, half with the host's loader
 * (A), half with a server's children through the gate (B): opens, collapses, query changes, answers
 * and failures settled in random order, retries, refreshes, new rows. After each step:
 * - no stale answer applied: a request answered after it was aborted never puts a row in the grid;
 *   one answered while live does;
 * - the loading and error rows are exactly where they should be: right under an open parent that
 *   holds no child, one level down; loading ⇔ one live request for it; failed ⇔ none, its last
 *   request failed;
 * - no leaked request: every live request has its loading row shown; started = answered + failed +
 *   aborted + live; at the end, every request answered or aborted;
 * - the expansion is the user's: opened and closed rows, less the rows gone, emptied by a new epoch.
 */
const SEEDS = Number(process.env['LAZY_PERMS'] ?? 1000);
const STEPS = 40;

interface Q { parent: string; signal: { aborted: boolean }; resolve(v: unknown): void; reject(e: unknown): void; settled: boolean; ok?: boolean; stale?: boolean; ids: string[]; no: number }

const idOf = (key: RowKey): string => String(key).replace(/^d:\d+:/, '');
const ROOTS: LR[] = [{ id: 'r0', n: 0, lazy: true }, { id: 'r1', n: 1, lazy: true }, { id: 'r2', n: 2, lazy: true }, { id: 'r3', n: 3 }, { id: 'r3a', p: 'r3', n: 4, lazy: true }];

async function walk(seed: number): Promise<{ fail: string[]; requests: number; stale: number; failed: number }> {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
  const server = seed % 2 === 1;
  const reqs: Q[] = [];
  const fail: string[] = [];
  const s = server ? setupB() : setupA({ rows: ROOTS });
  // The requests, whichever way they come: the host's loader (A) or the server's children (B).
  if (server) {
    const b = s as ReturnType<typeof setupB>;
    const seen = new Set<object>();
    const grab = () => {
      for (const r of b.kids) if (!seen.has(r)) seen.add(r), reqs.push({ parent: idOf(r.req.parent), signal: r.req.signal, resolve: r.resolve, reject: r.reject, settled: false, ids: [], no: reqs.length });
    };
    (s as { grab?: () => void }).grab = grab;
  } else {
    const a = s as ReturnType<typeof setupA>;
    const seen = new Set<object>();
    (s as { grab?: () => void }).grab = () => {
      for (const r of a.loads) if (!seen.has(r)) seen.add(r), reqs.push({ parent: r.row.id, signal: r.signal, resolve: r.resolve, reject: r.reject, settled: false, ids: [], no: reqs.length });
    };
  }
  const grab = (s as unknown as { grab: () => void }).grab;
  const fetches = server ? (s as ReturnType<typeof setupB>).fetches : [];
  let fetchSeen = 0;
  const pendingFetches: typeof fetches = [];
  const oracle = new Set<string>();
  let filtered = false;
  let sort: SortItem[] = [];
  const d = () => s.model.displayed as TreeRows<LR>;
  const live = () => reqs.filter((r) => !r.settled && !r.signal.aborted);

  const check = (step: string) => {
    const t = d();
    // Stale answers never applied; live ones applied (checked right after their answer, below).
    for (const r of reqs) if (r.stale && r.ok) for (const id of r.ids) if (s.model.row(k(id))) fail.push(`${step}: stale row ${id} applied`);
    // Loading and error rows.
    const places = new Map<string, boolean>();
    for (let i = 0; i < t.count; i++) {
      const at = t.index(i)!;
      const node = t.nodeAt(at);
      if (node.kind !== 'loading') continue;
      const p = idOf(node.parent);
      places.set(p, node.failed);
      const pi = t.indexOf(node.parent);
      if (pi !== i - 1) fail.push(`${step}: loading row of ${p} at ${i}, its parent at ${pi}`);
      else {
        const pa = t.index(pi)!;
        if (!t.expandedAt(pa)) fail.push(`${step}: loading row under ${p} closed`);
        if (t.kidsOf(node.parent) !== 0) fail.push(`${step}: loading row under ${p} that holds children`);
        if (node.level !== t.levelAt(pa) + 1) fail.push(`${step}: loading row of ${p} at level ${node.level}`);
      }
      const mine = live().filter((r) => r.parent === p);
      if (!node.failed && mine.length !== 1) fail.push(`${step}: loading row of ${p} with ${mine.length} live requests`);
      if (node.failed) {
        const last = reqs.filter((r) => r.parent === p).at(-1);
        if (mine.length) fail.push(`${step}: error row of ${p} with a live request`);
        if (!last || last.ok !== false || last.stale) fail.push(`${step}: error row of ${p} whose last request did not fail`);
      }
    }
    // No leaked request: each live one has its loading row shown, one per parent.
    const per = new Map<string, number>();
    for (const r of live()) {
      per.set(r.parent, (per.get(r.parent) ?? 0) + 1);
      if (places.get(r.parent) !== false) fail.push(`${step}: live request ${r.no} for ${r.parent} without its loading row`);
    }
    for (const [p, n] of per) if (n > 1) fail.push(`${step}: ${n} live requests for ${p}`);
    const dg = s.shape.lazy.diagnostics;
    if (dg.started !== dg.answered + dg.failed + dg.aborted + dg.live) fail.push(`${step}: diagnostics ${JSON.stringify(dg)}`);
    if (dg.live !== live().length) fail.push(`${step}: ${dg.live} live by the controller, ${live().length} by the test`);
    if (dg.started !== reqs.length) fail.push(`${step}: ${dg.started} started, ${reqs.length} seen`);
    // The expansion: the user's, less the rows gone.
    for (const id of [...oracle]) if (!s.model.row(k(id))) oracle.delete(id);
    const ex = [...(s.model.expansion ?? [])].map(idOf).sort().join(',');
    if (ex !== [...oracle].sort().join(',')) fail.push(`${step}: expansion ${ex}, expected ${[...oracle].sort().join(',')}`);
  };

  const shownData = (): string[] => {
    const t = d();
    const out: string[] = [];
    for (let i = 0; i < t.count; i++) {
      const n = t.nodeAt(t.index(i)!);
      if (n.kind === 'data') out.push(n.id as string);
    }
    return out;
  };

  for (let step = 0; step < STEPS && fail.length === 0; step++) {
    for (; fetchSeen < fetches.length; fetchSeen++) pendingFetches.push(fetches[fetchSeen]!);
    const r = rnd();
    let did = '';
    if (server && pendingFetches.length && (r < 0.15 || d().count === 0)) {
      // The roots answer, in any order; only the last request of the epoch counts.
      const i = Math.floor(rnd() * pendingFetches.length);
      const f = pendingFetches.splice(i, 1)[0]!;
      f.resolve({ rows: ROOTS, total: ROOTS.length });
      did = `roots ${i}`;
    } else if (r < 0.4) {
      const id = pick(shownData());
      if (id) {
        const told = () => s.events.filter((e) => e.type === 'rowExpanded').length;
        const was = told();
        const res = s.kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: true }, 'user');
        if (res.ok && told() > was && !filtered) oracle.add(id);
        did = `open ${id}`;
      }
    } else if (r < 0.55) {
      const id = pick(shownData().filter((x) => s.model.isExpanded!(k(x))));
      if (id) {
        const was = s.events.length;
        s.kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: false }, 'user');
        // A leaf (answered empty) keeps its key: closing it is a no-op (tree-view.md).
        if (!filtered && s.events.slice(was).some((e) => e.type === 'rowExpanded')) oracle.delete(id);
        did = `close ${id}`;
      }
    } else if (r < 0.8) {
      const q = pick(reqs.filter((x) => !x.settled));
      if (q) {
        q.settled = true;
        q.stale = q.signal.aborted;
        if (rnd() < 0.7) {
          q.ok = true;
          const n = Math.floor(rnd() * 4);
          const depth = q.parent.split('.').length;
          const rows: LR[] = Array.from({ length: n }, (_, i) => ({ id: `${q.parent}.${q.no}.${i}`, p: q.parent, n: Math.floor(rnd() * 5), lazy: depth < 4 && i % 2 === 0 }));
          q.ids = rows.map((x) => x.id);
          if (rnd() < 0.5) q.resolve(rows);
          else q.resolve({ rows });
        } else {
          q.ok = false;
          q.reject(new Error('down'));
        }
        did = `answer ${q.no} ${q.ok ? 'ok' : 'fail'}${q.stale ? ' stale' : ''}`;
        await flush();
        if (q.ok && !q.stale) for (const id of q.ids) if (!s.model.row(k(id))) fail.push(`step ${step} ${did}: live answer not applied (${id})`);
      }
    } else if (r < 0.87) {
      const t = d();
      const failed: RowKey[] = [];
      for (let i = 0; i < t.count; i++) {
        const n = t.nodeAt(t.index(i)!);
        if (n.kind === 'loading' && n.failed) failed.push(n.parent);
      }
      const p = pick(failed);
      if (p) {
        s.shape.lazy.retry(p);
        did = `retry ${idOf(p)}`;
      }
    } else if (r < 0.93) {
      if (server) {
        // A new epoch: every row closed.
        sort = sort.length ? [] : [{ column: 'n', dir: rnd() < 0.5 ? 'asc' : 'desc' }];
        s.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort }) }, 'user');
        oracle.clear();
        did = 'epoch';
      } else {
        filtered = !filtered;
        s.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: filtered ? { n: { type: 'number', op: 'gt', value: 0 } } : {} }) }, 'user');
        did = filtered ? 'filter' : 'unfilter';
      }
    } else if (r < 0.97) {
      s.kernel.dispatch({ type: 'rows.refresh' }, 'user');
      did = 'refresh';
    } else if (!server) {
      (s as ReturnType<typeof setupA>).model.setRows(ROOTS);
      did = 'setRows';
    }
    grab();
    await flush();
    grab();
    check(`seed ${seed} step ${step} ${did}`);
  }
  // The end: every live request answered; nothing left running, every request answered or aborted.
  for (let round = 0; round < 6 && live().length; round++) {
    for (const q of live()) {
      q.settled = true;
      q.ok = true;
      q.resolve([]);
    }
    await flush();
    grab();
  }
  if (fail.length === 0) check(`seed ${seed} end`);
  if (live().length) fail.push(`seed ${seed}: ${live().length} requests still live at the end`);
  for (const q of reqs) if (!q.settled && !q.signal.aborted) fail.push(`seed ${seed}: request ${q.no} neither answered nor aborted`);
  s.model.destroy();
  return { fail, requests: reqs.length, stale: reqs.filter((q) => q.stale).length, failed: reqs.filter((q) => q.ok === false).length };
}

describe(`lazy children: ${SEEDS} seeded orderings`, () => {
  it('0 stale applied, loading and error rows right, no leaked request, the expansion the user\'s', async () => {
    const failures: string[] = [];
    const seen = { requests: 0, stale: 0, failed: 0 };
    for (let seed = 1; seed <= SEEDS && failures.length < 5; seed++) {
      const r = await walk(seed);
      failures.push(...r.fail);
      seen.requests += r.requests;
      seen.stale += r.stale;
      seen.failed += r.failed;
    }
    expect(failures).toEqual([]);
    // The walks reach what they test: many requests, answers after an abort, failures.
    expect(seen.requests).toBeGreaterThan(SEEDS * 3);
    expect(seen.stale).toBeGreaterThan(SEEDS / 4);
    expect(seen.failed).toBeGreaterThan(SEEDS / 4);
  }, 120_000);
});
