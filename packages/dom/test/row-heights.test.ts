// `rowHeight: (row) => number` with `rowHeights()` (1.14.0, docs/behaviors/virtual-scroll.md « Row height by a
// function » 1–6). Written before the code; every expectation worked out by hand from the heights given.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { autoHeight } from '../src/auto-height.js';
import { rowHeights } from '../src/row-heights.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

type T = { id: string; n: number };
const ROWS = (n: number): T[] => Array.from({ length: n }, (_, i) => ({ id: `R${i}`, n: i }));
const COLUMNS: ColumnDef<T, any>[] = [{ id: 'id', header: 'Id', width: 120 }, { id: 'n', header: 'N', type: 'number', width: 100 }];
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
/** Every third row (R0, R3, R6…) 64 px, the others 32 px. */
const tall = (r: T) => (r.n % 3 ? 32 : 64);

const grids: GridInstance<T, any>[] = [];
afterEach(() => {
  grids.splice(0).forEach((g) => g.destroy());
  vi.unstubAllGlobals();
});

function make(o: { rows?: T[]; settings?: Partial<GridSettings<T>>; features?: readonly GridFeature[]; remPx?: number } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0, ...(o.remPx && { remPx: o.remPx }) };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) };
  const host = document.createElement('div');
  document.body.append(host);
  // A host's error is reported (window.reportError): recorded here, from the first layout on.
  const report = vi.fn();
  vi.stubGlobal('reportError', report);
  const events: GridEvent<T>[] = [];
  const g = createGrid<T>(host, { rows: o.rows ?? ROWS(30), getRowId: (r) => r.id, columns: COLUMNS, messages: MSG, onEvent: (e) => events.push(e), features: o.features ?? [rowHeights()], ...o.settings }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const L = () => ctx.layout!;
  const at = (key: RowKey) => g.kernel.rows.displayed.indexOf(key) as never; // a display index, as the layout takes it
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, ctx, box, L, at, rowEl, problems, report };
}

describe('rowHeight as a function (virtual-scroll.md « Row height by a function » 1, 3)', () => {
  it('each row as tall as the function says; offsets are the running totals', () => {
    const t = make({ settings: { rowHeight: tall } });
    // 10 rows of 64 (R0, R3 … R27) and 20 of 32.
    expect(t.L().total).toBe(10 * 64 + 20 * 32);
    expect([t.L().heightOf(t.at(k('R0'))), t.L().heightOf(t.at(k('R1'))), t.L().heightOf(t.at(k('R3')))]).toEqual([64, 32, 64]);
    // R4 sits under R0 (64), R1, R2 (32 each), R3 (64).
    expect(t.L().offsetOf(t.at(k('R4')))).toBe(192);
    expect(t.L().indexAt(191)).toBe(t.at(k('R3')));
    expect(t.L().indexAt(192)).toBe(t.at(k('R4')));
    expect(t.rowEl(k('R0'))!.style.getPropertyValue('block-size')).toBe('64px');
    expect(t.rowEl(k('R1'))!.style.getPropertyValue('block-size')).toBe('32px');
    expect(t.problems()).toEqual([]);
  });

  it('scaled with the reader’s text size as a number is (20 px text: 64 → 80, 32 → 40)', () => {
    const t = make({ settings: { rowHeight: tall }, remPx: 20 });
    expect([t.L().heightOf(t.at(k('R0'))), t.L().heightOf(t.at(k('R1')))]).toEqual([80, 40]);
  });

  it('ensureVisible reaches a row exactly: R20 sits at 7 × 64 + 13 × 32 = 864', () => {
    const t = make({ settings: { rowHeight: tall } });
    expect(t.L().offsetOf(t.at(k('R20')))).toBe(864);
    t.g.api.ensureVisible(k('R20'));
    // Brought in at the bottom of a 320 px view: its end (864 + 32) at the view's end.
    expect(t.ctx.scroll.logicalTop).toBe(864 + 32 - 320);
  });

  it('without rowHeights(): the density’s height and one missing-feature warning', () => {
    const t = make({ settings: { rowHeight: tall }, features: [] });
    expect(t.L().uniform).toBe(true);
    expect(t.L().heightOf(t.at(k('R0')))).toBe(32);
    expect(t.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'settings.rowHeight', detail: 'row-heights' }]);
  });

  it('a number rowHeight with the feature: unchanged (uniform)', () => {
    const t = make({ settings: { rowHeight: 50 } });
    expect(t.L().heightOf(t.at(k('R7')))).toBe(50);
    expect(t.L().total).toBe(30 * 50);
  });
});

