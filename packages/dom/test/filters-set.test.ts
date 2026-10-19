// The set filter in the popup (step 15; docs/behaviors/filter-set.md, value-list.md, filter-ui.md).
// The lazy chunk is handed in through `loadSet` (a resolved promise) so the tests run on fake
// timers; one test loads it through the real `import()`.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { filters, FILTER_KEYS } from '../src/filters.js';
import { definePart } from '../src/part.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, make } from './support-filters.js';
import { COLS, grid, kit, ROWS, settle, T, TOWNS, type Row } from './support-set.js';

afterEach(cleanup);
let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

const NEW_KEYS = ['filter.set.search', 'filter.set.all', 'filter.set.allShown', 'filter.set.blanks', 'filter.set.option', 'filter.set.count', 'filter.set.truncated', 'filter.set.failed'];
const FR_MSG = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } };
const AR_MSG = { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } };

describe('the texts', () => {
  it('FILTER_KEYS holds the 8 set keys, and every shipped filter bundle has them', () => {
    for (const k of NEW_KEYS) expect(FILTER_KEYS, k).toContain(k);
    for (const b of [EN_FILTERS, FR_FILTERS, AR_FILTERS]) for (const k of NEW_KEYS) expect((b.text as Record<string, unknown>)[k], `${b.locale} ${k}`).toBeDefined();
    expect(FILTER_KEYS).not.toContain('filter.summarySelected');
  });

  it('a bundle without a set key: filters() throws a TypeError naming it', () => {
    const text = { ...EN.text, ...EN_FILTERS.text } as Record<string, unknown>;
    delete text['filter.set.option'];
    expect(() => make({ features: [filters()], settings: { messages: { locale: 'en', text } } as never })).toThrow(/filters: missing filter\.set\.option/);
  });

  it('the count is plural in every bundle (one / other; Arabic’s six forms)', () => {
    expect(typeof T['filter.set.count']).toBe('object');
    expect(Object.keys(AR_FILTERS.text['filter.set.count' as never] as object).sort()).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
  });
});

