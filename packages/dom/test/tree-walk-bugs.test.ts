// Review of phase 4 step 4: targeted tests the random walk (tree-walk.test.ts) leans on, and the
// real bugs it found (B1, B2) with the review's findings, each seen failing before its fix.
import { describe, it, expect, afterEach } from 'vitest';
import type { RowKey } from '@dzgrid/core';
import { cleanup, click, idOf, k, SMALL, tmake, wide } from './support-tree.js';

afterEach(cleanup);

const rafEnv = () => {
  const frames: (() => void)[] = [];
  const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
  const flush = () => { for (let i = 0; i < 8 && frames.length; i++) frames.splice(0).forEach((f) => f()); };
  return { raf, flush };
};

describe('the anchor, rows and openings in one frame', () => {
  it('a transaction and an opening before one paint: the transaction’s rule wins (the end stays the end)', () => {
    for (const order of ['expand first', 'rows first'] as const) {
      const { raf, flush } = rafEnv();
      const t = tmake({ rows: wide(50, 4), raf });
      flush();
      t.scroll(50 * 32 - 320);
      flush();
      expect(t.ctx.scroll.atEnd).toBe(true);
      const add = () => t.g.kernel.rows.applyTransaction({ add: [{ id: 'Z', parent: null, name: 'Z', n: 99 }] });
      const open = () => t.expand(['S47']);
      if (order === 'expand first') (open(), add());
      else (add(), open());
      flush();
      expect(t.ctx.scroll.logicalTop, order).toBe(t.ctx.scroll.mapper!.maxLogical);
      cleanup();
    }
  });

  it('an opening alone after a transaction was painted keeps the top row (the kind is reset each paint)', () => {
    const t = tmake({ rows: wide(50, 4) });
    t.scroll(50 * 32 - 320);
    t.g.kernel.rows.applyTransaction({ add: [{ id: 'Z', parent: null, name: 'Z', n: 99 }] });
    const top = t.ctx.scroll.logicalTop;
    t.expand(['S48']);
    expect(t.ctx.scroll.logicalTop).toBe(top);
  });
});

describe('what is said: once per user action, never for the host', () => {
  it('`*` opening one sibling says the one-row sentence; Arabic and right to left change nothing to the count', () => {
    const t = tmake({ lang: 'ar', rows: wide(2, 2) });
    t.expand(['S0']);
    t.focus('S0');
    t.press('*');
    expect(t.said()).toHaveLength(1);
    expect(t.said()[0]).toContain('Service 1');
  });

  it('a key that closes, then the same key again (to the parent): one sentence only', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.focus('P1');
    t.press('ArrowLeft');
    t.press('ArrowLeft');
    expect(t.said()).toEqual(['Patient 1 collapsed']);
    expect(t.where()).toBe('S0/name');
  });

  it('a filter, a sort, a transaction and expandAll by the host say nothing of the tree', () => {
    const t = tmake();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Visit' } }, 'api');
    t.g.kernel.rows.applyTransaction({ remove: ['P1'] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('S0')], expanded: false }, 'api');
    expect(t.said().filter((s) => /expanded|collapsed/.test(s))).toEqual([]);
  });
});

describe('decoration on pooled rows and a former tree column', () => {
  it('scrolling a deep open tree recycles rows: every mounted tree cell padded for its own level, no other cell padded', () => {
    const t = tmake({ rows: wide(30, 6), tree: { initial: 'all' } });
    for (const top of [0, 7 * 32, 90 * 32, 3 * 32, 200 * 32 - 320, 0]) {
      t.scroll(top);
      for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
        const lvl = Number(r.getAttribute('aria-level'));
        const id = idOf(t.ctx.rowRenderer.keyOf(r));
        expect(lvl, `${top} ${id}`).toBe(id!.includes('-') ? 2 : 1);
        for (const c of r.querySelectorAll<HTMLElement>('.dzg-cell')) {
          const tree = c.dataset['col'] === 'name';
          expect(c.style.paddingInlineStart, `${top} ${id}/${c.dataset['col']}`).toBe(tree ? `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${(lvl - 1) * 16}px)` : '');
          expect(!!c.querySelector('.dzg-toggle'), `${top} ${id}/${c.dataset['col']}`).toBe(tree);
        }
      }
    }
  });

  it('the tree column hidden (named), then shown again: no cell keeps a toggle while hidden, all back after', () => {
    const t = tmake({ tree: { column: 'name', initial: 'all' } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'api');
    expect(t.host.querySelector('.dzg-toggle')).toBeNull();
    expect([...t.host.querySelectorAll<HTMLElement>('.dzg-cell')].every((c) => c.style.paddingInlineStart === '')).toBe(true);
    // The rows keep their tree attributes (the hierarchy is still the rows').
    expect(t.row('V1')!.getAttribute('aria-level')).toBe('3');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: false }] }, 'api');
    expect(t.toggle('P1')!.hasAttribute('data-open')).toBe(true);
    expect(t.cell('V1')!.style.paddingInlineStart).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 32px)');
  });

  it('pinning the tree column to the end and back keeps one toggle per tree cell', () => {
    const t = tmake({ tree: { initial: 'all' } });
    for (const pinned of ['end', 'start', null] as const) {
      t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', pinned }] }, 'api');
      const first = t.ctx.columns.visible()[0]!.id;
      for (const id of ['S0', 'P1', 'V1']) expect(t.cell(id, first)!.querySelectorAll('.dzg-toggle').length, `${pinned} ${id}`).toBe(1);
      expect(t.host.querySelectorAll('.dzg-toggle').length).toBe(t.host.querySelectorAll('.dzg-layer > .dzg-row').length);
    }
  });
});

