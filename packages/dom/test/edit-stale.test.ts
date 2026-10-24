// Rows out of the order shown after an edit (Phase 5 step 4; edit-reapply.md 3–8; owner Q6, Q7, O4, O5,
// O6, S2-O2, S4-O3): muted rows, the header's reapply mark, its keys, the sentences.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { edit, type EditApi } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';
import type { SlotPart } from '../src/part.js';
import { slots } from '../src/slots.js';
import { cleanup, emake, join, k, type R } from './support-edit.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'n', header: 'N', type: 'number', width: 80 },
  { id: 'q', header: 'Q', type: 'number', width: 80, editable: true },
];
// q = (i × 37) mod 101: r1 37, r2 74, r3 10, r4 47.

function mk(o: { lang?: 'en' | 'ar'; rows?: R[]; settings?: object } = {}) {
  const f = edit<R>();
  const messages = o.lang === 'ar' ? join(AR, AR_EDIT) : join(EN, EN_EDIT);
  const m = emake({ columns: COLS, ...(o.rows && { rows: o.rows }), settings: { features: [f], messages, ...(o.lang === 'ar' && { direction: 'rtl' as const }), selection: { mode: 'multi' }, ...o.settings } });
  const api = f.api(m.g)! as EditApi<R>;
  const announce = vi.spyOn(m.ctx.live, 'announce');
  const said = () => announce.mock.calls.map((c) => c[0]);
  const put = (id: string, col: string, text: string) => api.commit([{ key: k(id), column: col, input: { text } }]);
  const head = (col: string) => m.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${col}"]`)!;
  const mark = (col: string) => head(col).querySelector<HTMLElement>(':scope > .dzg-reapply');
  const muted = () => [...m.host.querySelectorAll('.dzg-layer > .dzg-row[data-dzg-stale]')].map((r) => String(m.ctx.rowRenderer.keyOf(r)).replace(/^d:\d+:/, ''));
  const descOf = (el: Element | null) => (el?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)?.textContent).join('|');
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { ...m, f, api, announce, said, put, head, mark, muted, descOf, settle };
}

describe('muted rows (edit-reapply.md 3)', () => {
  it('an edit that makes a filtered row fail: muted, its row header described, still shown', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    expect(t.muted()).toEqual([]);
    t.put('r1', 'q', '5');
    expect(t.cell('r1', 'q')!.textContent).toBe('5');
    expect(t.muted()).toEqual(['r1']);
    expect(t.descOf(t.cell('r1', 'name'))).toBe('No longer matches the filter');
    expect(t.descOf(t.cell('r2', 'name'))).toBe('');
    // Another edit that still passes: not muted.
    t.put('r2', 'q', '90');
    expect(t.muted()).toEqual(['r1']);
  });

  it('a row that passes again is no longer muted, nor described (mutant « row header description kept »)', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    expect(t.muted()).toEqual(['r1']);
    t.put('r1', 'q', '50');
    expect(t.muted()).toEqual([]);
    expect(t.cell('r1', 'name')!.getAttribute('aria-describedby')).toBeNull();
  });

  it('a row only out of sort order is not muted', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'q', dir: 'asc' }] }, 'api');
    t.put('r1', 'q', '999');
    expect(t.g.kernel.orderStale).toBe(true);
    expect(t.muted()).toEqual([]);
  });

  it('the quick search: a row whose edited text no longer matches is muted', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'Name 1' }, 'api');
    t.put('r1', 'name', 'Zed');
    expect(t.muted()).toEqual(['r1']);
  });

  it('selection and focus are untouched; a reapply clears the muting (the row leaves)', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'api');
    t.g.api.focusCell(k('r1'), 'q');
    t.put('r1', 'q', '5');
    expect(t.muted()).toEqual(['r1']);
    expect(t.row('r1')!.getAttribute('aria-selected')).toBe('true');
    expect(t.g.kernel.focus).toMatchObject({ kind: 'cell', row: k('r1') });
    t.api.reapply();
    expect(t.muted()).toEqual([]);
    expect(t.row('r1')).toBeNull();
    expect(t.host.querySelectorAll('[data-dzg-stale]').length).toBe(0);
    expect(t.host.querySelector('.dzg-desc')!.children.length).toBe(0);
  });

  it('server pages: never muted, the header mark is enough (S4-O3)', () => {
    const calls: { ok(v: unknown): void }[] = [];
    const source: DataSource<R> = { fetch: () => ({ then(ok: (v: never) => void) { calls.push({ ok: ok as never }); } }) as never };
    const t = mk({ rows: undefined, settings: { source: sourceRows(source), operations: 'server', rows: undefined } });
    calls.at(-1)!.ok({ rows: [{ id: 'a', name: 'A', n: 1, s: '', q: 50 }, { id: 'b', name: 'B', n: 2, s: '', q: 60 }], total: 2 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'user');
    calls.at(-1)!.ok({ rows: [{ id: 'a', name: 'A', n: 1, s: '', q: 50 }, { id: 'b', name: 'B', n: 2, s: '', q: 60 }], total: 2 });
    t.put('a', 'q', '5');
    expect(t.g.kernel.orderStale).toBe(true);
    expect(t.mark('q')).not.toBeNull();
    expect(t.muted()).toEqual([]);
  });
});

