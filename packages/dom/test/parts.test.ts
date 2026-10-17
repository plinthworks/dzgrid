import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/** A badge part that counts what the grid asks of it. */
function badge() {
  const calls = { mount: 0, update: 0, destroy: 0 };
  const part = definePart('cell', {
    mount(host, c: SlotContext['cell']) {
      calls.mount++;
      const b = document.createElement('button');
      b.className = 'badge';
      b.textContent = c.text;
      host.append(b);
      return {
        update(next) { calls.update++; b.textContent = next.text; },
        destroy() { calls.destroy++; b.remove(); },
      };
    },
  });
  return { calls, part };
}

function make(settings: Partial<GridSettings<R>>, n = 200) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'statusBadge' } }];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, s: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, events, scroll };
}

describe('parts', () => {
  it('mounts a part once per pooled cell, updates it on rebinding, and puts the value in its context', () => {
    const { calls, part } = badge();
    const { host, scroll } = make({ parts: { statusBadge: part } });
    const peak = host.querySelectorAll('.badge').length;
    expect(calls.mount).toBe(peak);
    expect(host.querySelector('.dzg-row[aria-rowindex="3"] [data-col="s"] .badge')!.textContent).toBe('odd');
    // A person's scrolling, a frame apart and at rest between steps (the overscan for speed trimmed).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    for (let i = 1; i <= 20; i++) {
      scroll(i * 10 * 32);
      vi.advanceTimersByTime(300);
    }
    vi.useRealTimers();
    expect(calls.mount).toBeLessThanOrEqual(peak + 4);
    expect(calls.update).toBeGreaterThan(50);
    expect(host.querySelectorAll('.badge').length).toBe(host.querySelectorAll('.dzg-layer [data-col="s"]').length);
  });

  it('destroys every part it mounted, on the grid’s destroy', () => {
    const { calls, part } = badge();
    const { g, scroll } = make({ parts: { statusBadge: part } });
    for (let i = 1; i <= 10; i++) scroll(i * 20 * 32);
    g.destroy();
    grids = [];
    expect(calls.destroy).toBe(calls.mount);
  });

  it('keeps the focus inside a part through a scroll (the retained row)', () => {
    const { part } = badge();
    const { g, host, scroll } = make({ parts: { statusBadge: part } });
    g.api.focusCell(dataKey('r3')!, 's');
    const button = host.querySelector<HTMLButtonElement>('.dzg-row[aria-rowindex="5"] .badge')!;
    button.focus();
    scroll(150 * 32);
    expect(document.activeElement).toBe(button);
    expect(button.isConnected).toBe(true);
  });

  it('costs only its own cell when it throws, and reports the error', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const broken = definePart('cell', { mount() { throw new Error('part bug'); } });
    const { host } = make({ parts: { statusBadge: broken } }, 5);
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="n"]')!.textContent).toBe('0');
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="s"]')!.textContent).toBe('');
    expect(reportError).toHaveBeenCalled();
  });

  it('applies a part registered for a type to every column of that type, a column’s own name winning', () => {
    const { calls, part } = badge();
    const { host } = make({ parts: { 'cell.number': part } }, 5);
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="n"] .badge')!.textContent).toBe('0');
    expect(calls.mount).toBe(5);
  });

  it('says so when a column names a part nobody registered, and shows the plain text', () => {
    const { host, events } = make({}, 3);
    expect(events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unknown-part' && p.path === 'columns.s.ui.cell'))).toBe(true);
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="s"]')!.textContent).toBe('even');
  });
});

describe('parts and the column window', () => {
  it('destroys a part whose column scrolls out of view, and every part, spare ones included, at the end', () => {
    const { calls, part } = badge();
    const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 400, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
    const host = document.createElement('div');
    document.body.append(host);
    const columns: ColumnDef<R, any>[] = [{ id: 's', ui: { cell: 'statusBadge' }, width: 100 }, ...Array.from({ length: 12 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 }))];
    const g = createGrid<R>(host, { rows: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i, s: 'x' })), getRowId: (r) => r.id, columns, messages: EN, parts: { statusBadge: part } }, { geometry, sync: true });
    const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
    const mounted = calls.mount;
    expect(mounted).toBe(5);
    box.scrollInline = 900;
    vp.dispatchEvent(new Event('scroll'));
    expect(host.querySelectorAll('.badge').length).toBe(0);
    expect(calls.destroy).toBe(mounted);
    box.scrollInline = 0;
    vp.dispatchEvent(new Event('scroll'));
    expect(host.querySelectorAll('.badge').length).toBe(5);
    g.destroy();
    expect(calls.destroy).toBe(calls.mount);
  });
});