describe('which columns get the popup (owner Q2)', () => {
  it('an explicit filter.kind set column gets the button and Alt+ArrowDown; an enum column without a kind does not', () => {
    const t = grid();
    expect(t.host.querySelector('.dzg-hcell[data-col="city"] > .dzg-fbtn')).not.toBeNull();
    expect(t.host.querySelector('.dzg-hcell[data-col="city"]')!.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown');
    expect(t.host.querySelector('.dzg-hcell[data-col="st"] > .dzg-fbtn')).toBeNull();
    expect(t.host.querySelector('.dzg-hcell[data-col="st"]')!.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(t.feature.openFilter('st')).toBe(false);
  });

  it('an enum column that names set explicitly gets it', () => {
    const t = grid({ columns: [{ id: 'st', header: 'Status', type: 'enum', enumOptions: [{ value: 'a', label: 'Active' }, { value: 'c', label: 'Closed' }], filter: { kind: 'set' } }] });
    expect(t.host.querySelector('.dzg-hcell[data-col="st"] > .dzg-fbtn')).not.toBeNull();
  });

  it('an implicit enum column keeps the plain summary in the floating row (not a button)', () => {
    const t = grid({ floating: true });
    t.set('st', { type: 'set', include: ['a'] });
    const sum = t.cell('st').querySelector('.dzg-fsum')!;
    expect(sum.tagName).toBe('SPAN');
    expect(sum.textContent).toBe(T['filter.summaryActive']);
  });

  it('an explicit set column’s floating summary is a button opening the popup, still "Filter active" (Q4)', async () => {
    const t = grid({ floating: true });
    t.set('city', { type: 'set', include: ['Oran'] });
    const sum = t.cell('city').querySelector<HTMLElement>('.dzg-fsum')!;
    expect(sum.tagName).toBe('BUTTON');
    expect(sum.textContent).toBe(T['filter.summaryActive']);
    sum.click();
    await settle();
    expect(t.list()).not.toBeNull();
  });

  it('a host’s own filter.set part still resolves for an implicit enum column', () => {
    const part = definePart('filter', { mount: (h) => (h.append('mine'), {}) });
    const t = grid({ settings: { parts: { 'filter.set': part } } });
    expect(t.feature.openFilter('st')).toBe(true);
    expect(t.popup()!.textContent).toContain('mine');
  });
});

describe('the list', () => {
  it('blanks first, then the labels in order, with their counts', async () => {
    const t = grid();
    await t.open();
    expect(t.labels()).toEqual([T['filter.set.blanks'], 'Alger', 'Annaba', 'Blida', 'Oran', 'Sétif']);
    expect(t.counts()).toEqual(['3', '6', '6', '6', '6', '3']);
    const alger = t.option('Alger');
    expect(alger.getAttribute('aria-label')).toBe('Alger, 6 rows');
    expect(alger.getAttribute('aria-posinset')).toBe('2');
    expect(alger.getAttribute('aria-setsize')).toBe('6');
    expect(t.list().getAttribute('aria-multiselectable')).toBe('true');
    expect(t.list().getAttribute('aria-label')).toBe('City filter');
    expect(t.status().getAttribute('role')).toBe('status');
    expect(t.status().textContent).toBe('5 values');
  });

  it('no filter: every row ticked, select all checked', async () => {
    const t = grid();
    await t.open();
    expect(t.selected()).toHaveLength(6);
    expect(t.all().checked).toBe(true);
    expect(t.all().indeterminate).toBe(false);
    expect(t.all().closest('label')!.textContent).toBe(T['filter.set.all']);
  });

  it('the search box: labelled, text, its own direction, focused on open', async () => {
    const t = grid();
    await t.open();
    const s = t.search();
    expect(s.type).toBe('text');
    expect(s.dir).toBe('auto');
    expect(s.autocomplete).toBe('off');
    expect(s.placeholder).toBe('');
    expect(s.closest('label')!.textContent).toBe(T['filter.set.search']);
    expect(document.activeElement).toBe(s);
  });

  it('a ticked value with no row comes first, count 0, ticked', async () => {
    const t = grid();
    t.set('city', { type: 'set', include: ['Tlemcen', 'Oran'] });
    await t.open();
    expect(t.labels()).toEqual([T['filter.set.blanks'], 'Tlemcen', 'Alger', 'Annaba', 'Blida', 'Oran', 'Sétif']);
    expect(t.counts()[1]).toBe('0');
    expect(t.selected().sort()).toEqual(['Oran', 'Tlemcen']);
  });

  it('blanks hidden when no row is blank, shown when ticked in an include, hidden during a search', async () => {
    const rows = ROWS.map((r) => ({ ...r, city: r.city ?? 'Oran' }));
    const t = grid({ rows });
    await t.open();
    expect(t.labels()).not.toContain(T['filter.set.blanks']);
    t.feature.closeFilter();
    t.set('city', { type: 'set', include: ['Oran'], blanks: 'include' });
    await t.open();
    expect(t.labels()[0]).toBe(T['filter.set.blanks']);
    t.type('o');
    expect(t.labels()).not.toContain(T['filter.set.blanks']);
  });

  it('counts in the grid’s digits; option names in Arabic with Arabic plurals', async () => {
    const t = grid({ settings: { messages: AR_MSG, locale: 'ar-EG', numerals: 'locale' } });
    await t.open();
    expect(t.counts()).toContain('٦');
    // 6 is "few" in Arabic: «٦ صفوف»; the bundle joins with the Arabic comma.
    expect(t.option('Oran').getAttribute('aria-label')).toBe('Oran' + String.fromCharCode(0x60c) + ' ٦ صفوف');
    expect(t.status().textContent).toBe('٥ قيم');
  });

  it('counts hidden when none is known (enum fallback)', async () => {
    const t = grid({ server: true, columns: [{ id: 'st', header: 'Status', type: 'enum', enumOptions: [{ value: 'a', label: 'Active' }, { value: 'c', label: 'Closed' }], filter: { kind: 'set' } }] });
    t.f.answer(['a']);
    await t.open('st');
    expect(t.labels().filter((l) => l !== T['filter.set.blanks'])).toEqual(['Active', 'Closed']);
    expect(t.counts().every((c) => c === '')).toBe(true);
    expect(t.option('Active').getAttribute('aria-label')).toBe('Active');
    t.type('clo');
    expect(t.labels()).toEqual(['Closed']);
  });

  it('a column without a list on a server and no options: 0 values', async () => {
    const t = grid({ server: true });
    t.f.answer(['a']);
    await t.open();
    expect(t.status().textContent).toBe('0 values');
  });

  it('truncated: the first 2 000 and a line asking to refine', async () => {
    const rows = Array.from({ length: 2005 }, (_, i) => ({ id: `r${i}`, name: 'x', n: i, city: `v${String(i).padStart(4, '0')}`, st: 'a' }));
    const t = grid({ rows });
    await t.open();
    expect(t.status().textContent).toBe('The first 2,000 values. Refine your search.');
    expect(t.list().querySelectorAll('[role=option]').length).toBeLessThanOrEqual(40);
    expect(t.options()[0]!.getAttribute('aria-setsize')).toBe('2000');
  });
});

describe('a truncated list (mutation found)', () => {
  it('never turns a draft into include: unticking every shown value keeps an exclude, the values past the cap kept', async () => {
    const rows = Array.from({ length: 2005 }, (_, i) => ({ id: `r${i}`, name: 'x', n: i, city: `v${String(i).padStart(4, '0')}`, st: 'a' }));
    const t = grid({ rows });
    await t.open();
    t.clickAll();
    t.apply();
    const f = t.filter()['city'] as { exclude?: string[]; include?: string[] };
    expect(f.include).toBeUndefined();
    expect(f.exclude).toHaveLength(2000);
    expect(t.ids()).toEqual(['r2000', 'r2001', 'r2002', 'r2003', 'r2004']);
  });
});

describe('review fixes', () => {
  it('select all off without a search unticks the blanks too, even when no row is blank now (Q1: include [])', async () => {
    const rows = ROWS.map((r) => ({ ...r, city: r.city ?? 'Oran' }));
    const t = grid({ rows });
    await t.open();
    t.clickAll();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', include: [] });
  });
});

describe('ticking in the browser', () => {
  it('ticks coalesce at the pause: one change, one announcement', async () => {
    const t = grid();
    await t.open();
    vi.useFakeTimers();
    const said = vi.spyOn(t.live, 'announce');
    t.option('Oran').click();
    t.option('Blida').click();
    t.option('Alger').click();
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(149);
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(t.filterEvents()).toHaveLength(1);
    // 3 of 5 unticked: fewer than half ticked → include.
    expect(t.filter()['city']).toEqual({ type: 'set', include: ['Annaba', 'Sétif'], blanks: 'include' });
    expect(t.ids()).toHaveLength(12);
    expect(said).toHaveBeenCalledTimes(1);
    expect(said.mock.calls[0]![0]).toBe('Filtered. 12 rows');
  });

  it('the option shows its state at once (aria-selected), drawn from the draft', async () => {
    const t = grid();
    await t.open();
    vi.useFakeTimers();
    t.option('Oran').click();
    expect(t.option('Oran').getAttribute('aria-selected')).toBe('false');
    expect(t.all().indeterminate).toBe(true);
    expect(document.activeElement).toBe(t.option('Oran'));
  });

  it('Apply applies at once and closes; Escape applies what is pending too', async () => {
    const t = grid();
    await t.open();
    vi.useFakeTimers();
    t.option('Oran').click();
    t.apply();
    expect(t.popup()).toBeNull();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Oran'] });
    vi.useRealTimers();
    await t.open();
    vi.useFakeTimers();
    t.option('Blida').click();
    t.press('Escape');
    expect(t.popup()).toBeNull();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Blida', 'Oran'] });
  });

  it('ticking back to the filter in force sends nothing', async () => {
    const t = grid();
    await t.open();
    vi.useFakeTimers();
    t.option('Oran').click();
    t.option('Oran').click();
    vi.advanceTimersByTime(500);
    expect(t.filterEvents()).toHaveLength(0);
  });

  it('select all: unticks everything (include: [], Q1), then ticks everything (no filter)', async () => {
    const t = grid();
    await t.open();
    t.clickAll();
    expect(t.selected()).toEqual([]);
    expect(t.all().checked).toBe(false);
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', include: [] });
    expect(t.ids()).toEqual([]);
    await t.open();
    t.clickAll();
    expect(t.selected()).toHaveLength(6);
    t.apply();
    expect(t.filter()['city']).toBeUndefined();
  });

  it('select all shown: during a search, acts on the shown values only, never on blanks', async () => {
    const t = grid();
    t.set('city', { type: 'set', include: [] });
    await t.open();
    t.type('a');
    expect(t.all().closest('label')!.textContent).toBe(T['filter.set.allShown']);
    expect(t.labels()).toEqual(['Alger', 'Annaba', 'Blida', 'Oran']);
    t.clickAll();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', include: ['Alger', 'Annaba', 'Blida', 'Oran'] });
  });

  it('the search narrows the list, never the filter, and says the new count', async () => {
    const t = grid();
    await t.open();
    vi.useFakeTimers();
    t.type('bl');
    expect(t.labels()).toEqual(['Blida']);
    // Said once the list settles (the pause), not per keystroke.
    expect(t.status().textContent).toBe('5 values');
    vi.advanceTimersByTime(150);
    expect(t.status().textContent).toBe('1 value');
    expect(t.filter()['city']).toBeUndefined();
  });

  it('a search under exclude mode: unticking a found value adds it to the excluded ones', async () => {
    const t = grid();
    await t.open();
    t.type('or');
    t.option('Oran').click();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Oran'] });
  });
});

describe('on a server', () => {
  const vals = () => ({ values: TOWNS.map((v, i) => ({ value: v, count: i + 1 })), blanks: 2 });

  it('ticks are a draft: nothing asked before Apply, one request at Apply', async () => {
    const t = grid({ server: true, values: (() => vals()) as never });
    t.f.answer(['a']);
    await t.open();
    const before = t.f.calls.length;
    t.option('Oran').click();
    t.option('Alger').click();
    expect(t.f.calls.length).toBe(before);
    expect(t.filterEvents()).toHaveLength(0);
    t.apply();
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Alger', 'Oran'] });
  });

  it('closing without Apply drops the ticks', async () => {
    const t = grid({ server: true, values: (() => vals()) as never });
    t.f.answer(['a']);
    await t.open();
    const before = t.f.calls.length;
    t.option('Oran').click();
    t.press('Escape');
    expect(t.f.calls.length).toBe(before);
    expect(t.filter()['city']).toBeUndefined();
  });

  it('Enter in the search applies and closes', async () => {
    const t = grid({ server: true, values: (() => vals()) as never });
    t.f.answer(['a']);
    await t.open();
    t.option('Oran').click();
    t.search().focus();
    t.press('Enter');
    expect(t.popup()).toBeNull();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Oran'] });
  });
});

describe('the echo, the summary, locale and direction', () => {
  it('a filter set from elsewhere rewrites a clean draft', async () => {
    const t = grid();
    await t.open();
    t.set('city', { type: 'set', include: ['Oran'] });
    expect(t.selected()).toEqual(['Oran']);
  });

  it('…and leaves a draft being edited alone (server)', async () => {
    const t = grid({ server: true, values: (() => ({ values: TOWNS.map((v) => ({ value: v, count: 1 })) })) as never });
    t.f.answer(['a']);
    await t.open();
    t.option('Oran').click();
    t.set('city', { type: 'set', include: ['Blida'] });
    t.f.answer(['a']);
    // The server's order is kept (Oran, Alger, Blida, Annaba, Sétif).
    expect(t.selected()).toEqual([T['filter.set.blanks'], 'Alger', 'Blida', 'Annaba', 'Sétif']);
  });

  it('a filter the list cannot show (both lists, combined): Filter active and Clear', async () => {
    const t = grid();
    t.set('city', { type: 'combined', operator: 'and', conditions: [{ type: 'set', include: ['Oran'] }, { type: 'set', include: ['Alger'] }] });
    await t.open();
    expect(t.q('.dzg-fsum')!.textContent).toBe(T['filter.summaryActive']);
    expect(t.list()).toBeNull();
    t.q<HTMLButtonElement>('.dzg-fclr')!.click();
    expect(t.filter()['city']).toBeUndefined();
  });

  it('a locale change rewrites the static texts', async () => {
    const t = grid();
    await t.open();
    t.g.update({ messages: FR_MSG, locale: 'fr-FR' } as never);
    expect(t.search().closest('label')!.textContent).toBe(FR_FILTERS.text['filter.set.search' as never]);
    expect(t.all().closest('label')!.textContent).toBe(FR_FILTERS.text['filter.set.all' as never]);
    expect(t.option('Oran').getAttribute('aria-label')).toBe('Oran, 6 lignes');
    expect(t.status().textContent).toBe('5 valeurs');
  });

  it('a direction change closes the popup', async () => {
    const t = grid();
    await t.open();
    t.g.update({ direction: 'rtl' } as never);
    expect(t.popup()).toBeNull();
  });
});

describe('the chunk and the handle', () => {
  it('loads through the real import(): loading line first, then the list', async () => {
    const feature = filters();
    const t = make({ columns: COLS as never, rows: ROWS as never, features: [feature] });
    expect(feature.openFilter('city')).toBe(true);
    const box = t.host.querySelector<HTMLElement>('.dzg-popup .dzg-fset')!;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.querySelector('[role=status]')!.textContent).toBe(EN.text['grid.loading']);
    await vi.waitFor(() => expect(t.host.querySelector('.dzg-popup [role=listbox]')).not.toBeNull());
    expect(box.hasAttribute('aria-busy')).toBe(false);
    expect(box.querySelector('.dzg-fload')).toBeNull();
  });

  it('a chunk that fails: alert, Retry, the error reported; Retry loads it again', async () => {
    let fail = true;
    const t = grid({ loadSet: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(kit)) });
    await t.open();
    const alert = t.q('.dzg-fset [role=alert]')!;
    expect(alert.textContent).toBe(T['filter.set.failed']);
    expect(reported).toHaveLength(1);
    expect(t.list()).toBeNull();
    // Apply keeps the filter in force (nothing to read).
    fail = false;
    t.q<HTMLButtonElement>('.dzg-fset .dzg-fretry')!.click();
    await settle();
    expect(t.list()).not.toBeNull();
    expect(t.q('[role=alert]')).toBeNull();
  });

  it('a module without body is a failure', async () => {
    const t = grid({ loadSet: () => Promise.resolve({}) });
    await t.open();
    expect(t.q('.dzg-fset [role=alert]')).not.toBeNull();
    expect(reported).toHaveLength(1);
  });

  it('Apply while the chunk loads keeps the filter in force', async () => {
    const t = grid({ loadSet: () => new Promise(() => {}) });
    t.set('city', { type: 'set', include: ['Oran'] });
    await t.open();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', include: ['Oran'] });
  });

  it('opens the column’s values handle and closes it with the popup', async () => {
    const t = grid();
    const closed: string[] = [];
    const real = t.g.kernel.values.bind(t.g.kernel);
    vi.spyOn(t.g.kernel, 'values').mockImplementation((col, o) => {
      const h = real(col, o);
      const close = h.close.bind(h);
      return Object.assign(Object.create(Object.getPrototypeOf(h)), h, { search: h.search.bind(h), refresh: h.refresh.bind(h), subscribe: h.subscribe.bind(h), close: () => (closed.push(col), close()) });
    });
    await t.open();
    expect(t.g.kernel.values).toHaveBeenCalledWith('city', undefined);
    t.feature.closeFilter();
    expect(closed).toEqual(['city']);
  });

  it('the context gives values(): a host’s part can list the column', async () => {
    let got: unknown = null;
    const part = definePart('filter', { mount: (_h, c) => { const h = c.values(); got = h.result; h.close(); return {}; } });
    const t = grid({ settings: { parts: { 'filter.set': part } } });
    expect(t.feature.openFilter('city')).toBe(true);
    expect((got as { values: unknown[] }).values).toHaveLength(5);
  });
});
