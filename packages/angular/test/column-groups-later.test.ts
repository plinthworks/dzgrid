// Column groups given after `<dz-grid>` is made (found in an Angular app, 2026-10-30; docs/behaviors/spans.md « Grouped headers »).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColumnOrGroup } from '@dzgrid/core';
import { spans } from '@dzgrid/dom/spans';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const FLAT: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N' }, { id: 's', header: 'Status' }];
const GROUPED: ColumnOrGroup<R>[] = [{ id: 'who', header: 'Who', children: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N' }] }, { id: 's', header: 'Status' }];

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns()" [getRowId]="id" [messages]="messages" [features]="features" />`,
})
class Host {
  readonly rows = ROWS.slice(0, 5);
  readonly columns = signal<ColumnOrGroup<R>[]>(FLAT);
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features = [spans()];
}

describe('<dz-grid [columns]> bound to a signal that gets groups later', () => {
  it('the group row appears with the groups, and goes when they go', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => el.querySelectorAll('.dzg-header > [role=row]').length;
    expect(rows()).toBe(1);
    fixture.componentInstance.columns.set(GROUPED);
    fixture.detectChanges();
    expect(rows()).toBe(2);
    expect([...el.querySelectorAll<HTMLElement>('.dzg-hgroup')].map((e) => [e.dataset['g'], e.getAttribute('aria-colspan')])).toEqual([['who', '2']]);
    fixture.componentInstance.columns.set(FLAT);
    fixture.detectChanges();
    expect(rows()).toBe(1);
    expect(el.querySelectorAll('.dzg-hgroup').length).toBe(0);
  });
});
