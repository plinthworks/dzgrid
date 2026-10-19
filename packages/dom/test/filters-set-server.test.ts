// The set filter's list on a server (step 15; docs/behaviors/filter-set.md "Search", "Loading and
// errors of the list"; value-list.md "On a server"): a fake DataSource.values answering late,
// failing, superseded; the search after the pause and never inside an input method.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ValuesRequest } from '@dzgrid/core/server';
import { EN } from '../src/locales/en.js';
import { cleanup } from './support-filters.js';
import { grid, T, TOWNS } from './support-set.js';

afterEach(cleanup);

/** A source's `values` whose every call is answered (or failed) by the test. */
function values() {
  const calls: { req: ValuesRequest; ok(v: unknown): void; no(e: unknown): void }[] = [];
  const fn = (req: ValuesRequest) => new Promise((ok, no) => calls.push({ req, ok, no }));
  const answer = (towns = TOWNS, i = calls.length - 1) => calls[i]!.ok({ values: towns.map((v) => ({ value: v, count: 2 })), blanks: 1 });
  return { fn, calls, answer };
}
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function open() {
  const v = values();
  const t = grid({ server: true, values: v.fn });
  t.f.answer(['a']);
  vi.useFakeTimers();
  await t.open();
  return { t, v };
}

describe('loading', () => {
  it('nothing yet: the loading line inside the list’s frame, aria-busy; then the list', async () => {
    const { t, v } = await open();
    expect(v.calls).toHaveLength(1);
    expect(t.list().getAttribute('aria-busy')).toBe('true');
    expect(t.q('.dzg-flistw [role=status]')!.textContent).toBe(EN.text['grid.loading']);
    v.answer();
    await tick();
    expect(t.list().hasAttribute('aria-busy')).toBe(false);
    expect(t.q('.dzg-flistw .dzg-fload')).toBeNull();
    expect(t.labels()).toEqual([T['filter.set.blanks'], ...TOWNS]);
    expect(t.status().textContent).toBe('5 values');
  });

  it('a search goes to the server after the pause (300 ms), once', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('o');
    t.type('or');
    vi.advanceTimersByTime(299);
    expect(v.calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(v.calls).toHaveLength(2);
    expect(v.calls[1]!.req.search).toBe('or');
  });

  it('loading with an older list: the older list stays, aria-busy; the new one replaces it', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('or');
    vi.advanceTimersByTime(300);
    expect(t.labels()).toContain('Alger');
    expect(t.list().getAttribute('aria-busy')).toBe('true');
    v.answer(['Oran']);
    await tick();
    expect(t.labels()).toEqual(['Oran']);
    expect(t.list().hasAttribute('aria-busy')).toBe(false);
  });

  it('a newer search supersedes the one in flight (aborted)', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('o');
    vi.advanceTimersByTime(300);
    t.type('or');
    vi.advanceTimersByTime(300);
    expect(v.calls).toHaveLength(3);
    expect(v.calls[1]!.req.signal.aborted).toBe(true);
  });

  it('nothing is asked inside an input method’s composition; its end asks after the pause', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    const s = t.search();
    s.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    s.value = 'و';
    s.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    vi.advanceTimersByTime(1000);
    expect(v.calls).toHaveLength(1);
    s.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(v.calls).toHaveLength(2);
    expect(v.calls[1]!.req.search).toBe('و');
  });
});

describe('the half rule waits for the whole list (review)', () => {
  it('a cleared search whose answer is not in yet: unticking the searched values stays an exclude', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('or');
    vi.advanceTimersByTime(300);
    v.answer(['Oran', 'Alger']);
    await tick();
    t.type('');
    vi.advanceTimersByTime(300);
    expect(v.calls).toHaveLength(3);
    t.option('Oran').click();
    t.option('Alger').click();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Alger', 'Oran'] });
  });
});

describe('failure', () => {
  it('an alert and Retry, the older list kept; Retry puts the focus in the search and asks again', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('or');
    vi.advanceTimersByTime(300);
    v.calls[1]!.no(new Error('down'));
    await tick();
    const alert = t.q('.dzg-flistw [role=alert]')!;
    expect(alert.textContent).toBe(T['filter.set.failed']);
    expect(t.labels()).toContain('Alger');
    const retry = t.q<HTMLButtonElement>('.dzg-flistw .dzg-fretry')!;
    expect(retry.textContent).toBe(EN.text['grid.retry']);
    retry.focus();
    retry.click();
    expect(document.activeElement).toBe(t.search());
    expect(v.calls).toHaveLength(3);
    v.answer(['Oran']);
    await tick();
    expect(t.q('[role=alert]')).toBeNull();
    expect(t.labels()).toEqual(['Oran']);
  });
});

describe('closing', () => {
  it('cancels what is asked and leaves nothing pending', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.type('or');
    t.press('Escape');
    vi.advanceTimersByTime(1000);
    expect(v.calls).toHaveLength(1);
    const rows = t.f.calls.length;
    vi.advanceTimersByTime(1000);
    expect(t.f.calls.length).toBe(rows);
  });

  it('a request in flight is aborted when the popup closes', async () => {
    const { t, v } = await open();
    t.press('Escape');
    expect(v.calls[0]!.req.signal.aborted).toBe(true);
  });

  it('Apply sends one rows request, and the announcement waits for the answer', async () => {
    const { t, v } = await open();
    v.answer();
    await tick();
    t.option('Oran').click();
    const before = t.f.calls.length;
    const said = vi.spyOn(t.live, 'announce');
    t.apply();
    expect(said).not.toHaveBeenCalled();
    t.f.answer(['a', 'b'], { total: 2 });
    expect(said).toHaveBeenCalledTimes(1);
    expect(said.mock.calls[0]![0]).toContain('2 rows');
    expect(t.f.calls.length).toBe(before + 1);
  });
});
