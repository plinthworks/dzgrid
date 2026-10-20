// The pagination footer (step 17; docs/behaviors/pagination-footer.md, server-pagination.md,
// selection.md, parts.md; plan docs/phase-3-steps/step17-pagination-blueprint.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { pagination, PAGINATION_KEYS } from '../src/pagination.js';
import { definePart, type SlotContext } from '../src/part.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { EN } from '../src/locales/en.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../src/locales/ar-pagination.js';
import { cleanup, pmake, BUNDLES } from './support-pagination.js';

afterEach(cleanup);

const isOff = (b: HTMLElement | null) => b?.getAttribute('aria-disabled') === 'true';

describe('the footer and its landmark', () => {
  it('is the last child of the grid, outside role=grid, with a named nav holding the pager', () => {
    const t = pmake();
    const root = t.host.querySelector('.dzg')!;
    expect(root.lastElementChild).toBe(t.footer());
    expect(t.footer()!.closest('[role=grid]')).toBeNull();
    expect(t.nav()!.getAttribute('aria-label')).toBe('Pagination, Data grid');
    expect(t.nav()!.contains(t.btn('next'))).toBe(true);
    // The count and the selection strip come before the nav (the inline start).
    const kids = [...t.footer()!.children];
    expect(kids.indexOf(t.nav()!)).toBe(kids.length - 1);
    expect(kids.findIndex((k) => k.contains(t.countEl()))).toBeLessThan(kids.indexOf(t.nav()!));
  });

  it('names the nav after the grid’s own label, so two grids have two landmarks', () => {
    const a = pmake({ settings: { label: 'Patients' } });
    const b = pmake({ settings: { label: 'Rendez-vous' } });
    expect(a.nav()!.getAttribute('aria-label')).toBe('Pagination, Patients');
    expect(b.nav()!.getAttribute('aria-label')).toBe('Pagination, Rendez-vous');
  });

  it('throws at setup, naming each missing text', () => {
    expect(() => pmake({ settings: { messages: EN } })).toThrow(/pagination: missing .*pager\.next/);
  });

  it('lists 16 keys, and every bundle has them all', () => {
    expect(PAGINATION_KEYS).toHaveLength(16);
    for (const b of [EN_PAGINATION, FR_PAGINATION, AR_PAGINATION]) expect(Object.keys(b.text).sort()).toEqual([...PAGINATION_KEYS].sort());
  });

  it('is dormant on rows that are not paged, and says so (invalid-page, features.pagination)', () => {
    const t = pmake({ mode: 'off' });
    expect(t.footer()).toBeNull();
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'invalid-page', severity: 'warning', path: 'features.pagination' }));
  });

  it('paging without pagination() is missing-feature (settings.pagination), in the browser and on a server; none unpaged', () => {
    const c = pmake({ features: [] });
    expect(c.problems()).toContainEqual({ code: 'missing-feature', severity: 'warning', path: 'settings.pagination', detail: 'pagination' });
    const s = pmake({ mode: 'offset', features: [] });
    expect(s.problems()).toContainEqual({ code: 'missing-feature', severity: 'warning', path: 'settings.pagination', detail: 'pagination' });
    const off = pmake({ mode: 'off', features: [] });
    expect(off.problems().filter((p) => p.code === 'missing-feature')).toEqual([]);
    const ok = pmake();
    expect(ok.problems().filter((p) => p.code === 'missing-feature' || p.code === 'invalid-page')).toEqual([]);
  });

  it('leaves aria-rowcount alone: the page’s rows and the header row', () => {
    const t = pmake();
    expect(t.host.querySelector('[role=grid]')!.getAttribute('aria-rowcount')).toBe('11');
  });

  it('stops the overlay above it: the layout reads --dzg-footer-size, the feature sets it', () => {
    expect(LAYOUT_CSS).toMatch(/\.dzg-overlay\) \{[^}]*inset-block-end: var\(--dzg-footer-size, 0px\)/);
    const t = pmake();
    expect((t.host.querySelector('.dzg') as HTMLElement).style.getPropertyValue('--dzg-footer-size')).toBe('0px');
  });
});

