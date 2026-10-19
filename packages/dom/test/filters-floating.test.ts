// The floating filter row (step 12; docs/behaviors/filter-ui.md, filter-number.md, parts.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { textCodec, type FilterKind } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { filters, FILTER_KEYS } from '../src/filters.js';
import { spans } from '../src/spans.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { COLUMNS, cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
type FC = SlotContext['floating'];

describe('the row', () => {
  it('is there with filters({ floating: true }): a header row counted in aria-rowcount, its cells gridcells', () => {
    const t = make();
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2']);
    expect(t.vp.getAttribute('aria-rowcount')).toBe(String(30 + 2));
    expect(t.host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('3');
    expect(t.cell('name').getAttribute('role')).toBe('gridcell');
    expect(t.cell('name').dataset['level']).toBe('1');
  });

  it('is not there without the grid option or a column asking; is there when one column asks, hidden ones counted', () => {
    expect(make({ features: [filters()] }).hrows()).toHaveLength(1);
    cleanup();
    const t = make({ features: [filters()], columns: [{ id: 'name', header: 'Name' }, { id: 'n', type: 'number', filter: { floating: true } }] });
    expect(t.hrows()).toHaveLength(2);
    expect(t.input('n')).not.toBeNull();
    // The other column has an empty cell (the same columns in every header row).
    expect(t.cell('name').childNodes).toHaveLength(0);
    cleanup();
    const h = make({ features: [filters()], columns: [{ id: 'name' }, { id: 'n', type: 'number', hidden: true, filter: { floating: true } }] });
    expect(h.hrows()).toHaveLength(2);
  });

  it('counts the group rows too: aria-rowcount +2 with one band, rowindex in order', () => {
    const t = make({ features: [spans(), filters({ floating: true })], columns: [{ id: 'g', header: 'G', children: [{ id: 'name' }, { id: 'n', type: 'number' }] }] });
    expect(t.hrows().map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3']);
    expect(t.vp.getAttribute('aria-rowcount')).toBe(String(30 + 3));
    expect(t.cell('n').closest('[role=row]')!.getAttribute('aria-rowindex')).toBe('3');
  });

  it('leaves a column with filter: false or filter.floating: false empty', () => {
    const t = make({ columns: [{ id: 'name', filter: false }, { id: 'n', type: 'number', filter: { floating: false } }, { id: 'id' }] });
    expect(t.cell('name').childNodes).toHaveLength(0);
    expect(t.cell('n').childNodes).toHaveLength(0);
    expect(t.input('id')).not.toBeNull();
  });

  it('gives a text box: owner, label, no placeholder, no autocomplete, aria-readonly false on its cell', () => {
    const t = make();
    const i = t.input('name')!;
    expect(i.type).toBe('text');
    expect(i.dataset['dzgOwner']).toBe('filter-input');
    expect(i.getAttribute('aria-label')).toBe('Filter Name');
    expect(i.getAttribute('placeholder')).toBeNull();
    expect(i.getAttribute('autocomplete')).toBe('off');
    expect(i.getAttribute('spellcheck')).toBe('false');
    expect(t.cell('name').getAttribute('aria-readonly')).toBe('false');
    expect(t.input('n')!.getAttribute('inputmode')).toBe('decimal');
    expect(t.input('n')!.type).toBe('text');
    // A day column: the summary, empty while no filter.
    expect(t.input('d')).toBeNull();
    expect(t.cell('d').getAttribute('aria-readonly')).toBeNull();
  });

  it('takes a custom part’s controls out of the Tab order too', () => {
    const part = definePart('floating', { mount: (h) => { h.append(document.createElement('button'), document.createElement('select')); return {}; } });
    const t = make({ settings: { parts: { floating: part } } });
    expect([...t.cell('d').querySelectorAll<HTMLElement>('button, select')].map((e) => e.tabIndex)).toEqual([-1, -1]);
  });

  it('keeps one tab stop in the header: the controls are out of the Tab order', () => {
    const t = make();
    const tabbable = [...t.host.querySelectorAll<HTMLElement>('.dzg-header *')].filter((e) => e.tabIndex >= 0);
    expect(tabbable.length).toBeLessThanOrEqual(1);
    expect(t.input('name')!.tabIndex).toBe(-1);
  });
});

describe('typing', () => {
  it('applies once after the pause: five keystrokes, one filterChanged (150 ms in the browser)', () => {
    vi.useFakeTimers();
    const t = make();
    for (const s of ['a', 'an', 'ann', 'ann1', 'ann']) t.type('name', s);
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(149);
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(t.filterEvents()).toHaveLength(1);
    expect(t.g.kernel.query.filter).toEqual({ name: { type: 'text', op: 'contains', value: 'ann' } });
    expect(t.ids().every((id) => Number(id.slice(1)) % 3 === 0)).toBe(true);
  });

  it('takes its pause from the column, then filters(), else the default; 0 applies at once; a bad value is the default', () => {
    vi.useFakeTimers();
    const t = make({ features: [filters({ floating: true, debounceMs: 40 })], columns: [{ id: 'name', filter: { debounceMs: 10 } }, { id: 'n', type: 'number' }, { id: 'z', value: (r: R) => r.name, filter: { debounceMs: 0 } }, { id: 'y', value: (r: R) => r.name, filter: { debounceMs: -3 } }] });
    t.type('name', 'a');
    vi.advanceTimersByTime(10);
    expect(t.filterEvents()).toHaveLength(1);
    t.type('n', '3');
    vi.advanceTimersByTime(39);
    expect(t.filterEvents()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.filterEvents()).toHaveLength(2);
    t.type('z', 'b');
    expect(t.filterEvents()).toHaveLength(3);
    t.type('y', 'b');
    vi.advanceTimersByTime(39);
    expect(t.filterEvents()).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(t.filterEvents()).toHaveLength(4);
    cleanup();
    vi.useFakeTimers();
    const d = make({ features: [filters({ floating: true, debounceMs: Number.NaN })] });
    d.type('name', 'a');
    vi.advanceTimersByTime(149);
    expect(d.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(d.filterEvents()).toHaveLength(1);
  });

  it('gives the part its pause and where the filter runs', () => {
    const seen: FC[] = [];
    const spy = definePart('floating', { mount: (_h, c) => { seen.push(c); return { update: (n) => void seen.push(n) }; } });
    make({ columns: [{ id: 'd', type: 'day' }], settings: { parts: { 'floating.day': spy } } });
    expect(seen.at(-1)!.debounceMs).toBe(150);
    expect(seen.at(-1)!.where).toBe('client');
    expect(seen.at(-1)!.kind).toBe('day');
    expect(seen.at(-1)!.state).toBeNull();
  });

  it('applies at once on Enter and when the focus leaves the cell', () => {
    vi.useFakeTimers();
    const t = make();
    t.input('name')!.focus();
    t.type('name', 'ann');
    const e = t.key(t.input('name')!, 'Enter');
    expect(e.defaultPrevented).toBe(false);
    expect(t.filterEvents()).toHaveLength(1);
    expect(document.activeElement).toBe(t.input('name'));
    t.type('name', 'bob');
    t.cell('n').focus();
    expect(t.filterEvents()).toHaveLength(2);
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bob' });
    vi.advanceTimersByTime(500);
    expect(t.filterEvents()).toHaveLength(2);
  });

  it('Escape applies, keeps the filter and puts the focus back on the cell', () => {
    vi.useFakeTimers();
    const t = make();
    t.input('name')!.focus();
    t.type('name', 'ann');
    const e = t.key(t.input('name')!, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.cell('name'));
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'ann' });
    expect(t.input('name')!.value).toBe('ann');
  });

  it('removes the filter when the box is emptied; text is applied as typed', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', ' ann ');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: ' ann ' });
    t.type('name', '');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter).toEqual({});
  });

  it('keeps caseSensitive of a contains filter it edits', () => {
    vi.useFakeTimers();
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'A', caseSensitive: true } }, 'api');
    expect(t.input('name')!.value).toBe('A');
    t.type('name', 'An');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toEqual({ type: 'text', op: 'contains', value: 'An', caseSensitive: true });
  });

  it('ignores input while composing, applies at compositionend', () => {
    vi.useFakeTimers();
    const t = make();
    const i = t.input('name')!;
    i.value = 'an';
    i.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    vi.advanceTimersByTime(500);
    expect(t.filterEvents()).toHaveLength(0);
    i.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'an' });
  });
});

