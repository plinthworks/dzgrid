// `rowHeight`: a row height in px chosen by the application, over the density's (owner D1,
// docs/phase-5-steps/demos-plan.md §6, docs/behaviors/virtual-scroll.md « Row height »). Written before
// the code: scroll math, page keys, the tree's pinned parents, detail heights, a million rows past the
// browser's height cap, a live change keeping the focused row in view (WCAG 2.4.11), invalid values.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import type { TreeRows } from '@dzgrid/core/tree';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { tmake, cleanup as treeCleanup, wide, k as tk, idOf as tid } from './support-tree.js';
import { stickyOracle } from './support-sticky.js';
import { SLOW_TEST_MS } from './support/slow.js';

type T = { id: string; n: number };
const ROWS = (n: number): T[] => Array.from({ length: n }, (_, i) => ({ id: `R${i}`, n: i }));
const COLUMNS: ColumnDef<T, any>[] = [
  { id: 'id', header: 'Id', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
];
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^x:/, 'x').replace(/d:\d+:/, ''));
const problemsOf = (events: GridEvent<T>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

const grids: GridInstance<T, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  treeCleanup();
});

interface Make {
  readonly rows?: T[];
  readonly settings?: Partial<GridSettings<T>>;
  readonly features?: readonly GridFeature[];
  readonly block?: number;
  readonly remPx?: number;
  readonly maxPhysical?: number;
}

