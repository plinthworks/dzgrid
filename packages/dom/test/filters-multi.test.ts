// A value list and a condition in one popup (Phase 9 F2; docs/behaviors/filter-multi.md, owner Q-F3 A).
// Expectations written by hand. The set chunk handed in through `loadSet`, as in filters-set.test.ts.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { cleanup } from './support-filters.js';
import { grid, ROWS, type Row } from './support-set.js';

afterEach(cleanup);

const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Name' },
  { id: 'city', header: 'City', filter: { kind: 'set', condition: true } },
  { id: 'n', header: 'N', type: 'number', filter: { kind: 'set', condition: true } },
  { id: 'plain', header: 'Plain', value: (r: Row) => r.city, filter: { kind: 'set' } },
];
const fill = (i: HTMLInputElement, text: string) => {
  i.value = text;
  i.dispatchEvent(new InputEvent('input', { bubbles: true }));
};
const choose = (s: HTMLSelectElement, v: string) => {
  s.value = v;
  s.dispatchEvent(new Event('change', { bubbles: true }));
};
function open(o: Parameters<typeof grid>[0] = {}) {
  const t = grid({ columns: COLS, ...o });
  const value = () => t.q<HTMLInputElement>('input.dzg-fval')!;
  const op = () => t.q<HTMLSelectElement>('select.dzg-fop')!;
  return { ...t, value, op };
}