describe('the pager in the browser', () => {
  it('first and previous are aria-disabled on the first page, never disabled; the page text', () => {
    const t = pmake();
    expect(isOff(t.btn('first'))).toBe(true);
    expect(isOff(t.btn('prev'))).toBe(true);
    expect(isOff(t.btn('next'))).toBe(false);
    expect(isOff(t.btn('last'))).toBe(false);
    for (const b of t.footer()!.querySelectorAll('button')) expect(b.hasAttribute('disabled')).toBe(false);
    expect(t.pageText()).toBe('Page 1 of 3');
    expect(t.btn('next')!.getAttribute('aria-label')).toBe('Next page');
    expect(t.btn('first')!.getAttribute('aria-label')).toBe('First page');
  });

  it('next moves one page, keeps the same nodes and the focus', () => {
    const t = pmake();
    const nodes = [...t.footer()!.querySelectorAll('button, select')];
    t.click(t.btn('next'));
    expect(t.g.kernel.rows.page.index).toBe(1);
    expect(t.pageText()).toBe('Page 2 of 3');
    expect(t.ids()[0]).toBe('r10');
    expect([...t.footer()!.querySelectorAll('button, select')]).toEqual(nodes);
    expect(document.activeElement).toBe(t.btn('next'));
  });

  it('a disabled button does nothing and asks nothing', () => {
    const t = pmake();
    t.click(t.btn('prev'));
    t.click(t.btn('first'));
    expect(t.pageEvents()).toEqual([]);
    t.click(t.btn('last'));
    expect(t.g.kernel.rows.page.index).toBe(2);
    const n = t.pageEvents().length;
    t.click(t.btn('next'));
    t.click(t.btn('last'));
    expect(t.pageEvents().length).toBe(n);
    expect(isOff(t.btn('next'))).toBe(true);
    expect(isOff(t.btn('last'))).toBe(true);
    // Focus stays on the button that just became unavailable.
    expect(document.activeElement).toBe(t.btn('last'));
  });

  it('first and previous go back', () => {
    const t = pmake();
    t.click(t.btn('last'));
    t.click(t.btn('prev'));
    expect(t.g.kernel.rows.page.index).toBe(1);
    t.click(t.btn('first'));
    expect(t.g.kernel.rows.page.index).toBe(0);
  });

  it('the size select: the model’s sizes plus the current one, a change sends page.size, focus kept', () => {
    const t = pmake();
    const s = t.sizeSelect()!;
    expect([...s.options].map((o) => o.value)).toEqual(['10', '25', '50', '100']);
    expect(s.value).toBe('10');
    expect(s.closest('label')!.textContent).toContain('Rows per page');
    t.click(t.btn('last'));
    s.focus();
    s.value = '25';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.g.kernel.rows.page.size).toBe(25);
    expect(t.g.kernel.rows.page.index).toBe(0);
    expect(document.activeElement).toBe(s);
    expect(t.sizeSelect()).toBe(s);
  });

  it('hides the size select with fewer than two sizes', () => {
    const t = pmake({ pageSizes: [10] });
    expect(t.sizeSelect()!.closest('label')!.hidden).toBe(true);
  });

  it('the count: range, filtered, none', () => {
    const t = pmake();
    expect(t.countText()).toBe('1 to 10 of 30');
    t.click(t.btn('last'));
    expect(t.countText()).toBe('21 to 30 of 30');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'user');
    expect(t.countText()).toBe('1 to 10 of 10 (30 in all)');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'zzz' } }, 'user');
    expect(t.countText()).toBe('0 rows');
    expect(t.pageText()).toBe('Page 1 of 1');
  });

  it('French and Arabic texts, digits as the grid’s numerals', () => {
    const fr = pmake({ lang: 'fr' });
    expect(fr.countText()).toBe('1 à 10 sur 30');
    expect(fr.pageText()).toBe('Page 1 sur 3');
    expect(fr.btn('next')!.getAttribute('aria-label')).toBe('Page suivante');
    const ar = pmake({ lang: 'ar' });
    expect(ar.countText()).toBe('1 إلى 10 من 30');
    expect(ar.nav()!.getAttribute('aria-label')).toMatch(/^ترقيم الصفحات، /);
    const arab = pmake({ lang: 'ar', settings: { locale: 'ar-EG', numerals: 'locale' } });
    expect(arab.countText()).toBe('١ إلى ١٠ من ٣٠');
    expect([...arab.sizeSelect()!.options].map((o) => o.textContent)).toEqual(['١٠', '٢٥', '٥٠', '١٠٠']);
  });
});

