import { describe, it, expect, afterEach } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { msg } from '../src/messages.js';
import { localeCtx } from '@dzgrid/core';
import { grids, make, tick } from './support-step7.js';

/** Step 7, what server-select.test.ts leaves open: the sentences in each bundle, who is not announced, Ctrl+A in the browser. */
const k = (id: string) => dataKey(id)!;
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });
const tickRow = (t: ReturnType<typeof make>, id: string) => t.click(t.rowEl(id).querySelector<HTMLElement>('.dzg-check')!);
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `r${from + i}`);

describe('what is said, in French', () => {
  it('the count, all of an unknown total, cleared, reduced', async () => {
    const t = make({ messages: FR, locale: 'fr-FR' });
    t.f.answer(['a', 'b'], { total: 1500 });
    tickRow(t, 'a');
    await tick();
    expect(t.live()).toBe('1 ligne sélectionnée');
    t.click(t.headBox());
    await tick();
    expect(t.live()).toBe(`${new Intl.NumberFormat('fr-FR').format(1500)} lignes sélectionnées`);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    await tick();
    expect(t.live()).toBe('Sélection effacée');
    t.f.answer(['a', 'b'], { hasNext: true });
    t.click(t.headBox());
    await tick();
    expect(t.live()).toBe('Toutes les lignes correspondantes sélectionnées');
  });

  it('zero is singular in French; rows a fetched set drops', async () => {
    const t = make({ messages: FR, locale: 'fr-FR', operations: { page: 'client' } });
    t.f.answer(['a', 'b', 'c']);
    tickRow(t, 'a');
    tickRow(t, 'b');
    await tick();
    expect(t.live()).toBe('2 lignes sélectionnées');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.answer(['c']);
    await tick();
    expect(t.live()).toBe('0 ligne encore sélectionnée');
  });
});

describe('what is said, in Arabic: every plural form reached', () => {
  const latn = localeCtx({ locale: 'ar-DZ', numerals: 'latn' });
  it('announce.selected and announce.selectionReduced, by number', () => {
    const want = (key: 'announce.selected' | 'announce.selectionReduced', form: string, n: number) =>
      ((AR.text[key] as Record<string, string>)[form]!).replace('{n}', String(n));
    for (const key of ['announce.selected', 'announce.selectionReduced'] as const) {
      for (const [n, form] of [[0, 'zero'], [1, 'one'], [2, 'two'], [3, 'few'], [10, 'few'], [11, 'many'], [99, 'many'], [100, 'other'], [102, 'other'], [103, 'few']] as const) {
        expect(msg(AR, key, { n }, latn), `${key} ${n}`).toBe(want(key, form, n));
      }
    }
    // Spot checks by hand, so the bundle itself is read.
    expect(msg(AR, 'announce.selected', { n: 2 }, latn)).toBe('تم تحديد صفين (2)');
    expect(msg(AR, 'announce.selectionReduced', { n: 1 }, latn)).toBe('المحدد الآن: صف واحد (1)');
    expect(msg(AR, 'announce.selectionReduced', { n: 11 }, latn)).toBe('المحدد الآن: 11 صفا');
    // Every form of the new plural message, written by hand.
    expect([0, 1, 2, 5, 11, 100].map((n) => msg(AR, 'announce.selectionReduced', { n }, latn))).toEqual([
      'المحدد الآن: 0 صف', 'المحدد الآن: صف واحد (1)', 'المحدد الآن: صفان (2)', 'المحدد الآن: 5 صفوف', 'المحدد الآن: 11 صفا', 'المحدد الآن: 100 صف',
    ]);
    expect(msg(AR, 'announce.selectedAll', {}, latn)).toBe('تم تحديد كل الصفوف المطابقة');
  });

  it('in the grid, with the locale numerals', async () => {
    const t = make({ messages: AR, locale: 'ar-EG', numerals: 'locale' });
    t.f.answer(['a', 'b'], { total: 6 });
    t.click(t.headBox());
    await tick();
    expect(t.live()).toBe(`تم تحديد ${new Intl.NumberFormat('ar-EG').format(6)} صفوف`);
    expect(t.live()).toMatch(/٦/);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'equals', value: 'a' } }, 'user');
    await tick();
    expect(t.live()).toBe('تم مسح التحديد');
  });

  it('every sentence of step 7 differs from the English one (translated, not copied)', () => {
    for (const key of ['announce.selectedAll', 'announce.selectionCleared', 'announce.selectionReduced'] as const) {
      expect(JSON.stringify(AR.text[key])).not.toBe(JSON.stringify(EN.text[key]));
      expect(JSON.stringify(FR.text[key])).not.toBe(JSON.stringify(EN.text[key]));
    }
  });
});

describe('who is not announced', () => {
  it('a selection the host or the API sets is not said; the user’s next one is', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('a')]) } }, 'host');
    t.g.kernel.dispatch({ type: 'selection.all' }, 'api');
    await tick();
    expect(t.live()).toBe('');
    t.g.kernel.dispatch({ type: 'selection.clear' }, 'user');
    await tick();
    expect(t.live()).toBe('0 rows selected');
  });

  it('a host "all" cleared by the zone is said: the data took it away', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'host');
    t.g.kernel.dispatch({ type: 'context.set', ctx: localeCtx({ locale: 'en-US', timeZone: 'Asia/Riyadh' }) }, 'host');
    await tick();
    expect(t.live()).toBe(EN.text['announce.selectionCleared']);
  });

  it('keepOnFilter off with nothing selected: nothing is said', async () => {
    const t = make({ selection: { mode: 'multi', checkbox: true, keepOnFilter: false } });
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    await tick();
    expect(t.live()).toBe('');
  });
});

describe('Ctrl+A and the box with pages in the browser', () => {
  it('Ctrl+A takes the page, as the box does (selection.md), not every page', () => {
    const t = make({ rows: ids(5).map((id) => ({ id, name: id })) });
    t.g.api.focusCell(k('r0'), 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set([k('r0'), k('r1')]) });
    expect(t.checked()).toBe('true');
    t.click(t.headBox());
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
  });

  it('a fetched set paged in the browser: the box speaks for the page', () => {
    const t = make({ operations: { page: 'client' } });
    t.f.answer(['a', 'b', 'c']);
    t.click(t.headBox());
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set([k('a'), k('b')]) });
    expect(t.checked()).toBe('true');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(t.checked()).toBe('false');
  });
});
