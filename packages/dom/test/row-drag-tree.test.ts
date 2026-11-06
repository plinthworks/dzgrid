// Moving rows in a tree and the drag's geometry (Phase 9, docs/behaviors/row-move.md 7–10, 17, 25): quarters and the
// inside outline, never into itself, the line at the target level's indent (mirrored in Arabic), the spring-open after
// 0.8 s, auto-scroll on the block axis only, the tree keys (→ in, ← out; mirrored right to left), the level said. The
// tree by hand: P0 (a0 a1 a2), P1 (b0 b1), P2 — every parent open; rows of 32 px under a 40 px header.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tree } from '../src/tree.js';
import { cleanup, dmake, flatRows, HEADER, treeRows, type R } from './support-row-drag.js';

afterEach(cleanup);

const tmake = (o: Parameters<typeof dmake>[0] = {}) => {
  const t = dmake({ rows: treeRows(), before: [tree<R>({ parentId: (x) => x.parent ?? null, initial: 'all' })], ...o });
  t.app(treeRows(), true);
  return t;
};

describe('where a row lands in a tree (7, 8)', () => {
  it('the upper quarter before, the middle inside (the row outlined, no line), the lower quarter of an open parent before its first child', () => {
    const t = tmake();
    expect(t.order()).toEqual(['P0', 'a0', 'a1', 'a2', 'P1', 'b0', 'b1', 'P2']);
    t.drag('b1', ['a1', 0.1]);
    expect(t.moves().at(-1)).toMatchObject({ target: { key: t.K('a1'), where: 'before' }, parent: t.K('P0') });
    expect(t.order()).toEqual(['P0', 'a0', 'b1', 'a1', 'a2', 'P1', 'b0', 'P2']);
    t.drag('b0', ['a1', 0.5], { noUp: true });
    expect(t.inside()!.hidden).toBe(false);
    expect([t.inside()!.style.insetBlockStart, t.inside()!.style.blockSize]).toEqual([`${HEADER + 3 * 32}px`, '32px']);
    expect(t.bar()!.hidden).toBe(true);
    t.up(t.over('a1', 0.5));
    expect(t.moves().at(-1)).toMatchObject({ target: { key: t.K('a1'), where: 'inside' }, parent: t.K('a1') });
    expect(t.rows()!.find((r) => r.id === 'b0')!.parent).toBe('a1');
    // P0 shows its children (a0 first): its lower quarter is a0's « before ».
    t.drag('P2', ['P0', 0.9]);
    expect(t.moves().at(-1)).toMatchObject({ target: { key: t.K('a0'), where: 'before' }, parent: t.K('P0') });
  });

  it('never into itself or under itself: no line, no outline, no event', () => {
    const t = tmake();
    t.drag('P0', ['a1', 0.5], { noUp: true });
    expect([t.bar()!.hidden, t.inside()!.hidden]).toEqual([true, true]);
    t.up(t.over('a1', 0.5));
    t.drag('P0', ['P0', 0.5]);
    expect(t.moves()).toHaveLength(0);
  });

  it('the line starts at the target level\'s indent (the tree cell\'s own), from the right in Arabic', () => {
    for (const lang of ['en', 'ar'] as const) {
      const t = tmake({ lang });
      t.drag('b1', ['a1', 0.1], { noUp: true });
      // Level 1: one indent of 16 px from the rows' start edge (logical: `inset-inline-start` in both directions).
      expect(t.bar()!.style.insetInlineStart, lang).toBe('16px');
      expect(t.bar()!.style.insetBlockStart, lang).toBe(`${HEADER + 2 * 32 - 1}px`);
      t.move(t.over('P2', 0.1));
      t.tick();
      expect(t.bar()!.style.insetInlineStart, lang).toBe('0px');
      cleanup();
    }
  });
});

