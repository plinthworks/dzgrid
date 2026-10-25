// Editing under zone.js (Phase 5 step 9 T7, docs/behaviors/edit-angular.md 7): a save held open with its running
// border costs no zone turn while it waits; the gesture itself one at most, the answer one at most; `(saveFailed)`
// heard inside the zone; the app's `save` called outside it (pinned and documented). Written first.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, NgZone, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { fakeEnv } from '../test/support';
import { EMSG, SCOLS, STOCK, cellIn, key, sid, typeIn, type St } from '../test/support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const where = { saveInZone: [] as boolean[], failedInZone: [] as boolean[] };
let answer: { ok: () => void; no: (e: unknown) => void } | null = null;

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="f">{{ failed }}</p>
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [save]="save" (gridReady)="ctl = $event" (saveFailed)="fail()" />`,
})
class Host {
  rows = STOCK;
  cols = SCOLS;
  id = sid;
  messages = EMSG;
  features = [edit<St>(), editors()];
  ctl: DzgController<St> | null = null;
  failed = 0;
  save = () => {
    where.saveInZone.push(NgZone.isInAngularZone());
    return new Promise<void>((ok, no) => void (answer = { ok, no }));
  };
  fail(): void {
    where.failedInZone.push(NgZone.isInAngularZone());
    this.failed++;
  }
}

describe('editing with zone.js, destroyed in between', () => {
  it('events told outside the zone, then the grid destroyed before they are told: no output (mutant: the flush ignores destroy)', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const zone = TestBed.inject(NgZone);
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const k = host.ctl!.kernel()!;
    where.failedInZone = [];
    // Angular itself refuses an output emitted after destroy (NG0953, a console message): nothing may reach it.
    const said = [vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    zone.runOutsideAngular(() => {
      emit(k, { type: 'saveFailed', source: 'data', key: dataKey('p1')!, column: 'stock', value: 1, error: new Error('x'), reason: null, code: null });
      fixture.destroy();
    });
    await zone.runOutsideAngular(() => new Promise((r) => setTimeout(r, 0)));
    expect(where.failedInZone).toEqual([]);
    expect(host.failed).toBe(0);
    expect(said.flatMap((x) => x.mock.calls.map((c) => String(c[0])))).toEqual([]);
    said.forEach((x) => x.mockRestore());
  });
});

describe('editing with zone.js', () => {
  it('a save held open: 0 turns while it waits, at most one for the gesture and one for the answer', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const zone = TestBed.inject(NgZone);
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    let turns = 0;
    const sub = zone.onMicrotaskEmpty.subscribe(() => turns++);
    const count = async (run: () => void | Promise<void>) => {
      turns = 0;
      await zone.runOutsideAngular(run);
      await zone.runOutsideAngular(() => new Promise((r) => setTimeout(r, 0)));
      return turns;
    };
    const host = fixture.componentInstance;
    await count(() => {
      host.ctl!.focusCell(dataKey('p2')!, 'stock');
      cellIn(el, 'p2', 'stock')!.focus();
    });
    const open = await count(() => void key('F2'));
    const typing = await count(() => typeIn(el.querySelector<HTMLInputElement>('.dzg-field')!, '7'));
    const gesture = await count(() => void key('Enter', {}, el.querySelector<HTMLInputElement>('.dzg-field')!));
    expect(where.saveInZone).toEqual([false]);
    const wait = await count(() => new Promise((r) => setTimeout(r, 400)));
    const failed = await count(async () => {
      answer!.no(new Error('refused'));
      await new Promise((r) => setTimeout(r, 0));
    });
    sub.unsubscribe();
    expect({ open, typing, gesture, wait }).toEqual({ open: 1, typing: 0, gesture: 1, wait: 0 });
    expect(failed).toBeLessThanOrEqual(1);
    expect(where.failedInZone).toEqual([true]);
    expect(el.querySelector('.f')!.textContent).toBe('1');
    fixture.destroy();
  });
});

// Review of step 9 (1, and the analyser's gaps): the order of the outputs under zone.js. While events wait for their
// zone entry, every later one waits behind them (told inside the zone, or during the flush); with nothing waiting,
// an event told inside the zone goes out at once.
@Component({
  selector: 't-order',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event"
    (gridEvent)="g($event.type)" (cellEdited)="o('cellEdited')" (undoChanged)="o('undoChanged')" (orderStale)="o('orderStale')" (saveFailed)="o('saveFailed')" />`,
})
class Order {
  rows = STOCK;
  cols = SCOLS;
  id = sid;
  messages = EMSG;
  editing = edit<St>();
  features = [this.editing, editors()];
  ctl: DzgController<St> | null = null;
  readonly seen: string[] = [];
  /** A handler that commits again from inside (cellEdited of p1 commits p2), once. */
  again = false;
  g(t: string): void {
    if (/^(cellEdited|undoChanged|orderStale|saveFailed)$/.test(t)) this.seen.push(`g:${t}`);
  }
  o(t: string): void {
    this.seen.push(`o:${t}`);
    if (t === 'cellEdited' && this.again) {
      this.again = false;
      this.editing.api({ kernel: this.ctl!.kernel()! })!.commit([{ key: dataKey('p2')!, column: 'stock', input: { text: '2' } }]);
    }
  }
}

