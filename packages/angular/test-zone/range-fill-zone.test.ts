// Blocks and the fill under zone.js (Phase 5 step 12, test analysis): `(rangeChanged)`, `(rangeCopied)` and the fill's
// `(cellEdited)` told outside the zone in one task are heard INSIDE it, together in one zone turn (the outputs' batching
// of step 9 T7), in order; the local save's answer may cost one more turn, as in edit-zone.test.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, NgZone, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { GridMessages } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { EN_RANGE } from '@dzgrid/dom/locales/en-range';
import { EN_FILL } from '@dzgrid/dom/locales/en-fill';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { fakeEnv } from '../test/support';
import { EMSG, SCOLS, STOCK, sid, type St } from '../test/support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const heard: [string, boolean][] = [];
let turn = 0;
const turnOf: number[] = [];
const blocks = range();

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ctl = $event"
    (rangeChanged)="hear('rangeChanged')" (rangeCopied)="hear('rangeCopied')" (cellEdited)="hear('cellEdited')" />`,
})
class Host {
  rows = STOCK;
  cols = SCOLS;
  id = sid;
  messages: GridMessages = { ...EMSG, text: { ...EMSG.text, ...EN_RANGE.text, ...EN_FILL.text } };
  features = [edit<St>(), blocks, fill(blocks)];
  ctl: DzgController<St> | null = null;
  hear(n: string): void {
    heard.push([n, NgZone.isInAngularZone()]);
    turnOf.push(turn);
  }
}

describe('blocks and the fill with zone.js', () => {
  it('the range and fill outputs told outside the zone are heard inside it, in one turn, in order', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const zone = TestBed.inject(NgZone);
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance.ctl!;
    let turns = 0;
    const sub = zone.onMicrotaskEmpty.subscribe(() => ((turns++), (turn = turns)));
    heard.length = 0;
    turnOf.length = 0;
    await zone.runOutsideAngular(async () => {
      c.focusCell(dataKey('p1')!, 'stock');
      c.range()!.set({ anchor: { row: dataKey('p1')!, column: 'stock' }, focus: { row: dataKey('p2')!, column: 'stock' } });
      c.range()!.copy();
      c.fill()!.fill({ row: dataKey('p4')!, column: 'stock' }, { swap: true });
      await new Promise((r) => setTimeout(r, 0));
    });
    sub.unsubscribe();
    expect(heard.map(([n]) => n)).toEqual(['rangeChanged', 'rangeCopied', 'cellEdited', 'cellEdited', 'rangeChanged']);
    expect(heard.every(([, z]) => z)).toBe(true);
    // All five in one zone entry (the same turn); at most one more for the local save's answer.
    expect(new Set(turnOf).size).toBe(1);
    expect(turns).toBeLessThanOrEqual(2);
    fixture.destroy();
  });
});
