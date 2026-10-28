import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnOrGroup, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { spans } from '../src/spans.js';
import { groups } from '../src/groups.js';
import { GROUPS_CSS } from '../src/groups/styles.js';
import { gridState } from '../src/state.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../src/locales/ar-columns.js';

/**
 * Phase 6 step 7 (docs/behaviors/header-groups.md 1–15, plan step08-plan.md §1, §3; owner Q-GH, Q8-1): collapsible
 * header groups on screen — the button, the keys, the focus when columns go, the sentences, the state. Expectations by hand.
 */
type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});
const k = (s: string): RowKey => dataKey(s)!;
const MSG = {
  en: { ...EN, text: { ...EN.text, ...EN_COLUMNS.text } },
  fr: { ...FR, text: { ...FR.text, ...FR_COLUMNS.text } },
  ar: { ...AR, text: { ...AR.text, ...AR_COLUMNS.text } },
};

const leaf = (id: string, x: object = {}) => ({ id, header: id[0]!.toUpperCase() + id.slice(1), width: 100, value: (r: R) => `${id}${r.n}`, ...x });
/** Patient opens and closes (Nom in both, Prénom and Âge open only, Résumé closed only); Admission does not; Note alone. */
const tree = (): ColumnOrGroup<R>[] => [
  { id: 'patient', header: 'Patient', collapsible: true, children: [leaf('nom'), leaf('prenom', { groupShow: 'open' }), leaf('age', { groupShow: 'open' }), leaf('resume', { groupShow: 'closed' })] },
  { id: 'adm', header: 'Admission', children: [leaf('entree'), leaf('service', { groupShow: 'open' })] },
  leaf('note'),
];

