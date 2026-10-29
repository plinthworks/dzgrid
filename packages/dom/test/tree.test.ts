// `@dzgrid/dom/tree` (Phase 4 step 4): docs/behaviors/tree-view.md, tree-filter.md; WAI-ARIA 1.2
// treegrid. Expectations written by hand from the sheets, before the code.
import { describe, it, expect, afterEach } from 'vitest';
import type { Problem } from '@dzgrid/core';
import { spans } from '../src/spans.js';
import { sourceRows } from '@dzgrid/core/server';
import { pagination } from '../src/pagination.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { TREE_KEYS } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { BUNDLES, cleanup, click, k, tmake, wide, SMALL } from './support-tree.js';

afterEach(cleanup);

const attrs = (el: HTMLElement | null) => el && ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((a) => el.getAttribute(a));
const problemsOf = (events: { type: string }[]) => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

describe('the treegrid rows (WAI-ARIA 1.2)', () => {
  it('shows the roots closed at first, each with its level, place among siblings and open state', () => {
    const t = tmake();
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
    expect(attrs(t.row('S0'))).toEqual(['1', '1', '3', 'false']);
    expect(attrs(t.row('S1'))).toEqual(['1', '2', '3', 'false']);
    // A leaf carries no aria-expanded.
    expect(attrs(t.row('S2'))).toEqual(['1', '3', '3', null]);
    // Rows are counted as on a flat grid.
    expect(t.vp.getAttribute('aria-rowcount')).toBe('4');
    expect(t.row('S2')!.getAttribute('aria-rowindex')).toBe('4');
  });

  it('follows an opening: children at level 2 under their parent, the parent expanded', () => {
    const t = tmake();
    t.expand(['S0', 'P1']);
    expect(t.shown()).toEqual(['S0', 'P1', 'V1', 'V2', 'P2', 'S1', 'S2']);
    expect(attrs(t.row('S0'))).toEqual(['1', '1', '3', 'true']);
    expect(attrs(t.row('P1'))).toEqual(['2', '1', '2', 'true']);
    expect(attrs(t.row('V2'))).toEqual(['3', '2', '2', null]);
    expect(attrs(t.row('P2'))).toEqual(['2', '2', '2', null]);
    t.expand(['S0'], false);
    expect(attrs(t.row('S0'))).toEqual(['1', '1', '3', 'false']);
    expect(t.row('P1')).toBeNull();
  });

  it('keeps the attributes right through a sort (children ordered among themselves)', () => {
    const t = tmake();
    t.expand(['S0', 'P1']);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(t.shown()).toEqual(['S2', 'S1', 'S0', 'P2', 'P1', 'V2', 'V1']);
    expect(attrs(t.row('S2'))).toEqual(['1', '1', '3', null]);
    expect(attrs(t.row('P2'))).toEqual(['2', '1', '2', null]);
    expect(attrs(t.row('V1'))).toEqual(['3', '2', '2', null]);
  });

  it('under a filter: matches and their ancestors, the ancestors muted, setsize the siblings shown', () => {
    const t = tmake();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Visit 2' } }, 'user');
    expect(t.shown()).toEqual(['S0', 'P1', 'V2']);
    expect(attrs(t.row('P1'))).toEqual(['2', '1', '1', 'true']);
    expect(attrs(t.row('V2'))).toEqual(['3', '1', '1', null]);
    expect(t.row('S0')!.hasAttribute('data-context-row')).toBe(true);
    expect(t.row('P1')!.hasAttribute('data-context-row')).toBe(true);
    expect(t.row('V2')!.hasAttribute('data-context-row')).toBe(false);
    // Cleared: the user's tree as it was (all closed), nothing muted.
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: null }, 'user');
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
    expect(t.host.querySelector('[data-context-row]')).toBeNull();
  });

  it('opens at the start as the application chose (`initial`)', () => {
    expect(tmake({ tree: { initial: 'all' } }).shown()).toEqual(['S0', 'P1', 'V1', 'V2', 'P2', 'S1', 'P3', 'S2']);
    expect(tmake({ tree: { initial: 1 } }).shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'P3', 'S2']);
  });

  it('a recycled row element loses the tree attributes it no longer needs', () => {
    const t = tmake({ rows: wide(30, 3) });
    t.expand(['S0']);
    expect(t.row('S0-0')!.getAttribute('aria-level')).toBe('2');
    t.expand(['S0'], false);
    for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) expect(r.getAttribute('aria-level')).toBe('1');
  });
});

