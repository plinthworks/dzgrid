// Review of Phase 5 step 9 (docs/phase-5-steps/step09-plan.md « Review »; edit-angular.md 5; angular-parts.md
// « Registry order »): `part-shadowed` reads the provider's default features; a component editor whose read() throws.
// Written before each fix.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent, type Problem } from '@dzgrid/core';
import { definePart, type GridFeature, type SlotPart } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, componentPart, provideDzGrid, type DzgController, type DzgEditorComponent, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId } from './support';
import { EMSG, SCOLS, STOCK, cellIn, key, ofType, sid, typeIn, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const plain = (label: string): SlotPart => definePart('cell', { mount: (h, c) => (h.append(`${label}:${c.text}`), {}) }) as SlotPart;

@Component({
  selector: 't-shadow',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" (problems)="told.push.apply(told, $any($event))" />`,
})
class Shadow {
  rows = ROWS;
  cols = COLUMNS;
  id = rowId;
  messages = MESSAGES;
  parts = { status: plain('host') };
  readonly told: Problem[] = [];
}

describe('part-shadowed and the provider’s default features (review 4)', () => {
  it('a [parts] name over a part of a feature given by provideDzGrid({ defaults: { features } }): told, from the feature', () => {
    const feature: GridFeature = { id: 'mine', parts: { status: plain('feature') }, setup: () => ({ destroy() {} }) };
    TestBed.configureTestingModule({ providers: [fakeEnv().provider, provideDzGrid({ defaults: { features: [feature] } })] });
    const fixture = TestBed.createComponent(Shadow);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const p = fixture.componentInstance.told.filter((x) => x.code === 'part-shadowed');
    expect(p.map((x) => [x.path, x.detail])).toEqual([['parts.status', 'feature']]);
  });
});

/** A note editor whose read() throws once asked. */
@Component({ selector: 't-bad-read', changeDetection: ChangeDetectionStrategy.OnPush, template: `<input class="bad" [value]="cell().text" />` })
class BadRead implements DzgEditorComponent {
  readonly cell = input.required<DzgPartContext<'editor'>>();
  read(): never {
    throw new Error('read broke');
  }
}

@Component({
  selector: 't-bad-host',
  imports: [DzGrid],
  template: `<button type="button" class="outside">out</button>
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" (gridEvent)="all.push($event)" (gridReady)="ctl = $event" />`,
})
class BadHost {
  rows = STOCK;
  cols = SCOLS;
  id = sid;
  messages = EMSG;
  features = [edit<St>(), editors()];
  parts = { stock: componentPart('editor', BadRead) };
  readonly all: GridEvent<St>[] = [];
  ctl: DzgController<St> | null = null;
}

describe('an editor whose read() throws (review 5)', () => {
  it('Enter: the error reported once, nothing kept, the editor closed, the value unchanged', () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(BadHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const h = fixture.componentInstance;
    h.ctl!.focusCell(dataKey('p2')!, 'note');
    cellIn(el, 'p2', 'note')!.focus();
    key('F2');
    const f = el.querySelector<HTMLInputElement>('input.bad')!;
    typeIn(f, 'typed');
    expect(() => key('Enter', {}, f)).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]![0])).toMatch(/read broke/);
    expect(el.querySelector('.dzg-editor')).toBeNull();
    expect(ofType(h.all, 'cellEdited')).toEqual([]);
    expect(cellIn(el, 'p2', 'note')!.textContent).toBe('n2');
  });
});
