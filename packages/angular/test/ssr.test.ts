// On a server (PLATFORM_ID 'server'): no grid, no document touched, nothing thrown (step 22).
import { describe, it, expect, vi } from 'vitest';
import { Component, PLATFORM_ID, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DzGrid, DzgController, DzgPart, DzgSearch, componentPart, provideDzGrid, type DzgPartContext } from '@dzgrid/angular';
import { dataKey, type RowKey } from '@dzgrid/core';
import { tree } from '@dzgrid/dom/tree';
import { detail } from '@dzgrid/dom/detail';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { quickSearch } from '@dzgrid/dom/search';
import { COLUMNS, MESSAGES, ROWS, rowId } from './support';

@Component({ selector: 't-c', template: `{{ cell().text }}` })
class C {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

const serverSearch = quickSearch();

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart, DzgSearch],
  template: `<input [dzgSearch]="search" />
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" [features]="[search]" (gridReady)="ready = true">
      <ng-template dzgPart="status" let-c>{{ c.text }}</ng-template>
    </dz-grid>`,
})
class Host {
  rows = ROWS;
  cols = COLUMNS;
  id = rowId;
  messages = MESSAGES;
  parts = { other: componentPart('cell', C) };
  search = serverSearch;
  ready = false;
}

describe('on a server', () => {
  it('renders no grid, creates no kernel, emits no gridReady and throws nothing', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }, provideDzGrid({ defaults: { locale: 'fr-FR' } })] });
    const bind = vi.spyOn(serverSearch, 'bind');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dzg')).toBeNull();
    const ctrl = fixture.debugElement.children[1]!.injector.get(DzgController);
    expect(ctrl.ready()).toBe(false);
    expect(ctrl.kernel()).toBeNull();
    expect(fixture.componentInstance.ready).toBe(false);
    expect(bind).not.toHaveBeenCalled();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('componentPart and provideDzGrid need no DOM to be called', () => {
    expect(componentPart('cell', C).slot).toBe('cell');
    expect(provideDzGrid({ messages: MESSAGES }).length).toBeGreaterThan(0);
  });
});

// Phase 4 step 11: a tree, details, the expansion model and a nested grid on a server.
@Component({
  selector: 't-tree-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [expanded]="open" (expandedChange)="changes = changes + 1" (rowExpanded)="fired = fired + 1">
      <ng-template dzgPart="inner" slot="detail" let-c><dz-grid [dzgNested]="c" [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" /></ng-template>
    </dz-grid>`,
})
class TreeHost {
  rows = ROWS;
  cols = COLUMNS;
  id = rowId;
  messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text, ...EN_DETAIL.text } };
  features = [tree<(typeof ROWS)[number]>({ parentId: () => null, initial: 'all' }), detail({ part: 'inner' })];
  open: ReadonlySet<RowKey> = new Set([dataKey('r1')!]);
  changes = 0;
  fired = 0;
}

describe('on a server, trees and details', () => {
  it('render no grid, open nothing, emit nothing and throw nothing', () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const fixture = TestBed.createComponent(TreeHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.dzg')).toBeNull();
    expect(fixture.componentInstance.changes).toBe(0);
    expect(fixture.componentInstance.fired).toBe(0);
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('tree and detail need no DOM to be called', () => {
    expect(tree({ parentId: () => null }).id).toBe('tree');
    expect(detail({ part: 'x' }).id).toBe('detail');
  });
});
