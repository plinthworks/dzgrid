// The DOM base seams of Phase 4 step 4 (docs/phase-4-plan.md D6, D7, D12): a feature's keys before the
// grid's own, a row layout a feature may give, the anchor kept when rows open or close, the measured
// view block, the treegrid role. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { variableRowLayout, type FocusPos, type KeyOwner } from '@dzgrid/core';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, k, idOf, tmake, wide, SMALL } from './support-tree.js';

afterEach(cleanup);

/** A feature claiming the keys `claim` returns true for, recording what it was asked. */
function keyed(claim: (e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner) => boolean) {
  const asked: { key: string; at: FocusPos | null; owner: KeyOwner }[] = [];
  const f: GridFeature = { id: 'keyed', setup: () => ({ keys(e, at, owner) { asked.push({ key: e.key, at, owner }); return claim(e, at, owner); }, destroy() {} }) };
  return { f, asked };
}

describe('FeatureHandle.keys: a feature claims a key before the grid’s own moves', () => {
  it('is asked with the event, the focus and the owner; a claimed key does nothing else and is prevented', () => {
    const { f, asked } = keyed((e) => e.key === 'ArrowRight');
    const t = tmake({ tree: null, features: [f] });
    t.focus('S0');
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    t.active().dispatchEvent(e);
    expect(asked).toEqual([{ key: 'ArrowRight', at: { kind: 'cell', row: k('S0'), column: 'name' }, owner: 'cell' }]);
    expect(e.defaultPrevented).toBe(true);
    // Not moved: the feature took it.
    expect(t.where()).toBe('S0/name');
  });

  it('leaves a key it does not claim to the grid (the column move happens)', () => {
    const { f, asked } = keyed(() => false);
    const t = tmake({ tree: null, features: [f] });
    t.focus('S0');
    t.press('ArrowRight');
    expect(asked.length).toBe(1);
    expect(t.where()).toBe('S0/n');
  });

  it('is asked for a key that means nothing to the grid (`*`), before intentFor', () => {
    const { f, asked } = keyed(() => false);
    const t = tmake({ tree: null, features: [f] });
    t.focus('S0');
    t.press('*');
    expect(asked.map((a) => a.key)).toEqual(['*']);
  });
});

describe('g.layoutFor: the row layout a feature gives (uniform without one)', () => {
  it('without one the uniform layout is used: body height count × h, row i at i × h', () => {
    const t = tmake({ tree: null, rows: SMALL });
    expect(t.ctx.layoutFor).toBeUndefined();
    expect(t.host.querySelector<HTMLElement>('.dzg-body')!.style.blockSize).toBe(`${8 * 32}px`);
    expect(t.ctx.layout?.uniform).toBe(true);
    expect(t.ctx.layout?.total).toBe(8 * 32);
  });

  it('with one, the body, the rows’ places and ensureVisible follow it', () => {
    // Row 1 is 200 px tall, the others 32.
    const f: GridFeature = {
      id: 'tall',
      setup(g: GridContext<unknown>) {
        g.layoutFor = (d, h) => variableRowLayout(d, h, Float64Array.from({ length: d.count }, (_, i) => (i === 1 ? 200 : h)));
        return { destroy() {} };
      },
    };
    const t = tmake({ tree: null, features: [f], rows: wide(10, 0) });
    expect(t.host.querySelector<HTMLElement>('.dzg-body')!.style.blockSize).toBe(`${9 * 32 + 200}px`);
    expect(t.row('S2')!.style.insetBlockStart).toBe(`${32 + 200}px`);
    expect(t.row('S1')!.style.blockSize).toBe('200px');
    // Row 9 brought into view: its bottom at the view's bottom (320 px).
    t.g.api.ensureVisible(k('S9'));
    expect(t.ctx.scroll.logicalTop).toBe(32 * 8 + 200 + 32 - 320);
  });
});

describe('the anchor when rows open or close (ModelChange kind expand)', () => {
  it('keeps the top row in place when a parent above it opens', () => {
    // 50 services of 4 patients each, all closed: 50 rows of 32 px; the view shows 10.
    const t = tmake({ rows: wide(50, 4) });
    t.scroll(20 * 32);
    const top = idOf(t.g.kernel.rows.displayed.keyAt(t.ctx.layout!.indexAt(t.ctx.scroll.logicalTop)));
    expect(top).toBe('S20');
    t.expand(['S3']);
    // Four rows came above: the top row is still S20, four rows further down the list.
    expect(t.ctx.scroll.logicalTop).toBe(24 * 32);
    expect(t.row('S20')).not.toBeNull();
    t.expand(['S3'], false);
    expect(t.ctx.scroll.logicalTop).toBe(20 * 32);
  });

  it('keeps the top row (not the end) when a row opens below it at the end of the list', () => {
    const t = tmake({ rows: wide(50, 4) });
    t.scroll(50 * 32 - 320);
    const before = t.ctx.scroll.logicalTop;
    expect(t.ctx.scroll.logicalTop).toBe(40 * 32);
    t.expand(['S45']);
    // Opened below the top row: nothing on screen above it moves.
    expect(t.ctx.scroll.logicalTop).toBe(before);
    t.expand(['S45'], false);
    expect(t.ctx.scroll.logicalTop).toBe(before);
  });

  it('keeps the top, at the top', () => {
    const t = tmake({ rows: wide(50, 4) });
    t.expand(['S0']);
    expect(t.ctx.scroll.logicalTop).toBe(0);
  });
});

describe('g.viewBlock and the role', () => {
  it('holds the measured view block after a paint', () => {
    const t = tmake({ tree: null, block: 333 });
    expect(t.ctx.viewBlock).toBe(333);
  });

  it('is a treegrid with the tree feature, a grid without', () => {
    expect(tmake().vp.getAttribute('role')).toBe('treegrid');
    expect(tmake({ tree: null }).vp.getAttribute('role')).toBe('grid');
  });
});
