import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, isSelected } from '@dzgrid/core';
import { grids, make, tick } from './support-step7.js';

/** Probes: each asserts what the user would expect; they fail on d692ad1. */
const k = (id: string) => dataKey(id)!;
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

describe('B5: the box on a page of the browser after selection.allFiltered', () => {
  it('a click on the mixed box does not throw away the rows selected on the other pages', () => {
    const t = make({ rows: ids(6).map((id) => ({ id, name: id })) });
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
    expect(t.checked()).toBe('mixed');
    t.click(t.headBox());
    // r2..r5 were selected on pages 1 and 2; the user only asked to tick this page.
    for (const id of ['r2', 'r3', 'r4', 'r5']) expect(isSelected(t.g.kernel.selection, k(id)), id).toBe(true);
  });

  it('Ctrl+A on a page does not shrink an all-pages selection to the page', () => {
    const t = make({ rows: ids(6).map((id) => ({ id, name: id })) });
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    t.g.api.focusCell(k('r0'), 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(isSelected(t.g.kernel.selection, k('r5'))).toBe(true);
  });
});

describe('B6: the dedup of sentences outlives what the live region says', () => {
  it('after another announcement, the same selection sentence is said again', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.click(t.rowEl('a').querySelector<HTMLElement>('.dzg-check')!);
    await tick();
    expect(t.live()).toBe('1 row selected');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.calls.at(-1)!.err(new Error('503'));
    await tick();
    expect(t.live()).toBe('Loading failed');
    t.g.kernel.dispatch({ type: 'selection.only', row: k('b') }, 'user');
    await tick();
    expect(t.live()).toBe('1 row selected');
  });
});

describe('B3: the box click when the keys held are another query’s', () => {
  it('reads mixed, and a click selects the query instead of clearing the kept keys', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 2 });
    t.click(t.rowEl('a').querySelector<HTMLElement>('.dzg-check')!);
    t.click(t.rowEl('b').querySelector<HTMLElement>('.dzg-check')!);
    expect(t.checked()).toBe('true');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    t.f.answer(['x', 'y'], { total: 2 });
    // a and b are kept (keepOnFilter), not shown: two keys, two rows matched, none of them ticked.
    expect(t.checked()).toBe('mixed');
    t.click(t.headBox());
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });
});

describe('B5: what still holds', () => {
  it('a page all ticked under an include set: the box click still takes the page (step 17 decides)', () => {
    const t = make({ rows: ids(6).map((id) => ({ id, name: id })) });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r0') }, 'user');
    expect(t.checked()).toBe('mixed');
    t.click(t.headBox());
    expect(t.g.kernel.selection.mode).toBe('include');
    expect([...t.g.kernel.selection.keys]).toEqual([k('r0'), k('r1')]);
  });

  it('Ctrl+A on an all-pages selection with a row unticked ticks it again, every page kept', () => {
    const t = make({ rows: ids(6).map((id) => ({ id, name: id })) });
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    t.g.api.focusCell(k('r0'), 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });
});

describe('B6: any voice resets it', () => {
  it('after the host said something through the API, the same selection sentence is said again', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.click(t.rowEl('a').querySelector<HTMLElement>('.dzg-check')!);
    await tick();
    t.g.api.announce('Saved');
    await tick();
    expect(t.live()).toBe('Saved');
    t.g.kernel.dispatch({ type: 'selection.only', row: k('b') }, 'user');
    await tick();
    expect(t.live()).toBe('1 row selected');
  });
});
