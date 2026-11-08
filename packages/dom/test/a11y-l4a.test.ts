// Phase 11 L4a, the failures the browser checks found (scripts/browser-a11y.mjs, docs/phase-11-steps/decisions.md « L4a »):
// 1. at 400 % zoom (320 × 256 CSS px) a grid taller than the window moved its focus below the window's edge, the page
//    unmoved (the grid focuses without the browser's scroll, S10): the window now follows the focused cell, never the
//    grid's own scrollers (WCAG 2.4.11);
// 2. on a narrow screen an open side area of the dock covers the rows (dock.md 14): the focus going into the rows hid
//    the focused cell entirely; it now collapses the area to its strip (2.4.11).
// jsdom has no layout: the focused cell's box and the window's height are given by hand. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dock } from '../src/dock.js';
import { EN } from '../src/locales/en.js';
import { EN_DOCK } from '../src/locales/en-dock.js';
import { cleanup, make } from './support-filters.js';

const restore: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const r of restore.splice(0)) r();
});

/** The window `h` px tall; the focused element's box from `top` to `top + 32`, every other box empty. */
function layout(h: number, top: () => number) {
  const was = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const t = this === document.activeElement ? top() : 0;
    return { top: t, bottom: this === document.activeElement ? t + 32 : 0, height: this === document.activeElement ? 32 : 0, width: 0, x: 0, y: t, left: 0, right: 0, toJSON: () => ({}) } as DOMRect;
  });
  const scrolled: unknown[] = [];
  const was2 = window.scrollBy;
  window.scrollBy = ((o: unknown) => void scrolled.push(o)) as typeof window.scrollBy;
  restore.push(() => {
    rect.mockRestore();
    window.scrollBy = was2;
    if (was) Object.defineProperty(window, 'innerHeight', was);
  });
  return scrolled;
}

describe('L4a: the focused cell in the window (400 % zoom)', () => {
  it('a cell focused below the window’s edge scrolls the window by what is missing, the block axis only', () => {
    const t = make({ features: [] });
    let top = 300;
    const scrolled = layout(256, () => top);
    t.vp.querySelector<HTMLElement>('.dzg-row .dzg-cell')!.focus();
    top = 700;
    t.press('ArrowDown');
    expect(document.activeElement?.closest('.dzg-row')?.getAttribute('aria-rowindex')).toBe('3');
    // 700 + 32 − 256: its bottom on the window's edge.
    expect(scrolled).toEqual([{ top: 476 }]);
  });

  it('above the window’s top: scrolled up to its top; inside the window: the window left alone', () => {
    const t = make({ features: [] });
    let top = 100;
    const scrolled = layout(256, () => top);
    t.vp.querySelector<HTMLElement>('.dzg-row .dzg-cell')!.focus();
    t.press('ArrowDown');
    expect(scrolled).toEqual([]);
    top = -40;
    t.press('ArrowDown');
    expect(scrolled).toEqual([{ top: -40 }]);
  });
});

describe('L4a: a dock area covering the rows on a narrow screen', () => {
  const panel = { id: 'notes', title: 'Notes', mount: (h: HTMLElement) => void h.append(document.createElement('button')) };
  const narrow = (on: boolean) => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: on && q.includes('max-width'), media: q })) as never; // jsdom has no matchMedia; only `matches` is read
    restore.push(() => void (window.matchMedia = was));
  };
  const grid = () => {
    const t = make({ features: [dock({ panels: [panel], open: { notes: 'end' } })], settings: { messages: { locale: 'en', text: { ...EN.text, ...EN_DOCK.text } } } });
    const area = t.host.querySelector<HTMLElement>('.dzg > .dzg-dock[data-area=end]')!;
    return { ...t, area };
  };

  it('narrow: the focus going into the rows collapses the end area to its strip', () => {
    narrow(true);
    const t = grid();
    expect(t.area.hasAttribute('data-collapsed')).toBe(false);
    t.vp.querySelector<HTMLElement>('.dzg-row .dzg-cell')!.focus();
    expect(t.area.hasAttribute('data-collapsed')).toBe(true);
    expect(document.activeElement?.classList.contains('dzg-cell')).toBe(true);
  });

  it('wide: the area stays open beside the rows', () => {
    narrow(false);
    const t = grid();
    t.vp.querySelector<HTMLElement>('.dzg-row .dzg-cell')!.focus();
    expect(t.area.hasAttribute('data-collapsed')).toBe(false);
  });
});

