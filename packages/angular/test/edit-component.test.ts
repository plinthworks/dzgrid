// An editor as a component (Phase 5 step 9 T5, docs/behaviors/edit-angular.md 5): `componentPart('editor', C)`
// with `read()` (what Enter, Tab and a blur keep) and `focus()`; a constructor that throws: the editor closed, the
// error reported, not tried again on that cell until its data changes; `inject(DzgController)` inside. Written first.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, viewChild, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ClientModel, type GridEvent } from '@dzgrid/core';
import type { SlotPart } from '@dzgrid/dom';
import type { CellInput } from '@dzgrid/dom/editors';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, DzgController, componentPart, type DzgEditorComponent, type DzgPartContext } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, cellIn, key, ofType, settle, sid, tick, typeIn, type St } from './support-edit';

const seen = { made: 0, gone: 0, focus: 0, read: 0, throws: false, controllers: [] as DzgController[] };
beforeEach(() => Object.assign(seen, { made: 0, gone: 0, focus: 0, read: 0, throws: false, controllers: [] }));
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

@Component({
  selector: 't-note-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input #f class="cmp" [value]="cell().char ?? cell().text" /><span class="other" tabindex="0">o</span>`,
})
class NoteEditor implements DzgEditorComponent, OnDestroy {
  readonly cell = input.required<DzgPartContext<'editor'>>();
  private readonly f = viewChild.required<ElementRef<HTMLInputElement>>('f');
  constructor() {
    if (seen.throws) throw new Error('broken editor');
    seen.made++;
    seen.controllers.push(inject(DzgController));
  }
  focus(): boolean {
    seen.focus++;
    this.f().nativeElement.focus();
    return true;
  }
  read(): CellInput {
    seen.read++;
    return { text: this.f().nativeElement.value.toUpperCase() };
  }
  ngOnDestroy(): void {
    seen.gone++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<button type="button" class="outside">out</button>
    <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" (gridEvent)="all.push($event)" (gridReady)="ctl = $event" />`,
})
class Host {
  readonly rows = STOCK.map((r) => ({ ...r }));
  readonly columns = SCOLS;
  readonly id = sid;
  readonly messages = EMSG;
  readonly features = [edit<St>(), editors()];
  readonly parts: Record<string, SlotPart> = { stock: componentPart('editor', NoteEditor) };
  readonly all: GridEvent<St>[] = [];
  ctl: DzgController<St> | null = null;
}

function mount() {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const at = (id: string) => {
    host.ctl!.focusCell(dataKey(id)!, 'note');
    const c = cellIn(el, id, 'note')!;
    if (document.activeElement !== c) c.focus();
    return c;
  };
  const cmp = () => el.querySelector<HTMLInputElement>('input.cmp');
  const saved = () => ofType(host.all, 'cellEdited').map((e) => [e.column, e.value]);
  return { fixture, host, el, at, cmp, saved };
}

describe('an editor as a component', () => {
  it('its focus() takes the focus; Enter keeps what read() gives', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    expect(seen.focus).toBe(1);
    expect(document.activeElement).toBe(t.cmp());
    typeIn(t.cmp()!, 'abc');
    key('Enter', {}, t.cmp()!);
    expect(t.saved()).toEqual([['note', 'ABC']]);
    expect(seen.gone).toBe(1);
  });

  it('Tab and a blur keep what read() gives too', async () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.cmp()!, 'tab');
    key('Tab', {}, t.cmp()!);
    // Tab opened the next editable cell: given up there.
    if (t.el.querySelector('.dzg-editor, .dzg-field')) key('Escape');
    t.at('p4');
    key('F2');
    typeIn(t.cmp()!, 'blur');
    t.el.querySelector<HTMLButtonElement>('.outside')!.focus();
    await tick();
    await settle();
    expect(t.saved()).toEqual([['note', 'TAB'], ['note', 'BLUR']]);
    expect(seen.made).toBe(seen.gone);
  });

  it('inject(DzgController) inside gives this grid’s controller', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    expect(seen.controllers[0]).toBe(t.host.ctl);
  });

  it('a constructor that throws: the editor closed, the error reported, not tried again until the row’s data changes', () => {
    const report = vi.fn();
    vi.stubGlobal('reportError', report);
    seen.throws = true;
    const t = mount();
    t.at('p2');
    key('F2');
    expect(t.el.querySelector('.dzg-editor')).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]![0])).toMatch(/broken editor/);
    seen.throws = false;
    t.at('p2');
    key('F2');
    expect(t.cmp()).toBeNull();
    // Its data changed: tried again.
    (t.host.ctl!.kernel()!.rows as unknown as ClientModel<St>).applyTransaction({ update: [{ ...STOCK[2]!, note: 'changed' }] });
    t.at('p2');
    key('F2');
    expect(t.cmp()).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
