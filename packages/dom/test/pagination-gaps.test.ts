// Gaps left by the step 17 tests (docs/behaviors/pagination-footer.md, selection.md): each case
// kills a mutant the suite let through, or shows a behaviour the sheet promises and the
// code did not keep (the review's bugs, fixed after step 17).
import { describe, it, expect, afterEach } from 'vitest';
import { filters } from '../src/filters.js';
import { quickSearch } from '../src/search.js';
import { PAGINATION_CSS } from '../src/pagination/styles.js';
import { pagination } from '../src/pagination.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { cleanup, pmake, ROWS, BUNDLES } from './support-pagination.js';

afterEach(cleanup);
const box = (t: ReturnType<typeof pmake>) => t.host.querySelector<HTMLElement>('.dzg-header .dzg-check')!.click();
const pageSaid = (t: ReturnType<typeof pmake>) => t.said().filter((s) => s.startsWith('Page'));

describe('the selection strip, everything-except', () => {
  it('every selected row on the page shown: no "(some not shown)", though the selection is everything-except', () => {
    const t = pmake({ rows: ROWS.slice(0, 12) });
    box(t);
    t.click(t.act('all'));
    t.click(t.btn('next'));
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r10') }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r11') }, 'user');
    t.click(t.btn('prev'));
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.selText()).toBe('10 rows selected');
  });

  it('hidden when the host turns selection off over a selection', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.g.update({ selection: { mode: 'none' } } as never);
    expect(t.sel()!.hidden).toBe(true);
  });
});

describe('the size select', () => {
  it('a paint that changes nothing keeps the option nodes', () => {
    const t = pmake({ pageSizes: [5, 10, 25] });
    const before = [...t.sizeSelect()!.options];
    t.click(t.btn('next'));
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r10') }, 'user');
    expect([...t.sizeSelect()!.options]).toEqual(before);
    expect([...t.sizeSelect()!.options].every((o, i) => o === before[i])).toBe(true);
  });

  it('follows a host’s page.size', () => {
    const t = pmake({ pageSizes: [5, 10, 25] });
    t.g.kernel.dispatch({ type: 'page.size', size: 25 }, 'api');
    expect(t.sizeSelect()!.value).toBe('25');
  });
});

describe('the header box without pages', () => {
  it('ticked, it clears everything, rows hidden by a filter included (selection.md)', () => {
    const t = pmake({ mode: 'off', features: [pagination()] });
    const k = t.g.kernel;
    k.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    k.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    // Every shown row ticked one by one: r0, hidden by the filter, stays in the selection.
    for (const id of t.ids()) k.dispatch({ type: 'selection.toggle', row: t.key(id) }, 'user');
    expect(k.headerState).toBe('all');
    expect(k.selection.keys.size).toBe(21);
    box(t);
    expect(k.selection.keys.size).toBe(0);
  });
});

describe('bugs found by the review (failed before the fix)', () => {
  it('no "Select all N rows" when every row is already selected, page by page (sheet: "the selection is not already every row")', () => {
    const t = pmake({ rows: ROWS.slice(0, 15) });
    box(t);
    t.click(t.btn('next'));
    box(t);
    expect(t.selText()).toBe('15 rows selected (some not shown)');
    expect(t.act('all')!.hidden).toBe(true);
  });

  it('a filter that replaces the user’s pending page keeps its own sentence: no "Page 1 …" for the filter’s answer', () => {
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_FILTERS.text } };
    const t = pmake({ mode: 'offset', features: [pagination(), filters()], settings: { messages } as never });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'x' } }, 'user');
    t.answer(10, { total: 12 });
    expect(t.said()).toContain('Filtered. 12 rows');
    expect(pageSaid(t)).toEqual([]);
  });

  it('a host’s page.go that replaces the user’s pending page says nothing (sheet: nothing for a host’s page.go)', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    t.g.kernel.dispatch({ type: 'page.go', index: 2 }, 'api');
    t.answer(10, { total: 30 });
    expect(pageSaid(t)).toEqual([]);
  });
});

