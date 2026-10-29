// `freshRows({ ms })` (1.1.0 step 16h; docs/behaviors/fresh-rows.md; owner Q16-9 A): the rows a live change added are
// marked (`data-dzg-fresh`) for 5 s and counted once to a screen reader — client and server sources, never on the first
// load, a page change, a sort or a filter; kept for the rest of their time when scrolled or paged into view; a pooled
// element loses it at once; destroy; right to left. Behaviour only (jsdom); the look is checked in
// packages/theme/test/fresh-rows.test.ts and `check:contrast`. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, idOfDataKey, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { sameValues } from '@dzgrid/core/compare';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import type { GridFeature } from '../src/features.js';
import { pagination } from '../src/pagination.js';
import { freshRows, FRESH_KEYS } from '../src/fresh-rows.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../src/locales/ar-pagination.js';
import { EN_FRESH } from '../src/locales/en-fresh.js';
import { FR_FRESH } from '../src/locales/fr-fresh.js';
import { AR_FRESH } from '../src/locales/ar-fresh.js';
import { fakeSource, type R } from './support-filters.js';

const grids: GridInstance<R, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const join = (b: GridMessages, ...p: { locale: string; text: object }[]): GridMessages => ({ locale: b.locale, text: Object.assign({}, b.text, ...p.map((x) => x.text)) });
const BUNDLES = { en: join(EN, EN_PAGINATION, EN_FRESH), fr: join(FR, FR_PAGINATION, FR_FRESH), ar: join(AR, AR_PAGINATION, AR_FRESH) } as const;
const LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' } as const;
const row = (id: string, n = 0): R => ({ id, name: id, n });
const ROWS = (count: number, from = 0): R[] => Array.from({ length: count }, (_, i) => row(`r${from + i}`, from + i));

interface Make {
  readonly server?: boolean;
  readonly rows?: R[];
  readonly pageSize?: number | null;
  readonly same?: boolean;
  readonly ms?: unknown;
  readonly lang?: keyof typeof BUNDLES;
  readonly block?: number;
  readonly messages?: GridMessages;
  readonly features?: readonly GridFeature[];
}

/** A grid with `freshRows()`, synchronous paints, a fake geometry, fake timers. Server pages answer only when told. */
function make(o: Make = {}) {
  vi.useFakeTimers();
  const lang = o.lang ?? 'en';
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 400, inline: 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fakeSource();
  const size = o.pageSize === undefined ? 10 : o.pageSize;
  const page = size === null ? {} : { pagination: { pageSize: size } };
  const data = o.server ? { source: sourceRows(f.source, { paging: 'offset' }), operations: 'server', ...page } : { rows: o.rows ?? ROWS(30), ...page };
  const arrivals: (readonly RowKey[])[] = [];
  const fresh = freshRows({ ...(o.ms !== undefined && { ms: o.ms as number }), rowsArrived: (keys) => void arrivals.push(keys) });
  const g = createGrid<R>(host, {
    ...data, getRowId: (r: R) => r.id, columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }],
    messages: o.messages ?? BUNDLES[lang], locale: LOCALES[lang], ...(lang === 'ar' && { direction: 'rtl' as const }),
    ...(o.same !== false && { sameRow: sameValues }),
    features: o.features ?? [...(size === null ? [] : [pagination()]), fresh], onEvent: (e: GridEvent<R>) => events.push(e),
  } as never, { geometry, sync: true }) as GridInstance<R, any>; // as never: rows or a source by mode, one literal for both
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const said = () => announce.mock.calls.map((c) => c[0]).filter((s) => /new|nouvelle|جديد/.test(s));
  const id = (k: RowKey) => idOfDataKey(k);
  /** The ids of the rows drawn with the mark, in screen order; every marked element in the layer is one of them. */
  const marked = () => {
    const m = [...ctx.rowRenderer.mounted].filter(([, v]) => v.el.hasAttribute('data-dzg-fresh'));
    expect(ctx.el.layer.querySelectorAll('[data-dzg-fresh]').length).toBe(m.length);
    return m.sort(([a], [b]) => g.kernel.rows.displayed.indexOf(a) - g.kernel.rows.displayed.indexOf(b)).map(([k]) => id(k));
  };
  const drawn = (rid: string) => ctx.rowRenderer.mounted.has(dataKey(rid)!);
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  const arrived = () => arrivals.map((keys) => keys.map(id));
  /** The server's last call answered with these ids, 30 rows known. */
  const answer = (ids: string[]) => f.calls.at(-1)!.ok({ rows: ids.map((x) => row(x)), total: 30 });
  const scroll = (top: number) => { box.scrollTop = top; ctx.el.viewport.dispatchEvent(new Event('scroll')); };
  return { g, ctx, host, f, events, said, marked, drawn, problems, arrived, answer, scroll, fresh };
}
const TEN = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'];

