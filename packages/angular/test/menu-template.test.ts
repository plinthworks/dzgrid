// A template per column-menu item in Angular (Phase 6 step 12, owner Q12-2): `<ng-template dzgPart="swatch"
// slot="menuItem" let-c>` named by an item's `part` (`columnMenu({ items })`). The template renders inside the menuitem,
// in the grid's inert, aria-hidden host; the item keeps its text as its name; its context is typed (`c.label`,
// `c.checked`, `c.column`); the view is destroyed when the menu closes. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { columnMenu, type MenuEntry } from '@dzgrid/dom/column-menu';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import { DzGrid, DzgPart, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_COLUMN_MENU.text } };
const life = { made: 0, gone: 0 };

@Component({
  selector: 't-swatch',
  template: `<i class="sw" [attr.data-tone]="tone"></i>`,
})
class Swatch {
  tone = 'red';
  constructor() {
    life.made++;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart, Swatch],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event">
      <ng-template dzgPart="swatch" slot="menuItem" let-c>
        <t-swatch /><b class="lbl">{{ c.label }}</b><em class="col">{{ c.column.id }}</em>@if (c.checked) {<span class="on">✓</span>}
      </ng-template>
    </dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly menu = columnMenu({
    items: (_c, d): MenuEntry[] => [...d, { separator: true }, { id: 'red', label: 'Colour red', kind: 'check', checked: true, part: 'swatch', action: () => {} }],
  });
  readonly features: GridFeature[] = [this.menu];
  ctl: DzgController<R> | null = null;
}

describe('a column-menu item drawn by an Angular template', () => {
  it('renders inside the menuitem, in the inert aria-hidden host; the item named by its text; destroyed with the menu', () => {
    life.made = life.gone = 0;
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.ctl!.use(host.menu)!.open('name')).toBe(true);
    const item = document.querySelector<HTMLElement>('[role=menuitemcheckbox][data-id="red"]')!;
    const part = item.querySelector<HTMLElement>(':scope > .dzg-mpart')!;
    expect(part.hasAttribute('inert')).toBe(true);
    expect(part.getAttribute('aria-hidden')).toBe('true');
    expect(part.querySelector('.lbl')!.textContent).toBe('Colour red');
    expect(part.querySelector('.col')!.textContent).toBe('name');
    expect(part.querySelector('.on')).not.toBeNull();
    expect(part.querySelector('t-swatch .sw')!.getAttribute('data-tone')).toBe('red');
    expect(item.getAttribute('aria-label')).toBe('Colour red');
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(life.made).toBe(1);
    host.ctl!.use(host.menu)!.close();
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(life.gone).toBe(1);
  });
});