describe('review corrections (step 17)', () => {
  it('R1: the [hidden] rule comes after the button display rule (equal zero specificity: the later wins)', () => {
    const rules = PAGINATION_CSS.split('}');
    const hidden = rules.findIndex((r) => r.includes('[hidden]') && r.includes('display:none'));
    const shown = rules.findIndex((r) => r.startsWith(':where(.dzg-pbtn){display:'));
    expect(shown).toBeGreaterThanOrEqual(0);
    expect(hidden).toBeGreaterThan(shown);
  });

  it('Q4: in a tied all, a partly ticked page box re-ticks that page only; other pages keep their exclusions', () => {
    const t = pmake();
    const k = t.g.kernel;
    box(t);
    t.click(t.act('all'));
    const r1 = t.key('r1');
    k.dispatch({ type: 'selection.toggle', row: r1 }, 'user');
    t.click(t.btn('next'));
    k.dispatch({ type: 'selection.toggle', row: t.key('r12') }, 'user');
    k.dispatch({ type: 'selection.toggle', row: t.key('r13') }, 'user');
    expect(k.headerState).toBe('some');
    box(t);
    expect(k.selection.mode).toBe('exclude');
    expect([...k.selection.keys]).toEqual([r1]);
    expect(k.selectionScope).not.toBeNull();
    expect(k.headerState).toBe('all');
    t.click(t.btn('prev'));
    expect(k.headerState).toBe('some');
    expect(t.selText()).toBe('29 rows selected (some not shown)');
  });

  it('Q4: Ctrl+A over the same selection still re-ticks every row', () => {
    const t = pmake();
    const k = t.g.kernel;
    box(t);
    t.click(t.act('all'));
    k.dispatch({ type: 'selection.toggle', row: t.key('r1') }, 'user');
    t.click(t.btn('next'));
    k.dispatch({ type: 'selection.toggle', row: t.key('r12') }, 'user');
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(k.selection.mode).toBe('exclude');
    expect(k.selection.keys.size).toBe(0);
  });

  it('Q4: a page with every row unticked in a tied all: the box re-ticks that page only', () => {
    const t = pmake({ rows: ROWS.slice(0, 12) });
    const k = t.g.kernel;
    box(t);
    t.click(t.act('all'));
    k.dispatch({ type: 'selection.toggle', row: t.key('r3') }, 'user');
    t.click(t.btn('next'));
    box(t);
    expect(k.headerState).toBe('none');
    box(t);
    expect(k.selection.mode).toBe('exclude');
    expect(k.selection.keys.size).toBe(1);
    expect(k.headerState).toBe('all');
  });

  it('R2: no "Select all N rows" once every filtered row is ticked page by page, filter on', () => {
    const t = pmake({ features: [pagination(), filters()], settings: { messages: { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_FILTERS.text } } } as never });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    box(t);
    t.click(t.btn('next'));
    box(t);
    // 20 rows match, all ticked; r0 (hidden by the filter) is still selected besides.
    expect(t.act('all')!.hidden).toBe(true);
  });

  it('R2: still offered while one matching row is unticked', () => {
    const t = pmake({ rows: ROWS.slice(0, 15) });
    box(t);
    t.click(t.btn('next'));
    box(t);
    expect(t.act('all')!.hidden).toBe(true);
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r11') }, 'user');
    t.click(t.btn('prev'));
    expect(t.selText()).toBe('14 rows selected (some not shown)');
    expect(t.act('all')!.hidden).toBe(false);
  });

  it('settled: a user page size that replaces a pending filter says the page, not the filter', () => {
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_FILTERS.text } };
    const t = pmake({ mode: 'offset', pageSizes: [10, 25], features: [pagination(), filters()], settings: { messages } as never });
    t.answer(10, { total: 30 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'x' } }, 'user');
    // Back on page 1, total unknown: the size is what the user can change.
    const s = t.sizeSelect()!;
    s.value = '25';
    s.dispatchEvent(new Event('change'));
    t.answer(25, { total: 30 });
    expect(t.said().filter((s) => s.startsWith('Filtered'))).toEqual([]);
    expect(pageSaid(t)).toHaveLength(1);
  });

  it('settled: a user page size that replaces a pending search says the page, not the count', () => {
    const t = pmake({ mode: 'offset', pageSizes: [10, 25], features: [pagination(), quickSearch()] });
    t.answer(10, { total: 30 });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    // Back on page 1, total unknown: the size is what the user can change.
    const s = t.sizeSelect()!;
    s.value = '25';
    s.dispatchEvent(new Event('change'));
    t.answer(25, { total: 30 });
    expect(t.said().filter((s) => /^\d+ rows?$/.test(s))).toEqual([]);
    expect(pageSaid(t)).toHaveLength(1);
  });

  it('settled: a host filter that replaces a user’s pending filter says nothing', () => {
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_FILTERS.text } };
    const t = pmake({ mode: 'offset', features: [pagination(), filters()], settings: { messages } as never });
    t.answer(10, { total: 30 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'x' } }, 'user');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'y' } }, 'api');
    t.answer(10, { total: 12 });
    expect(t.said().filter((s) => s.startsWith('Filtered'))).toEqual([]);
  });

  it('settled: a page past the end that the server sends back to the last page is still said (the model’s own request)', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    t.answer(0, { total: 10 });
    t.answer(10, { total: 10 });
    expect(pageSaid(t)).toHaveLength(1);
  });
});
