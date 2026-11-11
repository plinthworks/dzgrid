import type { OperationsInput, PageOptions, SourceBinding } from '@dzgrid/core';
import type { AnyFilterKind, ColumnOrGroup, GridEvent, RowIdInput, DataNode, RowKey, SelectionState } from '@dzgrid/core';
import type { GridMessages } from './messages.js';
import type { GridFeature } from './features.js';
import type { SlotPart } from './part.js';
import type { GridIcons, GridTheme } from './look.js';

/** What a host gives `createGrid` (D3: rows, not a row model, for the client case). */
export interface GridSettings<T> {
  /** @default [] */
  readonly rows?: Iterable<T>;
  readonly getRowId: (row: T) => RowIdInput;
  /** Columns, or groups of them (a group's header needs the spans feature; the base keeps its columns). */
  readonly columns: readonly ColumnOrGroup<T>[];
  /** Required (D1): the grid bundles no language. */
  readonly messages: GridMessages;
  /** @default {messagesLocale} */
  readonly locale?: string;
  /** @default 'UTC' */
  readonly timeZone?: string;
  /** @default 'latn' */
  readonly numerals?: 'latn' | 'locale';
  /**
   * `auto` follows the host's direction, and its changes.
   * @default 'auto'
   */
  readonly direction?: 'auto' | 'ltr' | 'rtl';
  /** @default 'comfortable' */
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  /**
   * `'hidden'`: no header row on screen, kept for screen readers and shown while the keyboard is in it
   * (docs/behaviors/hidden-headers.md, 1.9.0). Live. Default `'shown'`.
   * @default 'shown'
   */
  readonly headers?: 'shown' | 'hidden';
  /**
   * False: one sort only — Shift+click, Shift+Enter and a header part's `toggleSort(true)` act as a plain
   * click (sort.md « One sort only »); the app's own `sort.set` of several is kept. True by default. Fixed.
   * @default true
   */
  readonly multiSort?: boolean;
  /**
   * A full reload (`rows` again, a server's answer) compares a row kept by id with its new copy: equal, it is
   * unchanged and keeps its old object, so only real changes flash (row-identity-transactions.md « Rows compared by
   * value »; `sameValues` from `@dzgrid/core/compare`). A throw: changed, one warning per load. Fixed.
   */
  readonly sameRow?: (a: T, b: T) => boolean;
  /**
   * The row height in px at 16 px text, over the density's (owner D1, virtual-scroll.md « Row height »):
   * from 24 to 1 000, grown with the reader's text size; header rows follow unless `headerHeight` is set. Anything else
   * is told (`invalid-setting`, a warning) and the density's height is used. Live.
   * @default {densityHeight}
   */
  readonly rowHeight?: number;
  /**
   * The column headers' row and the column-group rows above it, in px at 16 px text (density.md « Header height »,
   * 1.9.0): the same rule as `rowHeight` (24 to 1 000, grown with the text size, else told and ignored); a feature's
   * row under the headers (the filter row) keeps the row height. Absent: the row height. Live. 1.10.0: `{ columns,
   * groups }` sets them apart (« Group rows' height »): `columns` absent the row height, `groups` absent the columns'.
   * @default {rowHeight}
   */
  readonly headerHeight?: number | HeaderHeights;
  /**
   * `keepOnFilter`: false clears the selection when a filter or the search changes (a sort or
   * a page never does); true by default, rows ticked stay ticked even once hidden. `canSelect`
   * (step 21, docs/behaviors/selection-rules.md, needs `rules()`): whether a row may join the
   * selection; true allows, false refuses, a string refuses and is said ('' refuses unsaid). Never asked to untick; its `selection` keeps changing while one action is vetted (copy it to keep it).
   * @default { mode: 'none' }
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
  /** @default null */
  readonly overlay?: 'loading' | 'error' | null;
  /**
   * The host is reloading rows it keeps on screen (a poll, its own arrows; 1.4.0, overlays.md « Busy bar »):
   * `aria-busy` on the grid at once, a thin bar under the header after 200 ms (held 400 ms once shown), never with
   * the loading overlay. A server's request with rows kept shows it by itself. Live; nothing announced.
   * @default false
   */
  readonly busy?: boolean;
  /**
   * The grid's accessible name, already translated; the bundle's `grid.label` otherwise.
   * @default {bundleLabel}
   */
  readonly label?: string;
  /** @default { delayMs: 500 } */
  readonly tooltips?: { readonly delayMs?: number };
  readonly onEvent?: (e: GridEvent<T>) => void;
  /**
   * False when the host loads the layout CSS itself (strict CSP).
   * @default true
   */
  readonly injectStyles?: boolean;
  readonly nonce?: string;
  /** @default {overscanAuto} */
  readonly overscan?: { readonly rows?: number; readonly cols?: number };
  /**
   * `idle` prepares the quick search after each load, in idle time, so the
   * first keystroke is instant — at the cost of holding the search caches
   * (627 bytes a row measured on dataset A's ten text columns; budget for the owner, D13). Off by default (D13).
   * @default 'off'
   */
  readonly searchWarmup?: 'idle' | 'off';
  /**
   * Parts by name: a column says `ui: { cell: 'statusBadge' }`, or a part
   * replaces a default for a type (`'cell.number'`). One registry per grid.
   */
  readonly parts?: Readonly<Record<string, SlotPart>>;
  /** A server's rows: `sourceRows(data, …)` from `@dzgrid/core/server`. Live: another source asks again. */
  readonly source?: SourceBinding<T>;
  /**
   * Where filter, search, sort and page run (`'server'`, `'client'`, or per operation). Set once.
   * @default {operationsAuto}
   */
  readonly operations?: OperationsInput;
  /** Paged in the browser: one page of the filtered, sorted rows at a time. Set once. */
  readonly pagination?: PageOptions;
  /** Custom filter kinds (docs/behaviors/filter-custom.md), for the browser's filter and a server's. Set once. */
  readonly filterKinds?: readonly AnyFilterKind[];
  /**
   * The clock (milliseconds since 1970 UTC) date shortcuts count from (filter-relative.md); `Date.now` by default. Set once.
   * @default Date.now
   */
  readonly clock?: () => number;
  /**
   * Rows drawn as one cell across the whole width (a title, a note): true, or the
   * part that draws it. Needs the spans feature; the base ignores it.
   */
  readonly fullWidth?: (row: Readonly<T>) => boolean | { readonly part?: string };
  /**
   * False: no motion (`@dzgrid/dom/motion-gsap` stops, `data-motion="off"` on the root for the theme). Live.
   * @default true
   */
  readonly motion?: boolean;
  /**
   * CSS variables written on the grid's root, by typed keys (`{ rowOddBg: '…', headerWeight: 500 }`;
   * presentation-settings.md 20–22, 1.9.0). Needs `theming()` from `@dzgrid/dom/theme`; a bad key or value is told
   * (`invalid-setting`) and skipped. Live.
   */
  readonly theme?: GridTheme;
  /** The application's own icons for the grid's marks (presentation-settings.md 17–19). Needs `theming()`. Live. */
  readonly icons?: GridIcons;
  /**
   * Optional features (`filters()`, `pagination()`…), set up once with the grid.
   * @default []
   */
  readonly features?: readonly GridFeature[];
}

