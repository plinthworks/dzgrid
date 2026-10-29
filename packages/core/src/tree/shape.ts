import { canonicalId, idOfDataKey, type DisplayIndex, type RowIdInput, type RowKey } from '../ids.js';
import type { RowShape, ShapeInput } from '../model/client.js';
import { problem, type Problem } from '../problems.js';
import type { RowNode } from '../row/node.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { RowSnapshot } from '../row/store.js';
import { buckets, pathStructure, structure, visibility, withFillers, type Buckets, type Structure } from './build.js';

/** Exactly one of `parentId`, `children`, `path` (D3, owner Q1); none or several: `tree-shape`. */
export interface TreeOptions<T> {
  /** The id of a row's parent; null, undefined or '' for a root. */
  readonly parentId?: (row: T) => RowIdInput | null | undefined;
  /** A row's children (nested data): every level becomes rows of the grid, ids unique over all of them. */
  readonly children?: (row: T) => readonly T[] | undefined;
  /** A row's path of labels, root first: a level no row has becomes a filler row (a label, never data). */
  readonly path?: (row: T) => readonly string[];
  /** What a filter keeps: matches and their ancestors (default), or their whole subtrees too (tree-filter.md). */
  readonly filter?: 'ancestors' | 'subtree';
  /** What is open at the first non-empty load: nothing (default), everything, or the levels above a depth (1: the roots). */
  readonly initial?: 'none' | 'all' | number;
  /**
   * The data rows always open (1.1.0, tree-view.md): open whatever the expansion, never closed by the kernel, never
   * listed by expand-all / collapse-all; the DOM draws them no chevron. A throw counts as false; a value that is not a
   * function is ignored, told (`invalid-setting`).
   */
  readonly fixedOpen?: (row: T) => boolean;
}

/** A tree's rows as shown: the displayed rows, and what a treegrid's rows say (WAI-ARIA 1.2). */
export interface TreeRows<T> extends DisplayedRows<T> {
  parentOf(key: RowKey): RowKey | null;
  levelAt(i: DisplayIndex): number;
  /** 1-based place among the siblings shown (aria-posinset). */
  posAt(i: DisplayIndex): number;
  /** How many siblings are shown (aria-setsize). */
  sizeAt(i: DisplayIndex): number;
  /** How many children it shows when open: 0 for a leaf (no aria-expanded); -1 for a lazy parent not loaded (tree-lazy.md). */
  childrenAt(i: DisplayIndex): number;
  /** How many children a row holds, whatever the filter (0 for a row it does not hold). */
  kidsOf(key: RowKey): number;
  expandedAt(i: DisplayIndex): boolean;
  /** False for an ancestor shown only for its matches (drawn muted). */
  matchedAt(i: DisplayIndex): boolean;
}

export interface TreeShape<T> extends RowShape<T> {
  readonly kind: 'tree';
  /** Work done, for tests: structures built, orders bucketed, filters applied, flattens. */
  readonly diagnostics: { readonly builds: number; readonly orders: number; readonly filters: number; readonly flattens: number };
}

/**
 * The tree view (D1–D4): built from parent ids, sorted per level by one global sort bucketed
 * under each parent, filtered with ancestors kept, flattened over what is open. Each stage keeps
 * its result while its inputs keep their identity: opening a row only flattens again.
 */