async function order() {
  TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
  const zone = TestBed.inject(NgZone);
  const fixture = TestBed.createComponent(Order);
  document.body.appendChild(fixture.nativeElement);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const host = fixture.componentInstance;
  const k = host.ctl!.kernel()!;
  const later = () => zone.runOutsideAngular(() => new Promise((r) => setTimeout(r, 0)));
  return { fixture, zone, host, k, later };
}
const ev = {
  failed: { type: 'saveFailed', source: 'data', key: dataKey('p1')!, column: 'stock', value: 1, error: null, reason: null, code: null },
  stale: { type: 'orderStale', source: 'user', stale: true },
  undo: { type: 'undoChanged', source: 'user', canUndo: true, canRedo: false },
  edited: { type: 'cellEdited', source: 'user', key: dataKey('p1')!, column: 'stock', value: 1, previous: 10, origin: 'edit' },
} as const;

describe('the order of the outputs under zone.js', () => {
  it('saveFailed told outside the zone, then orderStale inside it, in one task: told in that order', async () => {
    const t = await order();
    t.zone.runOutsideAngular(() => {
      emit(t.k, ev.failed as never);
      t.zone.run(() => emit(t.k, ev.stale as never));
    });
    await t.later();
    expect(t.host.seen).toEqual(['g:saveFailed', 'o:saveFailed', 'g:orderStale', 'o:orderStale']);
  });

  it('a (cellEdited) handler that commits again: its events come after the first gesture’s', async () => {
    const t = await order();
    t.host.again = true;
    t.zone.runOutsideAngular(() => t.host.editing.api({ kernel: t.k })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '1' } }]));
    await t.later();
    expect(t.host.seen).toEqual(['g:cellEdited', 'o:cellEdited', 'g:undoChanged', 'o:undoChanged', 'g:cellEdited', 'o:cellEdited']);
  });

  it('a commit made inside the zone with nothing waiting: its outputs heard at once', async () => {
    const t = await order();
    t.zone.run(() => t.host.editing.api({ kernel: t.k })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '1' } }]));
    expect(t.host.seen).toEqual(['g:cellEdited', 'o:cellEdited', 'g:undoChanged', 'o:undoChanged']);
  });

  it('events told outside the zone in one task: every one, in order, gridEvent before its named output', async () => {
    const t = await order();
    t.zone.runOutsideAngular(() => {
      emit(t.k, ev.undo as never);
      emit(t.k, ev.edited as never);
      emit(t.k, ev.stale as never);
    });
    expect(t.host.seen).toEqual([]);
    await t.later();
    expect(t.host.seen).toEqual(['g:undoChanged', 'o:undoChanged', 'g:cellEdited', 'o:cellEdited', 'g:orderStale', 'o:orderStale']);
  });
});
