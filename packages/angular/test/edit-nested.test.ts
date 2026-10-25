// Editing in a nested `<dz-grid [dzgNested]>` (Phase 5 step 9 T9, docs/behaviors/edit-angular.md, edit-undo.md; D13, owner S8-O3): the inner grid's own
// `edit()`; Ctrl+Z inside it undoes the inner grid only; each grid's `(undoChanged)` its own. Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type RowKey } from '@dzgrid/core';
import type { Geometry, GridFeature, SlotPart } from '@dzgrid/dom';
import { detail } from '@dzgrid/dom/detail';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DZG_ENV, DzGrid, componentPart, type DzgController, type DzgPartContext } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, key, sid, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const MSG = { ...EMSG, text: { ...EMSG.text, ...EN_DETAIL.text } };
const innerEnv = { provide: DZG_ENV, useFactory: () => {
  const box = { block: 200, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) };
  return { geometry, sync: true };
} };
const seen = { inner: null as DzgController<St> | null, innerUndo: [] as boolean[], outerUndo: [] as boolean[] };

@Component({
  selector: 't-inner',
  imports: [DzGrid],
  providers: [innerEnv],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dz-grid [dzgNested]="cell()" [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
    (gridReady)="ready($event)" (undoChanged)="note($event.canUndo)" />`,
})
class Inner {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly rows = STOCK.slice(0, 5).map((r) => ({ ...r, id: `in${r.id}` }));
  readonly cols = SCOLS;
  readonly id = sid;
  readonly messages = MSG;
  readonly features: GridFeature[] = [edit<St>(), editors()];
  ready(c: DzgController<St>): void {
    seen.inner = c;
  }
  note(u: boolean): void {
    seen.innerUndo.push(u);
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" [expanded]="open"
    (gridReady)="ctl = $event" (undoChanged)="note($event.canUndo)" />`,
})
class Host {
  readonly rows = STOCK.slice(0, 10);
  readonly cols = SCOLS;
  readonly id = sid;
  readonly messages = MSG;
  readonly editing = edit<St>();
  readonly features: GridFeature[] = [this.editing, editors(), detail<St>({ part: 'inner', height: 220 })];
  readonly parts: Record<string, SlotPart> = { inner: componentPart('detail', Inner) };
  readonly open: ReadonlySet<RowKey> = new Set([dataKey('p0')!]);
  ctl: DzgController<St> | null = null;
  note(u: boolean): void {
    seen.outerUndo.push(u);
  }
}

describe('editing in a nested grid', () => {
  it('Ctrl+Z inside the inner grid undoes the inner edit only; each grid’s (undoChanged) its own', () => {
    Object.assign(seen, { inner: null, innerUndo: [], outerUndo: [] });
    TestBed.configureTestingModule({ providers: [fakeEnv({ block: 600 }).provider] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    fixture.detectChanges();
    const outer = fixture.componentInstance;
    const inner = seen.inner!;
    expect(inner).not.toBeNull();
    outer.editing.api({ kernel: outer.ctl!.kernel()! })!.commit([{ key: dataKey('p3')!, column: 'stock', input: { text: '1' } }]);
    inner.edit()!.commit([{ key: dataKey('inp2')!, column: 'stock', input: { text: '2' } }]);
    expect([seen.outerUndo, seen.innerUndo]).toEqual([[true], [true]]);
    inner.focusCell(dataKey('inp2')!, 'stock');
    const cell = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.dzg-dbody .dzg-row[aria-rowindex="4"] .dzg-cell[data-col="stock"]')!;
    cell.focus();
    key('z', { ctrlKey: true, code: 'KeyZ' }, cell);
    expect(cell.textContent).toBe('20');
    expect(inner.edit()!.canUndo).toBe(false);
    expect(outer.ctl!.edit()!.canUndo).toBe(true);
    expect([seen.outerUndo, seen.innerUndo]).toEqual([[true], [true, false]]);
  });
});
