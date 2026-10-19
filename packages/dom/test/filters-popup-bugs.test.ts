// Bugs in the filter popup (step 13) found by filters-popup-walk.test.ts, probes and the review.
// Each test states the behaviour docs/behaviors/filter-ui.md promises; each failed before its fix.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { definePart } from '../src/part.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { cleanup, make, MESSAGES, type R } from './support-filters.js';

afterEach(cleanup);
const COLS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
  { id: 'b', header: 'B', type: 'boolean', value: (r: R) => r.n % 2 === 0 },
];
function open(o: Parameters<typeof make>[0] = {}) {
  const feature = filters({ floating: true }) as ReturnType<typeof filters>;
  const t = make({ columns: COLS, features: [feature], ...o });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const header = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${c}"]`)!;
  const fill = (i: HTMLInputElement, text: string) => { i.value = text; i.dispatchEvent(new InputEvent('input', { bubbles: true })); };
  const check = (r: HTMLInputElement) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
  return { ...t, feature, popup, q, header, fill, check, filter: () => t.g.kernel.query.filter };
}

describe('popup bugs', () => {
  // B1. A choice applies at once and the popup stays (filter-ui.md "Apply", "Closing"). Opened from
  // the floating summary, a choice that removes the filter (All, Clear) empties the summary, its
  // button (the anchor) leaves the page and the popup closes under the user; the focus lands on the
  // viewport, not on the floating cell.
  it('B1: All in a popup opened from the floating summary keeps the popup open', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'b', filter: { type: 'boolean', value: true } }, 'api');
    t.cell('b').querySelector<HTMLButtonElement>('button.dzg-fsum')!.click();
    expect(t.popup()).not.toBeNull();
    t.check(t.q<HTMLInputElement>('input[type=radio]')!);
    expect(t.filter()).toEqual({});
    expect(t.popup()).not.toBeNull();
  });
  it('B1: Clear in a popup opened from the floating summary keeps the popup open', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'between', value: 1, valueTo: 5 } }, 'api');
    t.cell('n').querySelector<HTMLButtonElement>('button.dzg-fsum')!.click();
    t.q<HTMLButtonElement>('button.dzg-fclr')!.click();
    expect(t.popup()).not.toBeNull();
  });

  // B2. "If the anchor left the page, the popup closes and focus returns to the grid's focused
  // cell." Opened with Alt+ArrowDown (the kernel's focus on the column), the column hidden: the
  // focus falls to <body>. Without the popup, the same hide moves the focus to the next header.
  it.each(['header', 'floating'] as const)('B2: Alt+ArrowDown on the %s cell, the column hidden: the focus stays in the grid', (where) => {
    const t = open({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }] });
    const at = where === 'header' ? t.header('name') : t.cell('name');
    at.focus();
    t.key(at, 'ArrowDown', { altKey: true });
    expect(t.popup()).not.toBeNull();
    t.g.update({ columns: [{ id: 'name', header: 'Name', hidden: true }, { id: 'n', header: 'N', type: 'number' }] } as never);
    expect(t.popup()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(t.host.contains(document.activeElement)).toBe(true);
  });

  // B3. The column's `filter.ops` redefined while the popup is open (the operator in force still
  // offered): fill() replaces the options, the select falls to the first one, the clean form is not
  // written again; Apply then stores an operator the user never chose.
  it('B3: new filter.ops while open keep the operator in force; Apply changes nothing', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'x' } }, 'api');
    t.feature.openFilter('name');
    t.g.update({ columns: [{ id: 'name', header: 'Name', filter: { ops: ['equals', 'contains'] } }, COLS[1]!, COLS[2]!] } as never);
    expect(t.q<HTMLSelectElement>('select.dzg-fop')!.value).toBe('contains');
    t.q<HTMLButtonElement>('button.dzg-fapply')!.click();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'x' });
  });

  // B4. "A text is read once, when typed, in the locale of that moment." In the browser, Apply reads
  // the field again in the new locale: `1,5` typed in French is refused at Apply after a switch to
  // English (marked, announced, the popup stays) — and the edit still pending from the typing
  // applies 1.5 a pause later, under a field that says it does not read.
  it('B4: a locale switch between typing and Apply: Apply applies what was typed', () => {
    vi.useFakeTimers();
    const t = open({ settings: { locale: 'fr-FR', messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } });
    t.feature.openFilter('n');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '1,5');
    t.g.update({ locale: 'en-US', messages: MESSAGES } as never);
    t.q<HTMLButtonElement>('button.dzg-fapply')!.click();
    // Either way, never "invalid" now and applied later.
    const invalid = t.popup()?.querySelector('[aria-invalid=true]') != null;
    vi.advanceTimersByTime(200);
    expect(invalid && t.filter()['n'] !== undefined).toBe(false);
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'equals', value: 1.5 });
    expect(t.popup()).toBeNull();
  });

  // B5. The grid destroyed with the popup open: the popup host gives the focus back to its anchor,
  // a header of the grid being torn down, and the focus handler dispatches focus.set as 'user' into
  // the destroyed kernel (the host's onEvent may hear a focusChanged after destroy()).
  it('B5: destroying the grid with the popup open dispatches nothing and moves no focus into it', () => {
    const t = open();
    const h = t.header('n');
    h.focus();
    t.key(h, 'ArrowDown', { altKey: true });
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    t.g.destroy();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('found by the longer walk', () => {
  // B6. The floating box giving way to the summary drops its own pending edit (step 12, rule E),
  // never the popup's: a host filter arriving while the popup's edit waits must not lose it.
  it('B6: the box giving way to the summary leaves the popup’s pending edit', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('n');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '1');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'between', value: 2, valueTo: 9 } }, 'api');
    expect(t.cell('n').querySelector('.dzg-fsum')).not.toBeNull();
    t.press('Escape');
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'equals', value: 1 });
  });
});

