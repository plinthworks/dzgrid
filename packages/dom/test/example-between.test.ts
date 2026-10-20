// Worked example 2 (docs/phase-3-plugins.md §B2.8, step 20): the "between two numbers" filter with two
// sliders, a host's FilterKind and its `filter.between` part, through the public contract only.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ColumnOrGroup } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { filters } from '../src/filters.js';
import type { GridFeature } from '../src/features.js';
import type { GridMessages } from '../src/messages.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { AR } from '../src/locales/ar.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { between, betweenSlider, type Between } from './fixtures/between-slider.js';
import { checkSource } from './guards.js';
import { cleanup, make, ROWS, type Make, type R } from './support-filters.js';

afterEach(cleanup);
type Feature = GridFeature & { openFilter(column: string): boolean; closeFilter(): void };

const APP_EN = { 'app.between.min': 'At least', 'app.between.max': 'At most' };
const APP_AR = { 'app.between.min': 'على الأقل', 'app.between.max': 'على الأكثر' };
const EN_ALL = { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...APP_EN } } as GridMessages;
const AR_ALL = { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text, ...APP_AR } } as GridMessages;
const COLS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'Age', type: 'number', filter: { kind: 'between', floating: true } },
];
const custom = (state: Between | null) => (state === null ? null : { type: 'custom' as const, kind: 'between', state });

