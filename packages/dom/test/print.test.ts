// Phase 6 step 11 (docs/phase-6-steps/step11-plan.md §6; docs/behaviors/print.md 1–9; owner Q-I, O9): `preparePrint` /
// `print` of `@dzgrid/dom/print` — a print-only table beside the grid (a child of <body>), the shown rows in order, the shown
// columns in reading order, the cells' screen text, the cap and its problem, the chunks, the cancel, the cleanup; the screen
// grid untouched. Expectations written by hand from the sheet.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ColumnDef, ColumnOrGroup, GridEvent, Problem, ResolvedColumn, RowKey } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { preparePrint, print, PRINT_KEYS } from '../src/print.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { FR_PRINT } from '../src/locales/fr-print.js';
import { AR_PRINT } from '../src/locales/ar-print.js';
import { spans } from '../src/spans.js';
import { groups } from '../src/groups.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { tree } from '../src/tree.js';
import { detail } from '../src/detail.js';
import { pinnedRows } from '../src/pinned-rows.js';
import { definePart } from '../src/part.js';
import type { GridFeature } from '../src/features.js';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridMessages } from '../src/messages.js';
import type { GridContext } from '../src/context.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { cleanup, emake, join, k, rowsOf, COLUMNS, type R } from './support-edit.js';

const ROOT = `${process.cwd()}/`;
afterEach(cleanup);

