// Gaps in the popup's tests (step 13), each killing a mutant the step's own tests let live.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { filters } from '../src/filters.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);
function open(o: Parameters<typeof make>[0] = {}) {
  const feature = filters() as ReturnType<typeof filters>;
  const t = make({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }], features: [feature], ...o });
  const q = <E extends Element = HTMLElement>(s: string) => t.host.querySelector<E>(`.dzg-popup ${s}`);
  const fill = (i: HTMLInputElement, text: string) => { i.value = text; i.dispatchEvent(new InputEvent('input', { bubbles: true })); };
  return { ...t, feature, q, fill, filter: () => t.g.kernel.query.filter };
}

describe('the popup in the browser, an unreadable number', () => {
  // forms.ts changed(): an edit that does not read drops the one still pending (filter-ui.md
  // "Numbers": "an edit still pending is dropped"). Without it, `5` typed then `5x` applies 5.
  it('drops the edit still pending: neither the pause nor Escape applies the earlier number', () => {
    vi.useFakeTimers();
    const t = open();
    t.feature.openFilter('n');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '5');
    vi.advanceTimersByTime(100);
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '5x');
    vi.advanceTimersByTime(1000);
    expect(t.filter()).toEqual({});
    expect(t.q('input.dzg-fval')!.getAttribute('aria-invalid')).toBe('true');
    t.press('Escape');
    vi.advanceTimersByTime(1000);
    expect(t.filter()).toEqual({});
  });

  it('keeps the filter in force when the number stops reading', () => {
    vi.useFakeTimers();
    const t = open();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 4 } }, 'api');
    t.feature.openFilter('n');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, '7');
    t.fill(t.q<HTMLInputElement>('input.dzg-fval')!, 'abc');
    vi.advanceTimersByTime(1000);
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'equals', value: 4 });
  });
});
