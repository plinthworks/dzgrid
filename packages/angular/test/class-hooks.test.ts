// `[rowClass]` on <dz-grid> (showcase themes step 6, owner T5; docs/behaviors/cell-class.md): a row's classes
// from its data, live. `ui.headerClass` and `badge({ classes })` ride on the columns and parts, unchanged here.
// The input costs +41 B gz on @dzgrid/angular: owner T8 grants it (6 250 → 6 300).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColumnOrGroup } from '@dzgrid/core';
import type { RowClassContext } from '@dzgrid/dom';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

@Component({
  selector: 't-rows',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [context]="context()" />`,
})
class Header {
  readonly rows = ROWS;
  readonly columns: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { headerClass: 'uppercase' } }, { id: 'n', header: 'N', type: 'number' }];
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly context = signal<unknown>(undefined);
}

describe('<dz-grid> and ui.headerClass', () => {
  it('the header takes its column’s class', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.dzg-hcell[data-col="name"]')!.classList.contains('uppercase')).toBe(true);
  });
});

@Component({
  selector: 't-rows-rule',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [rowClass]="rule()" [context]="context()" />`,
})
class Host {
  readonly rows = ROWS;
  readonly columns: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { headerClass: 'uppercase' } }, { id: 'n', header: 'N', type: 'number' }];
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly rule = signal<((c: RowClassContext<R>) => string | null) | undefined>((c) => (c.row.n % 2 ? 'odd-row' : null));
  readonly context = signal<unknown>(undefined);
}

describe('<dz-grid [rowClass]> (owner T8)', () => {
  it('puts the rule’s classes on its rows, follows a new rule, and the header takes its column’s class', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const row = (i: number) => el.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${i}"]`)!;
    expect(row(2).classList.contains('odd-row')).toBe(false);
    expect(row(3).classList.contains('odd-row')).toBe(true);
    expect(el.querySelector('.dzg-hcell[data-col="name"]')!.classList.contains('uppercase')).toBe(true);
    fixture.componentInstance.rule.set((c) => (c.context === 'all' ? 'every' : null));
    fixture.componentInstance.context.set('all');
    fixture.detectChanges();
    expect(row(2).classList.contains('every')).toBe(true);
    expect(row(3).classList.contains('odd-row')).toBe(false);
    fixture.componentInstance.rule.set(undefined);
    fixture.detectChanges();
    expect(row(2).classList.contains('every')).toBe(false);
  });
});
