import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup, ResolvedColumn } from '@dzgrid/core';
import * as coreSpans from '@dzgrid/core/spans';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { SPANS_CSS } from '../src/spans/styles.js';
import { EN } from '../src/locales/en.js';

// headerBands counted, its result unchanged.
vi.mock('@dzgrid/core/spans', async (orig) => {
  const m = await orig<typeof import('@dzgrid/core/spans')>();
  return { ...m, headerBands: vi.fn(m.headerBands) };
});

/**
 * Step 9b, commit 4 fixes (review and test analysis of the grouped headers):
 * the group rows' work per paint follows the mounted header cells, a resize
 * does not read the tree again, a focused header moved or made again keeps the
 * focus, the group rows keep a header over a focused column header kept out of
 * the window, the select-all box in right to left, Up from a column-spanned
 * cell, the hidden headers' CSS. docs/behaviors/spans.md.
 */
type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const H = 32;
const leaf = (id: string, more: object = {}) => ({ id, header: id.toUpperCase(), width: 100, value: (r: R) => `${id}${r.n}`, ...more });
/** Two levels: Patient over nom, prenom, age; Clinique over Constantes (tension, pouls, temp) and note; entree alone. */
const TREE: ColumnOrGroup<R>[] = [
  { id: 'patient', header: 'Patient', children: [leaf('nom'), leaf('prenom'), leaf('age')] },
  { id: 'clinique', header: 'Clinique', children: [{ id: 'constantes', header: 'Constantes', children: [leaf('tension'), leaf('pouls'), leaf('temp')] }, leaf('note')] },
  leaf('entree'),
];

function make(o: { columns?: ColumnOrGroup<R>[]; settings?: Partial<GridSettings<R>>; inline?: number; rows?: number } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: o.inline ?? 1200, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, {
    rows: Array.from({ length: o.rows ?? 10 }, (_, n) => ({ id: `r${n}`, n })), getRowId: (r) => r.id,
    columns: o.columns ?? TREE, messages: EN, features: [spans()], ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const leafCell = (id: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${id}"]:not(.dzg-hgroup)`)!;
  const groupCell = (col: string, level: number) => host.querySelector<HTMLElement>(`.dzg-hgroup[data-col="${col}"][data-level="${level}"]`);
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const scrollInline = (x: number) => { box.scrollInline = x; vp.dispatchEvent(new Event('scroll')); };
  const active = () => document.activeElement as HTMLElement;
  return { g, host, vp, box, ctx, leafCell, groupCell, press, scrollInline, active };
}
const spy = vi.mocked(coreSpans.headerBands);

describe('the group rows read the tree once per column layout', () => {
  it('a resize does not rebuild the groups, and still resizes their cells', () => {
    const { g, groupCell } = make();
    expect(groupCell('nom', -2)!.style.getPropertyValue('inline-size')).toBe('300px');
    const before = spy.mock.calls.length;
    g.kernel.dispatch({ type: 'column.resize', column: 'prenom', width: 160, finished: true }, 'user');
    expect(spy.mock.calls.length).toBe(before);
    expect(groupCell('nom', -2)!.style.getPropertyValue('inline-size')).toBe('360px');
    expect(groupCell('tension', -2)!.style.getPropertyValue('inset-inline-start')).toBe('360px');
    // A move changes the groups: read again.
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'nom', pinned: 'end' }] }, 'user');
    expect(spy.mock.calls.length).toBe(before + 1);
    expect(groupCell('prenom', -2)!.getAttribute('aria-colspan')).toBe('2');
  });

  it('3 000 columns: a scroll frame touches the mounted header cells only', () => {
    const cols = Array.from({ length: 3000 }, (_, i) => leaf(`c${i}`, { width: 80 }));
    const tree: ColumnOrGroup<R>[] = [];
    for (let i = 0; i < 3000; i += 10) tree.push({ id: `top${i}`, header: `T${i}`, children: [{ id: `mid${i}`, header: `M${i}`, children: cols.slice(i, i + 5) }, ...cols.slice(i + 5, i + 10)] });
    const { ctx, scrollInline, host } = make({ columns: tree, inline: 800, rows: 3 });
    scrollInline(80 * 1000);
    // The centre columns the group rows read in a frame, counted through the layout's own list
    // (the span map's check that the columns did not change reads them all: the core's, by identity).
    const L = ctx.columns.layout;
    const read = new Set<number>();
    (L.center as { columns: readonly ResolvedColumn<unknown>[] }).columns = new Proxy(L.center.columns, {
      get(t, p, r) {
        if (typeof p === 'string' && /^\d+$/.test(p) && new Error().stack!.includes('spans/bands')) read.add(+p);
        return Reflect.get(t, p, r);
      },
    });
    const cell = ctx.headerRenderer.cell.bind(ctx.headerRenderer);
    let asked = 0;
    ctx.headerRenderer.cell = (c, l) => (asked++, cell(c, l));
    const builds = spy.mock.calls.length;
    scrollInline(80 * 2000);
    const mounted = host.querySelectorAll('.dzg-header > [role=row]:last-child .dzg-hcell').length;
    expect(mounted).toBeLessThan(40);
    expect(spy.mock.calls.length).toBe(builds);
    expect(read.size).toBeLessThan(200);
    expect(asked).toBeLessThan(200);
    expect([...read].every((i) => i >= 1900 && i < 2100)).toBe(true);
    // And the frame is right: the window's groups, at their places.
    const top = host.querySelector<HTMLElement>('.dzg-hgroup[data-col="c2000"][data-level="-2"]')!;
    expect([top.textContent, top.getAttribute('aria-colspan'), top.style.getPropertyValue('inset-inline-start')]).toEqual(['T2000', '10', `${80 * 2000}px`]);
    expect(host.querySelector<HTMLElement>('.dzg-hcell[data-col="c2005"]:not(.dzg-hgroup)')!.style.getPropertyValue('--dzg-up')).toBe(`${H}px`);
  });
});

