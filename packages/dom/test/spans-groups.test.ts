import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnOrGroup, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * Step 9b, commit 4: grouped headers on screen (docs/behaviors/spans.md,
 * blueprint A.3 and D). The spans feature reads the tree of groups from the
 * settings and fills the group rows above the column headers: column headers
 * with their index and span, cut where a segment ends (O7, the label
 * repeated), following the column window, the widths and the direction.
 */
type R = { id: string; nom: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;
const H = 32;

const leaf = (id: string) => ({ id, header: id.toUpperCase(), width: 100, value: (r: R) => `${id}${r.n}` });
/** Two levels: Patient over nom, prenom, age; Clinique over Constantes (tension, pouls, temp) and note; entree alone. */
const TREE: ColumnOrGroup<R>[] = [
  { id: 'patient', header: 'Patient', children: [leaf('nom'), leaf('prenom'), leaf('age')] },
  { id: 'clinique', header: 'Clinique', children: [{ id: 'constantes', header: 'Constantes', children: [leaf('tension'), leaf('pouls'), leaf('temp')] }, leaf('note')] },
  leaf('entree'),
];

function make(o: { columns?: ColumnOrGroup<R>[]; settings?: Partial<GridSettings<R>>; inline?: number; rows?: number; features?: boolean } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: o.inline ?? 1200, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, {
    rows: Array.from({ length: o.rows ?? 40 }, (_, n) => ({ id: `r${n}`, nom: `p${n}`, n })), getRowId: (r) => r.id,
    columns: o.columns ?? TREE, messages: EN, features: o.features === false ? [] : [spans()], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const hrows = () => [...host.querySelectorAll<HTMLElement>('.dzg-header > [role=row]')];
  /** The group cells of a group row (0: the top one), in DOM order. */
  const groups = (level: number) => [...hrows()[level]!.querySelectorAll<HTMLElement>('.dzg-hgroup')];
  const desc = (el: HTMLElement) => ({
    text: el.textContent, col: el.dataset['col'], colindex: el.getAttribute('aria-colindex'), colspan: el.getAttribute('aria-colspan'),
    seg: el.parentElement!.className.replace('dzg-seg dzg-seg-', ''), at: el.style.getPropertyValue('inset-inline-start'), w: el.style.getPropertyValue('inline-size'),
  });
  const leafCell = (id: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${id}"]:not(.dzg-hgroup)`)!;
  const press = (key: string, init: KeyboardEventInit = {}) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  const scrollInline = (x: number) => {
    box.scrollInline = x;
    vp.dispatchEvent(new Event('scroll'));
  };
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])) as Problem[];
  const active = () => document.activeElement as HTMLElement;
  return { g, host, vp, box, hrows, groups, desc, leafCell, press, scrollInline, problems, active };
}

