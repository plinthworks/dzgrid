// The filter popup (step 13; docs/behaviors/filter-ui.md, filter-text.md, filter-number.md, filter-misc.md, parts.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup, FilterKind } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { filters } from '../src/filters.js';
import { slots } from '../src/slots.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, make, type Make, type R } from './support-filters.js';

afterEach(cleanup);
type FC = SlotContext['filter'];
type Feature = GridFeature & { openFilter(column: string): boolean; closeFilter(): void };

const COLS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
  // A value-list column: its popup part comes at step 15 (step 14 gave the day its part).
  { id: 'd', header: 'D', type: 'enum', enumOptions: [{ value: '2024-01-01', label: 'New year' }] },
  { id: 'b', header: 'B', type: 'boolean', value: (r: R) => r.n % 2 === 0 },
];

/** A grid with `filters()` (the popup on, no floating row unless asked), and the popup's handles. */
function open(o: Make & { floating?: boolean; popup?: boolean; debounceMs?: number } = {}) {
  const f = filters({ ...(o.floating && { floating: true }), ...(o.popup === false && { popup: false }), ...(o.debounceMs !== undefined && { debounceMs: o.debounceMs }) }) as Feature;
  const t = make({ columns: COLS, ...o, features: o.features ?? [f] });
  const header = (col: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${col}"]`)!;
  const button = (col: string) => header(col)?.querySelector<HTMLButtonElement>(':scope > .dzg-fbtn') ?? null;
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(sel: string) => popup()?.querySelector<E>(sel) ?? null;
  const op = () => q<HTMLSelectElement>('select.dzg-fop');
  const value = () => q<HTMLInputElement>('input.dzg-fval');
  const to = () => q<HTMLInputElement>('input.dzg-fto');
  const radios = () => [...(popup()?.querySelectorAll<HTMLInputElement>('[role=radiogroup] input[type=radio]') ?? [])];
  const apply = () => q<HTMLButtonElement>('button.dzg-fapply');
  const clear = () => q<HTMLButtonElement>('button.dzg-fclr');
  const fill = (i: HTMLInputElement, text: string) => {
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const choose = (s: HTMLSelectElement, v: string) => {
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const check = (r: HTMLInputElement) => {
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const hidden = (el: Element | null) => !!el?.closest('[hidden]');
  return { ...t, feature: f, header, button, popup, q, op, value, to, radios, apply, clear, fill, choose, check, hidden, filter: () => t.g.kernel.query.filter };
}

describe('opening and focus', () => {
  it('puts a filter button in the header of each column with a filter part: tabindex -1, a dialog popup, named as the dialog', () => {
    const t = open();
    for (const c of ['name', 'n', 'b']) {
      const b = t.button(c)!;
      expect(b, c).not.toBeNull();
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.tabIndex).toBe(-1);
      expect(b.getAttribute('aria-haspopup')).toBe('dialog');
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(t.header(c).getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown');
    }
    expect(t.button('name')!.getAttribute('aria-label')).toBe('Name filter');
    // A value-list column: no part yet (step 15), so no button and no shortcut.
    expect(t.button('d')).toBeNull();
    expect(t.header('d').hasAttribute('aria-keyshortcuts')).toBe(false);
    // One tab stop in the header still.
    expect([...t.host.querySelectorAll<HTMLElement>('.dzg-header *')].filter((e) => e.tabIndex >= 0).length).toBeLessThanOrEqual(1);
  });

  it('opens from the button: a modal dialog named for the column, the button expanded, the value field focused and selected', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'api');
    t.button('name')!.click();
    const p = t.popup()!;
    expect(p).not.toBeNull();
    expect(p.getAttribute('role')).toBe('dialog');
    expect(p.getAttribute('aria-modal')).toBe('true');
    expect(p.getAttribute('aria-label')).toBe('Name filter');
    expect(t.button('name')!.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(t.value());
    expect(t.value()!.selectionStart).toBe(0);
    expect(t.value()!.selectionEnd).toBe(3);
    // Visible labels on every field, no placeholder, native controls.
    expect(t.op()!.closest('label')!.textContent).toContain('Condition');
    expect(t.value()!.closest('label')!.textContent).toContain('Value');
    expect(t.value()!.getAttribute('placeholder')).toBeNull();
    expect(t.apply()!.textContent).toBe('Apply');
    // Feedback pass J: the column in the name, not in the text (a long name wrapped the footer).
    expect(t.clear()!.textContent).toBe('Clear filter');
    expect(t.clear()!.getAttribute('aria-label')).toBe('Clear filter Name');
  });

  it('a click on the button never sorts', () => {
    const t = open();
    t.button('name')!.click();
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('opens with Alt+ArrowDown on a header cell (prevented, not passed on), focus back to the cell on Escape', () => {
    const t = open();
    const h = t.header('n');
    h.focus();
    const e = t.key(h, 'ArrowDown', { altKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(t.popup()).not.toBeNull();
    expect(document.activeElement).toBe(t.value());
    const esc = t.press('Escape');
    expect(esc.defaultPrevented).toBe(true);
    expect(t.popup()).toBeNull();
    expect(document.activeElement).toBe(h);
  });

  it('Alt+ArrowDown with Ctrl, Shift or Meta, on a body cell, in a floating box, on a column without a popup: nothing', () => {
    const t = open({ floating: true });
    for (const mod of [{ ctrlKey: true }, { shiftKey: true }, { metaKey: true }]) {
      const e = t.key(t.header('n'), 'ArrowDown', { altKey: true, ...mod });
      expect(t.popup()).toBeNull();
      void e;
    }
    const cell = t.host.querySelector<HTMLElement>('.dzg-layer .dzg-cell')!;
    t.key(cell, 'ArrowDown', { altKey: true });
    expect(t.popup()).toBeNull();
    const e = t.key(t.input('name')!, 'ArrowDown', { altKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(t.popup()).toBeNull();
    const d = t.key(t.header('d'), 'ArrowDown', { altKey: true });
    expect(d.defaultPrevented).toBe(false);
    expect(t.popup()).toBeNull();
    // On the floating cell itself: it opens.
    t.key(t.cell('n'), 'ArrowDown', { altKey: true });
    expect(t.popup()).not.toBeNull();
  });

  it('openFilter / closeFilter on the feature: true when opened; false without a part or a column', () => {
    const t = open();
    expect(t.feature.openFilter('d')).toBe(false);
    expect(t.feature.openFilter('nope')).toBe(false);
    expect(t.popup()).toBeNull();
    expect(t.feature.openFilter('n')).toBe(true);
    expect(t.popup()).not.toBeNull();
    t.feature.closeFilter();
    expect(t.popup()).toBeNull();
  });

  it('focuses the select for a blank operator, the checked radio for a boolean', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'blank' } }, 'api');
    t.feature.openFilter('name');
    expect(document.activeElement).toBe(t.op());
    expect(t.hidden(t.value())).toBe(true);
    t.feature.closeFilter();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'b', filter: { type: 'boolean', value: false } }, 'api');
    t.feature.openFilter('b');
    expect(document.activeElement).toBe(t.radios()[2]);
    expect(t.radios()[2]!.checked).toBe(true);
  });

  it('keeps Tab inside: from the last control to the first and back', () => {
    const t = open();
    t.feature.openFilter('name');
    t.apply()!.focus();
    t.press('Tab');
    expect(document.activeElement).toBe(t.op());
    t.press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(t.apply());
  });

  it('Shift+Tab from a radio wraps to Apply (a radio group is one stop)', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'b', filter: { type: 'boolean', value: true } }, 'api');
    t.feature.openFilter('b');
    expect(document.activeElement).toBe(t.radios()[1]);
    const e = t.press('Tab', { shiftKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.apply());
  });

  it('a pointer down outside closes it (owner Q4, step 18); the button again closes it; another opener replaces it', () => {
    const t = open();
    t.button('name')!.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(t.popup()).toBeNull();
    expect(t.button('name')!.getAttribute('aria-expanded')).toBe('false');
    t.button('name')!.click();
    // A pointer down on its own button leaves it to the click (which closes it).
    t.button('name')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(t.popup()).not.toBeNull();
    t.button('name')!.click();
    expect(t.popup()).toBeNull();
    expect(t.button('name')!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(t.button('name'));
    t.button('name')!.click();
    t.button('n')!.click();
    expect(t.host.querySelectorAll('.dzg-popup')).toHaveLength(1);
    expect(t.popup()!.getAttribute('aria-label')).toBe('N filter');
    expect(t.button('name')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.button('n')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('filters({ popup: false }): no button, no shortcut, no popup', () => {
    const t = open({ popup: false });
    expect(t.button('name')).toBeNull();
    expect(t.header('name').hasAttribute('aria-keyshortcuts')).toBe(false);
    const e = t.key(t.header('name'), 'ArrowDown', { altKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(t.feature.openFilter('name')).toBe(false);
    expect(t.popup()).toBeNull();
  });
});

describe('a pointer down outside (owner decision Q4, step 18; revises step 13 O7)', () => {
  const down = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));

  it('in the browser: closes, the typed filter kept (the pending edit applied, as Escape)', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('name');
    t.fill(t.value()!, 'bob1');
    expect(t.filterEvents()).toHaveLength(0);
    down(document.body);
    expect(t.popup()).toBeNull();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'bob1' });
    expect(t.filterEvents()).toHaveLength(1);
  });

  it('on a server: closes, the unapplied draft dropped (nothing asked), as Escape', () => {
    vi.useFakeTimers();
    const t = open({ server: true });
    t.f.answer(['a']);
    const before = t.f.calls.length;
    t.feature.openFilter('name');
    t.fill(t.value()!, 'zz');
    down(document.body);
    vi.advanceTimersByTime(2000);
    expect(t.popup()).toBeNull();
    expect(t.f.calls.length).toBe(before);
    expect(t.filter()).toEqual({});
  });

  it('the focus goes where the user clicked: kept there, never stolen back', () => {
    vi.useFakeTimers();
    const t = open();
    const other = document.createElement('input');
    other.setAttribute('aria-label', 'elsewhere');
    document.body.append(other);
    t.button('n')!.click();
    expect(t.popup()!.contains(document.activeElement)).toBe(true);
    down(other);
    // The browser focuses what was pressed after the pointer down.
    other.focus();
    vi.advanceTimersByTime(50);
    expect(t.popup()).toBeNull();
    expect(document.activeElement).toBe(other);
  });

  it('a press on nothing focusable: the focus back on the anchor', () => {
    vi.useFakeTimers();
    const t = open();
    t.button('n')!.click();
    down(document.body);
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(t.button('n'));
  });

  it('a press inside it, or inside a date panel placed in it (tzslot\'s container), keeps it open', () => {
    const t = open();
    t.button('name')!.click();
    down(t.value()!);
    expect(t.popup()).not.toBeNull();
    const panel = document.createElement('div');
    panel.className = 'tz-field__panel';
    const day = document.createElement('button');
    panel.append(day);
    t.popup()!.querySelector('.dzg-fpop')!.append(panel);
    down(day);
    expect(t.popup()).not.toBeNull();
  });

  it('opened with Alt+ArrowDown: only the header\'s filter button counts as its anchor; a press on the label, the grip or the cell closes it', () => {
    const t = open({ columns: [{ id: 'n', header: 'N', type: 'number', resizable: true }] });
    const altDown = () => {
      t.header('n').focus();
      t.key(t.header('n'), 'ArrowDown', { altKey: true });
      expect(t.popup()).not.toBeNull();
    };
    for (const sel of [':scope > .dzg-hlabel', ':scope > .dzg-resize', null]) {
      altDown();
      const at = sel ? t.header('n').querySelector(sel)! : t.header('n');
      expect(at).not.toBeNull();
      down(at);
      expect(t.popup()).toBeNull();
      expect(t.button('n')!.getAttribute('aria-expanded')).toBe('false');
    }
    // Its filter button: left to the click, which closes it.
    altDown();
    down(t.button('n')!);
    expect(t.popup()).not.toBeNull();
    t.button('n')!.click();
    expect(t.popup()).toBeNull();
  });

  it('opened with Alt+ArrowDown on a floating cell: its summary button counts as the anchor, the rest of the cell does not', () => {
    const t = open({ floating: true });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'b', filter: { type: 'boolean', value: true } }, 'api');
    const altDown = (col: string) => {
      t.cell(col).focus();
      t.key(t.cell(col), 'ArrowDown', { altKey: true });
      expect(t.popup()).not.toBeNull();
    };
    altDown('b');
    const sum = t.cell('b').querySelector<HTMLElement>('button.dzg-fsum')!;
    expect(sum).not.toBeNull();
    down(sum);
    expect(t.popup()).not.toBeNull();
    down(t.cell('b'));
    expect(t.popup()).toBeNull();
    // A box's cell has no such control: a press in its box closes the popup.
    altDown('n');
    down(t.input('n')!);
    expect(t.popup()).toBeNull();
  });

  it('the grid destroyed after a press outside moves no focus later', () => {
    vi.useFakeTimers();
    const t = open();
    t.button('n')!.click();
    down(document.body);
    t.g.destroy();
    const spy = vi.spyOn(HTMLElement.prototype, 'focus');
    vi.advanceTimersByTime(50);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the text form', () => {
  it('offers the eight operators, contains first; the column’s ops narrow them, in its order', () => {
    const t = open();
    t.feature.openFilter('name');
    expect([...t.op()!.options].map((o) => o.value)).toEqual(['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']);
    expect(t.op()!.value).toBe('contains');
    expect(t.op()!.options[1]!.textContent).toBe('Does not contain');
    t.feature.closeFilter();
    cleanup();
    const s = open({ columns: [{ id: 'name', header: 'Name', filter: { ops: ['startsWith', 'equals', 'lt'] } }] });
    s.feature.openFilter('name');
    expect([...s.op()!.options].map((o) => o.value)).toEqual(['startsWith', 'equals']);
    expect(s.op()!.value).toBe('startsWith');
  });

  it('stores what is chosen, after the pause; an empty value keeps it, Clear removes it (L1); blank hides the value and applies at once', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('name');
    t.choose(t.op()!, 'startsWith');
    expect(t.filter()).toEqual({});
    t.fill(t.value()!, 'ann');
    expect(t.filter()).toEqual({});
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'startsWith', value: 'ann' });
    expect(t.ids().every((id) => Number(id.slice(1)) % 3 === 0)).toBe(true);
    t.fill(t.value()!, '');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'startsWith', value: 'ann' });
    t.clear()!.click();
    expect(t.filter()).toEqual({});
    t.choose(t.op()!, 'blank');
    expect(t.hidden(t.value())).toBe(true);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'blank' });
    t.choose(t.op()!, 'notBlank');
    expect(t.hidden(t.value())).toBe(true);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'notBlank' });
    t.choose(t.op()!, 'equals');
    expect(t.hidden(t.value())).toBe(false);
  });

  it('Enter on Clear or Apply is the button’s own (a click), not a second Apply', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'api');
    t.feature.openFilter('name');
    t.clear()!.focus();
    const e = t.press('Enter');
    expect(e.defaultPrevented).toBe(false);
    expect(t.popup()).not.toBeNull();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
  });

  it('keeps a stored caseSensitive', () => {
    vi.useFakeTimers();
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'Ann', caseSensitive: true } }, 'api');
    t.feature.openFilter('name');
    t.fill(t.value()!, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'ann', caseSensitive: true });
  });
});