function make(o: { columns?: ColumnOrGroup<R>[]; lang?: 'en' | 'fr' | 'ar'; settings?: Partial<GridSettings<R>>; features?: GridFeature[]; noGroups?: boolean } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 1200, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const feature = groups();
  const g = createGrid<R>(host, {
    rows: Array.from({ length: 20 }, (_, n) => ({ id: `r${n}`, n })), getRowId: (r) => r.id,
    columns: o.columns ?? tree(), messages: MSG[o.lang ?? 'en'], ...(o.lang === 'ar' && { direction: 'rtl' as const }),
    features: [spans(), ...(o.noGroups ? [] : [feature]), ...(o.features ?? [])], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const shown = () => ctx.columns.visible().map((c) => c.id);
  const gcells = () => [...host.querySelectorAll<HTMLElement>('.dzg-hgroup')];
  const gcell = (label: string, i = 0) => gcells().filter((c) => c.firstChild?.textContent === label)[i]!;
  const button = (label: string, i = 0) => gcell(label, i).querySelector<HTMLButtonElement>('button');
  const leafCell = (id: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${id}"]:not(.dzg-hgroup)`);
  const cell = (row: string, col: string) => ctx.rowRenderer.cell(k(row), col);
  const press = (key: string, init: KeyboardEventInit = {}) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  const said = () => announce.mock.calls.map((c) => c[0]);
  const of = <T extends GridEvent<R>['type']>(type: T) => events.filter((e) => e.type === type) as Extract<GridEvent<R>, { type: T }>[];
  return { g, ctx, host, feature, events, shown, gcells, gcell, button, leafCell, cell, press, said, of, api: () => feature.api(g)! };
}

describe('the button (header-groups.md 8, 9)', () => {
  it('only in a collapsible group’s header: a button out of the tab order, named, its state in aria-expanded and in the header’s name', () => {
    const t = make();
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    const b = t.button('Patient')!;
    expect(b).not.toBeNull();
    expect(b.type).toBe('button');
    expect(b.tabIndex).toBe(-1);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-label')).toBe('Open or close Patient');
    expect(t.gcell('Patient').getAttribute('aria-label')).toBe('Patient, group open');
    expect(t.button('Admission')).toBeNull();
    expect(t.gcell('Admission').hasAttribute('aria-label')).toBe(false);
  });

  it('the label is a text node beside the button: a repaint keeps both', () => {
    const t = make();
    t.g.update({ rowHeight: 40 });
    t.ctx.schedule();
    const c = t.gcell('Patient');
    expect(c.firstChild!.nodeType).toBe(3);
    expect(c.querySelector('button')).not.toBeNull();
    expect(c.lastChild).toBe(c.querySelector('button'));
    expect(c.textContent).toBe('Patient');
  });

  it('a click closes the group once: the listed columns stay, the band narrows, said; no sort, the focus not moved', () => {
    const t = make();
    t.leafCell('note')!.focus();
    const f = t.g.kernel.focus;
    t.button('Patient')!.click();
    expect(t.shown()).toEqual(['nom', 'resume', 'entree', 'service', 'note']);
    expect(t.gcell('Patient').getAttribute('aria-colspan')).toBe('2');
    expect(t.gcell('Patient').style.getPropertyValue('inline-size')).toBe('200px');
    expect(t.button('Patient')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.gcell('Patient').getAttribute('aria-label')).toBe('Patient, group closed');
    expect(t.g.kernel.query.sort).toEqual([]);
    expect(t.g.kernel.focus).toEqual(f);
    expect(t.of('columnsChanged').map((e) => [e.source, [...e.changed].sort()])).toEqual([['user', ['age', 'prenom', 'resume']]]);
    expect(t.said()).toEqual(['Patient closed, columns shown: 2']);
    t.button('Patient')!.click();
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    expect(t.said().at(-1)).toBe('Patient open, columns shown: 3');
  });

  it('the button’s press never reaches the header’s own handlers (no sort, no focus taken)', () => {
    const t = make();
    const b = t.button('Patient')!;
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    b.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const seen = vi.fn();
    t.gcell('Patient').addEventListener('click', seen);
    b.click();
    expect(seen).not.toHaveBeenCalled();
  });

  it('a group split by a pin: a button on each piece, one state', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'age', pinned: 'start' }] }, 'user');
    expect(t.gcells().filter((c) => c.firstChild?.textContent === 'Patient').length).toBe(2);
    t.button('Patient', 1)!.click();
    expect(t.shown()).toEqual(['nom', 'resume', 'entree', 'service', 'note']);
    t.button('Patient', 0)!.click();
    expect(t.shown()).toEqual(['age', 'nom', 'prenom', 'entree', 'service', 'note']);
    for (const i of [0, 1]) expect(t.button('Patient', i)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('starts closed with open: false', () => {
    const cols = tree();
    (cols[0] as { open?: boolean }).open = false;
    const t = make({ columns: cols });
    expect(t.shown()).toEqual(['nom', 'resume', 'entree', 'service', 'note']);
    expect(t.button('Patient')!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('keys (header-groups.md 10)', () => {
  it('Enter and Space on a focused collapsible group header toggle it; on another group nothing; Alt+Up/Down nothing', () => {
    const t = make();
    t.gcell('Patient').focus();
    t.press('Enter');
    expect(t.shown()).toEqual(['nom', 'resume', 'entree', 'service', 'note']);
    t.press(' ');
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    t.press('ArrowDown', { altKey: true });
    t.press('ArrowUp', { altKey: true });
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    t.gcell('Admission').focus();
    t.press('Enter');
    t.press(' ');
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('with a modifier, Enter does not toggle', () => {
    const t = make();
    t.gcell('Patient').focus();
    t.press('Enter', { ctrlKey: true });
    t.press('Enter', { shiftKey: true });
    expect(t.shown()).toContain('age');
  });
});

describe('the focus when columns go (header-groups.md 11)', () => {
  it('a column header that goes: its group header', () => {
    const t = make();
    t.leafCell('age')!.focus();
    t.api().toggle('patient', false, { user: true });
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'nom', level: -1 });
    expect(document.activeElement).toBe(t.gcell('Patient'));
  });

  it('a body cell that goes: the same row, the group’s first shown column', () => {
    const t = make();
    t.cell('r3', 'age')!.focus();
    t.api().toggle('patient', false, { user: true });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('r3'), column: 'nom' });
    expect(document.activeElement).toBe(t.cell('r3', 'nom'));
  });

  it('the focus on the group header stays on it, though its first column changes', () => {
    const cols: ColumnOrGroup<R>[] = [leaf('note'), { id: 'p', header: 'P', collapsible: true, children: [leaf('a', { groupShow: 'open' }), leaf('b')] }];
    const t = make({ columns: cols });
    t.gcell('P').focus();
    t.press('Enter');
    expect(t.shown()).toEqual(['note', 'b']);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'b', level: -1 });
    expect(document.activeElement).toBe(t.gcell('P'));
  });

  it('a body cell whose group shows nothing it can reach: the next shown column', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'nom', hidden: true }, { id: 'resume', hidden: true }] }, 'user');
    t.cell('r2', 'prenom')!.focus();
    // Closing would leave Patient empty but other columns shown: allowed; the focus goes on to Entrée.
    t.api().toggle('patient', false, { user: true });
    expect(t.shown()).toEqual(['entree', 'service', 'note']);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'entree' });
  });
});

