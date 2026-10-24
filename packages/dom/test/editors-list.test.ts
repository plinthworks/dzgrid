// The list editor (Phase 5 step 6, step06-plan « Behaviour » 12–17; editors.md 12–17; owner Q15, S6-O2): an APG
// select-only combobox in the cell, its listbox in a popup under the cell (above when no room, never over it); the
// keys, the type-ahead (500 ms, folded: case, accents, tashkil, alef forms; the same letter cycles; seeded by the
// opening key); keep, move, give up; a press on an option; the blur rule; the options; the 500 cap; a value not in
// the list; a refusal.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { listEditor } from '../src/editors-list.js';
import { ed, cleanup, k, layout, rowsOf, tick, type R } from './support-editors.js';

afterEach(cleanup);

type Row = R & { st: string | null; who: string | null; n30: string | null };
const ST = [{ value: 'pending', label: 'En attente' }, { value: 'due', label: 'Échu' }, { value: 'paid', label: 'Payé' }, { value: 'part', label: 'Partiel' }];
const WHO = ['أحمد', 'مُحَمَّد', 'بلال', 'باسم', 'بشير', 'Bilal', 'Basim', 'Bashir'].map((v) => ({ value: v }));
const N30 = Array.from({ length: 30 }, (_, i) => ({ value: `o${i}`, label: `Option ${String(i).padStart(2, '0')}` }));
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'st', header: 'Statut', type: 'enum', enumOptions: ST, width: 120, editable: true },
  { id: 'who', header: 'Qui', width: 120, editable: true, edit: { options: WHO } },
  { id: 'n30', header: 'N', width: 120, editable: true, edit: { options: N30 } },
];
const grid = (o: { cols?: ColumnDef<Row, any>[]; st?: string | null; lang?: 'fr' | 'ar'; settings?: object; bare?: boolean; down?: boolean } = {}) => {
  // The list comes in its own entry (owner S6-O7): `editors({ list: listEditor })`.
  const t = ed({ lang: o.lang ?? 'fr', columns: (o.cols ?? COLS) as never, ...(!o.bare && { options: { list: listEditor, ...(o.down && { enterMoves: 'down' as const }) } }), rows: rowsOf(30).map((r) => ({ ...r, st: o.st === undefined ? 'pending' : o.st, who: null, n30: 'o5' })) as never, ...(o.settings && { settings: o.settings as never }) });
  let clock = 1000;
  (t.ctx as { now: () => number }).now = () => clock;
  const wait = (ms: number) => void (clock += ms);
  const combo = () => t.host.querySelector<HTMLElement>('.dzg-combo');
  const list = () => document.querySelector<HTMLElement>('.dzg-popup [role=listbox]');
  const opts = () => [...(list()?.querySelectorAll<HTMLElement>('[role=option]') ?? [])];
  const active = () => document.getElementById(combo()!.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null;
  const open = (id = 'r1', col = 'st', key = 'F2', init: KeyboardEventInit = {}) => {
    t.at(id, col);
    t.key(key, init);
    return combo()!;
  };
  const press = (key: string, init: KeyboardEventInit = {}) => t.key(key, init, combo()!);
  const saved = () => t.of('cellEdited').map((e) => [e.column, e.value]);
  return { ...t, wait, combo, list, opts, active, open, press, saved };
};

describe('the combobox and its list (12–14)', () => {
  it('roles, ids and names: the combobox focused in the cell, the listbox controlled, the chosen option selected and active', () => {
    const t = grid();
    const c = t.open();
    expect(c.getAttribute('role')).toBe('combobox');
    expect(c.closest('.dzg-cell')).toBe(t.cell('r1', 'st'));
    expect(c.getAttribute('data-dzg-owner')).toBe('editor');
    expect(document.activeElement).toBe(c);
    expect(c.getAttribute('aria-haspopup')).toBe('listbox');
    expect(c.getAttribute('aria-expanded')).toBe('true');
    expect(c.getAttribute('aria-label')).toBe('Statut, Name 1');
    expect(c.getAttribute('aria-controls')).toBe(t.list()!.id);
    expect(t.opts().map((x) => x.textContent)).toEqual(['En attente', 'Échu', 'Payé', 'Partiel']);
    expect(t.opts().map((x) => x.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    expect(t.active()).toBe('En attente');
    expect(c.textContent).toBe('En attente');
    expect(new Set(t.opts().map((x) => x.id)).size).toBe(4);
  });

  it('labels: the option’s, else the column’s text for the value; an options list on a text column', () => {
    const t = grid();
    t.open('r1', 'who');
    expect(t.opts().map((x) => x.textContent)).toEqual(WHO.map((w) => w.value));
    expect(t.active()).toBeNull();
    expect(t.combo()!.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('an options function is told the row and the context, at the opening; one that throws is reported and opens nothing', () => {
    const seen: unknown[] = [];
    const fn = (row: Row, c: unknown) => (seen.push([row.id, c]), ST);
    let t = grid({ cols: [COLS[0]!, { ...COLS[2]!, edit: { options: fn } }], settings: { context: { app: 1 } } });
    expect(seen).toEqual([]);
    t.open('r2', 'who');
    expect(seen).toEqual([['r2', { app: 1 }]]);
    cleanup();
    const reported: unknown[] = [];
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
    t = grid({ cols: [COLS[0]!, { ...COLS[2]!, edit: { options: () => { throw new Error('x'); } } }] });
    t.open('r2', 'who');
    expect(t.combo()).toBeNull();
    expect(t.list()).toBeNull();
    expect(reported).toHaveLength(1);
    delete (window as unknown as { reportError?: unknown }).reportError;
  });

  it('a value not among the options: an extra first option, marked, keepable (Enter saves nothing, refuses nothing)', () => {
    const t = grid({ st: 'gone' });
    t.open();
    const first = t.opts()[0]!;
    expect(first.textContent).toBe('gone (hors liste)');
    expect(first.classList.contains('dzg-opt--out')).toBe(true);
    expect(t.active()).toBe('gone (hors liste)');
    t.press('ArrowDown');
    t.press('ArrowUp');
    t.press('Enter');
    expect(t.combo()).toBeNull();
    expect(t.saved()).toEqual([]);
    expect(t.alert).not.toHaveBeenCalled();
  });

  it('more than 500 options: a warning and a text field read by the codec; 500 still a list', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}` }));
    let t = grid({ cols: [COLS[0]!, { ...COLS[2]!, edit: { options: many(500) } }] });
    t.open('r1', 'who');
    expect(t.combo()).not.toBeNull();
    cleanup();
    t = grid({ cols: [COLS[0]!, { ...COLS[2]!, edit: { options: many(501) } }] });
    t.open('r1', 'who');
    expect(t.combo()).toBeNull();
    expect(t.field()).not.toBeNull();
    const p = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems);
    expect(p).toEqual([expect.objectContaining({ code: 'invalid-column', path: 'columns.who.edit.options', detail: '500' })]);
  });

  it('edit.editor: \'list\' without options: invalid-column at edit.editor, a text field', () => {
    const t = grid({ cols: [COLS[0]!, { id: 'x', header: 'X', width: 80, editable: true, edit: { editor: 'list' } }] });
    t.open('r1', 'x');
    expect(t.field()).not.toBeNull();
    const p = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);
    expect(p).toEqual([expect.objectContaining({ code: 'invalid-column', path: 'columns.x.edit.editor' })]);
  });
});

describe('without @dzgrid/dom/editors-list (owner S6-O7)', () => {
  it('a list column opens a text field read by the codec (labels read), one warning per column naming the entry', () => {
    const t = grid({ bare: true });
    t.open();
    expect(t.combo()).toBeNull();
    expect(t.field()!.value).toBe('En attente');
    t.type('payé');
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([['st', 'paid']]);
    t.open('r3');
    t.key('Escape', {}, t.field()!);
    const p = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems).filter((x) => x.code === 'missing-feature');
    expect(p).toEqual([expect.objectContaining({ path: 'columns.st.edit', detail: '@dzgrid/dom/editors-list' })]);
  });
});

describe('placement (13)', () => {
  it('below the cell, above it when there is no room below — never over the cell; the popup in the grid’s direction', () => {
    layout();
    const t = grid({ lang: 'ar' });
    t.open();
    const pop = t.list()!.closest<HTMLElement>('.dzg-popup')!;
    expect(pop.getAttribute('dir')).toBe('rtl');
    expect(parseFloat(pop.style.insetBlockStart)).toBeGreaterThanOrEqual(132);
    t.press('Escape');
    vi.restoreAllMocks();
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 300, right: 380, x: 300, y: top, width: 80, height: bottom - top, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('dzg-viewport')) return rect(0, 768);
      if (this.classList.contains('dzg-popup')) return rect(0, 200);
      return rect(700, 732);
    });
    t.open('r2');
    const top = parseFloat(t.list()!.closest<HTMLElement>('.dzg-popup')!.style.insetBlockStart);
    expect(top + 200).toBeLessThanOrEqual(700);
  });
});

describe('keys (16)', () => {
  it('Up/Down by one, Home/End, PageUp/PageDown by ten, clamped (no wrap); aria-activedescendant follows', () => {
    const t = grid();
    t.open('r1', 'n30');
    expect(t.active()).toBe('Option 05');
    t.press('ArrowDown');
    expect(t.active()).toBe('Option 06');
    t.press('PageDown');
    expect(t.active()).toBe('Option 16');
    t.press('PageDown');
    t.press('PageDown');
    expect(t.active()).toBe('Option 29');
    t.press('ArrowDown');
    expect(t.active()).toBe('Option 29');
    t.press('Home');
    expect(t.active()).toBe('Option 00');
    t.press('ArrowUp');
    expect(t.active()).toBe('Option 00');
    t.press('PageUp');
    expect(t.active()).toBe('Option 00');
    t.press('End');
    expect(t.active()).toBe('Option 29');
    t.press('PageUp');
    expect(t.active()).toBe('Option 19');
    // The active option is the selected one (APG select-only; review R2).
    expect(t.opts().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent)).toEqual(['Option 19']);
  });

  it('type-ahead: a prefix within 500 ms (499 continues, 501 starts again), folded (« e » finds « Échu »)', () => {
    const t = grid();
    t.open();
    t.press('p');
    expect(t.active()).toBe('Payé');
    t.wait(499);
    t.press('a');
    t.wait(499);
    t.press('r');
    expect(t.active()).toBe('Partiel');
    t.wait(501);
    t.press('e');
    expect(t.active()).toBe('En attente');
    t.wait(501);
    t.press('E');
    t.wait(10);
    t.press('c');
    expect(t.active()).toBe('Échu');
    t.wait(10);
    t.press('Backspace');
    t.press('n');
    expect(t.active()).toBe('En attente');
  });

  it('the same letter again cycles through the options starting with it (Latin and Arabic)', () => {
    const t = grid();
    t.open('r1', 'who');
    for (const want of ['Bilal', 'Basim', 'Bashir', 'Bilal']) {
      t.press('b');
      t.wait(100);
      expect(t.active()).toBe(want);
    }
    t.wait(600);
    for (const want of ['بلال', 'باسم', 'بشير', 'بلال']) {
      t.press('ب');
      t.wait(100);
      expect(t.active()).toBe(want);
    }
  });

  it('Arabic folded: « محمد » finds « مُحَمَّد » (tashkil), « احمد » finds « أحمد » (alef forms)', () => {
    const t = grid({ lang: 'ar' });
    t.open('r1', 'who');
    for (const ch of 'محمد') t.press(ch), t.wait(50);
    expect(t.active()).toBe('مُحَمَّد');
    t.wait(600);
    for (const ch of 'احمد') t.press(ch), t.wait(50);
    expect(t.active()).toBe('أحمد');
  });

  it('a printable key on the cell opens the list with it as the prefix’s first letter', () => {
    const t = grid();
    t.at('r1', 'st');
    expect(t.key('p').defaultPrevented).toBe(true);
    expect(t.list()).not.toBeNull();
    expect(t.active()).toBe('Payé');
    t.wait(100);
    t.press('a');
    t.press('r');
    expect(t.active()).toBe('Partiel');
  });

  it('analyser 4 (Q3 revised): by default a pick by Enter keeps the focus on its cell', () => {
    const t = grid();
    t.open();
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.saved()).toEqual([['st', 'due']]);
    expect(t.focusAt()).toBe('r1/st');
  });

  it("Enter picks the active option, keeps it and goes down (enterMoves: 'down'); Escape gives up", () => {
    const t = grid({ down: true });
    t.open();
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.saved()).toEqual([['st', 'due']]);
    expect(t.combo()).toBeNull();
    expect(t.list()).toBeNull();
    expect(t.focusAt()).toBe('r2/st');
    t.open('r3');
    t.press('End');
    t.press('Escape');
    expect(t.saved()).toEqual([['st', 'due']]);
    expect(t.focusAt()).toBe('r3/st');
  });

  it('Tab picks and moves to the next editable cell (it opens there)', () => {
    const t = grid();
    t.open();
    t.press('ArrowDown');
    t.press('Tab');
    expect(t.saved()).toEqual([['st', 'due']]);
    expect(t.focusAt()).toBe('r1/who');
    expect(t.combo()).not.toBeNull();
  });

  it('Space without a prefix picks and keeps, without moving; during a prefix it is a letter', () => {
    const t = grid({ cols: [COLS[0]!, { ...COLS[1]!, enumOptions: [...ST, { value: 'pa', label: 'Pa ss' }] }] });
    t.open();
    t.press('p');
    t.wait(50);
    t.press('a');
    t.wait(50);
    t.press(' ');
    t.wait(50);
    t.press('s');
    expect(t.active()).toBe('Pa ss');
    t.wait(600);
    t.press(' ');
    expect(t.saved()).toEqual([['st', 'pa']]);
    expect(t.focusAt()).toBe('r1/st');
  });

  it('a press on an option keeps the focus on the combobox and keeps that option', () => {
    const t = grid();
    const c = t.open();
    const o = t.opts()[2]!;
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    o.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    o.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(c);
    o.click();
    expect(t.saved()).toEqual([['st', 'paid']]);
    expect(t.combo()).toBeNull();
  });
});

describe('blur and refusal (17)', () => {
  it('blur keeps the active option only if the user moved it (Q5)', async () => {
    const t = grid();
    const out = document.body.appendChild(document.createElement('button'));
    t.open();
    out.focus();
    await tick();
    expect(t.combo()).toBeNull();
    expect(t.saved()).toEqual([]);
    t.open('r2');
    t.press('ArrowDown');
    out.focus();
    await tick();
    expect(t.saved()).toEqual([['st', 'due']]);
  });

  it('refused (validate): the list closes, the combobox stays, invalid, the bubble; Down shows the list again', () => {
    layout();
    const t = grid({ cols: [COLS[0]!, { ...COLS[1]!, validate: (v: string | null) => (v === 'paid' ? 'nope' : null) }] });
    const c = t.open();
    t.press('End');
    t.press('ArrowUp');
    t.press('Enter');
    expect(t.saved()).toEqual([]);
    expect(t.combo()).toBe(c);
    expect(t.list()).toBeNull();
    expect(c.getAttribute('aria-expanded')).toBe('false');
    expect(c.getAttribute('aria-invalid')).toBe('true');
    expect(t.bubble()!.hidden).toBe(false);
    expect(document.activeElement).toBe(c);
    t.press('ArrowDown');
    expect(t.list()).not.toBeNull();
    expect(t.active()).toBe('Payé');
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.saved()).toEqual([['st', 'part']]);
  });

  it('the grid destroyed with the list open: the popup gone', () => {
    const t = grid();
    t.open();
    t.g.destroy();
    expect(document.querySelector('.dzg-popup')).toBeNull();
    expect(k('r1')).toBeTruthy();
  });
});
