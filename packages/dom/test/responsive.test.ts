// Columns that collapse under their rows (docs/behaviors/responsive-columns.md, 1.9.0 lot B). Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridSettings } from '../src/settings.js';
import type { GridFeature } from '../src/features.js';
import { responsive } from '../src/responsive.js';
import { detail } from '../src/detail.js';
import { definePart } from '../src/part.js';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { preparePrint } from '../src/print.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { FR } from '../src/locales/fr.js';
import { FR_DETAIL } from '../src/locales/fr-detail.js';

type T = { id: string; name: string; city: string; qty: number; note: string };
const ROWS: T[] = [
  { id: '1', name: 'Ada', city: 'Lyon', qty: 1200, note: 'first' },
  { id: '2', name: 'Bob', city: 'Oran', qty: 5, note: '' },
  { id: '3', name: 'Cyd', city: 'Nice', qty: 40, note: 'third' },
];
// 160 + 120 + 100 + 160 = 540.
const COLUMNS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160 },
  { id: 'city', header: 'City', width: 120 },
  { id: 'qty', header: 'Qty', type: 'number', width: 100 },
  { id: 'note', header: 'Note', width: 160 },
];
const k = (id: string): RowKey => dataKey(id)!;
const grids: GridInstance<T>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });

const TEXT = { ...EN.text, ...EN_DETAIL.text, ...EN_EXPORT.text, ...EN_PRINT.text };
function make(o: { inline?: number; features?: GridFeature[]; settings?: Partial<GridSettings<T>>; fr?: boolean } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 400, inline: o.inline ?? 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const g = createGrid<T>(host, {
    rows: ROWS, getRowId: (r) => r.id, columns: COLUMNS,
    messages: o.fr ? { ...FR, text: { ...FR.text, ...FR_DETAIL.text } } : { ...EN, text: TEXT },
    features: o.features ?? [responsive()], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const cell = (id: string, col = 'name') => rowEl(k(id))?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const toggle = (id: string) => cell(id)!.querySelector<HTMLElement>('.dzg-toggle');
  const heads = () => [...host.querySelectorAll<HTMLElement>('.dzg-hcell[data-col]')].map((c) => c.getAttribute('data-col'));
  const lines = (id: string) => [...(rowEl(`x:${k(id)}` as RowKey)?.querySelectorAll('dl.dzg-rlines > div') ?? [])].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]);
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const focus = (id: string, col = 'name') => { g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k(id), column: col } }, 'user'); ctx.restoreFocus(); };
  const resize = (px: number) => { box.inline = px; ctx.schedule(); };
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, host, ctx, box, events, cell, toggle, heads, lines, press, focus, resize, problems, said: () => announce.mock.calls.map((c) => c[0]) };
}