describe('the API and the state (header-groups.md 6, 7)', () => {
  it('isOpen, toggle (source api, said only when asked), get (differences), reset, collapsible', () => {
    const t = make();
    const a = t.api();
    expect([a.collapsible('patient'), a.collapsible('adm'), a.collapsible('nope')]).toEqual([true, false, false]);
    expect([a.isOpen('patient'), a.isOpen('adm')]).toEqual([true, null]);
    expect(a.toggle('patient')).toBe(true);
    expect(a.isOpen('patient')).toBe(false);
    expect(a.get()).toEqual({ patient: false });
    expect(t.said()).toEqual([]);
    expect(t.of('columnsChanged').map((e) => e.source)).toEqual(['api']);
    expect(a.toggle('patient', false)).toBe(true);
    expect(t.of('columnsChanged').length).toBe(1);
    a.toggle('patient', true, { say: true });
    expect(t.said()).toEqual(['Patient open, columns shown: 3']);
    a.toggle('patient');
    a.reset();
    expect(a.get()).toEqual({});
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'entree', 'service', 'note']);
    expect(a.toggle('adm')).toBe(false);
  });

  it('a close that would leave no column shown is refused: nothing changes, nothing said', () => {
    const cols: ColumnOrGroup<R>[] = [{ id: 'p', header: 'P', collapsible: true, children: [leaf('a', { groupShow: 'open' }), leaf('b', { groupShow: 'closed' })] }];
    const t = make({ columns: cols });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'b', hidden: true }] }, 'user');
    t.gcell('P').focus();
    t.press('Enter');
    expect(t.shown()).toEqual(['a']);
    expect(t.api().isOpen('p')).toBe(true);
    expect(t.said()).toEqual([]);
  });

  it('widths kept: a column sized, its group closed and opened again', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'column.resize', column: 'age', width: 180, finished: true }, 'user');
    t.api().toggle('patient');
    t.api().toggle('patient');
    expect(t.ctx.columns.layout.center.widths.sizeAt(2)).toBe(180);
  });

  it('a column the user hid stays hidden when its group opens; showing it again never opens its group (3)', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'age', hidden: true }] }, 'user');
    t.api().toggle('patient');
    t.api().toggle('patient');
    expect(t.shown()).not.toContain('age');
    t.api().toggle('patient');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'age', hidden: false }] }, 'user');
    expect(t.api().isOpen('patient')).toBe(false);
    expect(t.shown()).not.toContain('age');
  });

  it('new definitions: the user’s states kept by id, unknown ones dropped', () => {
    const t = make();
    t.api().toggle('patient');
    const cols = tree();
    cols.splice(1, 1, { id: 'adm', header: 'Admission', collapsible: true, children: [leaf('entree'), leaf('service', { groupShow: 'open' })] });
    t.g.update({ columns: cols });
    expect(t.api().get()).toEqual({ patient: false });
    expect(t.shown()).toEqual(['nom', 'resume', 'entree', 'service', 'note']);
    t.api().toggle('adm');
    t.g.update({ columns: [leaf('x'), { id: 'adm', header: 'Admission', collapsible: true, children: [leaf('entree'), leaf('service', { groupShow: 'open' })] }] });
    expect(t.api().get()).toEqual({ adm: false });
    expect(t.shown()).toEqual(['x', 'entree']);
  });

  it('a group that shows nothing closed: its first child kept, one warning told once', () => {
    const cols: ColumnOrGroup<R>[] = [leaf('note'), { id: 'p', header: 'P', collapsible: true, children: [leaf('a', { groupShow: 'open' }), leaf('b', { groupShow: 'open' })] }];
    const t = make({ columns: cols });
    t.api().toggle('p');
    t.api().toggle('p');
    t.api().toggle('p');
    expect(t.shown()).toEqual(['note', 'a']);
    const ps = t.of('problems').flatMap((e) => e.problems).filter((p) => p.detail === 'empty-closed');
    expect(ps.map((p) => [p.code, p.severity, p.path])).toEqual([['invalid-column-group', 'warning', 'columns[1].children']]);
  });

  it('gridState: a toggle saves the groups (stateChanged); setState applies them in one fold, says nothing, as the host', () => {
    vi.useFakeTimers();
    const st = gridState({ debounce: 10 });
    const t = make({ features: [st] });
    t.button('Patient')!.click();
    vi.advanceTimersByTime(20);
    const saved = t.of('stateChanged');
    expect(saved.length).toBe(1);
    expect(saved[0]!.state.groups).toEqual({ patient: false });
    const s = st.api(t.g)!;
    const n = t.of('columnsChanged').length;
    const fold = vi.spyOn(t.ctx.columns, 'fold');
    expect(s.setState({ v: 1, groups: {} })).toEqual([]);
    expect(fold).toHaveBeenCalledTimes(1);
    expect(t.shown()).toContain('age');
    expect(t.of('columnsChanged').slice(n).map((e) => e.source)).toEqual(['host']);
    expect(t.said()).toEqual(['Patient closed, columns shown: 2']);
    expect(s.setState({ v: 1, groups: { patient: false, adm: true, nope: false } }).map((p) => [p.code, p.path])).toEqual([['state-group', 'groups.adm'], ['state-group', 'groups.nope']]);
    expect(s.state().groups).toEqual({ patient: false });
    vi.advanceTimersByTime(20);
    expect(t.of('stateChanged').length).toBe(1);
  });

  it('the same state restores the same columns left to right and right to left', () => {
    const st = { v: 1, groups: { patient: false }, columns: [{ id: 'note', order: 0, pinned: 'start' }] };
    const out = (['en', 'ar'] as const).map((lang) => {
      const s = gridState();
      const t = make({ lang, features: [s] });
      s.api(t.g)!.setState(st);
      return [t.shown(), s.api(t.g)!.state()];
    });
    expect(out[1]).toEqual(out[0]);
    expect(out[0]![0]).toEqual(['note', 'nom', 'resume', 'entree', 'service']);
  });
});