describe('teardown', () => {
  it('after destroy: keys and toggle clicks on the old elements do nothing, nothing is said, role given back', () => {
    const t = tmake();
    t.focus('S0');
    const cell = t.active();
    const tg = t.toggle('S1')!;
    const vp = t.vp;
    t.g.destroy();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: '*', bubbles: true, cancelable: true }));
    click(tg);
    expect(t.expandedEvents()).toEqual([]);
    expect(t.said()).toEqual([]);
    expect(vp.getAttribute('role')).toBe('grid');
  });
});

describe('real bugs found by the walk (fixed)', () => {
  // B1 (base, made reachable by the tree's host-driven collapses): the focused cell's element is moved
  // to another pinned segment, the DOM focus drops to <body> without a focusout the grid can read, and
  // g.hasFocus stays true. The user then works in an outside input; the next data move of the focus
  // (here a collapse by the application hiding the focused row) takes the focus out of that input.
  it('B1: a collapse by the host never takes the focus from an outside input after a pin', () => {
    const t = tmake({ tree: { initial: 'all' } });
    const outside = document.createElement('input');
    document.body.append(outside);
    t.focus('V1', 'n');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', pinned: 'end' }] }, 'api');
    outside.focus();
    t.expand(['P1'], false);
    expect(document.activeElement).toBe(outside);
  });

  // B2 (base, pre-existing; flat grid too): pinning or unpinning the focused cell's column drops the
  // DOM focus to <body> (the cell element is moved between segments; a move blurs).
  it('B2: pinning the focused column keeps the DOM focus on its cell', () => {
    const t = tmake({ tree: null });
    t.focus('S0', 'name');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', pinned: 'end' }] }, 'api');
    expect(t.where()).toBe('S0/name');
  });
});

describe('review of step 4: the focus, the view and what is said', () => {
  it('B1: a grid that wrongly believes it has the focus never pulls it from an outside input', () => {
    const t = tmake({ tree: { initial: 'all' } });
    const outside = document.createElement('input');
    document.body.append(outside);
    t.focus('V1');
    outside.focus();
    // Any path that loses the DOM focus unseen leaves this flag stale: the DOM is what counts.
    t.ctx.hasFocus = true;
    t.expand(['P1'], false);
    expect(document.activeElement).toBe(outside);
  });

  it('B2 flat and header: pinning the focused header keeps the DOM focus on it', () => {
    const t = tmake({ tree: null });
    t.g.api.focusCell(k('S0'), 'n');
    t.press('ArrowUp');
    expect(document.activeElement!.classList.contains('dzg-hcell')).toBe(true);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', pinned: 'start' }] }, 'api');
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('n');
  });

  it('the select-all box keeps the focus when a transaction removes the focused row', () => {
    const t = tmake({ tree: { initial: 'all' }, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.focus('V1');
    const box = t.host.querySelector<HTMLElement>('.dzg-hcell.dzg-check .dzg-box')!;
    box.focus();
    expect(document.activeElement).toBe(box);
    t.g.kernel.rows.applyTransaction({ remove: ['V1'] });
    expect(idOf((t.g.kernel.focus as { row: RowKey }).row)).not.toBe('V1');
    expect(document.activeElement).toBe(box);
  });

  it('a host collapse hiding the top row: the view anchors on its nearest shown ancestor, at the top', () => {
    for (const [close, want] of [['S10', 'S10'], ['S10-2', null]] as const) {
      const t = tmake({ rows: wide(50, 4), tree: { initial: 'all' } });
      const at = (id: string) => t.g.kernel.rows.displayed.indexOf(k(id)) * 32;
      t.scroll(at('S10-2') + 5);
      t.expand([close], false);
      // A closed row still shown keeps its place (the top row is not hidden).
      expect(t.ctx.scroll.logicalTop, close).toBe(want === null ? at('S10-2') + 5 : at(want));
      cleanup();
    }
  });

  it('two levels up: a closed grandparent anchors the view on itself', () => {
    const t = tmake({ rows: Array.from({ length: 30 }, (_, i) => [{ id: `G${i}`, parent: null, name: `G${i}`, n: i }, ...SMALL.map((r) => ({ ...r, id: `${r.id}.${i}`, parent: r.parent ? `${r.parent}.${i}` : `G${i}` }))]).flat(), tree: { initial: 'all' } });
    const at = (id: string) => t.g.kernel.rows.displayed.indexOf(k(id)) * 32;
    t.scroll(at('V2.5') + 7);
    t.expand(['G5'], false);
    expect(t.ctx.scroll.logicalTop).toBe(at('G5'));
  });

  it('the named tree column hidden: an opening is said with the first visible column\'s text, never an empty name', () => {
    const t = tmake({ tree: { column: 'name', initial: 'all' } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'api');
    t.expand(['S0'], false, 'user');
    expect(t.said()).toEqual(['0 collapsed']);
  });
});
