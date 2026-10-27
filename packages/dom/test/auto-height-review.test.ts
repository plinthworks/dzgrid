// Review of b64ba02 (auto row height), findings 2 and 3: the text hash read UTF-16 units of each code point (two emojis
// sharing a high surrogate hashed alike), and the measure's signature missed the wrapped cells' line height
// (`--dzg-wrap-line`) and font size.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { amake, cleanup, measureStub, NOTES } from './support-auto-height.js';

afterEach(cleanup);

describe('auto row height: review of b64ba02', () => {
  it('a row whose emoji changed for another with the same high surrogate is measured again (finding 2)', () => {
    const m = measureStub();
    const rows = NOTES(20).map((r) => ({ ...r, note: '\u{1F600}\u{1F603}' }));
    const t = amake({ rows });
    const n = m.reads.length;
    (t.g.kernel.rows as unknown as { applyTransaction(t: object): void }).applyTransaction({ update: [{ ...rows[1]!, note: '\u{1F603}\u{1F600}' }] });
    expect(m.reads.length - n).toBe(1);
  });

  it('the wrapped cells\' line height or font size changed: measured again on the next paint (finding 3)', () => {
    const m = measureStub();
    const style = { lineHeight: '20px', fontSize: '14px' };
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((e, p) => {
      return (e as Element).hasAttribute?.('data-wrap') ? ({ ...style } as CSSStyleDeclaration) : real(e, p);
    });
    const t = amake();
    const step = (fn: () => void) => {
      const n = m.reads.length;
      fn();
      t.g.api.refresh();
      return m.reads.length - n;
    };
    expect(step(() => {})).toBe(0);
    expect(step(() => (style.lineHeight = '24px'))).toBe(t.mounted().length);
    expect(step(() => (style.fontSize = '16px'))).toBe(t.mounted().length);
    expect(step(() => {})).toBe(0);
  });
});
