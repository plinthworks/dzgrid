// The busy bar (docs/behaviors/overlays.md « Busy bar »): rows reloaded and kept on screen.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = []; // any: the grid's second parameter (its features) is not under test
beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const geometry = (): Geometry => {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
};
const columns: ColumnDef<R, any>[] = [{ id: 'name' }]; // any: the column's value type is not under test
const rows = (ids: string[]) => ids.map((id) => ({ id, name: id }));

function parts(host: HTMLElement) {
  const q = (s: string) => host.querySelector<HTMLElement>(s);
  return {
    bar: () => q('.dzg-busy'),
    /** Shown: made and not hidden. */
    shown: () => !!q('.dzg-busy') && !q('.dzg-busy')!.hidden,
    vp: q('.dzg-viewport')!,
    overlay: q('.dzg-overlay')!,
    live: q('.dzg-live')!,
  };
}

function client(more: object = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows: rows(['a', 'b']), getRowId: (r) => r.id, columns, messages: EN, ...more }, { geometry: geometry(), sync: true });
  grids.push(g as never); // never: GridInstance<R> into the list of GridInstance<R, any>
  return { g, host, ...parts(host) };
}

function server() {
  const calls: { ok(v: unknown): void }[] = [];
  const source: DataSource<R> = {
    // A thenable answered by the test: never a real promise, so answers land synchronously.
    fetch: () => ({ then(ok: (v: never) => void) { calls.push({ ok: ok as never }); } }) as never,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const settings = { source: sourceRows(source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN };
  const g = createGrid<R>(host, settings as never, { geometry: geometry(), sync: true }) as GridInstance<R, any>; // never: a server's settings without its query type
  grids.push(g);
  const answer = (ids: string[]) => calls[calls.length - 1]!.ok({ rows: rows(ids), total: 6 });
  return { g, host, answer, calls, ...parts(host) };
}

describe('the busy bar', () => {
  it("the host's busy: aria-busy at once, the bar only after 200 ms, held 400 ms once shown", () => {
    const t = client();
    expect(t.bar()).toBeNull();
    t.g.update({ busy: true });
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    expect(t.shown()).toBe(false);
    vi.advanceTimersByTime(199);
    expect(t.shown()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(t.shown()).toBe(true);
    expect(t.bar()!.getAttribute('aria-hidden')).toBe('true');
    // Outside the grid's role, never in the pointer's way (its look: the layout CSS).
    expect(t.vp.contains(t.bar())).toBe(false);
    vi.advanceTimersByTime(100);
    t.g.update({ busy: false });
    expect(t.vp.hasAttribute('aria-busy')).toBe(false);
    // Shown 100 ms so far: kept until 400.
    expect(t.shown()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(t.shown()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.shown()).toBe(false);
  });

  it('a fast answer never shows it', () => {
    const t = client();
    t.g.update({ busy: true });
    vi.advanceTimersByTime(150);
    t.g.update({ busy: false });
    vi.advanceTimersByTime(1000);
    expect(t.shown()).toBe(false);
    // Busy again: the delay starts over.
    t.g.update({ busy: true });
    vi.advanceTimersByTime(150);
    expect(t.shown()).toBe(false);
    vi.advanceTimersByTime(50);
    expect(t.shown()).toBe(true);
  });

  it('busy again while held: stays, then goes when no longer busy after the hold', () => {
    const t = client();
    t.g.update({ busy: true });
    vi.advanceTimersByTime(200);
    t.g.update({ busy: false });
    t.g.update({ busy: true });
    vi.advanceTimersByTime(1000);
    expect(t.shown()).toBe(true);
    t.g.update({ busy: false });
    expect(t.shown()).toBe(false);
  });

  it('sits at the overlay top, just under the header rows', () => {
    const t = client({ busy: true });
    vi.advanceTimersByTime(200);
    expect(t.bar()!.style.getPropertyValue('inset-block-start')).toBe(t.overlay.style.getPropertyValue('inset-block-start'));
    expect(t.bar()!.style.getPropertyValue('inset-block-start')).not.toBe('');
  });

  it('never with the full loading overlay; with no rows the host busy still shows it', () => {
    const t = client({ busy: true, overlay: 'loading' });
    vi.advanceTimersByTime(1000);
    expect(t.shown()).toBe(false);
    t.g.update({ overlay: null, rows: [] });
    expect(t.overlay.textContent).toBe(EN.text['grid.noRows']);
    vi.advanceTimersByTime(200);
    expect(t.shown()).toBe(true);
  });

  it('the loading overlay takes over a bar still held', () => {
    const t = client({ busy: true });
    vi.advanceTimersByTime(200);
    t.g.update({ overlay: 'loading' });
    expect(t.shown()).toBe(false);
  });

  it('nothing is announced for a busy reload', () => {
    const t = client();
    const said: string[] = [];
    new MutationObserver(() => said.push(t.live.textContent ?? '')).observe(t.live, { childList: true, characterData: true, subtree: true });
    for (let i = 0; i < 3; i++) {
      t.g.update({ busy: true });
      vi.advanceTimersByTime(1000);
      t.g.update({ busy: false });
      vi.advanceTimersByTime(1000);
    }
    expect(said.filter(Boolean)).toEqual([]);
    expect(t.live.textContent).toBe('');
  });

  it("a server's reload with rows kept shows it after the delay; the first load has the overlay instead", () => {
    const t = server();
    vi.advanceTimersByTime(1000);
    expect(t.overlay.hidden).toBe(false);
    expect(t.shown()).toBe(false);
    t.answer(['a', 'b']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.overlay.hidden).toBe(true);
    expect(t.vp.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(200);
    expect(t.shown()).toBe(true);
    vi.advanceTimersByTime(400);
    t.answer(['a', 'b']);
    expect(t.shown()).toBe(false);
    expect(t.vp.hasAttribute('aria-busy')).toBe(false);
  });

  it('destroy lets go of its timers', () => {
    const t = client();
    t.g.update({ busy: true });
    t.g.destroy();
    grids = [];
    expect(vi.getTimerCount()).toBe(0);
  });
});