describe('asked once per row (2)', () => {
  it('a paint or a scroll asks nothing again; a changed row is asked again alone; refresh() asks every row', () => {
    const fn = vi.fn(tall);
    const t = make({ settings: { rowHeight: fn } });
    expect(fn).toHaveBeenCalledTimes(30);
    t.g.api.ensureVisible(k('R25'));
    t.g.api.refresh();
    fn.mockClear();
    t.g.api.refresh();
    // The rows worked out again with no change of data: every row asked again.
    expect(fn).toHaveBeenCalledTimes(30);
    fn.mockClear();
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'R1', n: 3 }] });
    expect(fn.mock.calls.map((c) => c[0].id)).toEqual(['R1']);
    // R1 is now n: 3, so 64 tall: R2 moves 32 down.
    expect(t.L().offsetOf(t.at(k('R2')))).toBe(64 + 64);
  });

  it('a new function: every row asked again', () => {
    const t = make({ settings: { rowHeight: tall } });
    t.g.update({ rowHeight: () => 40 });
    expect(t.L().total).toBe(30 * 40);
    expect(t.problems()).toEqual([]);
  });
});

describe('bad answers never throw (4)', () => {
  it('a throw is reported and the row takes the density’s height; NaN the density’s; 5 → 24, 5 000 → 1 000; told once', () => {
    const t = make({
      rows: ROWS(5),
      settings: { rowHeight: (r: T) => [() => { throw new Error('x'); }, () => NaN, () => 5, () => 5000, () => 48][r.n]!() },
    });
    expect([0, 1, 2, 3, 4].map((i) => t.L().heightOf(t.at(k(`R${i}`))))).toEqual([32, 32, 24, 1000, 48]);
    expect(t.report).toHaveBeenCalledTimes(1);
    expect(t.problems()).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'settings.rowHeight', detail: 'NaN' }]);
  });
});

describe('with detail panels, auto height (5)', () => {
  const panel = definePart('detail', { mount: () => ({ destroy() {} }) });
  it('a panel keeps its height, its master takes the function’s', () => {
    const t = make({ settings: { rowHeight: tall }, features: [detail<T>({ part: panel, height: 120 }), rowHeights()] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R0')], expanded: true }, 'api');
    expect(t.L().heightOf(t.at(k('R0')))).toBe(64);
    expect(t.L().heightOf(t.at(detailKey(k('R0'))))).toBe(120);
    expect(t.L().offsetOf(t.at(k('R1')))).toBe(64 + 120);
    expect(t.L().offsetOf(t.at(k('R3')))).toBe(64 + 120 + 32 + 32);
  });

  it('the same in the other order of the features', () => {
    const t = make({ settings: { rowHeight: tall }, features: [rowHeights(), detail<T>({ part: panel, height: 120 })] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R0')], expanded: true }, 'api');
    expect(t.L().offsetOf(t.at(k('R1')))).toBe(64 + 120);
    expect(t.L().heightOf(t.at(k('R3')))).toBe(64);
  });

  it('with autoHeight(): the function wins, nothing measured', () => {
    const t = make({ settings: { rowHeight: tall }, features: [rowHeights(), autoHeight()] });
    expect(t.L().heightOf(t.at(k('R3')))).toBe(64);
    expect(t.L().heightOf(t.at(k('R4')))).toBe(32);
  });
});