describe('review findings', () => {
  // R1. The popup's context is the same at each paint when nothing it shows changed: no update, no
  // DOM write (a focused control is not announced again).
  it('R1: a paint that changes nothing the popup shows writes nothing in it', () => {
    const t = open();
    t.feature.openFilter('name');
    const mo = new MutationObserver(() => {});
    mo.observe(t.popup()!, { subtree: true, childList: true, characterData: true, attributes: true });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
  });
  it('R1: a filter from elsewhere rewrites the fields, never the texts that did not change', () => {
    const t = open();
    t.feature.openFilter('name');
    const mo = new MutationObserver(() => {});
    mo.observe(t.popup()!, { subtree: true, childList: true, characterData: true });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'equals', value: 'ann0' } }, 'api');
    expect(t.q<HTMLSelectElement>('select.dzg-fop')!.value).toBe('equals');
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
  });

  // R2. A part that throws at an update is dropped: the popup closes (as when it throws at mount),
  // the focus back on the anchor, never an empty dialog with the focus on the body.
  it('R2: a filter part throwing at an update closes the popup, the focus back on the anchor', () => {
    const reported: unknown[] = [];
    const had = (window as unknown as { reportError?: unknown }).reportError;
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
    try {
      const part = definePart('filter', { mount: (h) => { const b = document.createElement('button'); h.append(b); return { update() { throw new Error('boom'); }, focus: () => (b.focus(), true) }; } });
      const t = open({ settings: { parts: { 'filter.text': part } } });
      const b = t.header('name').querySelector<HTMLButtonElement>(':scope > .dzg-fbtn')!;
      b.click();
      expect(t.popup()).not.toBeNull();
      t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, 'api');
      expect(reported).toHaveLength(1);
      expect(t.popup()).toBeNull();
      expect(document.activeElement).toBe(b);
    } finally {
      (window as unknown as { reportError?: unknown }).reportError = had;
    }
  });

  // R3. The header's name is written once: a paint that changes nothing touches no aria-label.
  it.each([
    ['no filter', null],
    ['a filter', { type: 'text', op: 'contains', value: 'a' }],
  ] as const)('R3: with %s, a paint leaves the header name alone', (_, filter) => {
    const t = open();
    if (filter) t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter }, 'api');
    const h = t.header('name');
    const mo = new MutationObserver(() => {});
    mo.observe(h, { attributes: true, attributeFilter: ['aria-label'] });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'api');
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
    expect(h.getAttribute('aria-label')).toBe(filter ? 'Name, filtered' : 'Name');
  });

  // R4. A column id that names a property of every object (`constructor`, `toString`) has no filter
  // until one is set: no mark, the floating box and the popup's fields, not the summary.
  it.each(['constructor', 'toString'])('R4: a column named %s is not filtered by the prototype', (id) => {
    // A value getter: `constructor` is refused as a field path by the core.
    const t = open({ columns: [{ id, header: 'X', value: (r: R) => r.name }, { id: 'n', header: 'N', type: 'number' }] });
    const h = t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${id}"]`)!;
    expect(h.hasAttribute('data-dzg-filtered')).toBe(false);
    expect(h.getAttribute('aria-label')).toBe('X');
    expect(t.input(id)).not.toBeNull();
    t.feature.openFilter(id);
    expect(t.q('select.dzg-fop')?.isConnected).toBe(true);
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'ann');
    t.q<HTMLButtonElement>('button.dzg-fapply')!.click();
    expect(Object.keys(t.filter())).toEqual([id]);
    expect(h.hasAttribute('data-dzg-filtered')).toBe(true);
  });
});

