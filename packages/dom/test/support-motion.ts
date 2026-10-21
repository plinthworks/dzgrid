// Shared by the motion tests (step 26): a grid on manual frames (the paint waits for `frame()`, as
// in a browser: the model's events arm the motion before it), jsdom's missing matchMedia stubbed
// per test, a clock the test moves.
import { vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';

export type R = { id: string; n: number; s: string };

/** What the page says about reduced motion, per test. */
export const media = { reduce: false };
export const clock = { now: 1000 };

const listeners = new Set<() => void>();
export function stubMedia(): void {
  listeners.clear();
  window.matchMedia = ((q: string) => ({
    get matches() { return q.includes(': reduce') ? media.reduce : !media.reduce; },
    media: q, onchange: null, dispatchEvent: () => false,
    addEventListener: (_t: string, fn: () => void) => listeners.add(fn), removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
    addListener: (fn: () => void) => listeners.add(fn), removeListener: (fn: () => void) => listeners.delete(fn),
  })) as never;
  vi.spyOn(window.performance, 'now').mockImplementation(() => clock.now);
  // jsdom lays nothing out: every element reads as not rendered (no offset parent), which GSAP
  // answers by moving it out of the page and back to read its transform. In a browser the grid's
  // rows have one (the layer); the popup's content too (the popup).
  vi.spyOn(window.HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.parentElement;
  });
}

/** The page's reduced-motion setting changes: the media queries' listeners are told. */
export function changeMedia(reduce: boolean): void {
  media.reduce = reduce;
  for (const fn of [...listeners]) fn();
}

/** Rows whose `n` swaps each pair (r0 ↔ r1…): a sort by n moves every mounted row by one row. */
export const rowsOf = (count: number): R[] => Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i % 2 ? i - 1 : i + 1, s: `s${i}` }));

export interface Made {
  g: GridInstance<R>;
  host: HTMLElement;
  root: HTMLElement;
  layer: HTMLElement;
  /** Runs the frames waiting (a paint). */
  frame(): void;
  scroll(top: number): void;
  /** The row element showing a key, if mounted. */
  row(key: string): HTMLElement | null;
  cell(key: string, col: string): HTMLElement | null;
  box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] };
}

export function mount(settings: Partial<GridSettings<R>> = {}, o: { rows?: R[]; block?: number } = {}): Made {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'id' }, { id: 'n', type: 'number' }, { id: 's' }];
  const g = createGrid<R>(host, { rows: o.rows ?? rowsOf(60), getRowId: (r) => r.id, columns, messages: { ...EN, text: { ...EN.text, ...EN_PAGINATION.text } }, ...settings }, { geometry, raf });
  const frame = () => {
    for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(clock.now);
  };
  frame();
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const row = (key: string): HTMLElement | null => {
    for (const r of host.querySelectorAll<HTMLElement>('.dzg-row')) if (r.querySelector('[data-col="id"]')?.textContent === key) return r;
    return null;
  };
  return {
    g, host, box, frame,
    root: host.querySelector<HTMLElement>('.dzg')!,
    layer: host.querySelector<HTMLElement>('.dzg-layer')!,
    scroll: (top) => {
      box.scrollTop = top;
      vp.dispatchEvent(new Event('scroll'));
      frame();
    },
    row,
    cell: (key, col) => row(key)?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null,
  };
}

/** The motion props a tween may leave inline: none once finished. */
export const leftovers = (root: ParentNode): string[] =>
  [...root.querySelectorAll<HTMLElement>('.dzg-row, .dzg-cell, .dzg-layer, .dzg-popup, .dzg-overlay')].flatMap((el) =>
    ['transform', 'opacity', '--dzg-flash', 'translate', 'rotate', 'scale'].filter((p) => el.style.getPropertyValue(p) !== '').map((p) => `${el.className}:${p}`).concat(el.classList.contains('dzg-flash') ? [`${el.className}:class`] : []),
  );
