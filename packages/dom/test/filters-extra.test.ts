// Gaps left by the step-12 tests: columns changing under a pending edit, announcements after a
// failed server answer, texts changing without a locale change.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, make, MESSAGES } from './support-filters.js';

afterEach(cleanup);

describe('columns changing under a pending edit', () => {
  it('E: redefine columns (order swap) with text typed and pending: no text crosses columns', () => {
    vi.useFakeTimers();
    const t = make({ columns: [{ id: 'name' }, { id: 'd' as never, header: 'D' }] as never });
    t.type('name', 'bo');
    t.g.update({ columns: [{ id: 'd', header: 'D' }, { id: 'name' }] } as never);
    vi.advanceTimersByTime(150);
    expect(t.input('d' as never)?.value ?? '').toBe('');
    expect(t.input('name')!.value).toBe('bo');
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bo' });
  });
  it('G: hide a column with an edit pending: applied', () => {
    vi.useFakeTimers();
    const t = make();
    t.type('name', 'bo');
    t.g.update({ columns: [{ id: 'name', hidden: true }, { id: 'n', header: 'N', type: 'number' }] } as never);
    vi.advanceTimersByTime(150);
    expect(t.problems()).toEqual([]);
    expect(t.g.kernel.query.filter['name']).toMatchObject({ value: 'bo' });
  });
});

describe('after a failed server answer', () => {
  it('a later answer the user did not ask for by filtering says no filtered count', () => {
    vi.useFakeTimers();
    const t = make({ server: true });
    t.f.answer(['a', 'b'], { total: 2 });
    const said = vi.spyOn(t.live, 'announce');
    t.type('name', 'a');
    vi.advanceTimersByTime(300);
    t.f.fail(new Error('down'));
    said.mockClear();
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'name', multi: false }, 'user');
    t.f.answer(['a'], { total: 1 });
    expect(said.mock.calls.map((c) => c[0]).filter((s) => /^Filtered/.test(String(s)))).toEqual([]);
  });
});

describe('texts changing under the box', () => {
  it('new messages alone (same locale) rename the box', () => {
    const t = make();
    const before = t.input('name')!.getAttribute('aria-label');
    t.g.update({ messages: { ...MESSAGES, text: { ...MESSAGES.text, 'filter.inputLabel': 'Find in {column}' } } } as never);
    expect(t.input('name')!.getAttribute('aria-label')).toBe('Find in Name');
    expect(before).not.toBe('Find in Name');
  });
});


describe('an unknown filter kind', () => {
  it('is told again once the parts registry changes', () => {
    const t = make({ columns: [{ id: 'name', filter: { kind: 'nope' } }] });
    const told = () => t.problems().filter((p) => p.code === 'invalid-filter');
    expect(told()).toHaveLength(1);
    t.g.update({ parts: {} } as never);
    t.g.api.refresh();
    expect(told()).toHaveLength(2);
  });
});