describe('the number form', () => {
  it('offers nine operators, equals first; between shows a second field, both labelled', () => {
    const t = open();
    t.feature.openFilter('n');
    expect([...t.op()!.options].map((o) => o.value)).toEqual(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank']);
    expect(t.op()!.value).toBe('equals');
    expect(t.hidden(t.to())).toBe(true);
    t.choose(t.op()!, 'between');
    expect(t.hidden(t.to())).toBe(false);
    expect(t.to()!.closest('label')!.textContent).toContain('To');
    for (const i of [t.value()!, t.to()!]) {
      expect(i.type).toBe('text');
      expect(i.inputMode).toBe('decimal');
      expect(i.getAttribute('autocomplete')).toBe('off');
    }
  });

  it('between with both bounds stores the range at Apply; one bound alone stores nothing', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('n');
    t.choose(t.op()!, 'between');
    t.fill(t.value()!, '3');
    vi.advanceTimersByTime(150);
    expect(t.filter()).toEqual({});
    t.fill(t.to()!, '5');
    t.apply()!.click();
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'between', value: 3, valueTo: 5 });
    expect(t.ids()).toEqual(['r3', 'r4', 'r5']);
    expect(t.popup()).toBeNull();
  });

  it.each([
    ['fr', '1,5', 1.5],
    ['ar', '\u0661\u066B\u0665', 1.5],
    ['en', '12%', 0.12],
  ])('reads %s %s in the grid’s locale', (lang, text, n) => {
    vi.useFakeTimers();
    const messages = lang === 'fr' ? { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } : lang === 'ar' ? { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } } : { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text } };
    const t = open({ settings: { messages, locale: lang === 'fr' ? 'fr-FR' : lang === 'ar' ? 'ar-DZ' : 'en-US' } });
    t.feature.openFilter('n');
    t.fill(t.value()!, text);
    t.key(t.value()!, 'Enter');
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'equals', value: n });
    expect(t.popup()).toBeNull();
  });

  it('an unreadable number at Apply: marked, said once, nothing stored, focus on it, the popup stays', () => {
    vi.useFakeTimers();
    const t = open();
    const said = vi.spyOn(t.live, 'announce');
    t.feature.openFilter('n');
    t.choose(t.op()!, 'between');
    t.fill(t.value()!, '2');
    t.fill(t.to()!, 'abc');
    t.apply()!.focus();
    t.apply()!.click();
    expect(t.to()!.getAttribute('aria-invalid')).toBe('true');
    expect(t.value()!.hasAttribute('aria-invalid')).toBe(false);
    expect(said.mock.calls.map((c) => c[0])).toEqual(['N: not a valid number']);
    expect(document.activeElement).toBe(t.to());
    expect(t.popup()).not.toBeNull();
    expect(t.filterEvents()).toHaveLength(0);
    t.key(t.to()!, 'Enter');
    expect(said).toHaveBeenCalledTimes(1);
    expect(t.filterEvents()).toHaveLength(0);
    // Typing again clears the mark.
    t.fill(t.to()!, '4');
    expect(t.to()!.hasAttribute('aria-invalid')).toBe(false);
    t.key(t.to()!, 'Enter');
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'between', value: 2, valueTo: 4 });
  });

  it('on the client an unreadable number is judged after the pause, without moving the focus', () => {
    vi.useFakeTimers();
    const t = open();
    const said = vi.spyOn(t.live, 'announce');
    t.feature.openFilter('n');
    t.fill(t.value()!, '-');
    vi.advanceTimersByTime(149);
    expect(t.value()!.hasAttribute('aria-invalid')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(t.value()!.getAttribute('aria-invalid')).toBe('true');
    expect(said).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(t.value());
    expect(t.filterEvents()).toHaveLength(0);
  });
});

