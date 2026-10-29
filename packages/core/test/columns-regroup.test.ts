// Time-slot column groups (docs/recipes/time-slots.md, step 16d, forecast F:P2): a slot moving from REAL_TIME to
// PAST through `columns.set` keeps the user's width and order by id. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnOrGroup } from '@dzgrid/core';

type R = { id: string };
const slot = (i: number) => ({ id: `s${i}`, header: `${String(i).padStart(2, '0')}:00`, width: 60, value: () => i });
const groups = (now: number): ColumnOrGroup<R>[] => [
  { id: 'PAST', header: 'Passé', children: [1, 2, 3, 4].filter((i) => i < now).map((i) => ({ ...slot(i), editable: false })) },
  { id: 'REAL_TIME', header: 'Temps réel', children: [1, 2, 3, 4].filter((i) => i >= now).map(slot) },
];

describe('a slot crossing from REAL_TIME to PAST', () => {
  it('keeps its width and the user order by id; it is now read-only', () => {
    const columns = createColumnModel<R>(groups(3));
    const kernel = createKernel<R>({ rows: clientRows<R>({ rows: [{ id: 'a' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) }), columns });
    kernel.dispatch({ type: 'column.resize', column: 's3', width: 90, finished: true }, 'user');
    kernel.dispatch({ type: 'column.state', patch: [{ id: 's4', order: -1 }] }, 'user');
    expect(columns.visible().map((c) => c.id)).toEqual(['s4', 's1', 's2', 's3']);
    // « Now » passes 04:00: slot 3 joins PAST.
    kernel.dispatch({ type: 'columns.set', defs: groups(4) }, 'host');
    expect(columns.visible().map((c) => c.id)).toEqual(['s4', 's1', 's2', 's3']);
    expect(columns.state().find((s) => s.id === 's3')!.width).toBe(90);
    expect(columns.get('s3')!.def.editable).toBe(false);
    expect(columns.get('s4')!.def.editable).toBeUndefined();
  });
});
