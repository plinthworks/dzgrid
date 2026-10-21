/**
 * A tree shown the slow, obvious way (step 3's oracle), written by hand from the sheets
 * (tree-view.md, tree-filter.md), sharing no code with `@dzgrid/core/tree`: recursion, arrays,
 * no caches. Rows carry `id` and `p` (the parent id, absent for a root).
 */
export type TR = { id: string; p?: string | null; n: number };

export interface OracleInput {
  readonly rows: readonly TR[];
  /** Ids, ascending by `n` then by position when true; the source order otherwise. */
  readonly sort?: 'asc' | 'desc';
  /** Ids that match; absent: no filter. */
  readonly matches?: ReadonlySet<string>;
  readonly mode?: 'ancestors' | 'subtree';
  /** Open ids (the user's). */
  readonly open: ReadonlySet<string>;
  /** Under a filter: toggles made meanwhile. */
  readonly layer?: ReadonlyMap<string, boolean>;
}

export interface OracleRow { id: string; level: number; pos: number; size: number }

/** Parent of each row after the repair rules: an unknown parent or a cycle makes a root. */
export function parentsOf(rows: readonly TR[]): Map<string, string | null> {
  const ids = new Set(rows.map((r) => r.id));
  const parent = new Map<string, string | null>();
  for (const r of rows) parent.set(r.id, r.p && ids.has(r.p) ? r.p : null);
  // A cycle: its first row in the given order becomes a root, until none is left.
  const index = new Map(rows.map((r, i) => [r.id, i]));
  for (;;) {
    let broken = false;
    for (const r of rows) {
      const seen: string[] = [];
      let x: string | null = r.id;
      while (x !== null && !seen.includes(x)) {
        seen.push(x);
        x = parent.get(x)!;
      }
      if (x !== null) {
        const cycle = seen.slice(seen.indexOf(x));
        const first = cycle.reduce((a, b) => (index.get(a)! <= index.get(b)! ? a : b));
        parent.set(first, null);
        broken = true;
        break;
      }
    }
    if (!broken) return parent;
  }
}

export function oracle(i: OracleInput): OracleRow[] {
  const parent = parentsOf(i.rows);
  const ordered = i.rows.map((r, at) => ({ r, at }));
  if (i.sort) ordered.sort((a, b) => (i.sort === 'asc' ? a.r.n - b.r.n : b.r.n - a.r.n) || a.at - b.at);
  const childrenOf = (id: string | null) => ordered.filter((o) => parent.get(o.r.id) === id).map((o) => o.r.id);
  const filtering = i.matches !== undefined;
  const matchBelow = (id: string): boolean => childrenOf(id).some((c) => i.matches!.has(c) || matchBelow(c));
  const ancestorMatched = (id: string): boolean => {
    const p = parent.get(id) ?? null;
    return p !== null && (i.matches!.has(p) || ancestorMatched(p));
  };
  const shown = (id: string): boolean => !filtering || i.matches!.has(id) || matchBelow(id) || (i.mode === 'subtree' && ancestorMatched(id));
  const isOpen = (id: string): boolean => {
    if (filtering && i.layer?.has(id)) return i.layer.get(id)!;
    return i.open.has(id) || (filtering && matchBelow(id));
  };
  const out: OracleRow[] = [];
  const walk = (id: string | null, level: number) => {
    const kids = childrenOf(id).filter(shown);
    kids.forEach((c, k) => {
      out.push({ id: c, level, pos: k + 1, size: kids.length });
      if (isOpen(c)) walk(c, level + 1);
    });
  };
  walk(null, 0);
  return out;
}
