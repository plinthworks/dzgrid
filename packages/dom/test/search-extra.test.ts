// The quick search box (step 16; docs/behaviors/quick-search-box.md, quick-filter.md, filter-ui.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeQuery, type GridEvent } from '@dzgrid/core';
import { quickSearch } from '../src/search.js';
import { filters } from '../src/filters.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { cleanup, make, grids, ROWS, type Make, type R } from './support-filters.js';

afterEach(cleanup);

type Search = ReturnType<typeof quickSearch>;
const ANN = ROWS.filter((r) => r.name.startsWith('ann')).length; // 10
const BOB = ROWS.length - ANN; // 20

/** A labelled search field in the page (the host's own). */
function field(parent: Node = document.body, label = 'Search'): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'search';
  i.setAttribute('aria-label', label);
  parent.appendChild(i);
  return i;
}

function typeIn(box: HTMLInputElement, text: string): void {
  box.value = text;
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
function keyOn(box: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  box.dispatchEvent(e);
  return e;
}
const compose = (box: HTMLInputElement, type: 'compositionstart' | 'compositionend', data = '') => box.dispatchEvent(new CompositionEvent(type, { bubbles: true, data }));
function composeTyping(box: HTMLInputElement, text: string): void {
  box.value = text;
  box.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
}

/** A grid with the search feature (and the floating filters when asked) and one bound field. */
function setup(o: Make & { debounceMs?: number; withFilters?: boolean; search?: Search; bind?: boolean } = {}) {
  vi.useFakeTimers();
  const search = o.search ?? quickSearch();
  const t = make({ ...o, features: o.features ?? [search, ...(o.withFilters ? [filters({ floating: true })] : [])] });
  const box = field();
  const unbind = o.bind === false ? () => {} : search.bind(box, ...(o.debounceMs !== undefined ? [{ debounceMs: o.debounceMs }] : []));
  const ctx = (t.g as unknown as { context: GridContext<unknown> }).context;
  const quickEvents = () => t.events.filter((e): e is Extract<GridEvent<R>, { type: 'quickChanged' }> => e.type === 'quickChanged');
  const announce = vi.spyOn(ctx.live, 'announce');
  const key = (i: number) => { const d = t.g.kernel.rows.displayed; return d.keyAt(d.index(i)!); };
  return { ...t, search, box, unbind, ctx, key, quickEvents, announce, quick: () => t.g.kernel.query.quick, shown: () => t.g.kernel.rows.displayed.count };
}

// ---- Coverage additions (test analysis of step 16) ----

describe('lifecycle with several grids and fields', () => {
  it('destroying the grid unbinds every bound field, not only the first (map edited while walked)', () => {
    const t = setup();
    const b = field();
    const c = field();
    t.search.bind(b);
    t.search.bind(c);
    typeIn(c, 'ann');
    t.g.destroy();
    grids.length = 0;
    expect(vi.getTimerCount()).toBe(0);
    for (const f of [t.box, b, c]) {
      expect(f.hasAttribute('dir')).toBe(false);
      expect(keyOn(f, 'Enter').defaultPrevented).toBe(false);
    }
  });

  it('unbind after destroy, then destroy again: nothing throws, nothing comes back', () => {
    const t = setup();
    t.g.destroy();
    grids.length = 0;
    t.unbind();
    t.unbind();
    expect(() => t.g.destroy()).not.toThrow();
    expect(t.box.hasAttribute('dir')).toBe(false);
  });

  it('the same field bound to two grids drives both; unbinding one leaves the other working', () => {
    vi.useFakeTimers();
    const s1 = quickSearch();
    const s2 = quickSearch();
    const a = make({ features: [s1] });
    const b = make({ features: [s2] });
    const box = field();
    const off1 = s1.bind(box);
    s2.bind(box);
    typeIn(box, 'ann');
    vi.advanceTimersByTime(150);
    expect(a.g.kernel.query.quick).toBe('ann');
    expect(b.g.kernel.query.quick).toBe('ann');
    off1();
    typeIn(box, 'bob');
    vi.advanceTimersByTime(150);
    expect(a.g.kernel.query.quick).toBe('ann');
    expect(b.g.kernel.query.quick).toBe('bob');
  });

  // Was a bug: the second binding saw dir/autocomplete/... already present (the first one's) and
  // recorded nothing; the first unbind removed them while the field was still bound to the other grid.
  it('the same field bound to two grids keeps our attributes while one binding remains', () => {
    vi.useFakeTimers();
    const s1 = quickSearch();
    const s2 = quickSearch();
    make({ features: [s1] });
    make({ features: [s2] });
    const box = field();
    const off1 = s1.bind(box);
    s2.bind(box);
    off1();
    expect(box.getAttribute('dir')).toBe('auto');
  });

  // Was a bug: one quickSearch() given to a second grid threw a TypeError ("waiting is not
  // iterable") from setup. The rule now: its fields drive every grid it is set up in.
  it('one quickSearch() instance in two grids does not throw at the second createGrid', () => {
    vi.useFakeTimers();
    const s = quickSearch();
    make({ features: [s] });
    expect(() => make({ features: [s] })).not.toThrow();
  });
});

describe('attributes changed by the host while bound', () => {
  // Was a bug: unbind removed every attribute it once set, even one the host had since set itself.
  it('a dir the host set while bound survives unbind', () => {
    const t = setup();
    t.box.setAttribute('dir', 'rtl');
    t.unbind();
    expect(t.box.getAttribute('dir')).toBe('rtl');
  });

  it('an attribute the host removed while bound is not put back at unbind', () => {
    const t = setup();
    t.box.removeAttribute('spellcheck');
    t.unbind();
    expect(t.box.hasAttribute('spellcheck')).toBe(false);
  });

  it('rebinding gives back and sets again: no attribute left over, none doubled', () => {
    const t = setup();
    const off = t.search.bind(t.box);
    expect(t.box.getAttribute('dir')).toBe('auto');
    off();
    for (const a of ['dir', 'enterkeyhint', 'spellcheck', 'aria-controls', 'autocomplete']) expect(t.box.hasAttribute(a)).toBe(false);
  });
});

describe('echo races', () => {
  it('a host search during a composition, then a cancelled composition (text back as before) re-applies the field’s own text', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    compose(t.box, 'compositionstart');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    expect(t.box.value).toBe('ann');
    compose(t.box, 'compositionend', '');
    // Documented: the composing field applies its own text after its pause (the host's search is replaced).
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
  });

  it('a host search during a pending edit after a composition cancels that edit', () => {
    const t = setup();
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'مر');
    compose(t.box, 'compositionend', 'مر');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('bob');
    expect(t.box.value).toBe('bob');
  });

  it('the host setting back the field’s last sent text leaves a newer pending edit to apply', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    typeIn(t.box, 'ann2');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'ann' }, 'api');
    // 'ann' differs from what the field holds as sent ('bob'): the grid wins, edit dropped.
    expect(t.box.value).toBe('ann');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('ann');
  });

  it('Escape on a pending edit before any search: nothing ever applied', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    keyOn(t.box, 'Escape');
    vi.advanceTimersByTime(1000);
    expect(t.quickEvents()).toHaveLength(0);
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('blur during a composition applies nothing; its end applies after the pause', () => {
    const t = setup();
    typeIn(t.box, 'a');
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'aم');
    t.box.dispatchEvent(new FocusEvent('blur'));
    expect(t.quick()).toBe('');
    compose(t.box, 'compositionend', 'aم');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('aم');
  });

  it('unbind during a composition: its end applies nothing', () => {
    const t = setup();
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'مر');
    t.unbind();
    compose(t.box, 'compositionend', 'مر');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('');
  });
});