function make(o: Make = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0, ...(o.remPx && { remPx: o.remPx }) };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const g = createGrid<T>(host, {
    rows: o.rows ?? ROWS(200), getRowId: (r) => r.id, columns: COLUMNS, messages: MSG, onEvent: (e) => events.push(e),
    ...(o.features && { features: o.features }), ...o.settings,
  }, { geometry, sync: true, ...(o.maxPhysical && { maxPhysical: o.maxPhysical }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const body = host.querySelector<HTMLElement>('.dzg-body')!;
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const active = () => document.activeElement as HTMLElement;
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-row');
    return `${idOf(r ? ctx.rowRenderer.keyOf(r) : null)}/${a.dataset['col'] ?? null}`;
  };
  const press = (key: string) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const top = () => ctx.scroll.logicalTop;
  const d = () => g.kernel.rows.displayed;
  const topKey = () => d().keyAt(ctx.layout!.indexAt(top()));
  /** The focused row's top and bottom in the view. */
  const focusedBox = () => {
    const f = g.kernel.focus;
    if (f?.kind !== 'cell') return null;
    const i = d().indexOf(f.row);
    const y = ctx.layout!.offsetOf(i as never) - top();
    return { y, end: y + ctx.layout!.heightOf(i as never) };
  };
  return { g, ctx, host, vp, body, box, events, rowEl, active, where, press, scroll, top, d, topKey, focusedBox };
}

describe('rowHeight: the scroll math', () => {
  it('every row, the header and the body take the app’s height; the row at an offset is found by it', () => {
    const t = make({ rows: ROWS(1000), settings: { rowHeight: 50 } });
    expect(t.ctx.rowHeight()).toBe(50);
    expect(t.ctx.layout!.total).toBe(50_000);
    expect(t.body.style.getPropertyValue('block-size')).toBe('50000px');
    expect(t.rowEl(k('R0'))!.style.getPropertyValue('block-size')).toBe('50px');
    expect(t.host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-row-height')).toBe('50px');
    t.scroll(100 * 50 + 25);
    expect(idOf(t.topKey())).toBe('R100');
    expect(t.rowEl(k('R101'))!.style.getPropertyValue('block-size')).toBe('50px');
  });

  it('wins over the density; taken away, the density’s height comes back', () => {
    const t = make({ settings: { density: 'compact', rowHeight: 44 } });
    expect(t.ctx.rowHeight()).toBe(44);
    t.g.update({ density: 'spacious' });
    expect(t.ctx.rowHeight()).toBe(44);
    t.g.update({ rowHeight: undefined });
    expect(t.ctx.rowHeight()).toBe(40);
    t.g.update({ rowHeight: 60 });
    expect(t.ctx.rowHeight()).toBe(60);
    expect(t.ctx.layout!.total).toBe(200 * 60);
  });

  it('grows with the reader’s text size, as a density does (16 px text: as given)', () => {
    const t = make({ remPx: 20, settings: { rowHeight: 50 } });
    // 50 × 20 / 16 = 62.5, whole pixels.
    expect(t.ctx.rowHeight()).toBe(63);
    expect(t.rowEl(k('R0'))!.style.getPropertyValue('block-size')).toBe('63px');
  });

  it('a live change keeps the top row at the same fraction into it', () => {
    const t = make({ settings: { rowHeight: 40 } });
    t.scroll(30 * 40 + 10);
    t.g.update({ rowHeight: 80 });
    expect(idOf(t.topKey())).toBe('R30');
    expect(t.top()).toBe(30 * 80 + 20);
  });
});

describe('rowHeight: PageUp and PageDown', () => {
  it('a page is the rows of the app’s height that fit, less one', () => {
    // 320 / 64 = 5 rows a view: a page moves 4.
    const t = make({ settings: { rowHeight: 64 } });
    t.g.api.focusCell(k('R0'), 'n');
    t.press('PageDown');
    expect(t.where()).toBe('R4/n');
    t.press('PageDown');
    expect(t.where()).toBe('R8/n');
    // R8 (512–576) fully in view.
    const b = t.focusedBox()!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.end).toBeLessThanOrEqual(320);
    t.press('PageUp');
    expect(t.where()).toBe('R4/n');
  });

  it('the page follows a live change', () => {
    const t = make();
    t.g.api.focusCell(k('R0'), 'n');
    t.press('PageDown');
    // 32 px rows: 10 a view, a page of 9.
    expect(t.where()).toBe('R9/n');
    t.g.update({ rowHeight: 80 });
    // 4 a view, a page of 3.
    t.press('PageDown');
    expect(t.where()).toBe('R12/n');
  });
});

describe('rowHeight: detail panels keep their own height', () => {
  const panel = definePart('detail', { mount: () => ({ destroy() {} }) });
  it('data rows take the app’s height, a panel its given one, live', () => {
    const t = make({ features: [detail<T>({ part: panel, height: 120 })], settings: { rowHeight: 50 } });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R1')], expanded: true }, 'api');
    const L = () => t.ctx.layout!;
    const at = (key: RowKey) => t.d().indexOf(key) as never;
    expect(L().offsetOf(at(k('R1')))).toBe(50);
    expect(L().offsetOf(at(detailKey(k('R1'))))).toBe(100);
    expect(L().heightOf(at(detailKey(k('R1'))))).toBe(120);
    expect(L().offsetOf(at(k('R2')))).toBe(220);
    expect(t.rowEl(detailKey(k('R1')))!.style.getPropertyValue('block-size')).toBe('120px');
    expect(t.rowEl(k('R2'))!.style.getPropertyValue('block-size')).toBe('50px');
    t.g.update({ rowHeight: 60 });
    expect(L().heightOf(at(detailKey(k('R1'))))).toBe(120);
    expect(L().offsetOf(at(k('R2')))).toBe(60 * 2 + 120);
    expect(t.rowEl(k('R2'))!.style.getPropertyValue('block-size')).toBe('60px');
  });
});

describe('rowHeight: a million rows past the browser’s height cap', () => {
  it('scaled scrolling maps the whole length; the last row is reachable whole; a live change keeps the top row', () => {
    const N = 1_000_000;
    const t = make({ rows: ROWS(N), settings: { rowHeight: 52 }, maxPhysical: 40_000 });
    const m = t.ctx.scroll.mapper!;
    expect(m.scaled).toBe(true);
    expect(m.maxLogical).toBe(N * 52 - 320);
    t.g.api.focusCell(k(`R${N - 1}`), 'n');
    expect(t.top()).toBe(N * 52 - 320);
    expect(t.rowEl(k(`R${N - 1}`))!.style.getPropertyValue('block-size')).toBe('52px');
    // The middle: the row at the top stays the top after a change.
    t.ctx.scroll.scrollTo(500_000 * 52);
    t.ctx.schedule();
    expect(idOf(t.topKey())).toBe('R500000');
    t.g.update({ rowHeight: 40 });
    expect(t.ctx.scroll.mapper!.maxLogical).toBe(N * 40 - 320);
    expect(idOf(t.topKey())).toBe('R500000');
    expect(t.top()).toBe(500_000 * 40);
  }, SLOW_TEST_MS);
});

describe('rowHeight: a live change keeps the focused row in view (WCAG 2.4.11)', () => {
  it('a focused row near the end of the view stays in view when the rows grow', () => {
    const t = make();
    t.g.api.focusCell(k('R8'), 'n');
    expect(t.top()).toBe(0);
    t.g.update({ rowHeight: 64 });
    const b = t.focusedBox()!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.end).toBeLessThanOrEqual(320);
    expect(t.where()).toBe('R8/n');
  });

  it('a density change does the same', () => {
    const t = make({ settings: { density: 'compact' } });
    t.g.api.focusCell(k('R10'), 'n');
    t.g.update({ density: 'spacious' });
    const b = t.focusedBox()!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.end).toBeLessThanOrEqual(320);
  });

  it('a focused row the user scrolled away from is not brought back', () => {
    const t = make();
    t.g.api.focusCell(k('R2'), 'n');
    t.scroll(100 * 32);
    t.g.update({ rowHeight: 48 });
    expect(idOf(t.topKey())).toBe('R100');
    expect(t.top()).toBe(100 * 48);
  });

  it('in a tree, the focused row stays clear of the pinned parents and inside the view', () => {
    const t = tmake({ rows: wide(4, 30), tree: { initial: 'all', sticky: 3 } });
    // Scrolled into S1's children, the focus on the last row whole in the view: growing rows push it out.
    t.scroll(33 * 32 + 4);
    const d = () => t.g.kernel.rows.displayed;
    const y0 = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
    const first = d().keyAt((t.ctx.layout!.indexAt(y0() + t.box.block) - 1) as never);
    t.g.api.focusCell(first, 'n');
    expect(y0()).toBe(33 * 32 + 4);
    for (const rowHeight of [56, 30, 72]) {
      t.g.update({ rowHeight });
      const i = d().indexOf(first);
      const y = t.ctx.layout!.offsetOf(i as never) - y0();
      expect(y, `${rowHeight}: focused ${tid(first)} at ${y}, stack ${t.ctx.inset}`).toBeGreaterThanOrEqual(t.ctx.inset ?? 0);
      expect(y + rowHeight, `${rowHeight}`).toBeLessThanOrEqual(t.box.block);
    }
  });
});