describe('the tree cell', () => {
  it('is the first visible column: indented per level, a decorative toggle first, no tab stop', () => {
    const t = tmake({ tree: { initial: 'all' } });
    const pad = (id: string) => t.cell(id)!.style.paddingInlineStart;
    expect(pad('S0')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 0px)');
    expect(pad('P1')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 16px)');
    expect(pad('V1')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 32px)');
    const tg = t.toggle('S0')!;
    expect(t.cell('S0')!.firstChild).toBe(tg);
    expect(tg.getAttribute('aria-hidden')).toBe('true');
    expect(tg.hasAttribute('tabindex')).toBe(false);
    expect(tg.textContent).toBe('');
    expect(tg.hasAttribute('data-open')).toBe(true);
    // A leaf keeps the same place (its toggle hidden by the theme), so labels of one level line up.
    expect(t.toggle('V1')!.hasAttribute('data-leaf')).toBe(true);
    // The cell still reads its label only.
    expect(t.cell('P1')!.textContent).toBe('Patient 1');
    // Other columns: nothing.
    expect(t.cell('S0', 'n')!.querySelector('.dzg-toggle')).toBeNull();
    expect(t.cell('S0', 'n')!.style.paddingInlineStart).toBe('');
    expect(t.host.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it('marks a closed parent apart from an open one', () => {
    const t = tmake();
    expect(t.toggle('S0')!.hasAttribute('data-open')).toBe(false);
    expect(t.toggle('S0')!.hasAttribute('data-leaf')).toBe(false);
  });

  it('takes `indent` and `column`; a tree column that is not first is allowed and warned once', () => {
    const t = tmake({ tree: { indent: 20, column: 'n', initial: 'all' } });
    expect(t.cell('P1', 'n')!.style.paddingInlineStart).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 20px)');
    expect(t.cell('P1', 'n')!.querySelector('.dzg-toggle')).not.toBeNull();
    expect(t.cell('P1')!.querySelector('.dzg-toggle')).toBeNull();
    const warned = problemsOf(t.events).filter((p) => p.code === 'tree-column-not-first');
    expect(warned).toEqual([expect.objectContaining({ code: 'tree-column-not-first', severity: 'warning', path: 'tree.column' })]);
    t.g.api.refresh();
    expect(problemsOf(t.events).filter((p) => p.code === 'tree-column-not-first').length).toBe(1);
  });

  it('warns a tree column not first once per grid, not again at each row update (owner demo, step 16)', () => {
    for (const features of [[], [spans()]]) {
      const t = tmake({ tree: { column: 'n', initial: 'all' }, features });
      for (let i = 0; i < 3; i++) t.g.update({ rows: SMALL.map((r) => ({ ...r })) });
      expect(problemsOf(t.events).filter((p) => p.code === 'tree-column-not-first').length).toBe(1);
    }
  });

  it('a column hidden then shown again in the same order: not warned again (once per column order)', () => {
    const t = tmake({ tree: { column: 'n', initial: 'all' } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: false }] }, 'api');
    for (let i = 0; i < 3; i++) t.g.update({ rows: SMALL.map((r) => ({ ...r })) });
    expect(problemsOf(t.events).filter((p) => p.code === 'tree-column-not-first').length).toBe(1);
  });

  it('warns once per grid on a server source too, over three refreshes', () => {
    // A source in place of rows: the settings' exact optional types refuse `rows: undefined`, hence the cast.
    const t = tmake({ tree: { column: 'n', initial: 'all' }, settings: { rows: undefined, source: sourceRows({ fetch: () => ({ rows: SMALL.map((r) => ({ ...r })), total: SMALL.length }) }) } as never });
    for (let i = 0; i < 3; i++) t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    expect(problemsOf(t.events).filter((p) => p.code === 'tree-column-not-first').length).toBe(1);
  });

  it('follows the first visible column when the columns change; the old cells are cleaned', () => {
    const t = tmake({ tree: { initial: 'all' } });
    t.g.update({ columns: [{ id: 'n', header: 'N', type: 'number', width: 100 }, { id: 'name', header: 'Name', width: 160 }] });
    expect(t.cell('P1', 'n')!.querySelector('.dzg-toggle')).not.toBeNull();
    expect(t.cell('P1')!.querySelector('.dzg-toggle')).toBeNull();
    expect(t.cell('P1')!.style.paddingInlineStart).toBe('');
    expect(problemsOf(t.events).some((p) => p.code === 'tree-column-not-first')).toBe(false);
  });
});

