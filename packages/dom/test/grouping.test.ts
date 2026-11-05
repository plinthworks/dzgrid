// `@dzgrid/dom/grouping` (Phase 7 step 5): docs/behaviors/row-grouping.md 1–22, aggregation.md 1–11, tree-keys.md « On a
// grouped grid »; WAI-ARIA 1.2 treegrid. Expectations written by hand from the sheets and the made-up rows of
// support-grouping.ts (Nord: r1 10, r3 2.5, r4 —; Sud: r2 5, r5 7; blank: r6 1), before the code.
import { describe, it, expect, afterEach } from 'vitest';
import { groupKey, type Problem } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { spans } from '../src/spans.js';
import { tree } from '../src/tree.js';
import { detail } from '../src/detail.js';
import { grouping, GROUP_KEYS } from '../src/grouping.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { FR_GROUP } from '../src/locales/fr-group.js';
import { AR_GROUP } from '../src/locales/ar-group.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { createGrid } from '../src/grid.js';
import { BUNDLES, cleanup, click, COLUMNS, gmake, k, ROWS, type R } from './support-grouping.js';

afterEach(cleanup);

const NORD = groupKey(['region', 'tNord']);
const SUD = groupKey(['region', 'tSud']);
const BLANK = groupKey(['region', '']);
const attrs = (el: HTMLElement | null) => el && ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'].map((a) => el.getAttribute(a));
const text = (el: HTMLElement | null) => el?.textContent ?? null;

describe('group rows on screen (row-grouping.md 1, 2, 15, 16; aggregation.md 1)', () => {
  it('shows the groups closed, ordered by value, the blank one last, each « value (n) » in the first column', () => {
    const t = gmake();
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]']);
    expect(t.label(NORD)).toBe('Nord (3)');
    expect(t.label(SUD)).toBe('Sud (2)');
    expect(t.label(BLANK)).toBe('(Blank) (1)');
    expect(t.row(NORD)!.dataset['kind']).toBe('group');
  });

  it("writes each group's totals under their columns, in the column's format; columns without a total stay empty", () => {
    const t = gmake();
    expect(text(t.cell(NORD, 'qty'))).toBe('12.5');
    expect(text(t.cell(SUD, 'qty'))).toBe('12');
    expect(text(t.cell(BLANK, 'qty'))).toBe('1');
    expect(text(t.cell(NORD, 'price'))).toBe('');
    expect(text(t.cell(NORD, 'fruit'))).toBe('');
    // Aligned like the column's values (a number column: at the end).
    expect(t.cell(NORD, 'qty')!.dataset['align']).toBe('end');
  });

  it('a count under a text column is a number; a min of days is a day as the column shows it; the label column keeps its label', () => {
    const t = gmake({ grouping: { by: ['region'], aggFuncs: { fruit: 'count', day: 'min', name: 'count' }, expanded: 'all' } });
    expect(text(t.cell(NORD, 'fruit'))).toBe('3');
    // Nord's earliest day is r1's: the same text as r1's own cell.
    expect(text(t.cell(NORD, 'day'))).toBe(text(t.cell('r1', 'day')));
    expect(text(t.cell(NORD, 'day'))).not.toBe('');
    expect(t.label(NORD)).toBe('Nord (3)');
    expect(t.cell(NORD, 'name')!.textContent).toBe('Nord (3)');
  });

  it('a total in French follows the language (decimal comma)', () => {
    const t = gmake({ lang: 'fr', settings: { locale: 'fr-FR' } });
    expect(text(t.cell(NORD, 'qty'))).toBe('12,5');
    expect(t.label(BLANK)).toBe('(Vide) (1)');
  });

  it('opens a group: its rows under it, indented one step, a chevron place kept; the data cells keep their own values', () => {
    const t = gmake();
    t.api().expandAll();
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]', 'r2', 'r5', '[]', 'r6']);
    expect(text(t.cell('r1', 'qty'))).toBe('10');
    expect(t.cell('r1', 'name')!.textContent).toBe('Shop 1');
    expect(t.toggle('r1')!.hasAttribute('data-leaf')).toBe(true);
    expect(t.toggle(NORD)!.hasAttribute('data-leaf')).toBe(false);
    expect(t.toggle(NORD)!.hasAttribute('data-open')).toBe(true);
    expect(t.cell(NORD)!.style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 0px)');
    expect(t.cell('r1')!.style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 16px)');
  });

  it('takes another group column and indent when asked', () => {
    const t = gmake({ grouping: { by: ['region'], column: 'fruit', indent: 20, expanded: 'all' } });
    expect(t.label(NORD, 'fruit')).toBe('Nord (3)');
    expect(t.label(NORD, 'name')).toBeNull();
    expect(t.cell('r1', 'fruit')!.style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 20px)');
  });
});

