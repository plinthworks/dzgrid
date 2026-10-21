// `@dzgrid/dom/tree`, nested and path shapes, filler rows, selection (Phase 4 step 5;
// docs/behaviors/tree-view.md, tree-selection.md; docs/phase-4-steps/step05-plan.md). By hand.
import { describe, it, expect, afterEach } from 'vitest';
import { groupKey, type RowKey } from '@dzgrid/core';
import type { SlotPart } from '../src/part.js';
import { cleanup, click, COLUMNS, k, tmake, type T } from './support-tree.js';

afterEach(cleanup);

type P = T & { path: string[]; kids?: P[] };
/** Service A and Service B have no row of their own: fillers. */
const PATHS: P[] = [
  { id: 'P1', parent: null, name: 'Patient 1', n: 1, path: ['Service A', 'P1'] },
  { id: 'P2', parent: null, name: 'Patient 2', n: 2, path: ['Service A', 'P2'] },
  { id: 'P3', parent: null, name: 'Patient 3', n: 3, path: ['Service B', 'P3'] },
];
const A = groupKey(['Service A']);
const B = groupKey(['Service B']);
const pathTree = { parentId: undefined, path: (r: T) => (r as P).path };

function make(o: Parameters<typeof tmake>[0] = {}) {
  const t = tmake({ rows: PATHS, tree: pathTree, settings: { selection: { mode: 'multi', checkbox: true, click: true } }, ...o });
  const rowOf = (key: RowKey) => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) === key) ?? null;
  const cellOf = (key: RowKey, col = 'name') => rowOf(key)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const ids = () => {
    const d = t.g.kernel.rows.displayed;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!);
      return n.kind === 'group' ? `[${n.label}]` : String((n as { id: unknown }).id);
    });
  };
  return { ...t, rowOf, cellOf, ids };
}
const attrs = (el: HTMLElement | null) => el && ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((a) => el.getAttribute(a));

describe('filler rows on screen', () => {
  it('a filler: data-kind group, its label in the tree column, other cells empty, treegrid attributes like a parent', () => {
    const t = make();
    expect(t.ids()).toEqual(['[Service A]', '[Service B]']);
    const row = t.rowOf(A)!;
    expect(row.getAttribute('data-kind')).toBe('group');
    expect(attrs(row)).toEqual(['1', '1', '2', 'false']);
    const label = t.cellOf(A)!.querySelector('.dzg-label');
    expect(label?.textContent).toBe('Service A');
    expect(t.cellOf(A)!.textContent).toBe('Service A');
    expect(t.cellOf(A)!.querySelector('.dzg-toggle')?.hasAttribute('data-leaf')).toBe(false);
    expect(t.cellOf(A, 'n')!.textContent).toBe('');
    expect(t.cellOf(A, 't')!.textContent).toBe('');
  });

  it('a filler has no aria-selected and no box; a data row has both', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [A], expanded: true }, 'user');
    const filler = t.rowOf(A)!;
    const data = t.rowOf(k('P1'))!;
    expect(filler.hasAttribute('aria-selected')).toBe(false);
    expect(data.getAttribute('aria-selected')).toBe('false');
    expect(data.hasAttribute('data-kind')).toBe(false);
    // The box cell stays (the columns line up); its box is not drawn.
    expect(filler.querySelector('.dzg-check')).not.toBeNull();
    expect(filler.querySelector<HTMLElement>('.dzg-check .dzg-box')?.hidden ?? true).toBe(true);
    expect(data.querySelector<HTMLElement>('.dzg-check .dzg-box')?.hidden).toBe(false);
    expect(t.cellOf(k('P1'))!.querySelector('.dzg-label')).toBeNull();
  });

  it('opens by its toggle, said with its label', () => {
    const t = make();
    click(t.cellOf(A)!.querySelector('.dzg-toggle')!);
    expect(t.ids()).toEqual(['[Service A]', 'P1', 'P2', '[Service B]']);
    expect(attrs(t.rowOf(A))).toEqual(['1', '1', '2', 'true']);
    expect(attrs(t.rowOf(k('P2')))).toEqual(['2', '2', '2', null]);
    expect(t.said()).toContain('Service A expanded, 2 rows');
    t.focus('P1');
    t.press('ArrowLeft');
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', row: A });
    t.press('ArrowLeft');
    expect(t.said()).toContain('Service A collapsed');
  });

  it('a recycled row view loses the label and the mark when it shows a data row again', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(t.ids()).toEqual(['[Service B]', 'P3', '[Service A]', 'P2', 'P1']);
    expect(t.host.querySelectorAll('.dzg-label').length).toBe(2);
    expect(t.host.querySelectorAll('.dzg-row[data-kind="group"]').length).toBe(2);
    for (const id of ['P1', 'P2', 'P3']) expect(t.rowOf(k(id))!.hasAttribute('data-kind')).toBe(false);
  });

  it('scrolling recycles row views between fillers and data rows: a data row never keeps a label (mutant 21)', () => {
    const rows: P[] = Array.from({ length: 40 }, (_, i) => ({ id: `R${i}`, parent: null, name: `Row ${i}`, n: i, path: [`Group ${i}`, `R${i}`] }));
    const t = make({ rows, block: 120 });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    for (const top of [0, 200, 410, 90, 600, 1000, 0]) {
      t.scroll(top);
      for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
        const group = r.getAttribute('data-kind') === 'group';
        const labels = r.querySelectorAll('.dzg-label').length;
        expect(labels, `${top}`).toBe(group ? 1 : 0);
        if (!group) expect(r.querySelector('.dzg-cell[data-col="name"]')!.textContent).toMatch(/^Row \d+$/);
      }
    }
  });

  it('a filler cell leaving the tree column keeps no label (column moved, destroyed)', () => {
    const t = make();
    expect(t.cellOf(A)!.querySelector('.dzg-label')).not.toBeNull();
    // The tree column moves to N: the old Name cell of the filler is given back plain.
    t.g.update({ columns: [COLUMNS.find((c) => c.id === 'n')!, ...COLUMNS.filter((c) => c.id !== 'n')] });
    expect(t.cellOf(A)!.querySelector('.dzg-label')).toBeNull();
    expect(t.cellOf(A)!.querySelector('.dzg-toggle')).toBeNull();
    expect(t.cellOf(A, 'n')!.querySelector('.dzg-label')?.textContent).toBe('Service A');
    // The tree feature taken down with the grid: no label left in a cell it decorated.
    const kept = t.cellOf(A, 'n')!;
    t.g.destroy();
    expect(kept.querySelector('.dzg-label')).toBeNull();
  });

  it('no cell part is mounted on a filler (a part expects a row)', () => {
    const seen: unknown[] = [];
    const part: SlotPart<'cell'> = { slot: 'cell', part: { mount: (el, c) => (seen.push(c.row), el.append('[part]'), {}) } };
    const columns = COLUMNS.map((c) => (c.id === 'n' ? { ...c, ui: { cell: 'p' } } : c));
    const t = make({ settings: { columns, parts: { p: part } } as never });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [A], expanded: true }, 'user');
    expect(t.cellOf(A, 'n')!.textContent).toBe('');
    expect(seen.every((r) => r !== undefined)).toBe(true);
    expect(t.cellOf(k('P1'), 'n')!.textContent).toBe('[part]');
  });

  it('right to left: the label is isolated in its own direction', () => {
    const t = make({ lang: 'ar' });
    const label = t.cellOf(A)!.querySelector('.dzg-label')!;
    expect(label.classList.contains('dzg-free')).toBe(true);
    expect(t.vp.getAttribute('role')).toBe('treegrid');
  });
});

