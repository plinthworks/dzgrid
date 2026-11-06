import { canonicalId, dataKey, type DisplayIndex, type RowIdInput, type RowKey } from '../ids.js';
import { positions, type DisplayedRows } from '../row/displayed.js';

/**
 * The rules of moving rows (Phase 9, docs/behaviors/row-move.md), pure: where a dragged row may land, the keyboard's step
 * among siblings, whether a place changes anything, a row's place for a sentence, and the reorder an application (or the
 * grid's managed mode) applies to its rows. Every way of moving (pointer, keys, menu, API) goes through these, so one
 * place computes targets.
 */

/** Where a row lands relative to `key`: before it, after it (after its subtree), or inside it as its last child. */
export type DropWhere = 'before' | 'after' | 'inside';
/** A place: `key: null` is the end of the list (of the roots in a tree). Never a `DisplayIndex` (one version only). */
export interface RowDrop {
  readonly key: RowKey | null;
  readonly where: DropWhere;
}
/** Rows to move (display order) and where. */
export interface RowMove {
  readonly keys: readonly RowKey[];
  readonly target: RowDrop;
}
/** A keyboard step among siblings: one place, the first or last place, inside the sibling before, out after the parent. */
export type MoveStep = -1 | 1 | 'start' | 'end' | 'in' | 'out';

type Rows = DisplayedRows<unknown>;

/** A shown row's parent (a tree's), null for a root or a flat list. */
const up = (d: Rows, key: RowKey): RowKey | null => d.parentOf?.(key) ?? null;

/** Whether `key` is in `set` or under a row of it (a tree's ancestors walked; a flat list: itself only). */
export function within(d: Rows, key: RowKey, set: ReadonlySet<RowKey>): boolean {
  // Bounded: a tree's parents end at a root (the bound guards a model that loops).
  for (let k: RowKey | null = key, n = 0; k !== null && n < 1e4; k = up(d, k), n++) if (set.has(k)) return true;
  return false;
}

/** A shown, movable row: a data row of the body (never a group, totals, detail, loading or pinned row). */
const movable = (d: Rows, key: RowKey): number => {
  const i = d.indexOf(key);
  if (i === -1) return -1;
  const n = d.nodeAt(i);
  return n.kind === 'data' && !n.pinned ? i : -1;
};

/**
 * The rows a gesture moves: the shown, movable ones of `keys`, in display order, without repeats; in a tree a row whose
 * ancestor moves too is left out (it travels with it).
 */
