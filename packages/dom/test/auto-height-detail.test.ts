// Automatic row height beside detail panels (Phase 6 step 9 §3.1, auto-height.md 8, master-detail.md; owner Q-R1 A):
// the two layouts composed through `layoutFor`, in both feature orders and both destroy orders. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { detailKey } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { autoHeight } from '../src/auto-height.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import type { GridFeature } from '../src/features.js';
import { amake, cleanup, k, measureStub, NOTES } from './support-auto-height.js';

afterEach(cleanup);

const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const panel = () => detail({ part: definePart('detail', { mount(host) { host.textContent = 'panel'; return {}; } }), height: 100 });

function both(order: 'detail-first' | 'auto-first') {
  measureStub();
  const a = autoHeight();
  const x = panel();
  const features: GridFeature[] = order === 'detail-first' ? [x, a] : [a, x];
  const t = amake({ features, settings: { messages: MSG } });
  t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R0'), k('R1')], expanded: true }, 'api');
  const L = () => t.ctx.layout!;
  const d = () => t.g.kernel.rows.displayed;
  const panelH = (id: string) => L().heightOf(d().indexOf(detailKey(k(id))) as never);
  return { ...t, L, panelH, handles: () => t.ctx.features };
}

describe.each(['detail-first', 'auto-first'] as const)('auto height and details (%s)', (order) => {
  it('the master is measured, its panel keeps its own height; both in one layout', () => {
    const t = both(order);
    // R0 long (150), its panel 100; R1 short (32), its panel 100; R2 at 150 + 100 + 32 + 100.
    expect(t.heightOf('R0')).toBe(150);
    expect(t.panelH('R0')).toBe(100);
    expect(t.panelH('R1')).toBe(100);
    expect(t.offsetOf('R2')).toBe(382);
    // A layout rebuilt after another opening keeps both.
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R5')], expanded: true }, 'api');
    expect(t.heightOf('R0')).toBe(150);
    expect(t.panelH('R5')).toBe(100);
    expect(t.offsetOf('R5')).toBe(382 + 32 * 3);
  });

  it('the detail panel measured (a panel height set on the layout) survives a measure of the masters', () => {
    const t = both(order);
    const i = t.g.kernel.rows.displayed.indexOf(detailKey(k('R1')));
    expect(t.L().setHeight(i as never, 60)).toBe(true);
    expect(t.panelH('R1')).toBe(60);
    expect(t.heightOf('R0')).toBe(150);
  });

  it('auto height taken away: the panels stay, the masters back to the row height, layoutFor the detail\'s', () => {
    const t = both(order);
    const [first, second] = t.handles();
    const auto = order === 'detail-first' ? second! : first!;
    auto.destroy();
    t.g.api.refresh();
    expect(t.heightOf('R0')).toBe(32);
    expect(t.panelH('R0')).toBe(100);
    expect(typeof t.ctx.layoutFor).toBe('function');
    expect(t.ctx.again).toBeUndefined();
  });

  it('details taken away: auto height goes on measuring (the panels no longer laid out by them)', () => {
    const t = both(order);
    const [first, second] = t.handles();
    const det = order === 'detail-first' ? first! : second!;
    det.destroy();
    t.g.api.refresh();
    expect(t.heightOf('R0')).toBe(150);
    expect(typeof t.ctx.layoutFor).toBe('function');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R0')], expanded: false }, 'api');
    expect(t.offsetOf('R1')).toBe(150);
  });

  it('both taken away (either order): no layoutFor left, every row the row height', () => {
    for (const reverse of [false, true]) {
      const t = both(order);
      const hs = [...t.handles()];
      for (const h of reverse ? hs.reverse() : hs) h.destroy();
      t.g.api.refresh();
      expect(t.ctx.layoutFor).toBeUndefined();
      expect(t.heightOf('R0')).toBe(32);
      cleanup();
    }
  });
});

describe('auto height and details: the rows of a panel', () => {
  it('a detail row is never measured as a data row (its panel is its own)', () => {
    const m = measureStub();
    const t = amake({ rows: NOTES(20), features: [panel(), autoHeight()], settings: { messages: MSG } });
    const n = m.reads.length;
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('R3')], expanded: true }, 'api');
    // The panel row came into the view: nothing to measure (R3 and the rest are cached).
    expect(m.reads.length).toBe(n);
  });
});
