// Row numbers (1.4.0, docs/behaviors/row-numbers.md; owner decisions 2026-11-03): a strip at the inline start of every
// row, 1, 2, 3… in display order, never a column; a click takes the row as the block (`range()`), Shift+click the rows
// between; row selection without `range()`; nothing with neither. Expectations written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridFeature } from '../src/index.js';
import { rowNumbers } from '../src/row-numbers.js';
import { pinnedRows } from '../src/pinned-rows.js';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_ROW_NUMBERS } from '../src/locales/en-row-numbers.js';
import { FR_ROW_NUMBERS } from '../src/locales/fr-row-numbers.js';
import { AR } from '../src/locales/ar.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { AR_ROW_NUMBERS } from '../src/locales/ar-row-numbers.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { cleanup, idOf, join, k, rmake, rowsOf, type R, type RMake } from './support-range.js';

afterEach(() => cleanup());

const EN_MSG = join(EN, EN_RANGE, EN_ROW_NUMBERS);

function nmake(o: RMake & { numbers?: boolean; withRange?: boolean; more?: GridFeature[] } = {}) {
  const t = rmake({
    messages: EN_MSG, ...o,
    features: (r) => [...(o.more ?? []), ...(o.withRange === false ? [] : [r]), ...(o.numbers === false ? [] : [rowNumbers()])],
  });
  /** The strip's cell of a body row. */
  const lead = (id: string) => t.rowEl(id)?.querySelector<HTMLElement>('.dzg-lead') ?? null;
  /** The numbers shown, top to bottom, as `row=number`. */
  const shown = (n = 4) => [...t.ctx.el.layer.querySelectorAll<HTMLElement>(':scope > .dzg-row')]
    .map((r) => ({ top: parseFloat(r.style.top || r.style.insetBlockStart || '0'), id: idOf(t.ctx.rowRenderer.keyOf(r)), n: r.querySelector('.dzg-lead')?.textContent }))
    .sort((a, b) => a.top - b.top).slice(0, n).map((x) => `${x.id}=${x.n}`);
  const corner = () => t.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell.dzg-lead');
  return { ...t, lead, shown, corner };
}

describe('the strip (row-numbers.md 1–3, 6, 11)', () => {
  it('without the feature: no strip, the columns counted as before', () => {
    const t = nmake({ numbers: false });
    expect(t.host.querySelector('.dzg-lead')).toBeNull();
    expect(t.vp.getAttribute('aria-colcount')).toBe('4');
    expect(t.cell('r0')!.getAttribute('aria-colindex')).toBe('1');
  });

  it('with it: a cell first in every row\'s start segment, 1, 2, 3 from the top; the columns after it', () => {
    const t = nmake();
    expect(t.shown(3)).toEqual(['r0=1', 'r1=2', 'r2=3']);
    const l = t.lead('r0')!;
    expect(l.parentElement).toBe(t.rowEl('r0')!.querySelector('.dzg-seg-start'));
    expect(l.parentElement!.firstElementChild).toBe(l);
    expect(l.getAttribute('role')).toBe('gridcell');
    expect(l.getAttribute('aria-colindex')).toBe('1');
    expect(t.vp.getAttribute('aria-colcount')).toBe('5');
    expect(t.cell('r0')!.getAttribute('aria-colindex')).toBe('2');
    expect(t.cell('r0', 'q')!.getAttribute('aria-colindex')).toBe('5');
  });

  it('the corner: a column header named « Row number », colindex 1', () => {
    const t = nmake();
    const c = t.corner()!;
    expect(c.getAttribute('role')).toBe('columnheader');
    expect(c.getAttribute('aria-colindex')).toBe('1');
    expect(c.textContent).toBe('Row number');
    expect(c.parentElement!.firstElementChild).toBe(c);
  });

  it('room: the start segment and the row grow by the strip; three digits wider than two', () => {
    const small = nmake({ rows: rowsOf(20) });
    const w2 = parseFloat(small.lead('r0')!.style.inlineSize);
    expect(w2).toBeGreaterThan(20);
    const seg = small.rowEl('r0')!.querySelector<HTMLElement>('.dzg-seg-start')!;
    expect(parseFloat(seg.style.inlineSize)).toBe(w2);
    expect(parseFloat(small.rowEl('r0')!.style.inlineSize)).toBe(360 + w2);
    cleanup();
    const big = nmake({ rows: rowsOf(200) });
    expect(parseFloat(big.lead('r0')!.style.inlineSize)).toBeGreaterThan(w2);
  });

  it('with the selection boxes: the number first, then the box (colindex 1, 2), the columns from 3', () => {
    const t = nmake({ settings: { selection: { mode: 'multi', checkbox: true } } });
    const seg = t.rowEl('r0')!.querySelector('.dzg-seg-start')!;
    expect([...seg.children].slice(0, 2).map((c) => c.className)).toEqual(['dzg-lead', 'dzg-check']);
    expect(seg.children[1]!.getAttribute('aria-colindex')).toBe('2');
    expect(t.cell('r0')!.getAttribute('aria-colindex')).toBe('3');
    expect(t.vp.getAttribute('aria-colcount')).toBe('6');
  });

  it('numbers follow the display order: a sort, the quick search', () => {
    const t = nmake();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    expect(t.shown(2)).toEqual(['r199=1', 'r198=2']);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'Name 19' }, 'api');
    expect(t.shown(3)).toEqual(['r199=1', 'r198=2', 'r197=3']);
  });

  it('in Arabic with the locale\'s digits: Arabic-Indic, as the grid\'s numbers; French texts', () => {
    const t = nmake({ lang: 'ar', messages: join(AR, AR_RANGE, AR_ROW_NUMBERS), settings: { locale: 'ar-EG', numerals: 'locale' } });
    expect(t.lead('r11')!.textContent).toBe('١٢');
    expect(t.corner()!.textContent).toBe('رقم الصف');
    expect(FR_ROW_NUMBERS.text['rownum.header']).toBe('N° de ligne');
  });

  it('never a column: the visible columns, a copy of a row and the columns\' ids unchanged', () => {
    const t = nmake();
    expect(t.ctx.columns.visible().map((c) => c.id)).toEqual(['name', 'n', 's', 'q']);
    t.click(t.lead('r2')!);
    expect(t.api().copy()!.text).toBe('Name 2\t2\ts2\t74\r\n');
  });
});

