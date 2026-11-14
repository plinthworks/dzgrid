// A tooltip per column in one line, per cell over it, only when cut; ready-made shapes and the morph preset as marks
// on the bubble (docs/behaviors/tooltips-popovers.md 7, 20–24; owner 2026-11-14). Expectations written by hand; the
// look and the motion are checked in real browsers by scripts/browser-1-12.mjs.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { tooltip, tooltips } from '../src/tooltip.js';
import { popover } from '../src/popover.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; name: string };
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ROWS: R[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, n: 1000 * i + 0.5, name: `Name ${i}` }));

function make(columns: ColumnDef<R, any>[], settings: Partial<GridSettings<R>> = {}, extra: GridFeature[] = [tooltips()]) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 800, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, {
    rows: ROWS, getRowId: (r) => r.id, columns, messages: { locale: 'en', text: EN.text }, onEvent: (e) => events.push(e),
    features: extra, ...settings,
  }, { geometry, sync: true });
  grids.push(g);
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
  const cell = (row: number, c: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${c}"]`)!;
  const over = (el: Element) => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, host, tip, head, cell, over, problems };
}

/** jsdom lays nothing out: a cell made to look cut (its text wider than its box). */
const cut = (el: HTMLElement): void => {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 180 });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 100 });
};

const N: ColumnDef<R, any> = { id: 'n', header: 'N', type: 'number' };
const NAME: ColumnDef<R, any> = { id: 'name', header: 'Name' };