describe('rowHeight: the tree’s pinned parents', () => {
  it('copies are as tall as the rows, and the stack is the oracle’s at that height, live', () => {
    const t = tmake({ rows: wide(5, 20), tree: { initial: 'all', sticky: 3 }, settings: { rowHeight: 48 } });
    const top = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
    const copies = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
    const audit = (h: number, at: string) => {
      const m = t.g.kernel.rows.displayed as TreeRows<unknown>;
      const levels = Array.from({ length: m.count }, (_, i) => m.levelAt(i as never));
      const want = stickyOracle(levels, h, { top: top(), n: 3, viewBlock: t.box.block, h });
      expect(copies().length, at).toBe(want.at.length);
      expect(want.at.length, at).toBeGreaterThan(0);
      expect(t.ctx.inset ?? 0, at).toBe(want.height);
      copies().forEach((c, j) => {
        expect(c.style.getPropertyValue('block-size'), at).toBe(`${h}px`);
        expect(c.style.getPropertyValue('inset-block-start'), at).toBe(`${want.y[j]}px`);
      });
    };
    t.scroll(2 * 48 + 5);
    audit(48, '48');
    t.g.update({ rowHeight: 60 });
    audit(60, '60');
    t.scroll(top() + 7);
    audit(60, '60 scrolled');
    // The stack never takes more than half the view: 320 / 2 / 100 = 1 copy.
    t.g.update({ rowHeight: 100 });
    t.scroll(30 * 100 + 5);
    audit(100, '100');
    expect(copies().length).toBe(1);
    expect(tk('S1')).toBeTruthy();
  });
});