describe('responsive() — collapse and lines', () => {
  it('wide enough (540 ≤ 600): every column, no chevron, no slot, no aria-expanded (4)', () => {
    const t = make();
    expect(t.heads()).toEqual(['name', 'city', 'qty', 'note']);
    expect(t.cell('1')!.hasAttribute('aria-expanded')).toBe(false);
    expect(t.host.querySelector('.dzg-toggle:not([data-none])')).toBeNull();
    expect(t.host.querySelector('.dzg')!.hasAttribute('data-dzg-responsive')).toBe(true);
  });

  it('narrower (300): the last columns go; a chevron on each row; opened: « Title: value » lines in screen order (1, 2)', () => {
    const t = make();
    t.resize(400);
    // 540 − 160 (note) = 380 ≤ 400.
    expect(t.heads()).toEqual(['name', 'city', 'qty']);
    t.resize(300);
    // 380 − 100 (qty) = 280 ≤ 300.
    expect(t.heads()).toEqual(['name', 'city']);
    expect(t.cell('1')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.toggle('1')!.hasAttribute('data-none')).toBe(false);
    t.toggle('1')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.cell('1')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.lines('1')).toEqual([['Qty', '1,200'], ['Note', 'first']]);
    // A blank value: an empty line.
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('2')], expanded: true }, 'api');
    expect(t.lines('2')).toEqual([['Qty', '5'], ['Note', '']]);
  });

  it('an open panel follows: narrower still adds a line; wide again hides the panel, narrow again shows it (3, 4)', () => {
    const t = make({ inline: 400 });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('1')], expanded: true }, 'api');
    expect(t.lines('1')).toEqual([['Note', 'first']]);
    // 280 − 120 (city) = 160 ≤ 250.
    t.resize(250);
    expect(t.heads()).toEqual(['name']);
    expect(t.lines('1')).toEqual([['City', 'Lyon'], ['Qty', '1,200'], ['Note', 'first']]);
    t.resize(900);
    t.ctx.schedule();
    expect(t.heads()).toEqual(['name', 'city', 'qty', 'note']);
    expect(t.host.querySelector('.dzg-dbody')).toBeNull();
    expect(t.cell('1')!.hasAttribute('aria-expanded')).toBe(false);
    t.resize(300);
    t.ctx.schedule();
    expect(t.lines('1')).toEqual([['Qty', '1,200'], ['Note', 'first']]);
  });

  it('the priority: the column’s own, the option’s over it; 0 never (1)', () => {
    const cols = COLUMNS.map((c) => (c.id === 'city' ? { ...c, collapsePriority: 5 } : c.id === 'note' ? { ...c, collapsePriority: 0 } : c));
    const t = make({ inline: 450, settings: { columns: cols } });
    // city (5) first: 540 − 120 = 420 ≤ 450.
    expect(t.heads()).toEqual(['name', 'qty', 'note']);
    const u = make({ inline: 450, settings: { columns: cols }, features: [responsive({ priority: { qty: 9 } })] });
    expect(u.heads()).toEqual(['name', 'city', 'note']);
  });

  it('nothing told, nothing in the state: no columnsChanged, hidden stays false (5)', () => {
    const t = make();
    t.events.length = 0;
    t.resize(300);
    expect(t.events.filter((e) => e.type === 'columnsChanged')).toEqual([]);
    expect(t.g.kernel.columns.state().map((s) => s.hidden ?? false)).toEqual([false, false, false, false]);
  });

  it('Enter and Space on the first cell open and close, said; Space elsewhere still ticks (6, 7)', () => {
    const t = make({ inline: 400, settings: { selection: { mode: 'multi' } } });
    t.focus('1');
    t.press('Enter');
    expect(t.g.kernel.expansion.has(k('1'))).toBe(true);
    expect(t.said()).toContain('Ada expanded');
    t.press(' ');
    expect(t.g.kernel.expansion.has(k('1'))).toBe(false);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.focus('2', 'city');
    t.press(' ');
    expect(t.g.kernel.selection.keys.has(k('2'))).toBe(true);
    // The panel: a group named after the row, its lines a description list.
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: true }, 'api');
    const body = t.host.querySelector('.dzg-dbody')!;
    expect([body.getAttribute('role'), body.getAttribute('aria-label')]).toEqual(['group', 'Details of Cyd']);
    expect(body.querySelector('dl')).not.toBeNull();
  });

  it('wide: Enter and Space keep their meaning (no lines to open)', () => {
    const t = make({ settings: { selection: { mode: 'multi' } } });
    t.focus('1');
    t.press(' ');
    expect(t.g.kernel.selection.keys.has(k('1'))).toBe(true);
    expect(t.g.kernel.expansion.size).toBe(0);
  });

  it('the focus on a column that collapses goes to the same row’s first cell (8)', () => {
    const t = make();
    t.focus('2', 'note');
    t.resize(300);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('2'), column: 'name' });
  });

  it('the quick search reads a collapsed column (9)', () => {
    const t = make({ inline: 300 });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'third' }, 'user');
    expect(t.g.kernel.rows.displayed.count).toBe(1);
  });

  it('the totals row of a collapsed column still reaches the file (1.9.0 review: every place)', async () => {
    const { pinnedRows } = await import('../src/pinned-rows.js');
    const { totalsRow } = await import('../src/totals-row.js');
    const { EN_TOTALS } = await import('../src/locales/en-totals.js');
    const { EN_PINNED } = await import('../src/locales/en-pinned.js');
    const files: { blob?: Blob }[] = [];
    const ex = csvExport({ canExport: true, deliver: (d) => void files.push(d), loadRun: () => import('../src/export/run/index.js') } as CsvExportOptions);
    const totals = totalsRow();
    const t = make({
      inline: 300, features: [responsive(), totals, pinnedRows(), ex],
      settings: { columns: COLUMNS.map((c) => (c.id === 'qty' ? { ...c, total: 'sum' as const } : c)), messages: { ...EN, text: { ...TEXT, ...EN_TOTALS.text, ...EN_PINNED.text } } },
    });
    expect(t.ctx.columns.collapsed!.has('qty')).toBe(true);
    expect(totals.api(t.g)!.values()).toEqual({ qty: 1245 });
    expect(await ex.run('displayed')).toBe('done');
    const text = await files[0]!.blob!.text();
    expect(text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).at(-1)).toBe('Total,,1245,');
  });

  it('CSV and print write every column; no panel row (11)', async () => {
    const files: { blob?: Blob }[] = [];
    const ex = csvExport({ canExport: true, deliver: (d) => void files.push(d), loadRun: () => import('../src/export/run/index.js') } as CsvExportOptions);
    const t = make({ inline: 300, features: [responsive(), ex] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('1')], expanded: true }, 'api');
    expect(await ex.run('displayed')).toBe('done');
    const text = await files[0]!.blob!.text();
    expect(text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)).toEqual(['Name,City,Qty,Note', 'Ada,Lyon,1200,first', 'Bob,Oran,5,', 'Cyd,Nice,40,third']);
    const done = await preparePrint(t.g);
    expect([...document.querySelectorAll('.dzg-print thead th')].map((th) => th.textContent)).toEqual(['Name', 'City', 'Qty', 'Note']);
    expect(document.querySelectorAll('.dzg-print tbody tr')).toHaveLength(3);
    done!();
  });

  it('French: the lines in French, the panel named in French', () => {
    const t = make({ inline: 300, fr: true, settings: { locale: 'fr-FR' } });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('1')], expanded: true }, 'api');
    expect(t.lines('1')).toEqual([['Qty', '1\u202f200'], ['Note', 'first']]);
    expect(t.host.querySelector('.dzg-dbody')!.getAttribute('aria-label')).toBe('Détails de Ada');
  });

  it('with the application’s own detail(): told, the first listed wins, nothing collapses (14)', () => {
    const part = definePart('detail', { mount: (h) => ((h.textContent = 'own'), {}) });
    const t = make({ inline: 300, features: [detail<T>({ part }), responsive()] });
    expect(t.heads()).toEqual(['name', 'city', 'qty', 'note']);
    expect(t.problems()).toContainEqual({ code: 'unsupported-combination', severity: 'warning', path: 'responsive', detail: 'detail' });
  });

  it('collapsePriority without the feature: missing-feature (14)', () => {
    const t = make({ features: [], settings: { columns: [{ ...COLUMNS[0]!, collapsePriority: 2 }, ...COLUMNS.slice(1)] } });
    expect(t.problems()).toContainEqual({ code: 'missing-feature', severity: 'warning', path: 'columns[0].collapsePriority', detail: 'responsive' });
  });

  it('destroyed: the columns back, the attribute gone', () => {
    const t = make({ inline: 300 });
    t.g.destroy();
    expect(t.g.kernel.columns.visible().map((c) => c.id)).toEqual(['name', 'city', 'qty', 'note']);
  });
});
