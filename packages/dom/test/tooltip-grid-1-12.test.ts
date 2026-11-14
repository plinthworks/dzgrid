// The grid's tooltips where the app wants them, with tones, HTML through a cleaner, and an animation of its own
// (docs/behaviors/tooltips-popovers.md 1–9, 16). Expectations written by hand; the look and the motion are checked in
// real browsers by scripts/browser-1-12.mjs.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { filters } from '../src/filters.js';
import { safeHtml, tooltips } from '../src/tooltip.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const COLS: ColumnDef<R, any>[] = [
  { id: 'n', header: 'N', type: 'number', headerTooltip: 'How many', tooltip: (v: number | null) => (v === null ? null : v % 2 ? { text: `Odd ${v}`, tone: 'danger' } : `Even ${v}`) },
  { id: 'h', header: 'H', value: (r: R) => r.n, tooltip: (v) => ({ html: `<b>Bold ${String(v)}</b><img src="https://example.invalid/x.png" onerror="alert(1)"><script>alert(2)</script>` }) },
  { id: 'hw', header: 'HW', value: (r: R) => r.n, tooltip: () => ({ html: '<i>x</i>', text: 'Plain words' }) },
  { id: 'p', header: 'P', value: (r: R) => r.n, tooltip: () => ({ text: 'At the end', placement: 'end' }) },
];

function make(settings: Partial<GridSettings<R>> = {}, withFilters = false, extra: GridFeature[] = []) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns: COLS,
    messages: { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text } }, onEvent: (e) => events.push(e),
    features: [...(withFilters ? [filters()] : []), ...extra], ...settings,
  }, { geometry, sync: true });
  grids.push(g);
  const tip = host.querySelector<HTMLElement>('.dzg-tooltip')!;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]`)!;
  const cell = (row: number, c: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${c}"]`)!;
  const over = (el: Element, pointerType = 'mouse') => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType }));
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, host, tip, head, cell, over, problems };
}

describe('header buttons (tooltips.header, with tooltips())', () => {
  it('off by default: hovering the filter button shows the column\'s headerTooltip, as in 1.11', () => {
    const { tip, head, over } = make({}, true);
    const button = head('n').querySelector<HTMLElement>('.dzg-fbtn')!;
    expect(button.getAttribute('aria-label')).toBeTruthy();
    over(button);
    vi.advanceTimersByTime(600);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('How many');
  });

  it('on: the button shows its accessible name, and no aria-describedby (it is its name already)', () => {
    const { tip, head, over } = make({ tooltips: { header: true } }, true, [tooltips()]);
    const button = head('n').querySelector<HTMLElement>('.dzg-fbtn')!;
    over(button);
    vi.advanceTimersByTime(600);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe(button.getAttribute('aria-label'));
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    // The header itself keeps its headerTooltip, described.
    over(head('n'));
    vi.advanceTimersByTime(600);
    expect(tip.textContent).toBe('How many');
    expect(head('n').getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('on: shown at once on a keyboard focus of the button (a focus right after a key in the grid), not on a click\'s', () => {
    const { tip, head } = make({ tooltips: { header: true } }, true, [tooltips()]);
    const button = head('n').querySelector<HTMLButtonElement>('.dzg-fbtn')!;
    head('n').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    button.focus();
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe(button.getAttribute('aria-label'));
    // Escape hides it, the focus stays.
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(tip.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    // A press then a focus: nothing.
    button.blur();
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button.focus();
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
  });
});

describe('cells', () => {
  it('cells: false silences every column\'s tooltip, the header\'s stays', () => {
    const { tip, head, cell, over } = make({ tooltips: { cells: false, delayMs: 0 } });
    over(cell(3, 'n'));
    expect(tip.hidden).toBe(true);
    over(head('n'));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('How many');
  });

  it('{ text, tone }: the words, and the tone on the bubble; a plain string has none (the grid\'s tone)', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0 } });
    over(cell(3, 'n'));
    expect(tip.textContent).toBe('Odd 3');
    expect(tip.getAttribute('data-tone')).toBe('danger');
    over(cell(4, 'n'));
    expect(tip.textContent).toBe('Even 4');
    expect(tip.hasAttribute('data-tone')).toBe(false);
  });

  it('the grid\'s tone and animation as defaults, a column\'s tone wins', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0, tone: 'neutral', animation: 'slide' } });
    over(cell(4, 'n'));
    expect(tip.getAttribute('data-tone')).toBe('neutral');
    expect(tip.getAttribute('data-animation')).toBe('slide');
    over(cell(3, 'n'));
    expect(tip.getAttribute('data-tone')).toBe('danger');
  });

  it('never on touch alone', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0 } });
    over(cell(3, 'n'), 'touch');
    vi.advanceTimersByTime(1000);
    expect(tip.hidden).toBe(true);
  });

  it('hideDelayMs: the grace before it goes', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0, hideDelayMs: 400 } });
    over(cell(3, 'n'));
    cell(3, 'n').dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    vi.advanceTimersByTime(300);
    expect(tip.hidden).toBe(false);
    vi.advanceTimersByTime(150);
    expect(tip.hidden).toBe(true);
  });
});

