import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { SPANS_CSS } from '../src/spans/styles.js';
import { EN } from '../src/locales/en.js';

/**
 * Step 9b, commit 3 fixes (review and test analysis of 4742d93,
 * docs/behaviors/spans.md): the hover of the row under the pointer, the
 * feature's CSS scoped to the grid's rows, the keys starting from the row
 * clicked in a tall cell, a focus asked on a covered place.
 */
type R = { id: string; ward: string; name: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;
const H = 32;

/** `wards`: run lengths of the merged column, in order (A, B, C…). */
function rowsOf(wards: readonly number[]): R[] {
  const out: R[] = [];
  wards.forEach((len, w) => {
    for (let j = 0; j < len; j++) out.push({ id: `r${out.length}`, ward: String.fromCharCode(65 + w), name: `p${out.length}`, n: out.length });
  });
  return out;
}
const COLS: ColumnOrGroup<R>[] = [{ id: 'ward', header: 'Ward', merge: true }, { id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

function make(o: { rows?: R[]; columns?: ColumnOrGroup<R>[]; settings?: Partial<GridSettings<R>>; features?: boolean; host?: HTMLElement; raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  (o.host ?? document.body).append(host);
  const g = createGrid<R>(host, {
    rows: o.rows ?? rowsOf([5, 1, 4, 30, 200]), getRowId: (r) => r.id, columns: o.columns ?? COLS, messages: EN,
    features: o.features === false ? [] : [spans()], ...o.settings,
  }, { geometry, ...(o.raf ? { raf: o.raf } : { sync: true }) });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const row = (i: number) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`);
  const cell = (i: number, col: string) => row(i)?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;
  const press = (key: string, init: KeyboardEventInit = {}) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  const scrollTo = (top: number) => {
    box.scrollTop = top;
    vp.dispatchEvent(new Event('scroll'));
  };
  /** A tall cell's box (its top at 100), then a pointer event `rowsDown` rows into it. */
  const at = (el: HTMLElement, type: string, rowsDown: number, init: MouseEventInit = {}) => {
    el.getBoundingClientRect = () => ({ top: 100, bottom: 100 + 40 * H, left: 0, right: 150, width: 150, height: 40 * H, x: 0, y: 100, toJSON() {} }) as DOMRect;
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 100 + rowsDown * H + 5, ...init }));
  };
  const hovered = () => [...host.querySelectorAll('.dzg-row[data-hover]')].map((r) => Number(r.getAttribute('aria-rowindex')) - 2);
  return { g, host, vp, box, ctx, row, cell, press, scrollTo, at, hovered };
}
const focusOf = (g: GridInstance<R>) => {
  const f = g.kernel.focus;
  return f?.kind === 'cell' ? [f.row, f.column] : f;
};

describe('hover: the row under the pointer, not the row a tall cell lives in', () => {
  it('over a covered place of a tall cell, that row is hovered; the origin row is not', () => {
    const { cell, at, hovered } = make();
    at(cell(0, 'ward')!, 'pointerover', 3);
    expect(hovered()).toEqual([3]);
    // Moving inside the cell (no new target): the row follows the pointer.
    at(cell(0, 'ward')!, 'pointermove', 1);
    expect(hovered()).toEqual([1]);
    at(cell(0, 'ward')!, 'pointermove', 0);
    expect(hovered()).toEqual([0]);
  });

  it('over a plain cell, its own row; one row at a time; none once the pointer leaves the body', () => {
    const { ctx, cell, at, hovered } = make();
    at(cell(0, 'ward')!, 'pointerover', 4);
    cell(7, 'name')!.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(hovered()).toEqual([7]);
    cell(5, 'n')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    expect(hovered()).toEqual([5]);
    ctx.el.body.dispatchEvent(new MouseEvent('pointerleave'));
    expect(hovered()).toEqual([]);
  });

  it('a hovered row element reused for another row loses the mark', () => {
    const { cell, at, hovered, scrollTo, host } = make();
    at(cell(0, 'ward')!, 'pointerover', 2);
    const el = host.querySelector('.dzg-row[data-hover]')!;
    scrollTo(150 * H);
    // The element shows another row now (or none): the pointer has not been over that one.
    expect(el.getAttribute('aria-rowindex')).not.toBe('4');
    expect(hovered()).toEqual([]);
    // Back: still nothing until the pointer moves.
    scrollTo(0);
    expect(hovered()).toEqual([]);
  });

  it('a plain grid sets no mark (the theme’s :hover does it)', () => {
    const { cell, at, hovered } = make({ features: false });
    at(cell(0, 'ward')!, 'pointerover', 3);
    at(cell(0, 'ward')!, 'pointermove', 3);
    expect(hovered()).toEqual([]);
  });

  it('the theme: :hover only for rows no tall cell meets, data-hover for the others, both before the selection', () => {
    const css = readFileSync(resolve('packages/theme/dzgrid.css'), 'utf8');
    const rule = (bg: string) => {
      const i = css.indexOf(`background: var(${bg}`);
      const open = css.lastIndexOf('}', i);
      return { at: i, selectors: css.slice(open + 1, css.lastIndexOf('{', i)).split(',').map((s) => s.trim()) };
    };
    const hover = rule('--dzg-row-hover-bg');
    const selected = rule('--dzg-row-selected-bg');
    expect(hover.selectors).toEqual([
      '.dzg-row:hover:where(:not([data-spans]))',
      '.dzg-row:hover:where(:not([data-spans])) .dzg-seg-start',
      '.dzg-row:hover:where(:not([data-spans])) .dzg-seg-end',
      '.dzg-row[data-hover]',
      '.dzg-row[data-hover] .dzg-seg-start',
      '.dzg-row[data-hover] .dzg-seg-end',
    ]);
    // Same weight as the selection's rule, and before it: a selected row stays selected under the pointer.
    expect(hover.at).toBeLessThan(selected.at);
    const host = document.createElement('div');
    host.innerHTML = '<div class="dzg-row" data-spans><div class="dzg-seg dzg-seg-start"></div></div><div class="dzg-row"></div>';
    const [spanRow, plain] = host.children as unknown as HTMLElement[];
    expect(spanRow!.matches(':not([data-spans])')).toBe(false);
    expect(plain!.matches(':not([data-spans])')).toBe(true);
  });
});

describe('the feature’s CSS applies to the grid’s rows only', () => {
  /** The selector lists of SPANS_CSS, out of their `:where()`. */
  const rules = SPANS_CSS.split('}').filter(Boolean).map((r) => r.slice(0, r.indexOf('{')).replace(/^:where\((.*)\)(::before)?$/, '$1'));

  it('a host ancestor carrying data-full or data-spans changes none of the grid’s elements', () => {
    const outer = document.createElement('div');
    outer.setAttribute('data-full', '');
    outer.setAttribute('data-spans', '');
    document.body.append(outer);
    const { host } = make({ host: outer, rows: rowsOf([1, 1, 1, 1]), settings: { selection: { mode: 'multi', checkbox: true } } });
    const els = [outer, host, ...host.querySelectorAll('*')];
    const hit = rules.filter((sel) => !sel.startsWith('.dzg-body') && !sel.startsWith('.dzg-cell[aria-rowspan]') && !sel.startsWith('.dzg-span-label'))
      .flatMap((sel) => els.filter((e) => e.matches(sel)).map((e) => `${sel} → ${e.className || e.tagName}`));
    expect(hit).toEqual([]);
  });

  it('a full-width row’s cell and box, a spanning row’s pinned cells, still match', () => {
    const { host } = make({
      rows: [{ id: 't', ward: 'T', name: '', n: 0 }, ...rowsOf([3, 1])],
      columns: [{ id: 'ward', merge: true, pinned: 'start' }, { id: 'name', pinned: 'start' }, { id: 'n' }],
      settings: { fullWidth: (r) => r.id === 't', selection: { mode: 'multi', checkbox: true } },
    });
    const full = host.querySelector('.dzg-row[data-full]')!;
    const match = (e: Element | null) => rules.filter((sel) => e?.matches(sel));
    expect(match(full.querySelector('.dzg-cell'))).toEqual(['.dzg-row[data-full]>.dzg-seg>.dzg-cell']);
    expect(match(full.querySelector('.dzg-check'))).toEqual(['.dzg-row[data-full]>.dzg-seg>.dzg-check']);
    expect(match(full.querySelector('.dzg-seg'))).toEqual(['.dzg-row[data-full]>.dzg-seg']);
    const spanning = host.querySelector('.dzg-row[data-spans]:not([data-full])')!;
    expect(match(spanning)).toEqual(['.dzg-row[data-spans]']);
    expect(match(spanning.querySelector('.dzg-seg-start>[data-col="name"]'))).toEqual(['.dzg-row[data-spans]>.dzg-seg-start>.dzg-cell,.dzg-row[data-spans]>.dzg-seg-end>.dzg-cell']);
  });
});

describe('the keys start from the row clicked in a tall cell', () => {
  it('Right after a click on the fourth row of a tall cell goes to that row’s next cell', () => {
    const { g, cell, at, press } = make();
    cell(0, 'ward')!.focus();
    at(cell(0, 'ward')!, 'click', 3);
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r3'), 'name']);
  });

  it('Left, from a tall cell in the middle', () => {
    const { g, cell, at, press } = make({ columns: [{ id: 'name' }, { id: 'ward', merge: true }, { id: 'n' }] });
    cell(0, 'ward')!.focus();
    at(cell(0, 'ward')!, 'click', 2);
    press('ArrowLeft');
    expect(focusOf(g)).toEqual([k('r2'), 'name']);
  });

  it('a click wins over the row the keys aimed at before', () => {
    const { g, cell, at, press } = make();
    cell(2, 'name')!.focus();
    press('ArrowLeft');
    expect(focusOf(g)).toEqual([k('r0'), 'ward']);
    // The keys aim at row 2; the user clicks row 4 of the same cell.
    at(cell(0, 'ward')!, 'click', 4);
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r4'), 'name']);
  });

  it('PageDown inside a long merge pages from the row clicked, and shows the row it reaches', () => {
    // Run D is rows 10 to 39; a page is 9 rows (320 px view).
    // Scrolled to row 8: the cell is drawn over rows 10 to 17 (the pointer maps within what is drawn).
    const { g, cell, at, press, box, scrollTo } = make();
    scrollTo(8 * H);
    cell(10, 'ward')!.focus();
    at(cell(10, 'ward')!, 'click', 3);
    press('PageDown');
    expect(focusOf(g)).toEqual([k('r10'), 'ward']);
    // Row 22 (13 + 9) brought into view: its bottom at the view's bottom.
    expect(box.scrollTop).toBe(23 * H - 320);
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r22'), 'name']);
  });

  it('a click on the cell’s first row, then the keys: as from the cell (row 0)', () => {
    const { g, cell, at, press } = make();
    cell(3, 'name')!.focus();
    press('ArrowLeft');
    at(cell(0, 'ward')!, 'click', 0);
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r0'), 'name']);
  });

  it('a click on a tall cell that is not the focused one aims nothing (a host kept the focus elsewhere)', () => {
    const { g, cell, at, press } = make();
    cell(6, 'name')!.focus();
    // The click reaches the tall cell without focusing it (a host prevented the mousedown).
    at(cell(0, 'ward')!, 'click', 3);
    cell(0, 'ward')!.focus();
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r0'), 'name']);
  });

  it('a click elsewhere then a focus back by the keys forgets the click', () => {
    const { g, cell, at, press } = make();
    cell(0, 'ward')!.focus();
    at(cell(0, 'ward')!, 'click', 3);
    cell(1, 'name')!.focus();
    cell(1, 'name')!.click();
    press('ArrowLeft');
    expect(focusOf(g)).toEqual([k('r0'), 'ward']);
    press('ArrowRight');
    expect(focusOf(g)).toEqual([k('r1'), 'name']);
  });
});

describe('a focus asked on a covered place goes to the cell owning it', () => {
  it('api.focusCell far from the owning cell: the owner is focused, the view shows the place asked for', () => {
    const { g, ctx, scrollTo, box } = make();
    scrollTo(150 * H);
    g.api.focusCell(k('r30'), 'ward');
    expect(focusOf(g)).toEqual([k('r10'), 'ward']);
    // The view shows row 30 (scrolled up to it: at the top), part of the tall cell; the owner is mounted there and focused.
    expect(box.scrollTop).toBe(30 * H);
    expect(document.activeElement).toBe(ctx.rowRenderer.cell(k('r10'), 'ward'));
    expect(ctx.pendingFocus).toBeNull();
  });

  it('nothing waits for a cell that never mounts: a later focus is not taken back', () => {
    const { g, cell, scrollTo, ctx } = make();
    g.api.focusCell(k('r3'), 'ward');
    expect(ctx.pendingFocus).toBeNull();
    cell(6, 'name')!.focus();
    scrollTo(20 * H);
    scrollTo(0);
    expect(focusOf(g)).toEqual([k('r6'), 'name']);
    expect(document.activeElement).toBe(cell(6, 'name'));
  });

  it('with frames: the focus waits for the next paint, for the owner (the place asked has no element)', () => {
    const frames: (() => void)[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => { frames.push(() => f(0)); return frames.length; }, cancelAnimationFrame: () => {} };
    const flush = () => { while (frames.length) frames.shift()!(); };
    const { g, ctx } = make({ raf });
    flush();
    g.api.focusCell(k('r3'), 'ward');
    expect(ctx.pendingFocus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    flush();
    expect(document.activeElement).toBe(ctx.rowRenderer.cell(k('r0'), 'ward'));
    expect(ctx.pendingFocus).toBeNull();
  });

  it('a plain place is focused as asked', () => {
    const { g, cell } = make();
    g.api.focusCell(k('r3'), 'name');
    expect(focusOf(g)).toEqual([k('r3'), 'name']);
    expect(document.activeElement).toBe(cell(3, 'name'));
  });
});