describe('the boolean form', () => {
  it('a radio group named for the column: All, Yes, No, applied at once', () => {
    const t = open();
    t.feature.openFilter('b');
    const g = t.q('[role=radiogroup]')!;
    expect(g.getAttribute('aria-label')).toBe('B filter');
    expect(t.radios().map((r) => r.closest('label')!.textContent)).toEqual(['All', 'Yes', 'No']);
    expect(t.radios()[0]!.checked).toBe(true);
    expect(new Set(t.radios().map((r) => r.name)).size).toBe(1);
    t.check(t.radios()[1]!);
    expect(t.filter()['b']).toEqual({ type: 'boolean', value: true });
    expect(t.ids().every((id) => Number(id.slice(1)) % 2 === 0)).toBe(true);
    t.check(t.radios()[2]!);
    expect(t.filter()['b']).toEqual({ type: 'boolean', value: false });
    t.check(t.radios()[0]!);
    expect(t.filter()).toEqual({});
  });
});

describe('states the form cannot edit', () => {
  it.each([
    ['a combined filter', 'name', { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'a' }, { type: 'text', op: 'contains', value: 'b' }] }],
    ['an operator outside the column’s ops', 'n', { type: 'number', op: 'gt', value: 3 }],
    ['a boolean filter on blanks', 'b', { type: 'boolean', value: null }],
  ])('%s: the summary, Clear removes it and shows the form', (_, col, filter) => {
    const t = open({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number', filter: { ops: ['equals', 'between'] } }, { id: 'b', header: 'B', type: 'boolean', value: (r: R) => r.n % 2 === 0 }] });
    t.g.kernel.dispatch({ type: 'filter.column', column: col, filter: filter as never }, 'api');
    t.feature.openFilter(col);
    expect(t.q('.dzg-fsum')!.textContent).toBe('Filter active');
    expect(t.op()).toBeNull();
    expect(t.radios()).toHaveLength(0);
    // Nothing to edit: Clear is focused.
    expect(document.activeElement).toBe(t.clear());
    t.clear()!.click();
    expect(t.filter()).toEqual({});
    expect(t.q('.dzg-fsum')).toBeNull();
    expect(t.op() ?? t.radios()[0]).toBeTruthy();
    expect(document.activeElement).toBe(t.clear());
  });

  it('Apply on the summary closes and changes nothing', () => {
    const t = open();
    const f = { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'a' }] };
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: f as never }, 'api');
    t.feature.openFilter('name');
    const before = t.filterEvents().length;
    t.apply()!.click();
    expect(t.popup()).toBeNull();
    expect(t.filter()['name']).toEqual(f);
    expect(t.filterEvents()).toHaveLength(before);
  });
});