describe('group rows on screen', () => {
  it('one row per level, above the column headers; group cells are column headers with their index and span', () => {
    const { hrows, groups, desc } = make();
    expect(hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3']);
    expect(groups(0).map(desc)).toEqual([
      { text: 'Patient', col: 'nom', colindex: '1', colspan: '3', seg: 'center', at: '0px', w: '300px' },
      { text: 'Clinique', col: 'tension', colindex: '4', colspan: '4', seg: 'center', at: '300px', w: '400px' },
    ]);
    expect(groups(1).map(desc)).toEqual([{ text: 'Constantes', col: 'tension', colindex: '4', colspan: '3', seg: 'center', at: '300px', w: '300px' }]);
    for (const el of [...groups(0), ...groups(1)]) {
      expect(el.getAttribute('role')).toBe('columnheader');
      expect(el.classList.contains('dzg-hcell')).toBe(true);
      expect(el.hasAttribute('aria-sort')).toBe(false);
      expect(el.tabIndex).toBe(-1);
    }
    expect(groups(0).map((e) => e.dataset['level'])).toEqual(['-2', '-2']);
    expect(groups(1)[0]!.dataset['level']).toBe('-1');
    // The column headers are as before.
    expect(hrows()[2]!.querySelectorAll('.dzg-hgroup').length).toBe(0);
    expect(hrows()[2]!.querySelectorAll('[role=columnheader]').length).toBe(8);
  });

  it('each group row holds one header per column the column headers hold, in order (screen readers pair by position)', () => {
    const { hrows, scrollInline, g } = make({ inline: 200 });
    const cols = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('[role=columnheader]')].map((e) => [e.getAttribute('aria-colindex'), e.textContent]);
    const check = () => {
      const leafCols = cols(hrows()[2]!).map(([i]) => i);
      for (const r of hrows().slice(0, 2)) expect(cols(r).length).toBe(leafCols.length);
      return [cols(hrows()[0]!), cols(hrows()[1]!), leafCols];
    };
    // Window 0..2: Patient's cell, then its name hidden in the next two columns; no Constantes:
    // the columns' own names (their headers reach up there).
    expect(check()).toEqual([[['1', 'Patient'], ['2', 'Patient'], ['3', 'Patient']], [['1', 'NOM'], ['2', 'PRENOM'], ['3', 'AGE']], ['1', '2', '3']]);
    // Window 3..7: Clinique's cell at its first column, hidden repeats after it; entree has none.
    scrollInline(450);
    expect(check()).toEqual([
      [['4', 'Clinique'], ['5', 'Clinique'], ['6', 'Clinique'], ['7', 'Clinique'], ['8', 'ENTREE']],
      [['4', 'Constantes'], ['5', 'Constantes'], ['6', 'Constantes'], ['7', 'NOTE'], ['8', 'ENTREE']],
      ['4', '5', '6', '7', '8'],
    ]);
    // Window 4..7: Clinique starts out of it, drawn from its first column (its cell at the first mounted place).
    scrollInline(550);
    const top = hrows()[0]!.querySelector<HTMLElement>('.dzg-hgroup')!;
    expect([top.getAttribute('aria-colindex'), top.getAttribute('aria-colspan'), top.style.getPropertyValue('inset-inline-start')]).toEqual(['4', '4', '300px']);
    expect(check()[0]).toEqual([['4', 'Clinique'], ['6', 'Clinique'], ['7', 'Clinique'], ['8', 'ENTREE']]);
    // The hidden ones are not group cells: no focus, no class of a header cell.
    const slot = hrows()[0]!.querySelector<HTMLElement>('.dzg-hslot')!;
    expect(slot.classList.contains('dzg-hcell')).toBe(false);
    expect(slot.hasAttribute('tabindex')).toBe(false);
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'entree', pinned: 'end' }] }, 'user');
    expect(check()[2]!.at(-1)).toBe('8');
  });

  it('counts the group rows in aria-rowcount; the body starts after them', () => {
    const { vp, host } = make();
    expect(vp.getAttribute('aria-rowcount')).toBe('43');
    expect(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('4');
  });

  it('a column with fewer groups than the depth: its header stretched up over the empty group cells', () => {
    const { leafCell } = make();
    // nom: one group (Patient) of two levels; entree: none; pouls: two.
    expect(leafCell('nom').style.getPropertyValue('--dzg-up')).toBe(`${H}px`);
    expect(leafCell('note').style.getPropertyValue('--dzg-up')).toBe(`${H}px`);
    expect(leafCell('entree').style.getPropertyValue('--dzg-up')).toBe(`${2 * H}px`);
    expect(leafCell('nom').hasAttribute('data-up')).toBe(true);
    expect(leafCell('pouls').hasAttribute('data-up')).toBe(false);
    expect(leafCell('pouls').style.getPropertyValue('--dzg-up')).toBe('');
  });

  it('a pinned leaf splits its group in two fragments, each labelled (O7), in its segment', () => {
    const { groups, desc, g } = make();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'prenom', pinned: 'start' }, { id: 'temp', pinned: 'end' }] }, 'user');
    expect(groups(0).map(desc)).toEqual([
      { text: 'Patient', col: 'prenom', colindex: '1', colspan: '1', seg: 'start', at: '0px', w: '100px' },
      { text: 'Patient', col: 'nom', colindex: '2', colspan: '2', seg: 'center', at: '0px', w: '200px' },
      { text: 'Clinique', col: 'tension', colindex: '4', colspan: '3', seg: 'center', at: '200px', w: '300px' },
      { text: 'Clinique', col: 'temp', colindex: '8', colspan: '1', seg: 'end', at: '0px', w: '100px' },
    ]);
    expect(groups(1).map(desc)).toEqual([
      { text: 'Constantes', col: 'tension', colindex: '4', colspan: '2', seg: 'center', at: '200px', w: '200px' },
      { text: 'Constantes', col: 'temp', colindex: '8', colspan: '1', seg: 'end', at: '0px', w: '100px' },
    ]);
  });

  it('with the selection box: an empty cell keeps its column in each group row; pinned groups start after it', () => {
    const { hrows, groups, desc, g } = make({ settings: { selection: { mode: 'multi', checkbox: true } } });
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'nom', pinned: 'start' }] }, 'user');
    for (const r of hrows().slice(0, 2)) {
      const first = r.querySelector('.dzg-seg-start')!.firstElementChild as HTMLElement;
      expect(first.classList.contains('dzg-check')).toBe(true);
      expect(first.getAttribute('role')).toBe('gridcell');
      expect(first.textContent).toBe('');
    }
    expect(desc(groups(0)[0]!)).toEqual({ text: 'Patient', col: 'nom', colindex: '2', colspan: '1', seg: 'start', at: '40px', w: '100px' });
    expect(desc(groups(0)[1]!)).toMatchObject({ text: 'Patient', col: 'prenom', colindex: '3', colspan: '2', seg: 'center', at: '0px' });
  });

  it('follows resizing and hiding: widths, spans and indexes', () => {
    const { groups, desc, g } = make();
    g.kernel.dispatch({ type: 'column.resize', column: 'tension', width: 200, finished: true }, 'user');
    expect(desc(groups(1)[0]!)).toMatchObject({ w: '400px', at: '300px' });
    expect(desc(groups(0)[1]!)).toMatchObject({ w: '500px' });
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'pouls', hidden: true }, { id: 'nom', hidden: true }] }, 'user');
    expect(groups(0).map(desc)).toEqual([
      { text: 'Patient', col: 'prenom', colindex: '1', colspan: '2', seg: 'center', at: '0px', w: '200px' },
      { text: 'Clinique', col: 'tension', colindex: '3', colspan: '3', seg: 'center', at: '200px', w: '400px' },
    ]);
    expect(desc(groups(1)[0]!)).toMatchObject({ colindex: '3', colspan: '2', w: '300px' });
  });

  it('a group whose columns are all hidden has no cell', () => {
    const { groups, g } = make();
    g.kernel.dispatch({ type: 'column.state', patch: ['tension', 'pouls', 'temp'].map((id) => ({ id, hidden: true })) }, 'user');
    expect(groups(1)).toEqual([]);
    expect(groups(0).map((e) => e.textContent)).toEqual(['Patient', 'Clinique']);
  });

  it('follows the column window: a group crossing its edge is mounted from its first column; one out of it is not', () => {
    // 200 px of view: the window holds two columns and one more on each side.
    const { groups, desc, scrollInline } = make({ inline: 200 });
    expect(groups(0).map((e) => e.textContent)).toEqual(['Patient']);
    // Scrolled to 450: the window starts inside Clinique (tension at 300) and ends before entree (700).
    scrollInline(450);
    expect(groups(0).map(desc)).toEqual([{ text: 'Clinique', col: 'tension', colindex: '4', colspan: '4', seg: 'center', at: '300px', w: '400px' }]);
    expect(groups(1).map(desc)).toEqual([{ text: 'Constantes', col: 'tension', colindex: '4', colspan: '3', seg: 'center', at: '300px', w: '300px' }]);
    scrollInline(700);
    expect(groups(0).map((e) => e.textContent)).toEqual(['Clinique']);
    expect(groups(1)).toEqual([]);
  });

  it('a click on a group cell does not sort; it takes the focus', () => {
    const { groups, g } = make();
    groups(0)[1]!.click();
    groups(0)[1]!.focus();
    expect(g.kernel.query.sort).toEqual([]);
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
  });

  it('a group header shows no column tooltip (its first column’s is not its own)', async () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'patient', header: 'Patient', children: [{ ...leaf('nom'), headerTooltip: 'Nom du patient' }, leaf('age')] }];
    const { groups, host } = make({ columns: tree, settings: { tooltips: { delayMs: 0 } } });
    groups(0)[0]!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect(host.querySelector<HTMLElement>('.dzg-tooltip')!.hidden).toBe(true);
  });

  it('labels: the group’s header, or its id when it has none', () => {
    const { groups } = make({ columns: [{ id: 'g1', children: [leaf('a'), leaf('b')] }, leaf('c')] });
    expect(groups(0).map((e) => e.textContent)).toEqual(['g1']);
  });

  // The public styling hook (stable from 1.1.0, theming.md « Styling one header group », header-groups.md):
  // `.dzg-hgroup[data-g="<group id>"]` with `data-level`, in both directions.
  for (const direction of ['ltr', 'rtl'] as const) {
    it(`the styling hook: each group cell has .dzg-hgroup, data-g = the group's id and data-level (${direction})`, () => {
      const { groups, host } = make({ settings: { direction } });
      const hook = (e: HTMLElement) => ({ hgroup: e.classList.contains('dzg-hgroup'), hcell: e.classList.contains('dzg-hcell'), g: e.dataset['g'], level: e.dataset['level'], text: e.textContent });
      expect(groups(0).map(hook)).toEqual([
        { hgroup: true, hcell: true, g: 'patient', level: '-2', text: 'Patient' },
        { hgroup: true, hcell: true, g: 'clinique', level: '-2', text: 'Clinique' },
      ]);
      expect(groups(1).map(hook)).toEqual([{ hgroup: true, hcell: true, g: 'constantes', level: '-1', text: 'Constantes' }]);
      // The selector an app writes reaches exactly that group's cell.
      for (const [id, text] of [['patient', 'Patient'], ['clinique', 'Clinique'], ['constantes', 'Constantes']]) {
        const found = [...host.querySelectorAll<HTMLElement>(`.dzg-hgroup[data-g="${id}"]`)];
        expect(found.map((e) => e.textContent), id).toEqual([text]);
      }
    });
  }
});

