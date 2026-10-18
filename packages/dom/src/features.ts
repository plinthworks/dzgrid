import type { GridContext } from './context.js';
import type { SpanLookup } from './keys/move.js';
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

/** The spans feature's side of the grid: the rows' plans, and the map the keys move over. */
export interface SpanFeature extends RowSpans {
  readonly map: SpanLookup | null;
}