describe('applying in the browser', () => {
  it('typed text applies after the pause, once; a choice applies at once', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('name');
    for (const s of ['a', 'an', 'ann']) t.fill(t.value()!, s);
    vi.advanceTimersByTime(149);
    expect(t.filterEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(t.filterEvents()).toHaveLength(1);
    t.choose(t.op()!, 'equals');
    expect(t.filterEvents()).toHaveLength(2);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'equals', value: 'ann' });
  });

  it('Apply and Enter apply the pending edit at once and close; Escape applies it too', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('name');
    t.fill(t.value()!, 'ann');
    t.apply()!.click();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
    expect(t.popup()).toBeNull();
    // openFilter anchors on the header's button: the focus goes back there.
    expect(document.activeElement).toBe(t.button('name'));
    t.feature.openFilter('name');
    t.fill(t.value()!, 'bob');
    t.key(t.value()!, 'Enter');
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'bob' });
    expect(t.popup()).toBeNull();
    t.feature.openFilter('name');
    t.fill(t.value()!, 'bob1');
    t.press('Escape');
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'bob1' });
    const n = t.filterEvents().length;
    vi.advanceTimersByTime(1000);
    expect(t.filterEvents()).toHaveLength(n);
  });

  it('Apply with nothing changed sends nothing', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'ann' } }, 'api');
    const n = t.filterEvents().length;
    t.feature.openFilter('name');
    t.apply()!.click();
    expect(t.filterEvents()).toHaveLength(n);
  });
});

