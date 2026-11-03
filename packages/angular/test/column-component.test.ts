// A component class in a column (1.4.0, angular-parts.md « A component class in a column »): `ui.cell: LabelCell` with no
// `[parts]` entry; the wrapper names and registers it, the grid sees a string; a `[parts]` name keeps working and wins
// on its own name. Expectations written by hand.
import { it, expect, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SlotPart } from '@dzgrid/dom';
import { DzGrid, componentPart, type DzgColumnOrGroup, type DzgController, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, ROWS, StatusCell, fakeEnv, life, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  life.reset();
});

@Component({
  selector: 't-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<b class="lbl">{{ cell().text }}!</b>`,
})
class LabelCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns()" [getRowId]="id" [messages]="messages" [parts]="parts" (gridReady)="ctl = $event"></dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = signal<readonly DzgColumnOrGroup<R>[]>([
    { id: 'name', header: 'Name', ui: { cell: LabelCell } },
    { id: 'more', header: 'More', children: [{ id: 'n', header: 'N', type: 'number' }, { id: 's', header: 'Status', ui: { cell: 'status' } }] },
  ]);
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly parts: Readonly<Record<string, SlotPart>> = { status: componentPart('cell', StatusCell) };
  ctl: DzgController<R> | null = null;
}

it('ui.cell given a class: drawn by it, the grid seeing a name; a [parts] name beside it unchanged', () => {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const first = document.querySelector('.dzg-layer .dzg-cell[data-col="name"] .lbl')!;
  expect(first.textContent).toBe(`${ROWS[0]!.name}!`);
  expect(document.querySelector('.dzg-layer .dzg-cell[data-col="s"] .st')!.textContent).toBe(ROWS[0]!.s);
  const g = fixture.componentInstance.ctl!.grid()!;
  const ui = g.kernel.columns.get('name')!.def.ui!;
  expect(typeof ui.cell).toBe('string');
  expect(ui.cell).toBe('dzg-ng-cell-' + ui.cell!.split('-').pop());
  expect(g.kernel.columns.get('s')!.def.ui!.cell).toBe('status');
  // A new array, the same class: the same name.
  const was = ui.cell;
  fixture.componentInstance.columns.update((c) => [...c]);
  fixture.detectChanges();
  expect(g.kernel.columns.get('name')!.def.ui!.cell).toBe(was);
  expect(document.querySelector('.dzg-layer .dzg-cell[data-col="name"] .lbl')).not.toBeNull();
});