describe('stacked in one popup', () => {
  it('the condition at the top, a separator, the list below, one footer', async () => {
    const t = open();
    await t.open('city');
    const p = t.popup()!;
    const known = ['dzg-fop', 'dzg-fval', 'dzg-fsep', 'dzg-fsearch', 'dzg-flist', 'dzg-ffoot'];
    const order = [...p.querySelectorAll('select.dzg-fop, input.dzg-fval, hr, input.dzg-fsearch, [role=listbox], .dzg-ffoot')].map((e) => e.tagName + '.' + known.find((c) => e.classList.contains(c)));
    expect(order).toEqual(['SELECT.dzg-fop', 'INPUT.dzg-fval', 'HR.dzg-fsep', 'INPUT.dzg-fsearch', 'DIV.dzg-flist', 'DIV.dzg-ffoot']);
    expect(p.querySelector('hr')!.getAttribute('role')).toBe('presentation');
    expect(p.querySelectorAll('.dzg-ffoot')).toHaveLength(1);
    // The text condition's operators on a text column.
    expect([...t.op().options].map((o) => o.value)[0]).toBe('contains');
  });

  it('without condition: today’s list alone', async () => {
    const t = open();
    await t.open('plain');
    expect(t.q('select.dzg-fop')).toBeNull();
    expect(t.q('hr')).toBeNull();
    expect(t.list()).not.toBeNull();
  });

  it('a number column takes the number condition', async () => {
    const t = open();
    await t.open('n');
    expect([...t.op().options].map((o) => o.value)).toContain('between');
  });

  it('Tab order: the condition, the list’s search, select all, the list (its one row in the Tab order), the footer', async () => {
    const t = open();
    await t.open('city');
    const tabbable = [...t.popup()!.querySelectorAll<HTMLElement>('select, input, button, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.closest('[hidden]'));
    const known = ['dzg-fop', 'dzg-fval', 'dzg-fsearch', 'dzg-fall', 'dzg-fopt', 'dzg-fclr', 'dzg-fapply'];
    expect(tabbable.map((e) => known.find((c) => e.classList.contains(c)) ?? e.className)).toEqual(['dzg-fop', 'dzg-fval', 'dzg-fsearch', 'dzg-fall', 'dzg-fopt', 'dzg-fclr', 'dzg-fapply']);
  });
});

describe('what is stored', () => {
  it('a condition alone: plain; a tick then: a combined AND, the condition first; the condition emptied: the list alone, plain', async () => {
    vi.useFakeTimers();
    const t = open();
    await t.open('city');
    fill(t.value(), 'a');
    vi.advanceTimersByTime(150);
    expect(t.filter()['city']).toEqual({ type: 'text', op: 'contains', value: 'a' });
    t.option('Alger').click();
    vi.advanceTimersByTime(150);
    expect(t.filter()['city']).toEqual({ type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'a' }, { type: 'set', exclude: ['Alger'] }] });
    // Contains « a » (folded): Oran, Blida, Annaba; Alger left out by the list; Sétif and blanks by the condition.
    expect(t.ids().map((id) => ROWS.find((r) => r.id === id)!.city).sort()).toEqual([...Array(6).fill('Annaba'), ...Array(6).fill('Blida'), ...Array(6).fill('Oran')].sort());
    fill(t.value(), '');
    vi.advanceTimersByTime(150);
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Alger'] });
  });

  it('a condition row that cannot filter yet leaves the list alone, plain (never the list dropped)', async () => {
    vi.useFakeTimers();
    const t = open();
    await t.open('n');
    t.option('3').click();
    choose(t.op(), 'between');
    fill(t.value(), '1');
    vi.advanceTimersByTime(150);
    expect(t.filter()['n']).toEqual({ type: 'set', exclude: ['3'] });
  });

  it('Clear empties both', async () => {
    vi.useFakeTimers();
    const t = open();
    await t.open('city');
    fill(t.value(), 'a');
    t.option('Alger').click();
    vi.advanceTimersByTime(150);
    t.q<HTMLButtonElement>('.dzg-fclr')!.click();
    expect(t.filter()['city']).toBeUndefined();
    expect(t.value().value).toBe('');
    expect(t.selected()).toContain('Alger');
  });

  it('on a server (apply: button here): nothing until Apply, one write with both parts', async () => {
    vi.useFakeTimers();
    const t = open({ options: { apply: 'button' } });
    await t.open('city');
    const before = t.filterEvents().length;
    fill(t.value(), 'o');
    t.option('Oran').click();
    vi.advanceTimersByTime(1000);
    expect(t.filterEvents().length).toBe(before);
    t.apply();
    expect(t.filterEvents().length).toBe(before + 1);
    expect(t.filter()['city']).toEqual({ type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'o' }, { type: 'set', exclude: ['Oran'] }] });
  });

  it('several condition rows (maxConditions) nest once under the AND', async () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 2 } });
    await t.open('city');
    fill(t.value(), 'a');
    t.q<HTMLButtonElement>('button.dzg-fadd')!.click();
    fill(t.popup()!.querySelectorAll<HTMLInputElement>('input.dzg-fval')[1]!, 'i');
    t.option('Blida').click();
    vi.advanceTimersByTime(150);
    expect(t.filter()['city']).toEqual({ type: 'combined', join: 'and', conditions: [
      { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'a' }, { type: 'text', op: 'contains', value: 'i' }] },
      { type: 'set', exclude: ['Blida'] },
    ] });
  });
});

describe('what it shows', () => {
  it('a stored [condition, set] fills both parts', async () => {
    const t = open();
    t.set('city', { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'startsWith', value: 'O' }, { type: 'set', include: ['Oran'] }] });
    await t.open('city');
    expect([t.op().value, t.value().value]).toEqual(['startsWith', 'O']);
    expect(t.selected()).toEqual(['Oran']);
  });

  it('a set first, an OR, or two sets: « Filter active »', async () => {
    const s = { type: 'set', include: ['Oran'] };
    const c = { type: 'text', op: 'contains', value: 'o' };
    for (const f of [
      { type: 'combined', join: 'and', conditions: [s, c] },
      { type: 'combined', join: 'or', conditions: [c, s] },
      { type: 'combined', join: 'and', conditions: [s, s] },
    ]) {
      const t = open();
      t.set('city', f);
      await t.open('city');
      expect(t.q('.dzg-fsum')?.textContent, JSON.stringify(f)).toBe('Filter active');
      cleanup();
    }
  });

  it('the floating row says « Filter active »', () => {
    const t = open({ floating: true });
    t.set('city', { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'o' }, { type: 'set', include: ['Oran'] }] });
    expect(t.cell('city').querySelector('.dzg-fsum')!.textContent).toBe('Filter active');
  });
});
