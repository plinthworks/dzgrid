import type { ColumnDef, GridEvent, RowIdInput } from '@dzgrid/core';
import type { GridMessages } from './messages.js';

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
}

export const ROW_HEIGHT = { compact: 28, comfortable: 32, spacious: 40 } as const;
