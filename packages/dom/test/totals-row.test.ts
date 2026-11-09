// The totals row of a flat grid (docs/behaviors/totals-row.md 4–15, 1.9.0): a row of the pinned bottom band. By hand.
import { afterEach, describe, expect, it } from 'vitest';
import type { ColumnDef, RowKey } from '@dzgrid/core';
import { cleanup, pm, tot, B, type R } from './support-pinned.js';
import { emake, join, BASE } from './support-edit.js';
import { totalsRow } from '../src/totals-row.js';
import { EN_TOTALS } from '../src/locales/en-totals.js';
import { FR_TOTALS } from '../src/locales/fr-totals.js';
import { AR_TOTALS } from '../src/locales/ar-totals.js';
import { PINNED } from './support-pinned.js';
import { preparePrint } from '../src/print.js';
import { EN_PRINT } from '../src/locales/en-print.js';
import { csvExport } from '../src/export.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { pinnedRows } from '../src/pinned-rows.js';

afterEach(cleanup);

const TOT = 'p:b:t' as RowKey;
const TEXTS = { en: EN_TOTALS, fr: FR_TOTALS, ar: AR_TOTALS } as const;
const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 80, total: 'sum' },
  { id: 's', header: 'S', width: 80, total: 'count' },
  { id: 'q', header: 'Q', type: 'number', width: 80, total: 'max' },
];
const rows = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: `s${i % 7}`, q: (i * 37) % 101 }));

/** A grid with pinned rows and the totals row; `bottom`: the application's own bottom rows. */
function tm(o: { lang?: 'en' | 'fr' | 'ar'; bottom?: R[]; columns?: ColumnDef<R, any>[]; n?: number; more?: object; settings?: object } = {}) {
  const lang = o.lang ?? 'en';
  const totals = totalsRow();
  const m = pm({
  // The caller's extra features, typed loosely by the fixture.
    lang, rows: rows(o.n ?? 10), columns: o.columns ?? COLS, ...(o.bottom && { bottom: o.bottom }), more: [totals, ...((o.more as never[]) ?? [])],
    settings: { messages: join(BASE[lang], PINNED[lang], TEXTS[lang], EN_PRINT, EN_EXPORT), ...o.settings },
  });
  const texts = () => [...(m.prow(TOT)?.querySelectorAll<HTMLElement>('.dzg-cell') ?? [])].map((c) => c.textContent);
  return { ...m, totals, tapi: totals.api(m.g)!, texts };
}

describe('the row (4–7)', () => {
  it('is the last row of the bottom band, after the application’s own; its totals in the columns’ format, the label first', () => {
    const m = tm({ bottom: [tot()], lang: 'fr', n: 2000 });
    const band = [...m.bottom()!.querySelectorAll('.dzg-row')].map((r) => m.ctx.rowRenderer.keyOf(r));
    expect(band).toEqual([B('tot'), TOT]);
    // 0 + 1 + … + 1999 = 1 999 000 (fr: a narrow no-break space); 2 000 rows; the max of (i × 37) mod 101 is 100.
    expect(m.texts()).toEqual(['Total', '1 999 000', '2 000', '100']);
    expect(m.api.get().bottom).toHaveLength(1);
  });

  it('is no data: read-only, no box, never selected; its first cell the row header; reachable by the keys', () => {
    const m = tm({ settings: { selection: { mode: 'multi', checkbox: true } } });
    const row = m.prow(TOT)!;
    expect(row.getAttribute('data-kind')).toBe('footer');
    expect(row.hasAttribute('aria-selected')).toBe(false);
    // As every pinned row's (pinned-rows.md 7): the box column's cell kept, its box hidden.
    expect(row.querySelector<HTMLElement>('.dzg-check .dzg-box')?.hidden ?? true).toBe(true);
    expect(m.pcell(TOT)!.getAttribute('role')).toBe('rowheader');
    expect(m.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: TOT, column: 'n' } }, 'api').ok).toBe(true);
    expect(m.g.kernel.editable(TOT, 'n')).toBe(false);
    expect(m.g.kernel.dispatch({ type: 'selection.toggle', row: TOT }, 'api').ok).toBe(false);
  });

  it('follows a filter and the rows', () => {
    const m = tm();
    expect(m.texts()).toEqual(['Total', '45', '10', '94']);
    m.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Name 1' } }, 'api');
    expect(m.texts()).toEqual(['Total', '1', '1', '37']);
    m.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: null }, 'api');
    m.g.update({ rows: rows(3) });
    expect(m.texts()).toEqual(['Total', '3', '3', '74']);
  });

  it('no column with a total: no row; the label in the first column without one', () => {
    expect(tm({ columns: COLS.map(({ total: _, ...c }) => c) }).prow(TOT)).toBeNull();
    const m = tm({ columns: [{ ...COLS[1]! }, { ...COLS[0]! }, { ...COLS[2]! }] });
    expect(m.texts()).toEqual(['45', 'Total', '10']);
  });

  it('Arabic: the label in Arabic', () => {
    expect(tm({ lang: 'ar' }).texts()[0]).toBe('المجموع');
  });
});