describe('numbers', () => {
  const num = (locale: 'fr' | 'ar', numerals?: 'latn' | 'locale') => make({
    columns: [{ id: 'n', header: 'N', type: 'number' }],
    settings: { messages: locale === 'fr' ? { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } : { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, locale: locale === 'fr' ? 'fr-FR' : 'ar-DZ', ...(numerals && { numerals }) },
  });

  it('reads French 1,5 as 1.5', () => {
    vi.useFakeTimers();
    const t = num('fr');
    t.type('n', '1,5');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toEqual({ type: 'number', op: 'equals', value: 1.5 });
  });

  it('reads Arabic-Indic digits and Latin digits in Arabic', () => {
    vi.useFakeTimers();
    const t = num('ar', 'locale');
    t.type('n', '\u0661\u066B\u0665');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 1.5 });
    t.type('n', '7');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 7 });
  });

  it('reads 12% as 0.12', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', '12%');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 0.12 });
  });

  it('abc: not applied, the previous filter stays, aria-invalid and one announcement', () => {
    vi.useFakeTimers();
    const t = make();
    const said = vi.spyOn(t.live, 'announce');
    t.type('n', '4');
    vi.advanceTimersByTime(150);
    expect(t.filterEvents()).toHaveLength(1);
    t.type('n', 'abc');
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
    vi.advanceTimersByTime(150);
    expect(t.filterEvents()).toHaveLength(1);
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: 4 });
    expect(t.input('n')!.getAttribute('aria-invalid')).toBe('true');
    expect(said.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/^Filtered/), EN_FILTERS.text['filter.invalid'].replace('{column}', 'N')]);
    // Enter on the same invalid text says nothing more.
    t.key(t.input('n')!, 'Enter');
    expect(said).toHaveBeenCalledTimes(2);
    // Typing again clears the mark.
    t.type('n', 'abcd');
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
  });

  it('a lone minus on the way to -5 is not flagged', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', '-');
    // Judged at the pause, not per keystroke: nothing marked or said yet.
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
    vi.advanceTimersByTime(50);
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
    t.type('n', '-5');
    vi.advanceTimersByTime(150);
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
    expect(t.g.kernel.query.filter['n']).toMatchObject({ value: -5 });
  });

  it('a lone minus left alone is marked once the pause is over, and said', () => {
    vi.useFakeTimers();
    const t = make();
    const said = vi.spyOn(t.live, 'announce');
    t.type('n', '-');
    vi.advanceTimersByTime(149);
    expect(t.input('n')!.getAttribute('aria-invalid')).toBeNull();
    expect(said).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.input('n')!.getAttribute('aria-invalid')).toBe('true');
    expect(said).toHaveBeenCalledTimes(1);
  });

  it('an invalid text cancels a valid edit still pending', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('n', '5');
    t.type('n', '5x');
    vi.advanceTimersByTime(300);
    expect(t.filterEvents()).toHaveLength(0);
  });
});