describe('HTML (opt-in through the cleaner)', () => {
  it('without the cleaner: never the markup; the text if given, else nothing', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0 } });
    over(cell(2, 'h'));
    expect(tip.hidden).toBe(true);
    over(cell(2, 'hw'));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Plain words');
    expect(tip.querySelector('i')).toBeNull();
  });

  it('with safeHtml: the cleaned nodes, no script, no image, no event attribute; described by its words', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0, html: safeHtml } });
    over(cell(2, 'h'));
    expect(tip.hidden).toBe(false);
    expect(tip.innerHTML).toBe('<b>Bold 2</b>');
    expect(cell(2, 'h').getAttribute('aria-describedby')).toBe(tip.id);
    // Another cell: its own nodes, the first ones gone.
    over(cell(4, 'h'));
    expect(tip.innerHTML).toBe('<b>Bold 4</b>');
    // A text tooltip after: the nodes gone.
    over(cell(4, 'n'));
    expect(tip.innerHTML).toBe('Even 4');
  });
});

describe('the app\'s own animation (animate, with tooltips())', () => {
  it('told open after it is placed, close before it is hidden; hidden when its promise settles; presets off', async () => {
    const calls: string[] = [];
    let finish!: () => void;
    const animate = vi.fn((el: HTMLElement, phase: 'open' | 'close') => {
      calls.push(`${phase}:${el.hidden ? 'hidden' : 'shown'}:${el.dataset['side']}`);
      if (phase === 'close') return new Promise<void>((ok) => (finish = ok));
    });
    const { tip, cell, over, g } = make({ tooltips: { delayMs: 0, animate } }, false, [tooltips()]);
    over(cell(4, 'n'));
    expect(tip.getAttribute('data-animation')).toBe('custom');
    expect(calls).toEqual(['open:shown:block-end']);
    // Another cell while shown: it moves, no new opening.
    over(cell(6, 'n'));
    expect(calls).toEqual(['open:shown:block-end']);
    g.api.focusCell(dataKey('r6')!, 'n');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(calls).toEqual(['open:shown:block-end', 'close:shown:block-end']);
    expect(tip.hidden).toBe(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(tip.hidden).toBe(true);
  });

  it('a throw is reported and the bubble still hides', () => {
    const reported: unknown[] = [];
    const had = (window as unknown as { reportError?: unknown }).reportError;
    (window as unknown as { reportError: (e: unknown) => void }).reportError = (e) => reported.push(e);
    try {
      const { tip, cell, over, g } = make({ tooltips: { delayMs: 0, animate: (_el, phase) => { if (phase === 'close') throw new Error('anim broke'); } } }, false, [tooltips()]);
      over(cell(4, 'n'));
      g.api.focusCell(dataKey('r4')!, 'n');
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(tip.hidden).toBe(true);
      expect((reported[0] as Error).message).toBe('anim broke');
    } finally {
      (window as unknown as { reportError?: unknown }).reportError = had;
    }
  });

  it('under reduced motion told so (reduced: true, the app decides: owner 2026-11-14); never with motion: false', () => {
    const animate = vi.fn();
    const mm = vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    (window as unknown as { matchMedia: unknown }).matchMedia = mm;
    try {
      const a = make({ tooltips: { delayMs: 0, animate } }, false, [tooltips()]);
      a.over(a.cell(4, 'n'));
      expect(a.tip.hidden).toBe(false);
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0]![1]).toBe('open');
      expect(animate.mock.calls[0]![2]).toEqual({ side: 'block-end', tone: 'info', dir: 'ltr', reduced: true, shape: null });
    } finally {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    // Another animation for the second grid: showing its tooltip hides the first one's (one in a page), which is told
    // its closing now that motion is welcome again.
    const other = vi.fn();
    const b = make({ tooltips: { delayMs: 0, animate: other }, motion: false }, false, [tooltips()]);
    b.over(b.cell(4, 'n'));
    expect(b.tip.hidden).toBe(false);
    expect(other).not.toHaveBeenCalled();
  });
});

