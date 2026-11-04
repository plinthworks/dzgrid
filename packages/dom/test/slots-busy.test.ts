// The busy part through `slots()` (docs/behaviors/overlays.md « The busy part », parts.md). Expectations by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { definePart, type SlotContext, type SlotPart } from '../src/part.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
type BC = SlotContext['busy'];
let grids: GridInstance<R, any>[] = []; // any: the grid's second parameter (its features) is not under test
let reported: unknown[] = [];
const had = (window as unknown as { reportError?: unknown }).reportError; // unknown: jsdom's window may lack it
beforeEach(() => {
  vi.useFakeTimers();
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e); // unknown: a stub on jsdom's window
});
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  (window as unknown as { reportError?: unknown }).reportError = had; // unknown: put back as found
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const geometry = (): Geometry => {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
};

/** A part that counts its calls and keeps every context it saw; `fail` throws in mount or update. */
function busyPart(fail: { mount?: boolean; update?: boolean } = {}) {
  const calls = { mount: 0, update: 0, destroy: 0, all: [] as BC[], host: null as HTMLElement | null };
  const part = definePart('busy', {
    mount(host, c) {
      calls.mount++;
      calls.all.push(c);
      calls.host = host;
      if (fail.mount) throw new Error('mount');
      const logo = document.createElement('svg-logo');
      logo.className = 'logo';
      host.append(logo);
      return {
        update(n) {
          calls.update++;
          calls.all.push(n);
          if (fail.update) throw new Error('update');
        },
        destroy() {
          calls.destroy++;
        },
      };
    },
  });
  return { calls, part, last: () => calls.all.at(-1)! };
}

function make(parts: Record<string, SlotPart>, more: object = {}, features = [slots()]) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows: [{ id: 'a', name: 'a' }], getRowId: (r) => r.id, columns: [{ id: 'name' }], messages: EN, parts, features, onEvent: (e) => events.push(e), ...more }, { geometry: geometry(), sync: true });
  grids.push(g as never); // never: GridInstance<R> into the list of GridInstance<R, any>
  const q = (s: string) => host.querySelector<HTMLElement>(s);
  return {
    g, host, events,
    problems: (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])),
    own: () => q('.dzg-busy-part'),
    ownShown: () => !!q('.dzg-busy-part') && !q('.dzg-busy-part')!.hidden,
    barShown: () => !!q('.dzg-busy') && !q('.dzg-busy')!.hidden,
    vp: q('.dzg-viewport')!,
    overlay: q('.dzg-overlay')!,
    live: q('.dzg-live')!,
  };
}