describe('without pinnedRows, and its texts (5)', () => {
  it('one warning missing-feature at totalsRow, no row', () => {
    const m = emake({ columns: COLS, settings: { messages: join(BASE.en, EN_TOTALS), features: [totalsRow()] } });
    const ps = m.events.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p) => p.path === 'totalsRow');
    expect(ps).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'totalsRow', detail: 'pinned-rows' }]);
  });

  it('listed before pinnedRows works the same', () => {
    const totals = totalsRow();
    const m = emake({ rows: rows(10), columns: COLS, settings: { messages: join(BASE.en, PINNED.en, EN_TOTALS), features: [totals, pinnedRows<R>()] } });
    const row = [...m.host.querySelectorAll('.dzg-pins-bottom .dzg-row')];
    expect(row).toHaveLength(1);
    expect([...row[0]!.querySelectorAll('.dzg-cell')].map((c) => c.textContent)).toEqual(['Total', '45', '10', '94']);
  });

  it('a missing text throws at setup, like every feature', () => {
    expect(() => emake({ columns: COLS, settings: { messages: join(BASE.en, PINNED.en), features: [pinnedRows<R>(), totalsRow()] } })).toThrow(/totals\.label/);
  });
});

describe('values given by the application (9)', () => {
  it('win until set(null); a total that does not fit is told once by column', () => {
    const m = tm({ columns: [...COLS, { id: 'x', header: 'X', value: (r: R) => r.name, total: 'sum' }] });
    m.tapi.set({ n: 7, s: 2 });
    expect(m.texts()).toEqual(['Total', '7', '2', '', '']);
    expect(m.tapi.values()).toEqual({ n: 7, s: 2 });
    m.tapi.set(null);
    expect(m.texts()).toEqual(['Total', '45', '10', '94', '']);
    const ps = m.events.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p) => p.code === 'agg-type');
    expect(ps).toEqual([{ code: 'agg-type', severity: 'warning', path: 'columns.x.total', detail: 'sum' }]);
  });
});

describe('everywhere the rows are written (10–13)', () => {
  it('print: the totals row last, as on screen', async () => {
    const m = tm();
    const done = await preparePrint(m.g);
    const last = [...document.querySelectorAll('.dzg-print tbody tr')].at(-1)!;
    expect([...last.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['Total', '45', '10', '94']);
    expect(last.className).toContain('dzg-print-footer');
    done!();
  });

  it('CSV: the totals line last for displayed and all, not for selected', async () => {
    const files: Blob[] = [];
    const exporter = csvExport({ canExport: true, bom: false, deliver: (d) => void files.push(d.blob!), loadRun: () => import('../src/export/run/index.js') });
    const m = tm({ more: [exporter], settings: { selection: { mode: 'multi' } } });
    expect(await exporter.run('displayed')).toBe('done');
    const text = await files[0]!.text();
    expect(text.split('\r\n').slice(-2)).toEqual(['Total,45,10,94', '']);
    await exporter.run('all');
    expect((await files[1]!.text()).split('\r\n').at(-2)).toBe('Total,45,10,94');
    // The first display index, a branded number.
    m.g.kernel.dispatch({ type: 'selection.toggle', row: m.g.kernel.rows.displayed.keyAt(0 as never) }, 'api');
    await exporter.run('selected');
    expect(await files[2]!.text()).toBe('Name,N,S,Q\r\nName 0,0,s0,0\r\n');
  });

  it('JSON: never written', async () => {
    const files: Blob[] = [];
    const exporter = csvExport({ canExport: true, deliver: (d) => void files.push(d.blob!), loadRun: () => import('../src/export/run/index.js') });
    tm({ more: [exporter] });
    await exporter.run('displayed', { format: 'json' });
    expect(JSON.parse(await files[0]!.text())).toHaveLength(10);
  });

  it('is never edited (no column of it is editable, even an editable column)', () => {
    const m = tm({ columns: COLS.map((c) => ({ ...c, editable: true })) });
    expect(m.g.kernel.editable(TOT, 'n')).toBe(false);
    expect(m.prow(TOT)!.querySelector('[data-col="n"]')!.getAttribute('aria-readonly')).toBe('true');
  });
});