describe('no groups: nothing changes', () => {
  it('with the feature and plain columns: one header row, the same indexes', () => {
    const { hrows, vp, host, leafCell } = make({ columns: [leaf('a'), leaf('b')] });
    expect(hrows().length).toBe(1);
    expect(vp.getAttribute('aria-rowcount')).toBe('41');
    expect(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('2');
    expect(host.querySelectorAll('.dzg-hgroup').length).toBe(0);
    expect(leafCell('a').hasAttribute('data-up')).toBe(false);
  });

  it('without the feature, groups are ignored: their columns show, no group row', () => {
    const { hrows, host } = make({ features: false });
    expect(hrows().length).toBe(1);
    expect(host.textContent).not.toContain('Clinique');
  });
});

describe('problems', () => {
  it('a group with no column, a duplicate id: invalid-column-group, told once; their columns stay', () => {
    const tree: ColumnOrGroup<R>[] = [{ id: 'empty', header: 'Vide', children: [] }, { id: 'nom', header: 'Dup', children: [leaf('nom')] }, { id: 'ok', header: 'OK', children: [leaf('age')] }];
    const { problems, groups, g, host } = make({ columns: tree });
    const told = () => problems().filter((p) => p.code === 'invalid-column-group');
    expect(told().map((p) => [p.path, p.detail])).toEqual([['columns[0]', 'empty'], ['columns[1]', 'duplicate']]);
    expect(groups(0).map((e) => e.textContent)).toEqual(['OK']);
    expect(host.querySelector('.dzg-header .dzg-hcell[data-col="nom"]:not(.dzg-hgroup)')).not.toBeNull();
    // A repaint, a resize: not told again.
    g.kernel.dispatch({ type: 'column.resize', column: 'age', width: 140, finished: true }, 'user');
    g.api.refresh();
    expect(told().length).toBe(2);
  });

  it('a tree whose only group is refused: no group row, the problem told', () => {
    const { problems, hrows } = make({ columns: [{ id: 'vide', header: 'Vide', children: [] }, leaf('nom')] });
    expect(hrows().length).toBe(1);
    expect(problems().filter((p) => p.code === 'invalid-column-group').map((p) => [p.path, p.detail])).toEqual([['columns[0]', 'empty']]);
  });

  it('new definitions are read again (update): new groups, their problems told', () => {
    const { groups, g, problems } = make();
    g.update({ columns: [{ id: 'x', header: 'Neuf', children: [leaf('nom'), leaf('age')] }, { id: 'x', header: 'Encore', children: [leaf('note')] }] });
    expect(groups(0).map((e) => e.textContent)).toEqual(['Neuf']);
    expect(problems().filter((p) => p.code === 'invalid-column-group').map((p) => p.path)).toEqual(['columns[1]']);
  });
});

describe('the number of group rows is set when the grid is created (documented limit)', () => {
  it('a tree with no group later: the rows stay, empty, every column header stretched over them', () => {
    const { g, hrows, host, leafCell } = make();
    g.update({ columns: [leaf('nom'), leaf('pouls')] });
    expect(hrows().length).toBe(3);
    expect(host.querySelectorAll('.dzg-hgroup').length).toBe(0);
    expect(leafCell('nom').style.getPropertyValue('--dzg-up')).toBe(`${2 * H}px`);
    // Back to groups: a column under two of them is no longer stretched.
    g.update({ columns: TREE });
    expect(leafCell('pouls').hasAttribute('data-up')).toBe(false);
    expect(leafCell('pouls').style.getPropertyValue('--dzg-up')).toBe('');
  });

  it('a deeper tree later: its outer levels only', () => {
    const { g, groups, hrows } = make();
    g.update({ columns: [{ id: 'a', header: 'A', children: [{ id: 'b', header: 'B', children: [{ id: 'c', header: 'C', children: [leaf('nom')] }] }] }] });
    expect(hrows().length).toBe(3);
    expect([groups(0).map((e) => e.textContent), groups(1).map((e) => e.textContent)]).toEqual([['A'], ['B']]);
  });
});

describe('keys across the group rows', () => {
  it('Up from a column header climbs its groups, Down comes back to that column', () => {
    const { leafCell, press, g, active } = make();
    leafCell('pouls').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -1 });
    expect(active().textContent).toBe('Constantes');
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
    expect(active().textContent).toBe('Clinique');
    // The top row: Up stays.
    press('ArrowUp');
    expect(active().textContent).toBe('Clinique');
    press('ArrowDown');
    expect(active().textContent).toBe('Constantes');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'pouls' });
    expect(active()).toBe(leafCell('pouls'));
  });

  it('Up skips the empty group cells over a column; Down from the group comes back over them', () => {
    const { leafCell, press, g, active } = make();
    leafCell('age').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom', level: -2 });
    expect(active().textContent).toBe('Patient');
    press('ArrowDown');
    expect(active()).toBe(leafCell('age'));
    // note: Clinique over it, no Constantes.
    leafCell('note').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
    press('ArrowDown');
    expect(active()).toBe(leafCell('note'));
    // entree: no group; Up stays on it.
    leafCell('entree').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'entree' });
    expect(active()).toBe(leafCell('entree'));
  });

  it('Down from a group, without having come up: the group’s first column', () => {
    const { groups, press, g } = make();
    groups(0)[1]!.focus();
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -1 });
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension' });
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'tension' });
  });

  it('Left and Right step over group cells; Home and End go to the row’s first and last', () => {
    const { groups, press, g, active } = make();
    groups(0)[0]!.focus();
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
    expect(active().textContent).toBe('Clinique');
    // The last group: Right stays (entree has no cell in this row).
    press('ArrowRight');
    expect(active().textContent).toBe('Clinique');
    press('ArrowLeft');
    expect(active().textContent).toBe('Patient');
    press('ArrowLeft');
    expect(active().textContent).toBe('Patient');
    press('End');
    expect(active().textContent).toBe('Clinique');
    press('Home');
    expect(active().textContent).toBe('Patient');
    // After a sideways move, Down goes to the group's first column.
    press('ArrowRight');
    press('ArrowDown');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension' });
  });

  it('right to left: the arrows follow the reading direction', () => {
    const { groups, press, active } = make({ settings: { direction: 'rtl' } });
    groups(0)[0]!.focus();
    press('ArrowLeft');
    expect(active().textContent).toBe('Clinique');
    press('ArrowRight');
    expect(active().textContent).toBe('Patient');
  });

  it('Left and Right across segments: the fragments of a split group are two stops', () => {
    const { groups, press, g, active } = make();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'prenom', pinned: 'start' }] }, 'user');
    groups(0)[0]!.focus();
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'prenom', level: -2 });
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom', level: -2 });
    expect(active().textContent).toBe('Patient');
    expect(active()).not.toBe(groups(0)[0]);
  });

  it('a focused group is the tab stop (roving tabindex)', () => {
    const { groups, leafCell, press, host } = make();
    leafCell('pouls').focus();
    press('ArrowUp');
    const stops = [...host.querySelectorAll<HTMLElement>('[tabindex="0"]')];
    expect(stops).toEqual([groups(1)[0]]);
  });

  it('a focused group out of the column window stays mounted; Home in its row brings the first group back', () => {
    const { groups, press, scrollInline, active, g, hrows } = make({ inline: 200 });
    scrollInline(450);
    groups(0)[0]!.focus();
    expect(active().textContent).toBe('Clinique');
    scrollInline(0);
    expect(groups(0).map((e) => e.textContent)).toEqual(['Patient', 'Clinique']);
    // Only its cell is kept, not the hidden headers of its other columns.
    expect(hrows()[0]!.querySelectorAll('[role=columnheader]').length).toBe(hrows()[2]!.querySelectorAll('[role=columnheader]').length + 1);
    expect(active().textContent).toBe('Clinique');
    press('Home');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'nom', level: -2 });
    expect(active().textContent).toBe('Patient');
  });

  it('Up from the first body row reaches the column header, then its groups', () => {
    const { host, press, g } = make();
    host.querySelector<HTMLElement>('.dzg-layer > .dzg-row [data-col="temp"]')!.focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'temp' });
    press('ArrowUp');
    press('ArrowUp');
    press('ArrowDown');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'temp' });
  });

  it('a focus asked on a group row over a column with no group there: that column’s header holds the stop', () => {
    const { g, leafCell, host } = make();
    g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'entree', level: -2 } }, 'api');
    g.api.refresh();
    expect([...host.querySelectorAll('[tabindex="0"]')]).toEqual([leafCell('entree')]);
  });

  it('the column aimed at counts only while it is under the focused group (a column pinned meanwhile)', () => {
    const { leafCell, press, g, groups } = make();
    leafCell('note').focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -2 });
    // tension pinned at the start: the focused Clinique piece is tension's alone; note is elsewhere.
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'tension', pinned: 'start' }] }, 'user');
    // The piece moved to another segment (a moved node loses the DOM focus): focused again, same place.
    groups(0)[0]!.focus();
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'tension', level: -1 });
  });

  it('Page Down from a group goes into the body under the column aimed at', () => {
    const { leafCell, press, g } = make();
    leafCell('pouls').focus();
    press('ArrowUp');
    press('PageDown');
    const f = g.kernel.focus;
    expect(f?.kind).toBe('cell');
    expect(f?.column).toBe('pouls');
  });

  it('Space or Enter on a group does not sort', () => {
    const { groups, press, g } = make();
    groups(0)[0]!.focus();
    press(' ');
    press('Enter');
    expect(g.kernel.query.sort).toEqual([]);
  });
});