describe('the spring-open (10)', () => {
  it('a closed parent held inside for 0.8 s opens; left before, it stays closed; nothing said', () => {
    vi.useFakeTimers();
    const t = tmake();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.K('P1')], expanded: false }, 'api');
    t.drag('a0', ['P1', 0.5], { noUp: true });
    vi.advanceTimersByTime(799);
    expect(t.order()).not.toContain('b0');
    vi.advanceTimersByTime(1);
    expect(t.order()).toContain('b0');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.K('P1')], expanded: false }, 'api');
    t.drag('a0', ['P1', 0.5], { noUp: true });
    vi.advanceTimersByTime(500);
    t.move(t.over('P0', 0.1));
    t.tick();
    vi.advanceTimersByTime(1000);
    expect(t.order()).not.toContain('b0');
    expect(t.said().filter((s) => /expanded|opened/i.test(s))).toEqual([]);
  });
});

describe('auto-scroll (9)', () => {
  it('near the bottom the rows scroll a frame at a time; never sideways', () => {
    const t = dmake({ rows: flatRows(200), block: 320 });
    t.drag('r0', { clientX: 60, clientY: HEADER + 318 }, { noUp: true });
    const top0 = t.ctx.scroll.logicalTop;
    for (let i = 0; i < 5; i++) t.tick();
    expect(t.ctx.scroll.logicalTop).toBeGreaterThan(top0);
    expect(t.box.scrollInline).toBe(0);
    // The line follows the rows that came under the pointer.
    expect(t.bar()!.hidden).toBe(false);
    t.up({ clientX: 60, clientY: HEADER + 318 });
    const m = t.moves()[0]!;
    expect(Number(String(m.target.key).split(':').pop()!.slice(1))).toBeGreaterThan(9);
  });
});

describe('the tree keys (17, 25)', () => {
  it('Alt+Shift+→ moves inside the sibling before (it opens), Alt+Shift+← out after its parent; the focus stays; the level said after a pause', () => {
    vi.useFakeTimers();
    const t = tmake();
    t.focus('a1');
    t.altShift('ArrowRight');
    expect(t.moves().at(-1)).toMatchObject({ via: 'keys', target: { key: t.K('a0'), where: 'inside' }, parent: t.K('a0') });
    expect(t.order()).toEqual(['P0', 'a0', 'a1', 'a2', 'P1', 'b0', 'b1', 'P2']);
    expect(t.rows()!.find((r) => r.id === 'a1')!.parent).toBe('a0');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: t.K('a1'), column: 'name' });
    vi.advanceTimersByTime(300);
    expect(t.said()).toEqual(['Row 1 of 1, level 3']);
    t.altShift('ArrowLeft');
    expect(t.moves().at(-1)).toMatchObject({ target: { key: t.K('a0'), where: 'after' }, parent: t.K('P0') });
    vi.advanceTimersByTime(300);
    expect(t.said().at(-1)).toBe('Row 2 of 3, level 2');
  });

  it('right to left: ← moves inside, → out', () => {
    const t = tmake({ lang: 'ar' });
    t.focus('a1');
    t.altShift('ArrowLeft');
    expect(t.moves().at(-1)!.target).toEqual({ key: t.K('a0'), where: 'inside' });
    t.altShift('ArrowRight');
    expect(t.moves().at(-1)!.target).toEqual({ key: t.K('a0'), where: 'after' });
  });

  it('the focused row selected under a selected ancestor: the ancestor moves (the focused row travels with it)', () => {
    const t = tmake({ settings: { selection: { mode: 'multi' } } });
    t.g.kernel.dispatch({ type: 'selection.only', row: t.K('P0') }, 'api');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.K('a1') }, 'api');
    t.focus('a1');
    t.altShift('ArrowDown');
    expect(t.moves().map((m) => [m.keys, m.target])).toEqual([[[t.K('P0')], { key: t.K('P1'), where: 'after' }]]);
  });

  it('a root has no out, a first child no in: the edge said', () => {
    const t = tmake();
    t.focus('P0');
    t.altShift('ArrowLeft');
    t.focus('a0');
    t.altShift('ArrowRight');
    expect(t.moves()).toHaveLength(0);
    expect(t.said()).toEqual(['Already at the edge']);
  });
});