describe('a focused header moved or made again keeps the focus', () => {
  it('the focused group’s first column pinned: the focus follows the group cell, and the arrows still work', () => {
    const { g, groupCell, press, active, host } = make();
    groupCell('tension', -1)!.focus();
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -1 });
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'tension', pinned: 'start' }] }, 'user');
    expect(host.contains(active())).toBe(true);
    expect([active().dataset['col'], active().dataset['level'], active().closest('.dzg-seg')!.classList.contains('dzg-seg-start')]).toEqual(['tension', '-1', true]);
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension' });
    expect(active().dataset['col']).toBe('tension');
    press('ArrowUp');
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
  });

  it('a group cut in two under the focus (a column of it pinned at the end): still focused, the keys move on', () => {
    const { g, groupCell, press, active, host } = make();
    groupCell('tension', -2)!.focus();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'tension', pinned: 'end' }] }, 'user');
    expect(host.contains(active())).toBe(true);
    expect(g.kernel.focus?.kind).toBe('header');
    press('ArrowLeft');
    expect(host.contains(active())).toBe(true);
    expect(active().classList.contains('dzg-hgroup')).toBe(true);
  });

  it('a focused column header pinned: the focus stays on it, and the arrows still work', () => {
    const { g, leafCell, press, active, host } = make();
    leafCell('pouls').focus();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'pouls', pinned: 'start' }] }, 'user');
    expect(host.contains(active())).toBe(true);
    expect(active()).toBe(leafCell('pouls'));
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom' });
    expect(active()).toBe(leafCell('nom'));
  });

  it('the focus elsewhere on the page: a pin does not take it back', () => {
    const { g, groupCell } = make();
    const out = document.createElement('button');
    document.body.append(out);
    groupCell('tension', -1)!.focus();
    out.focus();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'tension', pinned: 'start' }] }, 'user');
    expect(document.activeElement).toBe(out);
  });
});

