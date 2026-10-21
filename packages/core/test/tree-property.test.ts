import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery } from '@dzgrid/core';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { mulberry32 } from './support/rng.js';
import { oracle, parentsOf, type TR } from './support/tree-oracle.js';

/**
 * 1 000 seeded random trees (orphans, cycles, self-parents included) × random expansion, sort and
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

describe('the tree against a recursive oracle', () => {
  it(`agrees on ${SEEDS} seeded trees`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = mulberry32(seed);
      const rows = randomTree(rnd);
      const mode = rnd() < 0.3 ? 'subtree' : 'ancestors';
      const columns = createColumnModel<TR>([{ id: 'n', type: 'number' }]);
      const model = clientRows<TR>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<TR>({ parentId: (r) => r.p, filter: mode }) });
      const kernel = createKernel<TR>({ rows: model, columns });
      // Rows with children only: opening a leaf is a no-op (tree-view.md).
      const parentIds = new Set(parentsOf(rows).values());
      const open = new Set(rows.filter(() => rnd() < 0.5).map((r) => r.id).filter((id) => parentIds.has(id)));
      kernel.dispatch({ type: 'rows.expand', rows: [...open].map((id) => dataKey(id)!), expanded: true }, 'user');
      const sort = rnd() < 0.3 ? undefined : rnd() < 0.5 ? ('asc' as const) : ('desc' as const);
      const cut = Math.floor(rnd() * 6);
      const filtering = rnd() < 0.6;
      kernel.dispatch({ type: 'query.set', query: makeQuery({ ...(sort && { sort: [{ column: 'n', dir: sort }] }), ...(filtering && { filter: { n: { type: 'number', op: 'gte', value: cut } } }) }) }, 'user');
      const matches = filtering ? new Set(rows.filter((r) => r.n >= cut).map((r) => r.id)) : undefined;
      // Under a filter, a few toggles of its own layer.
      const layer = new Map<string, boolean>();
      if (filtering && rnd() < 0.5) {
        for (const r of rows) {
          if (rnd() < 0.2) {
            const want = rnd() < 0.5;
            kernel.dispatch({ type: 'rows.expand', rows: [dataKey(r.id)!], expanded: want }, 'user');
            layer.set(r.id, want);
          }
        }
      }
      const d = model.displayed as TreeRows<TR>;
      const got = Array.from({ length: d.count }, (_, i) => {
        const at = d.index(i)!;
        return { id: String((d.nodeAt(at) as { id: unknown }).id), level: d.levelAt(at), pos: d.posAt(at), size: d.sizeAt(at) };
      });
      const want = oracle({ rows, ...(sort && { sort }), ...(matches && { matches }), mode, open, layer });
      expect(got, `seed ${seed}`).toEqual(want);
      // The user's set: what they opened, untouched by the filter and its layer.
      expect(new Set([...kernel.expansion].map((k) => k.slice(k.indexOf(':', 2) + 1))), `seed ${seed}`).toEqual(open);
      // Clearing the filter shows the user's own tree again.
      if (filtering) {
        kernel.dispatch({ type: 'query.set', query: makeQuery(sort ? { sort: [{ column: 'n', dir: sort }] } : {}) }, 'user');
        const back = model.displayed as TreeRows<TR>;
        const ids = Array.from({ length: back.count }, (_, i) => String((back.nodeAt(back.index(i)!) as { id: unknown }).id));
        expect(ids, `seed ${seed} cleared`).toEqual(oracle({ rows, ...(sort && { sort }), open }).map((r) => r.id));
      }
    }
  });
});
