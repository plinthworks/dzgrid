// `[save]` and the editing columns through `<dz-grid>` (Phase 5 step 9 T1, docs/behaviors/edit-angular.md 1–2;
// owner S9-Q1–Q2: `edit()` and `editors()` in `[features]`, one live `[save]` input). Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent, type Problem } from '@dzgrid/core';
import type { SaveHandler, SaveRequest } from '@dzgrid/core/edit';
import type { GridFeature } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, cellIn, key, ofType, settle, sid, typeIn, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns()" [getRowId]="id" [messages]="messages" [features]="features" [save]="save()"
    (gridEvent)="all.push($event)" (problems)="problems.push.apply(problems, $any($event))" (gridReady)="ctl = $event; ready($event)" />`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = signal(SCOLS);
  readonly id = sid;
  readonly messages = EMSG;
  features: GridFeature[] = [edit<St>(), editors()];
  readonly save = signal<SaveHandler<St> | undefined>(undefined);
  readonly all: GridEvent<St>[] = [];
  readonly problems: Problem[] = [];
  ctl: DzgController<St> | null = null;
  ready: (c: DzgController<St>) => void = () => {};
}

function mount(o: { features?: GridFeature[]; save?: SaveHandler<St> } = {}) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (o.features) host.features = o.features;
  if (o.save) host.save.set(o.save);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const at = (id: string, col = 'stock') => {
    host.ctl!.focusCell(dataKey(id)!, col);
    const c = cellIn(el, id, col)!;
    if (document.activeElement !== c) c.focus();
    return c;
  };
  const field = () => el.querySelector<HTMLInputElement>('.dzg-field');
  /** Opens `id`'s stock field with F2, types `text`, presses Enter. */
  const write = (id: string, text: string) => {
    at(id);
    key('F2');
    typeIn(field()!, text);
    key('Enter', {}, field()!);
  };
  return { fixture, host, el, at, field, write };
}

/** A save the test answers by hand: each call's request, signal and resolver. */
function held() {
  const calls: { req: SaveRequest<St>; signal: unknown; done: () => void; fail: (e: unknown) => void }[] = [];
  const fn: SaveHandler<St> = (req, signal) => new Promise<void>((done, fail) => void calls.push({ req, signal, done, fail }));
  return { fn, calls };
}

describe('[save] (S9-Q1)', () => {
  it('set: a commit calls it with the request and a signal', async () => {
    const s = held();
    const t = mount({ save: s.fn });
    t.write('p2', '7');
    expect(s.calls.length).toBe(1);
    expect(s.calls[0]!.req.changes.map((c) => [c.column, c.value])).toEqual([['stock', 7]]);
    expect(typeof (s.calls[0]!.signal as AbortSignal).aborted).toBe('boolean');
    s.calls[0]!.done();
    await settle();
  });

  it('changed live: the next commit uses the new one, the request in flight keeps the old', async () => {
    const a = held();
    const b = held();
    const t = mount({ save: a.fn });
    t.write('p2', '7');
    t.host.save.set(b.fn);
    t.fixture.detectChanges();
    t.write('p3', '8');
    expect([a.calls.length, b.calls.length]).toEqual([1, 1]);
    a.calls[0]!.done();
    b.calls[0]!.done();
    await settle();
    expect(ofType(t.host.all, 'saveFailed')).toEqual([]);
  });

  it('set at creation: a commit from (gridReady), before any effect ran, already calls it (mutant: no _save at creation)', async () => {
    const s = held();
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.save.set(s.fn);
    const feature = host.features[0] as ReturnType<typeof edit<St>>;
    fixture.componentInstance.ready = (c) => void feature.api({ kernel: c.kernel()! })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '5' } }]);
    fixture.detectChanges();
    expect(s.calls.length).toBe(1);
    s.calls[0]!.done();
    await settle();
  });

  it('never set: the feature’s own save is used', async () => {
    const s = held();
    const t = mount({ features: [edit<St>({ save: s.fn }), editors()] });
    t.write('p2', '7');
    expect(s.calls.length).toBe(1);
    s.calls[0]!.done();
    await settle();
  });

  it('set, then undefined: the local save (no request), the value kept', () => {
    const s = held();
    const t = mount({ features: [edit<St>({ save: s.fn }), editors()] });
    t.host.save.set(s.fn);
    t.fixture.detectChanges();
    t.host.save.set(undefined);
    t.fixture.detectChanges();
    t.write('p2', '7');
    expect(s.calls.length).toBe(0);
    expect(cellIn(t.el, 'p2', 'stock')!.textContent).toBe('7');
  });

  it('without the edit feature: one missing-feature at save (detail edit), still one after a second value', () => {
    const t = mount({ features: [], save: held().fn });
    t.host.save.set(held().fn);
    t.fixture.detectChanges();
    const told = t.host.problems.filter((p) => p.code === 'missing-feature' && p.path === 'save');
    expect(told.length).toBe(1);
    expect(told[0]!.detail).toBe('edit');
    expect(told[0]!.severity).toBe('warning');
  });

  it('without [save] and without edit: nothing told', () => {
    const t = mount({ features: [] });
    expect(t.host.problems.filter((p) => p.path === 'save')).toEqual([]);
  });
});

describe('the editing columns pass through [columns]', () => {
  it('F2 opens a field on an editable column only', () => {
    const t = mount();
    t.at('p2', 'name');
    key('F2');
    expect(t.field()).toBeNull();
    t.at('p2', 'stock');
    key('F2');
    expect(t.field()).not.toBeNull();
  });

  it('a column rule refuses (min 0): the field stays open, nothing saved', () => {
    const s = held();
    const t = mount({ save: s.fn });
    t.write('p2', '-3');
    expect(t.field()).not.toBeNull();
    expect(t.field()!.getAttribute('aria-invalid')).toBe('true');
    expect(s.calls.length).toBe(0);
  });

  it('editable flipped live by a new [columns]: the column opens no field any more', () => {
    const t = mount();
    t.host.columns.set(SCOLS.map((c) => (c.id === 'stock' ? { ...c, editable: false } : c)));
    t.fixture.detectChanges();
    t.at('p2', 'stock');
    key('F2');
    expect(t.field()).toBeNull();
  });

  it('a validate function refuses', () => {
    const t = mount();
    t.host.columns.set(SCOLS.map((c) => (c.id === 'stock' ? { ...c, validate: (v: unknown) => (v === 13 ? 'unlucky' : null) } : c)) as never);
    t.fixture.detectChanges();
    t.write('p2', '13');
    expect(t.field()).not.toBeNull();
    key('Escape', {}, t.field()!);
    expect(t.field()).toBeNull();
    t.write('p3', '12');
    expect(cellIn(t.el, 'p3', 'stock')!.textContent).toBe('12');
  });
});
