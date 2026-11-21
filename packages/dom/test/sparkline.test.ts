// `type: 'sparkline'` drawn by `sparklines()` (1.16.0, docs/behaviors/sparklines.md). Written before the code; every
// coordinate below worked out by hand in the drawing's 100 × 100 box (x from 3 to 97, y from 92 at the bottom to 8).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridMessages } from '../src/messages.js';
import type { GridFeature } from '../src/features.js';
import { sparklines } from '../src/sparkline.js';
import { filters } from '../src/filters.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_SPARKLINE } from '../src/locales/en-sparkline.js';
import { FR_SPARKLINE } from '../src/locales/fr-sparkline.js';
import { AR_SPARKLINE } from '../src/locales/ar-sparkline.js';

type R = { id: string; t: unknown };
const join = (a: GridMessages, b: { locale: string; text: object }): GridMessages => ({ ...a, text: { ...a.text, ...b.text } });
const TEXTS = { en: join(EN, EN_SPARKLINE), fr: join(FR, FR_SPARKLINE), ar: join(AR, AR_SPARKLINE) };

let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.useRealTimers(); });

const ROWS: R[] = [
  { id: 'a', t: [3, 5, 41, 27] },
  { id: 'b', t: [10, null, 20] },
  { id: 'c', t: [-2, 0, 4] },
  { id: 'd', t: 'oops' },
  { id: 'e', t: [7] },
];

