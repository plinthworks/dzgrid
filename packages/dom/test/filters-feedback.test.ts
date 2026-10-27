// Feedback pass (docs/phase-6-steps/feedback-plan.md; app-feedback.md): B « Condition » hidden for a single operator
// (item 3), H `data-column` / `data-kind` on the popup's content (item 9, owner Q5), J the Clear button's visible
// text without the column and a footer that does not wrap (fr `filter.clear` shortened).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { FILTERS_CSS } from '../src/filters/styles.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { FR } from '../src/locales/fr.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, make, type Make, type R } from './support-filters.js';

afterEach(cleanup);
type Feature = GridFeature & { openFilter(column: string): boolean; closeFilter(): void };

function open(o: Make = {}) {
  const f = filters() as Feature;
  const t = make({ ...o, features: [f] });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(sel: string) => popup()?.querySelector<E>(sel) ?? null;
  const op = () => q<HTMLSelectElement>('select.dzg-fop');
  const value = () => q<HTMLInputElement>('input.dzg-fval');
  const hidden = (el: Element | null) => !!el?.closest('[hidden]');
  const fill = (i: HTMLInputElement, text: string) => {
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  return { ...t, feature: f, popup, q, op, value, hidden, fill, filter: () => t.g.kernel.query.filter };
}

const one: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', filter: { ops: ['startsWith'] } }, { id: 'n', header: 'N', type: 'number', filter: { ops: ['equals', 'between'] } }];

describe('B: « Condition » hidden when the column offers one operator', () => {
  it('one operator: the select and its label hidden (out of the tab order), the value focused, the operator used', () => {
    vi.useFakeTimers();
    const t = open({ columns: one });
    t.feature.openFilter('name');
    expect(t.op()).not.toBeNull();
    expect(t.hidden(t.op())).toBe(true);
    expect(document.activeElement).toBe(t.value());
    expect(t.hidden(t.value())).toBe(false);
    // The value's own label names it: its accessible name does not hang on the hidden one.
    expect(t.value()!.closest('label')!.textContent).toBe('Value');
    t.fill(t.value()!, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'startsWith', value: 'ann' });
  });

  it('two operators: the select shown', () => {
    const t = open({ columns: one });
    t.feature.openFilter('n');
    expect(t.hidden(t.op())).toBe(false);
    expect([...t.op()!.options].map((o) => o.value)).toEqual(['equals', 'between']);
  });

  it('the operators changed live, 2 -> 1 -> 2: hidden then shown, the typed value kept', () => {
    const t = open({ columns: one });
    t.feature.openFilter('n');
    t.fill(t.value()!, '4');
    t.g.update({ columns: [one[0]!, { id: 'n', header: 'N', type: 'number', filter: { ops: ['equals'] } }] } as never);
    expect(t.hidden(t.op())).toBe(true);
    expect(t.value()!.value).toBe('4');
    t.g.update({ columns: one } as never);
    expect(t.hidden(t.op())).toBe(false);
    expect(t.value()!.value).toBe('4');
  });

  it('a single date operator (the app\'s instant column, `ops: [\'betweenDays\']`): no « Condition » either', () => {
    const t = open({ columns: [{ id: 'd', header: 'D', type: 'instant', filter: { kind: 'instant', ops: ['betweenDays'] } }] });
    t.feature.openFilter('d');
    const select = t.q<HTMLSelectElement>('select.dzg-fop');
    expect(select).not.toBeNull();
    expect(t.hidden(select)).toBe(true);
  });
});

describe('H: the popup\'s content says which column and kind it holds', () => {
  it('data-column and data-kind on .dzg-fpop; a popup for another column carries its own', () => {
    const t = open({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }] });
    t.feature.openFilter('name');
    let c = t.q('.dzg-fpop')!;
    expect([c.dataset['column'], c.dataset['kind']]).toEqual(['name', 'text']);
    t.feature.openFilter('n');
    c = t.q('.dzg-fpop')!;
    expect([c.dataset['column'], c.dataset['kind']]).toEqual(['n', 'number']);
    t.feature.closeFilter();
    expect(t.popup()).toBeNull();
  });
});

describe('J: the Clear button keeps the column in its name, not in its text; the footer does not wrap', () => {
  it('fr: « Effacer {column} », shorter; the popup\'s button shows « Effacer », named « Effacer Nom »', () => {
    expect(FR_FILTERS.text['filter.clear']).toBe('Effacer {column}');
    const t = open({ columns: [{ id: 'name', header: 'Nom' }], settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } } });
    t.feature.openFilter('name');
    const b = t.q<HTMLButtonElement>('button.dzg-fclr')!;
    expect(b.textContent).toBe('Effacer');
    expect(b.getAttribute('aria-label')).toBe('Effacer Nom');
  });

  it('en and ar: the visible text is the start of the name (WCAG 2.5.3), the column after it', () => {
    for (const [bundle, col] of [[EN_FILTERS, 'A very long column name indeed, forty chars'], [AR_FILTERS, 'اسم عمود طويل جدا']] as const) {
      cleanup();
      const t = open({ columns: [{ id: 'name', header: col }], settings: { messages: { locale: bundle.locale, text: { ...FR.text, ...bundle.text } } } });
      t.feature.openFilter('name');
      const b = t.q<HTMLButtonElement>('button.dzg-fclr')!;
      expect(b.textContent).not.toContain(col);
      expect(b.getAttribute('aria-label')!.startsWith(b.textContent!)).toBe(true);
      expect(b.getAttribute('aria-label')).toContain(col);
    }
  });

  it('the footer\'s buttons do not wrap their text', () => {
    expect(FILTERS_CSS).toMatch(/:where\(\.dzg-ffoot\)\{[^}]*white-space:nowrap/);
  });
});
