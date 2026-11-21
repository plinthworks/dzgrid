// A tooltip per column in one line, per cell over it, only when cut; a look the grid's bubble leaves to a feature; the
// seam where a feature takes the tooltips over (docs/behaviors/tooltips.md 10, 11, 13; owner 2026-11-14: the rich
// bubbles moved to DzTooltip, `@dztooltip/dzgrid` the feature, docs/behaviors/tooltips-popovers.md). Expectations written by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridFeature } from '../src/features.js';
import type { TooltipSeam, TooltipShow } from '../src/render/tooltip.js';
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

function make(columns: ColumnDef<R, any>[], settings: Partial<GridSettings<R>> = {}, extra: GridFeature[] = []) {
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

describe('a column in one line (10)', () => {
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

  it('cells: false silences a column\'s true and its function', () => {
    const { tip, cell, over } = make([{ ...NAME, tooltip: true }, { ...N, tooltip: () => 'Fn' }], { tooltips: { cells: false, delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.hidden).toBe(true);
    over(cell(1, 'n'));
    expect(tip.hidden).toBe(true);
  });

  it('options: its text; the cell\'s answer over them (words, a spec, null); a throw reported, nothing shown', () => {
    const err = new Error('boom');
    const reported: unknown[] = [];
    (window as Window & { reportError?: (e: unknown) => void }).reportError = (e) => reported.push(e);
    const { tip, cell, over } = make([
      { ...NAME, tooltip: { text: 'A person' } },
      { ...N, tooltip: { content: (v: number | null) => { if (v !== null && v > 8000) throw err; return v !== null && v > 4000 ? { text: 'Big' } : v !== null && v > 2000 ? 'Mid' : null; } } },
    ], { tooltips: { delayMs: 0 } });
    over(cell(1, 'name'));
    expect(tip.textContent).toBe('A person');
    over(cell(6, 'n'));
    expect(tip.textContent).toBe('Big');
    over(cell(3, 'n'));
    expect(tip.textContent).toBe('Mid');
    over(cell(1, 'n'));
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
    over(cell(9, 'n'));
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
    expect(reported).toEqual([err]);
    delete (window as { reportError?: unknown }).reportError;
  });

  it('options with content: a cell\'s answer without words keeps the displayed text', () => {
    const { tip, cell, over } = make([{ ...N, tooltip: { content: (v: number | null) => (v !== null && v > 4000 ? { text: 'Big' } : { delayMs: 0 }) } }], { tooltips: { delayMs: 0 } });
    over(cell(6, 'n'));
    expect(tip.textContent).toBe('Big');
    over(cell(2, 'n'));
    expect(tip.textContent).toBe('2,000.5');
  });

  it('a function may answer a spec: its words shown (its look is a feature\'s)', () => {
    const { tip, cell, over } = make([{ ...N, tooltip: (v: number | null) => ({ text: `Value ${v}`, tone: 'danger' }) }], { tooltips: { delayMs: 0 } });
    over(cell(2, 'n'));
    expect(tip.textContent).toBe('Value 2000.5');
    expect(tip.hasAttribute('data-tone')).toBe(false);
  });

  it('delayMs per column on hover; a keyboard focus on the cell opens it at once', () => {
    const { g, tip, cell, over } = make([{ ...NAME, tooltip: { delayMs: 50 } }, { ...N, tooltip: true }], { tooltips: { delayMs: 800 } });
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
    g.api.focusCell(dataKey('r2')!, 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Name 3');
    expect(cell(3, 'name').getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('a touch alone shows none (12)', () => {
    const { tip, cell } = make([{ ...NAME, tooltip: true }], { tooltips: { delayMs: 0 } });
    cell(1, 'name').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
    expect(tip.hidden).toBe(true);
  });
});

describe('headerTooltip as a spec (10)', () => {
  it('its words', () => {
    const { tip, head, over } = make([{ ...NAME, headerTooltip: { text: 'Who' } }], { tooltips: { delayMs: 0 } });
    over(head('name'));
    expect(tip.textContent).toBe('Who');
  });
});

describe('a look without a feature that draws the tooltips (11)', () => {
  it('told once each (missing-feature), the words shown; HTML: its text, or nothing; true and a function say nothing', () => {
    const { tip, cell, head, over, problems } = make([
      { ...NAME, tooltip: { tone: 'danger', html: '<b>Ann</b>', text: 'Ann' }, headerTooltip: { text: 'Who', placement: 'top' } },
      { ...N, tooltip: { html: '<b>Only HTML</b>' } },
      { id: 'f', header: 'F', value: (r: R) => r.n, tooltip: () => 'Fn' },
      { id: 't', header: 'T', value: (r: R) => r.name, tooltip: true },
    ], { tooltips: { delayMs: 0 } });
    expect(problems().filter((p) => p.detail === 'tooltips')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].tooltip', detail: 'tooltips' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].headerTooltip', detail: 'tooltips' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[1].tooltip', detail: 'tooltips' },
    ]);
    over(cell(1, 'name'));
    expect([tip.textContent, tip.querySelector('b')]).toEqual(['Ann', null]);
    over(head('name'));
    expect(tip.textContent).toBe('Who');
    over(cell(1, 'n'));
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
    over(cell(1, 'f'));
    expect(tip.textContent).toBe('Fn');
  });
});

describe('the seam: a feature takes the tooltips over (13)', () => {
  /** A feature drawing the tooltips, recording what the grid tells it. */
  function drawing(over: Partial<TooltipSeam> = {}) {
    const log: string[] = [];
    let last: TooltipShow | null = null;
    let finish: (() => void) | null = null;
    const seam: TooltipSeam = {
      show(s) {
        last = s;
        log.push(`show:${s.tip.text}:${s.tip.tone ?? '-'}:${s.dir}`);
        s.el.hidden = false;
      },
      hide(el, done) {
        log.push('hide');
        finish = () => { el.hidden = true; done(); };
        return () => log.push('cancel');
      },
      ...over,
    };
    const feature: GridFeature = { id: 'tooltips', setup: () => ({ tooltips: seam, destroy: () => {} }) };
    return { feature, log, last: () => last, finish: () => finish?.() };
  }

  it('the grid decides when and what, the feature shows and hides: the filled element, its anchor, the tip with its look, the direction', () => {
    const d = drawing();
    const { tip, cell, over, problems } = make([{ ...NAME, tooltip: { tone: 'danger', placement: 'top' } }], { tooltips: { delayMs: 0 }, direction: 'rtl' }, [d.feature]);
    // Its look is the feature's: no warning.
    expect(problems().filter((p) => p.detail === 'tooltips')).toEqual([]);
    over(cell(1, 'name'));
    expect(d.log).toEqual(['show:Name 1:danger:rtl']);
    const s = d.last()!;
    expect([s.el, s.anchor, s.tip.placement, s.el.textContent]).toEqual([tip, cell(1, 'name'), 'top', 'Name 1']);
    // Described by the grid; not placed by it (no side, no inset written).
    expect(cell(1, 'name').getAttribute('aria-describedby')).toBe(tip.id);
    expect([tip.hasAttribute('data-side'), tip.style.getPropertyValue('inset-block-start')]).toEqual([false, '']);
    // Escape: the feature's closing; the element stays until it says done.
    cell(1, 'name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(d.log).toEqual(['show:Name 1:danger:rtl', 'hide']);
    expect(cell(1, 'name').getAttribute('aria-describedby')).toBeNull();
    d.finish();
    expect(tip.hidden).toBe(true);
  });

  it('shown again during its closing: the closing cancelled; its own hide given to the feature', () => {
    const d = drawing();
    const { cell, over } = make([{ ...NAME, tooltip: true }], { tooltips: { delayMs: 0 } }, [d.feature]);
    over(cell(1, 'name'));
    d.last()!.hide();
    over(cell(2, 'name'));
    expect(d.log).toEqual(['show:Name 1:-:ltr', 'hide', 'cancel', 'show:Name 2:-:ltr']);
  });

  it('targets and tipFor: what else the pointer follows, a target answered first; undefined leaves it to the grid', () => {
    const d = drawing({
      targets: () => '.dzg-hcell,.dzg-cell,.extra',
      tipFor: (t) => (t.classList.contains('extra') ? { text: 'Mine', said: true } : t.closest('[data-col="n"]') ? null : undefined),
    });
    const { host, cell, over } = make([{ ...NAME, tooltip: true }, { ...N, tooltip: true }], { tooltips: { delayMs: 0 } }, [d.feature]);
    const x = cell(1, 'name').appendChild(document.createElement('i'));
    x.className = 'extra';
    over(x);
    expect(d.log).toEqual(['show:Mine:-:ltr']);
    // Its name already: not described twice.
    expect(x.getAttribute('aria-describedby')).toBeNull();
    over(cell(2, 'name'));
    over(cell(2, 'n'));
    vi.advanceTimersByTime(1000);
    expect(d.log).toEqual(['show:Mine:-:ltr', 'show:Name 2:-:ltr', 'hide']);
    void host;
  });

  it('ok false at the end of the delay drops the show; html: the feature\'s cleaner draws a column\'s HTML', () => {
    let ok = false;
    const d = drawing({
      ok: () => ok,
      html: (h, doc) => { const f = doc.createDocumentFragment(); const b = f.appendChild(doc.createElement('b')); b.textContent = h.replace(/<[^>]*>/g, ''); return f; },
    });
    const { tip, cell, over } = make([{ ...NAME, tooltip: { html: '<b>Bold</b>' } }], { tooltips: { delayMs: 100 } }, [d.feature]);
    over(cell(1, 'name'));
    vi.advanceTimersByTime(200);
    expect(d.log).toEqual([]);
    ok = true;
    over(cell(2, 'name'));
    vi.advanceTimersByTime(200);
    expect(d.log).toEqual(['show:Bold:-:ltr']);
    expect(tip.querySelector('b')!.textContent).toBe('Bold');
  });

  it('the first feature giving a seam wins', () => {
    const a = drawing();
    const b = drawing();
    const { cell, over } = make([{ ...NAME, tooltip: true }], { tooltips: { delayMs: 0 } }, [a.feature, { ...b.feature, id: 'other' }]);
    over(cell(1, 'name'));
    expect([a.log, b.log]).toEqual([['show:Name 1:-:ltr'], []]);
  });
});
