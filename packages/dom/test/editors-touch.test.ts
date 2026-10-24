// Phones and tablets (Phase 5 step 5; step05-plan 22–23; owner S5-O4 A): two quick taps on the same cell open
// the field (in that handler, so the soft keyboard shows); one tap only focuses; a mouse never double-taps; the
// browser's double click after a double tap opens nothing more; no double-tap zoom delay on the body.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ed, cleanup } from './support-editors.js';

afterEach(cleanup);

const up = (el: Element, pointerType = 'touch', x = 10, y = 10) => {
  const ev = new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  el.dispatchEvent(ev);
};
function mk() {
  vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout'] });
  return ed();
}

describe('double tap (S5-O4)', () => {
  it('two touch taps on the same cell within 400 ms open the field, focused', () => {
    const t = mk();
    const c = t.cell('r3', 'n')!;
    up(c);
    vi.advanceTimersByTime(300);
    up(c, 'touch', 14, 13);
    expect(t.field()).not.toBeNull();
    expect(document.activeElement).toBe(t.field());
    expect(t.field()!.value).toBe('3');
    expect(t.focusAt()).toBe('r3/n');
    expect(t.of('editingStarted').map((e) => e.start)).toEqual(['tap']);
  });

  it('more than 400 ms apart, more than 10 px apart, or on another cell: no', () => {
    const t = mk();
    const c = t.cell('r3', 'n')!;
    up(c);
    vi.advanceTimersByTime(450);
    up(c);
    expect(t.field()).toBeNull();
    vi.advanceTimersByTime(1000);
    up(c, 'touch', 10, 10);
    vi.advanceTimersByTime(100);
    up(c, 'touch', 30, 10);
    expect(t.field()).toBeNull();
    vi.advanceTimersByTime(1000);
    up(c);
    vi.advanceTimersByTime(100);
    up(t.cell('r4', 'n')!);
    expect(t.field()).toBeNull();
  });

  it('a mouse’s two quick ups are not a double tap (the double click is its own)', () => {
    const t = mk();
    const c = t.cell('r3', 'n')!;
    up(c, 'mouse');
    vi.advanceTimersByTime(100);
    up(c, 'mouse');
    expect(t.field()).toBeNull();
  });

  it('the browser’s double click after a double tap does not open twice', () => {
    const t = mk();
    const c = t.cell('r3', 'n')!;
    up(c);
    vi.advanceTimersByTime(100);
    up(c);
    t.field()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.host.querySelectorAll('.dzg-field').length).toBe(1);
    expect(t.of('editingStarted').length).toBe(1);
  });

  it('a single tap opens nothing; a tap on a read-only cell twice opens nothing', () => {
    const t = mk();
    up(t.cell('r3', 'n')!);
    expect(t.field()).toBeNull();
    const s = t.cell('r3', 's')!;
    up(s);
    vi.advanceTimersByTime(100);
    up(s);
    expect(t.field()).toBeNull();
  });
});

describe('layout', () => {
  it('no double-tap zoom delay on the body (touch-action: manipulation), in the layout layer', () => {
    ed();
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(css).toMatch(/@layer dzgrid\.layout\{[^]*\.dzg-body[^}]*touch-action:\s*manipulation/);
  });
});