describe('the pager on a server', () => {
  it('offset with a total: next asks in the click, shows the page at once, the count says loading until the answer', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    expect(t.pageText()).toBe('Page 1 of 3');
    expect(isOff(t.btn('last'))).toBe(false);
    const before = t.f.calls.length;
    t.click(t.btn('next'));
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.f.calls.at(-1)!.req.page!.index).toBe(1);
    expect(t.pageText()).toBe('Page 2 of 3');
    expect(t.countText()).toBe('Loading…');
    expect(t.countEl()!.hasAttribute('data-loading')).toBe(true);
    t.answer(10, { total: 30 });
    expect(t.countText()).toBe('11 to 20 of 30');
    expect(t.countEl()!.hasAttribute('data-loading')).toBe(false);
  });

  it('offset with an unknown total: "Page 1", "1 to 10", last shown and never enabled', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { hasNext: true });
    expect(t.pageText()).toBe('Page 1');
    expect(t.countText()).toBe('1 to 10');
    expect(t.btn('last')).not.toBeNull();
    expect(isOff(t.btn('last'))).toBe(true);
    const n = t.f.calls.length;
    t.click(t.btn('last'));
    expect(t.f.calls.length).toBe(n);
  });

  it('cursor: no last button; a second next before the answer asks nothing', () => {
    const t = pmake({ mode: 'cursor' });
    t.answer(10, { hasNext: true, nextCursor: 'c1' });
    expect(t.btn('last')).toBeNull();
    expect(t.btn('first')).not.toBeNull();
    const n = t.f.calls.length;
    t.click(t.btn('next'));
    t.click(t.btn('next'));
    expect(t.f.calls.length).toBe(n + 1);
    expect(t.f.calls.at(-1)!.req.page!.cursor).toBe('c1');
    t.answer(10, { hasNext: false });
    expect(t.pageText()).toBe('Page 2');
    expect(isOff(t.btn('next'))).toBe(true);
  });

  it('first and previous on the first page ask the server nothing', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    const n = t.f.calls.length;
    const e = t.pageEvents().length;
    t.click(t.btn('first'));
    t.click(t.btn('prev'));
    expect(t.f.calls.length).toBe(n);
    expect(t.pageEvents().length).toBe(e);
  });

  it('a host part sees no range while the page loads, the range once it is in', () => {
    let seen: SlotContext['footer']['range'][] = [];
    const part = definePart('footer', { mount(_h, c) { seen.push(c.range); return { update: (n) => void seen.push(n.range) }; } });
    const t = pmake({ mode: 'offset', settings: { parts: { 'footer.count': part } } });
    t.answer(10, { total: 30 });
    seen = [];
    t.click(t.btn('next'));
    expect(seen.at(-1)).toBeNull();
    t.answer(10, { total: 30 });
    expect(seen.at(-1)).toEqual({ from: 11, to: 20 });
  });

  it('a failure: the count says the error, the pager stays usable', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    t.f.calls.at(-1)!.err(new Error('down'));
    expect(t.countText()).toBe('The data could not be loaded');
    expect(isOff(t.btn('prev'))).toBe(false);
    t.click(t.btn('prev'));
    expect(t.f.calls.at(-1)!.req.page!.index).toBe(0);
  });
});

describe('announce.page', () => {
  it('in the browser, once, at the click: page and range', () => {
    const t = pmake();
    t.click(t.btn('next'));
    expect(t.said().filter((s) => s.startsWith('Page'))).toEqual(['Page 2 of 3. 11 to 20 of 30']);
  });

  it('on a server, at the answer only; nothing on a failure', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    expect(t.said().filter((s) => s.startsWith('Page'))).toEqual([]);
    t.answer(10, { total: 30 });
    expect(t.said().filter((s) => s.startsWith('Page'))).toEqual(['Page 2 of 3. 11 to 20 of 30']);
    t.click(t.btn('next'));
    t.f.calls.at(-1)!.err(new Error('down'));
    expect(t.said().filter((s) => s.startsWith('Page'))).toHaveLength(1);
  });

  it('a request replaced by a newer one: one sentence, after the last answer', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    t.click(t.btn('next'));
    const first = t.f.calls.at(-1)!;
    t.click(t.btn('next'));
    first.ok({ rows: [], total: 30 });
    t.answer(10, { total: 30 });
    expect(t.said().filter((s) => s.startsWith('Page'))).toEqual(['Page 3 of 3. 21 to 30 of 30']);
  });

  it('unknown total: "Page 2. 11 to 20"', () => {
    const t = pmake({ mode: 'cursor' });
    t.answer(10, { hasNext: true, nextCursor: 'c1' });
    t.click(t.btn('next'));
    t.answer(10, { hasNext: true, nextCursor: 'c2' });
    expect(t.said().filter((s) => s.startsWith('Page'))).toEqual(['Page 2. 11 to 20']);
  });

  it('the size select says the new page; a host’s page.go and a filter back to page 1 say nothing of the page', () => {
    const t = pmake();
    const s = t.sizeSelect()!;
    s.value = '25';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.said().filter((x) => x.startsWith('Page'))).toEqual(['Page 1 of 2. 1 to 25 of 30']);
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    expect(t.said().filter((x) => x.startsWith('Page'))).toHaveLength(1);
  });

  it('French and Arabic', () => {
    const fr = pmake({ lang: 'fr' });
    fr.click(fr.btn('next'));
    expect(fr.said()).toContain('Page 2 sur 3. 11 à 20 sur 30');
    const ar = pmake({ lang: 'ar' });
    ar.click(ar.btn('next'));
    expect(ar.said()).toContain('الصفحة 2 من 3. 11 إلى 20 من 30');
  });
});

