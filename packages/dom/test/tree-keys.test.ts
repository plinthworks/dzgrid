// Keys in a tree (Phase 4 step 4): docs/behaviors/tree-keys.md, the APG treegrid pattern. The same
// expected moves left to right and right to left, the keys mirrored. Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, k, idOf, tmake, wide } from './support-tree.js';

afterEach(cleanup);

const DIRS = [
  { dir: 'ltr', forward: 'ArrowRight', back: 'ArrowLeft', lang: 'en' },
  { dir: 'rtl', forward: 'ArrowLeft', back: 'ArrowRight', lang: 'ar' },
] as const;

describe.each(DIRS)('in the tree column ($dir)', ({ forward, back, lang }) => {
  const make = (o: Parameters<typeof tmake>[0] = {}) => tmake({ lang, ...o });

  it('forward opens a closed parent, the focus stays; again, it moves to the next column', () => {
    const t = make();
    t.focus('S0');
    t.press(forward);
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'S2']);
    expect(t.where()).toBe('S0/name');
    expect(t.expandedEvents()).toEqual([expect.objectContaining({ source: 'user', rows: [k('S0')], expanded: true })]);
    t.press(forward);
    expect(t.where()).toBe('S0/n');
    expect(t.expandedEvents().length).toBe(1);
  });

  it('forward on a leaf moves to the next column', () => {
    const t = make();
    t.focus('S2');
    t.press(forward);
    expect(t.where()).toBe('S2/n');
  });

  it('back closes an open parent, the focus stays', () => {
    const t = make();
    t.expand(['S0']);
    t.focus('S0');
    t.press(back);
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
    expect(t.where()).toBe('S0/name');
    expect(t.expandedEvents().at(-1)).toEqual(expect.objectContaining({ source: 'user', rows: [k('S0')], expanded: false }));
  });

  it('back on a closed parent or a leaf with a parent goes to the parent row, same column', () => {
    const t = make();
    t.expand(['S0']);
    t.focus('P1');
    t.press(back);
    expect(t.where()).toBe('S0/name');
    t.focus('P2');
    t.press(back);
    expect(t.where()).toBe('S0/name');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('S0'), column: 'name' });
  });

  it('back on a closed root or a root leaf does nothing (no column move, no event)', () => {
    const t = make();
    t.focus('S1');
    const e = new KeyboardEvent('keydown', { key: back, bubbles: true, cancelable: true });
    t.active().dispatchEvent(e);
    expect(t.where()).toBe('S1/name');
    expect(e.defaultPrevented).toBe(true);
    t.focus('S2');
    t.press(back);
    expect(t.where()).toBe('S2/name');
    expect(t.expandedEvents()).toEqual([]);
  });

  it('goes to the parent scrolled into view when it was out of it', () => {
    const t = make({ rows: wide(3, 40) });
    t.expand(['S0']);
    t.focus('S0-39');
    expect(t.ctx.scroll.logicalTop).toBeGreaterThan(0);
    t.press(back);
    expect(t.where()).toBe('S0/name');
    expect(t.ctx.scroll.logicalTop).toBe(0);
  });

  it('`*` opens every closed sibling that has children: one event, one sentence, the focus stays', () => {
    const t = make({ rows: wide(5, 2) });
    t.expand(['S1']);
    t.focus('S0');
    // `*` is typed with Shift on many layouts: Shift does not stop it.
    t.press('*', { shiftKey: true });
    expect(t.expandedEvents().at(-1)).toEqual(expect.objectContaining({ source: 'user', rows: [k('S0'), k('S2'), k('S3'), k('S4')], expanded: true }));
    expect(t.expandedEvents().length).toBe(2);
    expect(t.where()).toBe('S0/name');
    expect(t.said().length).toBe(1);
    // Nothing left to open: nothing happens, nothing said.
    t.press('*');
    expect(t.expandedEvents().length).toBe(2);
    expect(t.said().length).toBe(1);
  });

  it('`*` opens siblings only, never a nephew shown under an open sibling', () => {
    const t = make();
    t.expand(['S0']);
    t.focus('S1');
    t.press('*');
    // S0 is open already, S1 opens; P1 (a closed parent, a level down) stays closed.
    expect(t.expandedEvents().at(-1)?.rows).toEqual([k('S1')]);
    expect(t.g.kernel.expansion.has(k('P1'))).toBe(false);
  });

  it('back on a root in a tree column that is not first stays put (no column move)', () => {
    const t = make({ tree: { column: 'n' } });
    t.focus('S0', 'n');
    t.press(back);
    expect(t.where()).toBe('S0/n');
    t.focus('S2', 'n');
    t.press(back);
    expect(t.where()).toBe('S2/n');
  });

  it('`*` on a child opens its siblings only, not its parent’s', () => {
    const t = make();
    t.expand(['S0']);
    t.focus('P2');
    t.press('*');
    expect(t.shown()).toEqual(['S0', 'P1', 'V1', 'V2', 'P2', 'S1', 'S2']);
  });

  it('with Ctrl, Alt or Meta held the tree claims nothing; Shift + arrows stay the grid’s', () => {
    const t = make();
    for (const mods of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      t.focus('S0');
      t.press(forward, mods);
      t.focus('S0');
      t.press('*', mods.shiftKey ? { ctrlKey: true } : mods);
    }
    expect(t.expandedEvents()).toEqual([]);
  });

  it('Enter and Space keep their flat meaning: they never open a parent', () => {
    const t = make({ settings: { selection: { mode: 'multi' } } });
    t.focus('S0');
    t.press(' ');
    t.press('Enter');
    expect(t.expandedEvents()).toEqual([]);
    expect([...t.g.kernel.selection.keys]).toEqual([k('S0')]);
  });
});