function grid(o: Make & { part?: ReturnType<typeof betweenSlider> } = {}) {
  const feature = filters({ floating: true }) as Feature;
  const t = make({ columns: COLS, features: [feature], ...o, settings: { messages: EN_ALL, filterKinds: [between], parts: { 'filter.between': o.part ?? betweenSlider() }, ...o.settings } });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const sliders = () => [...(popup()?.querySelectorAll<HTMLInputElement>('input[type=range]') ?? [])];
  const slide = (r: HTMLInputElement, v: number) => {
    r.value = String(v);
    r.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { ...t, feature, popup, sliders, slide, filter: () => t.g.kernel.query.filter };
}

describe('worked example 2: between two numbers', () => {
  it('filters the rows in the browser with the kind’s test, bounds included', () => {
    const t = grid();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 18, max: 25 }) as never }, 'api');
    expect(t.ids()).toEqual(ROWS.filter((r) => r.n >= 18 && r.n <= 25).map((r) => r.id));
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: null, max: 2 }) as never }, 'api');
    expect(t.ids()).toEqual(['r0', 'r1', 'r2']);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 28, max: null }) as never }, 'api');
    expect(t.ids()).toEqual(['r28', 'r29']);
    expect(t.problems()).toEqual([]);
  });

  it('keeps a serialisable state that reads back the same (a URL round trip)', () => {
    const t = grid();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 18, max: 25 }) as never }, 'api');
    const saved = JSON.stringify(t.filter());
    expect(JSON.parse(saved)).toEqual({ n: { type: 'custom', kind: 'between', state: { min: 18, max: 25 } } });
    expect(between.read(JSON.parse(saved).n.state)).toEqual({ min: 18, max: 25 });
    // A state that is not one is refused, told, and filters nothing.
    for (const bad of [{ min: 'x', max: 3 }, { min: 1 }, [1, 2], null, { min: 1, max: 2, extra: 0 }, { min: Infinity, max: null }]) expect(between.read(bad), JSON.stringify(bad)).toBe('invalid');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'custom', kind: 'between', state: { min: 'x', max: 3 } } as never }, 'api');
    expect(t.ids()).toHaveLength(30);
    expect(t.problems().some((p) => p.code === 'invalid-filter')).toBe(true);
  });

  it('treats {min: null, max: null} as no filter, in the browser and on the server', () => {
    const t = grid();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: null, max: null }) as never }, 'api');
    expect(t.ids()).toHaveLength(30);
    expect(t.problems()).toEqual([]);
    cleanup();
    const s = grid({ server: true });
    s.f.answer(['a', 'b']);
    s.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: null, max: null }) as never }, 'api');
    expect(s.f.calls.every((c) => !c.req.filter || !('n' in c.req.filter))).toBe(true);
  });

  it('sends the kind’s wire form to the server: {type: custom, kind: between, value: {gte, lte}}', () => {
    const s = grid({ server: true });
    s.f.answer(['a', 'b']);
    s.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 18, max: 65 }) as never }, 'api');
    expect(s.f.calls.at(-1)!.req.filter).toEqual({ n: { type: 'custom', kind: 'between', value: { gte: 18, lte: 65 } } });
    s.f.answer(['a']);
    s.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: null, max: 65 }) as never }, 'api');
    expect(s.f.calls.at(-1)!.req.filter).toEqual({ n: { type: 'custom', kind: 'between', value: { gte: null, lte: 65 } } });
  });

  it('shows a summary button in the floating row that opens the popup with the two sliders, named by the host’s texts', () => {
    const t = grid();
    // No filter: the floating cell is empty (the summary shows a filter in force only).
    expect(t.cell('n').childNodes.length).toBe(0);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 18, max: 65 }) as never }, 'api');
    const sum = t.cell('n').querySelector<HTMLElement>('.dzg-fsum')!;
    expect(sum.tagName).toBe('BUTTON');
    expect(sum.getAttribute('aria-haspopup')).toBe('dialog');
    sum.click();
    expect(t.popup()).not.toBeNull();
    const [lo, hi] = t.sliders();
    expect(lo!.getAttribute('aria-label')).toBe('At least');
    expect(hi!.getAttribute('aria-label')).toBe('At most');
    expect([lo!.value, hi!.value]).toEqual(['18', '65']);
    // The focus goes to the first slider (the part's focus()).
    expect(document.activeElement).toBe(lo);
  });

  it('opens with both sliders at their ends when no filter is in force', () => {
    const t = grid();
    t.feature.openFilter('n');
    expect(t.sliders().map((r) => r.value)).toEqual(['0', '120']);
  });

  it('shows the stored state in the sliders, and follows a change made elsewhere', () => {
    const t = grid();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 18, max: 65 }) as never }, 'api');
    t.feature.openFilter('n');
    expect(t.sliders().map((r) => r.value)).toEqual(['18', '65']);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 3, max: null }) as never }, 'api');
    expect(t.sliders().map((r) => r.value)).toEqual(['3', '120']);
  });

  it('commits a slide after the pause, once, the last value winning; both ends back means no filter', () => {
    vi.useFakeTimers();
    const t = grid();
    t.feature.openFilter('n');
    const [lo, hi] = t.sliders();
    t.slide(lo!, 10);
    t.slide(lo!, 12);
    t.slide(hi!, 20);
    expect(t.filter()['n']).toBeUndefined();
    vi.advanceTimersByTime(149);
    expect(t.filter()['n']).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(t.filter()['n']).toEqual({ type: 'custom', kind: 'between', state: { min: 12, max: 20 } });
    expect(t.filterEvents()).toHaveLength(1);
    expect(t.ids()).toEqual(ROWS.filter((r) => r.n >= 12 && r.n <= 20).map((r) => r.id));
    t.slide(lo!, 0);
    t.slide(hi!, 120);
    vi.advanceTimersByTime(150);
    expect(t.filter()['n']).toBeUndefined();
    expect(t.ids()).toHaveLength(30);
  });

  it('costs only its popup when the part throws: reported once, the grid and its filter go on', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const broken = definePart('filter', { mount() { throw new Error('slider bug'); } });
    const t = grid({ part: broken as ReturnType<typeof betweenSlider> });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom({ min: 5, max: 6 }) as never }, 'api');
    t.feature.openFilter('n');
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(t.popup()?.querySelector('input[type=range]') ?? null).toBeNull();
    expect(t.ids()).toEqual(['r5', 'r6']);
    // The first data row (under the header and the floating row).
    expect(t.host.querySelector('.dzg-row[aria-rowindex="3"] [data-col="name"]')!.textContent).toBe('bob5');
  });

  it('sets no physical side: the same sliders right to left (a range fills from the inline end there)', () => {
    // jsdom's import.meta.url is no file URL: the path from the repository's root, where vitest runs.
    const src = readFileSync(join(process.cwd(), 'packages/dom/test/fixtures/between-slider.ts'), 'utf8');
    expect(checkSource(src, 'test/fixtures/between-slider.ts').filter((f) => f.rule === 'physical')).toEqual([]);
    const t = grid({ settings: { messages: AR_ALL, locale: 'ar-DZ', direction: 'rtl' } });
    t.feature.openFilter('n');
    const [lo, hi] = t.sliders();
    expect(lo!.getAttribute('aria-label')).toBe('على الأقل');
    expect(hi!.getAttribute('aria-label')).toBe('على الأكثر');
    expect(lo!.getAttribute('style')).toBeNull();
    expect(hi!.getAttribute('style')).toBeNull();
  });
});
