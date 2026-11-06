// The pivot's search, find, export and state (Phase 10, DOM batch): pivot.md 25, 27, 28, 14; find.md 16; quick-filter.md
// « pivot »; grid-state.md « Pivot ». Expectations by hand from support-pivot.ts' made-up sales.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GroupShape } from '@dzgrid/core/grouping';
import { find } from '../src/find.js';
import { gridState } from '../src/state.js';
import { csvExport } from '../src/export.js';
import { EN_FIND } from '../src/locales/en-find.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { pivot } from '../src/pivot.js';
import { cleanup } from './support-grouping.js';
import { FEB, JAN, LABEL, NORD, PIVOT_BUNDLES, SALES, SUD, made, pmake } from './support-pivot.js';

afterEach(cleanup);

const messages = { ...PIVOT_BUNDLES.en, text: { ...PIVOT_BUNDLES.en.text, ...EN_FIND.text, ...EN_EXPORT.text } };

describe('the quick search in pivot mode reads the data columns (pivot.md 25)', () => {
  const quick = (t: ReturnType<typeof pmake>, text: string) => t.g.kernel.dispatch({ type: 'quick.set', text }, 'user');

  it('a title (a folded text column) keeps its row: its group and crossing stay, the others go', () => {
    const t = pmake();
    quick(t, 'citron');
    expect(t.shown()).toEqual(['[Sud]', 'Σ']);
    expect(t.visible()).toEqual([LABEL, JAN, 'amount']);
    expect(t.cellText(SUD, JAN)).toBe('2');
  });

  it('a word with a digit finds a folded number and a day by its export text; without a digit, a day is not searched — as on the flat grid', () => {
    const t = pmake();
    quick(t, '3');
    expect(t.shown()).toEqual(['[Sud]', 'Σ']);
    quick(t, '2026-03');
    expect(t.shown()).toEqual(['[Sud]', 'Σ']);
    // « Mar 7, 2026 » is r3's day as shown: a word without a digit does not look there.
    quick(t, 'mar');
    expect(t.shown()).toEqual([]);
    t.papi().setOn(false);
    expect(t.shown()).toEqual([]);
  });

  it('a hidden column is never searched; the created cells\' texts neither', () => {
    const t = pmake();
    quick(t, 'secret');
    expect(t.shown()).toEqual([]);
    // 15 is Nord's total, not a value of any row.
    quick(t, '15');
    expect(t.shown()).toEqual([]);
  });
});

describe('find in pivot mode (pivot.md 25, find.md 16)', () => {
  const fmake = () => {
    const f = find({ debounceMs: 0 });
    const t = pmake({ features: [f], settings: { messages } });
    return { ...t, f: () => f.api(t.g)! };
  };

  it('a value of a data column: the label cell of the last row group holding it', () => {
    const t = fmake();
    t.f().open('citron');
    expect([t.f().state().count, t.f().state().current]).toEqual([1, { row: SUD, column: LABEL }]);
    t.f().open('jan');
    expect(t.f().state().count).toBe(2);
  });

  it('a total as the screen writes it', () => {
    const t = fmake();
    t.f().open('15');
    expect([t.f().state().count, t.f().state().current]).toEqual([1, { row: NORD, column: 'amount' }]);
  });
});

describe('export of a pivoted grid (pivot.md 27)', () => {
  it('CSV: the label column, the created columns, the row totals with their chain of headers, the grand total', async () => {
    const files: { blob?: Blob }[] = [];
    const exp = csvExport({ canExport: true, bom: false, deliver: (f) => void files.push(f), loadRun: () => import('../src/export/run/index.js') });
    const t = pmake({ features: [exp], settings: { messages }, pivot: { columns: ['month'], values: { amount: 'sum', qty: 'sum' } } });
    expect(await exp.run('displayed')).toBe('done');
    expect(await files[0]!.blob!.text()).toBe([
      'Level,Region,Feb › Amount,Feb › Qty,Jan › Amount,Jan › Qty,Total › Amount,Total › Qty',
      '1,Nord (2),5,2,10,1,15,3',
      '1,Sud (2),,,6,4,6,4',
      '1,(Blank) (1),1,1,,,1,1',
      '1,Total,6,3,16,5,22,8',
      '',
    ].join('\r\n'));
    // The screen keeps its short headers.
    expect(t.ctx.columns.get(JAN.replace(/6:amount$/, '3:qty'))!.def.header).toBe('Qty');
  });
});