describe('the pointer on the toggle', () => {
  it('opens and closes the row, never selects it nor tells a row click', () => {
    const t = tmake({ settings: { selection: { mode: 'multi', click: true } } });
    click(t.toggle('S0')!);
    expect(t.shown()).toEqual(['S0', 'P1', 'P2', 'S1', 'S2']);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.events.some((e) => e.type === 'rowClicked')).toBe(false);
    expect(t.expandedEvents()).toEqual([expect.objectContaining({ source: 'user', rows: [k('S0')], expanded: true })]);
    click(t.toggle('S0')!);
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
    // Elsewhere in the cell: the row is selected, nothing opens.
    click(t.cell('S0')!);
    expect([...t.g.kernel.selection.keys]).toEqual([k('S0')]);
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
  });

  it('a leaf’s hidden toggle does nothing of its own', () => {
    const t = tmake({ settings: { selection: { mode: 'multi', click: true } } });
    click(t.toggle('S2')!);
    expect(t.expandedEvents()).toEqual([]);
    expect([...t.g.kernel.selection.keys]).toEqual([k('S2')]);
  });
});

describe('what is said', () => {
  it('says an opening by the user with the row’s name and its rows, a closing with its name; once each', () => {
    const t = tmake();
    click(t.toggle('S0')!);
    expect(t.said()).toEqual(['Service 0 expanded, 2 rows']);
    click(t.toggle('S0')!);
    expect(t.said()).toEqual(['Service 0 expanded, 2 rows', 'Service 0 collapsed']);
    t.expand(['S1']);
    click(t.toggle('S1')!);
    expect(t.said().at(-1)).toBe('Service 1 collapsed');
  });

  it('says nothing for the application’s own openings', () => {
    const t = tmake();
    t.expand(['S0']);
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    expect(t.said()).toEqual([]);
  });

  it('in French and Arabic, numbers in the grid’s locale', () => {
    const fr = tmake({ lang: 'fr', settings: { locale: 'fr-FR' } });
    click(fr.toggle('S0')!);
    expect(fr.said()).toEqual(['Service 0 développé, 2 lignes']);
    click(fr.toggle('S0')!);
    expect(fr.said().at(-1)).toBe('Service 0 réduit');
    const ar = tmake({ lang: 'ar', settings: { locale: 'ar-DZ' } });
    click(ar.toggle('S1')!);
    expect(ar.said()).toEqual(['تم توسيع Service 1، صف واحد (1)']);
  });

  it('every bundle has the four texts; tree() refuses a bundle without them', () => {
    for (const b of [EN_TREE, FR_TREE, AR_TREE]) expect(Object.keys(b.text).sort()).toEqual([...TREE_KEYS].sort());
    expect(() => tmake({ settings: { messages: { locale: 'en', text: { ...BUNDLES.en.text, 'tree.collapsed': undefined } } as never } })).toThrow(/tree\.collapsed/);
  });
});

describe('what a tree refuses beside it', () => {
  it('cell spans: allowed since 1.1.0 (owner Q15-1, spans.md « In a tree »), siblings only — no problem; only V1 and V2 (the one pair of consecutive siblings) merge', () => {
    const t = tmake({ features: [spans()], tree: { initial: 'all' }, settings: { columns: [{ id: 'name', header: 'Name', width: 160 }, { id: 'g', header: 'G', value: () => 'same', merge: true, width: 100 }] } });
    expect(problemsOf(t.events).filter((p) => p.code === 'unsupported-combination')).toEqual([]);
    expect([...t.host.querySelectorAll('.dzg-layer [aria-rowspan]')].map((c) => [c.closest('.dzg-row')!.getAttribute('aria-rowindex'), c.getAttribute('aria-rowspan')])).toEqual([['4', '2']]);
    expect(t.shown().length).toBe(8);
  });

  it('browser pages: a problem, and the tree shown without them', () => {
    const t = tmake({ features: [pagination()], settings: { pagination: { pageSize: 2 }, messages: { locale: 'en', text: { ...BUNDLES.en.text, ...EN_PAGINATION.text } } } });
    expect(problemsOf(t.events)).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', path: 'pagination', detail: 'tree' }));
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
  });

  it('an orphan is told (a parent id that names no row)', () => {
    const t = tmake({ rows: [...SMALL, { id: 'X', parent: 'nobody', name: 'X', n: 9 }] });
    expect(problemsOf(t.events)).toContainEqual(expect.objectContaining({ code: 'tree-orphan' }));
  });

  it('the base without the feature knows nothing of trees', () => {
    const t = tmake({ tree: null });
    expect(t.shown().length).toBe(8);
    expect(t.host.querySelector('[aria-level], .dzg-toggle')).toBeNull();
  });
});

describe('teardown', () => {
  it('a destroyed grid leaves no listener (a click on a detached toggle does nothing)', () => {
    const t = tmake();
    const tg = t.toggle('S0')!;
    t.g.destroy();
    click(tg);
    expect(t.expandedEvents()).toEqual([]);
  });
});
