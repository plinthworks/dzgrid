// Moving columns with the other features (Phase 6 step 2, step02-plan §5): the block kept on a cancelled drag, dropped by
// a real move (range-selection.md 10) and said first, then the place; a move never sorts; a fill gesture under way is
// cancelled by the move's `columnsChanged`; header groups split when a column leaves them and join again (M19–20).
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { columns } from '../src/columns.js';
import { spans } from '../src/spans.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { cleanup, colmake, CMSG, R_, SIX, type R } from './support-columns.js';
import { fmake } from './support-fill.js';

afterEach(cleanup);

describe('with the block (range)', () => {
  it('a cancelled drag keeps the block (header already focused); a drop drops it, the block\'s sentence first, then the place', () => {
    const t = colmake({ columns: SIX(), withRange: true });
    const blocks = t.feature.api(t.g)!;
    // The header already focused: pressing another one moves the focus, which drops the block by the block's own rule
    // (range-selection.md: a focus moved by the user); the drag itself never does.
    t.focusHeader('b');
    blocks.set(R_(['r1', 'b'], ['r3', 'c']));
    t.drag('b', 360, { noUp: true });
    t.press('Escape', {}, t.hcell('b')!);
    t.up(t.pt(360));
    expect(t.block()).toBe('r1/b:r3/c');
    const before = t.said().length;
    t.drag('d', 40);
    expect(t.block()).toBeNull();
    const said = t.said().slice(before);
    expect(said.at(-1)).toBe('D: column 1 of 6');
    expect(said.length).toBe(2);
    expect(t.sorted()).toHaveLength(0);
  });
});

describe('with the fill', () => {
  it('a fill drag under way is cancelled by a move (its own rule on columnsChanged)', () => {
    const c = columns();
    const t = fmake({ after: [c], more: [EN_COLUMNS] });
    t.api().set(R_(['r1', 'name'], ['r2', 'name']));
    t.dragTo('r6', 'name', { noUp: true });
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(true);
    expect(c.api(t.g)!.move('qty', 1)).toBe('moved');
    expect(t.ctx.el.root.hasAttribute('data-dzg-filling')).toBe(false);
  });
});

describe('with header groups (spans)', () => {
  const leaf = (id: string) => ({ id, header: id.toUpperCase(), width: 100 });
  const TREE: ColumnOrGroup<R>[] = [{ id: 'g', header: 'Group', children: [leaf('a'), leaf('b'), leaf('c')] }, leaf('d'), leaf('e')];
  it('a column leaving its group splits it (the label on each side); back next to its siblings, one group again; group headers never drag (O4)', () => {
    const t = colmake({ columns: TREE as never, messages: CMSG.en, more: [spans()] });
    const groups = () => [...t.ctx.el.header.querySelectorAll<HTMLElement>('.dzg-hgroup')].filter((x) => x.textContent === 'Group').map((x) => x.dataset['col']);
    expect(groups()).toHaveLength(1);
    // b dropped between d and e (d 300–400: 360 is after its half).
    t.drag('b', 360);
    expect(t.shown()).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(groups()).toHaveLength(2);
    t.drag('b', 140);
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(groups()).toHaveLength(1);
    const g = [...t.ctx.el.header.querySelectorAll<HTMLElement>('.dzg-hgroup')][0]!;
    const n = t.moved().length;
    t.down(g, t.pt(150));
    t.move(t.pt(400));
    t.tick();
    expect(t.dragging()).toBe(false);
    t.up(t.pt(400));
    expect(t.moved()).toHaveLength(n);
  });
});
