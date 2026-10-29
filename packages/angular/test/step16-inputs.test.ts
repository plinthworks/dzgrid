// Step 16's inputs: `[multiSort]="false"` (sort.md « One sort only », 16a) and `[sameRow]` (row-identity-transactions.md
// « Rows compared by value », 16e) reach the grid.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import { sameValues } from '@dzgrid/core/compare';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => { document.body.innerHTML = ''; });

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [multiSort]="false" [sameRow]="same" />`,
})
class Host {
  readonly rows = signal(ROWS);
  readonly same = sameValues;
  readonly columns = COLUMNS;
  readonly id = rowId;
  readonly messages = MESSAGES;
}

describe('[multiSort]="false"', () => {
  it('Shift+click on a second header leaves that column the only sort', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
    const head = (c: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
    head('name').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    head('n').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(ctl.kernel()!.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
  });
});

describe('[sameRow]', () => {
  it('a reload of equal copies keeps the old row objects; the changed row is the new one', async () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
    const row = (id: string) => ctl.kernel()!.rows.row(dataKey(id)!)!.data;
    const before = row('r4');
    fixture.componentInstance.rows.set(ROWS.map((r) => (r.id === 'r3' ? { ...r, n: 999 } : { ...r })));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(row('r3').n).toBe(999);
    expect(row('r4')).toBe(before);
  });
});

describe('DzgController.ensureColumnVisible', () => {
  it('reaches the grid api: a column scrolled into view sideways, the block scroll unchanged', () => {
    const env = fakeEnv({ inline: 120 });
    TestBed.configureTestingModule({ providers: [env.provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<R>;
    ctl.ensureColumnVisible('s');
    expect(env.box.scrollInline).toBeGreaterThan(0);
    expect(env.box.scrollTop).toBe(0);
  });
});
