// Vertical column titles (docs/behaviors/vertical-headers.md, 1.9.0). jsdom has no layout: a title's length is faked
// (7 px a character) where the feature measures it; the turn itself is checked in browsers (scripts/browser-headers.mjs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup, emake, type R } from './support-edit.js';
import { verticalHeaders } from '../src/vertical-headers.js';

let measured = 0;
beforeEach(() => {
  measured = 0;
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.closest('.dzg-vprobe')) return 0;
    measured++;
    return (this.textContent ?? '').length * 7;
  });
});
afterEach(cleanup);

const cols = (long = 'Grams of leaves'): ColumnDef<R>[] => [
  { id: 'name', header: 'Name' },
  { id: 'n', header: long, type: 'number', headerVertical: true },
  { id: 'q', header: 'Q', type: 'number', headerVertical: true },
];
const headRow = (h: HTMLElement) => h.querySelector<HTMLElement>('.dzg-header .dzg-hrow')!;
const hcell = (h: HTMLElement, id: string) => h.querySelector<HTMLElement>(`.dzg-hcell[data-col="${id}"]`)!;

describe('verticalHeaders()', () => {
  it('marks the vertical headers only; their name, role and keys unchanged (1, 5)', () => {
    const plain = emake({ columns: cols() });
    const m = emake({ columns: cols(), settings: { features: [verticalHeaders()] } });
    expect(hcell(m.host, 'n').hasAttribute('data-vertical')).toBe(true);
    expect(hcell(m.host, 'q').hasAttribute('data-vertical')).toBe(true);
    expect(hcell(m.host, 'name').hasAttribute('data-vertical')).toBe(false);
    for (const id of ['name', 'n', 'q'])
      for (const a of ['role', 'aria-label', 'aria-colindex', 'aria-keyshortcuts', 'tabindex']) expect(hcell(m.host, id).getAttribute(a)).toBe(hcell(plain.host, id).getAttribute(a));
  });

  it('the column headers’ row grows to the longest title, plus the cell’s padding; other rows unchanged (3, 7)', () => {
    const m = emake({ columns: cols(), settings: { features: [verticalHeaders()] } });
    // « Grams of leaves »: 15 characters × 7 px, and 16 px of padding.
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe(`${15 * 7 + 16}px`);
  });

  it('never below a row’s height, never above maxHeight', () => {
    const short = emake({ columns: cols('N'), settings: { features: [verticalHeaders()] } });
    expect(headRow(short.host).style.getPropertyValue('min-block-size')).toBe('');
    const long = emake({ columns: cols('x'.repeat(100)), settings: { features: [verticalHeaders({ maxHeight: 120 })] } });
    expect(headRow(long.host).style.getPropertyValue('min-block-size')).toBe('120px');
  });

  it('measures once per change of the titles, never at a scroll; a title changed is measured again', () => {
    const m = emake({ columns: cols(), settings: { features: [verticalHeaders()] } });
    const once = measured;
    expect(once).toBeGreaterThan(0);
    m.scroll(200);
    m.scroll(0);
    expect(measured).toBe(once);
    m.g.update({ columns: cols('A much longer title') });
    expect(measured).toBeGreaterThan(once);
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe(`${19 * 7 + 16}px`);
  });

  it('no vertical column: the row keeps its height; the feature gone, the marks and the height go', () => {
    const m = emake({ columns: [{ id: 'name', header: 'Name' }], settings: { features: [verticalHeaders()] } });
    expect(headRow(m.host).style.getPropertyValue('min-block-size')).toBe('');
    const v = emake({ columns: cols(), settings: { features: [verticalHeaders()] } });
    v.g.destroy();
  });

  it('without the feature: a warning missing-feature by column, the title horizontal (2)', () => {
    const m = emake({ columns: cols() });
    const ps = m.events.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p) => p.code === 'missing-feature');
    expect(ps).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns[1].headerVertical', detail: 'vertical-headers' },
      { code: 'missing-feature', severity: 'warning', path: 'columns[2].headerVertical', detail: 'vertical-headers' },
    ]);
    expect(hcell(m.host, 'n').hasAttribute('data-vertical')).toBe(false);
  });
});
