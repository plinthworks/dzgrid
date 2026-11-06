// The dock in the grid's state (Phase 9, docs/behaviors/dock.md 11; grid-state.md): `GridState.dock` written and
// applied by `gridState()` when the grid has `dock()`, a dock change is a gesture (`stateChanged` after the pause), a
// state restored before the dock was set up is applied at its setup, `reset()` puts the dock back. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridEvent } from '@dzgrid/core';
import { dock, type DockOptions } from '../src/dock.js';
import { gridState, type GridStateOptions } from '../src/state.js';
import { EN } from '../src/locales/en.js';
import { EN_DOCK } from '../src/locales/en-dock.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

const MSG: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_DOCK.text } };
const PANELS = [{ id: 'notes', title: 'Notes', mount() {} }, { id: 'help', title: 'Help', mount() {} }];

function grid(o: { dock?: DockOptions | false; state?: GridStateOptions; stateFirst?: boolean } = {}) {
  vi.useFakeTimers();
  const st = gridState(o.state);
  const d = dock({ panels: PANELS, ...(o.dock || {}) });
  const fs = o.dock === false ? [st] : o.stateFirst ? [st, d] : [d, st];
  const t = make({ features: fs, settings: { messages: MSG } });
  const changed = () => t.events.filter((e): e is Extract<GridEvent<R>, { type: 'stateChanged' }> => e.type === 'stateChanged');
  const area = (s: string) => t.host.querySelector<HTMLElement>(`.dzg-dock[data-area=${s}]`)!;
  return { ...t, s: () => st.api(t.g)!, d: () => d.api(t.g)!, changed, area };
}

describe('the dock in the grid’s state', () => {
  it('written with the dock; absent without it', () => {
    const t = grid({ dock: { open: { notes: 'start' } } });
    expect(t.s().state().dock).toEqual({ panels: { notes: { area: 'start', open: true }, help: { area: 'end', open: false } }, areas: { start: { active: 'notes' } } });
    expect('dock' in grid({ dock: false }).s().state()).toBe(false);
  });

  it('a change of the dock is a gesture: one stateChanged after the pause, source user; the API’s, source api', () => {
    const t = grid({ dock: { open: { notes: 'end' } } });
    const sep = t.area('end').querySelector<HTMLElement>('.dzg-dock-sep')!;
    t.key(sep, 'ArrowLeft');
    t.key(sep, 'ArrowLeft');
    expect(t.changed()).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(t.changed().map((e) => [e.source, e.state.dock?.areas])).toEqual([['user', { end: { active: 'notes', size: 320 } }]]);
    t.d().show('help', 'bottom');
    vi.advanceTimersByTime(300);
    expect(t.changed().map((e) => e.source)).toEqual(['user', 'api']);
    expect(t.changed()[1]!.state.dock?.panels['help']).toEqual({ area: 'bottom', open: true });
  });

  it('setState puts each panel back (a restore: no stateChanged); `float` refused and told', () => {
    const t = grid();
    const p = t.s().setState({ v: 1, dock: { panels: { notes: { area: 'bottom', open: true }, help: { area: 'float', open: true } }, areas: { bottom: { size: 300 } } } });
    expect(p.map((x) => [x.code, x.path, x.detail])).toEqual([['state-field', 'dock.panels.help.area', 'float']]);
    expect([t.area('bottom').hidden, t.area('end').hidden]).toEqual([false, true]);
    vi.advanceTimersByTime(300);
    expect(t.changed()).toEqual([]);
  });

  it('a state given before the dock is set up (gridState listed first) applies at its setup, its problems told', () => {
    const t = grid({ stateFirst: true, state: { initial: { v: 1, dock: { panels: { help: { area: 'start', open: true }, notes: { area: 'up' as never, open: true } }, areas: {} } } } }); // 'up': an area the dock does not know, as a stored state may hold
    expect(t.area('start').hidden).toBe(false);
    expect(t.d().layout().panels).toEqual({ help: { area: 'start', open: true }, notes: { area: 'end', open: false } });
    expect(t.problems().map((x) => [x.code, x.path])).toEqual([['state-field', 'dock.panels.notes.area']]);
  });

  it('reset() puts the dock back as the options placed it', () => {
    const t = grid({ dock: { open: { notes: 'end' } } });
    t.d().move('notes', 'bottom');
    t.d().show('help');
    t.s().reset();
    expect(t.d().layout()).toEqual({ panels: { notes: { area: 'end', open: true }, help: { area: 'end', open: false } }, areas: { end: { active: 'notes' } } });
  });
});
