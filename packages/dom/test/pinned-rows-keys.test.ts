// @vitest-environment jsdom
// Phase 6 step 8b-1 (step08b-plan.md §3; pinned-rows.md 8–10; O8): the keys in the real grid — Down and Up through the
// header, the top band, the body and the bottom band, the column kept; Left / Right / Home / End inside a pinned row,
// mirrored in Arabic; pages and Ctrl / Cmd edges into the body; a pinned cell scrolled into view sideways; a click on a
// pinned cell focuses it. The DOM focus follows the kernel's.
import { afterEach, describe, it, expect } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { pm, cleanup, rowsOf, ref, tot, T, B, k, type R } from './support-pinned.js';

afterEach(cleanup);

const at = (p: ReturnType<typeof pm>) => p.g.kernel.focus;
const cellAt = (row: unknown, column: string) => ({ kind: 'cell', row, column });

describe('Down and Up through the bands (pinned-rows.md 8)', () => {
  it('header → top rows → body → … → bottom rows, and back; the column kept; the DOM focus on the cell', () => {
    const p = pm({ top: [ref('a'), ref('b')], bottom: [tot('t'), tot('u')], rows: rowsOf(3) });
    p.g.api.focusCell(k('r0'), 'n');
    p.press('ArrowUp');
    expect(at(p)).toEqual(cellAt(T('b'), 'n'));
    expect(document.activeElement).toBe(p.pcell(T('b'), 'n'));
    p.press('ArrowUp');
    expect(at(p)).toEqual(cellAt(T('a'), 'n'));
    p.press('ArrowUp');
    expect(at(p)).toEqual({ kind: 'header', column: 'n' });
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(T('a'), 'n'));
    p.press('ArrowDown');
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(k('r0'), 'n'));
    p.g.api.focusCell(k('r2'), 'n');
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(B('t'), 'n'));
    expect(document.activeElement).toBe(p.pcell(B('t'), 'n'));
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(B('u'), 'n'));
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(B('u'), 'n'));
    p.press('ArrowUp');
    p.press('ArrowUp');
    expect(at(p)).toEqual(cellAt(k('r2'), 'n'));
  });

  it('no body rows: the top band\'s last row Down goes to the bottom band, its first Up back', () => {
    const p = pm({ top: [ref('a')], bottom: [tot('t')], rows: [] });
    p.g.api.focusCell(T('a'), 'q');
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(B('t'), 'q'));
    p.press('ArrowUp');
    expect(at(p)).toEqual(cellAt(T('a'), 'q'));
  });

  it('under a floating filter row: Up from the first top row goes to that row (the last header row)', async () => {
    const { filters } = await import('../src/filters.js');
    const { EN_FILTERS } = await import('../src/locales/en-filters.js');
    const { EN } = await import('../src/locales/en.js');
    const { EN_PINNED } = await import('../src/locales/en-pinned.js');
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, filter: { kind: 'text' } }, { id: 'n', header: 'N', type: 'number', width: 80 }];
    const p = pm({ top: [ref('a')], columns: cols, more: [filters({ floating: true })], settings: { messages: { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...EN_PINNED.text } } } });
    p.g.api.focusCell(T('a'), 'name');
    p.press('ArrowUp');
    expect(at(p)).toEqual({ kind: 'header', column: 'name', level: 1 });
    // The band sticks under both header rows.
    expect(p.top()!.style.insetBlockStart).toBe('64px');
  });
});

describe('inside a pinned row: Left, Right, Home, End (mirrored in Arabic)', () => {
  it('LTR: Right then End then Home; the row kept', () => {
    const p = pm({ bottom: [tot('t')] });
    p.g.api.focusCell(B('t'), 'name');
    p.press('ArrowRight');
    expect(at(p)).toEqual(cellAt(B('t'), 'n'));
    p.press('End');
    expect(at(p)).toEqual(cellAt(B('t'), 'q'));
    p.press('Home');
    expect(at(p)).toEqual(cellAt(B('t'), 'name'));
    expect(document.activeElement).toBe(p.pcell(B('t'), 'name'));
  });

  it('RTL: ArrowLeft goes toward the end of the row', () => {
    const p = pm({ top: [ref('a')], lang: 'ar' });
    p.g.api.focusCell(T('a'), 'name');
    p.press('ArrowLeft');
    expect(at(p)).toEqual(cellAt(T('a'), 'n'));
    p.press('ArrowRight');
    expect(at(p)).toEqual(cellAt(T('a'), 'name'));
  });

  it('a far column of a pinned row is scrolled to sideways (the row needs no vertical scroll)', () => {
    const cols: ColumnDef<R, any>[] = Array.from({ length: 20 }, (_, i) => ({ id: i ? `c${i}` : 'name', header: `C${i}`, width: 120 }));
    const p = pm({ top: [ref('a')], columns: cols });
    p.g.api.focusCell(T('a'), 'name');
    p.press('End');
    expect(at(p)).toEqual(cellAt(T('a'), 'c19'));
    expect(p.box.scrollInline).toBeGreaterThan(0);
    expect(p.pcell(T('a'), 'c19')).toBe(document.activeElement);
  });
});