describe('the click (row-numbers.md 8–10)', () => {
  it('with range(): the whole row, the focus on its first cell; Shift+click the rows between, the focus kept', () => {
    const t = nmake();
    t.click(t.lead('r2')!);
    expect(t.block()).toBe('r2/name:r2/q');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'name' });
    t.click(t.lead('r5')!, { shiftKey: true });
    expect(t.block()).toBe('r2/name:r5/q');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'name' });
    t.click(t.lead('r0')!, { shiftKey: true });
    expect(t.block()).toBe('r2/name:r0/q');
  });

  it('a press on a number starts no drag and is not a row click', () => {
    const t = nmake();
    const p = t.down(t.lead('r1')!, { clientX: 5, clientY: 60 });
    expect(p.defaultPrevented).toBe(true);
    t.click(t.lead('r1')!);
    expect(t.events.some((e) => e.type === 'rowClicked')).toBe(false);
  });

  it('the corner with range(): every cell shown', () => {
    const t = nmake({ rows: rowsOf(10) });
    t.click(t.corner()!);
    expect(t.block()).toBe('r0/name:r9/q');
  });

  it('without range(), with row selection: only, Ctrl toggles, Shift the rows between', () => {
    const t = nmake({ withRange: false, settings: { selection: { mode: 'multi' } } });
    t.click(t.lead('r1')!);
    expect([...t.g.kernel.selection.keys].map(idOf)).toEqual(['r1']);
    t.click(t.lead('r3')!, { shiftKey: true });
    expect([...t.g.kernel.selection.keys].map(idOf).sort()).toEqual(['r1', 'r2', 'r3']);
    t.click(t.lead('r2')!, { ctrlKey: true });
    expect([...t.g.kernel.selection.keys].map(idOf).sort()).toEqual(['r1', 'r3']);
  });

  it('with neither: nothing selected, nothing thrown', () => {
    const t = nmake({ withRange: false });
    t.click(t.lead('r1')!);
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });
});

describe('with other features (row-numbers.md 4, 5)', () => {
  it('pinned rows: their strip cell is there, empty; the body numbered from 1', () => {
    const t = nmake({ messages: join(EN, EN_RANGE, EN_ROW_NUMBERS, EN_PINNED), more: [pinnedRows<R>({ top: [{ id: 'tot', name: 'Total', n: 0, s: '', q: 0 }] })] });
    const band = t.host.querySelector('.dzg-pins-top .dzg-row')!;
    expect(band.querySelector('.dzg-lead')!.textContent).toBe('');
    expect(t.lead('r0')!.textContent).toBe('1');
  });

  it('a tree: closing a node renumbers the rows under it', () => {
    const rows: R[] = [
      { id: 'a', name: 'A', n: 0, s: '', q: 0, parent: null },
      { id: 'a1', name: 'A1', n: 1, s: '', q: 0, parent: 'a' },
      { id: 'a2', name: 'A2', n: 2, s: '', q: 0, parent: 'a' },
      { id: 'b', name: 'B', n: 3, s: '', q: 0, parent: null },
    ];
    const t = nmake({ rows, messages: join(EN, EN_RANGE, EN_ROW_NUMBERS, EN_TREE), more: [tree<R>({ parentId: (x) => x.parent ?? null })] });
    t.g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
    expect(t.lead('b')!.textContent).toBe('4');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('a')], expanded: false }, 'api');
    expect(t.lead('b')!.textContent).toBe('2');
  });

  it('a paged grid: page 2 goes on from page 1', () => {
    const t = nmake({ settings: { pagination: { pageSize: 50 } } });
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(t.lead('r50')!.textContent).toBe('51');
  });
});
