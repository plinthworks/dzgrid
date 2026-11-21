// 1.15.0 — batch editing in Angular (docs/behaviors/edit-batch.md 5, 12): `(pendingChange)` tells the count each time it
// changes, `DzgController.batch()` gives `editBatch()`'s api (null before the grid, without the feature, after it);
// `saveAll()` sends one request through `[save]`. Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import type { GridFeature } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { editBatch } from '@dzgrid/dom/edit-batch';
import { EN_FORMS } from '@dzgrid/dom/locales/en-forms';
import { DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, sid, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const batch = editBatch<St>();

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [save]="save" (pendingChange)="counts.push($event.count)" />`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = SCOLS;
  readonly id = sid;
  readonly messages = { ...EMSG, text: { ...EMSG.text, ...EN_FORMS.text } };
  features: GridFeature[] = [edit<St>(), editors(), batch];
  readonly sent: SaveRequest<St>[] = [];
  readonly save = (req: SaveRequest<St>) => void this.sent.push(req);
  readonly counts: number[] = [];
}

function mount(features?: GridFeature[]) {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  if (features) fixture.componentInstance.features = features;
  document.body.appendChild(fixture.nativeElement);
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<St>;
  return { fixture, host: fixture.componentInstance, ctl };
}

describe('batch editing in Angular (edit-batch.md 5, 12)', () => {
  it('controller.batch(): null before the grid, the feature api once made, null after destroy', () => {
    const t = mount();
    expect(t.ctl.batch()).toBeNull();
    t.fixture.detectChanges();
    expect(t.ctl.batch()).toBe(batch.api({ kernel: t.ctl.kernel()! }));
    t.fixture.destroy();
    expect(t.ctl.batch()).toBeNull();
  });

  it('without editBatch() in [features]: null', () => {
    const t = mount([edit<St>(), editors()]);
    t.fixture.detectChanges();
    expect(t.ctl.batch()).toBeNull();
  });

  it('(pendingChange) tells each count; saveAll() sends one request through [save], origin batch', async () => {
    const t = mount();
    t.fixture.detectChanges();
    t.ctl.edit()!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '11' } }]);
    t.ctl.edit()!.commit([{ key: dataKey('p2')!, column: 'stock', input: { text: '22' } }]);
    await t.fixture.whenStable();
    expect(t.host.sent).toEqual([]);
    expect(t.host.counts).toEqual([1, 2]);
    expect(t.ctl.batch()!.count).toBe(2);
    const r = await t.ctl.batch()!.saveAll();
    expect(r).toEqual({ sent: 2, refused: [] });
    expect(t.host.sent).toHaveLength(1);
    expect(t.host.sent[0]!.origin).toBe('batch');
    expect(t.host.sent[0]!.changes.map((c) => [c.key, c.value, c.previous])).toEqual([[dataKey('p1'), 11, 10], [dataKey('p2'), 22, 20]]);
    await t.fixture.whenStable();
    expect(t.host.counts).toEqual([1, 2, 0]);
  });
});