describe('the busy part', () => {
  it('draws in place of the line, at the same moments; the grid keeps aria-busy and says nothing', () => {
    const p = busyPart();
    const t = make({ busy: p.part });
    t.g.update({ busy: true });
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(199);
    expect(p.calls.mount).toBe(0);
    expect(t.own()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(p.calls.mount).toBe(1);
    expect(t.ownShown()).toBe(true);
    expect(t.own()!.querySelector('.logo')).not.toBeNull();
    expect(p.calls.host).toBe(t.own());
    // The built-in line is not made.
    expect(t.host.querySelector('.dzg-busy')).toBeNull();
    expect(p.last().active).toBe(true);
    // Decorative to assistive tech, outside the grid's role, never under the pointer, just under the header.
    expect(t.own()!.getAttribute('aria-hidden')).toBe('true');
    expect(t.vp.contains(t.own())).toBe(false);
    expect(t.own()!.style.pointerEvents).toBe('none');
    expect(t.own()!.style.position).toBe('absolute');
    expect(t.own()!.style.getPropertyValue('inset-block-start')).toBe(t.overlay.style.getPropertyValue('inset-block-start'));
    expect(t.own()!.style.getPropertyValue('inset-block-start')).not.toBe('');
    // Held 400 ms.
    t.g.update({ busy: false });
    expect(t.ownShown()).toBe(true);
    vi.advanceTimersByTime(400);
    expect(t.ownShown()).toBe(false);
    expect(t.live.textContent).toBe('');
  });

  it('mounted once, then kept: each show and hide is an update of active; destroyed with the grid', () => {
    const p = busyPart();
    const t = make({ busy: p.part });
    for (let i = 0; i < 3; i++) {
      t.g.update({ busy: true });
      vi.advanceTimersByTime(600);
      t.g.update({ busy: false });
    }
    expect(p.calls.mount).toBe(1);
    expect(p.calls.all.map((c) => c.active)).toEqual([true, false, true, false, true, false]);
    // Nothing else changed: a paint while hidden updates nothing.
    t.g.update({ label: 'x' });
    expect(p.calls.update).toBe(5);
    t.g.destroy();
    grids = [];
    expect(p.calls.destroy).toBe(1);
  });

  it('never with the loading overlay', () => {
    const p = busyPart();
    const t = make({ busy: p.part }, { busy: true, overlay: 'loading' });
    vi.advanceTimersByTime(1000);
    expect(p.calls.mount).toBe(0);
    t.g.update({ overlay: null });
    vi.advanceTimersByTime(200);
    expect(t.ownShown()).toBe(true);
    t.g.update({ overlay: 'loading' });
    expect(t.ownShown()).toBe(false);
    expect(p.last().active).toBe(false);
  });

  it('context: dir, the application context, reducedMotion from motion: false and the media query', () => {
    let reduce = false;
    const heard: (() => void)[] = [];
    // A stub: jsdom has no matchMedia.
    vi.stubGlobal('matchMedia', (q: string) => ({ get matches() { return q.includes('reduce') && reduce; }, media: q, addEventListener: (_: string, f: () => void) => heard.push(f), removeEventListener: () => {} }));
    const p = busyPart();
    const app = { brand: 'x' };
    const t = make({ busy: p.part }, { busy: true, direction: 'rtl', context: app });
    vi.advanceTimersByTime(200);
    expect(p.last()).toMatchObject({ active: true, reducedMotion: false, dir: 'rtl', context: app });
    t.g.update({ motion: false });
    expect(p.last().reducedMotion).toBe(true);
    t.g.update({ motion: true });
    expect(p.last().reducedMotion).toBe(false);
    // The preference flips while the grid lives: followed.
    reduce = true;
    for (const f of heard) f();
    expect(p.last().reducedMotion).toBe(true);
  });

  it('a page that cannot tell the preference reads reduced motion', () => {
    vi.stubGlobal('matchMedia', undefined);
    const p = busyPart();
    make({ busy: p.part }, { busy: true });
    vi.advanceTimersByTime(200);
    expect(p.last().reducedMotion).toBe(true);
  });

  it('a part that throws in mount: the line instead, reported once, not tried again', () => {
    const p = busyPart({ mount: true });
    const t = make({ busy: p.part });
    for (let i = 0; i < 3; i++) {
      t.g.update({ busy: true });
      vi.advanceTimersByTime(200);
      expect(t.barShown()).toBe(true);
      expect(t.ownShown()).toBe(false);
      vi.advanceTimersByTime(400);
      t.g.update({ busy: false });
    }
    expect(p.calls.mount).toBe(1);
    expect(reported).toHaveLength(1);
  });

  it('a part that throws in update: destroyed, the line, reported once', () => {
    const p = busyPart({ update: true });
    const t = make({ busy: p.part });
    t.g.update({ busy: true });
    vi.advanceTimersByTime(600);
    t.g.update({ busy: false });
    expect(p.calls.destroy).toBe(1);
    t.g.update({ busy: true });
    vi.advanceTimersByTime(200);
    expect(t.barShown()).toBe(true);
    expect(t.ownShown()).toBe(false);
    expect(reported).toHaveLength(1);
    expect(p.calls.mount).toBe(1);
  });

  it('a new registry: another part mounted at the next show, the old one destroyed; none: the line', () => {
    const a = busyPart();
    const b = busyPart();
    const t = make({ busy: a.part }, { busy: true });
    vi.advanceTimersByTime(200);
    t.g.update({ parts: { busy: b.part } });
    expect(a.calls.destroy).toBe(1);
    expect(b.calls.mount).toBe(1);
    expect(t.ownShown()).toBe(true);
    t.g.update({ parts: {} });
    expect(b.calls.destroy).toBe(1);
    expect(t.ownShown()).toBe(false);
    expect(t.barShown()).toBe(true);
  });

  it("a feature's busy part is used; the host's wins", () => {
    const f = busyPart();
    const h = busyPart();
    const feat = { id: 'brand', setup: () => ({ destroy() {} }), parts: { busy: f.part } };
    const t = make({}, { busy: true }, [slots(), feat as never]); // never: a bare feature with parts only
    vi.advanceTimersByTime(200);
    expect(f.calls.mount).toBe(1);
    t.g.update({ parts: { busy: h.part } });
    expect(h.calls.mount).toBe(1);
  });

  it('without slots(): missing-feature, the line drawn', () => {
    const p = busyPart();
    const t = make({ busy: p.part }, { busy: true }, []);
    vi.advanceTimersByTime(200);
    expect(t.problems()).toContainEqual({ code: 'missing-feature', severity: 'warning', path: 'parts.busy', detail: 'slots' });
    expect(p.calls.mount).toBe(0);
    expect(t.barShown()).toBe(true);
  });
});
