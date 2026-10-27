import type { DisplayedRows, FocusPos, Intent, RowKey } from '@dzgrid/core';

/**
 * The pure part of the pinned rows (Phase 6 step 8b-1, docs/behaviors/pinned-rows.md 4, 8, 9; O8): the bands' heights
 * under the half-view cap, and where a key moves the focus across the header, the top band, the body and the bottom band.
 * No DOM: the feature asks, then focuses the answer.
 */

/** What `crossBand` reads of the grid: the bands' keys, the body's rows, the last header row, a page, the columns. */
export interface CrossShape {
  readonly top: readonly RowKey[];
  readonly bottom: readonly RowKey[];
  readonly body: Pick<DisplayedRows<unknown>, 'count' | 'index' | 'keyAt' | 'indexOf'>;
  /** The last header row's level (0: the column headers; a floating filter row: 1). */
  readonly level: number;
  /** Rows a page key moves by. */
  readonly page: number;
  /** The visible columns, in order: Ctrl+Home / Ctrl+End take the first / last. */
  readonly cols?: readonly string[];
}

/**
 * Where a key leads from `from` when the bands are concerned (the plan's table, step08b-plan.md §3), or undefined when it
 * is the grid's own move (inside the body, a header row above the last, Left / Right / Home / End inside a pinned row).
 * `from` itself: the key leads nowhere (the focus stays). `inside` (the editors' Enter, range's Shift keys): a band's edge
 * stops a move, a body row's move and a band's page or edge key are the grid's own (never across an edge, O8, review R3).
 */
export function crossBand(s: CrossShape, from: FocusPos, intent: Intent, inside?: boolean): FocusPos | undefined {
  const { top: T, bottom: B, body: d } = s;
  const n = d.count;
  const c = from.column;
  const cell = (row: RowKey, column = c): FocusPos => ({ kind: 'cell', row, column });
  const row = (i: number): FocusPos => cell(d.keyAt(d.index(i)!));
  const down = intent.kind === 'move' && intent.axis === 'row' && intent.delta > 0;
  const up = intent.kind === 'move' && intent.axis === 'row' && intent.delta < 0;
  // The last header row: Down to the first top row (no body rows either: the first bottom row).
  if (from.kind === 'header') return down && (from.level ?? 0) === s.level ? (T[0] ? cell(T[0]) : !n && B[0] ? cell(B[0]) : undefined) : undefined;
  const t = T.indexOf(from.row);
  const b = B.indexOf(from.row);
  if (t < 0 && b < 0) {
    const r = d.indexOf(from.row);
    const x = up && !r && T.length ? cell(T[T.length - 1]!) : down && r === n - 1 && B[0] ? cell(B[0]) : undefined;
    // `inside` (the editors' Enter, range's Shift keys): a band's edge stops a body row's move too (review R3, O8).
    return x && inside ? from : x;
  }
  // Left, Right, Home, End: inside the row (the grid's move over the band).
  if ('axis' in intent && intent.axis === 'col') return undefined;
  const band = t < 0 ? B : T;
  if (intent.kind === 'move') {
    const j = (t < 0 ? b : t) + intent.delta;
    if (band[j]) return cell(band[j]);
    if (inside) return from;
    // Out of the top band: up to the last header row, down to the body (none: the bottom band); out of the bottom band:
    // up to the body (none: the top band, none: the header), down nowhere.
    const head: FocusPos = { kind: 'header', column: c, level: s.level || undefined } as FocusPos;
    if (t >= 0) return up ? head : n ? row(0) : B[0] ? cell(B[0]) : from;
    return down ? from : n ? row(n - 1) : T.length ? cell(T[T.length - 1]!) : head;
  }
  // `inside`: a page or an edge key is the grid's own move over the band (range's Shift keys, step 8b-2: never the body).
  if (inside) return;
  if (!n) return from;
  // Ctrl+Up / Down: the body's first / last row, the column kept; Ctrl+Home / End: its first / last column too (O8).
  if (intent.kind === 'edge') {
    const last = intent.to === 'last';
    const cols = intent.axis === 'both' && s.cols?.length ? s.cols : null;
    return cell(d.keyAt(d.index(last ? n - 1 : 0)!), cols ? cols[last ? cols.length - 1 : 0] : c);
  }
  // A page into the body, toward it only: from the top band as from the header, from the bottom band from the body's end.
  if (intent.kind === 'page') return (t >= 0) !== intent.delta > 0 ? from : row(t >= 0 ? Math.min(n - 1, s.page - 1) : Math.max(0, n - s.page));
  return undefined;
}

/**
 * The bands' heights (px) for a view `view` px high (the body's view before them), rows `h` tall: their own when both fit
 * in half of it; else the top band first (at least half of that half), the bottom band the rest; whole rows, and at least
 * one row for a band that has any (a band never hides; a tiny view may leave the body none, pinned-rows.md 4, O8).
 */
export function bandHeights(top: number, bottom: number, view: number, h: number): [number, number] {
  const cap = Math.floor(view / 2);
  if (top + bottom <= cap) return [top, bottom];
  const whole = (x: number, own: number): number => (own ? Math.min(own, Math.max(h, Math.floor(x / h) * h)) : 0);
  const t = whole(Math.min(top, Math.max(cap / 2, cap - bottom)), top);
  return [t, whole(Math.min(bottom, cap - t), bottom)];
}
