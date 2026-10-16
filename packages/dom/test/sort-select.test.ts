import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

type R = { id: string; name: string; n: number; t: string };
const rowsOf = (n: number) => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, name: `n${String(i).padStart(4, '0')}`, n: i, t: i % 2 ? 'odd' : 'even' }));
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function make(over: Partial<GridSettings<R>> = {}, count = 1000) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'Count', type: 'number' }, { id: 't', header: 'Kind', sortable: false }];
  const g = createGrid<R>(host, { rows: rowsOf(count), getRowId: (r) => r.id, columns, messages: EN, onEvent: (e) => events.push(e), ...over }, { geometry, sync: true });
  grids.push(g);
  const head = (col: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${col}"]`)!;
  const rowEl = (id: string) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${g.kernel.rows.displayed.indexOf(dataKey(id)!) + 2}"]`)!;
  const cellOf = (id: string, col = 'name') => rowEl(id).querySelector<HTMLElement>(`[data-col="${col}"]`)!;
  const click = (el: HTMLElement, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  const live = () => host.querySelector('.dzg-live')!.textContent;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  return { g, host, vp, events, head, rowEl, cellOf, click, live, box };
}

describe('sort by click', () => {
  it('cycles ascending, descending, none, with aria-sort on the sorted header only', () => {
    const { g, head, click, events } = make();
    click(head('n'));
    expect(head('n').getAttribute('aria-sort')).toBe('ascending');
    expect(head('name').hasAttribute('aria-sort')).toBe(false);
    click(head('n'));
    expect(head('n').getAttribute('aria-sort')).toBe('descending');
    expect(g.kernel.rows.displayed.keyAt(g.kernel.rows.displayed.index(0)!)).toBe(dataKey('r999'));
    click(head('n'));
    expect(head('n').hasAttribute('aria-sort')).toBe(false);
    expect(events.filter((e) => e.type === 'sortChanged').every((e) => e.source === 'user')).toBe(true);
  });

  it('adds with Shift, shows the precedence and names it, aria-sort on the first key only', () => {
    const { head, click } = make();
    click(head('n'));
    click(head('name'), { shiftKey: true });
    expect(head('n').getAttribute('aria-sort')).toBe('ascending');
    expect(head('name').hasAttribute('aria-sort')).toBe(false);
    expect(head('name').querySelector('.dzg-sort')!.textContent).toBe('2');
    expect(head('name').getAttribute('aria-label')).toBe('Name, Sort 2');
    expect(head('n').querySelector('.dzg-sort')!.getAttribute('data-dir')).toBe('asc');
  });

  it('does nothing on a column that cannot sort, which is not marked sortable', () => {
    const { head, click, events } = make();
    click(head('t'));
    expect(events.filter((e) => e.type === 'sortChanged')).toEqual([]);
    expect(head('t').classList.contains('dzg-sortable')).toBe(false);
    expect(head('n').classList.contains('dzg-sortable')).toBe(true);
  });

  it('sorts with Enter and Shift+Enter on a focused header', () => {
    const { g, head } = make();
    head('n').focus();
    head('n').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    head('name').focus();
    head('name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect(g.kernel.rows.query.sort).toEqual([{ column: 'n', dir: 'asc' }, { column: 'name', dir: 'asc' }]);
  });

  it('announces the new order and the row count, in French and Arabic', async () => {
    const fr = make({ messages: FR, locale: 'fr-FR' });
    fr.click(fr.head('n'));
    await tick();
    expect(fr.live()).toBe(`Trié par Count, ordre croissant. ${new Intl.NumberFormat('fr-FR').format(1000)} lignes`);
    fr.click(fr.head('n'));
    fr.click(fr.head('n'));
    await tick();
    expect(fr.live()).toBe('Tri retiré');
    const ar = make({ messages: AR, locale: 'ar-DZ' });
    ar.click(ar.head('n'));
    await tick();
    expect(ar.live()).toBe(`مرتب حسب Count، تصاعدي. ${new Intl.NumberFormat('ar-DZ-u-nu-latn').format(1000)} صف`);
  });

  it('keeps focus, selection and scroll through a sort', () => {
    const { g, head, click, box, vp } = make({ selection: { mode: 'multi' } });
    g.api.focusCell(dataKey('r500')!, 'name');
    const focused = document.activeElement;
    g.kernel.dispatch({ type: 'selection.toggle', row: dataKey('r500')! }, 'user');
    box.scrollTop = 1234;
    vp.dispatchEvent(new Event('scroll'));
    const top = (g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop;
    expect(top).toBe(1234);
    click(head('n'));
    click(head('n'));
    expect(g.kernel.focus).toMatchObject({ row: dataKey('r500') });
    expect(document.activeElement).toBe(focused);
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r500')]);
    expect((g as unknown as { scroll: { logicalTop: number } }).scroll.logicalTop).toBe(1234);
    expect(box.scrollTop).toBe(1234);
  });
});

describe('row selection', () => {
  it('selects one row by click, toggles with Ctrl or Cmd, extends with Shift', () => {
    const { g, cellOf, click, rowEl } = make({ selection: { mode: 'multi', click: true } });
    const ids = () => [...g.kernel.selection.keys].map(String).sort();
    click(cellOf('r2'));
    expect(ids()).toEqual([String(dataKey('r2'))]);
    expect(rowEl('r2').getAttribute('aria-selected')).toBe('true');
    expect(rowEl('r3').getAttribute('aria-selected')).toBe('false');
    click(cellOf('r4'), { ctrlKey: true });
    expect(ids().length).toBe(2);
    click(cellOf('r6'), { shiftKey: true });
    expect(ids()).toEqual(['r4', 'r5', 'r6'].map((x) => String(dataKey(x))).sort());
  });

  it('replaces the selection on Ctrl+click in single mode, and has no aria-multiselectable', () => {
    const { g, cellOf, click, vp } = make({ selection: { mode: 'single', click: true } });
    click(cellOf('r2'));
    click(cellOf('r4'), { ctrlKey: true });
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r4')]);
    expect(vp.hasAttribute('aria-multiselectable')).toBe(false);
    expect(make({ selection: { mode: 'multi' } }).vp.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('does not select on click unless asked, but Space toggles the focused row', () => {
    const { g, cellOf, click } = make({ selection: { mode: 'multi' } });
    click(cellOf('r2'));
    expect(g.kernel.selection.keys.size).toBe(0);
    g.api.focusCell(dataKey('r2')!, 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r2')]);
  });

  it('survives sort and filter', () => {
    const { g, cellOf, click } = make({ selection: { mode: 'multi', click: true } });
    click(cellOf('r2'));
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: {}, quick: '', key: 'none' } }, 'user');
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r2')]);
  });

  it('announces a range whose first row is filtered out, and changes nothing', async () => {
    const { g, cellOf, click, live } = make({ selection: { mode: 'multi', click: true } });
    click(cellOf('r2'));
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    click(cellOf('r5'), { shiftKey: true });
    await tick();
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r2')]);
    expect(live()).toBe(EN.text['announce.rangeCancelled']);
  });

  it('shows a checkbox column counted in aria-colindex, and a tri-state header box', () => {
    const { g, host, vp, click, rowEl } = make({ selection: { mode: 'multi', checkbox: true } }, 6);
    expect(vp.getAttribute('aria-colcount')).toBe('4');
    const box = host.querySelector<HTMLElement>('.dzg-header [role=checkbox]')!;
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(box.getAttribute('aria-label')).toBe(EN.text['selection.all']);
    expect(box.closest('[role=columnheader]')!.getAttribute('aria-colindex')).toBe('1');
    const rowBox = rowEl('r1').querySelector<HTMLElement>('.dzg-check')!;
    expect(rowBox.getAttribute('aria-colindex')).toBe('1');
    expect(rowBox.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(rowEl('r1').querySelector('[data-col="name"]')!.getAttribute('aria-colindex')).toBe('2');
    click(rowBox);
    expect(box.getAttribute('aria-checked')).toBe('mixed');
    click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(g.kernel.selection.keys.size).toBe(6);
    click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(g.kernel.selection.keys.size).toBe(0);
  });

  it('selects all displayed with Ctrl+A in multi mode only', () => {
    const multi = make({ selection: { mode: 'multi' } }, 10);
    multi.g.api.focusCell(dataKey('r0')!, 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(multi.g.kernel.selection.keys.size).toBe(10);
  });
});
