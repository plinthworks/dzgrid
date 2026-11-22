// 1.17.0 fix (owner's demo, 2026-11-22): a full-width row naming a part (`fullWidth` → `{ part }`) is drawn by a
// `dzgPart` template or a `componentPart('cell', C)` of that name (spans.md « Full-width rows »).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColumnOrGroup } from '@dzgrid/core';
import type { SlotPart } from '@dzgrid/dom';
import { spans } from '@dzgrid/dom/spans';
import { DzGrid, DzgPart, componentPart } from '@dzgrid/angular';
import { MESSAGES, StatusCell, fakeEnv, life, rowId, type R } from './support';

beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
});

const ROWS: R[] = [
  { id: 't0', name: 'Monday', n: 0, s: 'title' },
  { id: 'r1', name: 'ann', n: 1, s: 'odd' },
  { id: 'r2', name: 'bob', n: 2, s: 'even' },
];
const COLS: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }, { id: 's', header: 'S' }];

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" [fullWidth]="full">
    <ng-template dzgPart="day" let-c><em class="day">{{ c.text }}·{{ c.row.id }}</em></ng-template>
  </dz-grid>`,
})
class Host {
  readonly rows = signal<R[]>(ROWS);
  readonly columns = COLS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features = [spans()];
  readonly parts: Record<string, SlotPart> = { status: componentPart('cell', StatusCell) };
  partName = 'day';
  readonly full = (r: Readonly<R>) => (r.s === 'title' ? { part: this.partName } : false);
}

function mount(partName = 'day') {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.partName = partName;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const full = () => el.querySelector<HTMLElement>('.dzg-layer > .dzg-row[data-full] .dzg-cell');
  return { fixture, el, host: fixture.componentInstance, full };
}

describe('a full-width row drawn by an Angular part', () => {
  it('a `dzgPart` template named by the rule draws the cell, with the first column\'s context', () => {
    const t = mount('day');
    expect(t.full()!.querySelector('.day')!.textContent).toBe('Monday·t0');
    expect(t.el.querySelectorAll('.day')).toHaveLength(1);
  });

  it('a `componentPart` named by the rule draws it, and is destroyed when the row stops being full width', () => {
    const t = mount('status');
    expect(t.full()!.querySelector('button.st')!.textContent!.trim()).toBe('Monday');
    expect(life.made).toBe(1);
    t.host.rows.set([{ ...ROWS[0]!, s: 'plain' }, ...ROWS.slice(1)]);
    t.fixture.detectChanges();
    expect(t.full()).toBeNull();
    expect(t.el.querySelector('button.st')).toBeNull();
    expect(life.gone).toBe(1);
  });
});