export function treeShape<T>(o: TreeOptions<T>): TreeShape<T> {
  const d = { builds: 0, orders: 0, filters: 0, flattens: 0 };
  const given = (['parentId', 'children', 'path'] as const).filter((m) => o[m]);
  const told: Problem[] = given.length === 1 ? [] : [problem('tree-shape', 'error', 'tree', given.join(',') || 'none')];
  // `fixedOpen`, when a function (another value: ignored, told).
  let fo = o.fixedOpen;
  if (fo && typeof fo != 'function') told.push(problem('invalid-setting', 'warning', 'tree.fixedOpen', String(fo))), (fo = void 0);
  /** Nested rows: each row's parent id, by id, from the walks (a load, a transaction's rows). */
  let index = new Map<string, string>();
  /** `fx`: 1 for a row `fixedOpen` keeps open (asked once per snapshot). */
  let S: { snap: RowSnapshot<T>; st: Structure; ps: readonly Problem[]; fx: Uint8Array | undefined } | null = null;
  let O: { st: Structure; order: Uint32Array | null; ord: Uint32Array | null; all: Buckets } | null = null;
  let F: Filtered | null = null;
  let V: View | null = null;
  let open: Uint8Array | null = null;
  /** The open flags of the last build, and what they were resolved from. */
  let flags: { st: Structure; F: Filtered; anc: Uint8Array | null; a: Uint8Array } | null = null;

  const structureOf = (snap: RowSnapshot<T>): Structure => {
    if (S?.snap !== snap) {
      d.builds++;
      const m = given[0];
      const st = m === 'path' ? pathStructure(snap, o.path!) : structure(snap, (r, id) => (m === 'children' ? index.get(id) : m && o.parentId!(r)));
      // The data rows only (a filler's place reads as undefined: not fixed); a throw is false.
      const fx = fo && Uint8Array.from(snap.rows, ((r: T) => { try { return +!!fo!(r); } catch {} }) as (r: T) => number);
      S = { snap, st, ps: [...told, ...st.problems], fx };
    }
    return S.st;
  };
  /** A row's node by its key: a data row's source index, a filler's node; -1 when unknown. */
  const srcOf = (snap: RowSnapshot<T>, st: Structure, key: RowKey): number => {
    const s = snap.lookup(idOfDataKey(key) ?? '');
    if (s >= 0 || !st.at) return s;
    const x = st.at(key);
    // A group key names a filler only: a row standing at its path has its own key.
    return x < st.rows ? -1 : x;
  };
  const keyOf = (snap: RowSnapshot<T>, st: Structure, x: number): RowKey => (x < st.rows ? snap.keyAt(x as never) : st.keyOf!(x));
  /** A row's id as the store reads it; none for what is not an object or whose getRowId throws. */
  const idOf = (r: unknown, id: (row: T) => RowIdInput): string | null => {
    try {
      return r !== null && typeof r === 'object' ? canonicalId(id(r as T)) : null;
    } catch {
      return null;
    }
  };
  /**
   * Nested rows made flat: each row then its children, depth first, iteratively. A row the store
   * refuses (no id, a second copy, `held`: an id it holds) is kept for the store to tell, and not
   * walked: its children are not brought, its parent not indexed. An object met twice is walked once
   * (one that holds itself cannot hang the grid). `ids`: the ids taken.
   */
  const walk = (top: Iterable<T>, id: (row: T) => RowIdInput, keep: boolean, held?: (id: string) => boolean, ids = new Set<string>()): T[] => {
    const out: T[] = [];
    const seen = new Set<unknown>();
    const stack: [T, string | null][] = [...top].reverse().map((r) => [r, null]);
    while (stack.length) {
      const [r, p] = stack.pop()!;
      if (seen.has(r)) continue;
      seen.add(r);
      if (keep) out.push(r);
      const me = idOf(r, id);
      if (me === null || ids.has(me) || held?.(me)) continue;
      ids.add(me);
      if (p !== null) index.set(me, p);
      let kids: unknown;
      try {
        kids = o.children!(r);
      } catch {}
      if (Array.isArray(kids)) for (let c = kids.length; c--; ) stack.push([kids[c], me]);
    }
    return out;
  };

  /** The rows shown, from the roots down through what `isOpen` opens. */
  const flatten = (snap: RowSnapshot<T>, st: Structure, v: View, f: Filtered, isOpen: Uint8Array | null, version: number): TreeRows<T> => {
    d.flattens++;
    const { n, rows, parent } = st;
    const { start, list } = v.shown;
    const at = new Uint32Array(list.length);
    const lv = new Uint32Array(list.length);
    // The stack holds one entry per level open on the way down: sized by the depth, not the rows.
    const node = new Int32Array(st.maxDepth + 2);
    const cur = new Uint32Array(st.maxDepth + 2);
    const mt = f.matched;
    let mc = 0;
    let fills = 0;
    let m = 0;
    let sp = 1;
    node[0] = n;
    cur[0] = start[n]!;
    while (sp) {
      const b = node[sp - 1]!;
      const c = cur[sp - 1]!;
      if (c >= start[b + 1]!) {
        sp--;
        continue;
      }
      cur[sp - 1] = c + 1;
      const x = list[c]!;
      at[m] = x;
      lv[m++] = sp - 1;
      if (mt?.[x]) mc++;
      if (x >= rows) fills++;
      if ((!isOpen || isOpen[x]) && start[x]! < start[x + 1]!) {
        node[sp] = x;
        cur[sp++] = start[x]!;
      }
    }
    let back: Int32Array | null = null;
    const check = (i: number): number => {
      if (!Number.isInteger(i) || i < 0 || i >= m) throw new RangeError(`no displayed row ${i}`);
      return at[i]!;
    };
    const nodeAt = (i: number): RowNode<T> => {
      const s = check(i);
      if (s < rows) return { key: snap.keyAt(s as never), kind: 'data', level: lv[i]!, id: snap.ids[s]!, data: snap.rows[s]! };
      const path = st.pathOf!(s);
      return { key: st.keyOf!(s), kind: 'group', level: lv[i]!, label: path[path.length - 1]!, path };
    };
    return {
      version,
      count: m,
      // Under a filter, select-all and the header box take the matches only (tree-filter.md); never a filler.
      dataCount: mt ? mc : m - fills,
      nodeAt,
      keyAt: (i) => keyOf(snap, st, check(i)),
      index: (i) => (Number.isInteger(i) && i >= 0 && i < m ? (i as DisplayIndex) : null),
      indexOf(key) {
        const s = srcOf(snap, st, key);
        if (s < 0) return -1;
        if (!back) {
          back = new Int32Array(n).fill(-1);
          for (let i = 0; i < m; i++) back[at[i]!] = i;
        }
        return back[s]! as DisplayIndex | -1;
      },
      nextData: (i, delta) => (i + delta >= 0 && i + delta < m ? (nodeAt(i + delta) as never) : null),
      parentOf(key) {
        const s = srcOf(snap, st, key);
        return s < 0 || parent[s]! < 0 ? null : keyOf(snap, st, parent[s]!);
      },
      levelAt: (i) => (check(i), lv[i]!),
      posAt: (i) => v.pos[check(i)]!,
      sizeAt: (i) => v.size[check(i)]!,
      childrenAt: (i) => {
        const s = check(i);
        return start[s + 1]! - start[s]!;
      },
      kidsOf: (key) => st.kids[srcOf(snap, st, key)] ?? 0,
      expandedAt: (i) => !isOpen || isOpen[check(i)] === 1,
      matchedAt: (i) => !mt || mt[check(i)] === 1,
    };
  };

  let last: { snap: RowSnapshot<T>; st: Structure; v: View; f: Filtered; version: number; all?: TreeRows<T> } | null = null;

  const shape: TreeShape<T> = {
    kind: 'tree',
    ...(o.initial !== undefined && { initial: o.initial }),
    get diagnostics() { return { ...d }; },
    get problems() { return S?.ps ?? told; },
    ...(given[0] === 'children' && {
      load: (rows: Iterable<T>, id: (row: T) => RowIdInput) => ((index = new Map()), walk(rows, id, true)),
      tx(tx, id, snap) {
        // A removed row forgets its parent (lead decision 6a), unless it is added back in this transaction.
        const gone = new Map<string, string | undefined>();
        for (const x of tx.remove ?? []) {
          const c = canonicalId(x);
          if (c !== null && snap.lookup(c) >= 0) gone.set(c, index.get(c)), index.delete(c);
        }
        const live = (c: string) => snap.lookup(c) >= 0 && !gone.has(c);
        // An update's children are indexed under it (added to, never taken from); a refused update's are not.
        walk((tx.update ?? []).filter((r) => { const c = idOf(r, id); return c !== null && live(c); }), id, false);
        // Adds refused as a whole (no valid place): nothing walked.
        if (!tx.add || (tx.addAt !== undefined && !(Number.isInteger(tx.addAt) && tx.addAt >= 0))) return tx;
        const ids = new Set<string>();
        const add = walk(tx.add, id, true, live, ids);
        for (const [c, p] of gone) if (ids.has(c) && p !== undefined && !index.has(c)) index.set(c, p);
        return { ...tx, add };
      },
    }),
    parents(snap, depth, shown) {
      const st = structureOf(snap);
      // Shown: the rows the filter keeps that show children (what a chevron is drawn on).
      const b = shown && V?.F.st === st ? V.shown.start : null;
      const out: RowKey[] = [];
      // A row always open is never one of them (no toggle to make).
      for (let i = 0; i < st.n; i++) if ((b ? b[i + 1]! > b[i]! : st.kids[i]! > 0) && st.depth[i]! < depth && !S!.fx?.[i]) out.push(keyOf(snap, st, i));
      return out;
    },
    isOpen: (key) => {
      const s = last ? srcOf(last.snap, last.st, key) : -1;
      return s >= 0 && open?.[s] === 1;
    },
    opens: (key) => {
      const s = last ? srcOf(last.snap, last.st, key) : -1;
      // A row always open is not toggled (closing it is refused; it is open already). `S` is the last build's
      // structure here: a change builds again before any toggle.
      return s >= 0 && !S!.fx?.[s] && last!.v.shown.start[s + 1]! > last!.v.shown.start[s]!;
    },
    ...(given[0] === 'path' && {
      // A row taking a filler's place, or a filler a row's: the key passes to what stands there now (lead decision 6c).
      rekey(snap: RowSnapshot<T>) {
        const was = last;
        if (!was || was.snap === snap) return null;
        const st = structureOf(snap);
        return (k: RowKey): RowKey => {
          const x = srcOf(was.snap, was.st, k);
          if (x < 0 || srcOf(snap, st, k) >= 0) return k;
          const p = was.st.keyOf!(x);
          const y = st.at!(p);
          return y >= 0 && x < was.st.rows !== y < st.rows && was.st.at!(p) === x ? keyOf(snap, st, y) : k;
        };
      },
    }),
    build(i: ShapeInput<T>): TreeRows<T> {
      const { snap } = i;
      const st = structureOf(snap);
      if (O?.st !== st || O.order !== i.order) {
        d.orders++;
        const ord = withFillers(st, i.order);
        O = { st, order: i.order, ord, all: buckets(st, ord, null) };
      }
      if (F?.st !== st || F.matched !== i.matched) {
        d.filters++;
        const vis = i.matched ? visibility(st, O.all, i.matched, o.filter === 'subtree') : null;
        F = { st, matched: i.matched, anc: vis?.anc ?? null, keep: vis?.keep ?? null };
      }
      if (V?.all !== O.all || V.F !== F) {
        const shown = F.keep ? buckets(st, O.ord, F.keep) : O.all;
        const pos = new Int32Array(st.n);
        const size = new Int32Array(st.n);
        for (let b = 0; b <= st.n; b++) {
          const from = shown.start[b]!;
          const len = shown.start[b + 1]! - from;
          for (let c = 0; c < len; c++) {
            const x = shown.list[from + c]!;
            pos[x] = c + 1;
            size[x] = len;
          }
        }
        V = { all: O.all, F, shown, pos, size };
      }
      // What is open: the user's rows; under a filter, the ancestors of matches, then the layer.
      // A toggle patches the last flags (copied: an earlier build keeps its own) for its keys only.
      const anc = i.filterActive ? F.anc : null;
      const flag = (k: RowKey, s: number): number => (i.layer?.has(k) ? +i.layer.get(k)! : i.expansion.has(k) || anc?.[s] ? 1 : 0);
      // Patched: the toggled keys; built again: the user's rows, then the layer's (each read through `flag`).
      const patch = i.changed && flags?.st === st && flags.F === F && flags.anc === anc;
      const isOpen = patch ? flags!.a.slice() : anc ? anc.slice() : new Uint8Array(st.n);
      for (const k of patch ? i.changed! : [...i.expansion, ...(i.layer?.keys() ?? [])]) {
        const s = srcOf(snap, st, k);
        if (s >= 0) isOpen[s] = flag(k, s);
      }
      S!.fx?.forEach((v, s) => v && (isOpen[s] = 1));
      flags = { st, F, anc, a: isOpen };
      open = isOpen;
      last = { snap, st, v: V, f: F, version: i.version };
      return flatten(snap, st, V, F, isOpen, i.version);
    },
    all() {
      if (!last) return null as never;
      return (last.all ??= flatten(last.snap, last.st, last.v, last.f, null, last.version));
    },
  };
  return shape;
}

