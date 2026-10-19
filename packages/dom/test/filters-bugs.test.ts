// Bugs of the floating row (step 12) found by the random walk (filters-walk.test.ts) and the
// reviews, each fixed; these were it.fails repros before the fix.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { definePart } from '../src/part.js';
import { filters } from '../src/filters.js';
import { slots } from '../src/slots.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { cleanup, make, MESSAGES } from './support-filters.js';

afterEach(cleanup);
const FRM = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } };

describe('step 12 review: fixed bugs', () => {
  it('A: a typed edit ending on the filter in force; a later host change still reaches the box', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    vi.advanceTimersByTime(150);
    t.type('name', 'b');
    t.type('name', 'bo');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.input('name')!.value).toBe('');
  });
  it('A2: typed then erased on an unfiltered column, host sets a filter: shown', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'x');
    t.type('name', '');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'zz' } }, 'api');
    expect(t.input('name')!.value).toBe('zz');
  });
  it('B: unreadable text pending, the host clears every filter: the old filter does not come back', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', '4');
    vi.advanceTimersByTime(150);
    t.type('n', 'abc');
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter).toEqual({});
  });
  it('B2: unreadable text pending, overlay clear-all by keyboard (focus stays in box): no revival', () => {
    vi.useFakeTimers();
    let clear: (() => void) | null = null;
    const overlay = definePart('overlay', { mount: (_h, c) => { clear = c.clearFilters; return { update: (n) => { clear = n.clearFilters; } }; } });
    const t = make({ features: [slots(), filters({ floating: true })], settings: { parts: { overlay } } });
    // 999 matches no row: the overlay (no-match) is there with its clear-all.
    t.type('n', '999');
    vi.advanceTimersByTime(150);
    t.type('n', 'abc');
    clear!();
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter).toEqual({});
  });
  it('C: locale switch rewrites a shown number in the new locale', () => {
    vi.useFakeTimers();
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 1.5 } }, 'api');
    expect(t.input('n')!.value).toBe('1.5');
    t.g.update({ locale: 'fr-FR', messages: FRM } as never);
    expect(t.input('n')!.value).toBe('1,5');
  });
  it('C2: fr "1,500" (1.5), switch to en: the box says "1.5"; touching it keeps 1.5', () => {
    vi.useFakeTimers();
    const t = make({ settings: { locale: 'fr-FR', messages: FRM } });
    t.type('n', '1,500');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 1.5 });
    t.g.update({ locale: 'en-US', messages: MESSAGES } as never);
    expect(t.input('n')!.value).toBe('1.5');
    // The user touches the box (a character typed and erased): what it shows, read in English.
    const v = t.input('n')!.value;
    t.type('n', v + '0');
    t.type('n', v);
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 1.5 });
  });
  it('D: a valid text pending across a locale switch, then Enter: read once, not both applied and marked', () => {
    vi.useFakeTimers();
    const t = make({ settings: { locale: 'fr-FR', messages: FRM } });
    t.type('n', '1,5');
    t.g.update({ locale: 'en-US', messages: MESSAGES } as never);
    t.key(t.input('n')!, 'Enter');
    const applied = t.g.kernel.query.filter['n'];
    const marked = t.input('n')!.getAttribute('aria-invalid') === 'true';
    // Either the text is read in the new language (refused, marked) or in the old (applied, not marked); not both.
    expect(!!applied && marked).toBe(false);
  });
  it('F: a column removed with an edit pending: no problem reported', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    t.g.update({ columns: [{ id: 'n', header: 'N', type: 'number' }] } as never);
    vi.advanceTimersByTime(150);
    expect(t.problems()).toEqual([]);
  });
  it('A3: the same text retyped over the filter in force; clear-all still empties the box', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    vi.advanceTimersByTime(150);
    t.type('name', 'bo');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    expect(t.input('name')!.value).toBe('');
  });
  it('C3: an unreadable text marked, then a locale switch: the box shows the filter in force, unmarked', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', 'abc');
    vi.advanceTimersByTime(150);
    expect(t.input('n')!.getAttribute('aria-invalid')).toBe('true');
    t.g.update({ locale: 'fr-FR', messages: FRM } as never);
    expect(t.input('n')!.value).toBe('');
    expect(t.input('n')!.hasAttribute('aria-invalid')).toBe(false);
  });
  it('E1: an edit pending, the host sets a filter the box cannot edit: the summary shows it, the edit is dropped', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', '4');
    const gt = { type: 'number', op: 'gt', value: 2 } as const;
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: gt }, 'api');
    expect(t.input('n')).toBeNull();
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toEqual(gt);
  });
  it('E2: an edit pending, the column turns from text to number: the edit is dropped', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    t.g.update({ columns: [{ id: 'name', header: 'Name', type: 'number' }, { id: 'n', header: 'N', type: 'number' }] } as never);
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    expect(t.problems()).toEqual([]);
  });
});

describe('step 12 review 2: composition and destroy', () => {
  it('6: Escape inside a composition stays in the box: not propagated, nothing applied, focus kept; Enter ignored', () => {
    vi.useFakeTimers();
    const t = make();
    const seen: string[] = [];
    t.host.addEventListener('keydown', (e) => seen.push(e.key));
    const i = t.input('name')!;
    t.cell('name').focus();
    t.press('Enter');
    expect(document.activeElement).toBe(i);
    t.type('name', 'bo');
    const esc = t.key(i, 'Escape', { isComposing: true });
    expect(seen).toEqual([]);
    expect(esc.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(i);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    t.key(i, 'Enter', { isComposing: true });
    expect(seen).toEqual(['Enter']);
    expect(t.g.kernel.query.filter['name']).toBeUndefined();
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bo' });
  });
  it('7: Enter or Escape inside a composition does not judge an unreadable number', () => {
    vi.useFakeTimers();
    const t = make();
    const said = vi.spyOn(t.live, 'announce');
    t.type('n', 'abc');
    t.key(t.input('n')!, 'Enter', { isComposing: true });
    t.key(t.input('n')!, 'Escape', { isComposing: true });
    expect(t.input('n')!.hasAttribute('aria-invalid')).toBe(false);
    expect(said).not.toHaveBeenCalled();
  });
  it('8: a blur after the grid is destroyed, an unreadable number in the box: nothing judged, nothing said', () => {
    vi.useFakeTimers();
    const t = make();
    const i = t.input('n')!;
    i.focus();
    t.type('n', 'abc');
    const said = vi.spyOn(t.live, 'announce');
    t.g.destroy();
    i.dispatchEvent(new FocusEvent('blur'));
    vi.advanceTimersByTime(1000);
    expect(i.hasAttribute('aria-invalid')).toBe(false);
    expect(said).not.toHaveBeenCalled();
  });
});
