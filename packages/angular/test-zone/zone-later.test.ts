// With zone.js, after the first paint (step 22 review): updates and host writes stay outside the
// zone, outputs and models come back inside it, and none comes after the grid is gone.
import { describe, it, expect, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, NgZone, input, provideZoneChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DzGrid, DzgController, componentPart, type DzgPartContext } from '@dzgrid/angular';
import type { GridEvent } from '@dzgrid/core';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId, type R } from '../test/support';

afterEach(() => {
  document.body.innerHTML = '';
});

const mounted: boolean[] = [];

@Component({ selector: 't-zl', changeDetection: ChangeDetectionStrategy.OnPush, template: `{{ cell().text }}` })
class Zl {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() {
    mounted.push(NgZone.isInAngularZone());
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="q">{{ quick }}</p>
    @if (shown) {
      <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" [(quick)]="quick" (gridEvent)="heard($event)" />
    }`,
})
class Host {
  rows: R[] = ROWS.slice(0, 3);
  cols = COLUMNS;
  id = rowId;
  messages = MESSAGES;
  parts = { status: componentPart('cell', Zl) };
  quick: string | undefined = 'ann';
  shown = true;
  readonly inZone: boolean[] = [];
  readonly events: GridEvent<R>[] = [];
  heard(e: GridEvent<R>): void {
    this.inZone.push(NgZone.isInAngularZone());
    this.events.push(e);
  }
}

describe('with zone.js, after the first paint', () => {
  async function mountZone() {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    mounted.length = 0;
    fixture.componentInstance.inZone.length = 0;
    return fixture;
  }

  it('a later input change (update) mounts its parts outside the zone; its events come out inside', async () => {
    const fixture = await mountZone();
    // 'ann' matches one of 3 rows, ten of 30: new cells to mount, through update().
    fixture.componentInstance.rows = ROWS.slice(0, 30);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.every((z) => z === false)).toBe(true);
    expect(fixture.componentInstance.inZone.length).toBeGreaterThan(0);
    expect(fixture.componentInstance.inZone.every((z) => z)).toBe(true);
  });

  it('a later host model write mounts its parts outside the zone', async () => {
    const fixture = await mountZone();
    // 9 rows under 'ann' fit the cells already made; 'bob' then needs new ones, through the write.
    fixture.componentInstance.rows = ROWS.slice(0, 9);
    fixture.componentInstance.quick = 'bob';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.every((z) => z === false)).toBe(true);
  });

  it('the user’s change reaches the host’s plain field through the zone; nothing after destroy', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const ctrl = fixture.debugElement.query((d) => d.name === 'dz-grid')!.injector.get(DzgController);
    const k = ctrl.kernel()!;
    // From outside the zone, as the grid's own listeners run.
    NgZone.assertNotInAngularZone();
    k.dispatch({ type: 'quick.set', text: 'zed' }, 'user');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.q')!.textContent).toBe('zed');
    fixture.componentInstance.shown = false;
    fixture.detectChanges();
    await fixture.whenStable();
    const n = fixture.componentInstance.events.length;
    k.dispatch({ type: 'quick.set', text: 'after' }, 'user');
    await fixture.whenStable();
    expect(fixture.componentInstance.events.length).toBe(n);
  });
});
