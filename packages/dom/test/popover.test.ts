// Popovers, the bubble that stays (docs/behaviors/tooltips-popovers.md 10–15): `popover(trigger, options)` from
// @dzgrid/dom/popover. Expectations written by hand; focus and placement in real browsers: scripts/browser-1-12.mjs.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { popover, type PopoverHandle, type PopoverCloseReason } from '../src/popover.js';

let handles: PopoverHandle[] = [];
afterEach(() => {
  for (const h of handles) h.destroy();
  handles = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const use = (h: PopoverHandle) => (handles.push(h), h);
function trigger(label = 'Details') {
  const b = document.body.appendChild(document.createElement('button'));
  b.textContent = label;
  return b;
}
/** A small form: a field and a button. */
const form = () => {
  const f = document.createElement('div');
  f.innerHTML = '<label>Note <input class="note"></label><button class="ok">OK</button>';
  return f;
};
const press = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
const escape = (el: Element) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

describe('popover(trigger, options)', () => {
  it('the trigger says it: haspopup dialog, expanded false; a click opens it: expanded, controls, role dialog named by the trigger', () => {
    const t = trigger();
    const h = use(popover(t, { content: 'Hello' }));
    expect(t.getAttribute('aria-haspopup')).toBe('dialog');
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(t.hasAttribute('aria-controls')).toBe(false);
    t.click();
    const el = h.el!;
    expect(h.isOpen).toBe(true);
    expect(el.hidden).toBe(false);
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.textContent).toBe('Hello');
    expect(t.getAttribute('aria-expanded')).toBe('true');
    expect(t.getAttribute('aria-controls')).toBe(el.id);
    expect(el.getAttribute('aria-labelledby')).toBe(t.id);
    expect(el.classList.contains('dzg-popover')).toBe(true);
    // A second click closes it.
    t.click();
    expect(h.isOpen).toBe(false);
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(el.id)).toBeNull();
  });

  it('a label names it instead', () => {
    const t = trigger();
    const h = use(popover(t, { content: 'x', label: 'Row details' }));
    h.open();
    expect(h.el!.getAttribute('aria-label')).toBe('Row details');
    expect(h.el!.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('focus: into its first control (an autofocus first), back to the trigger on Escape', () => {
    const t = trigger();
    t.focus();
    const h = use(popover(t, { content: form }));
    t.click();
    expect(document.activeElement).toBe(h.el!.querySelector('.note'));
    const el = h.el!;
    escape(document.activeElement!);
    expect(h.isOpen).toBe(false);
    expect(document.activeElement).toBe(t);
    expect(el.isConnected).toBe(false);
    const auto = () => {
      const f = form();
      f.querySelector('.ok')!.setAttribute('autofocus', '');
      return f;
    };
    h.update({ content: auto });
    h.open();
    expect(document.activeElement).toBe(h.el!.querySelector('.ok'));
  });

  it('nothing to focus: the focus stays on the trigger; Escape there closes it', () => {
    const t = trigger();
    t.focus();
    const h = use(popover(t, { content: 'Just words' }));
    t.click();
    expect(document.activeElement).toBe(t);
    escape(t);
    expect(h.isOpen).toBe(false);
  });

  it('an Escape a control inside already took (a grid\'s own popup) does not close it', () => {
    const t = trigger();
    const h = use(popover(t, { content: form }));
    h.open();
    const input = h.el!.querySelector('.note')!;
    input.addEventListener('keydown', (e) => e.preventDefault());
    escape(input);
    expect(h.isOpen).toBe(true);
  });

  it('a press outside closes it, the focus left where the press puts it; a press inside does not', () => {
    const t = trigger();
    const other = trigger('Other');
    const reasons: PopoverCloseReason[] = [];
    const h = use(popover(t, { content: form, onClose: (r) => reasons.push(r) }));
    h.open();
    press(h.el!.querySelector('.ok')!);
    expect(h.isOpen).toBe(true);
    press(other);
    other.focus();
    expect(h.isOpen).toBe(false);
    expect(document.activeElement).toBe(other);
    expect(reasons).toEqual(['outside']);
  });

  it('the focus leaving it (Tab past its last control) closes it, the focus where it went', () => {
    const t = trigger();
    const after = trigger('After');
    const reasons: PopoverCloseReason[] = [];
    const h = use(popover(t, { content: form, onClose: (r) => reasons.push(r) }));
    h.open();
    const ok = h.el!.querySelector<HTMLElement>('.ok')!;
    ok.focus();
    after.focus();
    expect(h.isOpen).toBe(false);
    expect(document.activeElement).toBe(after);
    expect(reasons).toEqual(['focus']);
  });

  it('Tab on its last control: on to what follows its trigger in the page, closed; Shift+Tab on its first: back to the trigger', () => {
    const t = trigger();
    const after = trigger('After');
    const reasons: PopoverCloseReason[] = [];
    const h = use(popover(t, { content: form, onClose: (r) => reasons.push(r) }));
    h.open();
    const ok = h.el!.querySelector<HTMLElement>('.ok')!;
    ok.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ok.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(after);
    expect(h.isOpen).toBe(false);
    h.open();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    h.el!.querySelector('.note')!.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t);
    expect(h.isOpen).toBe(false);
    expect(reasons).toEqual(['focus', 'focus']);
  });

  it('by code: open(), close() (the focus back to the trigger when it was inside), toggle(); openOn manual ignores clicks', () => {
    const t = trigger();
    const opened = vi.fn();
    const h = use(popover(t, { content: form, openOn: 'manual', onOpen: opened }));
    t.click();
    expect(h.isOpen).toBe(false);
    h.toggle();
    expect(h.isOpen).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    h.close();
    expect(h.isOpen).toBe(false);
    expect(document.activeElement).toBe(t);
  });

  it('one open in a group; another group stays; a popover opened inside another keeps it', () => {
    const a = trigger('A');
    const b = trigger('B');
    const c = trigger('C');
    const pa = use(popover(a, { content: 'a' }));
    const pb = use(popover(b, { content: 'b' }));
    const pc = use(popover(c, { content: 'c', group: 'side' }));
    pa.open();
    pc.open();
    pb.open();
    expect([pa.isOpen, pb.isOpen, pc.isOpen]).toEqual([false, true, true]);
    // Nested: a trigger inside pb's bubble.
    const inner = document.createElement('button');
    pb.el!.append(inner);
    const pi = use(popover(inner, { content: form }));
    pi.open();
    expect([pb.isOpen, pi.isOpen]).toEqual([true, true]);
    // A press in the inner bubble is not outside the outer one; the focus moving into it neither.
    press(pi.el!.querySelector('.ok')!);
    expect(pb.isOpen).toBe(true);
    // Closing the outer closes the inner.
    pb.close();
    expect(pi.isOpen).toBe(false);
  });

  it('a function content is drawn at each opening, its gone() at close; cleaned HTML; tone and animation marks', () => {
    const t = trigger();
    const gone = vi.fn();
    let n = 0;
    const h = use(popover(t, { content: () => ({ node: Object.assign(document.createElement('p'), { textContent: `#${++n}` }), gone }), tone: 'danger', animation: 'slide' }));
    h.open();
    expect(h.el!.firstElementChild!.innerHTML).toBe('<p>#1</p>');
    expect(h.el!.getAttribute('data-tone')).toBe('danger');
    expect(h.el!.getAttribute('data-animation')).toBe('slide');
    h.close();
    expect(gone).toHaveBeenCalledTimes(1);
    h.open();
    expect(h.el!.firstElementChild!.innerHTML).toBe('<p>#2</p>');
    h.close();
    h.update({ content: { html: '<b>b</b><img src=x onerror=alert(1)>' } });
    h.open();
    expect(h.el!.firstElementChild!.innerHTML).toBe('<b>b</b>');
  });

  it('follows its trigger on scroll; closes when the trigger leaves the page, the window, or its grid row is recycled', async () => {
    const raf: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => (raf.push(f), raf.length));
    const flush = () => raf.splice(0).forEach((f) => f(0));
    const row = document.body.appendChild(document.createElement('div'));
    row.setAttribute('aria-rowindex', '5');
    const t = row.appendChild(document.createElement('button'));
    let top = 100;
    t.getBoundingClientRect = () => ({ left: 100, right: 140, top, bottom: top + 20, width: 40, height: 20, x: 100, y: top, toJSON: () => null });
    const reasons: PopoverCloseReason[] = [];
    const h = use(popover(t, { content: 'x', onClose: (r) => reasons.push(r) }));
    h.open();
    expect(h.el!.style.getPropertyValue('inset-block-start')).toBe('124px');
    top = 200;
    document.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.el!.style.getPropertyValue('inset-block-start')).toBe('224px');
    // Its row now shows another row.
    row.setAttribute('aria-rowindex', '9');
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(h.isOpen).toBe(false);
    row.setAttribute('aria-rowindex', '5');
    h.open();
    top = -100;
    document.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.isOpen).toBe(false);
    top = 100;
    h.open();
    t.remove();
    document.dispatchEvent(new Event('scroll'));
    flush();
    expect(h.isOpen).toBe(false);
    expect(reasons).toEqual(['gone', 'gone', 'gone']);
  });

  it('the app\'s animation: the bubble stays until the close settles; destroy() ends it at once', async () => {
    const t = trigger();
    let finish!: () => void;
    const animate = vi.fn((_el: HTMLElement, phase: 'open' | 'close') => (phase === 'close' ? new Promise<void>((ok) => (finish = ok)) : undefined));
    const h = popover(t, { content: 'x', animate });
    h.open();
    const el = h.el!;
    h.close();
    expect(el.isConnected).toBe(true);
    expect(el.getAttribute('data-animation')).toBe('custom');
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.isConnected).toBe(false);
    h.open();
    const el2 = h.el!;
    h.destroy();
    expect(el2.isConnected).toBe(false);
    expect(t.hasAttribute('aria-expanded')).toBe(false);
    t.click();
    expect(h.isOpen).toBe(false);
  });

  it('its content in a body that scrolls (a tall content capped, the arrow outside it never clipped)', () => {
    const t = trigger();
    const h = use(popover(t, { content: 'Words' }));
    h.open();
    const body = h.el!.firstElementChild as HTMLElement;
    expect(body.className).toBe('dzg-popover-body');
    expect(body.textContent).toBe('Words');
  });

  it('closes when its trigger is scrolled out of a scrolling container (clipped there, not only out of the window)', () => {
    const raf: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => (raf.push(f), raf.length));
    const box = document.body.appendChild(document.createElement('div'));
    box.style.overflow = 'auto';
    box.getBoundingClientRect = () => ({ left: 0, right: 300, top: 100, bottom: 200, width: 300, height: 100, x: 0, y: 100, toJSON: () => null });
    const t = box.appendChild(document.createElement('button'));
    let top = 120;
    t.getBoundingClientRect = () => ({ left: 10, right: 50, top, bottom: top + 20, width: 40, height: 20, x: 10, y: top, toJSON: () => null });
    const reasons: PopoverCloseReason[] = [];
    const h = use(popover(t, { content: 'x', onClose: (r) => reasons.push(r) }));
    h.open();
    top = 160;
    box.dispatchEvent(new Event('scroll'));
    raf.splice(0).forEach((f) => f(0));
    expect(h.isOpen).toBe(true);
    // Still in the window, but past the container's bottom edge.
    top = 230;
    box.dispatchEvent(new Event('scroll'));
    raf.splice(0).forEach((f) => f(0));
    expect(h.isOpen).toBe(false);
    expect(reasons).toEqual(['gone']);
  });

  it('placed again when its content changes size (a ResizeObserver on the bubble)', () => {
    const raf: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => (raf.push(f), raf.length));
    let seen: ResizeObserverCallback | null = null;
    const RO = vi.fn(function (this: unknown, cb: ResizeObserverCallback) { seen = cb; return { observe() {}, disconnect() {}, unobserve() {} }; });
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
    try {
      const t = trigger();
      t.getBoundingClientRect = () => ({ left: 100, right: 140, top: 100, bottom: 120, width: 40, height: 20, x: 100, y: 100, toJSON: () => null });
      const h = use(popover(t, { content: 'x', placement: 'top' }));
      h.open();
      Object.defineProperty(h.el!, 'offsetHeight', { configurable: true, get: () => 60 });
      seen!([], {} as ResizeObserver); // the observer is not read by the callback
      raf.splice(0).forEach((f) => f(0));
      // Above: 100 - 4 - 60.
      expect(h.el!.style.getPropertyValue('inset-block-start')).toBe('36px');
    } finally {
      delete (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    }
  });
});