export function movingRows(d: Rows, keys: readonly RowKey[]): RowKey[] {
  const at = new Map<RowKey, number>();
  for (const k of keys) {
    const i = movable(d, k);
    if (i >= 0) at.set(k, i);
  }
  const set = new Set(at.keys());
  return [...at].filter(([k]) => { const p = up(d, k); return p === null || !within(d, p, set); }).sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** The data rows shown under `parent` (a tree), or every data row shown (a flat list), in display order. */
export function siblings(d: Rows, parent: RowKey | null, tree: boolean): RowKey[] {
  const out: RowKey[] = [];
  for (const i of positions(d)) {
    const n = d.nodeAt(i);
    if (n.kind === 'data' && !n.pinned && (!tree || up(d, n.key) === parent)) out.push(n.key);
  }
  return out;
}

/** The parent a place gives (null: a root, or a flat list). */
export const parentAfter = (d: Rows, t: RowDrop): RowKey | null => (t.where === 'inside' ? t.key : t.key === null ? null : up(d, t.key));

/**
 * Whether moving `keys` to `t` changes nothing that shows: in a tree every row already under the place's parent, and the
 * siblings shown already in the resulting order. A place on a row being moved is never one (false).
 */
export function unchanged(d: Rows, keys: readonly RowKey[], t: RowDrop, tree: boolean): boolean {
  const p = tree ? parentAfter(d, t) : null;
  if (tree && keys.some((k) => up(d, k) !== p)) return false;
  const mv = new Set(keys);
  const all = siblings(d, p, tree);
  const rest = all.filter((k) => !mv.has(k));
  const j = t.key === null || t.where === 'inside' ? rest.length : rest.indexOf(t.key) + +(t.where === 'after');
  if (t.key !== null && t.where !== 'inside' && rest.indexOf(t.key) < 0) return false;
  const res = [...rest.slice(0, j), ...keys, ...rest.slice(j)];
  return res.length === all.length && res.every((k, i) => k === all[i]);
}

/**
 * Where a drag lands over shown row `i` at `frac` of its height (0 its top, 1 its bottom), `moving` the rows dragged (as
 * `movingRows` gives them): a flat list's upper half before, lower half after; a tree's upper quarter before, lower
 * quarter after, the middle inside. The lower quarter of a parent whose children show: before its first child. A detail
 * panel: after its master. Null: nothing offered there (a row moved or under one, a group, totals, a loading row, or a
 * place that changes nothing).
 */
export function dropPlace(d: Rows, i: number, frac: number, moving: readonly RowKey[], tree: boolean): RowDrop | null {
  const ix = d.index(i);
  if (ix === null || !moving.length) return null;
  const set = new Set(moving);
  const n = d.nodeAt(ix);
  let t: RowDrop | null = null;
  if (n.kind === 'detail') t = { key: n.master, where: 'after' };
  else if (n.kind === 'data' && !n.pinned) {
    t = { key: n.key, where: tree ? (frac < 0.25 ? 'before' : frac > 0.75 ? 'after' : 'inside') : frac < 0.5 ? 'before' : 'after' };
    const nx = tree && t.where === 'after' ? d.index(i + 1) : null;
    const next = nx === null ? null : d.nodeAt(nx);
    // The gap under an open parent is its first child's: that child's « before » (a loading row there: inside).
    if (next && next.kind !== 'detail' && (next.kind === 'loading' ? next.parent === n.key : up(d, next.key) === n.key)) t = next.kind === 'data' ? { key: next.key, where: 'before' } : { key: n.key, where: 'inside' };
  }
  if (!t || t.key === null || within(d, t.key, set)) return null;
  return unchanged(d, moving, t, tree) ? null : t;
}

/**
 * The keyboard's place for `keys` (as `movingRows` gives them) from the focused row `focus`, among its siblings: one place
 * before or after the moved rows, the first or last place, inside the sibling before (a tree), out right after the parent
 * (a tree). Null: at the edge (nothing would change).
 */
export function nextPlace(d: Rows, keys: readonly RowKey[], focus: RowKey, by: MoveStep, tree: boolean): RowDrop | null {
  if ((by === 'in' || by === 'out') && !tree) return null;
  const mv = new Set(keys);
  const p = tree ? up(d, focus) : null;
  const all = siblings(d, p, tree);
  const a = all.findIndex((k) => mv.has(k));
  if (a < 0) return null;
  let b = all.length - 1;
  while (!mv.has(all[b]!)) b--;
  const rest = all.filter((k) => !mv.has(k));
  const prev = all.slice(0, a).filter((k) => !mv.has(k)).at(-1);
  const next = all.slice(b + 1).find((k) => !mv.has(k));
  const t: RowDrop | null =
    by === -1 ? (prev ? { key: prev, where: 'before' } : null)
    : by === 1 ? (next ? { key: next, where: 'after' } : null)
    : by === 'start' ? (rest.length ? { key: rest[0]!, where: 'before' } : null)
    : by === 'end' ? (rest.length ? { key: rest.at(-1)!, where: 'after' } : null)
    : by === 'in' ? (prev ? { key: prev, where: 'inside' } : null)
    : p === null ? null : { key: p, where: 'after' };
  return t && !unchanged(d, keys, t, tree) ? t : null;
}

/**
 * A shown data row's place for a sentence: `n` of `total` among its siblings shown (a flat list: among the data rows
 * shown), `level` from 1 in a tree (0 in a flat list). Null: not shown.
 */
export function placeOf(d: Rows, key: RowKey, tree: boolean): { readonly n: number; readonly total: number; readonly level: number } | null {
  if (movable(d, key) < 0) return null;
  const all = siblings(d, tree ? up(d, key) : null, tree);
  let level = 0;
  if (tree) for (let k: RowKey | null = key; k !== null && level < 1e4; k = up(d, k)) level++;
  return { n: all.indexOf(key) + 1, total: all.length, level };
}

/** How `moveRows` reads and writes a `parentId` tree's parent; absent: a flat list. */
export interface MoveRowsOptions<T> {
  /** A row's parent id; null, undefined or '' for a root (as `tree({ parentId })`). */
  readonly parentId?: (row: T) => RowIdInput | null | undefined;
  /** A row with another parent (a copy: the application's row is never changed here); absent, the parent stays (a flat move). */
  readonly setParent?: (row: T, parent: RowIdInput | null) => T;
}

/**
 * The rows in their new order (Q-RD1: what an application gives the grid back, or what `rowDrag({ apply: true })` does):
 * the moved rows, in the order of `move.keys`, taken out and put back at the place — before or after the target row (a
 * tree: as its siblings, the target's parent given through `setParent`), inside it as its last child, or at the end
 * (`key: null`). A new array; the rows not moved keep their order and their objects; a moved row is the same object
 * unless `setParent` gave it another parent. Nothing moves (a copy as given) when the target is unknown or moved, or
 * when a tree's new parent is a moved row or under one. `children` and `path` trees: the application's to reorder.
 */
export function moveRows<T>(rows: readonly T[], move: RowMove, getRowId: (row: T) => RowIdInput, o: MoveRowsOptions<T> = {}): T[] {
  const keyOf = (r: T): RowKey | null => dataKey(getRowId(r));
  const want = new Set(move.keys);
  const t = move.target;
  const found = new Map<RowKey, T>();
  const rest: T[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (k !== null && want.has(k) && !found.has(k)) found.set(k, r);
    else rest.push(r);
  }
  const same = rows.slice();
  if (!found.size || (t.key !== null && want.has(t.key))) return same;
  const pid = o.parentId;
  const parentOf = (r: T): string | null => {
    const p = pid!(r);
    return p == null || p === '' ? null : canonicalId(p);
  };
  let i = rest.length;
  let parent: RowIdInput | null = null;
  if (t.key !== null) {
    const j = rest.findIndex((r) => keyOf(r) === t.key);
    if (j < 0) return same;
    const target = rest[j]!;
    if (t.where === 'inside' && pid) {
      const id = canonicalId(getRowId(target));
      // As its last child: after the last row that is its child (siblings keep their relative order), else right after it.
      i = j + 1;
      for (let x = j + 1; x < rest.length; x++) if (parentOf(rest[x]!) === id) i = x + 1;
      parent = getRowId(target);
    } else {
      i = j + +(t.where !== 'before');
      parent = pid ? pid(target) ?? null : null;
      if (parent === '') parent = null;
    }
  }
  const moved = move.keys.filter((k) => found.has(k)).map((k) => found.get(k)!);
  if (pid) {
    // Never into itself: the new parent is no moved row and under none.
    const ids = new Set(moved.map((r) => canonicalId(getRowId(r))));
    const byId = new Map(rows.map((r) => [canonicalId(getRowId(r)), r] as const));
    for (let p = parent === null ? null : canonicalId(parent), n = 0; p !== null && n < 1e4; n++) {
      if (ids.has(p)) return same;
      const r = byId.get(p);
      p = r === undefined ? null : parentOf(r);
    }
  }
  const to = parent === null ? null : canonicalId(parent);
  const out = pid && o.setParent ? moved.map((r) => (parentOf(r) === to ? r : o.setParent!(r, parent))) : moved;
  return [...rest.slice(0, i), ...out, ...rest.slice(i)];
}

/** A row shown at `i`, for the DOM's paint and pointer: its key when it is a movable data row (never pinned), else null. */
export const movableAt = (d: Rows, i: number): RowKey | null => {
  const ix = d.index(i);
  const n = ix === null ? null : d.nodeAt(ix as DisplayIndex);
  return n?.kind === 'data' && !n.pinned ? n.key : null;
};