describe('echo', () => {
  it('leaves the text alone when its own filter comes back (1,50 stays), rewrites another one', () => {
    vi.useFakeTimers();
    const t = make({ columns: [{ id: 'n', type: 'number' }], settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } }, locale: 'fr-FR' } });
    t.type('n', '1,50');
    vi.advanceTimersByTime(150);
    expect(t.input('n')!.value).toBe('1,50');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 1234.5 } }, 'api');
    expect(t.input('n')!.value).toBe('1234,5');
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    expect(t.input('n')!.value).toBe('');
  });

  it('leaves text typed and not yet applied alone', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'zz' } }, 'api');
    expect(t.input('name')!.value).toBe('bo');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bo' });
  });

  it('empties the box when the overlay clears every filter', () => {
    vi.useFakeTimers();
    let clear: (() => void) | null = null;
    const overlay = definePart('overlay', { mount: (_h, c) => { clear = c.clearFilters; return { update: (n) => { clear = n.clearFilters; } }; } });
    // The overlay part needs slots(); the box is filters'.
    const t = make({ features: [slots(), filters({ floating: true })], settings: { parts: { overlay } } });
    t.type('name', 'zzz');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.rows.displayed.count).toBe(0);
    clear!();
    expect(t.g.kernel.query.filter).toEqual({});
    expect(t.input('name')!.value).toBe('');
  });
});

