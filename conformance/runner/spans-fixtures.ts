import type { SpanCtx } from '@dzgrid/core';

type Row = Record<string, unknown>;

/**
 * Span rules a case may name (`rowSpan`, `colSpan`, a `merge` function or
 * its `same`, `fullWidth`): a fixture table, the same for every
 * implementation, like kinds.ts for filter kinds. The spans, header-bands
 * and problems suites read it.
 */
export const SPAN_RULES: Record<string, (ctx: SpanCtx<Row>) => number> = {
  // Columns on a row holding the text 'total' anywhere (a total row); 1 elsewhere.
  'total-row-2': (c) => (Object.values(c.row).includes('total') ? 2 : 1),
  'total-row-3': (c) => (Object.values(c.row).includes('total') ? 3 : 1),
  // The cell's own value says how many rows or columns (the data decides).
  value: (c) => c.value as number,
  // Not a whole number.
  half: () => 1.5,
  // The rule fails.
  throws: () => {
    throw new Error('the rule failed');
  },
};

export const SAME_RULES: Record<string, (a: SpanCtx<Row>, b: SpanCtx<Row>) => boolean> = {
  // Same first letter, case ignored.
  'same-initial': (a, b) => String(a.value).slice(0, 1).toLowerCase() === String(b.value).slice(0, 1).toLowerCase(),
};

export const FULL_WIDTH: Record<string, (row: Row) => boolean> = {
  // A row holding the text 'title' anywhere is one wide cell.
  'title-row': (row) => Object.values(row).includes('title'),
};
