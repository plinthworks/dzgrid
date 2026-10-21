import { canonicalId, type RowIdInput } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { RowSnapshot } from '../row/store.js';

/**
 * A tree's structure over one generation of the rows (D3, parent mode): each row's parent by
 * source index (-1 for a root), its depth, its number of children. Built once per generation,
 * in O(n), with no recursion: a chain of a million rows needs no stack.
 */
export interface Structure {
  readonly n: number;
  readonly parent: Int32Array;
  readonly depth: Uint32Array;
  readonly kids: Uint32Array;
  /** The deepest level (0: roots only): what a flatten's stack needs. */
  readonly maxDepth: number;
  readonly problems: readonly Problem[];
}

export function structure<T>(snap: RowSnapshot<T>, parentId: (row: T) => RowIdInput | null | undefined): Structure {
  const n = snap.count;
  const parent = new Int32Array(n);
  const problems: Problem[] = [];
  for (let i = 0; i < n; i++) {
    let raw: unknown;
    try {
      raw = parentId(snap.rows[i]!);
    } catch {
      raw = NaN;
    }
    let p = -1;
    // No parent: a root, silently. A parent the rows do not hold: a root, told (tree-orphan).
    if (raw !== null && raw !== undefined && raw !== '') {
      const id = canonicalId(raw);
      p = id === null ? -1 : snap.lookup(id);
      // Told by the row's id, not its place: a removal elsewhere does not make it a new problem.
      if (p < 0) problems.push(problem('tree-orphan', 'warning', 'parentId', snap.ids[i]));
    }
    parent[i] = p;
  }
  // Cycles (a row its own ancestor): each walk up marks its path; meeting the path again closes a
  // cycle, broken at its first row in source order, which becomes a root (tree-cycle).
  const state = new Uint8Array(n);
  const path = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    let len = 0;
    let x = s;
    while (x >= 0 && !state[x]) {
      state[x] = 1;
      path[len++] = x;
      x = parent[x]!;
    }
    if (x >= 0 && state[x] === 1) {
      let first = x;
      for (let m = parent[x]!; m !== x; m = parent[m]!) if (m < first) first = m;
      parent[first] = -1;
      problems.push(problem('tree-cycle', 'warning', 'parentId', snap.ids[first]));
    }
    while (len) state[path[--len]!] = 2;
  }
  // Depths, by walking up to a row whose depth is known (state reused: 3 = known).
  const depth = new Uint32Array(n);
  const kids = new Uint32Array(n);
  let maxDepth = 0;
  for (let s = 0; s < n; s++) {
    let len = 0;
    let x = s;
    while (x >= 0 && state[x] !== 3) {
      path[len++] = x;
      x = parent[x]!;
    }
    let d = x < 0 ? -1 : depth[x]!;
    while (len) {
      const y = path[--len]!;
      depth[y] = ++d;
      state[y] = 3;
      if (d > maxDepth) maxDepth = d;
    }
    const p = parent[s]!;
    if (p >= 0) kids[p] = kids[p]! + 1;
  }
  return { n, parent, depth, kids, maxDepth, problems };
}

/**
 * Children grouped under their parent, in the order given (the sort's): one pass, stable, O(n) (D2).
 * Bucket `n` holds the roots. `start` has n + 2 entries: bucket b is list[start[b] .. start[b + 1]).
 */
export interface Buckets {
  readonly start: Uint32Array;
  readonly list: Uint32Array;
}

export function buckets(st: Structure, order: Uint32Array | null, keep: Uint8Array | null): Buckets {
  const { n, parent } = st;
  const start = new Uint32Array(n + 2);
  const len = order ? order.length : n;
  for (let k = 0; k < len; k++) {
    const s = order ? order[k]! : k;
    if (!keep || keep[s]) {
      const b = (parent[s]! < 0 ? n : parent[s]!) + 1;
      start[b] = start[b]! + 1;
    }
  }
  for (let b = 1; b < n + 2; b++) start[b] = start[b]! + start[b - 1]!;
  const fill = start.slice(0, n + 1);
  const list = new Uint32Array(start[n + 1]!);
  for (let k = 0; k < len; k++) {
    const s = order ? order[k]! : k;
    if (!keep || keep[s]) {
      const b = parent[s]! < 0 ? n : parent[s]!;
      list[fill[b]!] = s;
      fill[b] = fill[b]! + 1;
    }
  }
  return { start, list };
}

/**
 * What a filter keeps (D4): the matches and their ancestors (`anc`, which a filter opens), and in
 * 'subtree' mode every descendant of a match too. Walks up stop at a row already marked: O(n).
 */
export function visibility(st: Structure, all: Buckets, matched: Uint8Array, subtree: boolean): { readonly keep: Uint8Array; readonly anc: Uint8Array } {
  const { n, parent } = st;
  const keep = new Uint8Array(n);
  const anc = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!matched[i]) continue;
    keep[i] = 1;
    for (let p = parent[i]!; p >= 0 && !anc[p]; p = parent[p]!) anc[p] = keep[p] = 1;
  }
  if (subtree) {
    // Parents before children: the roots' buckets, then each row's in turn (a breadth-first queue
    // over the bucket list itself, no stack).
    const queue = new Uint32Array(n);
    let head = 0;
    let tail = 0;
    for (let c = all.start[n]!; c < all.start[n + 1]!; c++) queue[tail++] = all.list[c]!;
    const under = new Uint8Array(n);
    while (head < tail) {
      const x = queue[head++]!;
      if (matched[x] || (parent[x]! >= 0 && under[parent[x]!])) under[x] = keep[x] = 1;
      for (let c = all.start[x]!; c < all.start[x + 1]!; c++) queue[tail++] = all.list[c]!;
    }
  }
  return { keep, anc };
}