describe('the treegrid (row-grouping.md 11, 19)', () => {
  it('is a treegrid while grouped: groups with level, place and state; rows one level down; no aria-expanded on rows', () => {
    const t = gmake();
    expect(t.vp.getAttribute('role')).toBe('treegrid');
    expect(attrs(t.row(NORD))).toEqual(['1', '1', '3', 'false']);
    expect(attrs(t.row(BLANK))).toEqual(['1', '3', '3', 'false']);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [SUD], expanded: true }, 'api');
    expect(attrs(t.row(SUD))).toEqual(['1', '2', '3', 'true']);
    expect(attrs(t.row('r2'))).toEqual(['2', '1', '2', null]);
    expect(attrs(t.row('r5'))).toEqual(['2', '2', '2', null]);
  });

  it('two levels: the second level at 2, the rows at 3', () => {
    const t = gmake({ grouping: { by: ['region', 'fruit'], expanded: 'all' } });
    const apple = groupKey(['region', 'tNord', 'fruit', 'tapple']);
    expect(t.label(apple)).toBe('apple (2)');
    expect(attrs(t.row(apple))).toEqual(['2', '1', '2', 'true']);
    expect(attrs(t.row('r3'))).toEqual(['3', '2', '2', null]);
    expect(text(t.cell(apple, 'qty'))).toBe('12.5');
    expect(t.cell(apple)!.style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 16px)');
    expect(t.cell('r1')!.style.getPropertyValue('padding-inline-start')).toBe('calc(var(--dzg-cell-padding-inline, 0.5rem) + 32px)');
  });

  it('is a grid again once ungrouped: no levels, no chevron, no label', () => {
    const t = gmake();
    t.api().setBy([]);
    expect(t.vp.getAttribute('role')).toBe('grid');
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(attrs(t.row('r1'))).toEqual([null, null, null, null]);
    expect(t.toggle('r1')).toBeNull();
    expect(t.cell('r1')!.style.getPropertyValue('padding-inline-start')).toBe('');
    expect(t.cell('r1')!.textContent).toBe('Shop 1');
  });

  it('an unknown grouping column alone: a grid, told by the column id', () => {
    const t = gmake({ grouping: { by: ['nope'] } });
    expect(t.vp.getAttribute('role')).toBe('grid');
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'unknown-column', path: 'grouping.by', detail: 'nope' }));
  });
});

describe('totals rows (aggregation.md 9, 10)', () => {
  it("a footer after an open group's rows: « Total Nord » and its totals, at the rows' level, no aria-expanded; the grand total last", () => {
    const t = gmake({ grouping: { by: ['region'], footers: 'both' } });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [NORD], expanded: true }, 'api');
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', 'ΣNord', '[Sud]', '[]', 'Σ']);
    const foot = `f:${NORD}`;
    expect(t.label(foot)).toBe('Total Nord');
    expect(text(t.cell(foot, 'qty'))).toBe('12.5');
    expect(attrs(t.row(foot))).toEqual(['2', '4', '4', null]);
    expect(t.row(foot)!.dataset['kind']).toBe('footer');
    expect(t.toggle(foot)!.hasAttribute('data-leaf')).toBe(true);
    // The group row keeps its totals (Q-A3 A).
    expect(text(t.cell(NORD, 'qty'))).toBe('12.5');
    expect(t.label('t:bottom')).toBe('Total');
    expect(text(t.cell('t:bottom', 'qty'))).toBe('25.5');
    expect(attrs(t.row('t:bottom'))).toEqual(['1', '4', '4', null]);
  });

  it('a flat grid with a grand total: a grid, « Total » in the first column, no levels', () => {
    const t = gmake({ grouping: { by: [], footers: 'grand', grandTotal: 'top' } });
    expect(t.vp.getAttribute('role')).toBe('grid');
    expect(t.shown()).toEqual(['Σ', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(t.label('t:top')).toBe('Total');
    expect(text(t.cell('t:top', 'qty'))).toBe('25.5');
    expect(attrs(t.row('t:top'))).toEqual([null, null, null, null]);
    expect(t.toggle('t:top')).toBeNull();
    expect(t.toggle('r1')).toBeNull();
  });

  it('totals() gives the grand totals whatever the footers', () => {
    const t = gmake();
    expect(t.api().totals()).toEqual({ qty: 25.5 });
  });
});