const MSG = join(EN, EN_PRINT);
const box = () => document.querySelectorAll<HTMLElement>('body > .dzg-print');
const table = () => document.querySelector<HTMLTableElement>('body > .dzg-print table')!;
/** The body rows' texts, cell by cell. */
const body = () => [...table().tBodies[0]!.rows].map((r) => [...r.cells].map((c) => c.textContent));
const heads = () => [...table().tHead!.rows].map((r) => [...r.cells].map((c) => c.textContent));
const problemsOf = (events: readonly GridEvent<R>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

describe('1. the table: caption, header cells, groups, direction and language (print.md 3, 5)', () => {
  it('caption: the title first, else the grid\'s aria-label, else the text of its aria-labelledby, else none', async () => {
    const m = emake({ rows: rowsOf(3), settings: { messages: MSG, label: 'Patients du jour' } });
    let done = await preparePrint(m.g, { title: 'Liste imprimée' });
    expect(table().caption!.textContent).toBe('Liste imprimée');
    done!();
    done = await preparePrint(m.g);
    expect(table().caption!.textContent).toBe('Patients du jour');
    done!();
    const named = document.body.appendChild(Object.assign(document.createElement('h2'), { id: 'named', textContent: 'Admissions' }));
    m.vp.removeAttribute('aria-label');
    m.vp.setAttribute('aria-labelledby', 'named');
    done = await preparePrint(m.g);
    expect(table().caption!.textContent).toBe('Admissions');
    done!();
    named.remove();
    m.vp.removeAttribute('aria-labelledby');
    done = await preparePrint(m.g);
    expect(table().caption).toBeNull();
    done!();
  });

  it('a real table: thead with th scope="col" (the headers), tbody with td; no tfoot', async () => {
    const m = emake({ rows: rowsOf(2), settings: { messages: MSG } });
    await preparePrint(m.g);
    const t = table();
    expect(t.tHead!.rows).toHaveLength(1);
    expect([...t.tHead!.rows[0]!.cells].map((c) => [c.tagName, c.getAttribute('scope'), c.textContent])).toEqual([['TH', 'col', 'Name'], ['TH', 'col', 'N'], ['TH', 'col', 'S'], ['TH', 'col', 'Q']]);
    expect(t.tFoot).toBeNull();
    expect([...t.tBodies[0]!.rows[0]!.cells].every((c) => c.tagName === 'TD')).toBe(true);
  });

  it('header groups: rows of th scope="colgroup" with their colspan above the column headers, one <colgroup> per top group', async () => {
    const leaf = (id: string): ColumnDef<R, any> => ({ id, header: id.toUpperCase(), width: 80 });
    const columns: ColumnOrGroup<R>[] = [
      { id: 'who', header: 'Who', children: [leaf('name'), { id: 'nums', header: 'Numbers', children: [leaf('n'), leaf('q')] }] },
      leaf('s'),
    ];
    const m = emake({ rows: rowsOf(2), columns: columns as never, settings: { messages: MSG, features: [spans()] } });
    await preparePrint(m.g);
    const rows = [...table().tHead!.rows];
    expect(rows).toHaveLength(3);
    const cell = (r: number) => [...rows[r]!.cells].map((c) => `${c.tagName}:${c.getAttribute('scope') ?? '-'}:${c.colSpan}:${c.textContent}`);
    expect(cell(0)).toEqual(['TH:colgroup:3:Who', 'TD:-:1:']);
    expect(cell(1)).toEqual(['TD:-:1:', 'TH:colgroup:2:Numbers', 'TD:-:1:']);
    expect(cell(2)).toEqual(['TH:col:1:NAME', 'TH:col:1:N', 'TH:col:1:Q', 'TH:col:1:S']);
    expect([...table().querySelectorAll('colgroup')].map((c) => c.span)).toEqual([3, 1]);
  });

  it('dir and lang copied from the grid: rtl and ar for an Arabic grid in an Arabic page', async () => {
    document.documentElement.lang = 'ar';
    try {
      const m = emake({ rows: rowsOf(2), settings: { messages: join(AR, AR_PRINT), direction: 'rtl', locale: 'ar' } });
      await preparePrint(m.g);
      expect(table().getAttribute('dir')).toBe('rtl');
      expect(table().getAttribute('lang')).toBe('ar');
    } finally {
      document.documentElement.removeAttribute('lang');
    }
  });
});

describe('2. rows: the shown rows in order; pinned rows; no detail, loading or filler; spans (print.md 2, 3)', () => {
  it('after a sort, a filter and the quick search: the displayed rows, in their order', async () => {
    const m = emake({ rows: rowsOf(30), settings: { messages: MSG } });
    m.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    m.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 20 } }, 'user');
    m.g.kernel.dispatch({ type: 'quick.set', text: 's3' }, 'user');
    await preparePrint(m.g);
    // Column S is `s${i % 7}`: s3 for 3, 10, 17 under 20; descending.
    expect(body().map((r) => r[0])).toEqual(['Name 17', 'Name 10', 'Name 3']);
  });

  it('a tree: the shown rows only (an open parent\'s children, a closed one\'s not), the level as em spaces before the tree column\'s text', async () => {
    type N = R & { parent: string | null };
    const rows: N[] = [
      { id: 'a', name: 'A', n: 1, s: '', q: 0, parent: null },
      { id: 'a1', name: 'A1', n: 2, s: '', q: 0, parent: 'a' },
      { id: 'a1x', name: 'A1x', n: 3, s: '', q: 0, parent: 'a1' },
      { id: 'b', name: 'B', n: 4, s: '', q: 0, parent: null },
      { id: 'b1', name: 'B1', n: 5, s: '', q: 0, parent: 'b' },
    ];
    const m = emake({ rows, settings: { messages: join(EN, EN_TREE, EN_PRINT), features: [tree<N>({ parentId: (r) => r.parent }) as GridFeature] } as never });
    m.g.kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('a1')], expanded: true }, 'user');
    await preparePrint(m.g);
    expect(body().map((r) => r.slice(0, 2))).toEqual([['A', '1'], [' A1', '2'], ['  A1x', '3'], ['B', '4']]);
  });

  it('a path tree\'s filler rows (a label, never data) are left out', async () => {
    type P = R & { path: string[] };
    const rows: P[] = [{ id: 'x', name: 'X', n: 1, s: '', q: 0, path: ['Ward', 'X'] }, { id: 'y', name: 'Y', n: 2, s: '', q: 0, path: ['Ward', 'Y'] }];
    const m = emake({ rows, settings: { messages: join(EN, EN_TREE, EN_PRINT), features: [tree<P>({ path: (r) => r.path, initial: 'all' }) as GridFeature] } as never });
    expect(m.g.kernel.rows.displayed.nodeAt(0 as never).kind).toBe('group');
    await preparePrint(m.g);
    expect(body().map((r) => r[1])).toEqual(['1', '2']);
  });

  it('top pinned rows first in tbody, bottom pinned last; printed once (only thead repeats); no tfoot', async () => {
    const pins = pinnedRows<R>({ top: [{ id: 'ref', name: 'Reference', n: 10, s: '', q: 0 }], bottom: [{ id: 'tot', name: 'Total', n: 99, s: '', q: 0 }] });
    const m = emake({ rows: rowsOf(3), settings: { messages: join(EN, EN_PINNED, EN_PRINT), features: [pins as GridFeature] } });
    await preparePrint(m.g);
    expect(body().map((r) => r[0])).toEqual(['Reference', 'Name 0', 'Name 1', 'Name 2', 'Total']);
    expect(table().tFoot).toBeNull();
    expect(table().tBodies).toHaveLength(1);
  });

  it('an open detail panel is not printed (O9)', async () => {
    const part = definePart('detail', { mount: (h) => (h.append('panel'), {}) });
    const m = emake({ rows: rowsOf(3), settings: { messages: join(EN, EN_DETAIL, EN_PRINT), features: [detail<R>({ part })] } });
    m.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'user');
    expect(m.g.kernel.rows.displayed.count).toBe(4);
    await preparePrint(m.g);
    expect(body().map((r) => r[0])).toEqual(['Name 0', 'Name 1', 'Name 2']);
    expect(table().textContent).not.toContain('panel');
  });

  it('merged cells: the value written on every row they cover (O9); a full-width row as one cell spanning every column', async () => {
    const rows: R[] = [
      { id: 'a', name: 'Ward A', n: 1, s: 'x', q: 0 },
      { id: 'b', name: 'Ward A', n: 2, s: 'y', q: 0 },
      { id: 'c', name: 'Note for the day', n: 3, s: 'z', q: 0 },
    ];
    const columns: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', merge: true }, { id: 'n', header: 'N', type: 'number' }, { id: 's', header: 'S' }];
    const m = emake({ rows, columns, settings: { messages: MSG, features: [spans()], fullWidth: (r: R) => r.id === 'c' } });
    await preparePrint(m.g);
    expect(body()).toEqual([['Ward A', '1', 'x'], ['Ward A', '2', 'y'], ['Note for the day']]);
    expect(table().tBodies[0]!.rows[2]!.cells[0]!.colSpan).toBe(3);
  });
});

