// Phase 5 step 7, saves answered in every order (step07-plan.md « Tests first » 9; edit-save.md 4–5, 6–14): six
// gestures over three cells, each cell's saves one at a time; every order of the six answers (720), then 280 random
// orders with random outcomes (saved, a reason, a network cut, some cells named). After each answer and its paint,
// each cell's text, marks and description equal the oracle (support/edit-dom-oracle.ts): 0 stale mark, 0 stale value.
// `npm run test:perm` runs them all; test:ci a sample (60 orders, 20 random sets).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { cleanup, ed, k, rowsOf, type R } from './support-editors.js';
import { EditDomOracle, col, idOfCell } from './support/edit-dom-oracle.js';

afterEach(cleanup);

const FULL = Number(process.env['PERMS'] ?? 0) >= 1000;
const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true },
  { id: 'q', header: 'Price', type: 'number', width: 80, editable: true },
];
const T = EN_EDIT.text as unknown as Record<string, string>;
const fill = (s: string, p: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, x: string) => p[x] ?? '');
const HEAD: Record<string, string> = { n: 'Stock', q: 'Price' };
const WORDS = {
  header: (c: string) => HEAD[c]!,
  code: (_c: string, code: string) => T[`validation.${code}`]!,
  unknown: T['edit.reasonUnknown']!,
  network: T['edit.reasonNetwork']!,
  failed: (reason: string) => fill(T['edit.failedMark']!, { reason }),
  saveRefused: (c: string, reason: string) => fill(T['edit.saveRefused']!, { column: HEAD[c]!, reason }),
  refused: () => '',
  dropped: () => '',
  removed: '',
};
/** The six gestures: cell and value (each cell twice; one gesture of two cells). */
const GESTURES: [string, number][][] = [[['r1.n', 11]], [['r2.n', 22], ['r3.q', 33]], [['r3.q', 34]], [['r1.n', 12]], [['r2.n', 23]], [['r1.n', 13], ['r2.n', 24]]];
type Outcome = 'ok' | 'reason' | 'net' | 'named';

function permutations(n: number): number[][] {
  if (n === 1) return [[0]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

async function run(order: number[], outcome: (g: number) => Outcome, gaps: () => number): Promise<string[]> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const held: { req: SaveRequest<R>; ok(): void; no(e: unknown): void; done: boolean }[] = [];
  const save = (req: SaveRequest<R>) => new Promise<void>((ok, no) => void held.push({ req, ok: () => ok(), no, done: false }));
  const t = ed({ columns: COLS, rows: rowsOf(10), save });
  const src = (cell: string) => {
    const node = t.g.kernel.rows.row(k(idOfCell(cell)));
    return node ? { v: (node.data as Record<string, unknown>)[col(cell)], tok: 1 } : undefined;
  };
  const o = new EditDomOracle(src, true, WORDS);
  const errors: string[] = [];
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const check = (when: string) => {
    o.idle();
    for (const cell of ['r1.n', 'r2.n', 'r3.q']) {
      const el = t.cell(idOfCell(cell), col(cell))!;
      const v = o.value(cell);
      const text = v === null || v === undefined ? '' : String(v);
      if (el.textContent !== text) errors.push(`${order} ${when}: ${cell} text "${el.textContent}" want "${text}"`);
      const got = [...el.classList].filter((x) => x.startsWith('dzg-cell--')).map((x) => x.slice(10)).sort().join(' ');
      if (got !== o.tokens(cell)) errors.push(`${order} ${when}: ${cell} marks "${got}" want "${o.tokens(cell)}"`);
      const d = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)?.textContent ?? '').join('|');
      if (d !== o.desc(cell, T['edit.saving']!)) errors.push(`${order} ${when}: ${cell} described "${d}" want "${o.desc(cell, T['edit.saving']!)}"`);
    }
  };
  // The six gestures, at once.
  for (const g of GESTURES) {
    t.api.commit(g.map(([c, v]) => ({ key: k(idOfCell(c)), column: col(c), input: { value: v } })));
    o.commit(g.map(([c, v]) => [c, v]));
  }
  await flush();
  check('staged');
  // Answer them: each time the first gesture of `order` that is in flight.
  for (let n = 0; n < GESTURES.length && !errors.length; n++) {
    const gi = order.find((x) => held.some((h, i) => !h.done && sameReq(h.req, GESTURES[x]!, o.core.sent[i]!.changes)))!;
    const i = held.findIndex((h, j) => !h.done && sameReq(h.req, GESTURES[gi]!, o.core.sent[j]!.changes));
    if (i < 0) break;
    const h = held[i]!;
    h.done = true;
    const cells = h.req.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}.${c.column}`);
    const out = outcome(gi);
    const refused = new Map<string, { why: string | null; code: string | null; net: boolean }>();
    if (out === 'ok') h.ok();
    else if (out === 'named') {
      refused.set(cells[0]!, { why: 'part', code: null, net: false });
      h.no({ cells: [{ key: idOfCell(cells[0]!), column: col(cells[0]!), reason: 'part' }] });
    } else {
      for (const c of cells) refused.set(c, { why: out === 'reason' ? 'no' : null, code: null, net: out === 'net' });
      h.no(out === 'reason' ? { reason: 'no' } : new TypeError('Failed to fetch'));
    }
    await flush();
    o.settle(i, refused, () => true);
    check(`answer ${gi} ${out}`);
    const gap = gaps();
    vi.advanceTimersByTime(gap);
    o.now += gap;
    check(`+${gap} ms`);
  }
  vi.advanceTimersByTime(6000);
  o.now += 6000;
  check('at rest');
  if (held.some((h) => !h.done) && !errors.length) errors.push(`${order}: a request never answered`);
  cleanup();
  return errors;
}
/** A held request is the one of a gesture: the same cells and values (its generation is the grid's). */
function sameReq(req: SaveRequest<R>, g: [string, number][], sent: [string, unknown, unknown][]): boolean {
  const a = req.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}.${c.column}=${String(c.value)}`).join(',');
  return a === g.map(([c, v]) => `${c}=${v}`).join(',') && a === sent.map(([c, v]) => `${c}=${String(v)}`).join(',');
}

describe('saves answered in every order', () => {
  it(`${FULL ? 720 : 60} orders of the six answers (gestures 1 and 4 refused, 2 a network cut): 0 stale mark, 0 stale value`, async () => {
    const all = permutations(6);
    const errors: string[] = [];
    const list = FULL ? all : all.filter((_, i) => i % 12 === 0);
    for (const p of list) {
      if (errors.length) break;
      errors.push(...(await run(p, (g) => (g === 1 || g === 4 ? 'reason' : g === 2 ? 'net' : 'ok'), () => 100)));
    }
    expect(errors).toEqual([]);
  }, 600_000);

  it(`${FULL ? 280 : 20} random orders and outcomes, with time between answers`, async () => {
    const errors: string[] = [];
    for (let s = 1; s <= (FULL ? 280 : 20) && !errors.length; s++) {
      const r = rng(s * 7919);
      const order = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5);
      const outs: Outcome[] = order.map(() => (['ok', 'reason', 'net', 'named'] as const)[Math.floor(r() * 4)]!);
      errors.push(...(await run(order, (g) => outs[g]!, () => [0, 100, 499, 500, 1000, 1500, 5000][Math.floor(r() * 7)]!)));
    }
    expect(errors).toEqual([]);
  }, 600_000);
});
