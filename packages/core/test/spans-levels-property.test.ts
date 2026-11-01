import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type ColumnDef, type DisplayIndex } from '@dzgrid/core';
import { buildSpanMap, type SpanInput, type SpanMap } from '@dzgrid/core/spans';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { cellsOf, rng } from './support/spans.js';

/**
 * Merges across levels (1.2.0, « étape 7 », spans.md « Across levels ») over 1 000 seeded trees: random depths, opens,
 * sorts, gaps, top-level rows always open or not, a tree column per row (or one for all). The oracle is written from
 * the data's parent ids (never the levels the engine reads): it predicts every merged cell of every column exactly.
 * Planted faults: the engine without its top-level guard, and without the tree column check on the lower row, must fail.
 */
type R = { id: string; p: string | null; a: string; b: string; c: string; n: number };
const HERE = dirname(fileURLToPath(import.meta.url));
const COLS = ['a', 'b', 'c'] as const;

function randomTree(seed: number) {
  const r = rng(seed);
  const rows: R[] = [];
  const v = () => r.pick(['x', 'x', 'x', 'y', '']);
  const add = (p: string | null, depth: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = `${p ?? 'r'}.${i}`;
      rows.push({ id, p, a: v(), b: v(), c: v(), n: r.int(3) });
      if (depth < 3 && r.next() < 0.45) add(id, depth + 1, 1 + r.int(4));
    }
  };
  add(null, 0, 1 + r.int(4));
  // The tree column: one for all (a string), or per row (`a` or `b`, never `c`).
  const pick = new Map(rows.map((x) => [x.id, r.pick(['a', 'b'] as const)]));
  const perRow = r.next() < 0.7;
  const treeColumn = perRow ? (x: R) => pick.get(x.id)! : r.pick(['a', 'b'] as const);
  const fixed = r.next() < 0.5;
  const columns = createColumnModel<R>(COLS.map((id): ColumnDef<R> => ({ id, merge: true })).concat({ id: 'n', type: 'number' }));
  const model = clientRows<R>({ rows, getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (x) => x.p, ...(fixed && { fixedOpen: (x: R) => x.p === null }) }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const parents = [...new Set(rows.map((x) => x.p).filter((x): x is string => !!x))];
  kernel.dispatch({ type: 'rows.expand', rows: parents.filter(() => r.next() < 0.75).map((x) => dataKey(x)!), expanded: true }, 'user');
  if (r.next() < 0.5) kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: r.pick(['asc', 'desc'] as const) }] }) }, 'user');
  const d = model.displayed as TreeRows<R>;
  const gaps = new Set(Array.from({ length: d.count }, (_, i) => i).filter((i) => i > 0 && r.next() < 0.08));
  const input: SpanInput<R> = { rows: d, columns, ctx: localeCtx({ locale: 'en-US' }), treeColumn, apart: (i) => gaps.has(i), acrossLevels: true };
  return { rows, d, input, treeColumn, gaps };
}

/** The merged cells expected, by hand from the rule, from parent ids. */
function expected(t: ReturnType<typeof randomTree>): { row: number; col: number; rows: number; cols: number }[] {
  const { rows, d, treeColumn, gaps } = t;
  const byId = new Map(rows.map((x) => [x.id, x]));
  const shown = Array.from({ length: d.count }, (_, i) => byId.get(String(d.keyAt(i as DisplayIndex)).replace(/^d:\d+:/, ''))!);
  const kids = new Set(rows.map((x) => x.p));
  const root = (x: R): string => (x.p === null ? x.id : root(byId.get(x.p)!));
  const tc = (x: R) => (typeof treeColumn === 'string' ? treeColumn : treeColumn(x));
  const link = (i: number, col: 'a' | 'b' | 'c'): boolean => {
    const x = shown[i]!;
    const y = shown[i + 1]!;
    if (gaps.has(i + 1) || x[col] === '' || x[col] !== y[col]) return false;
    const ox = tc(x) === col;
    const oy = tc(y) === col;
    if (ox || oy) return x.p === y.p && !(ox && kids.has(x.id)) && !(oy && kids.has(y.id));
    return x.p === y.p || (x.p !== null && y.p !== null && root(x) === root(y));
  };
  const out: { row: number; col: number; rows: number; cols: number }[] = [];
  COLS.forEach((col, c) => {
    for (let i = 0; i < shown.length; ) {
      let j = i;
      while (j + 1 < shown.length && link(j, col)) j++;
      if (j > i) out.push({ row: i, col: c, rows: j - i + 1, cols: 1 });
      i = j + 1;
    }
  });
  return out.sort((p, q) => p.row - q.row || p.col - q.col);
}

const SEEDS = Array.from({ length: 1000 }, (_, i) => 9001 + i * 17);
const diff = (m: SpanMap, t: ReturnType<typeof randomTree>) => {
  const got = JSON.stringify(cellsOf(m, t.d.count, 4));
  const want = JSON.stringify(expected(t));
  return got === want ? null : `got ${got} want ${want}`;
};

async function mutant(cut: string, by: string): Promise<typeof buildSpanMap> {
  // A copy of map.ts, its imports made absolute, one test changed; never written under src/.
  const src = resolve(HERE, '../src/spans');
  let code = readFileSync(join(src, 'map.ts'), 'utf8').replace(/from '(\.\.?\/[^']+)\.js'/g, (_, p: string) => `from '${resolve(src, p)}.ts'`);
  expect(code.includes(cut)).toBe(true);
  code = code.replace(cut, by);
  const dir = join(HERE, '.planted');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `map-levels-${process.pid}-${cut.length}.ts`);
  writeFileSync(file, code);
  return ((await import(/* @vite-ignore */ file).finally(() => rmSync(file))) as { buildSpanMap: typeof buildSpanMap }).buildSpanMap;
}

describe('merges across levels: the exact cells over 1 000 seeded trees', () => {
  it('match the oracle', () => {
    const bad: string[] = [];
    let across = 0;
    for (const seed of SEEDS) {
      const t = randomTree(seed);
      const m = buildSpanMap(t.input);
      const e = diff(m, t);
      if (e) bad.push(`seed ${seed}: ${e}`);
      // The trees do reach the new case: some block holds two levels.
      across += cellsOf(m, t.d.count, 4).some((s) => s.rows > 1 && new Set(Array.from({ length: s.rows }, (_, k) => t.d.levelAt((s.row + k) as DisplayIndex))).size > 1) ? 1 : 0;
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(across).toBeGreaterThan(100);
  });

  it('planted fault: without the top-level guard, the oracle catches it', async () => {
    const build = await mutant('lv(i) > 0 && lv(j) > 0', 'true');
    expect(SEEDS.slice(0, 300).filter((s) => { const t = randomTree(s); return diff(build(t.input), t); }).length).toBeGreaterThan(0);
  });

  it('planted fault: without the lower row’s own tree column, the oracle catches it', async () => {
    const build = await mutant('!(b && lone(j))', 'true');
    expect(SEEDS.slice(0, 300).filter((s) => { const t = randomTree(s); return diff(build(t.input), t); }).length).toBeGreaterThan(0);
  });
});
