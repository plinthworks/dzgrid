// Column under the pointer (docs/behaviors/column-hover.md, 1.10.0; owner 2026-11-10, review 6.5): `columnHover()` writes
// `data-hover-col` on the root and `data-col-hover` on the column's mounted cells, at most once per frame, the pointer only,
// no layout read. The tint itself is the theme's (`--dzg-column-hover-bg`), seen in browsers (scripts/browser-1-10.mjs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, emake, k } from './support-edit.js';
import { columnHover } from '../src/column-hover.js';

afterEach(cleanup);

/** Frames run by the test. */
function frames() {
  const q: FrameRequestCallback[] = [];
  return { raf: { requestAnimationFrame: (cb: FrameRequestCallback) => q.push(cb), cancelAnimationFrame: () => {} }, run: () => q.splice(0).forEach((f) => f(0)), size: () => q.length };
}
const over = (el: Element, pointerType = 'mouse') => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType }));
const marked = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('[data-col-hover]')].map((c) => `${c.classList.contains('dzg-hcell') ? 'h' : 'c'}:${c.dataset['col']}`);

describe('columnHover()', () => {
  it('a cell under the pointer: its column’s header and cells marked, the root says it, at the next frame (1, 4)', () => {
    const f = frames();
    const m = emake({ raf: f.raf, settings: { features: [columnHover()] } });
    f.run();
    const root = m.host.querySelector<HTMLElement>('.dzg')!;
    over(m.cell('r1', 'n')!);
    expect(root.hasAttribute('data-hover-col')).toBe(false);
    f.run();
    expect(root.getAttribute('data-hover-col')).toBe('n');
    const ids = marked(m.host);
    expect(ids).toContain('h:n');
    expect(ids.filter((x) => x === 'c:n').length).toBe(m.host.querySelectorAll('.dzg-body .dzg-cell[data-col="n"]').length);
    expect(ids.every((x) => x.endsWith(':n'))).toBe(true);
  });

  it('several moves in one frame: one write, the last column; the header too (4)', () => {
    const f = frames();
    const m = emake({ raf: f.raf, settings: { features: [columnHover()] } });
    f.run();
    over(m.cell('r1', 'n')!);
    over(m.cell('r1', 's')!);
    over(m.host.querySelector('.dzg-hcell[data-col="q"]')!);
    expect(f.size()).toBe(1);
    f.run();
    expect(m.host.querySelector('.dzg')!.getAttribute('data-hover-col')).toBe('q');
    expect(marked(m.host).every((x) => x.endsWith(':q'))).toBe(true);
  });

  it('no layout or style read (4)', () => {
    const f = frames();
    const m = emake({ raf: f.raf, settings: { features: [columnHover()] } });
    f.run();
    const reads = [
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get'), vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get'),
      vi.spyOn(Element.prototype, 'getBoundingClientRect'), vi.spyOn(window, 'getComputedStyle'),
    ];
    over(m.cell('r2', 's')!);
    f.run();
    for (const r of reads) expect(r).not.toHaveBeenCalled();
  });

  it('keyboard focus and a finger do not move it (3); leaving the grid clears it (1)', () => {
    const f = frames();
    const m = emake({ raf: f.raf, settings: { features: [columnHover()] } });
    f.run();
    const root = m.host.querySelector<HTMLElement>('.dzg')!;
    m.g.api.focusCell(k('r1'), 'q');
    f.run();
    over(m.cell('r1', 'n')!, 'touch');
    f.run();
    expect(root.hasAttribute('data-hover-col')).toBe(false);
    over(m.cell('r1', 'n')!);
    f.run();
    expect(root.getAttribute('data-hover-col')).toBe('n');
    root.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    f.run();
    expect(root.hasAttribute('data-hover-col')).toBe(false);
    expect(marked(m.host)).toEqual([]);
  });

  it('cells mounted later (a scroll) are marked; destroyed: nothing left (4, 7)', () => {
    const f = frames();
    const m = emake({ raf: f.raf, settings: { features: [columnHover()] } });
    f.run();
    over(m.cell('r1', 'n')!);
    f.run();
    m.scroll(2000);
    f.run();
    const cells = [...m.host.querySelectorAll<HTMLElement>('.dzg-body .dzg-cell[data-col="n"]')];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.hasAttribute('data-col-hover'))).toBe(true);
    expect(m.host.querySelectorAll('.dzg-body .dzg-cell[data-col-hover]:not([data-col="n"])')).toHaveLength(0);
    m.g.destroy();
    expect(m.host.querySelector('[data-col-hover], [data-hover-col]')).toBe(null);
  });
});