describe('announcements under rapid typing on a server', () => {
  const said = (t: ReturnType<typeof setup>) => t.announce.mock.calls.map((c) => c[0]).filter((s) => /^\d+ rows?$/.test(s));

  it('latest answer first, the stale one after: said once, the latest count', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b', 'c']);
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    const first = t.f.calls.at(-1)!;
    typeIn(t.box, 'bo');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    t.f.answer(['a'], { total: 1 });
    first.ok({ rows: [{ id: 'x', name: 'x', n: 1 }], total: 7 });
    expect(said(t)).toEqual(['1 row']);
  });

  it('a stale request failing does not silence the latest answer', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b', 'c']);
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    const first = t.f.calls.at(-1)!;
    typeIn(t.box, 'bo');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    first.err(new Error('late'));
    t.f.answer(['a', 'b'], { total: 2 });
    expect(said(t)).toEqual(['2 rows']);
  });

  it('three searches, answers 3-1-2 and a failure between: one sentence, the last count', () => {
    const t = setup({ server: true });
    t.f.answer(['a']);
    const reqs = [];
    for (const s of ['b', 'bo', 'bob']) {
      typeIn(t.box, s);
      vi.advanceTimersByTime(300);
      reqs.push(t.f.calls.at(-1)!);
    }
    t.announce.mockClear();
    reqs[2]!.ok({ rows: [{ id: 'z', name: 'z', n: 1 }], total: 3 });
    reqs[0]!.ok({ rows: [], total: 0 });
    reqs[1]!.err(new Error('x'));
    expect(said(t)).toEqual(['3 rows']);
    expect(t.g.kernel.rows.status.phase).not.toBe('error');
  });

  it('a search that fails, then a new one that answers: said once, for the new one', () => {
    const t = setup({ server: true });
    t.f.answer(['a']);
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    t.f.fail(new Error('down'));
    typeIn(t.box, 'bo');
    vi.advanceTimersByTime(300);
    t.f.answer(['q', 'r'], { total: 2 });
    expect(said(t)).toEqual(['2 rows']);
  });

  it('after a settled search, a later answer (another page, a refresh) says nothing more', () => {
    const t = setup({ server: true });
    t.f.answer(['a']);
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    t.f.answer(['q'], { total: 1 });
    t.announce.mockClear();
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'name' } as never, 'user');
    if (t.f.calls.at(-1)!.req.quick === 'b') t.f.answer(['q'], { total: 1 });
    expect(said(t)).toEqual([]);
  });
});