describe('the texts', () => {
  it('FRESH_KEYS is the one key; each bundle has it, with its plural forms', () => {
    expect([...FRESH_KEYS]).toEqual(['announce.fresh']);
    expect(EN_FRESH.text['announce.fresh']).toEqual({ one: '{n} new row', other: '{n} new rows' });
    expect(FR_FRESH.text['announce.fresh']).toEqual({ one: '{n} nouvelle ligne', many: '{n} de nouvelles lignes', other: '{n} nouvelles lignes' });
    expect(Object.keys(AR_FRESH.text['announce.fresh'] as object).sort()).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
  });

  it('a missing key throws at setup, naming it', () => {
    expect(() => make({ messages: join(EN, EN_PAGINATION) })).toThrow(/freshRows: missing announce\.fresh/);
  });
});

describe('client source', () => {
  it('the first load: nothing marked, nothing said, no event', () => {
    const t = make();
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
    expect(t.arrived()).toEqual([]);
  });

  it('a transaction adding 2 rows on top: those 2 marked, the others not; one sentence; one event with their keys', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a'), row('b')], addAt: 0 });
    expect(t.marked()).toEqual(['a', 'b']);
    expect(t.said()).toEqual(['2 new rows']);
    expect(t.arrived()).toEqual([['a', 'b']]);
  });

  it('a sentence still waiting from the same change (« selection reduced ») is joined, never dropped (review of 16h)', () => {
    const t = make();
    t.ctx.live.announce('1 row still selected');
    t.g.kernel.rows.applyTransaction({ add: [row('a'), row('b')], addAt: 0 });
    vi.advanceTimersByTime(60);
    expect(t.ctx.live.el.textContent).toBe('1 row still selected 2 new rows');
    // Nothing waiting: the sentence alone.
    t.g.kernel.rows.applyTransaction({ add: [row('c')], addAt: 0 });
    vi.advanceTimersByTime(60);
    expect(t.ctx.live.el.textContent).toBe('1 new row');
  });

  it('rowsArrived throwing: reported (window.reportError), the rows still marked and told', () => {
    const reported = vi.fn();
    vi.stubGlobal('reportError', reported);
    const t = make({ pageSize: null, features: [freshRows({ rowsArrived: () => { throw new Error('app'); } })] });
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    expect(reported.mock.calls.map((c) => (c[0] as Error).message)).toEqual(['app']);
    expect(t.marked()).toEqual(['a']);
    expect(t.said()).toEqual(['1 new row']);
    vi.unstubAllGlobals();
  });

  it('one row: the singular', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    expect(t.said()).toEqual(['1 new row']);
  });

  it('an update or a removal alone marks nothing and says nothing', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ update: [{ ...row('r1'), name: 'x' }], remove: ['r2'] });
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('5 s: still marked at 4 999 ms, gone at 5 000 ms (repainted, nothing said again)', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    vi.advanceTimersByTime(4999);
    expect(t.marked()).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual(['1 new row']);
  });

  it('each refresh its own 5 s: a row added 3 s later stays after the first is gone', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    vi.advanceTimersByTime(3000);
    t.g.kernel.rows.applyTransaction({ add: [row('b')], addAt: 0 });
    expect(t.marked()).toEqual(['b', 'a']);
    vi.advanceTimersByTime(2000);
    expect(t.marked()).toEqual(['b']);
    vi.advanceTimersByTime(3000);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual(['1 new row', '1 new row']);
  });

  it('ms: 1000 — gone after a second', () => {
    const t = make({ ms: 1000 });
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    vi.advanceTimersByTime(999);
    expect(t.marked()).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(t.marked()).toEqual([]);
  });

  it('a bad ms: 5 s, one invalid-setting warning, never a throw', () => {
    for (const ms of [-1, Number.NaN, '5000', 60_001]) {
      const t = make({ ms });
      expect(t.problems().filter((p) => p.path === 'freshRows.ms').map((p) => [p.code, p.severity])).toEqual([['invalid-setting', 'warning']]);
      t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
      vi.advanceTimersByTime(4999);
      expect(t.marked()).toEqual(['a']);
      vi.advanceTimersByTime(1);
      expect(t.marked()).toEqual([]);
    }
  });

  it('a full reload with sameRow: only the row that was not there is marked', () => {
    const t = make();
    t.g.update({ rows: [row('new'), ...ROWS(30).map((r) => ({ ...r }))] });
    expect(t.marked()).toEqual(['new']);
    expect(t.said()).toEqual(['1 new row']);
  });

  it('a full reload without sameRow is a reset: nothing marked, nothing said', () => {
    const t = make({ same: false });
    t.g.update({ rows: [row('new'), ...ROWS(30).map((r) => ({ ...r }))] });
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('more than half the rows new: a new list (reset), nothing marked', () => {
    const t = make({ rows: ROWS(4) });
    t.g.kernel.rows.applyTransaction({ add: ROWS(5, 10), addAt: 0 });
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('an empty grid\'s first rows, even by a transaction: nothing (a reset)', () => {
    const t = make({ rows: [] });
    t.g.kernel.rows.applyTransaction({ add: [row('a')] });
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });
});

describe('sort and filter', () => {
  it('a sort or a filter marks nothing new; a marked row keeps its mark for the rest of its 5 s wherever it is shown', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a', 1000)], addAt: 0 });
    expect(t.marked()).toEqual(['a']);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(0)!)).toBe(dataKey('a'));
    expect(t.marked()).toEqual(['a']);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'r1' }, 'user');
    expect(t.drawn('a')).toBe(false);
    expect(t.marked()).toEqual([]);
    vi.advanceTimersByTime(2000);
    t.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'user');
    expect(t.marked()).toEqual(['a']);
    expect(t.said()).toEqual(['1 new row']);
    vi.advanceTimersByTime(3000);
    expect(t.marked()).toEqual([]);
  });

  it('a row added that the filter hides: neither marked nor counted, nor later when the filter goes', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'r1' }, 'user');
    t.g.kernel.rows.applyTransaction({ add: [row('zz'), row('r1x')], addAt: 0 });
    expect(t.marked()).toEqual(['r1x']);
    expect(t.said()).toEqual(['1 new row']);
    expect(t.arrived()).toEqual([['r1x']]);
    t.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'user');
    expect(t.marked()).toEqual(['r1x']);
  });
});

