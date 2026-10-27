// Feedback pass F (docs/phase-6-steps/feedback-plan.md item 7, owner Q4: documented, read-only): `--dzg-row-height` is
// the grid's OUTPUT, written on its root from `rowHeight` / density; the theme reads it. A host stylesheet declaring it
// loses to the inline style and never changes the layout (the virtual rows count on the setting): use `rowHeight`.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

describe('--dzg-row-height is written by the grid', () => {
  it('rowHeight 52: the root carries 52px; a later rowHeight rewrites it', () => {
    const t = make({ settings: { rowHeight: 52 } });
    const root = t.host.querySelector<HTMLElement>('.dzg')!;
    expect(root.style.getPropertyValue('--dzg-row-height')).toBe('52px');
    t.g.update({ rowHeight: 40 } as never);
    expect(root.style.getPropertyValue('--dzg-row-height')).toBe('40px');
  });

  it('a host stylesheet setting it changes nothing: the inline value stays the setting\'s, the rows keep their height', () => {
    const style = document.createElement('style');
    style.textContent = '.dzg { --dzg-row-height: 80px; }';
    document.head.append(style);
    try {
      const t = make({ settings: { rowHeight: 52 } });
      const root = t.host.querySelector<HTMLElement>('.dzg')!;
      expect(root.style.getPropertyValue('--dzg-row-height')).toBe('52px');
      // The rows are placed by the setting: the second row 52 px under the first.
      const rows = [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
      const top = (r: HTMLElement) => Number(/translateY\((\d+)px\)|(\d+)px/.exec(r.style.transform || r.style.insetBlockStart || r.style.top)?.slice(1).find(Boolean));
      expect(top(rows[1]!) - top(rows[0]!)).toBe(52);
    } finally {
      style.remove();
    }
  });
});
