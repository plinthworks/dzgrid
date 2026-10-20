// Motion in an application with zone.js (step 26, docs/behaviors/motion.md): `motion()` made and
// loaded outside Angular's zone, as the docs and the example do; a value flash then runs on GSAP's
// own ticker without one zone turn (no change detection per frame).
import { describe, it, expect, afterEach } from 'vitest';
import { Component, NgZone, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DZG_ENV, DzGrid, type DzgController } from '@dzgrid/angular';
import type { ClientModel } from '@dzgrid/core';
import type { Geometry, GridFeature, ViewportBox } from '@dzgrid/dom';
import { COLUMNS, MESSAGES, ROWS, rowId, type R } from '../test/support';

afterEach(() => {
  document.body.innerHTML = '';
});

// Frames by hand: the paint follows the model's events, as in a browser.
const queue: FrameRequestCallback[] = [];
const box: ViewportBox = { block: 320, inline: 900, scrollTop: 0, scrollInline: 0 };
const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
const env = { geometry, raf: { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} } };
const frames = () => {
  for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(performance.now());
};

let features: readonly GridFeature[] = [];

@Component({
  selector: 't-motion',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" (gridReady)="ready = $event" />`,
})
class Host {
  rows = ROWS.slice(0, 40);
  cols = COLUMNS;
  id = rowId;
  messages = MESSAGES;
  features = features;
  ready: DzgController<R> | null = null;
}

describe('motion with zone.js', () => {
  it('a flash runs with 0 zone turns once motion is loaded outside the zone', async () => {
    window.matchMedia = ((q: string) => ({ matches: !q.includes(': reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), { provide: DZG_ENV, useValue: env }] });
    const zone = TestBed.inject(NgZone);
    // As the docs say: the entry, GSAP and the chunk loaded outside Angular's zone.
    const m = await zone.runOutsideAngular(async () => {
      const [{ motion }, { gsap }] = await Promise.all([import('@dzgrid/dom/motion-gsap'), import('gsap')]);
      const made = motion({ gsap });
      await made.load();
      return made;
    });
    features = [m];
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    zone.runOutsideAngular(frames);
    await fixture.whenStable();
    const k = fixture.componentInstance.ready!.kernel()!;
    zone.runOutsideAngular(() => {
      (k.rows as unknown as ClientModel<R>).applyTransaction({ update: [{ ...ROWS[2]!, n: 777 }] });
      frames();
    });
    // The transaction's own events reach the outputs inside the zone (one turn, by design); from
    // here on the flash runs frame after frame.
    await fixture.whenStable();
    let turns = 0;
    const sub = zone.onStable.subscribe(() => turns++);
    const cell = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.dzg-row[aria-rowindex="4"] [data-col="n"]')!;
    expect(cell.textContent).toBe('777');
    expect(cell.classList.contains('dzg-flash')).toBe(true);
    const at = Number(cell.style.getPropertyValue('--dzg-flash'));
    // GSAP's ticker runs the tween for a while: no zone turn meanwhile.
    await zone.runOutsideAngular(() => new Promise((r) => setTimeout(r, 120)));
    expect(Number(cell.style.getPropertyValue('--dzg-flash'))).toBeLessThan(at);
    expect(turns).toBe(0);
    sub.unsubscribe();
    fixture.destroy();
  });
});