describe('another page (the browser\'s pages)', () => {
  it('a row landing on page 2: counted and said; not drawn on page 1; marked when the user turns to page 2 within its 5 s', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('late', 99)] });
    expect(t.drawn('late')).toBe(false);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual(['1 new row']);
    vi.advanceTimersByTime(1000);
    t.g.kernel.dispatch({ type: 'page.go', index: 3 }, 'user');
    expect(t.drawn('late')).toBe(true);
    expect(t.marked()).toEqual(['late']);
    vi.advanceTimersByTime(4000);
    expect(t.marked()).toEqual([]);
  });

  it('turned to after its 5 s: unmarked', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('late', 99)] });
    vi.advanceTimersByTime(5000);
    t.g.kernel.dispatch({ type: 'page.go', index: 3 }, 'user');
    expect(t.drawn('late')).toBe(true);
    expect(t.marked()).toEqual([]);
  });
});

describe('virtual scroll', () => {
  it('a new row far below: not drawn; scrolled into view within its 5 s: marked; a pooled element shown for another row loses the mark at once', () => {
    const t = make({ rows: ROWS(300), pageSize: null });
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    t.g.kernel.rows.applyTransaction({ add: [row('far')] });
    expect(t.drawn('far')).toBe(false);
    expect(t.marked()).toEqual(['a']);
    const H = t.ctx.rowHeight();
    vi.advanceTimersByTime(2000);
    t.scroll(301 * H);
    expect(t.drawn('far')).toBe(true);
    expect(t.drawn('a')).toBe(false);
    expect(t.marked()).toEqual(['far']);
    t.scroll(0);
    expect(t.marked()).toEqual(['a']);
    t.scroll(150 * H);
    expect(t.marked()).toEqual([]);
    vi.advanceTimersByTime(3000);
    t.scroll(301 * H);
    expect(t.marked()).toEqual([]);
  });
});

