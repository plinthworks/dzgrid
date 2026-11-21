// 1.15.0 — the owner's app's last rustine as an option (owner 2026-11-21, « ★ partout »; docs/behaviors/presentation-
// settings.md 49, parts.md « Keys in a header cell holding a control »): `sortMark: 'always'` keeps a column's sort mark
// shown unsorted too, and beside a header part makes it the grid's sort button. Expectations written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { FILTERS_CSS } from '../src/filters/styles.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

/** The owner's kind of header part: a search box in place of the title (it takes the focus). */
const searchPart = definePart('header', {
  mount(host, c) {
    const input = document.createElement('input');
    input.setAttribute('aria-label', `Search ${c.label}`);
    host.append(input);
    return { focus: () => (input.focus(), true) };
  },
});

const cols = (extra: object = {}): ColumnOrGroup<R>[] => [
  { id: 'name', header: 'Name', flex: 1, ui: { header: 'mine' }, filterButton: false, sortMark: 'always', ...extra },
  { id: 'n', header: 'N', type: 'number', flex: 1 },
];

function grid(o: { columns?: ColumnOrGroup<R>[]; part?: boolean; settings?: object } = {}) {
  const t = make({
    columns: o.columns ?? cols(),
    features: [slots(), filters()],
    settings: { ...(o.part === false ? {} : { parts: { mine: searchPart } }), ...o.settings },
  });
  const head = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
  const marks = (c: string) => head(c).querySelectorAll<HTMLElement>(':scope > .dzg-sort');
  const button = (c: string) => head(c).querySelector<HTMLButtonElement>(':scope > button.dzg-sort');
  return { ...t, head, marks, button };
}

