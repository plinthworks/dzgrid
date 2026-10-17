import type { GridContext } from './context.js';
import type { HeaderRowSpec } from './render/header.js';

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
  destroy(): void;
}
