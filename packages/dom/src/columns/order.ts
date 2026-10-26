import type { ColumnLookup, ColumnModel, ColumnState, Side } from '@dzgrid/core';

/**
 * The order of the columns, DOM-free (Phase 6 step 2, docs/behaviors/column-move.md 4, 6, 7, 11–14; reused by the chooser,
 * step 4). The model sorts each segment by `order ?? place in the definitions` (ties: asked first); this is that same sort
 * over every column, hidden ones too: the « full order ». A move rewrites the ranks 0..n−1 of the columns whose rank
 * changed (or was never stored: the first move freezes the order, so new definitions from the host keep it).
 */
type M = ColumnModel<any>;
type Seg = Side | null;

const locked = (m: ColumnLookup<any>) => (id: string): boolean => m.get(id)?.def.movable === false;

/** A shown column's side (where the layout put it). */
const sideOf = (m: M, id: string): Seg => (['start', 'end'] as const).find((s) => m.layout[s].columns.some((c) => c.id === id)) ?? null;

/** The visible columns of a side, in order. */
export const segIds = (m: M, s: Seg): string[] => m.layout[s ?? 'center'].columns.map((c) => c.id);

/** Every column, hidden ones too, in the model's order. */
export function fullOrder(m: M): string[] {
  const st = m.state();
  const key = (i: number) => st[i]!.order ?? i;
  return st.map((_, i) => i).sort((a, b) => key(a) - key(b) || +(st[a]!.order === undefined) - +(st[b]!.order === undefined) || a - b).map((i) => st[i]!.id);
}

/**
 * `id` taken out of `full` and put before `full[gap]` (`gap` counted with it still in; `full.length`: last), the locked
 * columns kept in their slots: the others are reordered, then poured into the free slots (M12).
 */
export function reorder(full: readonly string[], id: string, gap: number, isLocked: (id: string) => boolean): string[] {
  const free = (xs: readonly string[]) => xs.filter((x) => x !== id && !isLocked(x));
  const u = free(full);
  u.splice(free(full.slice(0, gap)).length, 0, id);
  let j = 0;
  return full.map((x) => (isLocked(x) ? x : u[j++]!));
}

/** The patch from `full` to `next` (the ranks changed or never stored), the pin of `id` when its side changes; null: no change. */
const patchOf = (m: M, full: readonly string[], next: readonly string[], id: string, side: Seg): ColumnState[] | null => {
  const pin = side !== sideOf(m, id);
  if (!pin && next.every((x, i) => x === full[i])) return null;
  const st = new Map(m.state().map((s) => [s.id, s.order]));
  return next.flatMap((x, i) => (st.get(x) !== i || (x === id && pin) ? [x === id && pin ? { id: x, order: i, pinned: side } : { id: x, order: i }] : []));
};

/** Where the visible gap `g` of side `s` (0: before its first column) is in the full order: after the hidden columns there (M4). */
const gapAt = (m: M, full: readonly string[], s: Seg, g: number): number => {
  const seg = segIds(m, s);
  if (g < seg.length) return full.indexOf(seg[g]!);
  if (!seg.length) return s === 'start' ? 0 : full.length;
  const shown = new Set(m.visible().map((c) => c.id));
  let i = full.indexOf(seg.at(-1)!) + 1;
  while (i < full.length && !shown.has(full[i]!)) i++;
  return i;
};

/** A drop of `id` at the visible gap `g` of side `s`: its patch, or null (the same place). */
export const place = (m: M, id: string, s: Seg, g: number): ColumnState[] | null => {
  const full = fullOrder(m);
  return patchOf(m, full, reorder(full, id, gapAt(m, full, s, g), locked(m)), id, s);
};

/**
 * A drop at the gap `g` of side `s`, or at the nearest gap where the column lands as the bar shows (a locked column's
 * place never shifts, M12), toward its own place first; `patch` null: the same place. Null: no gap is offered.
 */
export function land(m: M, id: string, s: Seg, g: number): { g: number; patch: ColumnState[] | null } | null {
  const seg = segIds(m, s);
  const i = seg.indexOf(id);
  const others = seg.filter((x) => x !== id);
  const full = fullOrder(m);
  for (let d = 0; d <= seg.length; d++) {
    for (const c of g < i ? [g + d, g - d] : [g - d, g + d]) {
      if (c < 0 || c > seg.length) continue;
      if (i >= 0 && (c === i || c === i + 1)) return { g: c, patch: null };
      const next = reorder(full, id, gapAt(m, full, s, c), locked(m));
      const k = i >= 0 && c > i ? c - 1 : c;
      if (next.filter((x) => x === id || others.includes(x)).indexOf(id) === k) return { g: c, patch: patchOf(m, full, next, id, s) };
    }
  }
  return null;
}

/**
 * The keys (M14, O2): one place toward the end (1) or the start (−1), or to the segment's edge, never across a pinned
 * edge; a locked column is jumped over (M12). `'locked'`, `'edge'`, or null: no such visible column.
 */
export function step(m: M, id: string, by: -1 | 1 | 'start' | 'end'): ColumnState[] | 'edge' | 'locked' | null {
  if (!m.visible().some((c) => c.id === id)) return null;
  const L = locked(m);
  if (L(id)) return 'locked';
  const s = sideOf(m, id);
  const free = segIds(m, s).filter((x) => x === id || !L(x));
  const t = by === 'start' ? free[0] : by === 'end' ? free.at(-1) : free[free.indexOf(id) + by];
  if (!t || t === id) return 'edge';
  const full = fullOrder(m);
  return patchOf(m, full, reorder(full, id, full.indexOf(t) + +(by === 1 || by === 'end'), L), id, s);
}