describe('the default is unchanged (49: « no icon until sorted »)', () => {
  it('a header part without sortMark: no mark unsorted; sorted, the grid\'s decorative mark, no button', () => {
    const t = grid({ columns: cols({ sortMark: undefined }) });
    expect(t.marks('name')).toHaveLength(0);
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'api');
    expect(t.marks('name')).toHaveLength(1);
    expect(t.marks('name')[0]!.tagName).toBe('SPAN');
    expect(t.marks('name')[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(t.marks('n')).toHaveLength(0);
  });
});

describe('sortMark: \'always\' without a part (49)', () => {
  it('the mark shows unsorted (data-dir none) as the same button, out of the Tab order; the title\'s click sorts, the button\'s too', () => {
    const t = grid({ part: false, columns: [{ id: 'name', header: 'Name', sortMark: 'always' }, { id: 'n', header: 'N' }] });
    expect(t.marks('name')).toHaveLength(1);
    const m = t.button('name')!;
    expect(m.getAttribute('data-dir')).toBe('none');
    expect(m.getAttribute('aria-label')).toBe('Sort by Name');
    expect(m.tabIndex).toBe(-1);
    expect(t.marks('n')).toHaveLength(0);
    t.head('name').click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(t.button('name')!.getAttribute('data-dir')).toBe('asc');
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'desc' }]);
  });

  it('sortMark set live, then taken off: the button comes, then the decorative mark once sorted, none unsorted', () => {
    const t = grid({ part: false, columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N' }] });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'api');
    expect(t.marks('name')[0]!.tagName).toBe('SPAN');
    t.g.update({ columns: [{ id: 'name', header: 'Name', sortMark: 'always' }, { id: 'n', header: 'N' }] });
    expect(t.marks('name')).toHaveLength(1);
    expect(t.button('name')!.getAttribute('data-dir')).toBe('asc');
    t.g.update({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N' }] });
    expect(t.marks('name')).toHaveLength(1);
    expect(t.marks('name')[0]!.tagName).toBe('SPAN');
    expect(t.marks('name')[0]!.getAttribute('aria-hidden')).toBe('true');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'api');
    expect(t.marks('name')).toHaveLength(0);
  });

  it('a column that does not sort: no mark', () => {
    const t = grid({ part: false, columns: [{ id: 'name', header: 'Name', sortMark: 'always', sortable: false }, { id: 'n', header: 'N' }] });
    expect(t.marks('name')).toHaveLength(0);
  });
});

describe('sortMark: \'always\' beside a header part: the sort button (49)', () => {
  it('one mark, a button after the part, named « Sort by Name », out of the Tab order, unsorted', () => {
    const t = grid();
    expect(t.marks('name')).toHaveLength(1);
    const b = t.button('name')!;
    expect(b).not.toBeNull();
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Sort by Name');
    expect(b.hasAttribute('aria-hidden')).toBe(false);
    expect(b.tabIndex).toBe(-1);
    expect(b.getAttribute('data-dir')).toBe('none');
    // After the part's label, in the DOM (the header's logical end, either direction).
    const label = t.head('name').querySelector('.dzg-hlabel')!;
    expect(label.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The state is the header's, not the button's.
    expect(t.head('name').hasAttribute('aria-sort')).toBe(false);
    expect(b.hasAttribute('aria-pressed')).toBe(false);
  });

  it('a click sorts ascending, descending, then none, as a title\'s click; aria-sort on the header; the button stays', () => {
    const t = grid();
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(t.head('name').getAttribute('aria-sort')).toBe('ascending');
    expect(t.button('name')!.getAttribute('data-dir')).toBe('asc');
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(t.head('name').getAttribute('aria-sort')).toBe('descending');
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([]);
    expect(t.head('name').hasAttribute('aria-sort')).toBe(false);
    expect(t.marks('name')).toHaveLength(1);
    expect(t.button('name')!.getAttribute('data-dir')).toBe('none');
  });

  it('Shift+click adds to the sort; the precedence shows in it and in the header\'s name', () => {
    const t = grid({ settings: { multiSort: true } });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    t.button('name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }, { column: 'name', dir: 'asc' }]);
    expect(t.button('name')!.textContent).toBe('2');
    expect(t.head('name').getAttribute('aria-label')).toContain('Sort 2');
  });

  it('a click in the part never sorts', () => {
    const t = grid();
    t.head('name').querySelector('input')!.click();
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('keyboard: Enter enters the part, the button joins the Tab order; a key on it is left to it; Escape back; out again', () => {
    const t = grid();
    const head = t.head('name');
    head.focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name' } }, 'user');
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(head.querySelector('input'));
    expect(t.g.kernel.query.sort).toEqual([]);
    const b = t.button('name')!;
    expect(b.tabIndex).toBe(0);
    // Tab moves the browser's focus to it; Enter there is the button's own (its click), never a second sort by the grid.
    b.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    b.dispatchEvent(enter);
    expect(t.g.kernel.query.sort).toEqual([]);
    b.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(document.activeElement).toBe(t.button('name'));
    t.button('name')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(head);
    expect(t.button('name')!.tabIndex).toBe(-1);
  });

  it('Shift+Enter on a part\'s header adds to the sort (the keyboard way; Firefox keeps Shift out of a button\'s key click)', () => {
    const t = grid({ settings: { multiSort: true } });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    const head = t.head('name');
    head.focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'name' } }, 'user');
    head.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }, { column: 'name', dir: 'asc' }]);
    expect(document.activeElement).toBe(head);
  });

  it('its name in the grid\'s language; a host bundle without the key: the column\'s title', () => {
    const fr = grid({ settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } });
    expect(fr.button('name')!.getAttribute('aria-label')).toBe('Trier par Name');
    cleanup();
    const { ['header.sortButton']: _gone, ...text } = EN.text as Record<string, unknown>;
    const bare = grid({ settings: { messages: { locale: 'en', text: { ...text, ...EN_FILTERS.text } } } });
    expect(bare.button('name')!.getAttribute('aria-label')).toBe('Name');
  });

  it('the three base bundles carry the name', () => {
    expect(EN.text['header.sortButton']).toBe('Sort by {column}');
    expect(FR.text['header.sortButton']).toBe('Trier par {column}');
    expect(AR.text['header.sortButton']).toBe('الترتيب حسب {column}');
  });

  it('the part gone: the button stays, the only mark, and sorts on a click', () => {
    const t = grid();
    t.g.update({ parts: {} });
    expect(t.marks('name')).toHaveLength(1);
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});

describe('a narrow header keeps the button (49, 43)', () => {
  it('only the decorative unsorted mark gives way under 6.5rem', () => {
    expect(FILTERS_CSS).toContain(':where(.dzg-hcell>span.dzg-sort[data-dir=none]){position:absolute;opacity:0}');
  });
});