describe('on a server', () => {
  it('keeps a draft: nothing asked until Apply, then one request', () => {
    vi.useFakeTimers();
    const t = open({ server: true });
    t.f.answer(['a', 'b']);
    const before = t.f.calls.length;
    t.feature.openFilter('name');
    t.choose(t.op()!, 'startsWith');
    t.fill(t.value()!, 'ab');
    vi.advanceTimersByTime(2000);
    expect(t.f.calls.length).toBe(before);
    expect(t.filterEvents()).toHaveLength(0);
    t.apply()!.click();
    expect(t.f.calls.length).toBe(before + 1);
    expect(JSON.stringify(t.f.calls.at(-1)!.req)).toContain('startsWith');
    expect(t.popup()).toBeNull();
  });

  it('a boolean choice waits for Apply too', () => {
    vi.useFakeTimers();
    const t = open({ server: true });
    t.f.answer(['a']);
    t.feature.openFilter('b');
    t.check(t.radios()[1]!);
    expect(t.filterEvents()).toHaveLength(0);
    t.key(t.radios()[1]!, 'Enter');
    expect(t.filter()['b']).toEqual({ type: 'boolean', value: true });
  });

  it('closing without Apply drops the draft; Enter applies; an unreadable number blocks', () => {
    vi.useFakeTimers();
    const t = open({ server: true });
    t.f.answer(['a']);
    const before = t.f.calls.length;
    t.feature.openFilter('name');
    t.fill(t.value()!, 'zz');
    t.press('Escape');
    vi.advanceTimersByTime(2000);
    expect(t.f.calls.length).toBe(before);
    expect(t.filter()).toEqual({});
    t.feature.openFilter('name');
    expect(t.value()!.value).toBe('');
    t.fill(t.value()!, 'zz');
    t.key(t.value()!, 'Enter');
    expect(t.f.calls.length).toBe(before + 1);
    t.f.answer(['a']);
    t.feature.openFilter('n');
    t.fill(t.value()!, 'abc');
    t.key(t.value()!, 'Enter');
    expect(t.value()!.getAttribute('aria-invalid')).toBe('true');
    expect(t.popup()).not.toBeNull();
    expect(t.f.calls.length).toBe(before + 1);
  });

  it('keeps an everything-except selection when Apply ends where it started', () => {
    vi.useFakeTimers();
    const t = open({ server: true, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.f.answer(['a', 'b'], { total: 2 });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    t.feature.openFilter('name');
    t.fill(t.value()!, 'x');
    t.fill(t.value()!, '');
    t.apply()!.click();
    expect(t.filterEvents()).toHaveLength(0);
    expect(t.g.kernel.selection.mode).toBe('exclude');
  });
});

describe('parts and kinds', () => {
  const range: FilterKind<{ min: number } | null, number> = {
    name: 'atLeast', types: ['number'], read: (s) => (s === null || (typeof s === 'object' && typeof (s as { min?: unknown }).min === 'number') ? (s as { min: number } | null) : 'invalid'),
    active: (s) => s !== null, test: (s) => (v) => v !== null && v >= s!.min,
  };

  it('a custom kind’s part gets its state, wraps what it sets, closes the popup; destroyed with it', () => {
    let ctx: FC | null = null;
    const destroy = vi.fn();
    const part = definePart('filter', { mount: (h, c) => { ctx = c; const b = document.createElement('button'); b.textContent = 'mine'; h.append(b); return { update: (n) => { ctx = n; }, destroy, focus: () => (b.focus(), true) }; } });
    const t = open({ columns: [{ id: 'n', header: 'N', type: 'number', filter: { kind: 'atLeast', ops: ['x'] } }], settings: { filterKinds: [range], parts: { 'filter.atLeast': part } } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'custom', kind: 'atLeast', state: { min: 3 } } }, 'api');
    expect(t.feature.openFilter('n')).toBe(true);
    expect(document.activeElement!.textContent).toBe('mine');
    expect(ctx!.kind).toBe('atLeast');
    expect(ctx!.state).toEqual({ min: 3 });
    expect(ctx!.ops).toEqual(['x']);
    expect(ctx!.where).toBe('client');
    ctx!.set({ min: 25 }, { commit: 'now' });
    expect(t.filter()['n']).toEqual({ type: 'custom', kind: 'atLeast', state: { min: 25 } });
    expect(ctx!.state).toEqual({ min: 25 });
    ctx!.close();
    expect(t.popup()).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('a custom kind without its browser rule under the client: no popup; on a server: the popup', () => {
    const { test: _, ...serverOnly } = range;
    const part = definePart('filter', { mount: (h) => { h.append('mine'); return {}; } });
    const t = open({ columns: [{ id: 'n', header: 'N', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [serverOnly], parts: { 'filter.atLeast': part } } });
    expect(t.button('n')).toBeNull();
    expect(t.feature.openFilter('n')).toBe(false);
    cleanup();
    const s = open({ server: true, columns: [{ id: 'n', header: 'N', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [serverOnly], parts: { 'filter.atLeast': part } } });
    expect(s.button('n')).not.toBeNull();
    expect(s.feature.openFilter('n')).toBe(true);
    expect(s.popup()!.textContent).toContain('mine');
  });

  it('a custom filter of another kind on the column is no state for this kind’s part', () => {
    const other: FilterKind<{ max: number } | null, number> = { name: 'atMost', types: ['number'], read: (s) => s as { max: number } | null, active: (s) => s !== null, test: (s) => (v) => v !== null && v <= s!.max };
    let ctx: FC | null = null;
    const part = definePart('filter', { mount: (_h, c) => { ctx = c; return { update: (n) => { ctx = n; } }; } });
    const t = open({ columns: [{ id: 'n', header: 'N', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [range, other], parts: { 'filter.atLeast': part } } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'custom', kind: 'atMost', state: { max: 3 } } }, 'api');
    expect(t.filter()['n']).toBeDefined();
    t.feature.openFilter('n');
    expect(ctx!.state).toBeNull();
  });

  it('a floating summary becomes the popup’s button when a part for its kind arrives, and back', () => {
    const part = definePart('filter', { mount: (h) => { h.append('mine'); return {}; } });
    const t = open({ floating: true, columns: [{ id: 'n', header: 'N', type: 'number', filter: { kind: 'atLeast' } }], settings: { filterKinds: [range] } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'custom', kind: 'atLeast', state: { min: 3 } } }, 'api');
    expect(t.cell('n').querySelector('.dzg-fsum')!.tagName).toBe('SPAN');
    t.g.update({ parts: { 'filter.atLeast': part } } as never);
    expect(t.cell('n').querySelector('.dzg-fsum')!.tagName).toBe('BUTTON');
    t.g.update({ parts: {} } as never);
    expect(t.cell('n').querySelector('.dzg-fsum')!.tagName).toBe('SPAN');
  });

  it('a host’s filter.text replaces the built-in one; a bare `filter` part is no fallback', () => {
    const part = definePart('filter', { mount: (h) => { h.append('own'); return {}; } });
    const t = open({ settings: { parts: { 'filter.text': part, filter: part } } });
    t.feature.openFilter('name');
    expect(t.popup()!.textContent).toBe('own');
    t.feature.closeFilter();
    expect(t.button('d')).toBeNull();
  });

  it('no part, no button, no key, and a floating summary that is not a button', () => {
    const t = open({ floating: true });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'd', filter: { type: 'set', include: ['2024-01-01'] } }, 'api');
    expect(t.button('d')).toBeNull();
    expect(t.cell('d').querySelector('.dzg-fsum')!.tagName).toBe('SPAN');
    t.key(t.header('d'), 'ArrowDown', { altKey: true });
    expect(t.popup()).toBeNull();
  });
});

describe('while it is open', () => {
  it('a filter set by the host redraws a clean form, keeps a dirty one', () => {
    vi.useFakeTimers();
    const t = open({ server: true });
    t.f.answer(['a']);
    t.feature.openFilter('name');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'endsWith', value: 'q' } }, 'api');
    t.f.answer(['a']);
    expect(t.op()!.value).toBe('endsWith');
    expect(t.value()!.value).toBe('q');
    t.fill(t.value()!, 'typed');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'equals', value: 'z' } }, 'api');
    t.f.answer(['a']);
    expect(t.value()!.value).toBe('typed');
    expect(t.op()!.value).toBe('endsWith');
  });

  it('follows the messages: a locale change renames the dialog and its fields', () => {
    const t = open();
    t.feature.openFilter('name');
    t.g.update({ messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } as never);
    expect(t.popup()!.getAttribute('aria-label')).toBe(FR_FILTERS.text['filter.popupLabel'].replace('{column}', 'Name'));
    expect(t.apply()!.textContent).toBe(FR_FILTERS.text['filter.apply']);
    expect(t.op()!.options[0]!.textContent).toBe(FR_FILTERS.text['filter.op.contains']);
  });

  it.each([
    ['the column hidden', (t: ReturnType<typeof open>) => t.g.update({ columns: [{ id: 'name', header: 'Name', hidden: true }, { id: 'n', type: 'number' }] } as never)],
    ['filter: false', (t: ReturnType<typeof open>) => t.g.update({ columns: [{ id: 'name', header: 'Name', filter: false }, { id: 'n', type: 'number' }] } as never)],
    ['another kind', (t: ReturnType<typeof open>) => t.g.update({ columns: [{ id: 'name', header: 'Name', type: 'number' }, { id: 'n', type: 'number' }] } as never)],
    ['a direction change', (t: ReturnType<typeof open>) => t.g.update({ direction: 'rtl' } as never)],
  ])('closes on %s, the focus back on the grid', (_, change) => {
    const t = open();
    t.button('name')!.click();
    expect(t.popup()).not.toBeNull();
    change(t);
    expect(t.popup()).toBeNull();
    expect(t.host.contains(document.activeElement)).toBe(true);
  });

  it('closes when its column leaves the column window, though the grid keeps its focused header mounted (D6)', () => {
    const columns = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100 }));
    const t = open({ columns, inline: 300 });
    t.header('c1').focus();
    t.button('c1')!.click();
    expect(t.popup()).not.toBeNull();
    t.scrollInline(800);
    // The header is still there (the grid's focus), out of view: the popup goes, the focus on its anchor.
    expect(t.header('c1')).not.toBeNull();
    expect(t.popup()).toBeNull();
    expect(document.activeElement).toBe(t.button('c1'));
    // Back in the window: opens again.
    t.scrollInline(0);
    t.button('c1')!.click();
    expect(t.popup()).not.toBeNull();
  });

  it('closes when the grid is destroyed: the part destroyed, nothing applied', () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const part = definePart('filter', { mount: (_h, c) => { c.set({ type: 'text', op: 'contains', value: 'q' }); return { destroy }; } });
    const t = open({ settings: { parts: { 'filter.text': part } } });
    t.feature.openFilter('name');
    const before = t.filterEvents().length;
    t.g.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(t.popup()).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(t.filterEvents()).toHaveLength(before);
  });
});

