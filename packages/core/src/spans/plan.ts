import type { ColumnLayout } from '../columns/model.js';
import type { SpanCell, SpanMap } from './map.js';

/**
 * One row's cells over a span map, as the DOM lays them out: columns counted
 * over the visible ones (start, centre, end), widths in pixels.
 */
export interface RowSpanPlan {
  /** Slots covered by a cell starting elsewhere: no element there. */
  readonly covered: ReadonlySet<number>;
  /** Cells starting in this row that span: what they cover, and their width. */
  readonly cells: ReadonlyMap<number, { readonly rows: number; readonly cols: number; readonly width: number }>;
  /** Centre cells spanning columns: mounted even when their first column leaves the column window. */
  readonly mount: readonly number[];
  /** A cell spanning rows meets the row (it starts here or covers it). */
  readonly spans: boolean;
  /** The row is one cell across. */
  readonly full: boolean;
  /** The cells spanning rows that start in this row, with their column's id. */
  readonly tall: readonly (readonly [string, SpanCell])[];
  /** The row's pinned cells (id, offset in the segment, in the start segment): placed, since a covered slot leaves a hole. */
  readonly pinned: readonly (readonly [string, number, boolean])[];
}

/**
 * The plans of a map's rows over a column layout (step 9b blueprint B): which
 * slots have no element, what a spanned cell covers and how wide it is, what
 * to keep mounted. Null for a row no span meets. Pure.
 */
export function rowPlanner(map: SpanMap, layout: ColumnLayout): (row: number) => RowSpanPlan | null {
  const ids: string[] = [];
  const seg: number[] = [];
  const off: number[] = [];
  const sum = [0];
  [layout.start, layout.center, layout.end].forEach((s, k) => s.columns.forEach((c, i) => {
    ids.push(c.id);
    seg.push(k);
    off.push(s.widths.offsetOf(i));
    sum.push(sum[sum.length - 1]! + s.widths.sizeAt(i));
  }));
  return (row) => {
    const meet = map.inRow(row, 0, ids.length - 1);
    if (!meet.length) return null;
    const covered = new Set<number>();
    const cells = new Map<number, { rows: number; cols: number; width: number }>();
    const mount: number[] = [];
    const tall: [string, SpanCell][] = [];
    for (const s of meet) {
      for (let c = s.col; c < s.col + s.cols; c++) if (s.row !== row || c !== s.col) covered.add(c);
      if (s.row !== row) continue;
      cells.set(s.col, { rows: s.rows, cols: s.cols, width: sum[s.col + s.cols]! - sum[s.col]! });
      if (s.cols > 1 && seg[s.col] === 1) mount.push(s.col);
      if (s.rows > 1) tall.push([ids[s.col]!, s]);
    }
    const pinned: [string, number, boolean][] = [];
    ids.forEach((id, c) => {
      if (seg[c] !== 1 && !covered.has(c)) pinned.push([id, off[c]!, !seg[c]]);
    });
    return { covered, cells, mount, spans: meet.some((s) => s.rows > 1), full: map.fullWidth(row), tall, pinned };
  };
}
