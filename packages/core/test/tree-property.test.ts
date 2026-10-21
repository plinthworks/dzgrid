import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, groupKey, localeCtx, makeQuery } from '@dzgrid/core';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { mulberry32 } from './support/rng.js';
import { oracle, parentsOf, type TR } from './support/tree-oracle.js';

/**
 * 1 000 seeded random trees (orphans, cycles, self-parents included), given as each of the three
 * shapes (parent ids; nested children and paths after the repairs, paths with some rows dropped as
 * fillers, step 5) × random expansion, sort and
 * filter, against the recursive oracle (support/tree-oracle.ts): the same rows, levels, posinset and
 * setsize, in the same order; every match shown with all its ancestors and nothing else in
 * 'ancestors' mode; the user's set unchanged by a filter (tree-filter.md).
 */
const SEEDS = Number(process.env.TREE_SEEDS ?? 1000);

function randomTree(rnd: () => number): TR[] {
  const n = 1 + Math.floor(rnd() * 40);
  const rows: TR[] = [];
  for (let i = 0; i < n; i++) {
    const r = rnd();
    // Mostly a parent among the rows before; sometimes any row (cycles), a missing id, itself, none.
    const p = i > 0 && r < 0.55 ? `r${Math.floor(rnd() * i)}` : r < 0.65 ? `r${Math.floor(rnd() * n)}` : r < 0.7 ? 'gone' : r < 0.72 ? `r${i}` : undefined;
    rows.push({ id: `r${i}`, ...(p !== undefined && { p }), n: Math.floor(rnd() * 6) });
  }
  // Shuffled, so that a parent may come after its children.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}

type Shape = 'parent' | 'children' | 'path';
type In = TR & { kids?: In[]; path?: string[] };

/** The same random forest given as each shape: parent ids, nested children, paths (some rows dropped as fillers). */
function given(shape: Shape, rows: TR[], rnd: () => number) {
  const rep = parentsOf(rows);
  if (shape === 'parent') return { input: rows as In[], oracleRows: rows, fillers: new Set<string>(), key: (id: string) => dataKey(id)!, tree: { parentId: (r: In) => r.p } };
  // Nested and paths cannot say an orphan or a cycle: the forest after its repairs.
  const oracleRows = rows.map((r) => ({ id: r.id, n: r.n, p: rep.get(r.id) ?? null }));
  if (shape === 'children') {
    const node = new Map<string, In>(rows.map((r) => [r.id, { id: r.id, n: r.n, kids: [] }]));
    const roots: In[] = [];
    for (const r of rows) (rep.get(r.id) ? node.get(rep.get(r.id)!)!.kids! : roots).push(node.get(r.id)!);
    return { input: roots, oracleRows, fillers: new Set<string>(), key: (id: string) => dataKey(id)!, tree: { children: (r: In) => r.kids } };
  }
  const pathOf = (id: string): string[] => {
    const out: string[] = [];
    for (let x: string | null = id; x !== null; x = rep.get(x) ?? null) out.unshift(x);
    return out;
  };
  const parents = new Set([...rep.values()].filter((v) => v !== null));
  const fillers = new Set(rows.filter((r) => parents.has(r.id) && rnd() < 0.3).map((r) => r.id));
  const input = rows.filter((r) => !fillers.has(r.id)).map((r) => ({ id: r.id, n: r.n, path: pathOf(r.id) }));
  return { input, oracleRows, fillers, key: (id: string) => (fillers.has(id) ? groupKey(pathOf(id)) : dataKey(id)!), tree: { path: (r: In) => r.path! } };
}

describe('the tree against a recursive oracle', () => {
  for (const shape of ['parent', 'children', 'path'] as const) it(`agrees on ${SEEDS} seeded trees (${shape})`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = mulberry32(seed);
      const rows = randomTree(rnd);
      const g = given(shape, rows, rnd);
      const mode = rnd() < 0.3 ? 'subtree' : 'ancestors';
      const columns = createColumnModel<In>([{ id: 'n', type: 'number' }]);
      const model = clientRows<In>({ rows: g.input, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<In>({ ...g.tree, filter: mode }) });
      const kernel = createKernel<In>({ rows: model, columns });
      const idOf = new Map(rows.map((r) => [g.key(r.id) as string, r.id]));
      // Rows with children only: opening a leaf is a no-op (tree-view.md).
      const parentIds = new Set(parentsOf(rows).values());
      const open = new Set(rows.filter(() => rnd() < 0.5).map((r) => r.id).filter((id) => parentIds.has(id)));
      kernel.dispatch({ type: 'rows.expand', rows: [...open].map(g.key), expanded: true }, 'user');
      const sort = rnd() < 0.3 ? undefined : rnd() < 0.5 ? ('asc' as const) : ('desc' as const);
      const cut = Math.floor(rnd() * 6);
      const filtering = rnd() < 0.6;
      kernel.dispatch({ type: 'query.set', query: makeQuery({ ...(sort && { sort: [{ column: 'n', dir: sort }] }), ...(filtering && { filter: { n: { type: 'number', op: 'gte', value: cut } } }) }) }, 'user');
      const matches = filtering ? new Set(rows.filter((r) => r.n >= cut && !g.fillers.has(r.id)).map((r) => r.id)) : undefined;
      // Under a filter, a few toggles of its own layer.
      const layer = new Map<string, boolean>();
      if (filtering && rnd() < 0.5) {
        for (const r of rows) {
          if (rnd() < 0.2) {
            const want = rnd() < 0.5;
            kernel.dispatch({ type: 'rows.expand', rows: [g.key(r.id)], expanded: want }, 'user');
            layer.set(r.id, want);
          }
        }
      }
      const d = model.displayed as TreeRows<In>;
      const got = Array.from({ length: d.count }, (_, i) => {
        const at = d.index(i)!;
        return { id: idOf.get(d.keyAt(at))!, level: d.levelAt(at), pos: d.posAt(at), size: d.sizeAt(at) };
      });
      const want = oracle({ rows: g.oracleRows, ...(sort && { sort }), ...(matches && { matches }), mode, open, layer, fillers: g.fillers });
      expect(got, `seed ${seed}`).toEqual(want);
      // Fillers are never data: select-all's count leaves them out.
      if (!filtering) expect(d.dataCount, `seed ${seed}`).toBe(d.count - got.filter((r) => g.fillers.has(r.id)).length);
      // The user's set: what they opened, untouched by the filter and its layer.
      expect(new Set([...kernel.expansion].map((k) => idOf.get(k))), `seed ${seed}`).toEqual(open);
      // Clearing the filter shows the user's own tree again.
      if (filtering) {
        kernel.dispatch({ type: 'query.set', query: makeQuery(sort ? { sort: [{ column: 'n', dir: sort }] } : {}) }, 'user');
        const back = model.displayed as TreeRows<In>;
        const ids = Array.from({ length: back.count }, (_, i) => idOf.get(back.keyAt(back.index(i)!)));
        expect(ids, `seed ${seed} cleared`).toEqual(oracle({ rows: g.oracleRows, ...(sort && { sort }), open, fillers: g.fillers }).map((r) => r.id));
      }
    }
  });
});
