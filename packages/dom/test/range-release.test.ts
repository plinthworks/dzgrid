// The owner's report on `orders-edit.html?focus=range` (2026-10-26, after Phase 5): the block's corner and the focus
// at the release are the cell under the RELEASE point, even when no move came between the last one and it (S11-Q1);
// an application's `clear()` (« a server answer that sent the selection ») tells `rangeChanged` with source `api` and
// says nothing; with `clearOnOutside: false` a press outside the grid keeps the block (the old S12-Q11; S12-Q13 clears it by default, range-outside.test.ts), Escape drops it and leaves the focus on the corner.
// Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, rmake } from './support-range.js';

afterEach(cleanup);

describe('the release point counts (S11-Q1)', () => {
  it('a release two rows below the last move: the block reaches the release cell, the focus stays on the anchor (S12-Q15)', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.move(t.at('r3', 's'));
    expect(t.block()).toBe('r1/n:r3/s');
    t.up(t.at('r5', 's'));
    expect(t.block()).toBe('r1/n:r5/s');
    expect(t.where()).toBe('r1/n');
  });

  it('a release with no drag (a click) makes no block from the release point', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.up(t.at('r1', 'n'));
    expect(t.block()).toBeNull();
  });

  it('a release on another cell with no move before it is a click: no block (mutant « the release point taken without a drag »)', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.up(t.at('r3', 's'));
    expect(t.block()).toBeNull();
  });
});

describe('the application clears the block (owner: « un retour serveur qui a fait la copie »)', () => {
  it('clear(): rangeChanged with source api and range null; nothing said', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.move(t.at('r3', 's'));
    t.up(t.at('r3', 's'));
    const said = t.said().length;
    const n = t.changes().length;
    t.api().clear();
    expect(t.block()).toBeNull();
    expect(t.changes().slice(n).map((e) => [e.source, e.range])).toEqual([['api', null]]);
    expect(t.said().slice(said)).toEqual([]);
    // Cleared again: nothing more.
    t.api().clear();
    expect(t.changes().length).toBe(n + 1);
  });
});

describe('the application clears the block during a drag (review of the fix)', () => {
  it('clear() mid-drag: the drag stops; the release re-creates nothing, the focus stays on the pressed cell', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.move(t.at('r3', 's'));
    t.api().clear();
    expect(t.block()).toBeNull();
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(false);
    t.move(t.at('r4', 's'));
    t.up(t.at('r5', 's'));
    expect(t.block()).toBeNull();
    expect(t.where()).toBe('r1/n');
  });
});

describe('clearOnOutside: false (the old S12-Q11): outside the grid, Escape', () => {
  it('a press and a click outside the grid keep the block (as Excel); Escape then drops it, said, the focus on the corner', () => {
    const t = rmake({ range: { clearOnOutside: false } });
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    t.move(t.at('r4', 's'));
    t.up(t.at('r4', 's'));
    const out = document.createElement('button');
    document.body.append(out);
    out.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    out.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.block()).toBe('r1/n:r4/s');
    t.cell('r4', 's')!.focus();
    t.press('Escape');
    expect(t.block()).toBeNull();
    expect(t.said().at(-1)).toBe('Selection cleared');
    expect(t.where()).toBe('r4/s');
    out.remove();
  });
});
