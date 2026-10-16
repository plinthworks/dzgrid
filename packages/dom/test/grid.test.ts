import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance, type GridSettings } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { msg } from '../src/messages.js';

type R = { id: string; name: string; n: number; c: string };
const rows = (n: number, tag = ''): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Name ${i}${tag}`, n: i * 1000.5, c: `c${i % 7}` }));

/** A viewport that never lays out: the test moves it. */
function fakeGeometry(o: Partial<ViewportBox> = {}) {
  const box: ViewportBox = { block: 400, inline: 800, scrollTop: 0, scrollInline: 0, ...o };
  const geometry: Geometry = {
    read: () => ({ ...box }),
    writeScrollTop: (px) => { box.scrollTop = px; },
    writeScrollInline: (px) => { box.scrollInline = px; },
  };
  return { box, geometry };
}

let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(over: Partial<GridSettings<R>> = {}, geo = fakeGeometry()) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', pinned: 'start', width: 120 },
    { id: 'n', header: 'N', type: 'number', width: 100 },
    { id: 'c', header: 'C', width: 100 },
    ...Array.from({ length: 27 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, header: `X${i}`, value: (r: R) => `${r.id}-${i}`, width: 100 })),
    { id: 'end', header: 'End', pinned: 'end', width: 80, value: (r: R) => r.id },
  ];
  const g = createGrid<R>(host, { rows: rows(1000), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...over }, { geometry: geo.geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number, inline = geo.box.scrollInline) => { geo.box.scrollTop = top; geo.box.scrollInline = inline; vp.dispatchEvent(new Event('scroll')); };
  const bodyRows = () => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
  const rowIndexes = () => bodyRows().map((r) => Number(r.getAttribute('aria-rowindex')));
  return { g, host, vp, events, geo, scroll, bodyRows, rowIndexes };
}

describe('the grid shell', () => {
  it('puts role=grid on the scroller, with live region, overlay and tooltip outside it', () => {
    const { host, vp } = make();
    const root = host.querySelector('.dzg')!;
    expect(vp.getAttribute('role')).toBe('grid');
    expect(vp.getAttribute('tabindex')).toBe('-1');
    expect(vp.getAttribute('aria-rowcount')).toBe('1001');
    expect(vp.getAttribute('aria-colcount')).toBe('31');
    expect(vp.getAttribute('aria-label')).toBe(msg(EN, 'grid.label'));
    for (const sel of ['.dzg-live', '.dzg-overlay', '.dzg-tooltip']) {
      const el = root.querySelector(sel)!;
      expect(el, sel).not.toBeNull();
      expect(el.closest('[role=grid]'), sel).toBeNull();
    }
    expect(root.querySelector('.dzg-live')!.getAttribute('aria-live')).toBe('polite');
  });

  it('takes a host label over the bundle’s', () => {
    const { vp } = make({ label: 'Patients' });
    expect(vp.getAttribute('aria-label')).toBe('Patients');
  });

  it('keeps the instance and its elements on update, and reformats on a locale change', () => {
    const { g, host, events } = make();
    const vp = host.querySelector('.dzg-viewport');
    const firstNum = () => host.querySelector('.dzg-layer .dzg-row[aria-rowindex="3"] [data-col="n"]')!.textContent;
    expect(firstNum()).toBe('1,000.5');
    events.length = 0;
    g.update({ rows: rows(1000, '!') });
    expect(host.querySelector('.dzg-viewport')).toBe(vp);
    expect(events.find((e) => e.type === 'modelUpdated')).toMatchObject({ kind: 'rows', source: 'host' });
    g.update({ locale: 'fr-FR', messages: FR });
    expect(host.querySelector('.dzg-viewport')).toBe(vp);
    expect(firstNum()).toBe(new Intl.NumberFormat('fr-FR').format(1000.5));
    expect(vp!.getAttribute('aria-label')).toBe(msg(FR, 'grid.label'));
  });

  it('sets dir on its root, and follows update({ direction })', () => {
    const { g, host } = make({ direction: 'rtl' });
    expect(host.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
    g.update({ direction: 'ltr' });
    expect(host.querySelector('.dzg')!.getAttribute('dir')).toBe('ltr');
  });

  it('shows no rows, no matches, loading and error from the messages, outside the grid', () => {
    const { g, host, vp } = make({ rows: [] });
    const overlay = host.querySelector<HTMLElement>('.dzg-overlay')!;
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toBe(msg(EN, 'grid.noRows'));
    g.update({ rows: rows(10) });
    expect(overlay.hidden).toBe(true);
    g.kernel.dispatch({ type: 'query.set', query: { ...g.kernel.rows.query, quick: 'zzzz', key: 'q-zzzz' } }, 'user');
    expect(overlay.textContent).toBe(msg(EN, 'grid.noMatches'));
    g.update({ overlay: 'loading' });
    expect(overlay.textContent).toBe(msg(EN, 'grid.loading'));
    expect(vp.getAttribute('aria-busy')).toBe('true');
    g.update({ overlay: 'error' });
    expect(overlay.textContent).toBe(msg(EN, 'grid.error'));
    expect(vp.hasAttribute('aria-busy')).toBe(false);
  });

  it('leaves nothing behind on destroy', () => {
    const { g, host } = make();
    const scope = (g as unknown as { scope: { listenerCount: number; isDisposed: boolean } }).scope;
    expect(scope.listenerCount).toBeGreaterThan(0);
    g.destroy();
    grids = grids.filter((x) => x !== g);
    expect(scope.listenerCount).toBe(0);
    expect(scope.isDisposed).toBe(true);
    expect(host.querySelector('.dzg')).toBeNull();
    expect(g.kernel.dispatch({ type: 'selection.clear' }, 'user')).toMatchObject({ ok: false });
  });
});

describe('rows and columns', () => {
  it('mounts only the window, in DOM order = aria-rowindex order, through 50 random scrolls, with a bounded pool', () => {
    const { scroll, rowIndexes, bodyRows } = make();
    const seen = new Set<HTMLElement>();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 50; k++) {
      scroll(Math.floor(rnd() * 1000 * 32));
      const idx = rowIndexes();
      expect(idx.length).toBeGreaterThan(10);
      expect(idx.length).toBeLessThan(40);
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      for (const r of bodyRows()) seen.add(r);
    }
    // Every row element ever used fits in one window plus overscan: rows are recycled.
    expect(seen.size).toBeLessThan(80);
  });

  it('rebinds in order on a jump and never empties the body', () => {
    const { scroll, rowIndexes, vp } = make();
    const counts: number[] = [];
    const mo = new MutationObserver(() => counts.push(vp.querySelectorAll('.dzg-layer > .dzg-row').length));
    mo.observe(vp, { childList: true, subtree: true });
    scroll(500 * 32);
    mo.disconnect();
    const idx = rowIndexes();
    expect(idx[0]).toBeLessThanOrEqual(502);
    expect(idx[idx.length - 1]).toBeGreaterThanOrEqual(502 + 12);
    expect(Math.min(...counts, Infinity)).toBeGreaterThan(0);
  });

  it('writes nothing when nothing changed', () => {
    const { g, vp } = make();
    const mo = new MutationObserver(() => {});
    mo.observe(vp, { childList: true, subtree: true, attributes: true, characterData: true });
    g.api.refresh();
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
  });

  it('rewrites only the updated row', () => {
    const { g, vp } = make();
    const mo = new MutationObserver(() => {});
    mo.observe(vp, { subtree: true, characterData: true, childList: true, attributes: true });
    g.kernel.rows.applyTransaction({ update: [{ id: 'r2', name: 'Changed', n: 4, c: 'c2' }] });
    const touched = new Set(mo.takeRecords().map((m) => (m.target instanceof Element ? m.target : m.target.parentElement)!.closest('.dzg-row')?.getAttribute('aria-rowindex')));
    mo.disconnect();
    expect([...touched]).toEqual(['4']);
    expect(vp.querySelector('.dzg-row[aria-rowindex="4"] [data-col="name"]')!.textContent).toBe('Changed');
  });

  it('isolates free text, and numbers left to right', () => {
    const { host } = make();
    const row = host.querySelector('.dzg-layer .dzg-row')!;
    expect(row.querySelector('[data-col="name"] .dzg-free')).not.toBeNull();
    expect(row.querySelector('[data-col="n"] .dzg-num')).not.toBeNull();
    expect(row.querySelector('[data-col="n"] .dzg-free')).toBeNull();
  });

  it('virtualises the centre columns, the header with the same window, cells in aria-colindex order', () => {
    const { host, scroll } = make();
    const check = () => {
      const head = [...host.querySelectorAll('.dzg-header [role=columnheader]')].map((c) => Number(c.getAttribute('aria-colindex')));
      const body = [...host.querySelector('.dzg-layer .dzg-row')!.querySelectorAll('[role=gridcell],[role=rowheader]')].map((c) => Number(c.getAttribute('aria-colindex')));
      expect(body).toEqual(head);
      expect(head).toEqual([...head].sort((a, b) => a - b));
      expect(head[0]).toBe(1);
      expect(head[head.length - 1]).toBe(31);
      return head;
    };
    const start = check();
    expect(start.length).toBeLessThan(20);
    scroll(0, 1500);
    const later = check();
    expect(later).toContain(17);
    expect(later).not.toContain(3);
  });

  it('marks the first column as the row header and places pinned segments apart', () => {
    const { host } = make();
    const row = host.querySelector('.dzg-layer .dzg-row')!;
    expect(row.querySelector('.dzg-seg-start [data-col="name"]')!.getAttribute('role')).toBe('rowheader');
    expect(row.querySelector('.dzg-seg-end [data-col="end"]')).not.toBeNull();
    expect(row.querySelector('.dzg-seg-center [data-col="n"]')).not.toBeNull();
  });

  it('keeps aria-rowcount and the body length with the filter', () => {
    const { g, vp, host } = make();
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { c: { type: 'text', op: 'equals', value: 'c1' } }, quick: '', key: 'f-c1' } }, 'user');
    expect(vp.getAttribute('aria-rowcount')).toBe(String(g.kernel.rows.displayed.count + 1));
    expect(host.querySelector<HTMLElement>('.dzg-body')!.style.blockSize).toBe(`${g.kernel.rows.displayed.count * 32}px`);
    expect(dataKey('r1')).not.toBeNull();
  });
});