describe('a page change', () => {
  it('scrolls the rows back to the top; a refresh keeps the scroll', () => {
    // 100 rows by 25: the next page is as tall, so nothing but the feature brings the scroll back.
    const t = pmake({ pageSize: 25, rows: Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i })) });
    (t.g as unknown as { scroll: { scrollTo(l: number): void } }).scroll.scrollTo(200);
    expect(t.box.scrollTop).toBeGreaterThan(0);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.box.scrollTop).toBeGreaterThan(0);
    t.click(t.btn('next'));
    expect(t.box.scrollTop).toBe(0);
  });
});

describe('the selection strip', () => {
  it('hidden while nothing is selected, or when selection is off', () => {
    expect(pmake().sel()!.hidden).toBe(true);
    const none = pmake({ selection: 'none' });
    expect(none.sel()?.hidden ?? true).toBe(true);
  });

  it('says the count and offers Clear; Select all only when the page is all ticked and more rows match', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    expect(t.sel()!.hidden).toBe(false);
    expect(t.selText()).toBe('1 row selected');
    expect(t.act('clear')!.hidden).toBe(false);
    expect(t.act('all')!.hidden).toBe(true);
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.selText()).toBe('10 rows selected');
    expect(t.act('all')!.hidden).toBe(false);
    expect(t.act('all')!.textContent).toBe('Select all 30 rows');
  });

  it('Select all selects every row of the query, then the focus goes to Clear; Clear gives it back to the grid', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    t.click(t.act('all'));
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.g.kernel.selectionScope).not.toBeNull();
    // Every row, 20 of them on other pages (the blueprint's rule: count > shown).
    expect(t.selText()).toBe('30 rows selected (some not shown)');
    expect(t.act('all')!.hidden).toBe(true);
    expect(document.activeElement).toBe(t.act('clear'));
    t.click(t.act('clear'));
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.g.kernel.selection.mode).toBe('include');
    expect(t.sel()!.hidden).toBe(true);
    expect(t.host.querySelector('[role=grid]')!.contains(document.activeElement)).toBe(true);
  });

  it('"(some not shown)" when selected rows are off the page', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.click(t.btn('next'));
    expect(t.selText()).toBe('1 row selected (some not shown)');
  });

  it('every matching row with an unknown count: "All matching rows selected"; no Select all without a known count', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { hasNext: true });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    expect(t.act('all')!.hidden).toBe(true);
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.selText()).toBe('All matching rows selected');
  });

  it('single mode: no Select all', () => {
    const t = pmake({ selection: 'single' });
    t.g.kernel.dispatch({ type: 'selection.only', row: t.key('r0') }, 'user');
    expect(t.selText()).toBe('1 row selected');
    expect(t.act('all')!.hidden).toBe(true);
  });
});

describe('the header box on browser pages (owner Q1)', () => {
  const box = (t: ReturnType<typeof pmake>) => t.host.querySelector<HTMLElement>('.dzg-header .dzg-check')!;
  it('ticking adds the page’s rows; unticking removes them only, with one announcement', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.click(t.btn('next'));
    box(t).click();
    expect(t.g.kernel.selection.keys.size).toBe(11);
    expect(t.g.kernel.headerState).toBe('all');
    const before = t.said().length;
    box(t).click();
    expect(t.g.kernel.selection.mode).toBe('include');
    expect([...t.g.kernel.selection.keys].map(String)).toEqual([String(t.g.kernel.selection.keys.values().next().value)]);
    expect(t.g.kernel.selection.keys.size).toBe(1);
    expect(t.said().slice(before)).toEqual(['1 row selected']);
  });

  it('Ctrl+A follows the box: the page added', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.click(t.btn('next'));
    const vp = t.host.querySelector<HTMLElement>('.dzg-viewport')!;
    vp.focus();
    vp.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.selection.keys.size).toBe(11);
  });

  it('unticking a fully ticked page over an all-pages selection excludes that page only', () => {
    const t = pmake();
    t.g.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    box(t).click();
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.g.kernel.selection.keys.size).toBe(10);
    expect(t.selText()).toBe('20 rows selected (some not shown)');
  });

  it('server pages are unchanged: the box selects the query', () => {
    const t = pmake({ mode: 'offset' });
    t.answer(10, { total: 30 });
    box(t).click();
    expect(t.g.kernel.selection.mode).toBe('exclude');
    expect(t.g.kernel.selectionScope).not.toBeNull();
  });
});

