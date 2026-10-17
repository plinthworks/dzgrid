import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function recorder(focusable = true) {
  const seen: SlotContext['cell'][] = [];
  const calls = { mount: 0, update: 0, focus: 0 };
  const part = definePart('cell', {
    mount(host, c) {
      calls.mount++;
      seen.push(c);
      const b = document.createElement('button');
      b.className = 'w';
      b.textContent = c.text;
      host.append(b);
      return {
        update(n) { calls.update++; seen.push(n); b.textContent = n.text; },
        focus() { calls.focus++; if (!focusable) return false; b.focus(); return true; },
      };
    },
  });
  return { part, seen, calls };
}

function make(settings: Partial<GridSettings<R>> = {}, n = 5) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'w' } }, ...Array.from({ length: 10 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 }))];
  const g = createGrid<R>(host, { rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, s: `v${i}` })), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const press = (key: string, target: Element = document.activeElement!) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { g, host, events, box, vp, press };
}



describe('probes: suspected bugs (these FAIL on 69b47fb)', () => {
  it('Escape in a text input a part drew brings the focus back to the cell', () => {
    const part = definePart('cell', { mount(h) { const i = document.createElement('input'); h.append(i); return { focus() { i.focus(); return true; } }; } });
    const { g, press } = make({ parts: { w: part } });
    g.api.focusCell(dataKey('r1')!, 's');
    const cell = document.activeElement!;
    press('Enter');
    expect(document.activeElement!.tagName).toBe('INPUT');
    press('Escape');
    expect(document.activeElement).toBe(cell);
  });
});
