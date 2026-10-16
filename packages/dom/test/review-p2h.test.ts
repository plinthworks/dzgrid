import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, makeQuery, type ColumnDef, type GridEvent } from '@dzgrid/core';
import * as dom from '../src/index.js';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';
import { checkSource } from './guards.js';

type R = { id: string; name: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });
const COLS: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

function make(settings: Partial<GridSettings<R>> = {}, rows = Array.from({ length: 50 }, (_, i): R => ({ id: `r${i}`, name: `Name ${i}`, n: i }))) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns: COLS, messages: EN, onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const cell = (i: number, col: string) => host.querySelector<HTMLElement>(`.dzg-layer .dzg-row[aria-rowindex="${i + 2}"] [data-col="${col}"]`)!;
  return { g, host, vp, events, cell };
}

describe('phase 2 end review (dom)', () => {
  it('keeps the warm-up from piling up cleanups and old snapshots', () => {
    vi.useFakeTimers();
    const { g } = make({ searchWarmup: 'idle' });
    const scope = (g as unknown as { scope: { pending: number } }).scope;
    vi.advanceTimersByTime(1000);
    const base = scope.pending;
    for (let i = 0; i < 30; i++) {
      g.kernel.rows.applyTransaction({ update: [{ id: 'r1', name: `x${i}`, n: 1 }] });
      vi.advanceTimersByTime(1000);
    }
    expect(scope.pending).toBeLessThanOrEqual(base + 1);
  });

  it('re-isolates mounted cells when the direction flips', () => {
    const { g, cell } = make({}, [{ id: 'a', name: 'Hélène', n: -5 }]);
    expect(cell(0, 'name').querySelector('.dzg-free')).toBeNull();
    g.update({ direction: 'rtl' });
    expect(cell(0, 'name').querySelector('.dzg-free')).not.toBeNull();
    expect(cell(0, 'n').querySelector('.dzg-num')).not.toBeNull();
  });

  it('repaints and tells the other listeners when the host’s onEvent throws', () => {
    const reported: unknown[] = [];
    const reportError = vi.fn((e: unknown) => reported.push(e));
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const { g, host } = make({ selection: { mode: 'multi' }, onEvent: () => { throw new Error('host bug'); } });
    const seen: string[] = [];
    g.kernel.subscribe((e) => seen.push(e.type));
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r1')! }, 'user');
    expect(host.querySelector('.dzg-row[aria-rowindex="3"]')!.getAttribute('aria-selected')).toBe('true');
    expect(seen).toContain('selectionChanged');
    expect(reported.length).toBeGreaterThan(0);
  });

  it('exports the layout CSS for hosts that cannot inject it (strict CSP)', () => {
    expect(typeof dom.LAYOUT_CSS).toBe('string');
    expect(dom.LAYOUT_CSS).toContain('.dzg-viewport');
    expect(typeof dom.injectStyles).toBe('function');
  });

  it('reports keyboard moves between cells as the user’s', () => {
    const { g, events } = make();
    g.api.focusCell(dataKey('r0')!, 'name');
    events.length = 0;
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const moves = events.filter((e) => e.type === 'focusChanged');
    expect(moves.length).toBe(1);
    expect(moves[0]!.source).toBe('user');
  });

  it('keeps Space on a header from scrolling the page', () => {
    const { host } = make();
    const h = host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!;
    h.focus();
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    h.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('refuses at once a messages bundle with a key missing, saying which', () => {
    const host = document.createElement('div');
    const broken = { locale: 'en', text: { ...EN.text, 'grid.label': undefined } } as unknown as typeof EN;
    expect(() => createGrid<R>(host, { rows: [], getRowId: (r) => r.id, columns: COLS, messages: broken })).toThrow(/grid\.label/);
  });

  it('leaves the grid as it was when update() is given a locale that does not exist', () => {
    const { g, host } = make();
    expect(() => g.update({ locale: 'not a locale!!', direction: 'rtl' })).toThrow(RangeError);
    expect(host.querySelector('.dzg')!.getAttribute('dir')).toBe('ltr');
    g.api.refresh();
  });

  it('prepares the search again after the box is emptied', () => {
    vi.useFakeTimers();
    const { g } = make({ searchWarmup: 'idle' });
    vi.advanceTimersByTime(1000);
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'name' }) }, 'user');
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: '' }) }, 'user');
    vi.advanceTimersByTime(1000);
    const before = g.kernel.rows.diagnostics.foldBuilds;
    g.kernel.dispatch({ type: 'query.set', query: makeQuery({ quick: 'nam' }) }, 'user');
    expect(g.kernel.rows.diagnostics.foldBuilds).toBe(before);
  });

  it('says it is read-only', () => {
    expect(make().vp.getAttribute('aria-readonly')).toBe('true');
  });

  it('builds a sorted header’s name with the language’s own separator', () => {
    const { g, host } = make({ messages: AR, locale: 'ar-DZ' });
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }, { column: 'name', dir: 'asc' }] }, 'user');
    expect(host.querySelector('.dzg-hcell[data-col="name"]')!.getAttribute('aria-label')).toBe(`Name، ${AR.text['sort.priority'] as string}`.replace('{n}', '2'));
  });

  it('tells the host about column problems, at creation and on update', () => {
    const pinned: ColumnDef<R, any>[] = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, pinned: 'start', value: () => i }));
    const { g, events } = make({ columns: pinned });
    expect(events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'too-many-pinned'))).toBe(true);
    events.length = 0;
    g.update({ columns: [{ id: 'a' }, { id: 'a' }] });
    expect(events.some((e) => e.type === 'problems' && e.source === 'host' && e.problems.some((p) => p.code === 'duplicate-column-id'))).toBe(true);
  });

  it('keeps showing the grid when a host tooltip or codec throws', () => {
    const throwing: ColumnDef<R, any>[] = [
      { id: 'name', tooltip: () => { throw new Error('tooltip bug'); } },
      { id: 'n', codec: { kind: 'custom', keyKind: 'number', coerce: (v: unknown) => v, parse: () => 0, format: () => { throw new Error('format bug'); }, sortKey: () => 0, compare: () => 0, isEmpty: () => false, equals: () => true, toExport: () => '' } },
    ];
    const { cell } = make({ columns: throwing });
    expect(cell(0, 'n').textContent).toBe('');
    cell(0, 'name').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  });

  it('lets no pooled row hold on to replaced data', () => {
    const { g, host } = make();
    g.update({ rows: [{ id: 'z', name: 'z', n: 0 }] });
    const pool = (g as unknown as { pooledData(): unknown[] }).pooledData();
    expect(pool.every((d) => d === undefined)).toBe(true);
    expect(host.querySelectorAll('.dzg-layer > .dzg-row').length).toBe(1);
  });
});

describe('guards see the attribute wrapper', () => {
  it('catch literal text and colours written through setAttr', () => {
    expect(checkSource("setAttr(el, 'aria-label', 'Sort');", 'src/grid.ts').map((f) => f.rule)).toEqual(['literal-text']);
    expect(checkSource("setAttr(el, 'style', 'color: red');", 'src/grid.ts').map((f) => f.rule)).toEqual(['colour']);
  });
});
