// `@dzgrid/dom/range`, a press outside the grid (docs/behaviors/range-selection.md « A press outside the grid »;
// owner S12-Q13, replacing S12-Q11): it clears the block, said once, `rangeChanged` source `user`; a press in a
// `data-dzg-keep-range` element keeps it, as `range({ clearOnOutside: false })` does; a press in the grid, its popups,
// a nested grid, the page's scrollbar (the document element) keeps it; shadow roots followed by the composed path.
import { describe, it, expect, afterEach } from 'vitest';
import { popupsFor } from '../src/popup.js';
import { cleanup, R_, rmake } from './support-range.js';

afterEach(cleanup);

const CLEARED = 'Selection cleared';
const PT = { clientX: 700, clientY: 700 };

/** A grid with a block r2/n … r5/s set by the API, the events and sentences so far forgotten. */
function withBlock(o: Parameters<typeof rmake>[0] = {}) {
  const t = rmake(o);
  t.api().set(R_(['r2', 'n'], ['r5', 's']));
  t.announce.mockClear();
  t.events.length = 0;
  return t;
}
const outside = (tag = 'button', parent: Node = document.body): HTMLElement => parent.appendChild(document.createElement(tag));

describe('range: a press outside the grid (S12-Q13)', () => {
  it('clears the block: rangeChanged source user, null; « cleared » said once; a second press tells nothing', () => {
    const t = withBlock();
    const b = outside();
    t.down(b, PT);
    expect(t.block()).toBeNull();
    expect(t.changes().map((e) => [e.source, e.range])).toEqual([['user', null]]);
    expect(t.said()).toEqual([CLEARED]);
    t.down(b, PT);
    expect(t.changes()).toHaveLength(1);
    expect(t.said()).toEqual([CLEARED]);
  });

  it('a press inside a data-dzg-keep-range element (or deep in one) keeps it', () => {
    const t = withBlock();
    const keep = outside('div');
    keep.setAttribute('data-dzg-keep-range', '');
    const deep = keep.appendChild(document.createElement('span')).appendChild(document.createElement('button'));
    t.down(keep, PT);
    t.down(deep, PT);
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.changes()).toEqual([]);
    expect(t.said()).toEqual([]);
    t.down(outside(), PT);
    expect(t.block()).toBeNull();
  });

  it('range({ clearOnOutside: false }) keeps it (the old rule); a grid beside it with the default clears its own', () => {
    const t = withBlock({ range: { clearOnOutside: false } });
    const d = withBlock();
    t.down(outside(), PT);
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.changes()).toEqual([]);
    expect(d.block()).toBeNull();
  });

  it('a press on the document element (the page scrollbar) keeps it', () => {
    const t = withBlock();
    t.down(document.documentElement, PT);
    expect(t.block()).toBe('r2/n:r5/s');
    t.down(document.body, PT);
    expect(t.block()).toBeNull();
  });

  it('a press inside the grid, off the cells (the header, the viewport), or in an open popup of the grid keeps it', () => {
    const t = withBlock();
    t.down(t.ctx.el.header, PT);
    t.down(t.ctx.el.root, PT);
    const content = document.createElement('div');
    const field = content.appendChild(document.createElement('input'));
    const ref = popupsFor(t.ctx as never).open(t.ctx.el.header, content, { placement: 'block-end' });
    t.down(field, PT);
    expect(ref.open).toBe(true);
    expect(t.block()).toBe('r2/n:r5/s');
    expect(t.changes()).toEqual([]);
    t.down(outside(), PT);
    expect(t.block()).toBeNull();
  });

  it('in a shadow root: a press in the grid keeps it, a press elsewhere in the same root clears it, a keep-range element there keeps it', () => {
    const sr = outside('div').attachShadow({ mode: 'open' });
    const host = sr.appendChild(document.createElement('div'));
    const t = withBlock({ host });
    t.down(t.ctx.el.header, PT);
    expect(t.block()).toBe('r2/n:r5/s');
    const keep = sr.appendChild(document.createElement('button'));
    keep.setAttribute('data-dzg-keep-range', '');
    t.down(keep, PT);
    expect(t.block()).toBe('r2/n:r5/s');
    t.down(sr.appendChild(document.createElement('button')), PT);
    expect(t.block()).toBeNull();
    expect(t.said()).toEqual([CLEARED]);
  });

  it('two grids: a press in grid B clears grid A\'s block, B\'s own block kept by it', () => {
    const a = withBlock();
    const b = withBlock();
    b.down(b.ctx.el.header, PT);
    expect(a.block()).toBeNull();
    expect(a.changes().map((e) => e.source)).toEqual(['user']);
    expect(a.said()).toEqual([CLEARED]);
    expect(b.block()).toBe('r2/n:r5/s');
  });

  it('in a CLOSED shadow root: a press on the grid\'s header keeps it, a press elsewhere in that root clears it (review 1)', () => {
    const sr = outside('div').attachShadow({ mode: 'closed' });
    const host = sr.appendChild(document.createElement('div'));
    const t = withBlock({ host });
    t.down(t.ctx.el.header, PT);
    expect(t.block()).toBe('r2/n:r5/s');
    t.down(sr.appendChild(document.createElement('button')), PT);
    expect(t.block()).toBeNull();
    expect(t.said()).toEqual([CLEARED]);
  });

  it('a button that stops its own pointerdown still clears it (the listener captures)', () => {
    const t = withBlock();
    const b = outside();
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    t.down(b, PT);
    expect(t.block()).toBeNull();
  });
});