describe('3. columns: start-pinned, centre, end-pinned; hidden and group-closed left out (print.md 3)', () => {
  for (const dir of ['ltr', 'rtl'] as const) {
    it(`the reading order, ${dir}`, async () => {
      const columns: ColumnDef<R, any>[] = [
        { id: 'name', header: 'Name' }, { id: 'n', header: 'N', pinned: 'end' }, { id: 's', header: 'S' }, { id: 'q', header: 'Q', pinned: 'start' },
        { id: 'h', header: 'Hidden', hidden: true, value: () => 'secret' },
      ];
      const m = emake({ rows: rowsOf(1), columns, settings: { messages: MSG, direction: dir } });
      await preparePrint(m.g);
      expect(heads()).toEqual([['Q', 'Name', 'S', 'N']]);
      expect(table().getAttribute('dir')).toBe(dir);
      expect(table().textContent).not.toContain('secret');
    });
  }

  it('a closed group\'s folded columns are left out', async () => {
    const columns: ColumnOrGroup<R>[] = [
      { id: 'g', header: 'G', collapsible: true, open: false, children: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', groupShow: 'open' }] },
      { id: 's', header: 'S' },
    ];
    const m = emake({ rows: rowsOf(1), columns: columns as never, settings: { messages: join(EN, EN_COLUMNS, EN_PRINT), features: [spans(), groups()] } });
    await preparePrint(m.g);
    expect(heads().at(-1)).toEqual(['Name', 'S']);
  });
});

describe('4. cells: the screen\'s text (print.md 4)', () => {
  it('the column\'s formatter in the grid\'s language: numbers and days as on screen', async () => {
    type D = R & { day: string };
    const columns: ColumnDef<D, any>[] = [{ id: 'n', header: 'N', type: 'number' }, { id: 'day', header: 'Day', type: 'day' }];
    const m = emake({ rows: [{ id: 'a', name: '', n: 1234.5, s: '', q: 0, day: '2026-03-01' }] as never, columns: columns as never, settings: { messages: join(FR, FR_PRINT), locale: 'fr-FR' } });
    await preparePrint(m.g);
    const shown = [...m.host.querySelectorAll('.dzg-layer .dzg-cell')].map((c) => c.textContent);
    expect(body()[0]).toEqual(shown);
    expect(body()[0]![0]).toBe('1 234,5');
  });

  it('a column drawn by a part prints the text the grid gives the part; a part column without a value prints empty', async () => {
    const tag = definePart('cell', { mount: (h, c) => (h.append(`[${c.text}]`), {}) });
    const columns: ColumnDef<R, any>[] = [{ id: 's', header: 'S', ui: { cell: 'tag' } }, { id: 'act', header: 'Actions', value: () => undefined, ui: { cell: 'tag' } }];
    const m = emake({ rows: rowsOf(1), columns, settings: { messages: MSG, parts: { tag } } });
    await preparePrint(m.g);
    expect(body()).toEqual([['s0', '']]);
  });

  it('an edit shown on screen (pending or saved) prints as shown: the edit seam\'s value', async () => {
    const seam: GridFeature = { id: 'seam', setup: () => ({ edit: { read: (col: ResolvedColumn<unknown>, row: unknown) => ((row as R).id === 'r1' && col.id === 'name' ? 'Edited' : col.read(row as never)) }, destroy() {} }) };
    const m = emake({ rows: rowsOf(2), settings: { messages: MSG, features: [seam] } });
    await preparePrint(m.g);
    expect(body().map((r) => r[0])).toEqual(['Name 0', 'Edited']);
  });

  it('a cell whose text looks like HTML stays text: no element made from it', async () => {
    const m = emake({ rows: [{ id: 'x', name: '<img src=x onerror="window.__pwned=1">', n: 1, s: '<b>b</b>', q: 0 }], settings: { messages: MSG } });
    await preparePrint(m.g);
    expect(table().querySelector('img, b')).toBeNull();
    expect(body()[0]![0]).toBe('<img src=x onerror="window.__pwned=1">');
  });
});

describe('5. the cap: maxRows, the note, one print-too-many with counts only (print.md 6)', () => {
  it('5 001 rows: the first 5 000, the note above the table, exactly one problem without any row value', async () => {
    const m = emake({ rows: rowsOf(5001), settings: { messages: MSG } });
    await preparePrint(m.g);
    expect(table().tBodies[0]!.rows).toHaveLength(5000);
    expect(body().at(-1)![0]).toBe('Name 4999');
    const note = box()[0]!.querySelector('.dzg-print-note')!;
    expect(note.textContent).toBe('First 5,000 rows of 5,001');
    expect(note.nextElementSibling).toBe(table());
    const p = problemsOf(m.events).filter((x) => x.code === 'print-too-many');
    expect(p).toHaveLength(1);
    expect(p[0]!.detail).toBe('{"total":5001,"max":5000}');
    expect(JSON.stringify(problemsOf(m.events))).not.toMatch(/Name|s\d/);
  });

  for (const maxRows of [0, -1]) {
    it(`maxRows ${maxRows}: not a cap, the default 5 000 (a mutant survivor)`, async () => {
      const m = emake({ rows: rowsOf(5001), settings: { messages: MSG } });
      await preparePrint(m.g, { maxRows });
      expect(table().tBodies[0]!.rows).toHaveLength(5000);
      expect(problemsOf(m.events).filter((x) => x.code === 'print-too-many').map((x) => x.detail)).toEqual(['{"total":5001,"max":5000}']);
    }, 30_000);
  }

  it('print-too-many once per call: two calls, two problems (not told once per grid like missing-message)', async () => {
    const m = emake({ rows: rowsOf(10), settings: { messages: MSG } });
    (await preparePrint(m.g, { maxRows: 3 }))!();
    (await preparePrint(m.g, { maxRows: 3 }))!();
    expect(problemsOf(m.events).filter((x) => x.code === 'print-too-many').map((x) => x.detail)).toEqual(['{"total":10,"max":3}', '{"total":10,"max":3}']);
  });

  it('maxRows given: 3 of 10, in French; no note and no problem when all fit', async () => {
    const m = emake({ rows: rowsOf(10), settings: { messages: join(FR, FR_PRINT), locale: 'fr-FR' } });
    let done = await preparePrint(m.g, { maxRows: 3 });
    expect(body()).toHaveLength(3);
    expect(box()[0]!.querySelector('.dzg-print-note')!.textContent).toBe('3 premières lignes sur 10');
    done!();
    m.events.length = 0;
    done = await preparePrint(m.g, { maxRows: 10 });
    expect(body()).toHaveLength(10);
    expect(box()[0]!.querySelector('.dzg-print-note')).toBeNull();
    expect(problemsOf(m.events)).toEqual([]);
  });
});

describe('6. chunks: time-sliced, cancelled by a second call (print.md 7)', () => {
  it('a fake clock at 1 ms a row: the first slice stops near 8 ms (≤ 9 rows), then yields; all rows at the end', async () => {
    const m = emake({ rows: rowsOf(100), settings: { messages: MSG } });
    let t = 0;
    vi.spyOn(window.performance, 'now').mockImplementation(() => (t += 1));
    const p = preparePrint(m.g);
    const first = table().tBodies[0]!.rows.length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(9);
    await p;
    expect(body()).toHaveLength(100);
  });

  it('5 000 rows × 20 columns complete', async () => {
    const columns: ColumnDef<R, any>[] = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, value: (r: R) => `${r.name}/${i}` }));
    const m = emake({ rows: rowsOf(5000), columns, settings: { messages: MSG } });
    await preparePrint(m.g);
    expect(table().tBodies[0]!.rows).toHaveLength(5000);
    expect(table().tBodies[0]!.rows[4999]!.cells).toHaveLength(20);
  }, 30_000);

  it('a second call while the first builds cancels it: the first resolves with null, its partial table gone, one container', async () => {
    const m = emake({ rows: rowsOf(200), settings: { messages: MSG } });
    let t = 0;
    vi.spyOn(window.performance, 'now').mockImplementation(() => (t += 1));
    const a = preparePrint(m.g, { title: 'first' });
    const b = preparePrint(m.g, { title: 'second' });
    expect(box()).toHaveLength(1);
    const undoA = await a;
    const undoB = await b;
    expect(box()).toHaveLength(1);
    expect(table().caption!.textContent).toBe('second');
    expect(body()).toHaveLength(200);
    expect(undoA).toBeNull();
    expect(box()).toHaveLength(1);
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(true);
    undoB!();
    expect(box()).toHaveLength(0);
  });
});

