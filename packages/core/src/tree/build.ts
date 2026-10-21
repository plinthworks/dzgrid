import { canonicalId, groupKey, type RowIdInput, type RowKey } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { RowSnapshot } from '../row/store.js';

/**
 * A tree's structure over one generation of the rows (D3): each node's parent (-1 for a root), its
 * depth, its number of children. Nodes are the rows by source index, then a path tree's fillers
 * (`rows` … `n - 1`, plan D2). Built once per generation, in O(n), with no recursion: a chain of a
 * million rows needs no stack.
 */
export interface Structure {
  /** Nodes: the rows, then the fillers. */
  readonly n: number;
  /** Rows: nodes from here up are fillers. */
  readonly rows: number;
  readonly parent: Int32Array;
  readonly depth: Uint32Array;
  readonly kids: Uint32Array;
  /** The deepest level (0: roots only): what a flatten's stack needs. */
  readonly maxDepth: number;
  readonly problems: readonly Problem[];
  /** A path tree's fillers, by node - rows: their path and key; and the node of each filler key. */
  readonly paths?: readonly (readonly string[])[];
  readonly keys?: readonly RowKey[];
  readonly at?: ReadonlyMap<RowKey, number>;
}

/** Parent mode (and nested rows, through their index): each row's parent by its id. */
export function structure<T>(snap: RowSnapshot<T>, parentId: (row: T, id: string) => RowIdInput | null | undefined): Structure {
  const n = snap.count;
  const parent = new Int32Array(n);
  const problems: Problem[] = [];
  for (let i = 0; i < n; i++) {
    let raw: unknown;
    try {
      raw = parentId(snap.rows[i]!, snap.ids[i]!);
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
  return finish(n, parent, problems, snap.ids);
}

/**
 * A path tree (D3): each row's path walked from the root through one map per level, keyed by the
 * segment (O(n·depth), no joined strings). A level no row claims is a filler, numbered after the
 * rows, keyed `groupKey(path)`; a row whose path equals a filler's takes its place. Two rows with one
 * path: siblings, the first the parent of deeper paths. An empty or unreadable path: a root.
 */
export function pathStructure<T>(snap: RowSnapshot<T>, path: (row: T) => readonly string[]): Structure {
  const n = snap.count;
  // The trie: each node's parent, the row that claims it (-1: none), its segment, its children.
  const up: number[] = [];
  const row: number[] = [];
  const seg: string[] = [];
  const next: (Map<string, number> | undefined)[] = [];
  const top = new Map<string, number>();
  const add = (t: number, x: string): number => (up.push(t), row.push(-1), seg.push(x)) - 1;
  for (let s = 0; s < n; s++) {
    let p: unknown;
    try {
      p = path(snap.rows[s]!);
    } catch {}
    const list = Array.isArray(p) ? p : [];
    let t = -1;
    for (let j = 0; j < list.length; j++) {
      const x = String(list[j]);
      const m = t < 0 ? top : (next[t] ??= new Map());
      let c = m.get(x);
      if (c === undefined) m.set(x, (c = add(t, x)));
      else if (j === list.length - 1 && row[c]! >= 0) c = add(t, x);
      t = c;
    }
    row[t < 0 ? add(-1, '') : t] = s;
  }
  const T = up.length;
  const node = new Int32Array(T);
  let f = n;
  for (let t = 0; t < T; t++) node[t] = row[t]! >= 0 ? row[t]! : f++;
  const parent = new Int32Array(f);
  const paths: string[][] = [];
  const keys: RowKey[] = [];
  const at = new Map<RowKey, number>();
  for (let t = 0; t < T; t++) {
    parent[node[t]!] = up[t]! < 0 ? -1 : node[up[t]!]!;
    if (row[t]! < 0) {
      const p: string[] = [];
      for (let x = t; x >= 0; x = up[x]!) p.unshift(seg[x]!);
      const key = groupKey(p);
      paths.push(p);
      keys.push(key);
      at.set(key, node[t]!);
    }
  }
  return { ...finish(n, parent, [], snap.ids), paths, keys, at };
}

/** Cycles broken, depths and children counted, over `parent` (rows first, then fillers). */
function finish(rows: number, parent: Int32Array, problems: Problem[], ids: readonly string[]): Structure {
  const n = parent.length;
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
      problems.push(problem('tree-cycle', 'warning', 'parentId', ids[first]));
    }
    while (len) state[path[--len]!] = 2;
  }
  // Depths, by walking up to a node whose depth is known (state reused: 3 = known).
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
  return { n, rows, parent, depth, kids, maxDepth, problems };
}

/**
 * A path tree's order over its nodes: each filler placed where its first nearest row underneath is in
 * `order` (the sort's, else the source order), so buckets place it among its siblings there (step 5
 * plan, decision 4). Without fillers, `order` itself.
 */
export function withFillers(st: Structure, order: Uint32Array | null): Uint32Array | null {
  const { n, rows, parent } = st;
  if (n === rows) return order;
  const out = new Uint32Array(n);
  const seen = new Uint8Array(n);
  const up = new Uint32Array(st.maxDepth + 1);
  let m = 0;
  for (let k = 0; k < rows; k++) {
    const s = order ? order[k]! : k;
    let len = 0;
    for (let p = parent[s]!; p >= rows && !seen[p]; p = parent[p]!) (seen[p] = 1), (up[len++] = p);
    while (len) out[m++] = up[--len]!;
    out[m++] = s;
  }
  return out;
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