describe.each([
  { dir: 'ltr', forward: 'ArrowRight', back: 'ArrowLeft', lang: 'en' },
  { dir: 'rtl', forward: 'ArrowLeft', back: 'ArrowRight', lang: 'ar' },
] as const)('keys in the group column ($dir; tree-keys.md « On a grouped grid »)', ({ forward, back, lang }) => {
  const make = (o: Parameters<typeof gmake>[0] = {}) => gmake({ lang, ...o });

  it('forward opens a closed group, the focus stays; again, the next column', () => {
    const t = make();
    t.focusKey(NORD);
    t.press(forward);
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]', '[]']);
    expect(t.where()).toBe(`${NORD}/name`);
    expect(t.expandedEvents()).toEqual([expect.objectContaining({ source: 'user', rows: [NORD], expanded: true })]);
    t.press(forward);
    expect(t.where()).toBe(`${NORD}/region`);
  });

  it('back closes an open group; on a row it goes to its group, same column; on a first-level group, nothing', () => {
    const t = make();
    t.api().expandAll();
    t.focusKey(k('r3'));
    t.press(back);
    expect(t.where()).toBe(`${NORD}/name`);
    t.press(back);
    expect(t.shown().slice(0, 2)).toEqual(['[Nord]', '[Sud]']);
    t.press(back);
    expect(t.where()).toBe(`${NORD}/name`);
    expect(t.expandedEvents().filter((e) => e.source === 'user').length).toBe(1);
  });

  it('back on a footer goes to its group', () => {
    const t = make({ grouping: { by: ['region'], footers: 'group', expanded: 'all' } });
    t.focusKey(`f:${NORD}` as never); // a footer key is no data key: typed as a RowKey here
    t.press(back);
    expect(t.where()).toBe(`${NORD}/name`);
  });

  it('Enter on a group row opens and closes it, in any column; on a data row it does not', () => {
    const t = make();
    t.focusKey(SUD, 'qty');
    t.press('Enter');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', 'r2', 'r5', '[]']);
    t.press('Enter');
    expect(t.shown()).toEqual(['[Nord]', '[Sud]', '[]']);
    t.api().expandAll();
    const n = t.shown().length;
    t.focusKey(k('r2'), 'qty');
    t.press('Enter');
    expect(t.shown().length).toBe(n);
  });

  it('`*` opens every closed sibling group: one event, one sentence', () => {
    const t = make();
    t.focusKey(SUD);
    t.announce.mockClear();
    t.press('*');
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]', 'r2', 'r5', '[]', 'r6']);
    expect(t.expandedEvents().length).toBe(1);
    expect(t.said()).toEqual([lang === 'en' ? '3 groups expanded' : 'تم توسيع 3 مجموعات']);
  });

  it('with Ctrl, Alt or Meta held, the grouping claims nothing', () => {
    const t = make();
    t.focusKey(NORD);
    t.press(forward, { altKey: true });
    t.press('Enter', { ctrlKey: true });
    expect(t.expandedEvents()).toEqual([]);
  });
});

describe('pointer, sentences, focus (row-grouping.md 17, 20)', () => {
  it('a click on the chevron opens and closes, selects nothing; said once each with the value', () => {
    const t = gmake({ settings: { selection: { mode: 'multi', click: true } } });
    click(t.toggle(NORD)!);
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]', '[]']);
    expect(t.said()).toEqual(['Nord expanded, 3 rows']);
    click(t.toggle(NORD)!);
    expect(t.said()).toEqual(['Nord expanded, 3 rows', 'Nord collapsed']);
    click(t.toggle(BLANK)!);
    expect(t.said().at(-1)).toBe('(Blank) expanded, 1 row');
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });

  it("a click on a group row's cell focuses it and selects nothing; Space on it selects nothing", () => {
    const t = gmake({ settings: { selection: { mode: 'multi', click: true } } });
    click(t.cell(SUD, 'qty')!);
    t.focusKey(SUD, 'qty');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.row(SUD)!.getAttribute('aria-selected')).not.toBe('true');
    // A data row in the same grid is selected by Space (the control).
    t.api().expandAll();
    t.focusKey(k('r2'), 'qty');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(1);
  });

  it("the group column moved or hidden: chevrons, labels and indent follow it, the old cells given back plain", () => {
    const t = gmake({ grouping: { by: ['region'], expanded: 'all' } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'api');
    expect(t.label(NORD, 'region')).toBe('Nord (3)');
    expect(t.toggle('r1')).toBeNull();
    expect(t.cell('r1', 'region')!.querySelector('.dzg-toggle')).not.toBeNull();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: false }] }, 'api');
    expect(t.label(NORD)).toBe('Nord (3)');
    expect(t.cell('r1', 'region')!.querySelector('.dzg-toggle')).toBeNull();
    expect(t.cell('r1', 'region')!.style.getPropertyValue('padding-inline-start')).toBe('');
    expect(t.cell('r1', 'region')!.textContent).toBe('Nord');
  });

  it('closing a group with the focus inside puts the focus on the group', () => {
    const t = gmake();
    t.api().expandAll();
    t.focusKey(k('r4'), 'qty');
    t.api().collapseAll();
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: NORD, column: 'qty' });
  });

  it('expandAll(depth) opens the levels above it only; the API is not said', () => {
    const t = gmake({ grouping: { by: ['region', 'fruit'] } });
    t.api().expandAll(1);
    expect(t.shown()).toEqual(['[Nord]', '[apple]', '[pear]', '[Sud]', '[apple]', '[fig]', '[]', '[fig]']);
    expect(t.said()).toEqual([]);
  });

  it('setBy({ user }) regroups as the user; by() gives the columns as given', () => {
    const t = gmake();
    t.api().setBy(['fruit'], { user: true });
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.shown()).toEqual(['[apple]', '[fig]', '[pear]']);
    expect(t.events.filter((e) => e.type === 'modelUpdated').at(-1)).toEqual(expect.objectContaining({ source: 'user', kind: 'rows' }));
  });
});

