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
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { listEditor } from '@dzgrid/dom/editors-list';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';
import { EN_EDITORS } from '@dzgrid/dom/locales/en-editors';
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

// Phase 5 step 9 (T8, edit-angular.md 8): editing on a server — `edit()`, `editors({ list })`, an editor template
// and `[save]`: nothing rendered, the document untouched, no timer left, no problem told.
@Component({
  selector: 't-edit-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [save]="save" (problems)="told = told + 1" (gridReady)="ready = true">
      <ng-template dzgPart="stock" slot="editor" let-c><input [value]="c.text" (focus)="c.reads(read)" /></ng-template>
    </dz-grid>`,
})
class EditHost {
  rows = ROWS;
  cols = COLUMNS.map((c) => ({ ...c, editable: true, edit: { editor: 'stock' } }));
  id = rowId;
  messages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_EDIT.text, ...EN_EDITORS.text } };
  features = [edit(), editors({ list: listEditor })];
  save = () => Promise.resolve();
  read = () => ({ text: '' });
  told = 0;
  ready = false;
}

describe('on a server, editing', () => {
  it('renders nothing, touches no document, leaves no timer, tells no problem', () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
      const before = document.body.innerHTML;
      const fixture = TestBed.createComponent(EditHost);
      expect(() => fixture.detectChanges()).not.toThrow();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.dzg')).toBeNull();
      expect(el.querySelector('input')).toBeNull();
      expect(fixture.componentInstance.told).toBe(0);
      expect(fixture.componentInstance.ready).toBe(false);
      const ctrl = fixture.debugElement.children[0]!.injector.get(DzgController);
      expect(ctrl.edit()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(document.body.innerHTML.replace(el.outerHTML, '')).toBe(before.replace(el.outerHTML, ''));
      expect(() => fixture.destroy()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('edit(), editors(), listEditor and componentPart(\'editor\', …) need no DOM to be called', () => {
    expect(edit().id).toBe('edit');
    expect(editors({ list: listEditor }).id).toBe('editors');
    expect(componentPart('editor', C as never).slot).toBe('editor');
  });
});