describe('lead decision L1: an inactive draft keeps the filter in force', () => {
  const sel = (s: HTMLSelectElement, v: string) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
  it('choosing between with one bound keeps the filter; Escape leaves it', () => {
    vi.useFakeTimers();
    const t = open();
    const was = { type: 'number', op: 'equals', value: 4 } as const;
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: was }, 'api');
    t.feature.openFilter('n');
    sel(t.q<HTMLSelectElement>('select.dzg-fop')!, 'between');
    vi.advanceTimersByTime(1000);
    expect(t.filter()['n']).toEqual(was);
    t.press('Escape');
    vi.advanceTimersByTime(1000);
    expect(t.filter()['n']).toEqual(was);
  });
  it('an operator choice cancels the edit still pending; the filter stays until the draft is active', () => {
    vi.useFakeTimers();
    const t = open();
    const was = { type: 'text', op: 'contains', value: 'ann' } as const;
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: was }, 'api');
    t.feature.openFilter('name');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'bob');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '');
    vi.advanceTimersByTime(1000);
    expect(t.filter()['name']).toEqual(was);
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'bob1');
    vi.advanceTimersByTime(1000);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'bob1' });
    t.q<HTMLButtonElement>('button.dzg-fclr')!.click();
    expect(t.filter()['name']).toBeUndefined();
  });
  it('Apply on an inactive draft keeps the filter; after Clear it removes it (a server too)', () => {
    const t = open({ server: true });
    t.f.answer(['a'], { total: 1 });
    const was = { type: 'number', op: 'equals', value: 4 } as const;
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: was }, 'api');
    t.f.answer(['a'], { total: 1 });
    const calls = t.f.calls.length;
    t.feature.openFilter('n');
    sel(t.q<HTMLSelectElement>('select.dzg-fop')!, 'between');
    t.q<HTMLButtonElement>('button.dzg-fapply')!.click();
    expect(t.popup()).toBeNull();
    expect(t.f.calls.length).toBe(calls);
    expect(t.filter()['n']).toEqual(was);
    t.feature.openFilter('n');
    t.q<HTMLButtonElement>('button.dzg-fclr')!.click();
    t.q<HTMLButtonElement>('button.dzg-fapply')!.click();
    expect(t.filter()['n']).toBeUndefined();
  });
});

describe('D6: Alt+ArrowDown on a focused header kept mounted out of view', () => {
  it('does nothing and leaves the key unhandled', () => {
    const cols: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', width: 100 }, ...Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100 }))];
    const t = open({ columns: cols, inline: 400 });
    const h = t.header('name');
    h.focus();
    t.scrollInline(700);
    expect(t.header('name')).toBe(h);
    const e = t.key(h, 'ArrowDown', { altKey: true });
    expect(t.popup()).toBeNull();
    expect(e.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(h);
  });
});