describe('rowHeight: invalid values', () => {
  const BAD: unknown[] = [NaN, 0, -40, 10, 23.9, 1000.5, 5000, Infinity, '50', {}];
  for (const bad of BAD) {
    it(`${String(bad)} (${typeof bad}): a warning, the density’s height`, () => {
      const t = make({ settings: { density: 'compact', rowHeight: bad as number } });
      expect(t.ctx.rowHeight()).toBe(28);
      const p = problemsOf(t.events).filter((x) => x.path === 'settings.rowHeight');
      expect(p).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'settings.rowHeight', detail: String(bad) }]);
    });
  }

  it('null is no value (an Angular binding cleared): the density’s height, no warning', () => {
    const t = make({ settings: { density: 'spacious', rowHeight: null as never } });
    expect(t.ctx.rowHeight()).toBe(40);
    expect(problemsOf(t.events)).toEqual([]);
  });

  it('24 and 1 000 are taken, without a warning', () => {
    for (const ok of [24, 1000, 52.5]) {
      const t = make({ settings: { rowHeight: ok } });
      expect(t.ctx.rowHeight()).toBe(Math.round(ok));
      expect(problemsOf(t.events)).toEqual([]);
    }
  });

  it('live: an invalid value is told once and leaves the density’s height; a valid one after it is taken', () => {
    const t = make({ settings: { rowHeight: 50 } });
    t.g.update({ rowHeight: -1 });
    expect(t.ctx.rowHeight()).toBe(32);
    expect(t.ctx.layout!.total).toBe(200 * 32);
    t.g.update({ density: 'spacious' });
    expect(t.ctx.rowHeight()).toBe(40);
    expect(problemsOf(t.events)).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'settings.rowHeight', detail: '-1' }]);
    t.g.update({ rowHeight: 36 });
    expect(t.ctx.rowHeight()).toBe(36);
    expect(problemsOf(t.events).length).toBe(1);
  });
});

// ---- Review and test analysis (2026-10-23): written before the fixes ----