describe('parts', () => {
  const recorder = () => {
    const log: string[] = [];
    let last: SlotContext['footer'] | null = null;
    const part = definePart('footer', {
      mount(host, c) {
        log.push('mount');
        last = c;
        host.textContent = `p${c.page.index}`;
        return { update(n) { log.push('update'); last = n; host.textContent = `p${n.page.index}`; }, destroy() { log.push('destroy'); } };
      },
    });
    return { log, part, ctx: () => last! };
  };

  it('a host’s part replaces a default by name, with the footer context', () => {
    const r = recorder();
    const t = pmake({ settings: { parts: { 'footer.count': r.part } } });
    expect(t.countEl()).toBeNull();
    expect(t.footer()!.textContent).toContain('p0');
    const c = r.ctx();
    expect(c.page.index).toBe(0);
    expect(c.counts).toEqual({ total: 30, filtered: 30, displayed: 10 });
    expect(c.range).toEqual({ from: 1, to: 10 });
    expect(c.selection).toEqual({ count: 0, shown: 0, all: false, canSelectAll: false, mode: 'multi' });
    const next = c.next;
    t.click(t.btn('next'));
    expect(r.log).toEqual(['mount', 'update']);
    expect(r.ctx().next).toBe(next);
    r.ctx().go(2);
    expect(t.g.kernel.rows.page.index).toBe(2);
    r.ctx().prev();
    expect(t.g.kernel.rows.page.index).toBe(1);
    r.ctx().setSize(25);
    expect(t.g.kernel.rows.page.size).toBe(25);
  });

  it('update runs only when the context changed', () => {
    const r = recorder();
    const t = pmake({ settings: { parts: { 'footer.count': r.part } } });
    t.g.api.refresh();
    t.g.api.refresh();
    expect(r.log).toEqual(['mount']);
  });

  it('a pager part of the host stays in the named nav', () => {
    const r = recorder();
    const t = pmake({ settings: { parts: { 'footer.pager': r.part } } });
    expect(t.btn('next')).toBeNull();
    expect(t.nav()!.textContent).toBe('p0');
    expect(t.nav()!.getAttribute('aria-label')).toBe('Pagination, Data grid');
  });

  it('a part that throws is destroyed and reported; the other parts draw', () => {
    const err = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = err;
    try {
      const bad = definePart('footer', { mount() { throw new Error('boom'); } });
      const t = pmake({ settings: { parts: { 'footer.pager': bad } } });
      expect(err).toHaveBeenCalled();
      expect(t.nav()).not.toBeNull();
      expect(t.countText()).toBe('1 to 10 of 30');
    } finally {
      delete (window as unknown as { reportError?: unknown }).reportError;
    }
  });

  it('mounts equal destroys at the end; nothing left in the grid’s root', () => {
    const r = recorder();
    const t = pmake({ settings: { parts: { 'footer.count': r.part } } });
    t.click(t.btn('next'));
    t.g.destroy();
    expect(r.log.filter((x) => x === 'mount').length).toBe(r.log.filter((x) => x === 'destroy').length);
    expect(t.host.querySelector('.dzg-footer')).toBeNull();
  });

  it('a host’s own part (no dot) may be listed; a name that is not a footer part is told', () => {
    const r = recorder();
    const t = pmake({ features: [pagination({ footer: ['summary', 'footer.pager', 'nope'] })], settings: { parts: { summary: r.part } } });
    expect(r.log).toEqual(['mount']);
    expect(t.countEl()).toBeNull();
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'unknown-part', path: 'pagination.footer[2]', detail: 'nope' }));
  });

  it('a new parts record remounts live', () => {
    const r = recorder();
    const t = pmake();
    t.g.update({ parts: { 'footer.count': r.part } });
    expect(r.log).toEqual(['mount']);
    expect(t.countEl()).toBeNull();
    t.g.update({ parts: {} });
    expect(r.log).toEqual(['mount', 'destroy']);
    expect(t.countText()).toBe('1 to 10 of 30');
  });

  it('a language change rewrites the texts', () => {
    const t = pmake();
    t.g.update({ messages: BUNDLES.fr, locale: 'fr-FR' });
    expect(t.countText()).toBe('1 à 10 sur 30');
    expect(t.btn('next')!.getAttribute('aria-label')).toBe('Page suivante');
  });
});
