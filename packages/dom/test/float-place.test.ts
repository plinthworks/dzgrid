// Where a bubble goes (docs/behaviors/tooltips-popovers.md 4): the side asked, the opposite one at an edge, kept in the
// window along the other axis, the arrow at the anchor's middle 12 px inside; logical in both directions. Expectations
// worked out by hand from the window (800 × 600), the anchor and the bubble's size.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { TooltipPlacement } from '@dzgrid/core';
import { place, type TipSide } from '../src/render/tooltip.js';
import { placementOf } from '../src/dir.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

type Box = { left: number; right: number; top: number; bottom: number };
function setup(anchorBox: Box, size = { w: 100, h: 30 }, margin = 0) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
  const el = document.body.appendChild(document.createElement('div'));
  el.style.marginTop = `${margin}px`;
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => size.w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => size.h });
  const anchor = document.body.appendChild(document.createElement('button'));
  anchor.getBoundingClientRect = () => ({ ...anchorBox, width: anchorBox.right - anchorBox.left, height: anchorBox.bottom - anchorBox.top, x: anchorBox.left, y: anchorBox.top, toJSON: () => null });
  const at = (side: TipSide, dir: 'ltr' | 'rtl' = 'ltr', center = true, flip = true) => {
    const used = place(el, anchor, dir, side, center ? 0 : -1, flip);
    return { used, top: el.style.getPropertyValue('inset-block-start'), start: el.style.getPropertyValue('inset-inline-start'), arrow: el.style.getPropertyValue('--dzg-tip-at'), side: el.dataset['side'] };
  };
  return { el, at };
}

// An anchor in the middle of the window: 380–420 × 280–300.
const MID = { left: 380, right: 420, top: 280, bottom: 300 };

describe('place: each side, with room', () => {
  it('block-end: 4 px under the anchor, centred on it, the arrow at its middle', () => {
    const { at } = setup(MID);
    // top = 300 + 4; start = 400 - 50; arrow = 400 - 350.
    expect(at('block-end')).toEqual({ used: 'block-end', top: '304px', start: '350px', arrow: '50px', side: 'block-end' });
  });

  it('block-start: its bottom 4 px over the anchor', () => {
    const { at } = setup(MID);
    // top = 280 - 4 - 30.
    expect(at('block-start')).toMatchObject({ used: 'block-start', top: '246px', start: '350px' });
  });

  it('inline-end: 4 px after the anchor (to its right in left to right), centred on its block middle', () => {
    const { at } = setup(MID);
    // start = 420 + 4; top = 290 - 15; arrow along the block axis = 290 - 275.
    expect(at('inline-end')).toEqual({ used: 'inline-end', top: '275px', start: '424px', arrow: '15px', side: 'inline-end' });
  });

  it('inline-start: its end 4 px before the anchor', () => {
    const { at } = setup(MID);
    // start = 380 - 4 - 100.
    expect(at('inline-start')).toMatchObject({ used: 'inline-start', start: '276px' });
  });

  it('right to left: inline-end is toward the left, measured from the window\'s right edge', () => {
    const { at } = setup(MID);
    // The anchor's logical start = 800 - 420 = 380, end = 800 - 380 = 420: after it, 424 from the right edge (its left).
    expect(at('inline-end', 'rtl')).toMatchObject({ used: 'inline-end', start: '424px' });
    // block-end centred: logical middle 400 → start 350 from the right edge.
    expect(at('block-end', 'rtl')).toMatchObject({ start: '350px', arrow: '50px' });
  });

  it('the margin (the arrow\'s size, variables.css) is the gap too, and the written block inset gives it back', () => {
    const { at } = setup(MID, { w: 100, h: 30 }, 6);
    // block-end: the box's top at 300 + 4 + 6 = 310, written 6 less (the margin pushes it down).
    expect(at('block-end').top).toBe('304px');
    // block-start: its bottom at 280 - 10 → top 240, written 234.
    expect(at('block-start').top).toBe('234px');
    // inline-end: start 420 + 10; top 275 written 269.
    expect(at('inline-end')).toMatchObject({ start: '430px', top: '269px' });
  });
});