describe('L4a (WebKit): the dock measures after the resize, never inside the observer’s delivery', () => {
  it('a resize changes the area’s room on the next task; inside the callback nothing moves (no « ResizeObserver loop »)', async () => {
    const was = (window as { ResizeObserver?: unknown }).ResizeObserver;
    let fire: () => void = () => {};
    (window as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: () => void) { fire = cb; }
      observe() {}
      disconnect() {}
    };
    restore.push(() => { if (was === undefined) delete (window as { ResizeObserver?: unknown }).ResizeObserver; else (window as { ResizeObserver?: unknown }).ResizeObserver = was; });
    const panel = { id: 'notes', title: 'Notes', mount: (h: HTMLElement) => void h.append(document.createElement('button')) };
    const t = make({ features: [dock({ panels: [panel], open: { notes: 'end' } })], settings: { messages: { locale: 'en', text: { ...EN.text, ...EN_DOCK.text } } } });
    const root = t.host.querySelector<HTMLElement>('.dzg')!;
    expect(root.style.getPropertyValue('--dzg-dock-end')).toBe('288px');
    // The grid 400 px wide: the end area's room is 400 − 160 for the rows = 240.
    const rect = vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 500, top: 0, bottom: 500, x: 0, y: 0, left: 0, right: 400, toJSON: () => ({}) } as DOMRect);
    restore.push(() => rect.mockRestore());
    fire();
    expect(root.style.getPropertyValue('--dzg-dock-end')).toBe('288px');
    await new Promise((r) => setTimeout(r, 5));
    expect(root.style.getPropertyValue('--dzg-dock-end')).toBe('240px');
  });
});

describe('L4a: pinned columns in a view too narrow for them (pinned-columns.md, owner A)', () => {
  const columns = [
    { id: 'name', header: 'Name', width: 220, pinned: 'start' as const },
    { id: 'n', header: 'N', width: 130, type: 'number' as const },
    { id: 'd', header: 'D', width: 150 },
    { id: 'id', header: 'Id', width: 110, pinned: 'end' as const },
  ];
  const segs = (host: HTMLElement) => ['start', 'end'].map((s) => host.querySelectorAll(`.dzg-row .dzg-seg-${s} .dzg-cell`).length);
  for (const rtl of [false, true]) {
    it(`${rtl ? 'right to left' : 'left to right'}: 320 px released (no pinned segment), 900 px pinned; the state unchanged`, () => {
      const narrow = make({ features: [], columns: columns as never, inline: 320, settings: rtl ? { direction: 'rtl' } : {} }); // the test's column literal: a widened union
      expect(segs(narrow.host)).toEqual([0, 0]);
      expect([...narrow.host.querySelector('.dzg-row')!.querySelectorAll('.dzg-cell')].map((c) => c.getAttribute('data-col'))).toEqual(['name', 'n', 'd']); // in screen order; « id » is drawn when scrolled to
      expect(narrow.events.some((e) => e.type === 'columnsChanged' || e.type === 'stateChanged')).toBe(false);
      const wide = make({ features: [], columns: columns as never, inline: 900, settings: rtl ? { direction: 'rtl' } : {} }); // as above
      expect(segs(wide.host)).toEqual([wide.host.querySelectorAll('.dzg-row').length, wide.host.querySelectorAll('.dzg-row').length]);
    });
  }
});