describe('the summary', () => {
  it('shows Filter active and a Clear button for a filter the box cannot edit, and for a day', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'startsWith', value: 'a' }, n: { type: 'number', op: 'between', value: 1, valueTo: 4 }, d: { type: 'day', op: 'equals', value: '2024-01-01' } } }, 'api');
    for (const col of ['name', 'n', 'd']) {
      expect(t.input(col)).toBeNull();
      expect(t.cell(col).textContent).toBe('Filter active');
      // The Clear button (step 13: the summary text is itself a button where the column has a popup).
      const b = t.cell(col).querySelector<HTMLButtonElement>('button.dzg-fclear')!;
      expect(b.getAttribute('aria-label')).toBe(`Clear filter ${col === 'name' ? 'Name' : col.toUpperCase()}`);
      expect(b.tabIndex).toBe(-1);
    }
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'combined', join: 'or', conditions: [{ type: 'number', op: 'equals', value: 1 }, { type: 'number', op: 'equals', value: 2 }] } }, 'api');
    expect(t.cell('n').textContent).toBe('Filter active');
  });

  it('Clear removes the column’s filter at once and the box comes back', () => {
    const t = make();
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'blank' }, n: { type: 'number', op: 'gt', value: 3 } } }, 'api');
    t.cell('n').querySelector<HTMLElement>('button.dzg-fclear')!.click();
    expect(t.g.kernel.query.filter).toEqual({ name: { type: 'text', op: 'blank' } });
    expect(t.input('n')).not.toBeNull();
  });

  it('is empty without a filter', () => {
    const t = make();
    expect(t.cell('d').childNodes).toHaveLength(0);
  });
});

