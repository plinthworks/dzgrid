import { describe, it, expect, vi } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { msg } from '../src/messages.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FrameScheduler } from '../src/render/scheduler.js';
import { Scope } from '../src/render/scope.js';
import { inlineScroll, isOnScrollbar, scrollConvention, setInlineScroll, watchDirection } from '../src/dir.js';
import { injectStyles } from '../src/styles.js';

describe('phase 2 steps 4-7 review', () => {
  describe('messages', () => {
    it('take plurals from the bundle’s language, numbers from the context', () => {
      const en = localeCtx({ locale: 'en-US' });
      expect(msg(FR, 'announce.rows', { n: 0 }, en)).toBe('0 ligne');
      expect(msg(AR, 'announce.rows', { n: 2 }, en)).toBe((AR.text['announce.rows'] as { two: string }).two.replace('{n}', '2'));
      expect(msg(FR, 'announce.rows', { n: 1500 }, en)).toBe('1,500 lignes');
    });
    it('pick the French many at a million, other just above, one for 0 and 1.5', () => {
      const fr = localeCtx({ locale: 'fr-FR' });
      const f = new Intl.NumberFormat('fr-FR');
      expect(msg(FR, 'announce.rows', { n: 1e6 }, fr)).toBe(`${f.format(1e6)} de lignes`);
      expect(msg(FR, 'announce.rows', { n: 1000001 }, fr)).toBe(`${f.format(1000001)} lignes`);
      expect(msg(FR, 'announce.rows', { n: 1.5 }, fr)).toBe(`${f.format(1.5)} ligne`);
    });
    it('pick the Arabic zero, many and other', () => {
      const ar = localeCtx({ locale: 'ar-DZ', numerals: 'latn' });
      const forms = AR.text['announce.rows'] as Record<string, string>;
      expect(msg(AR, 'announce.rows', { n: 0 }, ar)).toBe(forms['zero']!.replace('{n}', '0'));
      expect(msg(AR, 'announce.rows', { n: 11 }, ar)).toBe(forms['many']!.replace('{n}', '11'));
      expect(msg(AR, 'announce.rows', { n: 100 }, ar)).toBe(forms['other']!.replace('{n}', '100'));
      expect(msg(AR, 'announce.rows', { n: 3 })).toBe(forms['few']!.replace('{n}', '3'));
    });
    it('keep the French colon from wrapping alone: a narrow no-break space before it', () => {
      for (const v of Object.values(FR.text)) for (const s of typeof v === 'string' ? [v] : Object.values(v))
        expect(s, s).not.toMatch(/ [:;!?]/);
      expect(msg(FR, 'announce.rangeCancelled')).toContain(' :');
    });
  });

  describe('FrameScheduler', () => {
    it('runs the other jobs when one throws, and reports the error once', () => {
      let cb: (() => void) | null = null;
      const s = new FrameScheduler({ requestAnimationFrame: (f) => { cb = () => f(0); return 1; }, cancelAnimationFrame: () => {} });
      const order: string[] = [];
      s.schedule({ read: () => { throw new Error('boom'); }, write: () => order.push('A') });
      s.schedule({ read: () => 1, write: () => order.push('B') });
      expect(() => cb!()).toThrow('boom');
      expect(order).toEqual(['B']);
      cb = null;
      s.schedule({ read: () => 1, write: () => order.push('C') });
      cb!();
      expect(order).toEqual(['B', 'C']);
    });
    it('runs, in sync mode, a job scheduled by a write that then throws', () => {
      const s = new FrameScheduler(null, true);
      const order: string[] = [];
      expect(() => s.schedule({ read: () => 0, write: () => { s.schedule({ read: () => 0, write: () => order.push('inner') }); throw new Error('x'); } })).toThrow('x');
      expect(order).toEqual(['inner']);
    });
    it('stops the batch when a write cancels', () => {
      let cb: (() => void) | null = null;
      const s = new FrameScheduler({ requestAnimationFrame: (f) => { cb = () => f(0); return 1; }, cancelAnimationFrame: () => {} });
      const order: string[] = [];
      s.schedule({ read: () => 0, write: () => { order.push('w1'); s.cancel(); } });
      s.schedule({ read: () => 0, write: () => order.push('w2') });
      cb!();
      expect(order).toEqual(['w1']);
    });
  });

  describe('Scope', () => {
    it('releases in reverse order, survives a throwing cleanup, runs once', async () => {
      const scope = new Scope();
      const order: string[] = [];
      const rejected: unknown[] = [];
      const onRej = (e: unknown) => rejected.push(e);
      process.on('unhandledRejection', onRej);
      scope.add(() => order.push('a'));
      scope.add(() => { throw new Error('b'); });
      scope.add(() => order.push('c'));
      scope.dispose();
      scope.dispose();
      await new Promise((r) => setTimeout(r, 0));
      process.off('unhandledRejection', onRej);
      expect(order).toEqual(['c', 'a']);
      expect(rejected.length).toBe(1);
    });
    it('drops a timer and refuses listeners once disposed', async () => {
      const scope = new Scope();
      const fn = vi.fn();
      scope.timeout(fn, 5);
      scope.dispose();
      await new Promise((r) => setTimeout(r, 20));
      expect(fn).not.toHaveBeenCalled();
      const el = document.createElement('div');
      const click = vi.fn();
      scope.on(el, 'click', click);
      el.click();
      expect(click).not.toHaveBeenCalled();
      expect(scope.listenerCount).toBe(0);
    });
  });

  describe('dir', () => {
    const scroller = (raw: number, max = 100) => {
      const el = document.createElement('div');
      Object.defineProperties(el, { scrollWidth: { value: 200 + max }, clientWidth: { value: 200 }, scrollLeft: { get: () => raw, set: (v: number) => { raw = v; } } });
      return el;
    };
    it('clamps what the browser reports to 0..max (elastic overscroll, zoom)', () => {
      expect(inlineScroll(scroller(4), 'rtl', 'negative')).toBe(0);
      expect(inlineScroll(scroller(-100.4), 'rtl', 'negative')).toBe(100);
      expect(inlineScroll(scroller(-3), 'rtl', 'default')).toBe(100);
      expect(inlineScroll(scroller(-3), 'ltr', 'negative')).toBe(0);
      expect(inlineScroll(scroller(130), 'ltr', 'negative')).toBe(100);
    });
    it('sends Infinity to the end and NaN to the start', () => {
      const el = scroller(0);
      setInlineScroll(el, Number.POSITIVE_INFINITY, 'ltr', 'negative');
      expect(el.scrollLeft).toBe(100);
      setInlineScroll(el, Number.NaN, 'ltr', 'negative');
      expect(el.scrollLeft).toBe(0);
    });
    it('reads the default and reverse conventions, and does not remember a probe that could not scroll', () => {
      const proto = HTMLDivElement.prototype;
      const spy = (start: number, clampNegative: boolean) => {
        let raw = start;
        const restore = [
          Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => 4 }),
          Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 2 }),
          Object.defineProperty(proto, 'scrollLeft', { configurable: true, get: () => raw, set: (v: number) => { raw = clampNegative ? Math.max(0, v) : v; } }),
        ];
        void restore;
        return () => { delete (proto as any).scrollWidth; delete (proto as any).clientWidth; delete (proto as any).scrollLeft; };
      };
      let undo = spy(2, true);
      expect(scrollConvention(document.implementation.createHTMLDocument('a'))).toBe('default');
      undo();
      undo = spy(0, true);
      expect(scrollConvention(document.implementation.createHTMLDocument('b'))).toBe('reverse');
      undo();
      const later = document.implementation.createHTMLDocument('c');
      expect(scrollConvention(later)).toBe('negative'); // no layout: not remembered
      undo = spy(0, true);
      expect(scrollConvention(later)).toBe('reverse');
      undo();
    });
    it('sees a vertical scrollbar only when there is one, not the border', () => {
      const el = document.createElement('div');
      el.style.border = '1px solid';
      el.getBoundingClientRect = () => new DOMRect(0, 0, 202, 102);
      Object.defineProperties(el, { clientWidth: { value: 200 }, clientHeight: { value: 100 }, offsetWidth: { value: 202 }, offsetHeight: { value: 102 }, clientTop: { value: 1 }, clientLeft: { value: 1 } });
      expect(isOnScrollbar({ clientX: 201.5, clientY: 50 }, el)).toBe(false);
      expect(isOnScrollbar({ clientX: 100, clientY: 101.5 }, el)).toBe(false);
    });
    it('follows a host attached later, moved, or inside a shadow root; and CSS direction first', async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      const host = document.createElement('div');
      const scope = new Scope();
      const seen: string[] = [];
      const w = watchDirection(host, (d) => seen.push(d), scope);
      expect(w.dir).toBe('ltr');
      const rtl = document.createElement('div');
      rtl.setAttribute('dir', 'RTL');
      document.body.append(rtl);
      rtl.append(host);
      w.recheck();
      expect(seen).toEqual(['rtl']);
      rtl.removeAttribute('dir');
      await tick();
      expect(seen).toEqual(['rtl', 'ltr']);
      // A dir change anywhere above, even on <html>, is seen.
      document.documentElement.setAttribute('dir', 'rtl');
      await tick();
      expect(seen).toEqual(['rtl', 'ltr', 'rtl']);
      document.documentElement.removeAttribute('dir');
      await tick();
      scope.dispose();
      // Shadow root: the shadow host's dir counts.
      const shadowHost = document.createElement('div');
      document.body.append(shadowHost);
      const root = shadowHost.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      root.append(inner);
      const s2 = new Scope();
      const seen2: string[] = [];
      const w2 = watchDirection(inner, (d) => seen2.push(d), s2);
      expect(w2.dir).toBe('ltr');
      shadowHost.setAttribute('dir', 'rtl');
      await tick();
      expect(seen2).toEqual(['rtl']);
      s2.dispose();
      rtl.remove();
      shadowHost.remove();
    });
  });

  describe('styles', () => {
    it('go into the shadow root a grid lives in, and come back if removed', () => {
      const shadowHost = document.createElement('div');
      document.body.append(shadowHost);
      const root = shadowHost.attachShadow({ mode: 'open' });
      injectStyles(root);
      injectStyles(root);
      expect(root.querySelectorAll('style[data-dzgrid]').length).toBe(1);
      const doc = document.implementation.createHTMLDocument('x');
      injectStyles(doc);
      doc.head.querySelector('style[data-dzgrid]')!.remove();
      injectStyles(doc);
      expect(doc.querySelectorAll('style[data-dzgrid]').length).toBe(1);
      shadowHost.remove();
    });
  });
});