describe('a focused column header kept out of the window', () => {
  it('each group row keeps a header over its column, in column order', () => {
    const { g, leafCell, scrollInline, host, active } = make({ inline: 300 });
    leafCell('prenom').focus();
    scrollInline(500);
    expect(active()).toBe(leafCell('prenom'));
    const rows = [...host.querySelectorAll<HTMLElement>('.dzg-header > [role=row]')];
    const center = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('.dzg-seg-center > *')];
    const n = center(rows[2]!).length;
    expect(center(rows[2]!)[0]!.dataset['col']).toBe('prenom');
    // One header per column in each row: the kept column first, in its place.
    expect([center(rows[0]!).length, center(rows[1]!).length]).toEqual([n, n]);
    // Patient is drawn from its first column (the first mounted of its piece); no group over
    // prenom one row down: a hidden header with the column's index and name.
    const [top, mid] = [center(rows[0]!)[0]!, center(rows[1]!)[0]!];
    expect([top.className, top.textContent, top.getAttribute('aria-colindex'), top.getAttribute('aria-colspan')]).toEqual(['dzg-hcell dzg-hgroup', 'Patient', '1', '3']);
    expect([mid.className, mid.textContent, mid.getAttribute('aria-colindex')]).toEqual(['dzg-hslot', 'PRENOM', '2']);
    // Still stretched over its empty group row, as the row height changes while it is kept.
    g.update({ density: 'compact' });
    const h = host.querySelector<HTMLElement>('.dzg-root, [data-density]')!.style.getPropertyValue('--dzg-row-height');
    expect(h).not.toBe(`${H}px`);
    expect(leafCell('prenom').style.getPropertyValue('--dzg-up')).toBe(h);
  });
});

describe('the select-all box, right to left', () => {
  /** The keys from the first column header to the box and back, in both directions. */
  function walk(dir: 'ltr' | 'rtl') {
    const { g, leafCell, press, active, host, scrollInline } = make({ settings: { direction: dir, selection: { mode: 'multi', checkbox: true } } });
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const on = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    leafCell('nom').focus();
    const out: unknown[] = [];
    const note = () => out.push([active().className, active().dataset['col'] ?? null, g.kernel.focus]);
    press(back); note();
    // A repaint while the box has the focus does not take it back to the header.
    scrollInline(10); note();
    press(on); note();
    press(back); note();
    press('ArrowDown'); note();
    expect(host.contains(active())).toBe(true);
    return out;
  }
  it('Right in RTL does what Left does in LTR: the box, then back; the focus position stays the column header (the box is not one)', () => {
    const rtl = walk('rtl');
    expect(rtl).toEqual(walk('ltr'));
    expect(rtl[0]).toEqual(['dzg-box', null, { kind: 'header', column: 'nom' }]);
    expect(rtl[1]).toEqual(rtl[0]);
    expect((rtl[2] as unknown[])[1]).toBe('nom');
    expect((rtl[4] as unknown[])[0]).toBe('dzg-cell');
  });
});

describe('Up from a column-spanned cell into the group rows', () => {
  it('goes to the groups over the column the keys came from, not the cell’s first', () => {
    // P over a, b; Q over c, d. The first row's b spans b and c.
    const columns: ColumnOrGroup<R>[] = [
      { id: 'P', header: 'P', children: [leaf('a'), leaf('b', { colSpan: (c: { index: number }) => (c.index === 0 ? 2 : 1) })] },
      { id: 'Q', header: 'Q', children: [leaf('c'), leaf('d')] },
    ];
    const { g, host, press } = make({ columns });
    // One group row: the second row of data is the fourth row of the grid.
    host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="4"] .dzg-cell[data-col="c"]')!.focus();
    expect(g.kernel.focus).toMatchObject({ kind: 'cell', column: 'c' });
    press('ArrowUp');
    expect(g.kernel.focus).toMatchObject({ kind: 'cell', column: 'b' });
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'c' });
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'c', level: -1 });
  });
});

describe('the hidden headers’ and the stretched headers’ CSS', () => {
  it('a hidden header is out of sight and a stretched column header reaches up over its empty group cells', () => {
    expect(SPANS_CSS).toContain(':where(.dzg-hslot){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}');
    expect(SPANS_CSS).toContain(':where(.dzg-hcell[data-up]){inset-block-start:calc(-1*var(--dzg-up));block-size:calc(var(--dzg-row-height) + var(--dzg-up))}');
  });
});