describe('a column in one line (with tooltips())', () => {
  it('tooltip: true — the cell\'s text as displayed (the number formatted), always', () => {
    const { tip, cell, over } = make([{ ...N, tooltip: true }], { tooltips: { delayMs: 0 } });
    over(cell(3, 'n'));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('3,000.5');
  });

  it('{ when: \'truncated\' } — only on a cell whose text is cut', () => {
    const { tip, cell, over } = make([{ ...NAME, tooltip: { when: 'truncated' } }], { tooltips: { delayMs: 0 } });
    over(cell(2, 'name'));
    expect(tip.hidden).toBe(true);
    // An inline box inside a cell that fits (Firefox: its scrollWidth is its text's, its clientWidth 0) is not cut.
    const span = document.createElement('span');
    Object.defineProperty(span, 'scrollWidth', { configurable: true, value: 19 });
    cell(4, 'name').append(span);
    over(cell(4, 'name'));
    expect(tip.hidden).toBe(true);
    cut(cell(3, 'name'));
    over(cell(3, 'name'));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Name 3');
  });

  it('the grid\'s cells: \'truncated\' for every column that says nothing; tooltip: false keeps one silent', () => {
    const { tip, cell, over } = make([NAME, { ...N, tooltip: false }], { tooltips: { cells: 'truncated', delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.hidden).toBe(true);
    cut(cell(2, 'name'));
    over(cell(2, 'name'));
    expect(tip.textContent).toBe('Name 2');
    cut(cell(2, 'n'));
    over(cell(2, 'n'));
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
  });

  it('cells: false silences a column\'s object too', () => {
    const { tip, cell, over } = make([{ ...NAME, tooltip: true }], { tooltips: { cells: false, delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.hidden).toBe(true);
  });

  it('fixed options: text, tone, shape, animation, placement written on the bubble', () => {
    const { tip, cell, over } = make([{ ...NAME, tooltip: { text: 'A person', tone: 'neutral', shape: 'bubble', animation: 'morph', placement: 'end' } }], { tooltips: { delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.textContent).toBe('A person');
    expect([tip.dataset['tone'], tip.dataset['shape'], tip.dataset['animation'], tip.dataset['side']]).toEqual(['neutral', 'bubble', 'morph', 'inline-end']);
    // A named shape draws no SVG (CSS draws it).
    expect(tip.querySelector('svg')).toBeNull();
  });

  // Owner 2026-11-14 (« elle prend du temps pour s'afficher »): the browser starts a bubble's opening when it is shown
  // (showing it reads its style), so its preset, shape and variables are written before — the grid's `pop` was shown
  // first, the column's `morph` a moment later, its fade then starting without the morph's lead.
  it('dressed (the column\'s preset, shape) before it is shown, not after', () => {
    const { tip, cell, over } = make([{ ...NAME, tooltip: { shape: 'bubble', animation: 'morph' } }], { tooltips: { delayMs: 0, animation: 'pop' } });
    const seen: string[] = [];
    new MutationObserver((ms) => { for (const m of ms) seen.push(m.attributeName === 'hidden' ? `hidden:${tip.hidden}` : `${m.attributeName}:${tip.getAttribute(m.attributeName!)}`); })
      .observe(tip, { attributes: true, attributeFilter: ['hidden', 'data-animation', 'data-shape'] });
    over(cell(1, 'name'));
    return Promise.resolve().then(() => {
      const shown = seen.indexOf('hidden:false');
      expect(shown).toBeGreaterThan(-1);
      expect(seen.slice(shown + 1).filter((s) => !s.startsWith('hidden'))).toEqual([]);
      expect([tip.dataset['animation'], tip.dataset['shape']]).toEqual(['morph', 'bubble']);
    });
  });

  it('merge: the grid\'s defaults ← the column\'s object ← the cell\'s answer; text left out → the displayed text', () => {
    const { tip, cell, over } = make([{
      ...N,
      tooltip: { tone: 'warning', shape: 'pill', content: (v: number | null) => (v !== null && v > 4000 ? { tone: 'danger', text: 'Big' } : { animation: 'fade' }) },
    }, { ...NAME, tooltip: true }], { tooltips: { delayMs: 0, shape: 'ticket', animation: 'pop', tone: 'success' } });
    over(cell(6, 'n'));
    expect([tip.textContent, tip.dataset['tone'], tip.dataset['shape'], tip.dataset['animation']]).toEqual(['Big', 'danger', 'pill', 'pop']);
    over(cell(2, 'n'));
    expect([tip.textContent, tip.dataset['tone'], tip.dataset['shape'], tip.dataset['animation']]).toEqual(['2,000.5', 'warning', 'pill', 'fade']);
    // A column that says nothing of its look takes the grid's.
    over(cell(2, 'name'));
    expect([tip.textContent, tip.dataset['tone'], tip.dataset['shape'], tip.dataset['animation']]).toEqual(['Name 2', 'success', 'ticket', 'pop']);
  });

  it('a cell answering null shows nothing; a throw is reported and shows nothing', () => {
    const err = new Error('boom');
    const { tip, cell, over, problems } = make([{ ...N, tooltip: { tone: 'info', content: (v: number | null) => { if (v !== null && v > 5000) throw err; return null; } } }], { tooltips: { delayMs: 0 } });
    over(cell(1, 'n'));
    expect(tip.hidden).toBe(true);
    over(cell(7, 'n'));
    expect(tip.hidden).toBe(true);
    void problems;
  });

  it('style: only custom properties, written while this column\'s tooltip shows; maxWidth caps it', () => {
    const { tip, cell, over } = make([
      { ...NAME, tooltip: { maxWidth: 240, style: { '--dzg-tooltip-info-bg': 'teal', color: 'red' } as never } }, // `color`: not a variable, the type refuses it; checked ignored
      { ...N, tooltip: { maxWidth: '12rem' } },
    ], { tooltips: { delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.style.getPropertyValue('--dzg-tooltip-info-bg')).toBe('teal');
    expect(tip.style.getPropertyValue('color')).toBe('');
    expect(tip.style.getPropertyValue('max-inline-size')).toBe('240px');
    over(cell(1, 'n'));
    expect(tip.style.getPropertyValue('--dzg-tooltip-info-bg')).toBe('');
    expect(tip.style.getPropertyValue('max-inline-size')).toBe('12rem');
  });

  it('delayMs per column on hover; a keyboard focus on the cell opens it at once', () => {
    const { g, tip, cell, over } = make([{ ...NAME, tooltip: { delayMs: 50, shape: 'bubble', animation: 'morph' } }, { ...N, tooltip: true }], { tooltips: { delayMs: 800 } });
    over(cell(1, 'name'));
    vi.advanceTimersByTime(49);
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tip.hidden).toBe(false);
    over(cell(1, 'n'));
    vi.advanceTimersByTime(700);
    expect(tip.textContent).toBe('Name 1');
    vi.advanceTimersByTime(100);
    expect(tip.textContent).toBe('1,000.5');
    // The keyboard: at once, with the column's look.
    g.api.focusCell(dataKey('r2')!, 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(tip.hidden).toBe(false);
    expect([tip.textContent, tip.dataset['shape'], tip.dataset['animation']]).toEqual(['Name 3', 'bubble', 'morph']);
    expect(cell(3, 'name').getAttribute('aria-describedby')).toBe(tip.id);
  });
});

describe('headerTooltip as a spec', () => {
  it('text and tone without tooltips(); its shape and animation with it', () => {
    const cols = [{ ...NAME, headerTooltip: { text: 'Who', tone: 'success', shape: 'pill', animation: 'morph' } } as ColumnDef<R, any>];
    const a = make(cols, { tooltips: { delayMs: 0 } }, []);
    a.over(a.head('name'));
    expect([a.tip.textContent, a.tip.dataset['tone']]).toEqual(['Who', 'success']);
    expect(a.tip.hasAttribute('data-shape')).toBe(false);
    a.g.destroy();
    const b = make(cols, { tooltips: { delayMs: 0 } });
    b.over(b.head('name'));
    expect([b.tip.textContent, b.tip.dataset['tone'], b.tip.dataset['shape'], b.tip.dataset['animation']]).toEqual(['Who', 'success', 'pill', 'morph']);
  });
});

describe('without tooltips()', () => {
  it('true, an object and cells: \'truncated\' are told once each (missing-feature) and show nothing; a function still works', () => {
    const { tip, cell, over, problems } = make([{ ...NAME, tooltip: true }, { ...N, tooltip: { tone: 'danger' } }, { id: 'f', header: 'F', value: (r: R) => r.n, tooltip: () => 'Fn' }], { tooltips: { cells: 'truncated', delayMs: 0 } }, []);
    expect(problems().filter((p) => p.detail === 'tooltips')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'settings.tooltips', detail: 'tooltips' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].tooltip', detail: 'tooltips' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[1].tooltip', detail: 'tooltips' },
    ]);
    cut(cell(1, 'name'));
    over(cell(1, 'name'));
    expect(tip.hidden).toBe(true);
    over(cell(1, 'f'));
    expect(tip.textContent).toBe('Fn');
  });
});

describe('the page\'s tooltip and popover: the same names', () => {
  it('a named shape, morph, style and maxWidth on the page\'s bubble; when: \'truncated\'', () => {
    const b = document.createElement('button');
    b.textContent = 'A long label';
    document.body.append(b);
    const h = tooltip(b, { content: 'Hi', shape: 'bubble', animation: 'morph', style: { '--dzg-tooltip-bubble-radius': '1rem' }, maxWidth: 200 });
    h.show();
    const el = document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float')!;
    expect([el.dataset['shape'], el.dataset['animation'], el.style.getPropertyValue('--dzg-tooltip-bubble-radius'), el.style.getPropertyValue('max-inline-size')]).toEqual(['bubble', 'morph', '1rem', '200px']);
    expect(el.querySelector('svg')).toBeNull();
    // A path is still an app's shape (data-shape empty, its SVG).
    h.update({ shape: 'M0 0 H100 V100 H0 Z' });
    expect(el.getAttribute('data-shape')).toBe('');
    expect(el.querySelector('svg.dzg-tip-shape')).not.toBeNull();
    h.update({ shape: 'ticket' });
    expect([el.dataset['shape'], el.querySelector('svg')]).toEqual(['ticket', null]);
    h.hide();
    vi.runAllTimers();
    h.update({ when: 'truncated' });
    h.show();
    expect(h.shown).toBe(false);
    cut(b);
    h.show();
    expect(h.shown).toBe(true);
    h.destroy();
  });

  it('a popover takes a named shape and morph', () => {
    const t = document.createElement('button');
    document.body.append(t);
    const p = popover(t, { content: 'Body', shape: 'bubble', animation: 'morph' });
    p.open();
    expect([p.el!.dataset['shape'], p.el!.dataset['animation']]).toEqual(['bubble', 'morph']);
    p.destroy();
    // An app's animation: `custom` written before it is shown (no CSS fade started first).
    const seen: string[] = [];
    new MutationObserver((ms) => { for (const m of ms) { const el = m.target as HTMLElement; if (el.classList.contains('dzg-popover')) seen.push(m.attributeName === 'hidden' ? `hidden:${el.hidden}` : `${m.attributeName}:${m.oldValue}>${el.getAttribute(m.attributeName!)}`); } })
      .observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'data-animation'] });
    const q = popover(t, { content: 'Body', animation: 'scale', animate: () => undefined });
    q.open();
    return Promise.resolve().then(() => {
      const shown = seen.lastIndexOf('hidden:false');
      expect(shown).toBeGreaterThan(-1);
      expect(seen.slice(shown + 1)).toEqual([]);
      expect(q.el!.dataset['animation']).toBe('custom');
      q.destroy();
    });
  });
});