/** What a filter keeps of a structure; null arrays: no filter. */
interface Filtered { readonly st: Structure; readonly matched: Uint8Array | null; readonly anc: Uint8Array | null; readonly keep: Uint8Array | null }
/** The children shown, per parent, with each row's place among them. */
interface View { readonly all: Buckets; readonly F: Filtered; readonly shown: Buckets; readonly pos: Int32Array; readonly size: Int32Array }

/**
 * What a tree refuses beside it (D2, owner Q5): told by the grid, which shows the tree without the other feature.
 * Cell spans are allowed since 1.1.0 (owner Q15-1, siblings only); full-width rows stay refused (Q15-5), told by
 * the spans feature, which drops the rule beside a tree.
 */
export function treeConflicts(o: { readonly detail?: boolean; readonly page?: boolean }): Problem[] {
  return (['detail', 'page'] as const).filter((f) => o[f]).map((f) => problem('unsupported-combination', 'warning', f === 'page' ? 'pagination' : f, 'tree'));
}

/**
 * A tree column the host named that is shown but not first (D6): allowed, told as a warning (screen
 * readers expect the hierarchy in the first column). `visible`: the visible columns' ids, in order.
 */
export function treeColumnProblems(visible: readonly string[], column: string | undefined): Problem[] {
  return column !== undefined && visible[0] !== column && visible.includes(column) ? [problem('tree-column-not-first', 'warning', 'tree.column', column)] : [];
}