describe('selection skips fillers (tree-selection.md)', () => {
  it('a click on a filler only moves the focus: no selection, no rowClicked', () => {
    const t = make();
    click(t.cellOf(A, 'n')!);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.events.some((e) => e.type === 'rowClicked')).toBe(false);
    click(t.cellOf(A, 'n')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(0);
    click(t.rowOf(A)!.querySelector('.dzg-check')!);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    // With an anchor, Shift on a filler makes no range either.
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [A], expanded: true }, 'user');
    click(t.cellOf(k('P1'), 'n')!);
    // The browser focuses the cell pressed (jsdom does not: done here by hand).
    t.cellOf(B, 'n')!.focus();
    click(t.cellOf(B, 'n')!, { shiftKey: true });
    expect([...t.g.kernel.selection.keys]).toEqual([k('P1')]);
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', row: B });
  });

  it('Space on a filler selects nothing; Ctrl+A and the header box take the data rows shown', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    t.g.api.focusCell(A, 'name');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.press('a', { ctrlKey: true });
    expect([...t.g.kernel.selection.keys].sort()).toEqual([k('P1'), k('P2'), k('P3')].sort());
    expect(t.g.kernel.headerState).toBe('all');
    t.g.kernel.dispatch({ type: 'selection.clear' }, 'user');
    click(t.host.querySelector<HTMLElement>('.dzg-header .dzg-check, [role="columnheader"].dzg-check')!);
    expect([...t.g.kernel.selection.keys].sort()).toEqual([k('P1'), k('P2'), k('P3')].sort());
  });

  it('a Shift range across a filler takes the data rows only; collapsing keeps them selected', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    click(t.cellOf(k('P2'), 'n')!);
    click(t.cellOf(k('P3'), 'n')!, { shiftKey: true });
    expect([...t.g.kernel.selection.keys]).toEqual([k('P2'), k('P3')]);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [B], expanded: false }, 'user');
    expect(t.rowOf(k('P3'))).toBeNull();
    expect(t.g.kernel.selection.keys.has(k('P3'))).toBe(true);
  });
});

describe('nested rows on screen', () => {
  it('every level a row, levels and places as with parent ids', () => {
    const nested: P[] = [{ id: 'S', parent: null, name: 'Service', n: 0, path: [], kids: [{ id: 'C', parent: null, name: 'Child', n: 1, path: [] }] }];
    const t = make({ rows: nested, tree: { parentId: undefined, children: (r: T) => (r as P).kids } });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.ids()).toEqual(['S', 'C']);
    expect(attrs(t.rowOf(k('C')))).toEqual(['2', '1', '1', null]);
    expect(t.host.querySelector('.dzg-row[data-kind]')).toBeNull();
  });
});
