// <dz-grid> in an application with zone.js (step 22, docs/behaviors/angular-parts.md: zones).
// Its own vitest project: zone.js patches globals the zoneless tests must not see.
import { describe, it, expect, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, NgZone, input, provideZoneChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DzGrid, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, rowId } from '../test/support';

afterEach(() => {
  document.body.innerHTML = '';
});

const where = { mountedInZone: [] as boolean[], outputInZone: [] as boolean[] };

@Component({
  selector: 't-zcell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="z" (click)="hits.set(hits() + 1); cell().emit('hit')">{{ cell().text }} {{ hits() }}</button>`,
})
class ZoneCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  readonly hits = signal(0);
  constructor() {
    where.mountedInZone.push(NgZone.isInAngularZone());
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="count">{{ count }}</p>
    <dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [parts]="parts" (cellAction)="hit()" />`,
})
class Host {
  rows = ROWS;
  cols = COLUMNS;
  id = rowId;
  messages = MESSAGES;
  parts = { status: componentPart('cell', ZoneCell) };
  /** A plain field: only a zone-driven check shows it changed. */
  count = 0;
  hit(): void {
    where.outputInZone.push(NgZone.isInAngularZone());
    this.count++;
  }
}

describe('with zone.js', () => {
  it('is really running with a zone', () => {
    expect(typeof (globalThis as { Zone?: unknown }).Zone).toBe('function');
  });

  it('creates the grid and mounts parts outside the zone, emits outputs inside it, and a click in a part updates both views', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), fakeEnv().provider] });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(where.mountedInZone.length).toBeGreaterThan(0);
    expect(where.mountedInZone.every((z) => z === false)).toBe(true);
    const button = el.querySelector<HTMLButtonElement>('.dzg-row[aria-rowindex="3"] .z')!;
    expect(button.textContent!.trim()).toBe('odd 0');
    button.click();
    await fixture.whenStable();
    expect(where.outputInZone).toEqual([true]);
    // The host's plain field, through the zone; the part's own signal, through the hybrid scheduler.
    expect(el.querySelector('.count')!.textContent).toBe('1');
    expect(button.textContent!.trim()).toBe('odd 1');
  });
});