describe('server source', () => {
  function server(o: Make = {}) {
    const t = make({ server: true, ...o });
    t.answer(TEN);
    return t;
  }

  it('the first answer: nothing', () => {
    const t = server();
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('rows.refresh answering 2 new rows on top: those 2 marked, the others not, one sentence, one event', () => {
    const t = server();
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    t.answer(['n1', 'n2', ...TEN.slice(0, 8)]);
    expect(t.marked()).toEqual(['n1', 'n2']);
    expect(t.said()).toEqual(['2 new rows']);
    expect(t.arrived()).toEqual([['n1', 'n2']]);
    vi.advanceTimersByTime(5000);
    expect(t.marked()).toEqual([]);
  });

  it('a refresh answering the same rows: nothing', () => {
    const t = server();
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    t.answer(TEN);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
    expect(t.arrived()).toEqual([]);
  });

  it('page 2: nothing (a new page, not arrivals)', () => {
    const t = server();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    // Mostly the same ids (a delta to the store): still a new page, not arrivals.
    t.answer(['r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11']);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('a sort or a filter (a new query): nothing', () => {
    const t = server();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    t.answer(['x1', ...TEN.slice(0, 9)]);
    expect(t.marked()).toEqual([]);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'r' }, 'user');
    t.answer(['x2', ...TEN.slice(0, 9)]);
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual([]);
  });

  it('without sameRow: one missing-feature warning at setup, and a refresh marks nothing (a reset)', () => {
    const t = server({ same: false });
    expect(t.problems().filter((p) => p.path === 'freshRows').map((p) => [p.code, p.severity, p.detail])).toEqual([['missing-feature', 'warning', 'sameRow']]);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    t.answer(['n1', ...TEN.slice(0, 9)]);
    expect(t.marked()).toEqual([]);
  });

  it('a client source without sameRow: no warning (its transactions are deltas)', () => {
    const t = make({ same: false });
    expect(t.problems().filter((p) => p.path === 'freshRows')).toEqual([]);
  });
});

describe('reduced motion', () => {
  it('the same still mark for the same time: the feature never asks the media', () => {
    const mm = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('matchMedia', mm);
    const t = make();
    const asked = mm.mock.calls.length;
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    vi.advanceTimersByTime(4999);
    expect(t.marked()).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(t.marked()).toEqual([]);
    expect(mm.mock.calls.length).toBe(asked);
    vi.unstubAllGlobals();
  });
});

describe('right to left', () => {
  it('Arabic: the same rows marked, the sentence with its plural forms', () => {
    const t = make({ lang: 'ar' });
    expect(t.host.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    t.g.kernel.rows.applyTransaction({ add: [row('b'), row('c')], addAt: 0 });
    t.g.kernel.rows.applyTransaction({ add: [row('d'), row('e'), row('f')], addAt: 0 });
    expect(t.marked()).toEqual(['d', 'e', 'f', 'b', 'c', 'a']);
    expect(t.said()).toEqual(['صف جديد واحد (1)', 'صفان جديدان (2)', '3 صفوف جديدة']);
  });

  it('French', () => {
    const t = make({ lang: 'fr' });
    t.g.kernel.rows.applyTransaction({ add: [row('a'), row('b'), row('c')], addAt: 0 });
    expect(t.said()).toEqual(['3 nouvelles lignes']);
  });
});

describe('destroy', () => {
  it('the feature destroyed: every mark removed, its timers cancelled, deaf to later changes', () => {
    const t = make({ pageSize: null });
    const pending = t.ctx.scope.pending;
    t.g.kernel.rows.applyTransaction({ add: [row('a'), row('b')], addAt: 0 });
    // The live region's own 50 ms beat passed: what is left is the mark's timer.
    vi.advanceTimersByTime(60);
    expect(t.ctx.scope.pending).toBe(pending + 1);
    expect(t.marked()).toEqual(['a', 'b']);
    for (const h of t.ctx.features) h.destroy();
    expect(t.marked()).toEqual([]);
    expect(t.ctx.scope.pending).toBe(pending);
    t.g.kernel.rows.applyTransaction({ add: [row('c')], addAt: 0 });
    expect(t.marked()).toEqual([]);
    expect(t.said()).toEqual(['2 new rows']);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('the grid destroyed with marks running: no timer left, nothing thrown when they would have ended', () => {
    const t = make();
    t.g.kernel.rows.applyTransaction({ add: [row('a')], addAt: 0 });
    t.g.destroy();
    grids.length = 0;
    expect(t.ctx.scope.pending).toBe(0);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
