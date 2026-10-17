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


describe('parts: gaps (mutation follow-ups)', () => {
  it('a focus on another column of the row is not the part cell focused', () => {
    const r = recorder();
    const { g } = make({ parts: { w: r.part } });
    g.api.focusCell(dataKey('r2')!, 'n');
    const forR2 = r.seen.filter((c) => c.key === dataKey('r2'));
    expect(forR2.at(-1)!.focused).toBe(false);
    expect(r.seen.some((c) => c.focused)).toBe(false);
  });

  it('updates when the row changed but not the part column value', () => {
    const r = recorder();
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i, s: `v${i}` }));
    const { g } = make({ parts: { w: r.part }, rows });
    const u = r.calls.update;
    const next = { ...rows[1]!, n: 99 };
    g.update({ rows: rows.map((x, i) => (i === 1 ? next : x)) });
    expect(r.calls.update).toBe(u + 1);
    expect(r.seen.at(-1)!.row).toBe(next);
  });

  it('updates every part on a direction change, with the new direction', () => {
    const r = recorder();
    const { g } = make({ parts: { w: r.part }, direction: 'ltr' });
    const u = r.calls.update;
    g.update({ direction: 'rtl' });
    expect(r.calls.update).toBe(u + 5);
    expect(r.seen.slice(-5).every((c) => c.dir === 'rtl')).toBe(true);
  });

  it('updates a part when its column definition changes, even if its text does not', () => {
    const r = recorder();
    const base: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 's', ui: { cell: 'w' } }];
    const { g } = make({ parts: { w: r.part }, columns: base });
    const u = r.calls.update;
    g.update({ columns: [base[0]!, { id: 's', ui: { cell: 'w' }, header: 'S!' }] });
    expect(r.calls.update).toBe(u + 5);
    expect(r.seen.at(-1)!.column).not.toBe(r.seen[0]!.column);
  });

  it('tells a part its cell lost the focus when the focus goes to a header', () => {
    const r = recorder();
    const { g, press } = make({ parts: { w: r.part } });
    g.api.focusCell(dataKey('r0')!, 's');
    expect(r.seen.at(-1)).toMatchObject({ key: dataKey('r0'), focused: true });
    press('ArrowUp');
    expect(r.seen.at(-1)).toMatchObject({ key: dataKey('r0'), focused: false });
  });

  it('Escape in a widget inside a header brings the focus back to the header cell', () => {
    const { host, press } = make();
    const h = host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    const b = document.createElement('button');
    h.append(b);
    b.focus();
    press('Escape', b);
    expect(document.activeElement).toBe(h);
  });
});
