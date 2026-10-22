// [(expanded)] bound to a plain field, and (rowExpanded) writing one, while the grid is made (review of
// phase 4 step 11): the grid is made during the host's change detection, so a model write or an output
// handled then changes what the host's template already read (NG0100 in dev mode). Written before the fix.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

type N = { id: string; parent: string | null; name: string };
const ROWS: N[] = [
  { id: 'a', parent: null, name: 'A' },
  { id: 'a1', parent: 'a', name: 'A1' },
  { id: 'b', parent: null, name: 'B' },
  { id: 'b1', parent: 'b', name: 'B1' },
];
const ids = (s: Iterable<RowKey> | undefined): string[] => [...(s ?? [])].map((x) => String(x).replace(/^d:\d+:/, '')).sort();

@Component({
  selector: 't-plain',
  imports: [DzGrid],
  template: `<p class="o">{{ open?.size ?? 'none' }}</p><p class="f">{{ fired }}</p>
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
      [(expanded)]="open" (rowExpanded)="fired = fired + 1" />`,
})
class Plain {
  readonly rows = ROWS;
  readonly cols: ColumnOrGroup<N>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: N) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text } };
  features: GridFeature[] = [tree<N>({ parentId: (r) => r.parent, initial: 'all' })];
  open: ReadonlySet<RowKey> | undefined;
  fired = 0;
}

function make(setup: (h: Plain) => void = () => {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Plain);
  setup(fixture.componentInstance);
  return fixture;
}

describe('[(expanded)] on a plain field while the grid is made (dev mode)', () => {
  it('a tree opening rows at load (initial all), no model: no NG0100; the field gets the open rows after the first render', async () => {
    const fixture = make();
    expect(() => fixture.detectChanges()).not.toThrow();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ids(fixture.componentInstance.open)).toEqual(['a', 'b']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.o')!.textContent).toBe('2');
  });

  it('a set given at creation, (rowExpanded) writing a field: no NG0100; the host write is told after the first render', async () => {
    const fixture = make((h) => {
      h.features = [tree<N>({ parentId: (r) => r.parent })];
      h.open = new Set([dataKey('a')!]);
    });
    expect(() => fixture.detectChanges()).not.toThrow();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.fired).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('.f')!.textContent).toBe('1');
    const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<N>;
    expect(ids(grid.controller.kernel()!.expansion)).toEqual(['a']);
  });
});
