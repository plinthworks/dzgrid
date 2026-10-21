// The million-row tree (Phase 4 step 6): rows given by parent ids, about ten levels, mixed widths —
// most parents with a few children, some with tens, a rare one with hundreds, many leaves. Seeded: the
// same rows on every run and every machine. Shared by the Node bench (perf/bench-entry.ts), the browser
// bench (packages/dom/test/browser/perf-tree.ts) and the playground (playground/tree.html?rows=1000000).
import { rng } from '../dataset.js';

export interface TreeRow {
  readonly id: string;
  readonly parent: string | null;
  readonly name: string;
  /** 0–999, for a number filter. */
  readonly n: number;
  /** Its level (0: a root), for the checks. */
  readonly level: number;
}

/** How many children a row has: 35 % none, 55 % 1–6, 9.5 % 5–14, 0.5 % 100–199 (mean ≈ 3.6). */
function width(r: () => number): number {
  const x = r();
  if (x < 0.35) return 0;
  if (x < 0.9) return 1 + Math.floor(r() * 6);
  if (x < 0.995) return 5 + Math.floor(r() * 10);
  return 100 + Math.floor(r() * 100);
}

/**
 * `count` rows (1 000 000 by default), breadth first from 10 roots: each row's children follow in the
 * order their parents were made, up to level 9 (ten levels); the generation stops at `count` rows.
 */
export function treeProfile(count = 1_000_000, seed = 6): TreeRow[] {
  const r = rng(seed);
  const rows: TreeRow[] = new Array(count);
  let made = 0;
  const add = (parent: TreeRow | null): void => {
    const i = made++;
    const level = parent ? parent.level + 1 : 0;
    rows[i] = { id: `t${i}`, parent: parent ? parent.id : null, name: `${level ? 'Node' : 'Root'} ${i}`, n: Math.floor(r() * 1000), level };
  };
  for (let i = 0; i < 10 && made < count; i++) add(null);
  // Breadth first: row `next` gets its children now (none past level 9).
  for (let next = 0; next < made && made < count; next++) {
    const p = rows[next]!;
    const k = p.level >= 9 ? 0 : width(r);
    for (let j = 0; j < k && made < count; j++) add(p);
  }
  rows.length = made;
  return rows;
}
