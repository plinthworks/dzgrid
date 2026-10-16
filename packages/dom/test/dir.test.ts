import { describe, it, expect } from 'vitest';
import { inlineScroll, isOnScrollbar, logicalSpan, logicalX, scrollConvention, setInlineScroll, watchDirection, type ScrollConvention } from '../src/dir.js';
import { Scope } from '../src/render/scope.js';

/** An element whose inline scroll behaves like an engine's in RTL: max 100. */
function scroller(conv: ScrollConvention, dir: 'ltr' | 'rtl') {
  const el = document.createElement('div');
  const max = 100;
  let raw = dir === 'rtl' && conv === 'default' ? max : 0;
  Object.defineProperty(el, 'scrollWidth', { value: 300 });
  Object.defineProperty(el, 'clientWidth', { value: 200 });
  Object.defineProperty(el, 'scrollLeft', {
    get: () => raw,
    set: (v: number) => {
      const lo = dir === 'rtl' && conv === 'negative' ? -max : 0;
      const hi = dir === 'rtl' && conv === 'negative' ? 0 : max;
      raw = Math.max(lo, Math.min(hi, v));
    },
  });
  return el;
}

describe('dir', () => {
  for (const conv of ['negative', 'reverse', 'default'] as const) for (const dir of ['ltr', 'rtl'] as const) {
    it(`round-trips the logical inline scroll, ${dir}, ${conv}`, () => {
      const el = scroller(conv, dir);
      expect(inlineScroll(el, dir, conv)).toBe(0);
      for (const x of [0, 1, 37.5, 100]) {
        setInlineScroll(el, x, dir, conv);
        expect(inlineScroll(el, dir, conv)).toBe(x);
      }
      setInlineScroll(el, 150, dir, conv);
      expect(inlineScroll(el, dir, conv)).toBe(100);
      setInlineScroll(el, -20, dir, conv);
      expect(inlineScroll(el, dir, conv)).toBe(0);
    });
  }

  it('reads the convention from a probe once per document', () => {
    // jsdom does no layout: a probe that cannot scroll reports the modern convention.
    expect(scrollConvention(document)).toBe('negative');
    expect(scrollConvention(document)).toBe('negative');
  });

  it('measures pointer and boxes from the start edge', () => {
    const rect = new DOMRect(100, 0, 400, 50);
    expect(logicalX({ clientX: 130 }, rect, 'ltr')).toBe(30);
    expect(logicalX({ clientX: 130 }, rect, 'rtl')).toBe(370);
    const box = new DOMRect(150, 0, 50, 20);
    expect(logicalSpan(box, rect, 'ltr')).toEqual({ start: 50, end: 100 });
    expect(logicalSpan(box, rect, 'rtl')).toEqual({ start: 300, end: 350 });
  });

  it('knows a pointer on the vertical scrollbar, on either side', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 217, 117);
    Object.defineProperties(el, { clientWidth: { value: 200 }, clientHeight: { value: 100 }, offsetWidth: { value: 217 }, offsetHeight: { value: 117 }, clientTop: { value: 1 } });
    el.style.borderWidth = '1px';
    el.style.borderStyle = 'solid';
    // Scrollbar on the end side in LTR (clientLeft = border only).
    Object.defineProperty(el, 'clientLeft', { value: 1, configurable: true });
    expect(isOnScrollbar({ clientX: 210, clientY: 50 }, el)).toBe(true);
    expect(isOnScrollbar({ clientX: 100, clientY: 50 }, el)).toBe(false);
    expect(isOnScrollbar({ clientX: 100, clientY: 110 }, el)).toBe(true);
    // Scrollbar on the start side in RTL: clientLeft counts it.
    Object.defineProperty(el, 'clientLeft', { value: 16, configurable: true });
    expect(isOnScrollbar({ clientX: 5, clientY: 50 }, el)).toBe(true);
    expect(isOnScrollbar({ clientX: 210, clientY: 50 }, el)).toBe(false);
  });

  it('follows a change of an ancestor’s dir, until disposed', async () => {
    const outer = document.createElement('div');
    const host = document.createElement('div');
    outer.append(host);
    document.body.append(outer);
    const scope = new Scope();
    const seen: string[] = [];
    expect(watchDirection(host, (d) => seen.push(d), scope)).toBe('ltr');
    outer.setAttribute('dir', 'rtl');
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['rtl']);
    scope.dispose();
    outer.setAttribute('dir', 'ltr');
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['rtl']);
    outer.remove();
  });
});