describe('the reapply mark (edit-reapply.md 4–8)', () => {
  it('on every sorted or filtered header while the order is stale; the header’s name says it', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    expect(t.mark('n')).toBeNull();
    t.put('r1', 'q', '5');
    expect(t.mark('n')).not.toBeNull();
    expect(t.mark('q')).not.toBeNull();
    expect(t.mark('name')).toBeNull();
    const b = t.mark('q')!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('aria-label')).toBe('Put back in order');
    expect(b.tabIndex).toBe(-1);
    // After the sort and filter marks.
    expect(t.head('q').lastElementChild).toBe(b);
    expect(t.head('q').getAttribute('aria-label')).toBe('Q, order out of date');
  });

  it('quick search alone: the mark on the edited column only', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'Name 1' }, 'api');
    t.put('r1', 'name', 'Zed');
    expect(t.mark('name')).not.toBeNull();
    expect(t.mark('q')).toBeNull();
    expect(t.mark('n')).toBeNull();
  });

  it('Enter on the header sorts (and the sort puts things back in order); the mark goes', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'q', dir: 'asc' }] }, 'api');
    t.put('r1', 'q', '999');
    t.head('q').focus();
    t.press('Enter', {}, t.head('q'));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'q', dir: 'desc' }]);
    expect(t.g.kernel.orderStale).toBe(false);
    expect(t.mark('q')).toBeNull();
  });

  it('F2 reaches the mark; Enter, Space or a click on it reapplies as the user, the focus back on the header, the rows counted', async () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    await t.settle();
    const shown = t.g.kernel.rows.displayed.count;
    t.head('q').focus();
    t.press('F2', {}, t.head('q'));
    const b = t.mark('q')!;
    expect(document.activeElement).toBe(b);
    expect(b.tabIndex).toBe(0);
    // A click (Enter and Space on a button are the browser's click).
    const sources: string[] = [];
    t.g.kernel.subscribe((e) => { if (e.type === 'orderStale') sources.push(e.source); });
    b.click();
    expect(sources).toEqual(['user']);
    expect(document.activeElement).toBe(t.head('q'));
    expect(t.mark('q')).toBeNull();
    await t.settle();
    expect(t.said().at(-1)).toBe(`Back in order, ${shown - 1} rows`);
    // A click never sorts.
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('a pointer press with the focus in the body: the focus goes to the header (mutant « focus not returned »)', async () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    t.g.api.focusCell(k('r2'), 'q');
    expect(document.activeElement).toBe(t.cell('r2', 'q'));
    t.mark('q')!.click();
    expect(document.activeElement).toBe(t.head('q'));
  });

  it('Escape on the mark: back to the header cell, the mark out of the Tab order', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    t.head('q').focus();
    t.press('F2', {}, t.head('q'));
    t.press('Escape', {}, t.mark('q')!);
    expect(document.activeElement).toBe(t.head('q'));
    expect(t.mark('q')!.tabIndex).toBe(-1);
  });

  it('the stale sentence once per false → true, after the save’s; the app’s reapply silent', async () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    await t.settle();
    t.announce.mockClear();
    t.put('r1', 'q', '5');
    t.put('r2', 'q', '6');
    await t.settle();
    expect(t.said()).toEqual(['Order out of date: reapply from the header']);
    t.api.reapply();
    await t.settle();
    expect(t.said().length).toBe(1);
    t.put('r4', 'q', '1');
    await t.settle();
    expect(t.said().length).toBe(2);
  });

  it('Arabic: the count in its plural forms', async () => {
    const t = mk({ lang: 'ar', rows: Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, name: `N${i}`, n: i, s: '', q: 50 + i })) });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    await t.settle();
    t.mark('q')!.click();
    await t.settle();
    expect(t.said().at(-1)).toBe('أُعيد الترتيب\u060C 3 صفوف');
  });

  it('a header part keeps F2 first (its listener runs before the grid’s); the mark is reached by Tab from it', () => {
    const part: SlotPart<'header'> = { slot: 'header', part: { mount(host: HTMLElement) { const i = document.createElement('input'); host.append(i); return { focus: () => (i.focus(), true) }; } } } as never;
    const f = edit<R>();
    const m = emake({ columns: COLS.map((c) => (c.id === 'q' ? { ...c, ui: { header: 'h' } } : c)), settings: { features: [slots(), f], parts: { h: part }, messages: join(EN, EN_EDIT) } });
    m.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    f.api(m.g)!.commit([{ key: k('r1'), column: 'q', input: { text: '5' } }]);
    const h = m.host.querySelector<HTMLElement>('.dzg-hcell[data-col="q"]')!;
    h.focus();
    m.press('F2', {}, h);
    expect(document.activeElement?.tagName).toBe('INPUT');
    expect(h.querySelector('.dzg-reapply')).not.toBeNull();
  });
});

