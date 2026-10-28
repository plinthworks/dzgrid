// The popup host's new placements (Phase 6 step 3, step03-plan §1 seam b, column-menu.md 7): `from` (placed by another
// element, or at a point, while the anchor still owns its life), `align: 'end'` (end edges aligned: the right edges left
// to right, the left edges right to left), above when there is no room below, and `back` (where the focus goes on close
// instead of the anchor). Boxes by hand: a window of 1 000 × 800, a popup of 200 × 100.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PopupHost, type PopupOptions } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';

/** jsdom has no layout: a fixed box. */
const boxOf = (el: Element, r: { left: number; top: number; width: number; height: number }) => {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect);
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** `bar`: a vertical scrollbar that wide (innerWidth counts it, the root's clientWidth does not). */
function host(dir: 'ltr' | 'rtl' = 'ltr', bar = 0) {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000 - bar);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
  const root = document.createElement('div');
  const anchor = document.createElement('div');
  anchor.tabIndex = -1;
  const button = document.createElement('button');
  anchor.append(button);
  document.body.append(root, anchor);
  const scope = new Scope();
  // The header cell from 300 to 500, 40 high; its button the last 24 px of it.
  boxOf(anchor, { left: 300, top: 100, width: 200, height: 40 });
  boxOf(button, dir === 'ltr' ? { left: 476, top: 108, width: 24, height: 24 } : { left: 300, top: 108, width: 24, height: 24 });
  const popups = new PopupHost(document, root, scope, () => dir);
  const open = (o: Omit<PopupOptions, 'placement'>, top?: number) => {
    const content = document.createElement('div');
    const p = popups.open(anchor, content, { placement: 'block-end', ...o });
    // The popup's own box (200 × 100), then placed again.
    boxOf(p.el, { left: 0, top: top ?? 0, width: 200, height: 100 });
    p.reposition();
    return p;
  };
  const at = (p: { el: HTMLElement }) => ({ start: p.el.style.getPropertyValue('inset-inline-start'), top: p.el.style.getPropertyValue('inset-block-start') });
  return { root, anchor, button, scope, popups, open, at };
}

describe('placed by another element, end edges aligned', () => {
  it('left to right: under the button, its right edge on the button\'s right edge', () => {
    const h = host('ltr');
    const p = h.open({ from: h.button, align: 'end' });
    // 500 − 200 = 300 from the left; 108 + 24 + 2 below.
    expect(h.at(p)).toEqual({ start: '300px', top: '134px' });
  });

  it('right to left: its left edge on the button\'s left edge (start measured from the right: 1 000 − 300 − 200)', () => {
    const h = host('rtl');
    const p = h.open({ from: h.button, align: 'end' });
    expect(h.at(p)).toEqual({ start: '500px', top: '134px' });
  });

  it('kept in the window: an end edge too near the start clamps at 0', () => {
    const h = host('ltr');
    boxOf(h.button, { left: 50, top: 108, width: 24, height: 24 });
    const p = h.open({ from: h.button, align: 'end' });
    expect(h.at(p).start).toBe('0px');
  });

  it('above when there is no room below', () => {
    const h = host('ltr');
    boxOf(h.button, { left: 476, top: 750, width: 24, height: 24 });
    const p = h.open({ from: h.button, align: 'end' });
    // 750 − 2 − 100.
    expect(h.at(p).top).toBe('648px');
  });

  it('room neither below nor above (a tall menu, a header halfway down): kept inside the window, its bottom at the window\'s', () => {
    const h = host('ltr');
    boxOf(h.button, { left: 476, top: 60, width: 24, height: 24 });
    const content = document.createElement('div');
    const p = h.popups.open(h.anchor, content, { placement: 'block-end', from: h.button, align: 'end', fit: true });
    // 750 high: 86 + 750 > 800 below, 60 − 2 − 750 < 0 above: 800 − 750.
    boxOf(p.el, { left: 0, top: 0, width: 200, height: 750 });
    p.reposition();
    expect(h.at(p).top).toBe('50px');
  });

  it('the window fit is every popup\'s since the owner\'s look (app-feedback 21; it was the menu\'s only, `fit: true`, review of steps 3–4): a filter popup with no room either way ends at the window\'s end', () => {
    const h = host('ltr');
    boxOf(h.button, { left: 476, top: 60, width: 24, height: 24 });
    const p = h.popups.open(h.anchor, document.createElement('div'), { placement: 'block-end', from: h.button, align: 'end' });
    boxOf(p.el, { left: 0, top: 0, width: 200, height: 750 });
    p.reposition();
    // 800 − 750 (before: 60 + 24 + 2 = 86, its end cut by the window).
    expect(h.at(p).top).toBe('50px');
  });

  it('without `from`: the anchor, start edges aligned, as before', () => {
    const h = host('ltr');
    const p = h.open({});
    expect(h.at(p)).toEqual({ start: '300px', top: '142px' });
  });
});

describe('the window less its scrollbar (review finding 4)', () => {
  it('right to left with a 15 px scrollbar on the left: clamped by the root\'s clientWidth, not innerWidth (8 px clear of the bar)', () => {
    const h = host('rtl', 15);
    // The button at the far left: the popup's end (left) edge would pass the window's; clamped at 985 − 200 − 8.
    boxOf(h.button, { left: 2, top: 108, width: 24, height: 24 });
    expect(h.at(h.open({ from: h.button })).start).toBe('777px');
  });
});

describe('at a point (a right-click)', () => {
  it('its start corner at the point: left to right toward the right, right to left toward the left', () => {
    const l = host('ltr');
    expect(l.at(l.open({ from: { x: 420, y: 120 } }))).toEqual({ start: '420px', top: '122px' });
    document.body.innerHTML = '';
    const r = host('rtl');
    // The start corner is the popup's right corner: 1 000 − 420 from the right.
    expect(r.at(r.open({ from: { x: 420, y: 120 } }))).toEqual({ start: '580px', top: '122px' });
  });

  it('the anchor still owns its life: the popup closes when the anchor leaves', () => {
    const h = host('ltr');
    const p = h.open({ from: { x: 420, y: 120 } });
    h.anchor.remove();
    h.popups.sweep();
    expect(p.open).toBe(false);
  });
});

describe('where the focus goes back', () => {
  it('`back` instead of the anchor: on Escape, on close with the focus inside', () => {
    const h = host('ltr');
    const back = vi.fn();
    const content = document.createElement('div');
    const b = document.createElement('button');
    content.append(b);
    const p = h.popups.open(h.anchor, content, { placement: 'block-end', back });
    b.focus();
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(p.open).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(h.anchor);
  });

  it('a press outside: `back` only when the press focused nothing (one task later)', () => {
    vi.useFakeTimers();
    const h = host('ltr');
    const back = vi.fn();
    const content = document.createElement('div');
    const b = document.createElement('button');
    content.append(b);
    h.popups.open(h.anchor, content, { placement: 'block-end', back });
    b.focus();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(back).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(back).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