describe('place: flips at each edge, and only when the other side has room', () => {
  it('bottom edge: block-end flips to block-start', () => {
    const { at } = setup({ left: 380, right: 420, top: 560, bottom: 590 });
    expect(at('block-end')).toMatchObject({ used: 'block-start', side: 'block-start', top: '526px' });
  });

  it('top edge: block-start flips to block-end', () => {
    const { at } = setup({ left: 380, right: 420, top: 10, bottom: 30 });
    expect(at('block-start')).toMatchObject({ used: 'block-end', top: '34px' });
  });

  it('end edge: inline-end flips to inline-start (the right in left to right)', () => {
    const { at } = setup({ left: 720, right: 760, top: 280, bottom: 300 });
    expect(at('inline-end')).toMatchObject({ used: 'inline-start', start: '616px' });
  });

  it('start edge: inline-start flips to inline-end', () => {
    const { at } = setup({ left: 20, right: 60, top: 280, bottom: 300 });
    expect(at('inline-start')).toMatchObject({ used: 'inline-end', start: '64px' });
  });

  it('right to left: the end edge is the left one', () => {
    // Anchor at the window's left: logical end = 800 - 20 = 780; no room after it, room before.
    const { at } = setup({ left: 20, right: 60, top: 280, bottom: 300 });
    expect(at('inline-end', 'rtl')).toMatchObject({ used: 'inline-start' });
  });

  it('no room on either side: stays on the side asked', () => {
    const { at } = setup({ left: 380, right: 420, top: 20, bottom: 580 });
    expect(at('block-end').used).toBe('block-end');
    expect(at('block-start').used).toBe('block-start');
  });
});

describe('place: kept in the window along the other axis, the arrow 12 px inside', () => {
  it('near the start edge: slid to 0, the arrow still over the anchor', () => {
    const { at } = setup({ left: 0, right: 20, top: 280, bottom: 300 });
    // centred would start at -40: held at 0; the anchor's middle at 10 → arrow clamped to 12.
    expect(at('block-end')).toMatchObject({ start: '0px', arrow: '12px' });
  });

  it('near the end edge: slid back to 700', () => {
    const { at } = setup({ left: 770, right: 790, top: 280, bottom: 300 });
    // middle 780; start held at 800 - 100; arrow 80.
    expect(at('block-end')).toMatchObject({ start: '700px', arrow: '80px' });
  });

  it('a wide anchor: the arrow at most 12 px from the bubble\'s end', () => {
    const { at } = setup({ left: 10, right: 790, top: 280, bottom: 300 });
    // centred: start 350; anchor's middle 400 → 50 (inside).
    expect(at('block-end').arrow).toBe('50px');
    // aligned at the start (the grid's tooltip): start 10, middle 400 → 390, clamped to 100 - 12.
    expect(at('block-end', 'ltr', false)).toMatchObject({ start: '10px', arrow: '88px' });
  });

  it('inline sides: held inside the window\'s height', () => {
    const { at } = setup({ left: 380, right: 420, top: 590, bottom: 600 });
    // centred would put its top at 580: held at 600 - 30.
    expect(at('inline-end')).toMatchObject({ top: '570px', arrow: '18px' });
  });
});

describe('placementOf: the 12 placements and auto, left and right by the direction', () => {
  const cases: [TooltipPlacement, ReturnType<typeof placementOf>, ReturnType<typeof placementOf>][] = [
    // placement, left to right, right to left
    ['top', ['block-start', 0], ['block-start', 0]],
    ['top-start', ['block-start', -1], ['block-start', -1]],
    ['top-end', ['block-start', 1], ['block-start', 1]],
    ['bottom', ['block-end', 0], ['block-end', 0]],
    ['bottom-start', ['block-end', -1], ['block-end', -1]],
    ['bottom-end', ['block-end', 1], ['block-end', 1]],
    ['start', ['inline-start', 0], ['inline-start', 0]],
    ['end-start', ['inline-end', -1], ['inline-end', -1]],
    ['left', ['inline-start', 0], ['inline-end', 0]],
    ['left-start', ['inline-start', -1], ['inline-end', -1]],
    ['right', ['inline-end', 0], ['inline-start', 0]],
    ['right-end', ['inline-end', 1], ['inline-start', 1]],
  ];
  for (const [p, ltr, rtl] of cases) {
    it(p, () => {
      expect(placementOf(p, 'ltr', 'bottom')).toEqual(ltr);
      expect(placementOf(p, 'rtl', 'bottom')).toEqual(rtl);
    });
  }
  it('auto and none: the default given', () => {
    expect(placementOf('auto', 'ltr', 'bottom-start')).toEqual(['block-end', -1]);
    expect(placementOf(undefined, 'rtl', 'bottom')).toEqual(['block-end', 0]);
  });
});

describe('place: alignment and flip off', () => {
  it('-end: the bubble\'s end on the anchor\'s end', () => {
    const { el, anchor } = (() => {
      const s = setup(MID);
      return { el: s.el, anchor: document.querySelector('button')! };
    })();
    place(el, anchor, 'ltr', 'block-end', 1);
    // anchor end 420, bubble 100 wide: start 320.
    expect(el.style.getPropertyValue('inset-inline-start')).toBe('320px');
    expect(el.style.getPropertyValue('--dzg-tip-at')).toBe('80px');
  });

  it('flip: false keeps the side asked even at the edge', () => {
    const { at } = setup({ left: 380, right: 420, top: 560, bottom: 590 });
    expect(at('block-end', 'ltr', true, false)).toMatchObject({ used: 'block-end', top: '594px' });
  });
});