describe('parts and kinds', () => {
  const range: FilterKind<{ min: number } | null, number> = {
    name: 'atLeast', types: ['number'], read: (s) => (s === null || (typeof s === 'object' && typeof (s as { min?: unknown }).min === 'number') ? (s as { min: number } | null) : 'invalid'),
    active: (s) => s !== null, test: (s) => (v) => v !== null && v >= s!.min,
  };

  it('a custom kind’s part edits its state, wrapped as a custom filter; the summary without one', () => {
    vi.useFakeTimers();
    let ctx: FC | null = null;
    const part = definePart('floating', { mount: (_h, c) => { ctx = c; return { update: (n) => { ctx = n; } }; } });
    const t = make({ columns: [{ id: 'n', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [range], parts: { 'floating.atLeast': part } } });
    expect(ctx!.kind).toBe('atLeast');
    ctx!.set({ min: 25 }, { commit: 'now' });
    expect(t.g.kernel.query.filter['n']).toEqual({ type: 'custom', kind: 'atLeast', state: { min: 25 } });
    expect(ctx!.state).toEqual({ min: 25 });
    expect(t.ids()).toEqual(['r25', 'r26', 'r27', 'r28', 'r29']);
    ctx!.set(null);
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.filter).toEqual({});
    cleanup();
    const s = make({ columns: [{ id: 'n', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [range] } });
    s.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'custom', kind: 'atLeast', state: { min: 3 } } }, 'api');
    expect(s.cell('n').textContent).toBe('Filter active');
  });

  it('a custom kind without test while the browser filters: an empty cell, no problem', () => {
    const { test: _, ...serverOnly } = range;
    const part = definePart('floating', { mount: (h) => { h.append('mine'); return {}; } });
    const t = make({ columns: [{ id: 'n', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [serverOnly], parts: { 'floating.atLeast': part } } });
    expect(t.cell('n').childNodes).toHaveLength(0);
    expect(t.problems().filter((p) => p.path.startsWith('columns'))).toEqual([]);
    cleanup();
    // On a server the kind needs no browser rule: its part draws the cell.
    const s = make({ server: true, columns: [{ id: 'n', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [serverOnly], parts: { 'floating.atLeast': part } } });
    expect(s.cell('n').textContent).toBe('mine');
  });

  it('an unknown explicit kind: invalid-filter once, an empty cell; a custom type with no kind: silent', () => {
    const t = make({ columns: [{ id: 'name', filter: { kind: 'nope' } }, { id: 'c', type: 'custom', codec: textCodec, value: () => 'x' }] });
    const told = () => t.problems().filter((p) => p.code === 'invalid-filter');
    expect(told()).toEqual([{ code: 'invalid-filter', severity: 'error', path: 'columns.name.filter.kind', detail: 'unknown kind' }]);
    expect(t.cell('name').childNodes).toHaveLength(0);
    expect(t.cell('c').childNodes).toHaveLength(0);
    t.g.update({ density: 'compact' });
    t.g.api.refresh();
    expect(told()).toHaveLength(1);
  });

  it('a host’s floating.text replaces the box; a host’s bare floating replaces the summary', () => {
    const mine = definePart('floating', { mount: (h, c) => { h.append(`mine:${c.kind}`); return {}; } });
    const t = make({ settings: { parts: { 'floating.text': mine, floating: mine } } });
    expect(t.cell('name').textContent).toBe('mine:text');
    expect(t.cell('d').textContent).toBe('mine:day');
    expect(t.input('n')).not.toBeNull();
  });

  it('a part that throws: its cell empty, reported, the others drawn; not tried again until its context changes', () => {
    const reported: unknown[] = [];
    const had = (window as unknown as { reportError?: unknown }).reportError;
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    try {
      let mounts = 0;
      const bad = definePart('floating', { mount: () => { mounts++; throw new Error('floating broke'); } });
      const t = make({ settings: { parts: { 'floating.text': bad } } });
      expect(t.cell('name').childNodes).toHaveLength(0);
      expect(t.input('n')).not.toBeNull();
      expect(reported.map((e) => (e as Error).message)).toEqual(['floating broke']);
      t.g.api.refresh();
      t.g.update({ density: 'compact' });
      expect(mounts).toBe(1);
      t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, 'api');
      expect(mounts).toBe(2);
    } finally {
      (window as unknown as { reportError?: unknown }).reportError = had;
    }
  });
});

