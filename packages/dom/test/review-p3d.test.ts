import { describe, it, expect, afterEach } from 'vitest';
import { definePart } from '../src/part.js';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';
import type { GridEvent } from '@dzgrid/core';
type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
function make(parts: any, n = 200) {
  const box: any = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div'); document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, s: 's' + i })), getRowId: (r) => r.id, columns: [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'badge' } }], messages: EN, onEvent: (e) => events.push(e), ...(parts && { parts }) }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  return { g, host, events, box, vp };
}
describe('probes', () => {
  it('B1 unknown-part said once, not on every column resize', () => {
    const { g, events } = make(null, 3);
    for (let w = 120; w < 200; w += 10) g.kernel.dispatch({ type: 'column.resize', column: 'n', width: w, finished: false }, 'user');
    const n = events.filter((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unknown-part')).length;
    console.log('unknown-part problem events after 8 resize steps:', n);
    expect(n).toBe(1);
  });
  it('B2 a part whose update throws once leaves its pooled cell blank for later rows', () => {
    (window as any).reportError = () => {};
    const part = definePart('cell', { mount(h, c) { const b = document.createElement('b'); b.textContent = c.text; h.append(b); return { update(x) { if (x.text === 's3') throw new Error('x'); b.textContent = x.text; } }; } });
    const { g, host } = make({ badge: part }, 200);
    // r3 rebinding: force via rows update so the cell that showed r3 gets s3 by update
    g.update({ rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, n: i, s: i === 0 ? 's3' : 's' + i })) });
    g.update({ rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, n: i, s: 'ok' + i })) });
    const cell = host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="s"]')!;
    console.log('cell after recovery:', JSON.stringify(cell.textContent));
    expect(cell.textContent).toBe('ok0');
  });
});
describe('probe 3', () => {
  it('B3 a mount that throws for one row leaves its pooled cell blank for the rows it is reused for', () => {
    (window as any).reportError = () => {};
    const part = definePart('cell', { mount(h, c) { if (c.text === 's3') throw new Error('x'); const b = document.createElement('b'); b.textContent = c.text; h.append(b); return { update(x) { b.textContent = x.text; } }; } });
    const { host, box, vp } = make({ badge: part }, 400);
    const blanksAfter = () => { box.scrollTop = 300 * 32; vp.dispatchEvent(new Event('scroll')); return [...host.querySelectorAll('.dzg-layer [data-col="s"]')].filter((c) => c.textContent === '').length; };
    const n = blanksAfter();
    console.log('blank s cells far from r3:', n);
    expect(n).toBe(0);
  });
});
