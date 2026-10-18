import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnOrGroup, type ColumnState } from '@dzgrid/core';
import { headerBands, type BandFragment } from '@dzgrid/core/spans';
import { rng } from './support/spans.js';

/** headerBands against a group-centric oracle over random trees, pins, hidden leaves and moves. */

type R = Record<string, unknown>;
type Rand = ReturnType<typeof rng>;
type Node = { id: string; header?: unknown; children?: Node[]; pinned?: 'start' | 'end'; hidden?: boolean };

function randomTree(r: Rand): { tree: Node[]; leafIds: string[] } {
  let leaf = 0;
  const leafIds: string[] = [];
  const pool = ['g0', 'g1', 'g2', 'g3', 'g4', '', 'l0'];
  const make = (depth: number): Node[] =>
    Array.from({ length: r.int(4) + (depth === 0 ? 1 : 0) }, () => {
      if (depth < 3 && r.next() < 0.45) {
        const g: Node = { id: r.pick(pool), children: make(depth + 1) };
        if (r.next() < 0.7) g.header = r.next() < 0.9 ? `H${g.id}` : 42;
        return g;
      }
      const id = `l${leaf++}`;
      leafIds.push(id);
      const n: Node = { id };
      if (r.next() < 0.25) n.pinned = r.pick(['start', 'end'] as const);
      if (r.next() < 0.15) n.hidden = true;
      return n;
    });
  return { tree: make(0), leafIds };
}

function oracle(tree: Node[], visible: string[], segOf: (i: number) => number) {
  const allLeaves: string[] = [];
  const collect = (ns: Node[]): void => ns.forEach((n) => (n.children ? collect(n.children) : allLeaves.push(n.id)));
  collect(tree);
  const leafSet = new Set(allLeaves);
  const valid: { id: string; level: number; label: string; leaves: Set<string> }[] = [];
  const problems: { path: string; detail: string }[] = [];
  const seen = new Set<string>();
  const leavesOf = (ns: Node[]): string[] => ns.flatMap((n) => (n.children ? leavesOf(n.children) : [n.id]));
  const walk = (ns: Node[], path: string, level: number): void =>
    ns.forEach((n, i) => {
      const at = `${path}[${i}]`;
      if (!n.children) return;
      const ls = leavesOf(n.children);
      const why = ls.length === 0 ? 'empty' : n.id === '' ? 'id' : seen.has(n.id) || leafSet.has(n.id) ? 'duplicate' : null;
      if (why) {
        problems.push({ path: at, detail: why });
        walk(n.children, `${at}.children`, level);
        return;
      }
      seen.add(n.id);
      valid.push({ id: n.id, level, label: typeof n.header === 'string' ? n.header : '', leaves: new Set(ls) });
      walk(n.children, `${at}.children`, level + 1);
    });
  walk(tree, 'columns', 0);
  const depth = valid.reduce((d, g) => Math.max(d, g.level + 1), 0);
  const levels: BandFragment[][] = Array.from({ length: depth }, () => []);
  for (const g of valid) {
    let run: BandFragment | null = null;
    visible.forEach((id, i) => {
      if (!g.leaves.has(id)) return void (run = null);
      if (run && run.first + run.count === i && segOf(run.first) === segOf(i)) (run as { count: number }).count++;
      else levels[g.level]!.push((run = { group: g.id, first: i, count: 1, label: g.label }));
    });
  }
  for (const l of levels) l.sort((a, b) => a.first - b.first);
  return { depth, levels, problems };
}

describe('headerBands against a group-centric oracle', () => {
  it('random trees, pins, hidden leaves and moved columns', () => {
    let fragments = 0;
    let split = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const r = rng(seed * 101);
      const { tree, leafIds } = randomTree(r);
      const m = createColumnModel<R>(tree as unknown as ColumnOrGroup<R>[]);
      const state: ColumnState[] = leafIds.filter(() => r.next() < 0.3).map((id) => ({
        id,
        ...(r.next() < 0.5 && { order: r.next() * leafIds.length }),
        ...(r.next() < 0.3 && { pinned: r.pick(['start', 'end', null] as const) }),
        ...(r.next() < 0.2 && { hidden: r.next() < 0.5 }),
      }));
      if (state.length) m.apply(state, 'api');
      const { start, center, end } = m.layout;
      const visible = [...start.columns, ...center.columns, ...end.columns].map((c) => c.id);
      const segOf = (i: number) => (i < start.columns.length ? 0 : i < start.columns.length + center.columns.length ? 1 : 2);
      const got = headerBands(tree as unknown as ColumnOrGroup<R>[], m.layout);
      const want = oracle(tree, visible, segOf);
      expect(got.depth, `seed ${seed}`).toBe(want.depth);
      expect(got.levels, `seed ${seed} ${JSON.stringify(tree)} ${visible}`).toEqual(want.levels);
      expect(got.problems.map((p) => ({ path: p.path, detail: p.detail })), `seed ${seed}`).toEqual(want.problems);
      expect(got.problems.every((p) => p.code === 'invalid-column-group' && p.severity === 'error')).toBe(true);
      // Fragments of one level never overlap and stay inside one segment.
      for (const l of got.levels) {
        for (let i = 0; i < l.length; i++) {
          const f = l[i]!;
          expect(segOf(f.first)).toBe(segOf(f.first + f.count - 1));
          if (i) expect(l[i - 1]!.first + l[i - 1]!.count).toBeLessThanOrEqual(f.first);
          fragments++;
        }
        split += l.length - new Set(l.map((f) => f.group)).size;
      }
    }
    // The generator reaches split groups.
    expect(fragments).toBeGreaterThan(300);
    expect(split).toBeGreaterThan(30);
  });
});
