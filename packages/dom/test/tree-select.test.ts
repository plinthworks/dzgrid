// `treeSelect()` beside `tree()`: cascading ticks (1.16.0, docs/behaviors/tree-selection.md « Cascading ticks » 1–6).
// Written before the code. Data (support-tree.ts SMALL): S0 › P1 › V1, V2; S0 › P2; S1 › P3; S2. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent } from '@dzgrid/core';
import { treeSelect } from '../src/tree-select.js';
import { lazyChildren } from '../src/tree-lazy.js';
import { cleanup, click, idOf, k, tmake, type T } from './support-tree.js';

afterEach(cleanup);

const SEL = { selection: { mode: 'multi' as const, checkbox: true } };
const make = (o: Parameters<typeof tmake>[0] & { off?: boolean } = {}) => {
  const t = tmake({ ...o, features: [...(o.off ? [] : [treeSelect()]), ...(o.features ?? [])], settings: { ...SEL, ...o.settings } });
  t.expand(['S0', 'P1', 'S1']);
  const box = (id: string) => t.row(id)!.querySelector<HTMLElement>('.dzg-check .dzg-box')!;
  const ticked = () => {
    const s = t.g.kernel.selection;
    return `${s.mode}:${[...s.keys].map((x) => idOf(x)).sort().join(',')}`;
  };
  const changes = () => t.events.filter((e): e is Extract<GridEvent<T>, { type: 'selectionChanged' }> => e.type === 'selectionChanged');
  const problems = () => t.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code}@${p.path}`) : []));
  return { ...t, box, ticked, changes, problems };
};

describe('down the branch (3)', () => {
  it('a click on a parent’s box ticks it and every row under it, one change from the user', () => {
    const t = make();
    click(t.box('S0'));
    expect(t.ticked()).toBe('include:P1,P2,S0,V1,V2');
    expect(t.changes().map((e) => e.source)).toEqual(['user']);
    click(t.box('S0'));
    expect(t.ticked()).toBe('include:');
  });

  it('Space on a row does the same, in any column', () => {
    const t = make();
    t.focus('P1', 'n');
    t.press(' ');
    expect(t.ticked()).toBe('include:P1,V1,V2');
  });

  it('rows under a closed parent are ticked too; a row the search hides is not', () => {
    const t = make();
    t.expand(['P1'], false);
    click(t.box('S0'));
    expect(t.ticked()).toBe('include:P1,P2,S0,V1,V2');
    const u = make();
    u.g.kernel.dispatch({ type: 'quick.set', text: 'Visit 1' }, 'user');
    click(u.box('S0'));
    expect(u.ticked()).toBe('include:P1,S0,V1');
  });
});

describe('up the branch (3)', () => {
  it('a leaf unticked unticks the rows above it; the last leaf ticked ticks them', () => {
    const t = make();
    click(t.box('S0'));
    click(t.box('V1'));
    expect(t.ticked()).toBe('include:P2,V2');
    click(t.box('V1'));
    expect(t.ticked()).toBe('include:P1,P2,S0,V1,V2');
  });

  it('under « all », the exceptions follow', () => {
    const t = make();
    // « All » as a server grid's header box makes it: every row, no exception.
    t.g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set() } }, 'api');
    click(t.box('P1'));
    expect(t.ticked()).toBe('exclude:P1,S0,V1,V2');
  });
});

describe('the box shows the branch (2)', () => {
  it('a parent’s box: a checkbox named by its row, true / mixed / false; a leaf’s unchanged', () => {
    const t = make();
    const b = t.box('S0');
    expect([b.getAttribute('role'), b.getAttribute('aria-label'), b.getAttribute('aria-checked')]).toEqual(['checkbox', 'Service 0', 'false']);
    click(t.box('V2'));
    expect([t.box('S0').getAttribute('aria-checked'), t.box('P1').getAttribute('aria-checked')]).toEqual(['mixed', 'mixed']);
    click(t.box('V1'));
    expect([t.box('S0').getAttribute('aria-checked'), t.box('P1').getAttribute('aria-checked')]).toEqual(['mixed', 'true']);
    expect([t.box('V1').getAttribute('role'), t.box('V1').getAttribute('aria-hidden')]).toEqual([null, 'true']);
  });

  it('other gestures select one row as before (4): Ctrl+A ticks all, every box true', () => {
    const t = make();
    t.focus('S2');
    t.press('a', { ctrlKey: true });
    expect([t.box('S0').getAttribute('aria-checked'), t.box('S1').getAttribute('aria-checked')]).toEqual(['true', 'true']);
  });
});

describe('opt-in (1)', () => {
  it('without it, a parent’s box ticks the parent alone', () => {
    const t = make({ off: true });
    click(t.box('S0'));
    expect(t.ticked()).toBe('include:S0');
  });

  it('without tree(): told once, nothing else', () => {
    const t = tmake({ tree: null, features: [treeSelect()], settings: SEL });
    const problems = t.events.flatMap((e) => (e.type === 'problems' ? e.problems.map((p) => `${p.code}@${p.path}`) : []));
    expect(problems).toEqual(['missing-feature@features.treeSelect']);
  });
});

describe('children not loaded yet (5)', () => {
  const ROWS: (T & { lazy?: boolean })[] = [
    { id: 'S0', parent: null, name: 'Service 0', n: 0 },
    { id: 'S1', parent: null, name: 'Service 1', n: 5, lazy: true },
  ];
  const kids = (p: string): T[] => [0, 1].map((i) => ({ id: `${p}-${i}`, parent: p, name: `Child ${p}.${i}`, n: i }));
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

  it('loaded children under a closed parent (review 1.16.0): ticked with it, and their box state', async () => {
    const answers: ((v: readonly T[]) => void)[] = [];
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy, load: () => new Promise<readonly T[]>((ok) => answers.push(ok)) });
    const t = tmake({ rows: ROWS, tree: { lazy }, features: [treeSelect()], settings: SEL });
    const box = (id: string) => t.row(id)!.querySelector<HTMLElement>('.dzg-check .dzg-box')!;
    t.expand(['S1']);
    answers[0]!(kids('S1'));
    await flush();
    t.expand(['S1'], false);
    click(box('S1'));
    expect([...t.g.kernel.selection.keys].map(idOf).sort()).toEqual(['S1', 'S1-0', 'S1-1']);
    click(box('S1'));
    expect([...t.g.kernel.selection.keys].map(idOf)).toEqual([]);
  });

  it('a parent ticked before its children load: they arrive ticked; unticked: they arrive unticked', async () => {
    const answers: ((v: readonly T[]) => void)[] = [];
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy, load: () => new Promise<readonly T[]>((ok) => answers.push(ok)) });
    const t = tmake({ rows: ROWS, tree: { lazy }, features: [treeSelect()], settings: SEL });
    const box = (id: string) => t.row(id)!.querySelector<HTMLElement>('.dzg-check .dzg-box')!;
    click(box('S1'));
    expect([...t.g.kernel.selection.keys].map(idOf)).toEqual(['S1']);
    t.expand(['S1']);
    answers[0]!(kids('S1'));
    await flush();
    expect([...t.g.kernel.selection.keys].map(idOf).sort()).toEqual(['S1', 'S1-0', 'S1-1']);
    expect(t.row('S1-0')!.getAttribute('aria-selected')).toBe('true');
  });
});
