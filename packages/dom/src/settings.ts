import type { OperationsInput, PageOptions, SourceBinding } from '@dzgrid/core';
import type { AnyFilterKind, ColumnOrGroup, GridEvent, RowIdInput, DataNode, RowKey, SelectionState } from '@dzgrid/core';
import type { GridMessages } from './messages.js';
import type { GridFeature } from './features.js';
import type { SlotPart } from './part.js';

/** What a host gives `createGrid` (D3: rows, not a row model, for the client case). */
export interface GridSettings<T> {
  readonly rows?: Iterable<T>;
  readonly getRowId: (row: T) => RowIdInput;
  /** Columns, or groups of them (a group's header needs the spans feature; the base keeps its columns). */
  readonly columns: readonly ColumnOrGroup<T>[];
  /** Required (D1): the grid bundles no language. */
  readonly messages: GridMessages;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly numerals?: 'latn' | 'locale';
  /** `auto` follows the host's direction, and its changes. */
  readonly direction?: 'auto' | 'ltr' | 'rtl';
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  /**
   * The row height in px at 16 px text, over the density's (owner D1, virtual-scroll.md « Row height »):
   * from 24 to 1 000, grown with the reader's text size; header rows follow. Anything else is told
   * (`invalid-setting`, a warning) and the density's height is used. Live.
   */
  readonly rowHeight?: number;
  /**
   * `keepOnFilter`: false clears the selection when a filter or the search changes (a sort or
   * a page never does); true by default, rows ticked stay ticked even once hidden. `canSelect`
   * (step 21, docs/behaviors/selection-rules.md, needs `rules()`): whether a row may join the
   * selection; true allows, false refuses, a string refuses and is said ('' refuses unsaid). Never asked to untick; its `selection` keeps changing while one action is vetted (copy it to keep it).
   */
  readonly selection?: {
    readonly mode: 'none' | 'single' | 'multi'; readonly checkbox?: boolean; readonly click?: boolean; readonly keepOnFilter?: boolean;
    readonly canSelect?: (row: DataNode<T>, selection: SelectionState, context: unknown) => boolean | string;
  };
  /**
   * The application's own context (step 21): handed to every part (`context`), `canSelect`, the
   * export's `canExport` and the tooltip callback. Live; a new value is a new identity (pass a new object).
   */
  readonly context?: unknown;
  /**
   * Classes for a data row from its data (showcase themes step 6, cell-class.md): space-separated, null for
   * none; asked when the row is bound again (another row, new data, columns, language, context or rule). Live.
   * Keep the same function from one update to the next: a new one (an inline arrow) binds every row again.
   */
  readonly rowClass?: (c: RowClassContext<T>) => string | null | undefined;
  readonly overlay?: 'loading' | 'error' | null;
  /** The grid's accessible name, already translated; the bundle's `grid.label` otherwise. */
  readonly label?: string;
  readonly tooltips?: { readonly delayMs?: number };
  readonly onEvent?: (e: GridEvent<T>) => void;
  /** False when the host loads the layout CSS itself (strict CSP). */
  readonly injectStyles?: boolean;
  readonly nonce?: string;
  readonly overscan?: { readonly rows?: number; readonly cols?: number };
  /**
   * `idle` prepares the quick search after each load, in idle time, so the
   * first keystroke is instant — at the cost of holding the search caches
   * (627 bytes a row measured on dataset A's ten text columns; budget for the owner, D13). Off by default (D13).
   */
  readonly searchWarmup?: 'idle' | 'off';
  /**
   * Parts by name: a column says `ui: { cell: 'statusBadge' }`, or a part
   * replaces a default for a type (`'cell.number'`). One registry per grid.
   */
  readonly parts?: Readonly<Record<string, SlotPart>>;
  /** A server's rows: `sourceRows(data, …)` from `@dzgrid/core/server`. Live: another source asks again. */
  readonly source?: SourceBinding<T>;
  /** Where filter, search, sort and page run (`'server'`, `'client'`, or per operation). Set once. */
  readonly operations?: OperationsInput;
  /** Paged in the browser: one page of the filtered, sorted rows at a time. Set once. */
  readonly pagination?: PageOptions;
  /** Custom filter kinds (docs/behaviors/filter-custom.md), for the browser's filter and a server's. Set once. */
  readonly filterKinds?: readonly AnyFilterKind[];
  /** The clock (milliseconds since 1970 UTC) date shortcuts count from (filter-relative.md); `Date.now` by default. Set once. */
  readonly clock?: () => number;
  /**
   * Rows drawn as one cell across the whole width (a title, a note): true, or the
   * part that draws it. Needs the spans feature; the base ignores it.
   */
  readonly fullWidth?: (row: Readonly<T>) => boolean | { readonly part?: string };
  /** False: no motion (`@dzgrid/dom/motion-gsap` stops, `data-motion="off"` on the root for the theme). Live. */
  readonly motion?: boolean;
  /** Optional features (`filters()`, `pagination()`…), set up once with the grid. */
  readonly features?: readonly GridFeature[];
}

/** What `rowClass` is told about one data row: the row, its key, `settings.context`. */
export interface RowClassContext<T> {
  readonly row: Readonly<T>;
  readonly key: RowKey;
  readonly context: unknown;
}

export const ROW_HEIGHT = { compact: 28, comfortable: 32, spacious: 40 } as const;

/** `rowHeight` when the grid takes it (a number from 24, WCAG 2.5.8's target size, to 1 000), else undefined. */
export const rowPx = (v: unknown): number | undefined => (typeof v == 'number' && v >= 24 && v <= 1e3 ? v : undefined);