describe('group rows pinned under the header (row-grouping.md 18)', () => {
  const many: R[] = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, region: i < 40 ? 'Nord' : 'Sud', fruit: 'fig', qty: i, price: 1, day: '2026-03-01' }));

  it('a group whose rows scroll under the header is copied there, its label and totals, aria-hidden', () => {
    const t = gmake({ rows: many, grouping: { by: ['region'], expanded: 'all' } });
    t.box.scrollTop = 10 * 32;
    t.vp.dispatchEvent(new Event('scroll'));
    const layer = t.host.querySelector<HTMLElement>('.dzg-sticky')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    const copy = layer.querySelector<HTMLElement>('.dzg-row');
    expect(copy?.querySelector('.dzg-label')?.textContent).toBe('Nord (40)');
    expect(copy?.querySelector('.dzg-cell[data-col="qty"]')?.textContent).toBe('780');
    expect(copy?.hasAttribute('aria-level')).toBe(false);
  });

  it('sticky: 0 makes none', () => {
    expect(gmake({ rows: many, grouping: { by: ['region'], expanded: 'all' } }).host.querySelector('.dzg-sticky')).not.toBeNull();
    const t = gmake({ rows: many, grouping: { by: ['region'], expanded: 'all', sticky: 0 } });
    expect(t.host.querySelector('.dzg-sticky')).toBeNull();
  });
});

