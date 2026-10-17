import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
const hadReport = (window as unknown as { reportError?: unknown }).reportError;
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); (window as unknown as { reportError?: unknown }).reportError = hadReport; });

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

describe('parts: when update runs', () => {
  it('calls nothing for a rebind that changes none of the context: row height, checkbox column, column window', () => {
    const r = recorder();
    const { g, box, vp } = make({ parts: { w: r.part } });
    const before = r.calls.update;
    g.update({ density: 'compact' });
    g.update({ selection: { mode: 'multi', checkbox: true } });
    box.scrollInline = 300;
    vp.dispatchEvent(new Event('scroll'));
    box.scrollInline = 0;
    vp.dispatchEvent(new Event('scroll'));
    expect(r.calls.update).toBe(before);
  });

  it('updates on new row data, a language change, and a focus change', () => {
    const r = recorder();
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, n: i, s: `v${i}` }));
    const { g } = make({ parts: { w: r.part }, rows });
    let u = r.calls.update;
    // One row replaced, the others the same objects.
    g.update({ rows: rows.map((x, i) => (i === 1 ? { ...x, s: 'new' } : x)) });
    expect(r.calls.update).toBe(u + 1);
    u = r.calls.update;
    g.update({ locale: 'fr' });
    expect(r.calls.update).toBe(u + 5);
    u = r.calls.update;
    g.api.focusCell(dataKey('r2')!, 's');
    expect(r.calls.update).toBe(u + 1);
    expect(r.seen.at(-1)).toMatchObject({ key: dataKey('r2'), focused: true });
    g.api.focusCell(dataKey('r3')!, 's');
    const last = r.seen.slice(-2);
    expect(last.map((c) => [c.key, c.focused])).toEqual(expect.arrayContaining([[dataKey('r2'), false], [dataKey('r3'), true]]));
  });

  it('tells a part whether its cell has the focus from the start', () => {
    const r = recorder();
    make({ parts: { w: r.part } });
    expect(r.seen.every((c) => c.focused === false)).toBe(true);
  });
});

describe('parts: keys', () => {
  it('Enter and F2 hand focus to the part; Escape brings it back to the cell', () => {
    const r = recorder();
    const { g, host, press } = make({ parts: { w: r.part } });
    g.api.focusCell(dataKey('r1')!, 's');
    const cell = document.activeElement!;
    press('Enter');
    expect(r.calls.focus).toBe(1);
    expect(document.activeElement!.classList.contains('w')).toBe(true);
    press('Escape');
    expect(document.activeElement).toBe(cell);
    press('F2');
    expect(document.activeElement!.classList.contains('w')).toBe(true);
    void host;
  });

  it('leaves Enter to the host on a cell without a part', () => {
    const { g, press } = make();
    g.api.focusCell(dataKey('r1')!, 'n');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    void press;
  });

  it('keeps focus on the cell when the part has nothing to focus', () => {
    const r = recorder(false);
    const { g, press } = make({ parts: { w: r.part } });
    g.api.focusCell(dataKey('r1')!, 's');
    const cell = document.activeElement!;
    press('Enter');
    expect(r.calls.focus).toBe(1);
    expect(document.activeElement).toBe(cell);
  });
});

describe('parts: messages and errors', () => {
  it('reads app.* keys from the bundle; a missing one gives its key and one warning', () => {
    const texts: string[] = [];
    const part = definePart('cell', { mount(h, c) { texts.push(c.msg('app.ok'), c.msg('app.gone')); h.textContent = 'x'; return {}; } });
    const messages = { ...EN, text: { ...EN.text, 'app.ok': 'Fine' } } as typeof EN;
    const { events } = make({ parts: { w: part }, messages }, 3);
    expect(texts.slice(0, 2)).toEqual(['Fine', 'app.gone']);
    const told = events.filter((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'missing-message'));
    expect(told.length).toBe(1);
    expect(told[0]).toMatchObject({ problems: [{ code: 'missing-message', severity: 'warning', path: 'messages.text.app.gone' }] });
  });

  it('tells a missing app key again for a new bundle', () => {
    const part = definePart('cell', { mount(h, c) { h.textContent = c.msg('app.gone'); return { update(n) { h.textContent = n.msg('app.gone'); } }; } });
    const { g, events } = make({ parts: { w: part } }, 2);
    g.update({ messages: { ...EN, text: { ...EN.text } } as typeof EN });
    expect(events.filter((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'missing-message')).length).toBe(2);
  });

  it('reports a destroy that throws', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const part = definePart('cell', { mount(h) { h.textContent = 'x'; return { destroy() { throw new Error('cleanup'); } }; } });
    const { g } = make({ parts: { w: part } }, 2);
    g.update({ parts: {} });
    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
