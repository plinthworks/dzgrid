import { clientRows, createColumnModel, localeCtx, makeQuery, type ColumnDef } from '@dzgrid/core';
import type { Suite } from './index.js';

type Row = Record<string, unknown> & { id: string };

/**
 * A value list in the browser (docs/behaviors/value-list.md): rows, columns,
 * the query in force, then the list of one column with a search and a cap.
 */
export const valueList: Record<string, Suite> = {
  'value-list': (input: { locale: string; numerals?: 'latn' | 'locale'; timeZone?: string; columns: ColumnDef<Row>[]; rows: Row[]; filter?: any; quick?: string; column: string; search?: string; max?: number }) => {
    const m = clientRows<Row>({
      rows: input.rows,
      getRowId: (r) => r.id,
      columns: createColumnModel<Row>(input.columns),
      ctx: localeCtx({ locale: input.locale, ...(input.numerals && { numerals: input.numerals }), ...(input.timeZone && { timeZone: input.timeZone }) }),
    });
    m.setQuery(makeQuery({ filter: input.filter ?? {}, quick: input.quick ?? '' }));
    const h = m.setValues(input.column, { ...(input.search !== undefined && { search: input.search }), ...(input.max !== undefined && { max: input.max }) });
    const out = { ...h.result!, available: h.available };
    return h.problems.length ? { ...out, problems: h.problems.map((p) => [p.code, p.path]) } : out;
  },
};