describe('one tooltip on screen in a page (with tooltips())', () => {
  it('a second grid\'s tooltip hides the first\'s', () => {
    const a = make({ tooltips: { delayMs: 0 } }, false, [tooltips()]);
    const b = make({ tooltips: { delayMs: 0 } }, false, [tooltips()]);
    a.over(a.cell(4, 'n'));
    expect(a.tip.hidden).toBe(false);
    b.over(b.cell(5, 'n'));
    expect(b.tip.hidden).toBe(false);
    expect(a.tip.hidden).toBe(true);
    expect(a.cell(4, 'n').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('without tooltips(): its options told, the base\'s behaviour kept', () => {
  it('header, animate or placement: one missing-feature warning; the button shows the header\'s tooltip; animate never called', () => {
    const animate = vi.fn();
    const { tip, head, cell, over, problems } = make({ tooltips: { header: true, animate, placement: 'top', delayMs: 0 } }, true);
    expect(problems().filter((p) => p.code === 'missing-feature' && p.detail === 'tooltips')).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'settings.tooltips', detail: 'tooltips' }]);
    over(head('n').querySelector('.dzg-fbtn')!);
    expect(tip.textContent).toBe('How many');
    over(cell(4, 'n'));
    expect(tip.getAttribute('data-side')).toBe('block-end');
    expect(animate).not.toHaveBeenCalled();
    expect(tip.hasAttribute('data-animation')).toBe(false);
  });

  it('none of them: no warning', () => {
    const { problems } = make({ tooltips: { delayMs: 0, tone: 'warning', reducedMotion: 'fade' } });
    expect(problems().filter((p) => p.detail === 'tooltips')).toEqual([]);
  });

  it('reducedMotion fade: said on the bubble for the sheet (opacity only under reduced motion)', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0, reducedMotion: 'fade' } });
    over(cell(4, 'n'));
    expect(tip.getAttribute('data-reduced')).toBe('fade');
  });
});

describe('placement (with tooltips())', () => {
  // A cell in the middle of the window (jsdom: 1024 × 768).
  const mid = (el: HTMLElement) => {
    el.getBoundingClientRect = () => ({ left: 400, right: 500, top: 300, bottom: 330, width: 100, height: 30, x: 400, y: 300, toJSON: () => null });
    return el;
  };
  const sized = (tip: HTMLElement) => {
    Object.defineProperty(tip, 'offsetWidth', { configurable: true, get: () => 120 });
    Object.defineProperty(tip, 'offsetHeight', { configurable: true, get: () => 24 });
  };

  it('auto: below, at the cell\'s start (1.11\'s place)', () => {
    const { tip, cell, over } = make({ tooltips: { delayMs: 0 } }, false, [tooltips()]);
    sized(tip);
    over(mid(cell(4, 'n')));
    expect(tip.getAttribute('data-side')).toBe('block-end');
    expect(tip.style.getPropertyValue('inset-inline-start')).toBe('400px');
    expect(tip.style.getPropertyValue('inset-block-start')).toBe('334px');
  });

  it('the grid\'s placement: top, centred; right in Arabic is the line\'s start', () => {
    const { tip, cell, over, g } = make({ tooltips: { delayMs: 0, placement: 'top' } }, false, [tooltips()]);
    sized(tip);
    over(mid(cell(4, 'n')));
    // Above: 300 - 4 - 24; centred: 450 - 60.
    expect(tip.getAttribute('data-side')).toBe('block-start');
    expect(tip.style.getPropertyValue('inset-block-start')).toBe('272px');
    expect(tip.style.getPropertyValue('inset-inline-start')).toBe('390px');
    g.update({ direction: 'rtl', tooltips: { delayMs: 0, placement: 'right-start' } });
    over(mid(cell(6, 'n')));
    // Right of the cell (its left in logical terms is the line's start in Arabic): inline-start, aligned with its top.
    expect(tip.getAttribute('data-side')).toBe('inline-start');
    expect(tip.style.getPropertyValue('inset-block-start')).toBe('300px');
    // From the window's right edge: the cell's right edge is 1024 - 500 = 524 from it; before it, 524 - 4 - 120.
    expect(tip.style.getPropertyValue('inset-inline-start')).toBe('400px');
  });

  it('a column\'s placement wins over the grid\'s; flip: false keeps the side at the window\'s edge', () => {
    const { tip, cell, over, g } = make({ tooltips: { delayMs: 0, placement: 'top' } }, false, [tooltips()]);
    sized(tip);
    const top = (el: HTMLElement) => {
      el.getBoundingClientRect = () => ({ left: 400, right: 500, top: 0, bottom: 20, width: 100, height: 20, x: 400, y: 0, toJSON: () => null });
      return el;
    };
    over(mid(cell(4, 'p')));
    expect(tip.getAttribute('data-side')).toBe('inline-end');
    over(top(cell(4, 'n')));
    expect(tip.getAttribute('data-side')).toBe('block-end');
    g.update({ tooltips: { delayMs: 0, placement: 'top', flip: false } });
    over(top(cell(6, 'n')));
    expect(tip.getAttribute('data-side')).toBe('block-start');
  });
});