/** S > A > B > C, 40 leaves under C (L0…L39): indices S 0, A 1, B 2, C 3, Lk 4 + k. */
const chain = () => [
  { id: 'S', parent: null, name: 'S', n: 0 }, { id: 'A', parent: 'S', name: 'A', n: 1 }, { id: 'B', parent: 'A', name: 'B', n: 2 }, { id: 'C', parent: 'B', name: 'C', n: 3 },
  ...Array.from({ length: 40 }, (_, k) => ({ id: `L${k}`, parent: 'C', name: `L${k}`, n: k })),
];
function chainGrid(rowHeight: number) {
  const t = tmake({ rows: chain(), tree: { initial: 'all', sticky: 3 }, settings: { rowHeight } });
  const top = () => (t.g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
  const copies = () => t.host.querySelectorAll('.dzg-sticky > .dzg-row').length;
  const yOf = (id: string) => t.ctx.layout!.offsetOf(t.g.kernel.rows.displayed.indexOf(tk(id)) as never) - top();
  return { ...t, top, copies, yOf };
}

describe('rowHeight: review follow-ups', () => {
  it('the same invalid value sent again is not told again (NaN included)', () => {
    const t = make({ settings: { rowHeight: 50 } });
    t.g.update({ rowHeight: NaN });
    t.g.update({ rowHeight: NaN });
    t.g.update({ density: 'compact' });
    t.g.update({ rowHeight: -1 });
    t.g.update({ rowHeight: -1 });
    expect(problemsOf(t.events).map((p) => p.detail)).toEqual(['NaN', '-1']);
  });

  it('rounds to the nearest pixel of the browser’s default text size (18 px: 50 → 56)', () => {
    const t = make({ remPx: 18, settings: { rowHeight: 50 } });
    expect(t.ctx.rowHeight()).toBe(56);
  });

  it('never under 24 px after scaling (WCAG 2.5.8): compact at an 8 px default text size', () => {
    const t = make({ remPx: 8, settings: { density: 'compact' } });
    expect(t.ctx.rowHeight()).toBe(24);
  });

  it('a page’s root font-size (html { font-size: 62.5% }) does not shrink the rows: the browser’s default size counts', () => {
    document.documentElement.style.fontSize = '10px';
    try {
      const host = document.createElement('div');
      document.body.append(host);
      const g = createGrid<T>(host, { rows: ROWS(10), getRowId: (r) => r.id, columns: COLUMNS, messages: MSG }, { sync: true });
      grids.push(g);
      expect((g as unknown as { context: GridContext<T> }).context.rowHeight()).toBe(32);
    } finally {
      document.documentElement.style.fontSize = '';
    }
  });

  it('header rows follow a live change', () => {
    const t = make();
    const v = () => t.host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-row-height');
    t.g.update({ rowHeight: 60 });
    expect(v()).toBe('60px');
    t.g.update({ rowHeight: undefined, density: 'compact' });
    expect(v()).toBe('28px');
  });

  it('the stack’s size depends on the row height: 1 copy at 100 px, 3 at 40 px', () => {
    const t = chainGrid(100);
    t.scroll(2005);
    expect(t.copies()).toBe(1);
    expect(t.ctx.inset).toBe(100);
    t.g.update({ rowHeight: 40 });
    expect(t.copies()).toBe(3);
    expect(t.ctx.inset).toBe(120);
  });

  it('the room above a row is capped as the stack is: focus L10 from below lands its top at y 100', () => {
    const t = chainGrid(100);
    t.scroll(3000);
    t.focus('L10');
    expect(t.yOf('L10')).toBe(100);
  });

  it('the focused row stays under a growing stack: L17 at y 100, then at 40 px under 3 copies (inset 120)', () => {
    const t = chainGrid(100);
    t.scroll(2000);
    t.focus('L17');
    expect(t.yOf('L17')).toBe(100);
    t.g.update({ rowHeight: 40 });
    expect(t.ctx.inset).toBe(120);
    expect(t.yOf('L17')).toBeGreaterThanOrEqual(120);
    expect(t.yOf('L17') + 40).toBeLessThanOrEqual(t.box.block);
  });

  it('a focused row partly hidden under the pinned parents before a change comes clear of them', () => {
    const t = chainGrid(40);
    t.scroll(400);
    t.focus('L8');
    // L8 at 480, the stack 120 high: move the view so L8 sits half under it.
    t.scroll(480 - 100);
    expect(t.yOf('L8')).toBe(100);
    t.g.update({ rowHeight: 48 });
    expect(t.yOf('L8')).toBeGreaterThanOrEqual(t.ctx.inset!);
    expect(t.yOf('L8') + 48).toBeLessThanOrEqual(t.box.block);
  });

  it('measured (auto) detail heights are kept across a live rowHeight change', () => {
    const panel = definePart('detail', { mount: () => ({ destroy() {} }) });
    const t = make({ features: [detail<T>({ part: panel, height: 'auto' })], settings: { rowHeight: 40 } });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R1')], expanded: true }, 'api');
    const at = () => t.d().indexOf(detailKey(k('R1'))) as never;
    (t.ctx.layout as unknown as { setHeights(h: [never, number][]): void }).setHeights([[at(), 333]]);
    t.ctx.schedule();
    expect(t.ctx.layout!.heightOf(at())).toBe(333);
    t.g.update({ rowHeight: 56 });
    expect(t.ctx.layout!.heightOf(at())).toBe(333);
    expect(t.ctx.layout!.offsetOf(t.d().indexOf(k('R2')) as never)).toBe(56 * 2 + 333);
  });
});