describe('7. cleanup (print.md 1, 7)', () => {
  it('idempotent; the root marker set while prepared and removed; the document as before', async () => {
    const m = emake({ rows: rowsOf(20), settings: { messages: MSG } });
    const before = document.documentElement.outerHTML;
    const done = await preparePrint(m.g);
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(true);
    expect(box()).toHaveLength(1);
    expect(box()[0]!.parentElement).toBe(document.body);
    done!();
    done!();
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(false);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('the grid destroyed during the build cancels it: nothing left, the build\'s promise resolves with null', async () => {
    const m = emake({ rows: rowsOf(300), settings: { messages: MSG } });
    let t = 0;
    vi.spyOn(window.performance, 'now').mockImplementation(() => (t += 1));
    const p = preparePrint(m.g);
    expect(box()).toHaveLength(1);
    m.g.destroy();
    expect(await p).toBeNull();
    expect(box()).toHaveLength(0);
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(false);
  });

  it('print(): prepares, calls window.print(), cleans up on afterprint', async () => {
    const m = emake({ rows: rowsOf(5), settings: { messages: MSG } });
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(box()).toHaveLength(1);
      expect(document.documentElement.classList.contains('dzg-printing')).toBe(true);
    });
    await print(m.g, { title: 'T' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(box()).toHaveLength(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(false);
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
  });

  it('two print() calls in a row: one dialog, the newer table\'s; a cleanup removes its own table only (review finding 1)', async () => {
    const m = emake({ rows: rowsOf(5), settings: { messages: MSG } });
    const captions: string[] = [];
    const spy = vi.spyOn(window, 'print').mockImplementation(() => void captions.push(...[...box()].map((b) => b.querySelector('caption')!.textContent!)));
    await Promise.all([print(m.g, { title: 'A' }), print(m.g, { title: 'B' })]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(captions).toEqual(['B']);
    expect(box()).toHaveLength(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
    expect(document.documentElement.classList.contains('dzg-printing')).toBe(false);
  });

  it('two print() calls while the first builds: the first resolves null and opens no dialog; the second prints (review finding 1)', async () => {
    const m = emake({ rows: rowsOf(200), settings: { messages: MSG } });
    let t = 0;
    vi.spyOn(window.performance, 'now').mockImplementation(() => (t += 1));
    const spy = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(box()).toHaveLength(1);
      expect(table().caption!.textContent).toBe('B');
      expect(body()).toHaveLength(200);
    });
    await Promise.all([print(m.g, { title: 'A' }), print(m.g, { title: 'B' })]);
    expect(spy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(box()).toHaveLength(0);
  });

  for (const type of ['focus', 'pointerdown']) {
    it(`no afterprint (Safari's PDF path): the first ${type} after the dialog cleans up, once (review finding 5)`, async () => {
      const m = emake({ rows: rowsOf(5), settings: { messages: MSG } });
      vi.spyOn(window, 'print').mockImplementation(() => {});
      await print(m.g);
      expect(box()).toHaveLength(1);
      window.dispatchEvent(new Event(type));
      expect(box()).toHaveLength(0);
      expect(document.documentElement.classList.contains('dzg-printing')).toBe(false);
      // The other triggers later: nothing more to do (idempotent), nothing thrown.
      for (const e of ['afterprint', 'focus', 'pointerdown']) window.dispatchEvent(new Event(e));
      expect(box()).toHaveLength(0);
    });
  }
});

describe('8. a server grid: the page shown only, its place in the caption, no request (print.md 2)', () => {
  it('page 2 of 3: its two rows, « Page 2 of 3 » in the caption, no fetch', async () => {
    const calls: { ok(v: unknown): void }[] = [];
    const source: DataSource<R> = { fetch: () => ({ then(ok: (v: never) => void) { calls.push({ ok: ok as never }); } }) as never };
    const geometry: Geometry = { read: (): ViewportBox => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} };
    const host = document.body.appendChild(document.createElement('div'));
    const g = createGrid<R>(host, { source: sourceRows(source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns: COLUMNS, messages: MSG, label: 'Lab' } as never, { geometry, sync: true }) as GridInstance<R, any>;
    try {
      calls.at(-1)!.ok({ rows: rowsOf(2), total: 6 });
      g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
      calls.at(-1)!.ok({ rows: rowsOf(4).slice(2), total: 6 });
      const n = calls.length;
      await preparePrint(g);
      expect(body().map((r) => r[0])).toEqual(['Name 2', 'Name 3']);
      expect(table().caption!.textContent).toBe('Lab — Page 2 of 3');
      expect(calls).toHaveLength(n);
    } finally {
      g.destroy();
    }
  });
});

describe('9. the screen grid untouched; the container hidden on screen (print.md 8, 9)', () => {
  it('no scroll, no focus move, no kernel event, no paint', async () => {
    const m = emake({ rows: rowsOf(50), settings: { messages: MSG } });
    m.scroll(320);
    m.g.api.focusCell(k('r12'), 'n');
    const seen: string[] = [];
    m.g.kernel.subscribe((e) => void seen.push(e.type));
    const before = { top: m.box.scrollTop, inline: m.box.scrollInline, focus: document.activeElement, paints: (m.g as unknown as { paints: number }).paints, html: m.host.innerHTML };
    const done = await preparePrint(m.g);
    done!();
    expect({ top: m.box.scrollTop, inline: m.box.scrollInline, focus: document.activeElement, paints: (m.g as unknown as { paints: number }).paints, html: m.host.innerHTML }).toEqual(before);
    expect(seen).toEqual([]);
  });

  it('the container: display none on screen, aria-hidden, a child of <body> beside the grid', async () => {
    const m = emake({ rows: rowsOf(2), settings: { messages: MSG } });
    await preparePrint(m.g);
    const c = box()[0]!;
    expect(c.style.display).toBe('none');
    expect(c.getAttribute('aria-hidden')).toBe('true');
    expect(m.host.contains(c)).toBe(false);
  });
});

describe('10. no row data kept; the texts (print.md 4, « Texts »)', () => {
  it('the table holds text only: no property set on its elements, no attribute but the table\'s own', async () => {
    const m = emake({ rows: rowsOf(5), settings: { messages: MSG } });
    await preparePrint(m.g);
    const els = [...box()[0]!.querySelectorAll('*')];
    expect(els.flatMap((e) => Object.keys(e))).toEqual([]);
    const attrs = new Set(els.flatMap((e) => [...e.attributes].map((a) => a.name)));
    expect([...attrs].every((a) => ['dir', 'lang', 'scope', 'colspan', 'span', 'class'].includes(a))).toBe(true);
  });

  it('a module holding nothing after the cleanup: a row object can be collected (no reference from the print module)', async () => {
    const src = readFileSync(`${ROOT}packages/dom/src/print/index.ts`, 'utf8');
    // Module state: a generation counter and the current cleanup only (the cleanup closes over the container, not the rows).
    const top = src.split('\n').filter((l) => /^(let|var|const) /.test(l)).map((l) => l.replace(/[=:].*$/, '').trim());
    expect(top.filter((l) => l.startsWith('let'))).toEqual(['let gen', 'let stop']);
    // The cleanup handed to the app is made by a module-level function of the container alone (not a closure of the build,
    // whose scope reads the rows): keeping it keeps no row.
    expect(src).toMatch(/^const cleaner = \(box: HTMLElement\)/m);
    expect(src).toMatch(/const clean = \(stop = cleaner\(box\)\);/);
  });

  it('the bundles: en, fr, ar with the sheet\'s texts; PRINT_KEYS', () => {
    expect([...PRINT_KEYS]).toEqual(['print.truncated', 'print.page']);
    expect(EN_PRINT.text).toEqual({ 'print.truncated': 'First {n} rows of {total}', 'print.page': 'Page {page} of {pages}' });
    expect(FR_PRINT.text).toEqual({ 'print.truncated': '{n} premières lignes sur {total}', 'print.page': 'Page {page} sur {pages}' });
    expect(AR_PRINT.text).toEqual({ 'print.truncated': 'أول {n} صف من {total}', 'print.page': 'الصفحة {page} من {pages}' });
    expect([EN_PRINT.locale, FR_PRINT.locale, AR_PRINT.locale]).toEqual(['en', 'fr', 'ar']);
  });

  it('the print keys are grid keys in the types (review finding 2): a literal bundle with them, msg() taking them, no cast', () => {
    // Checked by `npm run typecheck` (an excess key, or a key msg() refuses, fails it); at run time the bundle is plain data.
    const m: GridMessages = { locale: 'en', text: { ...EN.text, 'print.truncated': 'First {n} rows of {total}', 'print.page': 'Page {page} of {pages}' } };
    const say = (g: GridContext<unknown>): string => g.msg('print.truncated', { n: 1, total: 2 }) + g.msg('print.page', { page: 1, pages: 2 });
    expect(m.text['print.page']).toBe('Page {page} of {pages}');
    expect(typeof say).toBe('function');
    expect(readFileSync(`${ROOT}packages/dom/src/print/index.ts`, 'utf8')).not.toMatch(/as never, p\)/);
  });

  it('a missing print bundle: the table all the same, one missing-message problem for the grid, told once', async () => {
    const m = emake({ rows: rowsOf(10), settings: { messages: EN } });
    (await preparePrint(m.g, { maxRows: 2 }))!();
    (await preparePrint(m.g, { maxRows: 2 }))!();
    const p = problemsOf(m.events).filter((x) => x.code === 'missing-message');
    expect(p).toEqual([{ code: 'missing-message', severity: 'warning', path: 'messages.text', detail: 'print.truncated, print.page' }]);
  });
});
