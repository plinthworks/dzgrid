// `tree({ fixedOpen })` in the DOM (1.1.0, step 14; tree-view.md « rows always open », tree-keys.md): no chevron and no
// 24 px slot on the rows always open (body and pinned copies, pooled cells given back), aria-expanded kept, the indent
// kept, the keys never closing them (left to right and right to left), collapse-all through the kernel, the editor's
// field placed by edit.css. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, idOf, k, tmake, wide, type T } from './support-tree.js';
import { lazyChildren } from '../src/tree-lazy.js';
import { sourceRows, type ChildRequest } from '@dzgrid/core/server';

afterEach(cleanup);

/** S0 and S1 always open (SMALL: S0 › P1 › V1, V2; S0 › P2; S1 › P3; S2). */
const top = (r: T) => r.id === 'S0' || r.id === 'S1';
const pad = (px: number) => `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${px}px)`;
const hasToggle = (c: HTMLElement | null) => !!c && c.firstElementChild?.classList.contains('dzg-toggle') === true;

describe('drawn: no chevron, no slot; the rest unchanged', () => {
  it('default (no fixedOpen): every tree cell keeps its toggle (S0 closed)', () => {
    const t = tmake();
    expect(['S0', 'S1', 'S2'].map((id) => hasToggle(t.cell(id)))).toEqual([true, true, true]);
  });

  it('the fixed rows: open, aria-expanded="true", no toggle element; the nested parent keeps its chevron, closed', () => {
    const t = tmake({ tree: { fixedOpen: top } });
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    expect(['S0', 'S1'].map((id) => [t.row(id)!.getAttribute('aria-expanded'), hasToggle(t.cell(id)), t.cell(id)!.querySelector('.dzg-toggle')])).toEqual([['true', false, null], ['true', false, null]]);
    expect(t.row('P1')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.toggle('P1')!.hasAttribute('data-open')).toBe(false);
    expect(t.toggle('P1')!.hasAttribute('data-leaf')).toBe(false);
    // A leaf root that is not fixed keeps its (hidden) place.
    expect(t.toggle('S2')!.hasAttribute('data-leaf')).toBe(true);
    // The indent kept, written for the field too.
    expect([t.cell('S0')!.style.getPropertyValue('padding-inline-start'), t.cell('P1')!.style.getPropertyValue('padding-inline-start')]).toEqual([pad(0), pad(16)]);
    expect(t.cell('P1')!.style.getPropertyValue('--dzg-tree-pad')).toBe(pad(16));
  });

  it('a nested row fixed: no toggle there either, its indent kept', () => {
    const t = tmake({ tree: { fixedOpen: (r) => top(r) || r.id === 'P1' } });
    expect(t.shown()).toEqual(['S0', 'P1', 'V1', 'V2', 'P2', 'S1', 'P3', 'S2']);
    expect(hasToggle(t.cell('P1'))).toBe(false);
    expect(t.cell('P1')!.style.getPropertyValue('padding-inline-start')).toBe(pad(16));
  });

  it('a throw counts as not fixed: that row has its chevron and is closed', () => {
    const t = tmake({ tree: { fixedOpen: (r) => { if (r.id === 'S1') throw new Error('no'); return top(r); } } });
    expect(hasToggle(t.cell('S1'))).toBe(true);
    expect(t.row('S1')!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('never closed: keys, collapse-all, rows.expand', () => {
  it('left to right: back on it moves nowhere (a root) and closes nothing; forward is the column move; `*` closes nothing', () => {
    const t = tmake({ tree: { fixedOpen: top } });
    t.focus('S0');
    t.press('ArrowLeft');
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    expect(t.where()).toBe('S0/name');
    t.press('*');
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    t.press('ArrowRight');
    expect(t.where()).toBe('S0/n');
    expect(t.expandedEvents()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('a nested fixed row: back goes to its parent, as on a leaf; the other parent still opens and closes by the keys', () => {
    const t = tmake({ tree: { fixedOpen: (r) => top(r) || r.id === 'P1' } });
    t.focus('P1');
    t.press('ArrowLeft');
    expect(t.where()).toBe('S0/name');
    expect(t.shown()).toContain('V1');
    t.focus('P3');
    expect(t.row('P3')!.hasAttribute('aria-expanded')).toBe(false);
    const u = tmake({ tree: { fixedOpen: (r) => r.id === 'S0' } });
    u.focus('S1');
    u.press('ArrowRight');
    expect(u.shown()).toContain('P3');
    u.press('ArrowLeft');
    expect(u.shown()).not.toContain('P3');
    expect(u.expandedEvents().map((e) => [e.rows.map(idOf), e.expanded])).toEqual([[['S1'], true], [['S1'], false]]);
  });

  it('right to left: back (→) closes nothing, forward (←) is the column move', () => {
    const t = tmake({ lang: 'ar', tree: { fixedOpen: top } });
    t.focus('S0');
    t.press('ArrowRight');
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    expect(t.where()).toBe('S0/name');
    t.press('ArrowLeft');
    expect(t.where()).toBe('S0/n');
    expect(t.expandedEvents()).toEqual([]);
  });

  it('collapse-all and rows.expand(false) through the kernel: still open, aria-expanded="true", nothing said', () => {
    const t = tmake({ tree: { fixedOpen: top } });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    t.expand(['S0', 'S1'], false, 'user');
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
    expect(t.row('S0')!.getAttribute('aria-expanded')).toBe('true');
    // Collapse-all closed P1 alone (said, as any single row); never a fixed one.
    expect(t.said().filter((x) => /collapsed/.test(x))).toEqual(['Patient 1 collapsed']);
  });
});

describe('pooled cells and pinned copies', () => {
  it('a cell scrolled from a fixed row to a closable parent gets its toggle back, and the other way', () => {
    // S0 (fixed, 40 children) then S1 (closed, 40 children): one screen holds 10 rows.
    const t = tmake({ rows: wide(3, 40), tree: { fixedOpen: (r) => r.id === 'S0' || r.id === 'S2' } });
    expect(hasToggle(t.cell('S0'))).toBe(false);
    t.scroll(32 * 41);
    expect(hasToggle(t.cell('S1'))).toBe(true);
    t.expand(['S1'], true);
    t.scroll(32 * 82);
    expect(hasToggle(t.cell('S2'))).toBe(false);
    t.scroll(0);
    expect(hasToggle(t.cell('S0'))).toBe(false);
    expect(hasToggle(t.cell('S0-0'))).toBe(true);
  });

  it('the pinned copy of a fixed parent has no toggle either', () => {
    const t = tmake({ rows: wide(2, 40), tree: { fixedOpen: (r) => r.id === 'S0' } });
    t.scroll(32 * 10);
    const copy = t.host.querySelector<HTMLElement>('.dzg-sticky .dzg-row .dzg-cell[data-col="name"]');
    expect(copy?.textContent).toBe('Service 0');
    expect(hasToggle(copy)).toBe(false);
  });
});

describe('the editor field in a cell without a chevron (edit.css)', () => {
  it('starts at the indent (the cell padding taken off), the chevron rule still after it in the file', () => {
    const css = readFileSync(`${process.cwd()}/packages/theme/edit.css`, 'utf8').replace(/\s+/g, ' ');
    const rule = '[style*="--dzg-tree-pad"] > [data-dzg-owner] { inset-inline-start: calc(var(--dzg-tree-pad) - var(--dzg-cell-padding-inline, 0.5rem)); }';
    expect(css).toContain(rule);
    // Same weight as the chevron's rule: that one wins by coming after.
    expect(css.indexOf(rule)).toBeLessThan(css.indexOf('.dzg-toggle ~ [data-dzg-owner] {'));
    const plain = readFileSync(`${process.cwd()}/packages/theme/edit.unlayered.css`, 'utf8').replace(/\s+/g, ' ');
    expect(plain).toContain(rule);
  });

  it('a field whose own direction is not its cell\'s (dir=auto: a Latin name in Arabic) takes the indent at its other end', () => {
    const css = readFileSync(`${process.cwd()}/packages/theme/edit.css`, 'utf8').replace(/\s+/g, ' ');
    const rule = ':dir(rtl)[style*="--dzg-tree-pad"] > :dir(ltr), :dir(ltr)[style*="--dzg-tree-pad"] > :dir(rtl) { inset-inline: 0 calc(var(--dzg-tree-pad) - var(--dzg-cell-padding-inline, 0.5rem)); }';
    expect(css).toContain(rule);
    // Before the chevron's rules, which win in a cell with a chevron.
    expect(css.indexOf(rule)).toBeLessThan(css.indexOf('.dzg-toggle ~ [data-dzg-owner] {'));
    expect(readFileSync(`${process.cwd()}/packages/theme/edit.unlayered.css`, 'utf8').replace(/\s+/g, ' ')).toContain(rule);
  });
});

describe('with lazy children (review of step 14)', () => {
  // S1 and S2 always open, their children loaded on demand.
  const LZ = [
    { id: 'S1', parent: null, name: 'Table 1', n: 1, lazy: true },
    { id: 'S2', parent: null, name: 'Table 2', n: 2, lazy: true },
  ] as (T & { lazy?: boolean })[];
  const setup = () => {
    const loads: { row: T; resolve(v: readonly T[]): void }[] = [];
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy, load: (row: T) => new Promise<readonly T[]>((resolve) => void loads.push({ row, resolve })) });
    const t = tmake({ rows: LZ, tree: { lazy, fixedOpen: (r) => !!(r as { lazy?: boolean }).lazy } });
    return { ...t, loads };
  };

  it('a fixed lazy parent loads its children at once; no chevron; ← goes nowhere and closes nothing', async () => {
    const t = setup();
    expect(t.loads.map((l) => l.row.id)).toEqual(['S1', 'S2']);
    expect(hasToggle(t.cell('S1'))).toBe(false);
    expect(t.row('S1')!.getAttribute('aria-expanded')).toBe('true');
    t.focus('S1');
    t.press('ArrowLeft');
    expect(t.where()).toBe('S1/name');
    expect(t.expandedEvents()).toEqual([]);
    t.loads[0]!.resolve([{ id: 'S1-0', parent: 'S1', name: 'Line', n: 3 }]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(t.shown().slice(0, 3)).toEqual(['S1', 'S1-0', 'S2']);
    expect(hasToggle(t.cell('S1'))).toBe(false);
    t.expand(['S1', 'S2'], false, 'user');
    expect(t.shown().slice(0, 3)).toEqual(['S1', 'S1-0', 'S2']);
    expect(t.expandedEvents()).toEqual([]);
  });

  it('a server tree: the fixed parent asks the server for its children once its page arrives; no chevron', async () => {
    const asked: ChildRequest<T>[] = [];
    const answers: ((rows: T[]) => void)[] = [];
    const source = sourceRows<T>({
      fetch: () => ({ rows: LZ, total: 2 }),
      children: (req) => new Promise((ok) => (asked.push(req), answers.push(ok as never))),
    });
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy });
    const t = tmake({ rows: [], tree: { lazy, fixedOpen: (r) => r.id === 'S1' }, settings: { rows: undefined, source } as never });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(asked.map((r) => r.id)).toEqual(['S1']);
    expect(hasToggle(t.cell('S1'))).toBe(false);
    expect(hasToggle(t.cell('S2'))).toBe(true);
    answers[0]!([{ id: 'S1-0', parent: 'S1', name: 'Line', n: 3 }]);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(t.shown()).toEqual(['S1', 'S1-0', 'S2']);
  });
});