describe('languages and right to left', () => {
  it('French and Arabic texts', () => {
    const f = make({ lang: 'fr' });
    expect(f.button('Patient')!.getAttribute('aria-label')).toBe('Ouvrir ou fermer Patient');
    f.button('Patient')!.click();
    expect(f.gcell('Patient').getAttribute('aria-label')).toBe('Patient, groupe fermé');
    expect(f.said()).toEqual(['Patient fermé, colonnes affichées : 2']);
    const a = make({ lang: 'ar' });
    expect(a.button('Patient')!.getAttribute('aria-label')).toBe('فتح Patient أو طيّه');
    a.button('Patient')!.click();
    expect(a.said()).toEqual(['طُويت Patient، الأعمدة الظاهرة: 2']);
  });

  it('the chevron is a character in CSS (U+203A, as the tree’s; feedback pass A: no border), mirrored right to left, a shape in forced colours; 24 px hit area', () => {
    expect(GROUPS_CSS).toContain('.dzg-gtoggle');
    // Open: turned down (90deg; -90deg for the mirrored glyph right to left); closed: unturned, toward the inline end.
    expect(GROUPS_CSS).toContain(':where([dir=rtl] .dzg-gtoggle){--dzg-gch:-90deg}:where(.dzg-gtoggle[aria-expanded=false]){--dzg-gch:0deg}');
    expect(GROUPS_CSS).toMatch(/\.dzg-gtoggle\)\{[^}]*inline-size:var\(--dzg-target-min,24px\);block-size:var\(--dzg-target-min,24px\)/);
    expect(GROUPS_CSS).toMatch(/forced-colors:active\)\{[^}]*\.dzg-gtoggle[^}]*ButtonText/);
  });

  it('the -columns bundles carry the group texts', () => {
    for (const m of [EN_COLUMNS, FR_COLUMNS, AR_COLUMNS]) {
      for (const key of ['group.toggle', 'group.open', 'group.closed', 'group.closedSaid', 'group.openedSaid', 'chooser.inClosedGroup']) expect(m.text[key as keyof typeof m.text], `${m.locale} ${key}`).toBeTruthy();
    }
  });
});

