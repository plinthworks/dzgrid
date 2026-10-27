import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnOrGroup, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { spans } from '../src/spans.js';
import { groups } from '../src/groups.js';
import { columns } from '../src/columns.js';
import { columnMenu } from '../src/column-menu.js';
import { columnsChooser } from '../src/columns-panel.js';
import { range } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { LiveRegion } from '../src/a11y/live-region.js';

/**
 * Phase 6 step 7, the companions (header-groups.md 13–15, columns-chooser.md 9, owner Q8-3; plan step08-plan.md §1, §3):
 * the chooser, the menu's reset, moves and the block of cells with a closed group. Expectations by hand.
 */
type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
const k = (s: string): RowKey => dataKey(s)!;
const MSG = { ...EN, text: { ...EN.text, ...EN_COLUMNS.text, ...EN_COLUMN_MENU.text, ...EN_RANGE.text } };
const leaf = (id: string, x: object = {}) => ({ id, header: id[0]!.toUpperCase() + id.slice(1), width: 120, value: (r: R) => `${id}${r.n}`, ...x });
const tree = (): ColumnOrGroup<R>[] => [
  leaf('ref'),
  { id: 'patient', header: 'Patient', collapsible: true, children: [leaf('nom'), leaf('prenom', { groupShow: 'open' }), leaf('age', { groupShow: 'open' }), leaf('resume', { groupShow: 'closed' })] },
  leaf('note'),
];

function make() {
  const vb: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 1200, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...vb }), writeScrollTop: (px) => { vb.scrollTop = px; }, writeScrollInline: (px) => { vb.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const sp = groups();
  const moves = columns();
  const ch = columnsChooser();
  const rg = range();
  const menu = columnMenu({ use: { columns: moves, chooser: ch } });
  const spoken = vi.spyOn(LiveRegion.prototype, 'announce');
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 20 }, (_, n) => ({ id: `r${n}`, n })), getRowId: (r) => r.id,
    columns: tree(), messages: MSG, features: [spans(), sp, rg, moves, menu, ch], onEvent: (e) => events.push(e),
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const shown = () => ctx.columns.visible().map((c) => c.id);
  const row = (id: string) => document.querySelector<HTMLElement>(`.dzg-popup[role=dialog] li.dzg-cp-row[data-col="${id}"]`);
  const box = (id: string) => row(id)!.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  const desc = (id: string) => row(id)!.querySelector('.dzg-cp-desc')?.textContent ?? '';
  const item = (id: string) => ctx.el.root.querySelector<HTMLElement>(`.dzg-popup [role^=menuitem][data-id="${id}"]`);
  const said = () => spoken.mock.calls.map((c) => c[0]);
  return { g, ctx, shown, row, box, desc, item, said, events, groups: () => sp.api(g)!, chooser: () => ch.api(g)!, menu: () => menu.api(g)!, moves: () => moves.api(g)!, block: () => rg.api(g)! };
}

describe('the chooser (columns-chooser.md 9, header-groups.md 13)', () => {
  it('a column hidden by its closed group stays ticked, says why; follows a toggle live; Show all leaves the group closed', () => {
    const t = make();
    t.chooser().open();
    expect(t.box('resume').checked).toBe(true);
    expect(t.desc('resume')).toBe('hidden by its closed group');
    expect(t.desc('age')).toBe('');
    t.groups().toggle('patient');
    expect(t.box('age').checked).toBe(true);
    expect(t.desc('age')).toBe('hidden by its closed group');
    expect(t.desc('resume')).toBe('');
    const before = t.events.filter((e) => e.type === 'columnsChanged').length;
    document.querySelector<HTMLElement>('.dzg-cp-foot button[data-act=all]')!.click();
    expect(t.events.filter((e) => e.type === 'columnsChanged').length).toBe(before);
    expect(t.groups().isOpen('patient')).toBe(false);
    expect(t.shown()).toEqual(['ref', 'nom', 'resume', 'note']);
  });

  it('unticking a group-hidden column hides it for the user; the group opening leaves it hidden', () => {
    const t = make();
    t.chooser().open();
    t.box('resume').click();
    expect(t.box('resume').checked).toBe(false);
    t.groups().toggle('patient');
    expect(t.shown()).toEqual(['ref', 'nom', 'note']);
    expect(t.box('resume').checked).toBe(false);
  });
});

describe('the menu’s reset (header-groups.md 6)', () => {
  it('enabled when only a group differs; brings the definitions’ state back, one sentence', () => {
    const t = make();
    t.menu().open('note');
    expect(t.item('reset')!.getAttribute('aria-disabled')).toBe('true');
    t.menu().close();
    t.groups().toggle('patient');
    t.menu().open('note');
    expect(t.item('reset')!.hasAttribute('aria-disabled')).toBe(false);
    t.item('reset')!.click();
    expect(t.groups().get()).toEqual({});
    expect(t.shown()).toEqual(['ref', 'nom', 'prenom', 'age', 'note']);
    expect(t.said().filter((s) => /Patient/.test(s))).toEqual([]);
    const ev = t.events.filter((e) => e.type === 'columnsChanged').at(-1)!;
    expect(ev.source).toBe('user');
  });
});

describe('moves with a closed group', () => {
  it('a place said among the shown columns; a folded one keeps its slot', () => {
    const t = make();
    t.groups().toggle('patient');
    t.moves().move('note', -1, { say: true });
    expect(t.shown()).toEqual(['ref', 'nom', 'note', 'resume']);
    t.groups().toggle('patient');
    expect(t.shown()).toEqual(['ref', 'nom', 'prenom', 'age', 'note']);
  });

  it('a group header has no drag grip (O4)', () => {
    const t = make();
    for (const c of t.ctx.el.header.querySelectorAll('.dzg-hgroup')) expect(c.querySelector('.dzg-grip, .dzg-hgrip, .dzg-mbtn')).toBeNull();
  });
});

describe('the block of cells when its columns fold (owner Q8-3 revised: cleared, as for a hidden column)', () => {
  it('cleared, whatever is left of it', () => {
    const t = make();
    t.block().set({ anchor: { row: k('r1'), column: 'nom' }, focus: { row: k('r3'), column: 'age' } });
    t.groups().toggle('patient');
    expect(t.block().get()).toBeNull();
  });

  it('cleared when none of its columns is left', () => {
    const t = make();
    t.block().set({ anchor: { row: k('r1'), column: 'prenom' }, focus: { row: k('r3'), column: 'age' } });
    t.groups().toggle('patient');
    expect(t.block().get()).toBeNull();
  });
});