describe('state (pivot.md 14, 28; grid-state.md « Pivot »)', () => {
  it('the part is the mode, the pivot columns and the functions; no created column, band or sort on one', () => {
    const st = gridState();
    const t = pmake({ features: [st] });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: FEB, dir: 'desc' }] }, 'user');
    const s = st.api(t.g)!.state();
    expect(s.pivot).toEqual({ on: true, columns: ['month'], values: { amount: 'sum' } });
    expect(JSON.stringify(s)).not.toMatch(/~[pbt]/);
  });

  it('a pivot on titles (row values): no title in the state, its text or a problem', () => {
    const st = gridState();
    const t = pmake({ features: [st] });
    t.papi().setBy(['title']);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: t.visible()[1]!, dir: 'asc' }] }, 'user');
    const text = JSON.stringify(st.api(t.g)!.state());
    for (const title of ['Atlas', 'Bleu', 'Citron', 'Dune', 'Écume']) expect(text).not.toContain(title);
    expect(JSON.stringify(t.problems())).not.toMatch(/Atlas|Bleu|Citron|Dune|Écume/);
  });

  it('restored with one grouping build; a user\'s change is a gesture', () => {
    vi.useFakeTimers();
    const st = gridState();
    const p = pivot({ columns: ['month'], values: { amount: 'sum' } });
    const make = vi.spyOn(p, 'make');
    const t = pmake({ feature: p, features: [st] });
    const shape = make.mock.results[0]!.value as GroupShape<unknown>;
    const b0 = shape.diagnostics.builds;
    st.api(t.g)!.setState({ v: 1, rowGroups: ['month'], pivot: { columns: ['region'] } });
    expect(shape.diagnostics.builds - b0).toBe(1);
    expect(t.visible()).toEqual([LABEL, made([['region', 'tNord']], 'amount'), made([['region', 'tSud']], 'amount'), made([['region', '']], 'amount'), 'amount']);
    expect(t.ctx.columns.get(LABEL)!.def.header).toBe('Month');
    t.papi().setBy(['region', 'qty'], { user: true });
    vi.advanceTimersByTime(300);
    const changed = t.events.filter((e) => e.type === 'stateChanged') as { source: string; state: { pivot?: unknown } }[];
    expect(changed.map((e) => [e.source, e.state.pivot])).toEqual([['user', { on: true, columns: ['region', 'qty'], values: { amount: 'sum' } }]]);
  });
});

describe('review of the DOM batch (2026-11-07)', () => {
  it('R1: a user\'s change that changes nothing leaves nothing to say at the next change from elsewhere', () => {
    const t = pmake();
    t.papi().setBy(['month'], { user: true });
    t.g.update({ rows: [...SALES, { id: 'r6', title: 'Fable', region: 'Nord', month: 'Mar', amount: 3, qty: 1, sold: '2026-03-01', code: 'x' }] });
    expect(t.visible()).toContain(made([['month', 'tMar']], 'amount'));
    expect(t.said().filter((s) => /columns?$/.test(s))).toEqual([]);
  });

  it('R3: sub-totals and the empty crossing get the language\'s headers (« Total … », « (Blank) »)', () => {
    const t = pmake({ grouping: { by: ['month'] }, pivot: { columns: ['region', 'qty'], values: { amount: 'sum' }, subtotals: true } });
    // The effective tree read loosely (groups and leaves alike) for its headers.
    const heads = (n: readonly { header?: string; children?: readonly unknown[] }[]): string[] => n.flatMap((x) => [x.header ?? '', ...(x.children ? heads(x.children as never) : [])]);
    // The same loose reading of the tree.
    const tree = t.ctx.settings.columns as never as { id: string; header?: string; children?: never[] }[];
    const all = heads(tree);
    expect(all).toContain('(Blank)');
    expect(all).toContain('Total Nord');
    expect(all).toContain('Total (Blank)');
    expect(all.join('|')).not.toMatch(/[\u0000\u0001]/);
  });

  it('R4: the pivot\'s fold and a collapsible header group\'s are joined (groups())', async () => {
    const { groups } = await import('../src/groups.js');
    const { EN_COLUMNS } = await import('../src/locales/en-columns.js');
    const cols = [{ id: 'book', header: 'Book', collapsible: true, open: false, children: [{ id: 'title', header: 'Title', groupShow: 'open' as const }, { id: 'code', header: 'Code', groupShow: 'closed' as const }] }, { id: 'region', header: 'Region' }, { id: 'month', header: 'Month' }, { id: 'amount', header: 'Amount', type: 'number' as const, aggFunc: 'sum' as const }];
    // A tree with a collapsible group, typed loosely for the sales fixture.
    const t = pmake({ columns: cols as never, features: [groups()], settings: { messages: { ...PIVOT_BUNDLES.en, text: { ...PIVOT_BUNDLES.en.text, ...EN_COLUMNS.text } } } });
    expect(t.visible()).toEqual([LABEL, FEB, JAN, 'amount']);
    t.papi().setOn(false);
    // The closed group shows its « closed » column only, as without the pivot.
    expect(t.visible()).toEqual(['code', 'region', 'month', 'amount']);
  });

  it('R5: reset() brings back the pivot the application gave', () => {
    const st = gridState();
    const t = pmake({ features: [st] });
    t.papi().setBy(['qty'], { user: true });
    st.api(t.g)!.reset();
    expect(t.papi().by()).toEqual(['month']);
  });

  it('R6: the « Total » band and the bands go to Excel as merged header rows; the cells typed', async () => {
    const { readXlsx } = await import('../../../conformance/runner/xlsx-read.js');
    const files: { blob?: Blob }[] = [];
    const exp = csvExport({ canExport: true, xlsx: true, bom: false, deliver: (f) => void files.push(f), loadRun: () => import('../src/export/run/index.js') });
    pmake({ features: [exp], settings: { messages }, pivot: { columns: ['month'], values: { amount: 'sum', qty: 'sum' } } });
    expect(await exp.run('displayed', { format: 'xlsx' })).toBe('done');
    const s = readXlsx(new Uint8Array(await files[0]!.blob!.arrayBuffer()));
    const row = (n: number) => Object.keys(s.cells).filter((k) => k.replace(/[A-Z]+/, '') === String(n)).map((k) => s.cells[k]);
    expect(row(1)).toEqual(expect.arrayContaining(['Feb', 'Jan', 'Total']));
    expect(row(2)).toEqual(expect.arrayContaining(['Amount', 'Qty']));
    expect(row(3)).toEqual(expect.arrayContaining(['Nord (2)', 5, 2, 10, 1, 15, 3]));
  });
});