describe('review and test gaps (step 4 review)', () => {
  it('the row header not mounted: the muted sign and description go to the row’s first mounted cell (review 5, WCAG 1.4.1)', () => {
    const many: ColumnDef<R, any>[] = [
      { id: 'name', header: 'Name', width: 200 },
      ...Array.from({ length: 12 }, (_, i): ColumnDef<R, any> => ({ id: `c${i}`, header: `C${i}`, width: 150, value: (r: R) => `${r.n}-${i}` })),
      { id: 'q', header: 'Q', type: 'number', width: 80, editable: true },
    ];
    const f = edit<R>();
    const m = emake({ columns: many, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    m.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    m.box.scrollInline = 1700;
    m.vp.dispatchEvent(new Event('scroll'));
    f.api(m.g)!.commit([{ key: k('r1'), column: 'q', input: { text: '5' } }]);
    const row = m.row('r1')!;
    expect(row.querySelector('[data-col="name"]')).toBeNull();
    const first = row.querySelector<HTMLElement>('.dzg-cell')!;
    expect(first.hasAttribute('data-dzg-stale')).toBe(true);
    expect(document.getElementById(first.getAttribute('aria-describedby') ?? '')?.textContent).toBe('No longer matches the filter');
  });

  it('a save that makes a filtered row stale: one polite announcement, the save before the order (gap 6)', async () => {
    const held: (() => void)[] = [];
    const f = edit<R>({ save: () => new Promise<void>((ok) => held.push(() => ok())) });
    const m = emake({ columns: COLS, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    m.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const announce = vi.spyOn(m.ctx.live, 'announce');
    f.api(m.g)!.commit([{ key: k('r1'), column: 'q', input: { text: '5' } }]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['Saving. Order out of date: reapply from the header']);
  });

  it('Shift+F2 on a header with a mark keeps the focus on the header (gap 9)', () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    t.head('q').focus();
    t.press('F2', { shiftKey: true }, t.head('q'));
    expect(document.activeElement).toBe(t.head('q'));
  });

  it('Arabic, right to left: F2 on the header reaches the mark (gap 10)', () => {
    const t = mk({ lang: 'ar' });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: { type: 'number', op: 'gt', value: 20 } }, 'api');
    t.put('r1', 'q', '5');
    t.head('q').focus();
    t.press('F2', {}, t.head('q'));
    expect(document.activeElement).toBe(t.mark('q'));
    expect(t.mark('q')!.getAttribute('aria-label')).toBe('إعادة الترتيب');
  });

describe('analyser 5 (step 7)', () => {
  it('a press on the mark, then later the application\'s reapply: « Back in order » said once, for the press only', async () => {
    const t = mk();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'q', dir: 'asc' }] }, 'api');
    t.put('r1', 'q', '500');
    t.mark('q')!.click();
    await t.settle();
    t.put('r2', 'q', '600');
    t.api.reapply();
    await t.settle();
    expect(t.said().filter((x) => /Back in order/.test(String(x)))).toHaveLength(1);
  });
});
});
