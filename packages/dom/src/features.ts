import type { GridContext } from './context.js';
import type { FocusPos, Intent, KeyOwner, ResolvedColumn, RowKey, RowShape } from '@dzgrid/core';
import type { OverlayState } from './render/overlay.js';
import type { TipFor } from './render/tooltip.js';
import type { Goal, Move, MoveShape, SpanLookup } from './keys/move.js';
import type { HeaderBandSpec, HeaderRowSpec } from './render/header.js';
import type { Frame, RowSpans } from './render/rows.js';
import type { HeaderFilter, SlotPart } from './part.js';

/**
 * The seam where optional features plug in (Phase 3: filters, pagination,
 * export, parts). The only file of the base allowed to know them — a test
 * holds the rest of the base to it, so an app that does not use a feature
 * does not ship it. A feature gets the grid's context once and hands back
 * what it adds; `destroy` runs with the grid's.
 */
export interface GridFeature {
  readonly id: string;
  /** Its default parts, under the host's `settings.parts` (the first feature giving a name wins). */
  readonly parts?: Readonly<Record<string, SlotPart>>;
  /**
   * How the browser's rows are shown when not as a flat list (a tree, Phase 4 D2): asked once, before
   * the model is made (a shape is fixed for the grid's life). The first feature giving one wins.
   */
  shape?(): RowShape<unknown>;
  setup(g: GridContext<unknown>): FeatureHandle;
}

/** The model's options a feature's shape adds (none without one). */
export const shapeOf = (features: readonly GridFeature[] | undefined): { shape?: RowShape<any> } => {
  const f = features?.find((x) => x.shape);
  return f ? { shape: f.shape!() } : {};
};

/** The edit seam (Phase 5 step 4, `@dzgrid/dom/edit`): what a data cell shows. The first feature giving one wins. */
export interface EditSeam {
  /** The value a cell shows (the edit overlay, or a refused value held for its 0.5 s), asked instead of `col.read`; called unbound. */
  read(col: ResolvedColumn<unknown>, row: unknown, key: RowKey): unknown;
}

export interface FeatureHandle {
  /** The edit seam (`@dzgrid/dom/edit`): the paint reads the cells through it. */
  readonly edit?: EditSeam;
  /** Header rows under the column headers (a floating filter row). */
  readonly headerRows?: readonly HeaderRowSpec[];
  /** Group header rows above the column headers, top to bottom (the spans feature). */
  readonly bands?: readonly HeaderBandSpec[];
  /** Cells spanning rows and columns (the spans feature): the first feature giving them wins. */
  readonly spans?: SpanFeature;
  /** Header, overlay and tooltip drawn by parts (the slots feature): the first feature giving them wins. */
  readonly slots?: SlotDrivers;
  /**
   * A column header's cell, at each paint, after the base decorated it (sort, grip): what a
   * feature adds beside the label (the filter button, the filtered mark). Level 0 only. `label` is
   * the header's name so far (the sort's, or null: none); a feature returns the name to write
   * instead (nothing: unchanged), written once after every feature, so a paint that changes
   * nothing touches it not.
   */
  decorateHeader?(col: ResolvedColumn<unknown>, cell: HTMLElement, label: string | null): string | void;
  /**
   * The column filter's edits for a header part (the filters feature, step 21): `edits` the
   * column's (null: none; `who`, the part's host, owns its `cancel`), the same object while what it
   * holds is the same; `flush` applies the column's pending edit. The slots feature reads it; neither
   * imports the other.
   */
  readonly filter?: { edits(col: ResolvedColumn<unknown>, who: object): HeaderFilter | null; flush(column: string): void };
  /**
   * A key on the grid, before the grid's own meaning of it (`intentFor`): true when the feature
   * handled it (the grid then only prevents its default). `at`: the focus; `owner`: who has the key.
   */
  keys?(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean;
  /** Runs at each paint before the rows are placed (motion reads the old places, step 26). */
  beforeRows?(): void;
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

/**
 * Where a host's parts take over the base's own header label, overlay and tooltip
 * (`@dzgrid/dom/slots`). Each says whether a part drew it; false, the grid draws its own.
 */
export interface SlotDrivers {
  /** A column header's label (`.dzg-hlabel`), at each paint of its cell. */
  header(col: ResolvedColumn<unknown>, label: HTMLElement): boolean;
  /** The overlay's state at each paint; null: hidden (a part there is destroyed). */
  overlay(state: OverlayState | null): boolean;
  /** The tooltip being shown; null: hidden (a part there is destroyed). */
  tooltip(tip: TipFor | null): boolean;
}