describe('the header’s mark and name', () => {
  it('a filtered column: data-dzg-filtered and “, filtered” in its name; cleared with the filter', () => {
    const t = open();
    expect(t.header('n').hasAttribute('data-dzg-filtered')).toBe(false);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 3 } }, 'api');
    expect(t.header('n').hasAttribute('data-dzg-filtered')).toBe(true);
    expect(t.header('n').getAttribute('aria-label')).toBe('N, filtered');
    t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
    expect(t.header('n').hasAttribute('data-dzg-filtered')).toBe(false);
    expect(t.header('n').getAttribute('aria-label')).not.toMatch(/filtered/);
  });

  it('the sort’s name first, then the filter’s; never wrapped twice across paints', () => {
    const t = open();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }, { column: 'n', dir: 'desc' }] } as never, 'api');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 3 } }, 'api');
    const withSort = EN.text['header.withSort'].replace('{header}', 'N').replace('{priority}', EN.text['sort.priority'].toString().replace('{n}', '2'));
    expect(t.header('n').getAttribute('aria-label')).toBe(`${withSort}, filtered`);
    (t.g as unknown as { api: { refresh(): void } }).api.refresh();
    expect(t.header('n').getAttribute('aria-label')).toBe(`${withSort}, filtered`);
  });

  it('a header with a filter button keeps the column’s own name (the button’s is not part of it)', () => {
    const t = open();
    expect(t.header('name').getAttribute('aria-label')).toBe('Name');
    expect(t.header('d').getAttribute('aria-label')).toBeNull();
  });

  it('keeps the button and the mark beside a host’s header part', () => {
    const header = definePart('header', { mount: (h, c) => { h.textContent = `<${c.label}>`; return { update: (n) => { h.textContent = `<${n.label}>`; } }; } });
    const t = open({ features: [slots(), filters()], settings: { parts: { header } } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, 'api');
    expect(t.header('name').querySelector('.dzg-hlabel')!.textContent).toBe('<Name>');
    expect(t.button('name')).not.toBeNull();
    expect(t.header('name').hasAttribute('data-dzg-filtered')).toBe(true);
  });
});

