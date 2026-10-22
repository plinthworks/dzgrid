// A deep link into a lazy tree through [(expanded)] (coverage review of phase 4 step 11).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { lazyChildren } from '@dzgrid/dom/tree-lazy';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  gates = null;
});

type L = { id: string; name: string; parent: string | null; lazy?: boolean };
const k = (id: string): RowKey => dataKey(id)!;
const ids = (s: Iterable<RowKey> | undefined): string[] => [...(s ?? [])].map((x) => String(x).replace(/^d:\d+:/, '')).sort();
/** Set: each load waits until the test lets it through (`gates.get(parent)()`). */
let gates: Map<string, () => void> | null = null;
const load = (r: L): Promise<L[]> =>
  gates ? new Promise((done) => gates!.set(r.id, () => done(KIDS[r.id] ?? []))) : Promise.resolve(KIDS[r.id] ?? []);
const KIDS: Record<string, L[]> = {
  a: [{ id: 'a1', name: 'A.1', parent: 'a', lazy: true }],
  a1: [{ id: 'a11', name: 'A.1.1', parent: 'a1', lazy: true }],
  a11: [{ id: 'a111', name: 'A.1.1.1', parent: 'a11' }],
};

@Component({
  selector: 't-lazy',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
    [expanded]="open()" (expandedChange)="changes.push($event!); open.set($event)" />`,
})
class Lazy {
  readonly rows: L[] = [{ id: 'a', name: 'A', parent: null, lazy: true }, { id: 'b', name: 'B', parent: null }];
  readonly cols: ColumnOrGroup<L>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: L) => r.id;
  readonly messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text } };
  readonly features: GridFeature[] = [
    tree<L>({ parentId: (r) => r.parent, lazy: lazyChildren<L>({ has: (r) => !!r.lazy, load: (r) => load(r as L) }) }),
  ];
  readonly open = signal<ReadonlySet<RowKey> | undefined>(new Set(['a', 'a1', 'a11'].map(k)));
  readonly changes: ReadonlySet<RowKey>[] = [];
}

const flush = async (f: { detectChanges(): void }) => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
  }
};

describe('a deep link into a lazy tree', () => {
  it('three levels named by the host open level by level as their rows load', async () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Lazy);
    fixture.detectChanges();
    await flush(fixture);
    const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<L>;
    const names = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.dzg-layer .dzg-row [data-col="name"]')].map((c) => c.textContent);
    expect(ids(grid.controller.kernel()!.expansion)).toEqual(['a', 'a1', 'a11']);
    expect(names).toEqual(['A', 'A.1', 'A.1.1', 'A.1.1.1', 'B']);
  });

  it('pending keys are not told back until they apply; then the whole path comes back once', async () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Lazy);
    fixture.detectChanges();
    await flush(fixture);
    expect(fixture.componentInstance.changes.every((c) => !c.has(k('a11')) || c.has(k('a1')))).toBe(true);
    expect(ids(fixture.componentInstance.open())).toEqual(['a', 'a1', 'a11']);
  });

  for (const at of ['a', 'a1'] as const) {
    it(`the user closing ${at} before its children load: the pending keys below it are dropped`, async () => {
      const gate = (gates = new Map());
      TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
      const fixture = TestBed.createComponent(Lazy);
      fixture.detectChanges();
      await flush(fixture);
      const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<L>;
      const kernel = grid.controller.kernel()!;
      // Down to the level `at` opened, its children asked for and not arrived yet.
      if (at === 'a1') gate.get('a')!(), await flush(fixture);
      expect(ids(kernel.expansion)).toEqual(at === 'a' ? ['a'] : ['a', 'a1']);
      kernel.dispatch({ type: 'rows.expand', rows: [k(at)], expanded: false }, 'user');
      gate.get(at)!();
      await flush(fixture);
      const want = at === 'a' ? [] : ['a'];
      expect(ids(kernel.expansion)).toEqual(want);
      expect(ids(fixture.componentInstance.open())).toEqual(want);
      // Opened again by the user: what was pending below stays dropped.
      kernel.dispatch({ type: 'rows.expand', rows: [k(at)], expanded: true }, 'user');
      for (const g of gate.values()) g();
      await flush(fixture);
      expect(ids(kernel.expansion)).toEqual([...want, at].sort());
    });
  }

  it('two levels open (the second arrives with the first load)', async () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Lazy);
    fixture.componentInstance.open.set(new Set(['a', 'a1'].map(k)));
    fixture.detectChanges();
    await flush(fixture);
    const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<L>;
    expect(ids(grid.controller.kernel()!.expansion)).toEqual(['a', 'a1']);
  });
});