describe('outside the tree column', () => {
  it.each(DIRS)('arrows move between cells as on a flat grid ($dir)', ({ forward, back, lang }) => {
    const t = tmake({ lang });
    t.focus('S0', 'n');
    t.press(forward);
    expect(t.where()).toBe('S0/t');
    t.press(back);
    t.press(back);
    expect(t.where()).toBe('S0/name');
    expect(t.expandedEvents()).toEqual([]);
    t.focus('S0', 'n');
    t.press('*');
    expect(t.expandedEvents()).toEqual([]);
  });

  it('Up and Down go through the rows shown, whatever their level', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.focus('S0');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      t.press('ArrowDown');
      seen.push(t.where());
    }
    expect(seen).toEqual(['P1/name', 'V1/name', 'V2/name', 'P2/name']);
  });
});

describe('the focus never lost', () => {
  it('a collapse by the application hiding the focus puts it on the parent, same column, in the DOM', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.focus('V1', 'n');
    t.expand(['S0'], false);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('S0'), column: 'n' });
    expect(t.where()).toBe('S0/n');
  });

  it('a collapse by a click on an ancestor’s toggle', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.focus('V2');
    t.toggle('P1')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.where()).toBe('P1/name');
  });

  it('with paints on the next frame too', () => {
    const frames: (() => void)[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
    const flush = () => { for (let i = 0; i < 5 && frames.length; i++) frames.splice(0).forEach((f) => f()); };
    const t = tmake({ tree: { initial: 'all' }, raf });
    flush();
    t.focus('V1');
    flush();
    expect(t.where()).toBe('V1/name');
    t.expand(['S0'], false);
    flush();
    expect(t.where()).toBe('S0/name');
    expect(idOf((t.g.kernel.focus as { row?: never } | null)?.row)).toBe('S0');
  });

  it('no tab stop is added: one stop, the focused cell', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.focus('P1');
    expect([...t.host.querySelectorAll('[tabindex="0"]')]).toEqual([t.cell('P1')]);
  });
});
