// Step 12's outputs and inputs under zone.js (step12-plan §6 B11): `(stateChanged)`, `(densityChanged)` and
// `(selectionChanged)` are heard INSIDE the Angular zone (a plain host field shows without a manual check); the state's
// pause (300 ms) is armed OUTSIDE it (the zone turns stable while it is pending); a `[state]` restore and a
// `[pinnedRows]` update run outside it (no zone turn of their own). Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, NgZone, provideZoneChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey } from '@dzgrid/core';
import type { GridState } from '@dzgrid/core/state';
import type { GridMessages } from '@dzgrid/dom';
import { gridState, type GridStateFeature } from '@dzgrid/dom/state';
import { pinnedRows } from '@dzgrid/dom/pinned-rows';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { EN_PINNED } from '@dzgrid/dom/locales/en-pinned';
import { EN_COLUMN_MENU } from '@dzgrid/dom/locales/en-column-menu';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from '../test/support';

afterEach(() => {
  document.body.innerHTML = '';
});

const where = { state: [] as boolean[], density: [] as boolean[], selection: [] as boolean[], restore: [] as boolean[] };

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="count">{{ count }}</p>
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [state]="state()" [pinnedRows]="pins()"
      (stateChanged)="hear('state')" (densityChanged)="hear('density')" (selectionChanged)="hear('selection')" (gridReady)="ctl = $event" />`,
})
class Host {
  rows = ROWS;
  cols = COLUMNS;
  id = rowId;
  messages: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_PINNED.text, ...EN_COLUMN_MENU.text } };
  readonly st: GridStateFeature = gridState();
  readonly pinsF = pinnedRows<R>();
  readonly menu = columnMenu({ density: true });
  features = [this.st, this.pinsF, this.menu];
  readonly state = signal<GridState | undefined>(undefined);
  readonly pins = signal<{ bottom?: readonly R[] } | undefined>(undefined);
  ctl: DzgController<R> | null = null;
  /** A plain field: only a zone-driven check shows it changed. */
  count = 0;
  hear(n: string): void {
    where[n as keyof typeof where].push(NgZone.isInAngularZone());
    this.count++;
  }
}

describe('step 12 with zone.js', () => {
  it('stateChanged inside the zone (the plain field shown); its pause armed outside it (stable while pending)', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance.ctl!;
    // A user's sort, outside the zone (as the grid's own listeners run): the 300 ms pause starts.
    TestBed.inject(NgZone).runOutsideAngular(() => c.kernel()!.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user'));
    const t0 = Date.now();
    await fixture.whenStable();
    // Stable at once: the pause's timer is not the zone's to wait for.
    expect(Date.now() - t0).toBeLessThan(250);
    expect(where.state).toEqual([]);
    await new Promise((r) => setTimeout(r, 400));
    await fixture.whenStable();
    expect(where.state).toEqual([true]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.count')!.textContent).toBe('1');
  });

  it('resetState() called outside the zone: its stateChanged still heard inside it', async () => {
    where.state.length = 0;
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance.ctl!;
    c.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] });
    await new Promise((r) => setTimeout(r, 400));
    TestBed.inject(NgZone).runOutsideAngular(() => expect(c.resetState()).toEqual([]));
    await new Promise((r) => setTimeout(r, 400));
    await fixture.whenStable();
    expect(where.state).toEqual([true, true]);
    expect(c.kernel()!.query.sort).toEqual([]);
  });

  it('densityChanged and selectionChanged inside the zone', async () => {
    where.density.length = where.selection.length = 0;
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const zone = TestBed.inject(NgZone);
    zone.runOutsideAngular(() => {
      host.ctl!.use(host.menu)!.open('name');
      (document.querySelector('[data-id="density.compact"]') as HTMLElement).click();
      host.ctl!.kernel()!.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([dataKey('r1')!]) } }, 'user');
    });
    await fixture.whenStable();
    expect(where.density).toEqual([true]);
    expect(where.selection).toEqual([true]);
  });

  it('a [state] restore and a [pinnedRows] update run outside the zone', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const api = host.st.api({ kernel: host.ctl!.kernel()! })!;
    const real = api.setState.bind(api);
    api.setState = (s) => (where.restore.push(NgZone.isInAngularZone()), real(s));
    const pins = host.pinsF.api({ kernel: host.ctl!.kernel()! })!;
    const set = pins.set.bind(pins);
    const inZone: boolean[] = [];
    pins.set = (v) => (inZone.push(NgZone.isInAngularZone()), set(v));
    host.state.set({ v: 1, sort: [{ column: 'name', dir: 'asc' }] } as never);
    host.pins.set({ bottom: [ROWS[0]!] });
    await fixture.whenStable();
    expect(where.restore).toEqual([false]);
    expect(inZone).toEqual([false]);
    expect(host.ctl!.kernel()!.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});
