import type { GridContext } from './context.js';
import type { FocusPos, Intent, RowKey } from '@dzgrid/core';
import type { Goal, Move, MoveShape, SpanLookup } from './keys/move.js';
import type { HeaderBandSpec, HeaderRowSpec } from './render/header.js';
import type { Frame, RowSpans } from './render/rows.js';

/**
 * The seam where optional features plug in (Phase 3: filters, pagination,
 * export, parts). The only file of the base allowed to know them — a test
 * holds the rest of the base to it, so an app that does not use a feature
 * does not ship it. A feature gets the grid's context once and hands back
 * what it adds; `destroy` runs with the grid's.
 */
export interface GridFeature {
  readonly id: string;
  setup(g: GridContext<unknown>): FeatureHandle;
}

export interface FeatureHandle {
  /** Header rows under the column headers (a floating filter row). */
  readonly headerRows?: readonly HeaderRowSpec[];
  /** Group header rows above the column headers, top to bottom (the spans feature). */
  readonly bands?: readonly HeaderBandSpec[];
  /** Cells spanning rows and columns (the spans feature): the first feature giving them wins. */
  readonly spans?: SpanFeature;
  /** Runs at each paint once the rows are placed (what is drawn over them). */
  afterRows?(f: Frame<unknown>): void;
  destroy(): void;
}

/** Where a key moves the focus (`moveFocus`); a feature's version gets the base one for what it leaves to it. */
export type MoveFn = (map: SpanLookup | null, s: MoveShape, from: FocusPos, goal: Goal | null, intent: Intent, base?: MoveFn) => Move | null;

/** The spans feature's side of the grid: the rows' plans, the map, the keys and the pointer over spanned cells. */
export interface SpanFeature extends RowSpans {
  /** Where the cells span, for what reads them by position (the grid's own keys do not: the feature's `move` does). */
  readonly map?: SpanLookup | null;
  /** Moves over spanned cells (the body's); `base`, the grid's own, for the rest. */
  readonly move?: MoveFn;
  /**
   * The row a cell spanning rows stands for: for a click (the event), the row under the
   * pointer; for a focus on a cell (its row), the row aimed at, which is brought into view.
   * Undefined: the cell's own row.
   */
  at(x: MouseEvent | RowKey): RowKey | undefined;
  /** Rows to keep mounted besides the window (the origins of tall cells reaching into it). */
  anchors(first: number, last: number): readonly RowKey[];
}
