// A tooltip on any element of the page (docs/behaviors/tooltips-popovers.md 1–9): `tooltip(el, options)` from
// @dzgrid/dom/tooltip, the grid's own engine. Expectations written by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { tooltip, type TooltipHandle } from '../src/tooltip.js';

let handles: TooltipHandle[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const h of handles) h.destroy();
  handles = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function button(label = 'Delete') {
  const b = document.body.appendChild(document.createElement('button'));
  b.textContent = label;
  return b;
}
const bubble = () => document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float');
const enter = (el: Element, pointerType = 'mouse') => el.dispatchEvent(new PointerEvent('pointerenter', { pointerType }));
const leave = (el: Element, to: Element | null = document.body) => el.dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: to }));
const key = (k: string, target: EventTarget = document) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const use = (h: TooltipHandle) => (handles.push(h), h);

describe('tooltip(el, options)', () => {
  it('hover: after the delay, its words, role tooltip, the anchor described; one <style> added for the layout', () => {
    const b = button();
    use(tooltip(b, { content: 'Removes the row' }));
    enter(b);
    vi.advanceTimersByTime(450);
    expect(bubble()?.hidden ?? true).toBe(true);
    vi.advanceTimersByTime(100);
    const t = bubble()!;
    expect(t.hidden).toBe(false);
    expect(t.textContent).toBe('Removes the row');
    expect(t.getAttribute('role')).toBe('tooltip');
    expect(b.getAttribute('aria-describedby')).toBe(t.id);
    expect(document.querySelectorAll('style[data-dzgrid-float]')).toHaveLength(1);
  });

  it('never on touch alone; delayMs from the options', () => {
    const b = button();
    use(tooltip(b, { content: 'x', delayMs: 100 }));
    enter(b, 'touch');
    vi.advanceTimersByTime(1000);
    expect(bubble()?.hidden ?? true).toBe(true);
    enter(b);
    vi.advanceTimersByTime(100);
    expect(bubble()!.hidden).toBe(false);
  });

  it('a keyboard focus shows it at once; a focus after a press does not; Escape hides it, the focus stays', () => {
    const b = button();
    use(tooltip(b, { content: 'x' }));
    key('Tab');
    b.focus();
    expect(bubble()!.hidden).toBe(false);
    key('Escape', b);
    expect(bubble()!.hidden).toBe(true);
    expect(document.activeElement).toBe(b);
    b.blur();
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.focus();
    expect(bubble()!.hidden).toBe(true);
  });

  it('the pointer may move onto it; it goes after the grace when the pointer leaves both', () => {
    const b = button();
    use(tooltip(b, { content: 'x', delayMs: 0, hideDelayMs: 200 }));
    enter(b);
    const t = bubble()!;
    leave(b, t);
    vi.advanceTimersByTime(500);
    expect(t.hidden).toBe(false);
    t.dispatchEvent(new PointerEvent('pointerleave', { relatedTarget: document.body }));
    vi.advanceTimersByTime(150);
    expect(t.hidden).toBe(false);
    vi.advanceTimersByTime(60);
    expect(t.hidden).toBe(true);
    expect(b.hasAttribute('aria-describedby')).toBe(false);
  });

  it('a press on the anchor, a scroll, or the focus leaving hide it', () => {
    const b = button();
    use(tooltip(b, { content: 'x', delayMs: 0 }));
    enter(b);
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(bubble()!.hidden).toBe(true);
    enter(b);
    document.dispatchEvent(new Event('scroll'));
    expect(bubble()!.hidden).toBe(true);
    key('Tab');
    b.focus();
    expect(bubble()!.hidden).toBe(false);
    b.blur();
    expect(bubble()!.hidden).toBe(true);
  });

  it('one bubble for the page: another anchor takes it, the first loses its description', () => {
    const a = button('A');
    const b = button('B');
    use(tooltip(a, { content: 'about A', delayMs: 0 }));
    use(tooltip(b, { content: 'about B', delayMs: 0, tone: 'warning' }));
    enter(a);
    enter(b);
    expect(document.querySelectorAll('.dzg-tooltip.dzg-float')).toHaveLength(1);
    expect(bubble()!.textContent).toBe('about B');
    expect(bubble()!.getAttribute('data-tone')).toBe('warning');
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(b.getAttribute('aria-describedby')).toBe(bubble()!.id);
  });

  it('tone, animation, placement; the bubble in the anchor\'s direction', () => {
    const b = button();
    const wrap = document.body.appendChild(document.createElement('div'));
    wrap.dir = 'rtl';
    wrap.append(b);
    // In the middle of the window (1024 wide in jsdom), room on both sides.
    b.getBoundingClientRect = () => ({ left: 500, right: 540, top: 300, bottom: 320, width: 40, height: 20, x: 500, y: 300, toJSON: () => null });
    use(tooltip(b, { content: 'x', delayMs: 0, tone: 'success', animation: 'scale', placement: 'end' }));
    enter(b);
    const t = bubble()!;
    expect(t.dir).toBe('rtl');
    // After the anchor in Arabic: to its left, so its inline start (from the right edge) is 1024 - 500 + 4.
    expect(t.style.getPropertyValue('inset-inline-start')).toBe('528px');
    expect(t.getAttribute('data-tone')).toBe('success');
    expect(t.getAttribute('data-animation')).toBe('scale');
    expect(t.getAttribute('data-side')).toBe('inline-end');
  });

  it('content: nodes, a function called at each show (its gone() when the content goes), cleaned HTML', () => {
    const b = button();
    let n = 0;
    const gone = vi.fn();
    const h = use(tooltip(b, { content: () => ({ node: Object.assign(document.createElement('strong'), { textContent: `#${++n}` }), gone }), delayMs: 0 }));
    enter(b);
    expect(bubble()!.innerHTML).toBe('<strong>#1</strong>');
    h.hide();
    expect(gone).toHaveBeenCalledTimes(1);
    expect(bubble()!.innerHTML).toBe('');
    enter(b);
    expect(bubble()!.innerHTML).toBe('<strong>#2</strong>');
    h.update({ content: { html: '<em>e</em><script>x()</script><img src=x>' } });
    expect(gone).toHaveBeenCalledTimes(2);
    expect(bubble()!.innerHTML).toBe('<em>e</em>');
    h.update({ content: 'words' });
    expect(bubble()!.innerHTML).toBe('words');
  });

  it('nothing to say: nothing shown; disabled: nothing shown', () => {
    const b = button();
    const h = use(tooltip(b, { content: '', delayMs: 0 }));
    enter(b);
    expect(bubble()?.hidden ?? true).toBe(true);
    h.update({ content: 'x', disabled: true });
    enter(b);
    expect(bubble()?.hidden ?? true).toBe(true);
  });

  it('show() / hide() / shown; destroy(): hidden, no listener left', () => {
    const b = button();
    const h = use(tooltip(b, { content: 'x' }));
    h.show();
    expect(h.shown).toBe(true);
    h.hide();
    expect(h.shown).toBe(false);
    h.show();
    h.destroy();
    expect(bubble()!.hidden).toBe(true);
    enter(b);
    vi.advanceTimersByTime(1000);
    expect(bubble()!.hidden).toBe(true);
  });

  it('a closing waits for the app\'s animation; a show before it ends keeps the bubble', async () => {
    const b = button();
    let finish!: () => void;
    const animate = vi.fn((_el: HTMLElement, phase: 'open' | 'close') => (phase === 'close' ? new Promise<void>((ok) => (finish = ok)) : undefined));
    const h = use(tooltip(b, { content: 'x', animate }));
    h.show();
    expect(animate.mock.calls.map((c) => c[1])).toEqual(['open']);
    h.hide();
    expect(bubble()!.hidden).toBe(false);
    h.show();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(bubble()!.hidden).toBe(false);
    expect(bubble()!.textContent).toBe('x');
  });

  it('a CSS closing: data-closing while its animations run, still drawn; hidden once they finish; a show meanwhile keeps it', async () => {
    const b = button();
    const h = use(tooltip(b, { content: 'x' }));
    h.show();
    const el = document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float')!;
    let finish!: () => void;
    // A running fade, as the browser reports it (jsdom has no animations).
    el.getAnimations = () => [{ finished: new Promise((ok) => (finish = () => ok(undefined))) }] as never; // a stand-in Animation: only `finished` is read
    h.hide();
    expect(el.hasAttribute('data-closing')).toBe(true);
    expect(el.hidden).toBe(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.hidden).toBe(true);
    expect(el.hasAttribute('data-closing')).toBe(false);
    h.show();
    h.hide();
    h.show();
    expect(el.hasAttribute('data-closing')).toBe(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.hidden).toBe(false);
  });

  it('an app shape: an SVG path stretched over the bubble, data-shape set; given to the animation to morph; not path data: the box kept', () => {
    const b = button();
    const animate = vi.fn();
    const h = use(tooltip(b, { content: 'x', animate, shape: 'M0 0 H100 V80 H60 L50 100 L40 80 H0 Z' }));
    h.show();
    const el = document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float')!;
    const svg = el.firstElementChild!;
    expect(el.hasAttribute('data-shape')).toBe(true);
    expect([svg.localName, svg.getAttribute('class'), svg.getAttribute('viewBox'), svg.getAttribute('preserveAspectRatio'), svg.getAttribute('aria-hidden')]).toEqual(['svg', 'dzg-tip-shape', '0 0 100 100', 'none', 'true']);
    expect(svg.firstElementChild!.getAttribute('d')).toBe('M0 0 H100 V80 H60 L50 100 L40 80 H0 Z');
    expect(el.textContent).toBe('x');
    expect(animate.mock.calls[0]![2].shape).toBe(svg.firstElementChild);
    // Anything but path data: no shape, the box back.
    for (const bad of ['M0 0 url(https://example.invalid/x)', '<script>', 'M0 0;fill:red', 'javascript:x']) {
      h.update({ shape: bad });
      expect(el.hasAttribute('data-shape'), bad).toBe(false);
      expect(el.querySelector('svg'), bad).toBeNull();
    }
  });

  it('shown again while the app\'s closing runs: told open again, its late settling ignored', async () => {
    const b = button();
    let finish!: () => void;
    const phases: string[] = [];
    const animate = (_el: HTMLElement, phase: 'open' | 'close') => {
      phases.push(phase);
      return phase === 'close' ? new Promise<void>((ok) => (finish = ok)) : undefined;
    };
    const h = use(tooltip(b, { content: 'x', animate }));
    h.show();
    h.hide();
    h.show();
    expect(phases).toEqual(['open', 'close', 'open']);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float')!.hidden).toBe(false);
  });
});