function make(o: { col?: Partial<ColumnDef<R, any>>; feature?: Parameters<typeof sparklines>[0] | false; lang?: keyof typeof TEXTS; rows?: R[]; settings?: Partial<GridSettings<R>>; more?: GridFeature[] } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const lang = o.lang ?? 'en';
  const g = createGrid<R>(host, {
    rows: o.rows ?? ROWS, getRowId: (r) => r.id, messages: TEXTS[lang], ...(lang === 'ar' && { direction: 'rtl' as const }),
    columns: [{ id: 'id', header: 'Id' }, { id: 't', header: 'Trend', type: 'sparkline', ...o.col }],
    features: [...(o.more ?? []), ...(o.feature === false ? [] : [sparklines(o.feature)])], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const cell = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-cell[data-col="t"]')].find((c) => c.closest('.dzg-row')!.querySelector('[data-col="id"]')!.textContent === id)!;
  const svg = (id: string) => cell(id).querySelector<SVGSVGElement>('svg.dzg-spark');
  const shapes = (id: string) => [...svg(id)!.children].map((e) => `${e.getAttribute('class')}:${e.getAttribute('d') ?? ['x', 'y', 'width', 'height'].map((a) => e.getAttribute(a)).join(',')}`);
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  /** The pointer over a row's drawing at `fx` (0–100) across it, the drawing laid 100 px wide. */
  const move = (id: string, fx: number) => {
    const s = svg(id)!;
    s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => null }) as DOMRect; // a laid-out drawing (jsdom has no layout)
    const target = s.firstElementChild ?? s;
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: fx }));
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: fx }));
  };
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code}@${p.path}`) : []));
  return { g, host, cell, svg, shapes, tip, move, problems };
}

describe('the drawing (sparklines.md 3–5)', () => {
  it('a line through the points, a dot on the last; the words a summary, the drawing hidden from screen readers', () => {
    const t = make();
    // 3 → 92, 41 → 8, 5 → 92 - 2/38·84 = 87.58, 27 → 92 - 24/38·84 = 38.95; x 3, 34.33, 65.67, 97.
    expect(t.shapes('a')).toEqual(['dzg-spark-line:M3 92L34.33 87.58L65.67 8L97 38.95', 'dzg-spark-dot:M97 38.95h0']);
    expect(t.svg('a')!.getAttribute('aria-hidden')).toBe('true');
    expect(t.svg('a')!.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(t.svg('a')!.getAttribute('preserveAspectRatio')).toBe('none');
    expect(t.cell('a').textContent).toBe('4 values, from 3 to 41, last 27');
    expect(t.cell('a').querySelector('.dzg-sr')!.textContent).toBe('4 values, from 3 to 41, last 27');
    expect(t.problems()).toEqual([]);
  });

  it('a gap breaks the line; one value alone: a dot in the middle', () => {
    const t = make();
    expect(t.shapes('b')).toEqual(['dzg-spark-line:M3 92h0M97 8h0', 'dzg-spark-dot:M97 8h0']);
    expect(t.cell('b').textContent).toBe('2 values, from 10 to 20, last 20');
    expect(t.shapes('e')).toEqual(['dzg-spark-line:M50 50h0', 'dzg-spark-dot:M50 50h0']);
    expect(t.cell('e').textContent).toBe('1 value: 7');
  });

  it('an unreadable value or an empty list: blank, nothing drawn', () => {
    const t = make({ rows: [...ROWS, { id: 'f', t: [] }, { id: 'g', t: [null, null] }] });
    for (const id of ['d', 'f', 'g']) {
      expect(t.cell(id).textContent).toBe('');
      expect(t.svg(id)?.children.length ?? 0).toBe(0);
    }
  });

  it('area: the line over a fill down to zero (the bottom when all are above it)', () => {
    const t = make({ col: { sparkline: { kind: 'area', markers: 'none' } } });
    expect(t.shapes('a')).toEqual(['dzg-spark-area:M3 92L3 92L34.33 87.58L65.67 8L97 38.95L97 92Z', 'dzg-spark-line:M3 92L34.33 87.58L65.67 8L97 38.95']);
    // -2 → 92, 0 → 92 - 2/6·84 = 64, 4 → 8: down to zero, at 64.
    expect(t.shapes('c')[0]).toBe('dzg-spark-area:M3 64L3 92L50 64L97 8L97 64Z');
  });

  it('bar: from zero, a negative bar its own class, the last marked', () => {
    const t = make({ col: { sparkline: { kind: 'bar' } } });
    // -2..4 with zero: zero at 64; slot 33.33, bar 23.33 wide from slot·0.15 = 5; -2 → 92 (28 down), 0 → none tall, 4 → 8 (56 up).
    expect(t.shapes('c')).toEqual(['dzg-spark-bar dzg-spark-neg:5,64,23.33,28', 'dzg-spark-bar:38.33,64,23.33,0', 'dzg-spark-bar dzg-spark-mark:71.67,8,23.33,56']);
  });

  it('win / loss: the sign only, every bar the same height, nothing for zero', () => {
    const t = make({ col: { sparkline: { kind: 'winloss', markers: 'none' } } });
    expect(t.shapes('c')).toEqual(['dzg-spark-bar dzg-spark-neg:5,52,23.33,40', 'dzg-spark-bar:71.67,10,23.33,40']);
  });

  it('min / max fix the range (a value beyond drawn at the edge); all equal: a flat line in the middle', () => {
    const t = make({ col: { sparkline: { min: 0, max: 20, markers: 'none' } }, rows: [{ id: 'a', t: [0, 10, 30] }, { id: 'b', t: [4, 4] }] });
    expect(t.shapes('a')).toEqual(['dzg-spark-line:M3 92L50 50L97 8']);
    const u = make({ col: { sparkline: { markers: 'none' } }, rows: [{ id: 'b', t: [4, 4] }] });
    expect(u.shapes('b')).toEqual(['dzg-spark-line:M3 50L97 50']);
  });

  it('markers: minmax marks the smallest and the largest, their first time', () => {
    const t = make({ col: { sparkline: { markers: 'minmax' } } });
    expect(t.shapes('a').slice(1)).toEqual(['dzg-spark-dot:M3 92h0', 'dzg-spark-dot:M65.67 8h0']);
  });

  it('the grid’s options, a column’s own winning key by key (6)', () => {
    const t = make({ feature: { kind: 'bar', markers: 'none' }, col: { sparkline: { markers: 'last' } } });
    expect(t.svg('c')!.getAttribute('data-kind')).toBe('bar');
    expect(t.shapes('c')[2]).toMatch(/dzg-spark-mark/);
  });

  it('a changed row redraws its cell; the same list again changes nothing', () => {
    const t = make();
    const first = t.svg('a')!.firstElementChild;
    t.g.update({ rows: ROWS.map((r) => (r.id === 'a' ? { ...r, t: [3, 5, 41, 27] } : r)) });
    expect(t.svg('a')!.firstElementChild).toBe(first);
    t.g.update({ rows: ROWS.map((r) => (r.id === 'a' ? { ...r, t: [1, 2] } : r)) });
    expect(t.shapes('a')).toEqual(['dzg-spark-line:M3 92L97 8', 'dzg-spark-dot:M97 8h0']);
    expect(t.cell('a').textContent).toBe('2 values, from 1 to 2, last 2');
  });
});

describe('without the feature (1)', () => {
  it('the numbers as text; options without the feature told once', () => {
    const t = make({ feature: false, col: { sparkline: { kind: 'bar' } } });
    expect(t.cell('a').textContent).toBe('3 5 41 27');
    expect(t.problems()).toEqual(['missing-feature@columns.t.sparkline']);
    const u = make({ feature: false });
    expect(u.problems()).toEqual([]);
  });
});

describe('the texts (1)', () => {
  it('sparklines() without its texts: a TypeError naming them, as every feature with texts', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(() => createGrid<R>(host, { rows: ROWS, getRowId: (r) => r.id, messages: EN, columns: [{ id: 't', type: 'sparkline' }], features: [sparklines()] }, { sync: true })).toThrow('sparklines: missing sparkline.summary, sparkline.point');
  });
});

describe('beside the filters', () => {
  it('a sparkline column has no filter of its own kind: nothing drawn, nothing told', () => {
    const t = make({ settings: { messages: { ...TEXTS.en, text: { ...TEXTS.en.text, ...EN_FILTERS.text } } }, more: [filters()] });
    expect(t.problems()).toEqual([]);
    expect(t.host.querySelector('.dzg-hcell[data-col="t"] .dzg-fbtn')).toBeNull();
    // The id column (text) has its button: the filters are on.
    expect(t.host.querySelector('.dzg-hcell[data-col="id"] .dzg-fbtn')).not.toBeNull();
  });
});

describe('languages and direction (7, 10)', () => {
  it('the summary in the grid’s language, its numbers too', () => {
    const t = make({ lang: 'fr', rows: [{ id: 'a', t: [1.5, 1200, 3] }] });
    expect(t.cell('a').textContent).toBe('3 valeurs, de 1,5 à 1 200, dernière 3');
  });

  it('right to left: the same drawing, time left to right (never mirrored)', () => {
    const t = make({ lang: 'ar' });
    expect(t.shapes('a')).toEqual(['dzg-spark-line:M3 92L34.33 87.58L65.67 8L97 38.95', 'dzg-spark-dot:M97 38.95h0']);
    expect(t.cell('a').textContent).toBe('4 قيم، من 3 إلى 41، الأخيرة 27');
  });
});

describe('tooltips (8, 9)', () => {
  it('over the drawing, the nearest point after the hover delay, a ring on it; then from point to point at once', () => {
    const t = make();
    t.move('a', 60);
    expect(t.tip.hidden).toBe(true);
    vi.advanceTimersByTime(500);
    expect(t.tip.hidden).toBe(false);
    expect(t.tip.textContent).toBe('41 (3 of 4)');
    expect(t.svg('a')!.querySelector('.dzg-spark-hover')!.getAttribute('d')).toBe('M65.67 8h0');
    t.move('a', 90);
    expect(t.tip.textContent).toBe('27 (4 of 4)');
    expect(t.svg('a')!.querySelectorAll('.dzg-spark-hover')).toHaveLength(1);
    // A gap is never the point: the nearest number.
    t.move('b', 45);
    vi.advanceTimersByTime(500);
    expect(t.tip.textContent).toBe('10 (1 of 3)');
  });

  it('bars: the bar under the pointer; a zero win / loss has no point', () => {
    const t = make({ col: { sparkline: { kind: 'bar' } } });
    t.move('c', 70);
    vi.advanceTimersByTime(500);
    expect(t.tip.textContent).toBe('4 (3 of 3)');
  });

  it('tooltip: false on the column, or the column’s own tooltip: no point tooltip', () => {
    const t = make({ col: { sparkline: { tooltip: false } } });
    t.move('a', 60);
    vi.advanceTimersByTime(600);
    expect(t.tip.hidden).toBe(true);
    const u = make({ col: { tooltip: () => 'mine' } });
    u.move('a', 60);
    vi.advanceTimersByTime(600);
    expect(u.tip.textContent).toBe('mine');
  });

  it('a keyboard focus: the summary at once, not described twice', () => {
    const t = make();
    t.g.api.focusCell(dataKey('a')!, 'id');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(t.cell('a'));
    expect(t.tip.hidden).toBe(false);
    expect(t.tip.textContent).toBe('4 values, from 3 to 41, last 27');
    expect(t.cell('a').getAttribute('aria-describedby') ?? '').not.toContain(t.tip.id);
  });
});

describe('sorting (11)', () => {
  it('by the last number; an unreadable list last', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 't', dir: 'asc' }] }, 'user');
    const ids = [...t.host.querySelectorAll('.dzg-row')].sort((x, y) => Number(x.getAttribute('aria-rowindex')) - Number(y.getAttribute('aria-rowindex'))).map((r) => r.querySelector('[data-col="id"]')?.textContent);
    expect(ids).toEqual(['c', 'e', 'b', 'a', 'd']);
  });
});