describe('refused beside grouping (row-grouping.md 13, 21; never a throw)', () => {
  const withTree = { messages: { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_TREE.text } } };
  const problems = (t: ReturnType<typeof gmake>, path: string): Problem[] => t.problems().filter((p) => p.code === 'unsupported-combination' && p.path === path);

  // r2 under r1: the tree's own rows, chevron and keys, as without grouping (row-grouping.md 21: the tree wins).
  const parent = (r: R) => (r.id === 'r2' ? 'r1' : null);
  it.each(['first', 'after'] as const)('a tree listed %s: told, the tree works as without grouping (rows, chevron, keys), no grouping API', (where) => {
    const tr = tree<R>({ parentId: parent });
    const t = gmake({ grouping: { by: ['region'], footers: 'grand' }, ...(where === 'first' ? { before: [tr] } : { features: [tr] }), settings: withTree });
    expect(problems(t, 'tree')).toEqual([expect.objectContaining({ detail: 'grouping' })]);
    expect(t.feature!.api(t.g)).toBeNull();
    expect(t.shown()).toEqual(['r1', 'r3', 'r4', 'r5', 'r6']);
    expect(t.vp.getAttribute('role')).toBe('treegrid');
    expect(t.toggle('r1')!.hasAttribute('data-leaf')).toBe(false);
    expect(attrs(t.row('r1'))).toEqual(['1', '1', '5', 'false']);
    t.focusKey(k('r1'));
    t.press('ArrowRight');
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(attrs(t.row('r2'))).toEqual(['2', '1', '1', null]);
    expect(t.said()).toEqual(['Shop 1 expanded, 1 row']);
    expect(tr.api(t.g)!.state(k('r1'))).toBe('open');
  });

  it('a server source: told, the rows flat, no totals rows', async () => {
    // A source instead of rows: the settings type wants one or the other; cast to swap them.
    const t = gmake({ grouping: { by: ['region'], footers: 'both' }, settings: { rows: undefined, source: sourceRows({ fetch: () => ({ rows: ROWS.map((r) => ({ ...r })), total: ROWS.length }) }) } as never });
    await new Promise((r) => setTimeout(r, 0));
    expect(problems(t, 'source')).toEqual([expect.objectContaining({ detail: 'grouping' })]);
    expect(t.shown()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(t.vp.getAttribute('role')).toBe('grid');
  });

  it('merged cells: told, the grid paints without merges', () => {
    // A column of another row type (no `R` field `same`): cast, it is a value function.
    const t = gmake({ features: [spans()], columns: [...COLUMNS, { id: 'same', header: 'Same', value: () => 'x', merge: true, width: 80 }] as never, grouping: { by: ['region'], expanded: 'all' } });
    expect(problems(t, 'spans').length).toBe(1);
    expect(t.ctx.spans).toBeNull();
    expect(t.host.querySelector('[aria-rowspan]')).toBeNull();
  });

  it('details listed first: told, details work, no grouping; listed after: told, grouping works', () => {
    const part = { part: { mount: () => ({}) } } as never; // a detail part that draws nothing: the shape is what is tested
    const a = gmake({ before: [detail<R>({ part })], settings: { messages: { ...BUNDLES.en, text: { ...BUNDLES.en.text, 'detail.label': 'D', 'detail.expanded': 'E', 'detail.collapsed': 'C' } } } });
    expect(problems(a, 'detail').length).toBe(1);
    expect(a.feature!.api(a.g)).toBeNull();
    const b = gmake({ features: [detail<R>({ part })], settings: { messages: { ...BUNDLES.en, text: { ...BUNDLES.en.text, 'detail.label': 'D', 'detail.expanded': 'E', 'detail.collapsed': 'C' } } } });
    expect(problems(b, 'detail').length).toBe(1);
    expect(b.shown()).toEqual(['[Nord]', '[Sud]', '[]']);
  });

  it('browser pages: told by the rows (detail `group`), the groups whole', () => {
    // `pagination` with a page size the settings type takes only beside `pagination()`: cast, the rows refuse it.
    const t = gmake({ settings: { pagination: { pageSize: 2 } } as never, grouping: { by: ['region'], expanded: 'all' } });
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', path: 'pagination', detail: 'group' }));
    expect(t.shown().length).toBe(9);
  });

  it('no problem of grouping carries a row value', () => {
    const t = gmake({ grouping: { by: ['region', 'nope'], aggFuncs: { fruit: 'sum' } }, features: [tree<R>({ parentId: () => null })], settings: withTree });
    const all = JSON.stringify(t.problems());
    for (const v of ['Nord', 'Sud', 'apple', 'pear', 'fig']) expect(all).not.toContain(v);
  });
});

describe('texts and life (row-grouping.md 20)', () => {
  it('needs its texts: a missing one throws at creation, naming it', () => {
    const host = document.body.appendChild(document.createElement('div'));
    expect(() => createGrid<R>(host, { rows: ROWS, getRowId: (r) => r.id, columns: COLUMNS, messages: EN, features: [grouping({ by: ['region'] })] }, { sync: true })).toThrow(/grouping: missing group\.label/);
  });

  it('the three bundles give every key of GROUP_KEYS, the zone and the menu items', () => {
    for (const b of [EN_GROUP, FR_GROUP, AR_GROUP]) {
      for (const key of GROUP_KEYS) expect(b.text[key]).toBeTruthy();
      expect(Object.keys(b.text).sort()).toEqual(Object.keys(EN_GROUP.text).sort());
    }
  });

  it('the Arabic page says the opening in Arabic, with the value', () => {
    const t = gmake({ lang: 'ar' });
    click(t.toggle(SUD)!);
    expect(t.said()).toEqual(['تم توسيع Sud، صفان (2)']);
  });

  it("destroyed: the grid's role, levels, chevrons and labels go with it", () => {
    const t = gmake({ grouping: { by: ['region'], expanded: 'all' } });
    const cell = t.cell('r1')!;
    const row = t.row('r1')!;
    t.g.destroy();
    expect(t.vp.getAttribute('role')).toBe('grid');
    expect(cell.querySelector('.dzg-toggle')).toBeNull();
    expect(row.hasAttribute('aria-level')).toBe(false);
  });
});