describe('the warm-up and its memory', () => {
  const big = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, name: `Hélène ${i}`, n: i }));

  // Was low: want=false at the last unbind, but the idle loop already running was not stopped.
  it('the last unbind stops a warm-up in progress (no more idle steps for a field that is gone)', () => {
    const t = setup({ rows: big });
    let steps = 0;
    const real = t.ctx.rows.warmSearch!.bind(t.ctx.rows);
    vi.spyOn(t.ctx.rows, 'warmSearch').mockImplementation(() => {
      const s = real();
      return { ...s, get progress() { return s.progress; }, step: (n: number) => (steps++, s.step(n)), cancel: () => s.cancel() };
    });
    t.box.focus();
    t.unbind();
    const before = steps;
    vi.advanceTimersByTime(5000);
    expect(steps).toBe(before);
  });

  it('emptying the field while bound: haystacks released, then prepared again in idle time', () => {
    const t = setup({ rows: big });
    t.box.focus();
    vi.advanceTimersByTime(5000);
    typeIn(t.box, 'hel');
    keyOn(t.box, 'Enter');
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    keyOn(t.box, 'Escape');
    expect(t.quick()).toBe('');
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('emptying the field after the last unbind prepares nothing again', () => {
    const t = setup({ rows: big });
    t.box.focus();
    typeIn(t.box, 'hel');
    keyOn(t.box, 'Enter');
    t.unbind();
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    t.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'api');
    vi.advanceTimersByTime(5000);
    expect(warm).not.toHaveBeenCalled();
  });

  it('a second field bound and unbound keeps the warm-up wanted for the first', () => {
    const t = setup({ rows: big });
    const b = field();
    const off = t.search.bind(b);
    t.box.focus();
    off();
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    t.g.update({ rows: big.slice(0, 100) });
    expect(warm).toHaveBeenCalledTimes(1);
  });
});

describe('key code 229 does not swallow ordinary keys', () => {
  it('search field: after a 229 Enter, an ordinary Enter applies at once; Escape too', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    expect(keyOn(t.box, 'Enter', { keyCode: 229 }).defaultPrevented).toBe(false);
    expect(t.quick()).toBe('');
    expect(keyOn(t.box, 'Enter', { keyCode: 13 }).defaultPrevented).toBe(true);
    expect(t.quick()).toBe('ann');
    expect(keyOn(t.box, 'Escape', { keyCode: 27 }).defaultPrevented).toBe(true);
    expect(t.quick()).toBe('');
  });

  it('floating box: an ordinary Enter (key code 13) applies at once, an ordinary Escape returns to the cell', () => {
    vi.useFakeTimers();
    const t = make();
    const cell = t.cell('name');
    cell.focus();
    t.key(cell, 'Enter');
    const i = t.input('name')!;
    t.type('name', 'ann');
    t.key(i, 'Enter', { keyCode: 229 });
    expect(t.filterEvents()).toHaveLength(0);
    t.key(i, 'Enter', { keyCode: 13 });
    expect(t.filterEvents()).toHaveLength(1);
    t.type('name', 'bob');
    const esc = t.key(i, 'Escape', { keyCode: 27 });
    expect(esc.defaultPrevented).toBe(true);
    expect(t.filterEvents()).toHaveLength(2);
    expect(document.activeElement).toBe(cell);
  });

  it('popup: an ordinary Enter (key code 13) applies', () => {
    vi.useFakeTimers();
    const f = filters({ popup: true }) as GridFeature & { openFilter(c: string): boolean };
    const t = make({ server: true, features: [f] });
    t.f.answer(['a']);
    f.openFilter('name');
    const v = t.host.querySelector<HTMLElement>('.dzg-popup')!.querySelector<HTMLInputElement>('input.dzg-fval')!;
    v.value = 'ann';
    v.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const before = t.f.calls.length;
    t.key(v, 'Enter', { keyCode: 13 });
    expect(t.f.calls.length).toBe(before + 1);
  });
});

