import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type ColumnDef, type DisplayIndex } from '@dzgrid/core';
import { buildSpanMap, type SpanInput, type SpanMap } from '@dzgrid/core/spans';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { cellsOf, rng } from './support/spans.js';

/**
 * Merged cells in a tree over 1 000 seeded trees, random opens, sorts and filters (1.1.0 step 15, spans.md « In a
 * tree »): every span's rows share one parent and one level; in the tree column no span holds a row with children;
 * no overlap, one owner per place; nothing reaches across a gap. Planted fault: the same oracle, run against a copy of
 * the engine without its level check, must fail.
 */
type R = { id: string; p: string | null; name: string; g: string; n: number };
const HERE = dirname(fileURLToPath(import.meta.url));

function randomTree(seed: number) {
  const r = rng(seed);
  const rows: R[] = [];
  const add = (p: string | null, depth: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = `${p ?? 'r'}.${i}`;
      rows.push({ id, p, name: r.pick(['a', 'a', 'b']), g: r.pick(['x', 'x', 'y', '']), n: r.int(3) });
      if (depth < 3 && r.next() < 0.4) add(id, depth + 1, 1 + r.int(4));
    }
  };
  add(null, 0, 1 + r.int(5));
  const treeCol = r.pick(['name', 'g']);
  const defs: ColumnDef<R>[] = [
    { id: 'name', ...(r.next() < 0.7 ? { merge: true as const } : { rowSpan: () => 1 + r.int(4) }) },
    { id: 'g', merge: true },
    { id: 'n', type: 'number', ...(r.next() < 0.5 && { rowSpan: () => 1 + r.int(3), colSpan: () => 1 + r.int(2) }) },
  ];
  const columns = createColumnModel<R>(defs);
  const model = clientRows<R>({ rows, getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (x) => x.p }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const parents = [...new Set(rows.map((x) => x.p).filter((x): x is string => !!x))];
  const opened = parents.filter(() => r.next() < 0.7);
  kernel.dispatch({ type: 'rows.expand', rows: opened.map((x) => dataKey(x)!), expanded: true }, 'user');
  if (r.next() < 0.5) kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: [{ column: 'n', dir: r.pick(['asc', 'desc'] as const) }] }) }, 'user');
  if (r.next() < 0.3) kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { g: { type: 'text', op: 'equals', value: 'x' } } }) }, 'user');
  const d = model.displayed as TreeRows<R>;
  const gaps = new Set(Array.from({ length: d.count }, (_, i) => i).filter((i) => i > 0 && r.next() < 0.1));
  const input: SpanInput<R> = { rows: d, columns, ctx: localeCtx({ locale: 'en-US' }), treeColumn: treeCol, apart: (i) => gaps.has(i) };
  return { d, input, treeCol, gaps };
}

/** What is wrong with a map, by hand from the rules (an empty list: nothing). */
function violations(m: SpanMap, t: ReturnType<typeof randomTree>): string[] {
  const { d, treeCol, gaps } = t;
  const out: string[] = [];
  const cols = ['name', 'g', 'n'];
  const tc = cols.indexOf(treeCol);
  const owner = Array.from({ length: d.count }, () => new Array<string | null>(3).fill(null));
  for (const s of cellsOf(m, d.count, 3)) {
    const at = (i: number) => i as DisplayIndex;
    for (let i = s.row; i < s.row + s.rows; i++) {
      if (i > s.row && d.levelAt(at(i)) !== d.levelAt(at(s.row))) out.push(`level ${s.row}+${s.rows}`);
      if (i > s.row && d.parentOf(d.keyAt(at(i))) !== d.parentOf(d.keyAt(at(s.row)))) out.push(`parent ${s.row}+${s.rows}`);
      if (i > s.row && gaps.has(i)) out.push(`gap ${i}`);
      if (s.rows > 1 && s.col <= tc && tc < s.col + s.cols && d.childrenAt(at(i)) !== 0) out.push(`tree parent ${i}`);
      for (let c = s.col; c < s.col + s.cols; c++) {
        if (owner[i]![c]) out.push(`overlap ${i},${c}`);
        owner[i]![c] = `${s.row},${s.col}`;
      }
    }
    if (s.cols > 1 && s.col <= tc && tc < s.col + s.cols) out.push(`colspan over tree ${s.row}`);
  }
  for (let i = 0; i < d.count; i++) for (let c = 0; c < 3; c++) {
    const o = m.ownerAt(i, c);
    if ((o ? `${o.row},${o.col}` : null) !== owner[i]![c]) out.push(`owner ${i},${c}`);
  }
  return out;
}

const SEEDS = Array.from({ length: 1000 }, (_, i) => 4242 + i * 13);

describe('spans in a tree: invariants over 1 000 seeded trees', () => {
  it('siblings only, leaves only in the tree column, no overlap, one owner, nothing across a gap', () => {
    const bad: string[] = [];
    for (const seed of SEEDS) {
      const t = randomTree(seed);
      const v = violations(buildSpanMap(t.input), t);
      if (v.length) bad.push(`seed ${seed}: ${v.slice(0, 3).join('; ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('planted fault: the engine without its level check fails the oracle', async () => {
    // A copy of map.ts, its imports made absolute, the level test removed; never written under src/.
    const src = resolve(HERE, '../src/spans');
    let code = readFileSync(join(src, 'map.ts'), 'utf8').replace(/from '(\.\.?\/[^']+)\.js'/g, (_, p: string) => `from '${resolve(src, p)}.ts'`);
    const cut = 'nodes[i + 1]!.level === nodes[i]!.level && ';
    expect(code.includes(cut)).toBe(true);
    code = code.replace(cut, '');
    const dir = join(HERE, '.planted');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `map-no-level-${process.pid}.ts`);
    writeFileSync(file, code);
    const mutant = (await import(/* @vite-ignore */ file).finally(() => rmSync(file))) as { buildSpanMap: typeof buildSpanMap };
    let caught = 0;
    for (const seed of SEEDS.slice(0, 200)) {
      const t = randomTree(seed);
      if (violations(mutant.buildSpanMap(t.input), t).length) caught++;
    }
    expect(caught).toBeGreaterThan(0);
  });
});
