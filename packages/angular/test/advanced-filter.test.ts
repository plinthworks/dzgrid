// 1.17.0 — the advanced filter in Angular (docs/behaviors/advanced-filter.md 19): `[(advancedFilter)]` on `<dz-grid>`
// sets the expression in force (null removes it, the column filters kept) and hears the user's; `[(filter)]` still
// carries the '' entry. Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FilterExpression, FilterModel } from '@dzgrid/core';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const ANN: FilterExpression = { join: 'or', items: [{ column: 'name', filter: { type: 'text', op: 'equals', value: 'ann0' } }, { column: 'n', filter: { type: 'number', op: 'equals', value: 1 } }] };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [(advancedFilter)]="expr" (advancedFilterChange)="heard.push($event)" [(filter)]="filter" />`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly expr = signal<FilterExpression | null | undefined>(undefined);
  readonly filter = signal<FilterModel | undefined>(undefined);
  readonly heard: (FilterExpression | null | undefined)[] = [];
}

function mount() {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
  const k = () => ctl.kernel()!;
  return { fixture, host: fixture.componentInstance, ctl, k, count: () => k().rows.displayed.count };
}

describe('[(advancedFilter)] (advanced-filter.md 19)', () => {
  it('unset: nothing written; set: the expression filters, the column filters kept; null removes it', () => {
    const t = mount();
    expect(t.k().query.filter).toEqual({});
    t.k().dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 100 } }, 'api');
    t.host.expr.set(ANN);
    t.fixture.detectChanges();
    expect(t.k().query.filter['']).toEqual({ type: 'advanced', expression: ANN });
    expect(t.k().query.filter['n']).toEqual({ type: 'number', op: 'lt', value: 100 });
    expect(t.count()).toBe(2);
    t.host.expr.set(null);
    t.fixture.detectChanges();
    expect(Object.keys(t.k().query.filter)).toEqual(['n']);
    expect(t.count()).toBe(100);
  });

  it("a change from elsewhere (the builder, the api) comes back out; [(filter)] carries the '' entry", () => {
    const t = mount();
    t.ctl.dispatch({ type: 'filter.set', filter: { '': { type: 'advanced', expression: ANN } } });
    t.fixture.detectChanges();
    expect(t.host.expr()).toEqual(ANN);
    expect(t.host.heard).toEqual([ANN]);
    expect(t.host.filter()).toEqual({ '': { type: 'advanced', expression: ANN } });
    // A column filter alone changes nothing out of the directive.
    t.ctl.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 5 } });
    t.fixture.detectChanges();
    expect(t.host.heard).toEqual([ANN]);
    t.ctl.dispatch({ type: 'filter.set', filter: {} });
    t.fixture.detectChanges();
    expect(t.host.expr()).toBeNull();
    expect(t.host.heard).toEqual([ANN, null]);
  });
});