describe('its own entry (owner Q8-4)', () => {
  it('without groups(): no button, nothing folds, the group headers as before', () => {
    const t = make({ noGroups: true });
    expect(t.button('Patient')).toBeNull();
    expect(t.gcell('Patient').hasAttribute('aria-label')).toBe(false);
    expect(t.shown()).toEqual(['nom', 'prenom', 'age', 'resume', 'entree', 'service', 'note']);
  });

  it('a tree with a collapsible group and no group texts: refused at setup, naming the key', () => {
    expect(() => make({ settings: { messages: EN } })).toThrow(/groups: missing group\.toggle/);
  });
});

describe('size lines (owner Q8-1, Q8-4, Q8-5)', () => {
  it('@dzgrid/dom/groups has its own line (the measure + 10 %); dom/spans stays within 5 300', async () => {
    const { readFileSync } = await import('node:fs');
    const b = JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')).entries;
    expect(b['@dzgrid/dom/groups']).toMatchObject({ file: 'packages/dom/src/groups.ts', maxGzip: 2100, external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal', '@dzgrid/core/spans'] });
    expect(b['@dzgrid/dom/spans'].maxGzip).toBeLessThanOrEqual(5300);
  });

  it('lines pushed by compression only (Q8-5): core/edit 3 150, core/server 6 200, the K.8 guard 84 000 (84 150 since Q9-3, 84 300 since the owner\'s look)', async () => {
    const { readFileSync } = await import('node:fs');
    const b = JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')).entries;
    expect([b['@dzgrid/core/edit'].maxGzip, b['@dzgrid/core/server'].maxGzip, b['profile: audit screen (K.8)'].maxGzip]).toEqual([3150, 6200, 84800]); // K.8: 84 800 at step 12 (Q12-1); 84 450 at the owner's third look (« Comfort stylesheet »)
  });

  it('the -columns texts get 600 / 720 / 900 B gz for the group sentences', async () => {
    const { readFileSync } = await import('node:fs');
    const b = JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')).entries;
    expect(['en', 'fr', 'ar'].map((l) => b[`@dzgrid/dom/locales/${l}-columns`].maxGzip)).toEqual([600, 720, 900]);
  });
});
