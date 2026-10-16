import { clientRows, createColumnModel, dataKey, idOfDataKey, localeCtx, makeQuery, nextSort, reconcileFocus, type FocusPos } from '@dzgrid/core';
import type { Suite } from './index.js';

type Row = { id: string };
/** Displayed rows in a given order: a client model sorted by each row's place in that order. */
const shown = (ids: readonly string[]) => {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const m = clientRows<Row>({ rows: ids.map((id) => ({ id })), getRowId: (r) => r.id, columns: createColumnModel<Row>([{ id: 'rank', type: 'number', value: (r) => rank.get(r.id)! }]), ctx: localeCtx({ locale: 'en-US' }) });
  m.setQuery(makeQuery({ sort: [{ column: 'rank', dir: 'asc' }] }));
  return m.displayed;
};
const key = (f: any): FocusPos | null => (f === null ? null : f.kind === 'header' ? f : { ...f, row: dataKey(f.row)! });
const out = (f: FocusPos | null) => (f === null ? null : f.kind === 'header' ? f : { ...f, row: idOfDataKey(f.row) });

export const kernel: Record<string, Suite> = {
  'sort-toggle': ({ sort, column, multi }) => ({ sort: nextSort(sort, column, multi) }),
  'focus-fallback': ({ before, after, focus, columns }) => {
    const cols = createColumnModel<Row>((columns as string[]).map((id) => ({ id })));
    return { focus: out(reconcileFocus(key(focus), shown(before), shown(after), cols)) };
  },
};
