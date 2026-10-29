import type { CellAddr, ColumnModel, DisplayedRows, GridKernel, Intent, LocaleCtx, RowKey, RowLayout, RowModel } from '@dzgrid/core';
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
import type { EditSeam, FeatureHandle, GroupsApi, MoveFn, SlotDrivers, SpanFeature } from './features.js';
import type { CellInput, PartBase, SlotPart } from './part.js';
import type { Warmup } from './warmup.js';
import type { DetailMessageKey, EditMessageKey, EditorsMessageKey, RangeMessageKey, FillMessageKey, ColumnsMessageKey, ColumnsChooserMessageKey, ColumnMenuMessageKey, PinnedMessageKey, PrintMessageKey, RulesMessageKey, TreeMessageKey } from './part-texts.js';

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
  layoutFor?: ((d: DisplayedRows<T>, h: number, was?: RowLayout) => RowLayout) | undefined;
  /**
   * After a paint, before the browser shows it (`@dzgrid/dom/auto-height`, Phase 6 step 9): reads what the paint wrote (one
   * layout read, after every write) and says true when the rows must be laid out again; the grid then paints again in
   * the same frame, three times at most (a fourth: at the next frame), so the screen shows the measured rows only (S3).
   */
  again?: (() => boolean) | undefined;
  /** The row layout of the rows shown (`rowLayout`): made for the last paint, or since. */
  layout?: RowLayout;
  /** What `layout` was made for: the rows, the row height, the feature's `layoutFor`. */
  laid?: readonly [DisplayedRows<T>, number, unknown];
  /** Rows drawn over the top of the body at the last paint (a tree's pinned parents): their height. */
  inset?: number;
  /** The room a row needs above it to be seen whole (its pinned parents); none when unset. */
  insetFor?: (i: number) => number;
  /** The tree's column, set by `tree()` (1.1.0 step 15): the spans feature merges leaves only there (spans.md « In a tree »). */
  treeColumn?: () => string | undefined;
  /** A gap stands before row `i` of these rows (`@dzgrid/dom/row-gaps`): the spans feature cuts a merge there. */
  gapAt?: (rows: DisplayedRows<T>, i: number) => boolean;
  /** The gaps' layout around the one `rowLayout()` made (`@dzgrid/dom/row-gaps`): always the outermost. */
  gapsFor?: (rows: DisplayedRows<T>, inner: RowLayout) => RowLayout;

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
  /** Scrolls a row (and a column) into view as a focus move would, clear of the pinned columns and rows; the focus untouched (`api.ensureVisible`). */
  ensureVisible(row: RowKey, column?: string): void;
  /** A shown tooltip asked again for its anchor (its cell's own text changed: a failed save, step 7); none: hidden. */
  retip(anchor: HTMLElement): void;
  /** Focus back on the grid's focused cell or header (a popup closed with its anchor gone). */
  restoreFocus(): void;
  /** A double-click on a column's resize grip: set by `columns()` (auto-size, Phase 6 step 6); absent, nothing. */
  fit?: ((column: string) => void) | undefined;
  /** The collapsible header groups (`@dzgrid/dom/groups`, set at its setup): read by the state and menu features. */
  groups?: GroupsApi;
  /** The group rows (`@dzgrid/dom/spans`, set at its setup): where a group shows (its row and header), for `groups()`. */
  groupBands?: { find(id: string): { readonly level: number; readonly label: string } | undefined };
  /** A group's header painted (by `spans()`): its button and name added by `groups()`. */
  groupCell?: (cell: HTMLElement, group: string, label: string) => void;
  /** The edit seam (`@dzgrid/dom/edit`), the first feature's that gives one: found once, at setup. */
  edit?: EditSeam | undefined;
  /**
   * The editor open in a cell (retained-row contract 5): the paint leaves that cell's value, part and classes.
   * Its host is `@dzgrid/dom/editors` (Phase 5 step 5).
   */
  editor?: { readonly key: RowKey; readonly column: string; readonly cell: HTMLElement; readonly field: HTMLElement } | null;
  /**
   * A feature selects blocks of cells (`@dzgrid/dom/range`, Phase 5 step 11a): the grid says `aria-multiselectable`
   * whatever the row selection, and a Shift+click on a cell is the feature's (rows are ticked by their box, owner QB1);
   * Escape on a cell then puts the grid in its quiet state (`data-dzg-quiet` on the root, owner S12-Q16).
   */
  multi?: boolean;
  /**
   * Bulk edit (`@dzgrid/dom/fill`, Phase 5 step 12, owner QB5): Ctrl/Cmd+Enter in a field at `at` keeps `input` (undefined:
   * the field unchanged, the value shown) in every cell of the block; null when the cell is in no block (the editors then
   * keep it as Enter, without the move); `own` the field's own cell's refusal code (it stays open). Set by `fill()`.
   */
  bulk?: (at: CellAddr, input: CellInput | undefined) => { readonly own?: string | undefined } | null;
  /** Moves the focus as the grid's own keys would (the router's move: spans, details, the last row stays); the editors' Enter. */
  step?(intent: Intent): void;
  /**
   * The pinned rows (`@dzgrid/dom/pinned-rows`, Phase 6 step 8b-1), set at its setup: how many on each side, `[top, bottom]`
   * (the paint counts them in `aria-rowcount`, and numbers the body's rows after the top ones); the key moves across the
   * bands, over the spans' and the grid's own (`base`); a pinned key's band rows (undefined: a body row's, read
   * `rows.displayed`): what the editors' Tab walks, inside one band.
   */
  pins?: readonly [number, number] | undefined;
  move?: MoveFn | undefined;
  rowsOf?: ((key: RowKey) => DisplayedRows<T> | undefined) | undefined;
  /**
   * The pinned rows for the pointer (step 8b-2, set by `pinnedRows()`): the top band's height at the last read of the view
   * (px: the body's rows start that far under the header), and the row of `key`'s band under `y` (px from the body's top,
   * clamped to the rows the band shows) — undefined when `key` is not a pinned row's.
   */
  pinTop?: number | undefined;
  pinAt?: ((key: RowKey, y: number) => RowKey | undefined) | undefined;
  msg(key: MessageKey | FilterMessageKey | PaginationMessageKey | ExportMessageKey | RulesMessageKey | TreeMessageKey | DetailMessageKey | EditMessageKey | EditorsMessageKey | RangeMessageKey | FillMessageKey | ColumnsMessageKey | ColumnsChooserMessageKey | ColumnMenuMessageKey | PinnedMessageKey | PrintMessageKey, params?: Readonly<Record<string, string | number>>): string;
}
