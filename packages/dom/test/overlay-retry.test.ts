// The retry button on the error overlay (docs/behaviors/overlays.md, step 11 decision O3).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { checkMessages, MESSAGE_KEYS } from '../src/messages.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });

/** A source answered by the test: each fetch waits for `answer` or `fail`. */
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

const geometry = (): Geometry => {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  return { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
};

function server(more: object = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fake();
  const columns: ColumnDef<R, any>[] = [{ id: 'name' }];
  const g = createGrid<R>(host, { source: sourceRows(f.source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN, onEvent: (e: GridEvent<R>) => events.push(e), ...more } as never, { geometry: geometry(), sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
  return { g, host, f, events, overlay, retry: () => overlay.querySelector<HTMLButtonElement>('button') };
}

function client(rows: R[] = [{ id: 'a', name: 'a' }], more: object = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns: [{ id: 'name' }], messages: EN, ...more }, { geometry: geometry(), sync: true });
  grids.push(g);
  const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
  return { g, host, overlay, retry: () => overlay.querySelector<HTMLButtonElement>('button') };
}

describe('the retry button', () => {
  it('shows with the error, under its message: a native button named by grid.retry', () => {
    const t = server();
    t.f.fail(new Error('503'));
    expect(t.overlay.hidden).toBe(false);
    const b = t.retry()!;
    expect(b).not.toBeNull();
    expect(b.type).toBe('button');
    expect(b.textContent).toBe('Retry');
    // The message first, then the button: one each.
    expect([...t.overlay.childNodes].map((n) => n.textContent)).toEqual([EN.text['grid.error'], 'Retry']);
    expect(t.overlay.querySelectorAll('button')).toHaveLength(1);
    // Outside role="grid" (S4).
    expect(b.closest('[role="grid"]')).toBeNull();
  });

  it('asks again, as the user, for the same page', () => {
    const t = server();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.fail(new Error('503'));
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    const before = t.f.calls.length;
    t.retry()!.click();
    expect(spy).toHaveBeenCalledWith({ type: 'rows.refresh' }, 'user');
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.f.calls.at(-1)!.req.page!.index).toBe(1);
  });

  it('gives the focus back to the grid’s focused cell, or to the grid', () => {
    const t = server();
    t.f.answer(['a', 'b'], { total: 2 });
    t.g.api.focusCell(dataKey('b')!, 'name');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.fail(new Error('503'));
    const b = t.retry()!;
    b.focus();
    expect(document.activeElement).toBe(b);
    b.click();
    const cell = document.activeElement as HTMLElement;
    expect(cell.dataset['col']).toBe('name');
    expect(cell.closest('.dzg-row')!.getAttribute('aria-rowindex')).toBe('3');

    // Nothing focused before: the grid itself.
    const u = server();
    u.f.fail(new Error('down'));
    u.retry()!.focus();
    u.retry()!.click();
    expect(document.activeElement).toBe(u.host.querySelector('.dzg-viewport'));
  });

  it('announces the loading', async () => {
    const t = server();
    t.f.fail(new Error('503'));
    await new Promise((r) => setTimeout(r, 400));
    t.retry()!.click();
    await new Promise((r) => setTimeout(r, 400));
    expect(t.host.querySelector('[aria-live]')!.textContent).toBe(EN.text['announce.loading']);
  });

  it('is there only with the error: not while loading, nor with no rows or no match', () => {
    const t = server();
    // First load: the loading overlay, no button.
    expect(t.overlay.hidden).toBe(false);
    expect(t.retry()).toBeNull();
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
    t.f.fail(new Error('503'));
    expect(t.retry()).not.toBeNull();
    t.retry()!.click();
    // Loading again with nothing to keep: the loading overlay, the button gone.
    expect(t.overlay.textContent).toBe(EN.text['grid.loading']);
    expect(t.retry()).toBeNull();
    t.f.answer([], { total: 0 });
    expect(t.overlay.textContent).toBe(EN.text['grid.noRows']);
    expect(t.retry()).toBeNull();

    const c = client();
    c.g.kernel.dispatch({ type: 'quick.set', text: 'zz' }, 'user');
    expect(c.overlay.textContent).toBe(EN.text['grid.noMatches']);
    expect(c.retry()).toBeNull();
  });

  it('leaves with the overlay: rows kept while the next load hides it, emptied', () => {
    const t = server();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.fail(new Error('503'));
    t.retry()!.click();
    // Loading shows only when there is nothing to keep (the rows of page 0 are kept).
    expect(t.overlay.hidden).toBe(true);
    expect(t.overlay.childNodes).toHaveLength(0);
    t.f.answer(['c', 'd'], { total: 6 });
    expect(t.overlay.hidden).toBe(true);
    expect(t.retry()).toBeNull();
  });

  it('comes with the host’s error overlay too, and follows the bundle', () => {
    const c = client();
    c.g.update({ overlay: 'error' });
    expect(c.retry()!.textContent).toBe('Retry');
    c.g.update({ messages: FR });
    expect(c.retry()!.textContent).toBe('Réessayer');
    expect(c.overlay.firstChild!.textContent).toBe(FR.text['grid.error']);
    c.g.update({ messages: AR });
    expect(c.retry()!.textContent).toBe('إعادة المحاولة');
    const spy = vi.spyOn(c.g.kernel, 'dispatch');
    c.retry()!.click();
    expect(spy).toHaveBeenCalledWith({ type: 'rows.refresh' }, 'user');
    c.g.update({ overlay: null });
    expect(c.overlay.hidden).toBe(true);
    expect(c.retry()).toBeNull();
  });

  it('takes pointer events though the overlay lets them through', () => {
    // Every element the overlay holds (the button, a part's controls); its own text node lets them through.
    expect(LAYOUT_CSS).toMatch(/:where\(\.dzg-overlay > \*\)\s*\{\s*pointer-events:\s*auto;?\s*\}/);
  });
});

describe('grid.retry, a required key', () => {
  it('is in every bundle, and a bundle without it is refused', () => {
    expect(MESSAGE_KEYS).toContain('grid.retry');
    expect(EN.text['grid.retry']).toBe('Retry');
    expect(FR.text['grid.retry']).toBe('Réessayer');
    expect(AR.text['grid.retry']).toBe('إعادة المحاولة');
    const { 'grid.retry': _, ...rest } = EN.text;
    expect(() => checkMessages({ locale: 'en', text: rest } as never)).toThrow(/grid\.retry/);
  });
});
