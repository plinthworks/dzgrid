import type { PageOptions } from '@dzgrid/core';
import type { ColumnDef, GridEvent, RowIdInput } from '@dzgrid/core';
import type { GridMessages } from './messages.js';
import type { GridFeature } from './features.js';
import type { SlotPart } from './part.js';

/** What a host gives `createGrid` (D3: rows, not a row model, for the client case). */
export interface GridSettings<T> {
  readonly rows?: Iterable<T>;
  readonly getRowId: (row: T) => RowIdInput;
  readonly columns: readonly ColumnDef<T, any>[];
  /** Required (D1): the grid bundles no language. */
  readonly messages: GridMessages;
  readonly locale?: string;
  readonly timeZone?: string;
  readonly numerals?: 'latn' | 'locale';
  /** `auto` follows the host's direction, and its changes. */
  readonly direction?: 'auto' | 'ltr' | 'rtl';
  readonly density?: 'compact' | 'comfortable' | 'spacious';
  readonly selection?: { readonly mode: 'none' | 'single' | 'multi'; readonly checkbox?: boolean; readonly click?: boolean };
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
  /** Paged in the browser: one page of the filtered, sorted rows at a time. Set once. */
  readonly pagination?: PageOptions;
  /** Optional features (`filters()`, `pagination()`…), set up once with the grid. */
  readonly features?: readonly GridFeature[];
}

export const ROW_HEIGHT = { compact: 28, comfortable: 32, spacious: 40 } as const;