/** What `rowClass` is told about one data row: the row, its key, `settings.context`. */
export interface RowClassContext<T> {
  readonly row: Readonly<T>;
  readonly key: RowKey;
  readonly context: unknown;
  /** A pinned row's side (`@dzgrid/dom/pinned-rows`, step 8b-1); absent on a body row. */
  readonly pinned?: 'top' | 'bottom';
}

export const ROW_HEIGHT = { compact: 28, comfortable: 32, spacious: 40 } as const;

/** `rowHeight` when the grid takes it (a number from 24, WCAG 2.5.8's target size, to 1 000), else undefined. */
/** `headerHeight` apart (1.10.0, density.md « Group rows' height »): the column headers' row, the column-group rows. */
export interface HeaderHeights {
  readonly columns?: number;
  readonly groups?: number;
}

export const rowPx = (v: unknown): number | undefined => (typeof v == 'number' && v >= 24 && v <= 1e3 ? v : undefined);

/** A `headerHeight` (a number: every header row; 1.10.0 an object, by member) scaled as `rowHeight`; undefined: none. */
export function headerPx(s: { readonly headerHeight?: number | HeaderHeights | undefined }, k: keyof HeaderHeights, remPx: number): number | undefined {
  const v = s.headerHeight;
  const n = rowPx(v && typeof v == 'object' ? v[k] : v);
  return n && Math.max(24, Math.round((n * remPx) / 16));
}