describe('key code 229 in the floating number box (unreadable number)', () => {
  it('a 229 Enter does not mark the box invalid; an ordinary Enter does, said once', () => {
    vi.useFakeTimers();
    const t = make();
    const cell = t.cell('n');
    cell.focus();
    t.key(cell, 'Enter');
    const i = t.input('n')!;
    t.type('n', 'abc');
    const spy = vi.spyOn(t.live, 'announce');
    t.key(i, 'Enter', { keyCode: 229 });
    expect(i.hasAttribute('aria-invalid')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    t.key(i, 'Enter', { keyCode: 13 });
    expect(i.getAttribute('aria-invalid')).toBe('true');
  });
});


// ---- Review fixes (step 16 review: R1-R3, A-C and the minor items) ----

const ctxOf = (t: { g: unknown }) => (t.g as { context: GridContext<unknown> }).context;
const gridId = (t: { g: unknown }) => ctxOf(t).el.viewport.id;

describe('one field on two grids: aria-controls points at a grid still bound', () => {
  function two() {
    vi.useFakeTimers();
    const s1 = quickSearch();
    const s2 = quickSearch();
    const a = make({ features: [s1] });
    const b = make({ features: [s2] });
    const box = field();
    const off1 = s1.bind(box);
    const off2 = s2.bind(box);
    return { a, b, box, off1, off2 };
  }

  it('the first grid unbound: the field now controls the second one', () => {
    const { b, box, off1 } = two();
    off1();
    expect(box.getAttribute('aria-controls')).toBe(gridId(b));
    expect(box.getAttribute('enterkeyhint')).toBe('search');
  });

  it('the second grid unbound: the field still controls the first one; both unbound: nothing left', () => {
    const { a, box, off1, off2 } = two();
    off2();
    expect(box.getAttribute('aria-controls')).toBe(gridId(a));
    off1();
    for (const n of ['dir', 'enterkeyhint', 'spellcheck', 'aria-controls', 'autocomplete']) expect(box.hasAttribute(n)).toBe(false);
  });

  it('an aria-controls the host set while bound survives every unbind', () => {
    const { box, off1, off2 } = two();
    box.setAttribute('aria-controls', 'mine');
    off1();
    off2();
    expect(box.getAttribute('aria-controls')).toBe('mine');
  });
});

describe('one quickSearch() set up again, or in two grids at once', () => {
  it('set up again after its grid is gone (a remount): the fields still bound drive the new grid', () => {
    vi.useFakeTimers();
    const s = quickSearch();
    const box = field();
    s.bind(box);
    const a = make({ features: [s] });
    a.g.destroy();
    grids.splice(grids.indexOf(a.g as never), 1);
    expect(box.hasAttribute('dir')).toBe(false);
    const b = make({ features: [s] });
    expect(box.getAttribute('aria-controls')).toBe(gridId(b));
    typeIn(box, 'ann');
    vi.advanceTimersByTime(150);
    expect(b.g.kernel.query.quick).toBe('ann');
  });

  it('in two live grids: its fields drive both; one destroyed, the other still searches', () => {
    vi.useFakeTimers();
    const s = quickSearch();
    const a = make({ features: [s] });
    const b = make({ features: [s] });
    const box = field();
    const off = s.bind(box);
    typeIn(box, 'ann');
    vi.advanceTimersByTime(150);
    expect([a.g.kernel.query.quick, b.g.kernel.query.quick]).toEqual(['ann', 'ann']);
    a.g.destroy();
    grids.splice(grids.indexOf(a.g as never), 1);
    typeIn(box, 'bob');
    vi.advanceTimersByTime(150);
    expect(b.g.kernel.query.quick).toBe('bob');
    expect(box.getAttribute('dir')).toBe('auto');
    typeIn(box, 'ann');
    off();
    expect(box.hasAttribute('dir')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(b.g.kernel.query.quick).toBe('bob');
  });
});

describe('a host combobox keeps its keys (R1)', () => {
  it('aria-expanded="true": Enter and ArrowDown are the host’s (no search, no focus move)', () => {
    const t = setup();
    t.box.setAttribute('aria-expanded', 'true');
    typeIn(t.box, 'ann');
    expect(keyOn(t.box, 'Enter').defaultPrevented).toBe(false);
    expect(keyOn(t.box, 'ArrowDown').defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(ctxOf(t).el.viewport);
    expect(t.quick()).toBe('');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
  });

  it('aria-activedescendant: Enter and ArrowDown are the host’s', () => {
    const t = setup();
    t.box.setAttribute('aria-activedescendant', 'opt-1');
    typeIn(t.box, 'ann');
    expect(keyOn(t.box, 'Enter').defaultPrevented).toBe(false);
    expect(keyOn(t.box, 'ArrowDown').defaultPrevented).toBe(false);
    expect(t.quick()).toBe('');
  });

  it('a field with a datalist: ArrowDown is the browser’s, Enter still applies', () => {
    const t = setup();
    const list = document.createElement('datalist');
    list.id = 'names';
    document.body.append(list);
    t.box.setAttribute('list', 'names');
    typeIn(t.box, 'ann');
    expect(keyOn(t.box, 'ArrowDown').defaultPrevented).toBe(false);
    expect(keyOn(t.box, 'Enter').defaultPrevented).toBe(true);
    expect(t.quick()).toBe('ann');
    list.remove();
  });

  it('aria-expanded="false" (a closed list): both keys are ours as before', () => {
    const t = setup();
    t.box.setAttribute('aria-expanded', 'false');
    typeIn(t.box, 'ann');
    expect(keyOn(t.box, 'Enter').defaultPrevented).toBe(true);
    expect(t.quick()).toBe('ann');
    expect(keyOn(t.box, 'ArrowDown').defaultPrevented).toBe(true);
  });
});

describe('minor fixes', () => {
  it('a composition whose end never comes: leaving the field ends it, the next edit applies', () => {
    const t = setup();
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'مر');
    t.box.dispatchEvent(new FocusEvent('blur'));
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    expect(t.box.value).toBe('bob');
  });

  it('Escape emptying the field tells the page with an input event, applied once', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    keyOn(t.box, 'Enter');
    const heard = vi.fn();
    t.box.addEventListener('input', heard);
    keyOn(t.box, 'Escape');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(t.quick()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(t.quickEvents()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with searchWarmup: idle, the last unbind leaves the grid’s own warm-up running', () => {
    const big = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, name: `Hélène ${i}`, n: i }));
    const t = setup({ rows: big, settings: { searchWarmup: 'idle' } });
    let steps = 0;
    const real = t.ctx.rows.warmSearch!.bind(t.ctx.rows);
    vi.spyOn(t.ctx.rows, 'warmSearch').mockImplementation(() => {
      const s = real();
      return { ...s, get progress() { return s.progress; }, step: (n: number) => (steps++, s.step(n)), cancel: () => s.cancel() };
    });
    t.g.update({ rows: big.slice(1) });
    t.box.focus();
    t.unbind();
    vi.advanceTimersByTime(5000);
    expect(steps).toBeGreaterThan(0);
  });
});

