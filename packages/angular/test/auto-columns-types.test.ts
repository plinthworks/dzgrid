// `autoColumns` with the wrapper's columns (1.12.0, gap M8; auto-columns.md): an Angular component class in `ui.cell`
// of `override` and `add` compiles without a cast under ngc's strict templates (`npm run typecheck`), a wrong value is
// refused, and the columns come back of the wrapper's type for `<dz-grid [columns]>`. Expectations written by hand.
import { it, expect } from 'vitest';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { autoColumns } from '@dzgrid/core/auto-columns';
import type { DzgColumnDef, DzgColumns, DzgPartContext } from '@dzgrid/angular';

type Seed = { id: string; name: string; grams: number; status: string };

@Component({
  selector: 't-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<i>{{ cell().text }}</i>`,
})
class StatusDot {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

const rows: Seed[] = [{ id: 's1', name: 'Basil', grams: 3, status: 'ok' }];

it('takes a component class in override and add, no cast; returns the wrapper\'s columns', () => {
  const { columns, problems } = autoColumns<Seed, DzgColumnDef<Seed>>(rows, {
    hide: ['id'],
    override: { status: { header: 'Status', ui: { cell: StatusDot } } },
    add: [{ id: 'actions', header: 'Actions', ui: { cell: StatusDot } }],
  });
  // What `<dz-grid [columns]>` takes, as is.
  const forTheGrid: DzgColumns<Seed> = columns;
  expect(problems).toEqual([]);
  expect(forTheGrid.map((c) => c.id)).toEqual(['id', 'name', 'grams', 'status', 'actions']);
  expect(columns.find((c) => c.id === 'status')!.ui!.cell).toBe(StatusDot);
  expect(columns.find((c) => c.id === 'actions')!.ui!.cell).toBe(StatusDot);
});

it('refuses a wrong value at compile time (a number is no part)', () => {
  // @ts-expect-error `ui.cell` is a part's name or a component class.
  const { problems } = autoColumns<Seed, DzgColumnDef<Seed>>(rows, { override: { status: { ui: { cell: 42 } } } });
  expect(problems).toEqual([]);
});

it('without a type argument, the core\'s columns as before', () => {
  const { columns } = autoColumns(rows, { override: { status: { ui: { cell: 'dot' } } } });
  expect(columns.find((c) => c.id === 'status')!.ui!.cell).toBe('dot');
});

it('merge is typed with the wrapper\'s columns too (review 1.12.0): a component class taken, a number refused', () => {
  const { columns } = autoColumns<Seed, DzgColumnDef<Seed>>(rows, { merge: { who: { from: ['name', 'status'], header: 'Who', ui: { cell: StatusDot } } } });
  expect(columns.find((c) => c.id === 'who')!.ui!.cell).toBe(StatusDot);
  // @ts-expect-error `ui.cell` is a part's name or a component class.
  autoColumns<Seed, DzgColumnDef<Seed>>(rows, { merge: { who: { from: ['name'], ui: { cell: 42 } } } });
});

it('one type argument, as before 1.12.0: the core\'s columns', () => {
  const { columns } = autoColumns<Seed>(rows, { add: [{ id: 'x', ui: { cell: 'dot' } }] });
  expect(columns.at(-1)!.id).toBe('x');
});