describe('pages and edges (pinned-rows.md 9, O8)', () => {
  it('a top row PageDown: a page into the body; a bottom row PageUp: a page up from the body\'s end', () => {
    const p = pm({ top: [ref('a')], bottom: [tot('t')], rows: rowsOf(100), block: 320 });
    // The body's view: 320 − 64 = 256 px, 8 rows; a page is 7.
    p.g.api.focusCell(T('a'), 'n');
    p.press('PageDown');
    expect(at(p)).toEqual(cellAt(k('r6'), 'n'));
    p.g.api.focusCell(B('t'), 'n');
    p.press('PageUp');
    expect(at(p)).toEqual(cellAt(k('r93'), 'n'));
    p.press('PageDown');
    // Then the body's own PageDown: at most its last row.
    expect(at(p)).toEqual(cellAt(k('r99'), 'n'));
  });

  it('Ctrl+Home / Ctrl+End from a pinned row: the first / last body row and column; Ctrl+Down: the last body row, column kept', () => {
    const p = pm({ top: [ref('a')], bottom: [tot('t')], rows: rowsOf(50) });
    p.g.api.focusCell(B('t'), 'n');
    p.press('Home', { ctrlKey: true });
    expect(at(p)).toEqual(cellAt(k('r0'), 'name'));
    p.g.api.focusCell(T('a'), 'n');
    p.press('End', { ctrlKey: true });
    expect(at(p)).toEqual(cellAt(k('r49'), 'q'));
    p.g.api.focusCell(T('a'), 'n');
    p.press('ArrowDown', { ctrlKey: true });
    expect(at(p)).toEqual(cellAt(k('r49'), 'n'));
  });

  it('on a Mac, Cmd+Home and Cmd+ArrowUp', () => {
    const p = pm({ top: [ref('a')], bottom: [tot('t')], rows: rowsOf(50) });
    (p.ctx as { mac: boolean }).mac = true;
    p.g.api.focusCell(B('t'), 'n');
    p.press('Home', { metaKey: true });
    expect(at(p)).toEqual(cellAt(k('r0'), 'name'));
    p.g.api.focusCell(B('t'), 'n');
    p.press('ArrowUp', { metaKey: true });
    expect(at(p)).toEqual(cellAt(k('r0'), 'n'));
  });

  it('the body keeps its own edges: Ctrl+End in the body stops at its last row', () => {
    const p = pm({ top: [ref('a')], bottom: [tot('t')], rows: rowsOf(50) });
    p.g.api.focusCell(k('r3'), 'n');
    p.press('ArrowDown', { ctrlKey: true });
    expect(at(p)).toEqual(cellAt(k('r49'), 'n'));
    p.press('PageDown');
    expect(at(p)).toEqual(cellAt(k('r49'), 'n'));
  });
});

describe('the pointer and the tab stop', () => {
  it('a click (focusin) on a pinned cell focuses it in the kernel', () => {
    const p = pm({ bottom: [tot('t')] });
    p.pcell(B('t'), 'q')!.focus();
    expect(at(p)).toEqual(cellAt(B('t'), 'q'));
  });

  it('the focused pinned cell holds the grid\'s one tab stop', () => {
    const p = pm({ bottom: [tot('t')] });
    p.g.api.focusCell(B('t'), 'q');
    expect(p.host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(p.pcell(B('t'), 'q')!.tabIndex).toBe(0);
  });
});

describe('blocks of cells in the bands: step 8b-2 (until then inert, never across an edge)', () => {
  it('with range(): Shift+arrows on a pinned cell throw nothing and never leave its row (a block there selects nothing yet); the plain keys still cross', async () => {
    const { range } = await import('../src/range.js');
    const { EN_RANGE } = await import('../src/locales/en-range.js');
    const { EN } = await import('../src/locales/en.js');
    const { EN_PINNED } = await import('../src/locales/en-pinned.js');
    const blocks: unknown[] = [];
    const p = pm({ top: [ref('a')], rows: rowsOf(5), more: [range()], settings: { messages: { locale: 'en', text: { ...EN.text, ...EN_RANGE.text, ...EN_PINNED.text } }, onEvent: (e) => void (e.type === 'rangeChanged' && blocks.push(e.range)) } });
    p.g.api.focusCell(T('a'), 'n');
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp']) p.press(key, { shiftKey: true });
    const r = blocks as ({ anchor: { row: string }; focus: { row: string } } | null)[];
    expect(r.every((b) => !b || b.anchor.row === b.focus.row)).toBe(true);
    p.press('ArrowDown');
    expect(at(p)).toEqual(cellAt(k('r0'), p.g.kernel.focus!.column));
  });
});