describe('lifecycle', () => {
  const counting = () => {
    const calls = { mount: 0, destroy: 0 };
    const part = definePart('floating', { mount: () => { calls.mount++; return { destroy: () => void calls.destroy++ }; } });
    return { calls, part };
  };
  const wide = () => [{ id: 'name' }, ...Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, width: 100, value: (r: R) => `${r.name}${i}` }))];

  it('a cell leaving the column window takes its part with it: mounts equal destroys', () => {
    const c = counting();
    const t = make({ columns: wide(), inline: 400, settings: { parts: { 'floating.text': c.part } } });
    const first = c.calls.mount;
    expect(first).toBeGreaterThan(2);
    t.scrollInline(2000);
    expect(c.calls.destroy).toBeGreaterThan(0);
    t.scrollInline(0);
    t.g.destroy();
    expect(c.calls.destroy).toBe(c.calls.mount);
  });

  it('applies a pending edit when its cell leaves the window', () => {
    vi.useFakeTimers();
    const t = make({ columns: wide(), inline: 400 });
    t.type('x0', 'bob');
    t.scrollInline(2500);
    expect(t.cell('x0')).toBeNull();
    expect(t.g.kernel.query.filter['x0']).toMatchObject({ value: 'bob' });
  });

  it('drops a pending edit when the grid is destroyed: nothing dispatched after', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'ann');
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    t.g.destroy();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('announcements', () => {
  it('says the filtered count after a user’s change in the browser; nothing for the host’s', () => {
    vi.useFakeTimers();
    const t = make();
    const said = vi.spyOn(t.live, 'announce');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'api');
    expect(said).not.toHaveBeenCalled();
    t.type('name', 'ann');
    vi.advanceTimersByTime(150);
    expect(said).toHaveBeenLastCalledWith('Filtered. 10 rows');
  });

  it('on a server, once the answer is in; filteredOpen when the count is unknown; nothing after a failure', () => {
    vi.useFakeTimers();
    const t = make({ server: true });
    t.f.answer(['a', 'b'], { total: 2 });
    const said = vi.spyOn(t.live, 'announce');
    t.type('name', 'a');
    vi.advanceTimersByTime(300);
    expect(said).not.toHaveBeenCalled();
    t.f.answer(['a'], { total: 1 });
    expect(said).toHaveBeenLastCalledWith('Filtered. 1 row');
    t.type('name', 'ab');
    vi.advanceTimersByTime(300);
    t.f.answer(['a'], {});
    expect(said).toHaveBeenLastCalledWith(EN_FILTERS.text['announce.filteredOpen']);
    said.mockClear();
    t.type('name', 'abc');
    vi.advanceTimersByTime(300);
    t.f.fail(new Error('x'));
    expect(said.mock.calls.map((c) => c[0])).toEqual([EN.text['announce.error']]);
  });
});

describe('messages', () => {
  it('filters() throws a TypeError naming the missing filter keys', () => {
    expect(() => make({ settings: { messages: EN } })).toThrow(TypeError);
    expect(() => make({ settings: { messages: EN } })).toThrow(/filter\.inputLabel.*announce\.filteredOpen/);
  });

  it('every filter bundle has the same keys and placeholders, every plural category its language has', () => {
    const place = (v: unknown): string[] => [...new Set((typeof v === 'string' ? [v] : Object.values(v as object)).flatMap((s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))].sort();
    const keys = Object.keys(EN_FILTERS.text).sort();
    expect(keys).toEqual([...FILTER_KEYS].sort());
    expect(keys).toHaveLength(41);
    for (const b of [FR_FILTERS, AR_FILTERS]) {
      expect(Object.keys(b.text).sort()).toEqual(keys);
      for (const k of keys) expect(place((b.text as Record<string, unknown>)[k]), `${b.locale} ${k}`).toEqual(place((EN_FILTERS.text as Record<string, unknown>)[k]));
    }
    for (const b of [EN_FILTERS, FR_FILTERS, AR_FILTERS]) for (const v of Object.values(b.text)) expect(v).not.toMatch(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/);
  });

  it('names the box and Clear in French and in Arabic', () => {
    const fr = make({ settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } });
    expect(fr.input('name')!.getAttribute('aria-label')).toBe(FR_FILTERS.text['filter.inputLabel'].replace('{column}', 'Name'));
    cleanup();
    const ar = make({ settings: { messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, direction: 'rtl' } });
    expect(ar.input('name')!.getAttribute('aria-label')).toBe(AR_FILTERS.text['filter.inputLabel'].replace('{column}', 'Name'));
    expect(ar.input('name')!.getAttribute('dir')).toBe('auto');
  });
});

void COLUMNS;
