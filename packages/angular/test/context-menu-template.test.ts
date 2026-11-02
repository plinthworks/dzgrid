// The cell menu's items drawn by Angular (Phase 9, context-menu-plan §2): `contextMenu()` in `[features]`, an item's
// content by a `dzgPart` template (slot `menuItem`) or by `componentPart('menuItem', …)`, named in `items`. Rendered
// inside the menuitem in the grid's inert, aria-hidden host; its context has the cell's row and `menu: 'cell'`; the
// views are destroyed when the menu closes. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { GridFeature, GridMessages, SlotPart } from '@dzgrid/dom';
import { contextMenu, type CellMenuContext, type MenuEntry } from '@dzgrid/dom/context-menu';
import { EN_CONTEXT_MENU } from '@dzgrid/dom/locales/en-context-menu';
import { DzGrid, DzgPart, componentPart, type DzgController, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_CONTEXT_MENU.text } };
const life = { made: 0, gone: 0 };

@Component({ selector: 't-mark', template: `<i class="mk">{{ cell().label }}</i>` })
class Mark {
  readonly cell = input.required<DzgPartContext<'menuItem'>>();
  constructor() {
    life.made++;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" (gridReady)="ctl = $event">
      <ng-template dzgPart="tpl" slot="menuItem" let-c>
        <b class="lbl">{{ c.label }}</b><em class="row">{{ $any(c.row)?.id }}</em><s class="which">{{ c.menu }}</s>
      </ng-template>
    </dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MSG;
  readonly parts: Record<string, SlotPart> = { cmp: componentPart('menuItem', Mark) };
  readonly menu = contextMenu<R>({
    items: (_c: CellMenuContext<R>, d): MenuEntry<CellMenuContext<R>>[] => [...d, { id: 'a', label: 'By template', part: 'tpl' }, { id: 'b', label: 'By component', part: 'cmp' }],
  });
  readonly features: GridFeature[] = [this.menu];
  ctl: DzgController<R> | null = null;
}

describe('a cell-menu item drawn by Angular', () => {
  it('a dzgPart template and a componentPart: inside the menuitem, inert and hidden, the row and menu: cell; destroyed with the menu', () => {
    life.made = life.gone = 0;
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const api = host.ctl!.use(host.menu)!;
    expect(api.open({ row: dataKey('r1')!, column: 'name' })).toBe(true);
    const a = document.querySelector<HTMLElement>('[role=menuitem][data-id="a"]')!;
    const pa = a.querySelector<HTMLElement>(':scope > .dzg-mpart')!;
    expect([pa.hasAttribute('inert'), pa.getAttribute('aria-hidden')]).toEqual([true, 'true']);
    expect(pa.querySelector('.lbl')!.textContent).toBe('By template');
    expect(pa.querySelector('.row')!.textContent).toBe('r1');
    expect(pa.querySelector('.which')!.textContent).toBe('cell');
    expect(a.getAttribute('aria-label')).toBe('By template');
    const b = document.querySelector<HTMLElement>('[role=menuitem][data-id="b"]')!;
    expect(b.querySelector('.dzg-mpart .mk')!.textContent).toBe('By component');
    expect(life.made).toBe(1);
    api.close();
    expect(document.querySelector('[role=menu]')).toBeNull();
    expect(life.gone).toBe(1);
  });
});
