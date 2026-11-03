// « Clear all filters » in the column menu and the cell menu (Phase 9, docs/behaviors/find.md 15; owner, decisions.md
// « Find in grid — owner answers (2026-11-03) »): shown only while a column filter or the quick search is active; does
// what `clearFilters()` does (every filter and the search emptied, the sort kept, one query command, as the user); its
// text optional in an application's own bundle (missing: no item). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { makeQuery } from '@dzgrid/core';
import { cleanup, mmake, MMSG } from './support-column-menu.js';
import { cmake, CMSG } from './support-context-menu.js';

afterEach(() => cleanup());

const FILTER = { n: { kind: 'number', op: 'gt', value: 5 } } as never; // a number filter, typed loosely: the test names its fields by hand
const filtered = (k: { dispatch(c: never, s: never): unknown }) => k.dispatch({ type: 'query.set', query: makeQuery({ filter: FILTER, quick: 'a', sort: [{ column: 'n', dir: 'desc' }] }) } as never, 'api' as never); // the whole query at once, as a restore would

describe('the column menu', () => {
  it('no filter, no search: no item; a column filter: the item, in French « Effacer tous les filtres »', () => {
    const t = mmake({ lang: 'fr', with: ['filters'] });
    t.open('name');
    expect(t.ids()).not.toContain('clearFilters');
    t.key('Escape');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { kind: 'number', op: 'gt', value: 5 } as never }, 'api'); // a number filter by hand
    t.open('name');
    expect(t.item('clearFilters')!.textContent).toBe('Effacer tous les filtres');
  });

  it('the quick search alone counts as a filter', () => {
    const t = mmake({ with: ['filters'] });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'api');
    t.open('s');
    expect(t.ids()).toContain('clearFilters');
  });

  it('chosen: every filter and the search emptied, the sort kept, one query.set as the user', () => {
    const t = mmake({ with: ['filters'] });
    filtered(t.g.kernel as never); // the kernel's dispatch, typed by the helper
    const sent: string[] = [];
    t.g.kernel.subscribe((e) => void (e.type === 'filterChanged' || e.type === 'quickChanged' ? sent.push(`${e.type}:${e.source}`) : 0));
    t.open('name');
    t.item('clearFilters')!.click();
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.g.kernel.query.quick).toBe('');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'desc' }]);
    expect(sent).toEqual(['filterChanged:user', 'quickChanged:user']);
  });

  it('a bundle without the text: no item, no throw', () => {
    const messages = { locale: 'en', text: { ...MMSG.en.text, 'menu.clearFilters': undefined } } as unknown as typeof MMSG.en; // a host's bundle made for 1.3.0, at run time
    const t = mmake({ messages, with: ['filters'] });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'api');
    t.open('name');
    expect(t.ids()).not.toContain('clearFilters');
    expect(t.ids()).toContain('hide');
  });
});

describe('the cell menu', () => {
  it('no filter: no item; a filter: the item, after the others, its own section; in Arabic', () => {
    const t = cmake({ lang: 'ar' });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.ids()).not.toContain('clearFilters');
    t.key('Escape');
    t.g.kernel.dispatch({ type: 'quick.set', text: '1' }, 'api');
    t.rclick(t.cell('r1', 'n')!);
    expect(t.entries().slice(-2)).toEqual(['|', 'clearFilters']);
    expect(t.item('clearFilters')!.textContent).toBe('مسح كل المرشحات');
  });

  it('chosen: as clearFilters(), the sort kept', () => {
    const t = cmake();
    filtered(t.g.kernel as never); // as above
    t.rclick(t.cell('r199', 'n')!); // n > 5, sorted down: r199 first
    t.item('clearFilters')!.click();
    expect([t.g.kernel.query.filter, t.g.kernel.query.quick, t.g.kernel.query.sort]).toEqual([{}, '', [{ column: 'n', dir: 'desc' }]]);
  });

  it('a bundle without the text: no item', () => {
    const messages = { locale: 'en', text: { ...CMSG.en.text, 'cmenu.clearFilters': undefined } } as unknown as typeof CMSG.en; // a host's 1.3.0 bundle, at run time
    const t = cmake({ messages });
    t.g.kernel.dispatch({ type: 'quick.set', text: '1' }, 'api');
    t.rclick(t.cell('r1', 'n')!);
    expect(t.ids()).not.toContain('clearFilters');
    expect(t.ids()).toContain('copy');
  });
});