describe('with the floating row', () => {
  it('the summary is a button that opens the popup, anchored to it, expanded while open', () => {
    const t = open({ floating: true });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'between', value: 1, valueTo: 5 } }, 'api');
    const b = t.cell('n').querySelector<HTMLButtonElement>('button.dzg-fsum')!;
    expect(b).not.toBeNull();
    expect(b.textContent).toBe('Filter active');
    expect(b.tabIndex).toBe(-1);
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.click();
    expect(t.popup()).not.toBeNull();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(t.op()!.value).toBe('between');
    t.press('Escape');
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-expanded')).toBe('false');
    // Its Clear stays beside it.
    expect(t.cell('n').querySelector('.dzg-fclear')).not.toBeNull();
  });

  it('opening flushes the floating box’s pending edit', () => {
    vi.useFakeTimers();
    const t = open({ floating: true });
    t.type('name', 'ann');
    expect(t.filter()).toEqual({});
    t.button('name')!.click();
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
    expect(t.value()!.value).toBe('ann');
    const n = t.filterEvents().length;
    vi.advanceTimersByTime(1000);
    expect(t.filterEvents()).toHaveLength(n);
  });

  it('popup and box share one pending edit per column: the last write wins', () => {
    vi.useFakeTimers();
    const t = open({ floating: true });
    t.feature.openFilter('name');
    t.fill(t.value()!, 'ann');
    t.type('name', 'bob');
    vi.advanceTimersByTime(150);
    expect(t.filterEvents()).toHaveLength(1);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'bob' });
  });
});

