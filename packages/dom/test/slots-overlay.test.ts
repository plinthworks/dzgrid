// The overlay part through `slots()` (docs/behaviors/overlays.md, step 11 decision O6).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string };
type OC = SlotContext['overlay'];
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function overlayPart() {
  const calls = { mount: 0, update: 0, destroy: 0, all: [] as OC[] };
  const part = definePart('overlay', {
    mount(host, c) {
      calls.mount++;
      calls.all.push(c);
      const p = document.createElement('p');
      p.className = 'mine';
      p.textContent = c.phase;
      host.append(p);
      return {
        update(next) { calls.update++; calls.all.push(next); p.textContent = next.phase; },
        destroy() { calls.destroy++; },
      };
    },
  });
  return { calls, part, last: () => calls.all.at(-1)! };
}

const geometry = (): Geometry => {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
};

function fake() {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  return {
    source, calls,
    answer: (ids: string[], more: object = { total: ids.length }) => calls.at(-1)!.ok({ rows: ids.map((id) => ({ id, name: id })), ...more }),
    fail: (error: unknown) => calls.at(-1)!.err(error),
  };
}

function client(rows: R[], parts: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns: [{ id: 'name' }], messages: EN, features: [slots()], parts: parts as never, onEvent: (e) => events.push(e) }, { geometry: geometry(), sync: true });
  grids.push(g);
  return { g, host, events, overlay: host.querySelector<HTMLElement>('.dzg-overlay')! };
}

function server(parts: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const f = fake();
  const g = createGrid<R>(host, { source: sourceRows(f.source), operations: 'server', getRowId: (r: R) => r.id, columns: [{ id: 'name' }], messages: EN, features: [slots()], parts } as never, { geometry: geometry(), sync: true }) as GridInstance<R, any>;
  grids.push(g);
  return { g, host, f, overlay: host.querySelector<HTMLElement>('.dzg-overlay')! };
}

describe('the overlay part', () => {
  it('draws each phase: empty, no-match, loading, error; the grid’s own text and button are gone', () => {
    const o = overlayPart();
    const t = client([], { overlay: o.part });
    expect(t.overlay.hidden).toBe(false);
    expect(o.calls.mount).toBe(1);
    expect(o.last().phase).toBe('empty');
    expect(o.last().failure).toBeNull();
    expect(t.overlay.textContent).toBe('empty');
    expect([...t.overlay.children].map((e) => e.className)).toEqual(['mine']);
    t.g.update({ overlay: 'loading' });
    expect(o.last().phase).toBe('loading');
    t.g.update({ overlay: 'error' });
    expect(o.last().phase).toBe('error');
    expect(t.overlay.querySelector('button')).toBeNull();
    expect(o.calls.mount).toBe(1);

    const m = overlayPart();
    const u = client([{ id: 'a', name: 'a' }], { overlay: m.part });
    expect(u.overlay.hidden).toBe(true);
    expect(m.calls.mount).toBe(0);
    u.g.kernel.dispatch({ type: 'quick.set', text: 'zz' }, 'user');
    expect(m.last().phase).toBe('no-match');
    expect(u.overlay.textContent).toBe('no-match');
  });

  it('updates only when the phase or the failure changed', () => {
    const o = overlayPart();
    const t = client([], { overlay: o.part });
    t.g.api.refresh();
    t.g.update({ density: 'compact' });
    expect(o.calls.update).toBe(0);
    t.g.update({ overlay: 'loading' });
    expect(o.calls.update).toBe(1);
  });

  it('is told the failure in an error, and retry() asks again, then focuses the grid and says loading', async () => {
    const o = overlayPart();
    const t = server({ overlay: o.part });
    expect(o.last().phase).toBe('loading');
    const error = new Error('503');
    t.f.fail(error);
    expect(o.last().phase).toBe('error');
    expect(o.last().failure).toBe(error);
    // The host's loading over a failed server: no failure told outside an error.
    t.g.update({ overlay: 'loading' });
    expect(o.last().phase).toBe('loading');
    expect(o.last().failure).toBeNull();
    t.g.update({ overlay: null });
    expect(o.last().failure).toBe(error);
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    const before = t.f.calls.length;
    await new Promise((r) => setTimeout(r, 400));
    o.last().retry();
    expect(spy).toHaveBeenCalledWith({ type: 'rows.refresh' }, 'user');
    expect(t.f.calls.length).toBe(before + 1);
    expect(document.activeElement).toBe(t.host.querySelector('.dzg-viewport'));
    expect(o.last().phase).toBe('loading');
    expect(o.last().failure).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(t.host.querySelector('[aria-live]')!.textContent).toBe(EN.text['announce.loading']);
  });

  it('clearFilters() empties every column filter and the quick search, as the user', () => {
    const o = overlayPart();
    const t = client([{ id: 'a', name: 'a' }], { overlay: o.part });
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'contains', value: 'zz' } } }, 'user');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'yy' }, 'user');
    expect(o.last().phase).toBe('no-match');
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    o.last().clearFilters();
    // One command (step 12): one setQuery, one request to a server.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ type: 'query.set', query: { filter: {}, quick: '', sort: [] } });
    expect(spy.mock.calls[0]![1]).toBe('user');
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.g.kernel.query.quick).toBe('');
    // Rows again: the overlay hides and its part is destroyed.
    expect(t.overlay.hidden).toBe(true);
    expect(o.calls.destroy).toBe(1);
    expect(t.overlay.childNodes).toHaveLength(0);
  });

  it('is destroyed when the overlay hides (it holds no failure), mounted again when one shows', () => {
    const o = overlayPart();
    const t = server({ overlay: o.part });
    t.f.fail(new Error('x'));
    o.last().retry();
    t.f.answer(['a']);
    expect(t.overlay.hidden).toBe(true);
    expect(o.calls.destroy).toBe(1);
    t.g.update({ overlay: 'loading' });
    expect(o.calls.mount).toBe(2);
    t.g.destroy();
    grids = [];
    expect(o.calls.destroy).toBe(o.calls.mount);
  });

  it('a part that throws: the grid’s own overlay, with its button, the error reported', () => {
    const reported: unknown[] = [];
    const had = (window as unknown as { reportError?: unknown }).reportError;
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    try {
      const part = definePart('overlay', { mount: () => { throw new Error('overlay broke'); } });
      const t = client([], { overlay: part });
      expect(t.overlay.textContent).toBe(EN.text['grid.noRows']);
      t.g.update({ overlay: 'error' });
      expect(t.overlay.querySelector('button')!.textContent).toBe('Retry');
      expect(reported.map((e) => (e as Error).message)).toEqual(['overlay broke', 'overlay broke']);
    } finally {
      (window as unknown as { reportError?: unknown }).reportError = had;
    }
  });
});
