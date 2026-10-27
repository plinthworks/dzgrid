// Automatic row height and the page keys (Phase 6 step 9 §2, auto-height.md 12): PageDown / PageUp move by the view's
// height in pixels over measured rows; a row taller than the view: the focus shows its top, PageDown goes past it.
// Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { amake, cleanup, k, measureStub, NOTES, type N } from './support-auto-height.js';

afterEach(cleanup);

const idOf = (key: unknown) => String(key).replace(/^d:\d+:/, '');

function make(rows: N[]) {
  measureStub();
  const t = amake({ rows });
  const focused = () => {
    const f = t.g.kernel.focus;
    return f?.kind === 'cell' ? idOf(f.row) : null;
  };
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const box = (id: string) => ({ y: t.offsetOf(id) - t.top(), end: t.offsetOf(id) + t.heightOf(id) - t.top() });
  return { ...t, focused, press, box };
}

describe('auto height: the page keys', () => {
  it('PageDown over rows of their own heights: the focused row seen whole, PageUp back', () => {
    const t = make(NOTES(200));
    t.g.api.focusCell(k('R0'), 'name');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      t.press('PageDown');
      const f = t.focused()!;
      seen.push(f);
      const b = t.box(f);
      expect(b.y, f).toBeGreaterThanOrEqual(0);
      expect(b.end, f).toBeLessThanOrEqual(320 + 0.5);
    }
    // Always forward.
    const ix = seen.map((s) => +s.slice(1));
    expect(ix).toEqual([...ix].sort((a, b) => a - b));
    expect(new Set(ix).size).toBe(ix.length);
    t.press('PageUp');
    expect(+t.focused()!.slice(1)).toBeLessThan(ix[5]!);
  });

  it('a row taller than the view: the focus shows its top, and PageDown moves past it (never stuck)', () => {
    // R3: 600 characters at 200 px = 27 lines, 549.4 → 550 px, taller than the 320 px view.
    const rows = NOTES(100, () => false).map((r, i) => (i === 3 ? { ...r, note: 'word '.repeat(120) } : r));
    const t = make(rows);
    t.g.api.focusCell(k('R2'), 'name');
    t.press('ArrowDown');
    expect(t.focused()).toBe('R3');
    expect(t.heightOf('R3')).toBe(550);
    expect(t.box('R3').y).toBeGreaterThanOrEqual(0);
    expect(t.box('R3').y).toBeLessThan(320);
    t.press('PageDown');
    expect(+t.focused()!.slice(1)).toBeGreaterThan(3);
    t.press('PageDown');
    t.press('PageUp');
    t.press('PageUp');
    t.press('PageUp');
    expect(+t.focused()!.slice(1)).toBeLessThanOrEqual(3);
  });
});