describe('texts', () => {
  it('filters() throws naming the popup keys a step-12 bundle lacks', () => {
    const old = Object.fromEntries(Object.entries(EN_FILTERS.text).filter(([k]) => ['filter.inputLabel', 'filter.summaryActive', 'filter.clear', 'filter.invalid', 'announce.filtered', 'announce.filteredOpen'].includes(k)));
    expect(() => open({ settings: { messages: { locale: 'en', text: { ...EN.text, ...old } } } })).toThrow(TypeError);
    expect(() => open({ settings: { messages: { locale: 'en', text: { ...EN.text, ...old } } } })).toThrow(/filter\.popupLabel.*header\.withFilter.*filter\.op\.contains/);
  });

  it('names the dialog and the mark in French and Arabic', () => {
    const fr = open({ settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } });
    fr.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 3 } }, 'api');
    expect(fr.header('n').getAttribute('aria-label')).toBe('N, filtré');
    fr.feature.openFilter('n');
    expect(fr.popup()!.getAttribute('aria-label')).toBe(FR_FILTERS.text['filter.popupLabel'].replace('{column}', 'N'));
    cleanup();
    const ar = open({ settings: { messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, direction: 'rtl' } });
    ar.feature.openFilter('n');
    expect(ar.popup()!.getAttribute('aria-label')).toBe(AR_FILTERS.text['filter.popupLabel'].replace('{column}', 'N'));
    expect(ar.popup()!.getAttribute('dir')).toBe('rtl');
  });
});

describe('the header decoration seam (base)', () => {
  it('calls a feature’s decorateHeader after the base’s, on column headers only, at each paint', () => {
    const seen: string[] = [];
    const probe: GridFeature = { id: 'probe', setup: () => ({ decorateHeader: (col, cell) => void seen.push(`${col.id}:${cell.getAttribute('role')}:${cell.getAttribute('aria-sort') ?? '-'}:${!!cell.querySelector(':scope > .dzg-resize')}`), destroy() {} }) };
    const t = make({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', type: 'number' }], features: [probe, filters({ floating: true })] });
    expect(seen).toEqual(['name:columnheader:-:true', 'n:columnheader:-:true']);
    seen.length = 0;
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    // The base set the sort first: the hook sees it.
    expect(seen).toEqual(['name:columnheader:-:true', 'n:columnheader:ascending:true']);
  });
});
