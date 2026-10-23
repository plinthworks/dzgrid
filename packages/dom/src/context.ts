import type { ColumnModel, DisplayedRows, GridKernel, LocaleCtx, RowKey, RowLayout, RowModel } from '@dzgrid/core';
import type { LiveRegion } from './a11y/live-region.js';
import type { Dir } from './dir.js';
import type { ScrollController } from './interact/scroll.js';
import type { HeaderRenderer } from './render/header.js';
import type { Geometry } from './render/measure.js';
import type { RowRenderer } from './render/rows.js';
import type { FrameScheduler } from './render/scheduler.js';
import type { Scope } from './render/scope.js';
import type { Tooltip } from './render/tooltip.js';
import type { GridSettings } from './settings.js';
import type { ExportMessageKey, FilterMessageKey, MessageKey, PaginationMessageKey } from './messages.js';
import type { HeaderBandSpec, HeaderRowSpec } from './render/header.js';
import type { FeatureHandle, SlotDrivers, SpanFeature } from './features.js';
import type { PartBase, SlotPart } from './part.js';
import type { Warmup } from './warmup.js';
import type { DetailMessageKey, RulesMessageKey, TreeMessageKey } from './part-texts.js';

/** Test seams: what a test without layout replaces. */
export interface GridEnv {
  /** A fake for tests without layout (jsdom); the viewport's own otherwise. */
  readonly geometry?: Geometry;
  /** Render at once instead of on the next frame (tests). */
  readonly sync?: boolean;
  /** The physical cap above which scrolling is mapped (tests lower it). */
  readonly maxPhysical?: number;
  /** Where a pointer is, for the scrollbar drag (tests without layout). */
  readonly isOnScrollbar?: (e: PointerEvent) => boolean;
  /** Frames, when not the window's (tests). */
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

/** A cell or a header to focus once it is mounted. */
export type PendingFocus = { readonly row: RowKey; readonly column: string } | { readonly header: string; readonly level?: number };

/**
 * What the grid's parts share: its elements, its model, its services, and
 * the little state that crosses them (the direction, the focus waiting for
 * its cell, the time of the last key or scroll). One object, so the modules
 * that make the grid are plain functions of it.
 */
export interface GridContext<T> {
  readonly doc: Document;
  readonly win: Window | null;
  readonly env: GridEnv;
  readonly scope: Scope;
  readonly el: {
    readonly root: HTMLElement;
    readonly viewport: HTMLElement;
    readonly header: HTMLElement;
    readonly body: HTMLElement;
    readonly layer: HTMLElement;
    readonly overlay: HTMLElement;
    readonly tooltip: HTMLElement;
  };
  readonly live: LiveRegion;
  readonly tip: Tooltip;
  readonly columns: ColumnModel<T>;
  /** The browser's rows, or a server's (`source`). */
  readonly rows: RowModel<T>;
  readonly kernel: GridKernel<T, RowModel<T>>;
  readonly geometry: Geometry;
  readonly scheduler: FrameScheduler;
  readonly scroll: ScrollController;
  readonly headerRenderer: HeaderRenderer;
  readonly rowRenderer: RowRenderer<T>;
  readonly mac: boolean;

  settings: GridSettings<T>;
  /** Header rows the features add under the column headers. */
  headerRows: readonly HeaderRowSpec[];
  /** Group header rows above the column headers, top to bottom (the spans feature). */
  bands: readonly HeaderBandSpec[];
  /** Cells spanning rows and columns, when the spans feature is on. */
  spans: SpanFeature | null;
  /** Header, overlay and tooltip parts, when the slots feature is on. */
  slots: SlotDrivers | null;
  /** What every part gets, as of the last paint (its `msg` and `announce` never change). */
  partBase?: PartBase;
  /** The quick-search warm-up: a feature holds it and asks for it (the search box, step 16). */
  warm: Warmup;
  /** What the features set up handed back (`afterRows` runs at each paint once the rows are placed). */
  features: readonly FeatureHandle[];
  ctx: LocaleCtx;
  dir: Dir;
  pendingFocus: PendingFocus | null;
  /** A paint is waiting for its frame. */
  queued: boolean;
  /** The grid holds the user's focus (a removed focused row hands it on). */
  hasFocus: boolean;
  /** When focus last moved or a grid key was pressed (D4: a native scroll right after is redone). */
  intentAt: number;
  /** When a key was last pressed (a focus that follows a key shows its tooltip at once). */
  keyboardAt: number;
  /** When the view last scrolled, and how fast (the overscan follows it). */
  scrolledAt: number;
  speed: number;
  /** The browser's default text size at the last paint (`font-size: medium`): the row height follows it. */
  remPx: number;
  /** The view's block size at the last paint (what a screen of rows is, measured). */
  viewBlock: number;
  /**
   * Where the rows sit when a feature gives their heights (D7); the uniform layout otherwise. `was`: the
   * same rows' layout at another row height (density, text zoom), whose heights the feature set (a measure)
   * it carries over.
   */
  layoutFor?: (d: DisplayedRows<T>, h: number, was?: RowLayout) => RowLayout;
  /** The row layout of the rows shown (`rowLayout`): made for the last paint, or since. */
  layout?: RowLayout;
  /** What `layout` was made for: the rows, the row height, the feature's `layoutFor`. */
  laid?: readonly [DisplayedRows<T>, number, unknown];
  /** Rows drawn over the top of the body at the last paint (a tree's pinned parents): their height. */
  inset?: number;
  /** The room a row needs above it to be seen whole (its pinned parents); none when unset. */
  insetFor?: (i: number) => number;

  schedule(): void;
  /** The parts: the features' under the host's `settings.parts`; the same object until that changes. */
  parts(): Readonly<Record<string, SlotPart>>;
  /** A host callback's error: reported, never swallowed, never stopping the grid. */
  report(err: unknown): void;
  now(): number;
  rowHeight(): number;
  /**
   * Scrolls (logically, no paint asked) so display row `i` is seen whole in a view `block` high, under the
   * pinned parents (WCAG 2.4.11): the stack drawn, or the room its own need, whichever is more. True when it moved.
   */
  reveal(i: number, block: number): boolean;
  /** Focus back on the grid's focused cell or header (a popup closed with its anchor gone). */
  restoreFocus(): void;
  msg(key: MessageKey | FilterMessageKey | PaginationMessageKey | ExportMessageKey | RulesMessageKey | TreeMessageKey | DetailMessageKey, params?: Readonly<Record<string, string | number>>): string;
}
