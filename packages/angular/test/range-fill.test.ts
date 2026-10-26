// Blocks and the fill in Angular (Phase 5 step 12, step12-plan.md « API » B15, tests 8): `DzgController.range()` and
// `DzgController.fill()` (the `range()` / `fill()` features given in `[features]`, as `edit()`): null before the grid,
// without the feature, after destroy; the outputs `(rangeChanged)` and `(rangeCopied)`, each the grid's own event, once
// per event; a fill's writes come as the existing `(cellEdited)`. Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent } from '@dzgrid/core';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { EN_RANGE } from '@dzgrid/dom/locales/en-range';
import { EN_FILL } from '@dzgrid/dom/locales/en-fill';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, sid, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...EMSG, text: { ...EMSG.text, ...EN_RANGE.text, ...EN_FILL.text } };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event"
    (rangeChanged)="out.push($event)" (rangeCopied)="out.push($event)" (cellEdited)="out.push($event)" />`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = SCOLS;
  readonly id = sid;
  readonly messages = MSG;
  features: GridFeature[] = [];
  ctl: DzgController<St> | null = null;
  readonly out: GridEvent<St>[] = [];
}

function mount(features: (r: ReturnType<typeof range>) => GridFeature[]) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const r = range();
  fixture.componentInstance.features = features(r);
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<St>;
  return { fixture, host: fixture.componentInstance, ctl, r };
}

describe('controller.range() and controller.fill()', () => {
  it('null before the grid, the features\' api once it is there, null after destroy', () => {
    const t = mount((r) => [edit<St>(), r, fill(r)]);
    expect(t.ctl.range()).toBeNull();
    expect(t.ctl.fill()).toBeNull();
    t.fixture.detectChanges();
    expect(t.ctl.range()).toBe(t.r.api({ kernel: t.ctl.kernel()! }));
    expect(t.ctl.fill()).not.toBeNull();
    t.fixture.destroy();
    expect(t.ctl.range()).toBeNull();
    expect(t.ctl.fill()).toBeNull();
  });

  it('null without the features', () => {
    const t = mount(() => [edit<St>()]);
    t.fixture.detectChanges();
    expect(t.ctl.range()).toBeNull();
    expect(t.ctl.fill()).toBeNull();
  });

  it('(rangeChanged) and (rangeCopied) once per event; a fill comes as (cellEdited), origin fill', () => {
    const t = mount((r) => [edit<St>(), r, fill(r)]);
    t.fixture.detectChanges();
    const k = (id: string) => dataKey(id)!;
    t.ctl.focusCell(k('p1'), 'stock');
    t.ctl.range()!.set({ anchor: { row: k('p1'), column: 'stock' }, focus: { row: k('p2'), column: 'stock' } });
    t.ctl.range()!.copy();
    // Swapped: the pattern 10, 20 copied (the series would give the values already there).
    t.ctl.fill()!.fill({ row: k('p4'), column: 'stock' }, { swap: true });
    const types = t.host.out.map((e) => e.type);
    expect(types.filter((x) => x === 'rangeChanged').length).toBe(2); // set, then the block after the fill
    expect(types.filter((x) => x === 'rangeCopied')).toEqual(['rangeCopied']);
    const edited = t.host.out.filter((e) => e.type === 'cellEdited') as Extract<GridEvent<St>, { type: 'cellEdited' }>[];
    expect(edited.map((e) => [e.column, e.value, e.origin])).toEqual([['stock', 10, 'fill'], ['stock', 20, 'fill']]);
  });
});
