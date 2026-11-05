// Phase 7 step 7: the row grouping in the saved state (docs/behaviors/grid-state.md « Row grouping » 1–6; owner Q-ST A):
// `@dzgrid/dom/grouping` hands `@dzgrid/dom/state` its columns; a regroup is a gesture, told by `groupByChanged`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { gridState } from '../src/state.js';
import { fromSearchParams, toSearchParams } from '../src/state.js';
import { cleanup, gmake } from './support-grouping.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// The events of one type read by field (`source`, `by`, `state`): `as any`, a test helper over the whole event union.
const of = (events: { type: string }[], type: string) => events.filter((e) => e.type === type) as any[];

describe('rowGroups in the state', () => {
  it('a grouped grid writes its grouping columns, never an open group; a grid without grouping writes none', () => {
    const st = gridState();
    const t = gmake({ features: [st] });
    t.api().expandAll();
    const s = st.api(t.g)!.state();
    expect(s.rowGroups).toEqual(['region']);
    // The open group « Nord » is in memory only (its key holds the value): not in the state's text.
    expect(JSON.stringify(s)).not.toMatch(/Nord|Sud/);
    cleanup();
    const flat = gridState();
    const u = gmake({ grouping: null, features: [flat] });
    expect('rowGroups' in flat.api(u.g)!.state()).toBe(false);
  });

  it('setState regroups as the host: groupByChanged told with source host, no stateChanged; what it skipped returned', () => {
    vi.useFakeTimers();
    const st = gridState();
    const t = gmake({ features: [st] });
    const problems = st.api(t.g)!.setState({ v: 1, rowGroups: ['ghost', 'fruit'] });
    expect(problems.map((p) => [p.code, p.path, p.detail])).toEqual([['state-column', 'rowGroups.0', 'ghost']]);
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.shown()).toEqual(['[apple]', '[fig]', '[pear]']);
    expect(of(t.events, 'groupByChanged').map((e) => [e.source, e.by])).toEqual([['host', ['fruit']]]);
    vi.advanceTimersByTime(1000);
    expect(of(t.events, 'stateChanged')).toEqual([]);
  });

  it('a user regroup is a gesture: groupByChanged (user), then one stateChanged after the pause', () => {
    vi.useFakeTimers();
    const st = gridState();
    const t = gmake({ features: [st] });
    t.api().setBy(['fruit', 'region'], { user: true });
    // The same columns again: nothing told.
    t.api().setBy(['fruit', 'region'], { user: true });
    expect(of(t.events, 'groupByChanged').map((e) => [e.source, e.by])).toEqual([['user', ['fruit', 'region']]]);
    vi.advanceTimersByTime(300);
    const changed = of(t.events, 'stateChanged');
    expect(changed).toHaveLength(1);
    expect(changed[0].source).toBe('user');
    expect(changed[0].state.rowGroups).toEqual(['fruit', 'region']);
    // The application's setBy is told as `api`.
    t.api().setBy([]);
    expect(of(t.events, 'groupByChanged').at(-1)).toMatchObject({ source: 'api', by: [] });
  });

  it('reset() brings back the grouping the application gave', () => {
    const st = gridState();
    const t = gmake({ grouping: { by: ['fruit'] }, features: [st] });
    t.api().setBy(['region'], { user: true });
    st.api(t.g)!.reset();
    expect(t.api().by()).toEqual(['fruit']);
  });

  it('a stored state regroups the grid at creation (grouping listed before gridState)', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, rowGroups: ['fruit'] }));
    const t = gmake({ features: [gridState({ persist: { key: 'k' } })] });
    expect(t.api().by()).toEqual(['fruit']);
  });

  it('review 1: an address over 4 KB keeps rowGroups with the columns and the sort', () => {
    const st = gridState();
    const t = gmake({ features: [st] });
    const big = { ...st.api(t.g)!.state(), filter: { fruit: { type: 'text', op: 'contains', value: 'x'.repeat(5000) } } } as never; // a filter long enough to pass 4 KB
    const { params, problems } = toSearchParams(big, { include: ['filter'] });
    expect(problems.map((p) => p.detail)).toEqual(['too-large']);
    expect(fromSearchParams(params).state!.rowGroups).toEqual(['region']);
  });

  it('review 2: a stored state applies its grouping when gridState is listed before grouping', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, rowGroups: ['fruit', 'ghost'] }));
    const t = gmake({ before: [gridState({ persist: { key: 'k' } })] });
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.problems().map((p) => [p.code, p.path])).toContainEqual(['state-column', 'rowGroups.1']);
  });

  it('review 4: the state saves the grouping columns in use, not refused ones', () => {
    const st = gridState();
    const t = gmake({ grouping: { by: ['ghost', 'region'] }, features: [st] });
    expect(st.api(t.g)!.state().rowGroups).toEqual(['region']);
  });

  it('the address carries rowGroups (ids only) and reads them back', () => {
    const st = gridState();
    const t = gmake({ features: [st] });
    const { params } = toSearchParams(st.api(t.g)!.state());
    expect(fromSearchParams(params).state!.rowGroups).toEqual(['region']);
  });

  it('the grouping destroyed takes its state adapter with it', () => {
    const st = gridState();
    const t = gmake({ grouping: { by: ['region'] }, features: [st] });
    t.g.destroy();
    // After destroy the grouping's adapter is gone with it.
    expect((t.ctx as { rowGroups?: unknown }).rowGroups).toBeUndefined();
  });
});
