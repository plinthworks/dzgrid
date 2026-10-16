import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { LiveRegion } from '../src/a11y/live-region.js';
import { Scope } from '../src/render/scope.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<R>> = {}, o: { async?: boolean; inline?: number } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: o.inline ?? 600, scrollTop: 0, scrollInline: 0 };
  let reads = 0;
  const geometry: Geometry = {
    read: () => { reads++; return { ...box }; },
    writeScrollTop: (px) => { box.scrollTop = px; },
    writeScrollInline: (px) => { box.scrollInline = px; },
  };
  const frames: (() => void)[] = [];
  const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [
    { id: 'a', header: 'A', width: 100 },
    { id: 'n', header: 'N', type: 'number', width: 100 },
    ...Array.from({ length: 20 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 })),
  ];
  const g = createGrid<R>(host, { rows: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, a: `a${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, ...over },
    { geometry, ...(o.async ? { raf } : { sync: true }) });
  grids.push(g);
  const runFrames = () => { while (frames.length) frames.shift()!(); };
  return { g, host, box, raf, runFrames, reads: () => reads, resetReads: () => { reads = 0; } };
}

describe('phase 2 steps 8-9 review', () => {
  it('hides the overlay and the tooltip in CSS too: an author display beats [hidden]', () => {
    expect(LAYOUT_CSS).toMatch(/\.dzg-overlay\[hidden\][^{]*\{[^}]*display: none/);
    expect(LAYOUT_CSS).toMatch(/\.dzg-tooltip\[hidden\][^{]*\{[^}]*display: none/);
  });

  it('clears the overlay text when no state is left', () => {
    const { g, host } = make({ rows: [] });
    const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
    expect(overlay.textContent).not.toBe('');
    g.update({ rows: [{ id: 'x', a: 'a', n: 1 }] });
    expect(overlay.hidden).toBe(true);
    expect(overlay.textContent).toBe('');
  });

  it('moves DOM focus to a cell far away, on a column out of view, with frames', () => {
    const { g, host, runFrames, box } = make({}, { async: true });
    runFrames();
    g.api.focusCell(dataKey('r900')!, 'x15');
    runFrames();
    const active = document.activeElement as HTMLElement;
    expect(active.closest('.dzg-row')?.getAttribute('aria-rowindex')).toBe('902');
    expect(active.dataset['col']).toBe('x15');
    expect(box.scrollInline).toBeGreaterThan(0);
    expect(host.contains(active)).toBe(true);
  });

  it('moves the row header with the first visible column', () => {
    const { g, host } = make();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'a', hidden: true }] }, 'user');
    const row = host.querySelector('.dzg-layer .dzg-row')!;
    expect(row.querySelector('[data-col="n"]')!.getAttribute('role')).toBe('rowheader');
    expect(row.querySelectorAll('[role=rowheader]').length).toBe(1);
  });

  it('lets flexible columns follow the viewport', () => {
    const { g, host, box } = make({ columns: [{ id: 'a', flex: 1 }, { id: 'n', type: 'number', width: 100 }] }, { inline: 600 });
    const width = () => parseFloat(host.querySelector<HTMLElement>('.dzg-layer .dzg-row [data-col="a"]')!.style.inlineSize);
    const before = width();
    box.inline = 900;
    g.api.refresh();
    expect(width()).toBeGreaterThan(before);
  });

  it('paints once per frame however many reasons there are', () => {
    const { g, runFrames } = make({}, { async: true });
    runFrames();
    const paints = () => (g as unknown as { paints: number }).paints;
    const before = paints();
    g.update({ rows: Array.from({ length: 900 }, (_, i) => ({ id: `r${i}`, a: `b${i}`, n: i })) });
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r1')! }, 'user');
    g.api.refresh();
    runFrames();
    expect(paints() - before).toBe(1);
  });

  it('draws widths set through column.state', () => {
    const { g, host } = make();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'a', width: 222 }] }, 'host');
    expect(host.querySelector<HTMLElement>('.dzg-layer .dzg-row [data-col="a"]')!.style.inlineSize).toBe('222px');
  });

  it('goes back to the host’s direction and the bundle’s language when a setting is cleared', () => {
    const { g, host } = make({ direction: 'rtl', locale: 'fr-FR' });
    g.update({ direction: undefined, locale: undefined });
    expect(host.querySelector('.dzg')!.getAttribute('dir')).toBe('ltr');
    expect(host.querySelector('.dzg-layer .dzg-row[aria-rowindex="1002"], .dzg-layer .dzg-row [data-col="n"]')!.textContent).toBe('0');
    g.update({ rows: [{ id: 'q', a: 'q', n: 1234.5 }] });
    expect(host.querySelector('.dzg-layer .dzg-row [data-col="n"]')!.textContent).toBe('1,234.5');
  });

  it('announces the last sentence, not an earlier one late', async () => {
    const scope = new Scope();
    const live = new LiveRegion(document, scope);
    const said: string[] = [];
    const mo = new MutationObserver(() => { if (live.el.textContent) said.push(live.el.textContent); });
    mo.observe(live.el, { childList: true, characterData: true, subtree: true });
    live.announce('first');
    live.announce('second');
    await new Promise((r) => setTimeout(r, 120));
    mo.disconnect();
    expect(said).toEqual(['second']);
    scope.dispose();
  });

  it('does not grow its cleanups with every timer that fired', async () => {
    const scope = new Scope();
    for (let i = 0; i < 100; i++) scope.timeout(() => {}, 0);
    await new Promise((r) => setTimeout(r, 20));
    expect((scope as unknown as { pending: number }).pending).toBe(0);
    scope.dispose();
  });
});
