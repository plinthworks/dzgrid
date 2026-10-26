// The combined review of Phase 6 steps 3–4, the chooser's findings: its sentences in a polite status INSIDE the dialog
// while it is open (the grid's live region sits outside the `aria-modal` dialog: some readers skip it), emptied then
// filled 50 ms later, never both; a moved row's box scrolled into view; after a click on a ▲ / ▼ (even a disabled one)
// Tab goes on from that row; the drag's auto-scroll keeps going while the pointer rests near the list's edge.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake } from './support-columns-panel.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  document.body.innerHTML = '';
});

describe('the sentences inside the dialog (finding 1)', () => {
  it('a polite status in the dialog: emptied, then the sentence 50 ms later; the grid\'s live region untouched', () => {
    vi.useFakeTimers();
    const t = cmake();
    t.api().open(t.appButton);
    const region = t.dialog()!.querySelector<HTMLElement>('.dzg-live')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    t.click(t.box('name')!);
    expect(region.textContent).toBe('');
    vi.advanceTimersByTime(50);
    expect(region.textContent).toBe('Name hidden');
    t.box('date')!.focus();
    t.key('ArrowDown', { altKey: true });
    vi.advanceTimersByTime(50);
    expect(region.textContent).toBe('Date: place 4 of 6');
    // Never both: the grid's own region neither asked nor written.
    expect(t.ctx.live.said).not.toMatch(/hidden|place/);
    expect(t.ctx.live.el.textContent).toBe('');
  });
});

describe('a moved row in view (finding 3)', () => {
  it('Alt+ArrowDown and ▼: the box scrolled into view (nearest), focused', () => {
    const into = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = into;
    const t = cmake();
    t.api().open(t.appButton);
    t.box('date')!.focus();
    into.mockClear();
    t.key('ArrowDown', { altKey: true });
    expect(into).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(into.mock.instances.at(-1)).toBe(t.box('date'));
    into.mockClear();
    t.click(t.act('date', 'down')!);
    expect(into.mock.instances.at(-1)).toBe(t.box('date'));
  });
});

describe('Tab after ▲ / ▼ (finding 7)', () => {
  it('a click on a ▲ (here disabled, at the edge): the focus on that row\'s box, Tab goes on to « Show all », Shift+Tab to the search', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.click(t.act('name', 'up')!);
    expect(t.focused()).toBe('name');
    t.key('Tab');
    expect(t.focused()).toBe('all');
    t.click(t.act('name', 'down')!);
    t.key('Tab', { shiftKey: true });
    expect(t.focused()).toBe('search');
  });
});

describe('the drag\'s auto-scroll (finding 8)', () => {
  it('the pointer resting near the bottom edge: the list scrolls frame after frame; release stops it', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.layout();
    const list = t.panel()!.querySelector<HTMLElement>('.dzg-cp-list')!;
    let top = 0;
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => void (top = Math.max(0, Math.min(200, v))) });
    t.pdown(t.act('name', 'drag')!, t.yOf('name'));
    t.pmove(390);
    const after = top;
    t.tick();
    t.tick();
    t.tick();
    expect(top).toBeGreaterThan(after);
    const moved = top;
    t.pup(390);
    while (t.pending()) t.tick();
    t.tick();
    expect(top).toBe(moved);
  });

  it('near the top edge it scrolls up; Escape stops it', () => {
    const t = cmake();
    t.api().open(t.appButton);
    t.layout();
    const list = t.panel()!.querySelector<HTMLElement>('.dzg-cp-list')!;
    let top = 100;
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => void (top = Math.max(0, v)) });
    t.pdown(t.act('amount', 'drag')!, t.yOf('amount'));
    t.pmove(105);
    t.tick();
    t.tick();
    expect(top).toBeLessThan(100);
    t.key('Escape', {}, t.search()!);
    const now = top;
    t.tick();
    t.tick();
    expect(top).toBe(now);
    expect(t.pending()).toBe(0);
  });
});