// ---- Step 18: found by the audit screen's permutations (I3, one sentence per action) ----

describe('one sentence when one action clears the filters and the search (step 18)', () => {
  it('in the browser: "Filtered. N rows" only, not the search\'s "N rows" too', () => {
    const t = setup({ withFilters: true });
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 20 } }, 'user');
    t.announce.mockClear();
    // The no-match overlay's clearFilters: one query.set keeping the sort.
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'user');
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual([`Filtered. ${ROWS.length} rows`]);
  });

  it('on a server: one sentence, once the answer is in', () => {
    const t = setup({ withFilters: true, server: true });
    t.f.answer(['a', 'b'], { total: 2 });
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(300);
    t.f.answer(['a'], { total: 1 });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, 'user');
    t.f.answer(['a'], { total: 1 });
    t.announce.mockClear();
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'user');
    expect(t.announce).not.toHaveBeenCalled();
    t.f.answer(['a', 'b', 'c'], { total: 3 });
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual(['Filtered. 3 rows']);
  });

  it('the search alone still says its count; without the filters feature, the search says it', () => {
    const t = setup({ withFilters: true });
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual([`${ANN} rows`]);
    const u = setup();
    typeIn(u.box, 'ann');
    vi.advanceTimersByTime(150);
    u.g.kernel.dispatch({ type: 'filter.set', filter: { n: { type: 'number', op: 'lt', value: 3 } } }, 'user');
    u.announce.mockClear();
    u.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: u.g.kernel.query.sort }) }, 'user');
    expect(u.announce.mock.calls.map((c) => c[0])).toEqual([`${ROWS.length} rows`]);
  });
});
