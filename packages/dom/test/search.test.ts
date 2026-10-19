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

describe('the pause and the text sent', () => {
  it('applies after 150 ms in the browser, once for a burst of keys', () => {
    const t = setup();
    for (const s of ['a', 'an', 'ann']) typeIn(t.box, s);
    vi.advanceTimersByTime(149);
    expect(t.quick()).toBe('');
    vi.advanceTimersByTime(1);
    expect(t.quick()).toBe('ann');
    expect(t.quickEvents()).toHaveLength(1);
    expect(t.quickEvents()[0]!.source).toBe('user');
    expect(t.shown()).toBe(ANN);
  });

  it('waits 300 ms when the search runs on the server, and asks once per pause', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b']);
    const before = t.f.calls.length;
    for (const s of ['b', 'bo', 'bob']) typeIn(t.box, s);
    vi.advanceTimersByTime(299);
    expect(t.f.calls.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.f.calls.at(-1)!.req.quick).toBe('bob');
  });

  it('takes the bind’s debounceMs, and the default for one that is not a finite number of 0 or more', () => {
    const t = setup({ debounceMs: 40 });
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(40);
    expect(t.quick()).toBe('ann');
    for (const bad of [-1, Number.NaN, Infinity, '20' as unknown as number]) {
      const b = field();
      t.search.bind(b, { debounceMs: bad });
      typeIn(b, `bob${String(bad).length}`);
      vi.advanceTimersByTime(149);
      expect(t.quick()).not.toBe(`bob${String(bad).length}`);
      vi.advanceTimersByTime(1);
      expect(t.quick()).toBe(`bob${String(bad).length}`);
    }
  });

  it('takes 0 as no pause at all', () => {
    const t = setup({ debounceMs: 0 });
    typeIn(t.box, 'ann');
    expect(t.quick()).toBe('ann');
  });

  it('trims the ends only: a trailing space changes nothing, inner spaces are kept', () => {
    const t = setup();
    typeIn(t.box, '  ann  ');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
    typeIn(t.box, 'ann ');
    vi.advanceTimersByTime(150);
    expect(t.quickEvents()).toHaveLength(1);
    typeIn(t.box, 'a  b');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('a  b');
  });

  it('on a server, a trailing space or a field of spaces asks nothing', () => {
    const t = setup({ server: true });
    t.f.answer(['a']);
    const before = t.f.calls.length;
    typeIn(t.box, '   ');
    vi.advanceTimersByTime(1000);
    expect(t.f.calls.length).toBe(before);
    typeIn(t.box, 'a');
    vi.advanceTimersByTime(300);
    t.f.answer(['a']);
    typeIn(t.box, 'a ');
    vi.advanceTimersByTime(1000);
    expect(t.f.calls.length).toBe(before + 1);
  });

  it('waits the pause for an emptied field (the field’s own clear button), then releases the search', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    typeIn(t.box, '');
    vi.advanceTimersByTime(149);
    expect(t.quick()).toBe('ann');
    vi.advanceTimersByTime(1);
    expect(t.quick()).toBe('');
    expect(t.shown()).toBe(ROWS.length);
  });

  it('keeps one pending edit per field: the next one replaces it', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(100);
    typeIn(t.box, 'bob');
    vi.advanceTimersByTime(100);
    expect(t.quick()).toBe('');
    vi.advanceTimersByTime(50);
    expect(t.quick()).toBe('bob');
    expect(t.quickEvents()).toHaveLength(1);
  });
});

describe('keys', () => {
  it('Enter applies at once, stays in the field, and never submits the page’s form', () => {
    const t = setup();
    const form = document.createElement('form');
    document.body.append(form);
    form.append(t.box);
    const submit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', submit);
    t.box.focus();
    typeIn(t.box, 'ann');
    const e = keyOn(t.box, 'Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(t.quick()).toBe('ann');
    expect(document.activeElement).toBe(t.box);
    vi.advanceTimersByTime(1000);
    expect(t.quickEvents()).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it('Escape on a field with text empties it at once and stops there', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    typeIn(t.box, 'annx');
    const e = keyOn(t.box, 'Escape');
    document.removeEventListener('keydown', outside);
    expect(t.box.value).toBe('');
    expect(t.quick()).toBe('');
    expect(outside).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('');
  });

  it('Escape on an empty field goes on to the page', () => {
    const t = setup();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const e = keyOn(t.box, 'Escape');
    document.removeEventListener('keydown', outside);
    expect(outside).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
    expect(t.quickEvents()).toHaveLength(0);
  });

  it('leaving the field applies at once', () => {
    const t = setup();
    t.box.focus();
    typeIn(t.box, 'bob');
    t.box.blur();
    expect(t.quick()).toBe('bob');
  });

  it('ArrowDown moves focus into the grid (its focused cell); with a modifier it stays', () => {
    const t = setup();
    t.box.focus();
    keyOn(t.box, 'ArrowDown', { shiftKey: true });
    keyOn(t.box, 'ArrowDown', { altKey: true });
    expect(document.activeElement).toBe(t.box);
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: t.key(3), column: 'name' } }, 'api');
    t.box.focus();
    typeIn(t.box, 'ann');
    const e = keyOn(t.box, 'ArrowDown');
    expect(e.defaultPrevented).toBe(true);
    expect(t.vp.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('name');
    // Leaving applied the search.
    expect(t.quick()).toBe('ann');
  });

  it('ArrowDown with no focused cell yet puts focus on the grid', () => {
    const t = setup();
    t.box.focus();
    keyOn(t.box, 'ArrowDown');
    expect(t.vp.contains(document.activeElement)).toBe(true);
  });

  it('a field inside the grid’s host keeps its keys from the grid', () => {
    const t = setup({ bind: false });
    const inner = field(t.host);
    t.search.bind(inner);
    inner.focus();
    const focus = t.g.kernel.focus;
    for (const k of ['Home', 'End', ' ', 'a', 'ArrowLeft']) expect(keyOn(inner, k).defaultPrevented).toBe(false);
    expect(t.g.kernel.focus).toEqual(focus);
  });
});

describe('input methods', () => {
  it('applies nothing during a composition, then applies its end after the pause', () => {
    const t = setup();
    const dispatch = vi.spyOn(t.g.kernel, 'dispatch');
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'مَ');
    composeTyping(t.box, 'مَرِ');
    vi.advanceTimersByTime(1000);
    expect(dispatch).not.toHaveBeenCalled();
    composeTyping(t.box, 'مَرِيض');
    compose(t.box, 'compositionend', 'مَرِيض');
    vi.advanceTimersByTime(149);
    expect(t.quick()).toBe('');
    vi.advanceTimersByTime(1);
    expect(t.quick()).toBe('مَرِيض');
  });

  it('Enter and Escape inside a composition do nothing, read from isComposing or key code 229 (Safari)', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      const e = keyOn(t.box, 'Enter', init);
      expect(e.defaultPrevented).toBe(false);
      expect(t.quick()).toBe('');
      const x = keyOn(t.box, 'Escape', init);
      expect(x.defaultPrevented).toBe(false);
      expect(t.box.value).toBe('ann');
    }
    // The edit itself still applies after its pause.
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
  });

  it('ArrowDown inside a composition stays in the field', () => {
    const t = setup();
    t.box.focus();
    keyOn(t.box, 'ArrowDown', { keyCode: 229 });
    expect(document.activeElement).toBe(t.box);
  });
});

describe('mutation analysis (each failed on its mutant)', () => {
  it('a field bound in the middle of a composition (no compositionstart heard) still waits for its end', () => {
    const t = setup({ bind: false });
    const b = field();
    t.search.bind(b);
    composeTyping(b, 'مَ');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('');
  });

  it('leaving a field with nothing waiting sends nothing (a host’s untrimmed search stays)', () => {
    const t = setup();
    t.g.kernel.dispatch({ type: 'quick.set', text: ' bob ' }, 'api');
    expect(t.box.value).toBe(' bob ');
    t.box.focus();
    t.box.blur();
    expect(t.quick()).toBe(' bob ');
    expect(t.quickEvents()).toHaveLength(1);
  });

  it('a search set elsewhere cancels the field’s waiting edit (nothing applied after, nothing said)', () => {
    const t = setup();
    typeIn(t.box, 'x');
    t.g.kernel.dispatch({ type: 'quick.set', text: ' bob ' }, 'api');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe(' bob ');
    expect(t.announce).not.toHaveBeenCalled();
  });
});

describe('the grid wins (echo)', () => {
  it('leaves the field’s own text alone when its search comes back (spaces, caret)', () => {
    const t = setup();
    typeIn(t.box, ' ann  ');
    t.box.setSelectionRange(2, 2);
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
    expect(t.box.value).toBe(' ann  ');
    expect(t.box.selectionStart).toBe(2);
  });

  it('rewrites the field for a search set elsewhere', () => {
    const t = setup();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    expect(t.box.value).toBe('bob');
    // And typing from there works.
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
  });

  it('a clear-all rewrites the field and cancels its waiting edit', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    typeIn(t.box, 'annx');
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'user');
    expect(t.box.value).toBe('');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('');
  });

  it('leaves a field in a composition alone; its own text applies after the composition', () => {
    const t = setup();
    compose(t.box, 'compositionstart');
    composeTyping(t.box, 'مر');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    expect(t.box.value).toBe('مر');
    composeTyping(t.box, 'مريض');
    compose(t.box, 'compositionend', 'مريض');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('مريض');
  });

  it('two bound fields show the same text', () => {
    const t = setup();
    const b = field();
    t.search.bind(b);
    typeIn(t.box, ' ann');
    vi.advanceTimersByTime(150);
    expect(b.value).toBe('ann');
    expect(t.box.value).toBe(' ann');
    typeIn(b, 'bob');
    vi.advanceTimersByTime(150);
    expect(t.box.value).toBe('bob');
    expect(t.quick()).toBe('bob');
  });

  it('cancels the other field’s waiting edit when one applies', () => {
    const t = setup();
    const b = field();
    t.search.bind(b);
    typeIn(b, 'bob');
    typeIn(t.box, 'ann');
    keyOn(t.box, 'Enter');
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('ann');
    expect(b.value).toBe('ann');
  });

  it('at bind, a grid that searches writes its text into the field', () => {
    const t = setup({ bind: false });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    const b = field();
    b.value = 'stale';
    t.search.bind(b);
    expect(b.value).toBe('bob');
    expect(t.quick()).toBe('bob');
  });

  it('at bind, a field holding text (a page restored) applies it, trimmed and silently', () => {
    const t = setup({ bind: false });
    const b = field();
    b.value = ' ann ';
    t.search.bind(b);
    expect(t.quick()).toBe('ann');
    expect(t.quickEvents().at(-1)!.source).toBe('api');
    expect(b.value).toBe(' ann ');
    vi.advanceTimersByTime(1000);
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('binding a field twice keeps one binding (one edit per pause)', () => {
    const t = setup();
    t.search.bind(t.box);
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.quickEvents()).toHaveLength(1);
    expect(t.announce).toHaveBeenCalledTimes(1);
  });
});

describe('unbinding and the field’s attributes', () => {
  it('sets only absent attributes, and gives them back at unbind', () => {
    const t = setup({ bind: false });
    const b = field();
    b.setAttribute('autocomplete', 'on');
    t.search.bind(b);
    expect(b.getAttribute('dir')).toBe('auto');
    expect(b.getAttribute('autocomplete')).toBe('on');
    expect(b.getAttribute('enterkeyhint')).toBe('search');
    expect(b.getAttribute('spellcheck')).toBe('false');
    const grid = t.host.querySelector('[role=grid]')!;
    expect(grid.id).not.toBe('');
    expect(b.getAttribute('aria-controls')).toBe(grid.id);
    const unbind = t.search.bind(b);
    unbind();
    for (const a of ['dir', 'enterkeyhint', 'spellcheck', 'aria-controls']) expect(b.hasAttribute(a)).toBe(false);
    expect(b.getAttribute('autocomplete')).toBe('on');
  });

  it('keeps the grid’s own id when it has one', () => {
    const t = setup({ bind: false });
    const grid = t.host.querySelector('[role=grid]')!;
    grid.id = 'patients';
    const b = field();
    t.search.bind(b);
    expect(b.getAttribute('aria-controls')).toBe('patients');
  });

  it('never touches the host’s name, description, id, type, classes or styles', () => {
    const t = setup({ bind: false });
    const b = document.createElement('input');
    b.type = 'text';
    b.id = 'q';
    b.className = 'host-box';
    b.style.color = 'red';
    b.setAttribute('aria-labelledby', 'lbl');
    b.setAttribute('aria-describedby', 'help');
    b.setAttribute('aria-controls', 'mine');
    b.setAttribute('dir', 'rtl');
    document.body.append(b);
    const before = [...b.attributes].map((a) => `${a.name}=${a.value}`).sort();
    const unbind = t.search.bind(b);
    typeIn(b, 'ann');
    vi.advanceTimersByTime(150);
    for (const a of before) expect([...b.attributes].map((x) => `${x.name}=${x.value}`)).toContain(a);
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(b.hasAttribute('aria-live')).toBe(false);
    unbind();
    expect([...b.attributes].map((a) => `${a.name}=${a.value}`).sort()).toEqual(before);
  });

  it('sets no aria-controls across a shadow root', () => {
    const t = setup({ shadow: true, bind: false });
    const b = field();
    t.search.bind(b);
    expect(b.hasAttribute('aria-controls')).toBe(false);
    expect(b.getAttribute('dir')).toBe('auto');
  });

  it('unbind drops the waiting edit, leaves the grid’s search, and stops listening', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    typeIn(t.box, 'annx');
    t.unbind();
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('ann');
    typeIn(t.box, 'bob');
    expect(keyOn(t.box, 'Enter').defaultPrevented).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(t.quick()).toBe('ann');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'zz' }, 'api');
    expect(t.box.value).toBe('bob');
  });

  it('unbinding one field leaves the other bound', () => {
    const t = setup();
    const b = field();
    const off = t.search.bind(b);
    off();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
    expect(b.value).toBe('');
  });

  it('an older unbind does not unbind a newer binding of the same field', () => {
    const t = setup();
    const again = t.search.bind(t.box);
    t.unbind();
    expect(t.box.getAttribute('dir')).toBe('auto');
    expect(t.box.getAttribute('enterkeyhint')).toBe('search');
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.quick()).toBe('ann');
    again();
  });
});

describe('announcements', () => {
  it('says the row count once per pause in the browser (announce.rows, no new text)', () => {
    const t = setup();
    for (const s of ['a', 'an', 'ann']) typeIn(t.box, s);
    vi.advanceTimersByTime(150);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.live.said).toBe(`${ANN} rows`);
  });

  it('says 0 rows when nothing matches', () => {
    const t = setup();
    typeIn(t.box, 'zzz');
    keyOn(t.box, 'Enter');
    expect(t.live.said).toBe('0 rows');
  });

  it('says the full count once after Escape', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    keyOn(t.box, 'Escape');
    expect(t.announce).toHaveBeenCalledTimes(2);
    expect(t.live.said).toBe(`${ROWS.length} rows`);
  });

  it('on a server, says the count once the answer is in, nothing before', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b', 'c']);
    t.announce.mockClear();
    typeIn(t.box, 'bob');
    vi.advanceTimersByTime(300);
    expect(t.announce).not.toHaveBeenCalled();
    t.f.answer(['a', 'b']);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.live.said).toBe('2 rows');
  });

  it('on a server, says nothing more on a failure, nor when the count is unknown', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b', 'c']);
    typeIn(t.box, 'bob');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    t.f.fail(new Error('down'));
    expect(t.announce.mock.calls.map((c) => c[0])).not.toContain('2 rows');
    expect(t.announce.mock.calls.every((c) => !/rows?$/.test(c[0]))).toBe(true);
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    t.f.answer(['a', 'b'], {});
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('a stale answer says nothing: only the latest search’s count', () => {
    const t = setup({ server: true });
    t.f.answer(['a', 'b', 'c']);
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    const first = t.f.calls.at(-1)!;
    typeIn(t.box, 'bo');
    vi.advanceTimersByTime(300);
    t.announce.mockClear();
    first.ok({ rows: [{ id: 'x', name: 'x', n: 1 }], total: 7 });
    expect(t.announce).not.toHaveBeenCalled();
    t.f.answer(['a'], { total: 1 });
    expect(t.live.said).toBe('1 row');
  });

  it('says nothing for a host’s quick.set', () => {
    const t = setup();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'bob' }, 'api');
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('a clear-all with filters ends on one coherent sentence: the full count', () => {
    const t = setup({ withFilters: true });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'lt', value: 12 } }, 'user');
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.live.said).toBe('4 rows');
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'user');
    vi.advanceTimersByTime(100);
    expect(t.live.said).toBe(`${ROWS.length} rows`);
    expect(t.box.value).toBe('');
    expect(t.host.querySelector('.dzg-live')!.textContent).toBe(`${ROWS.length} rows`);
  });
});

describe('preparing the search (warm-up)', () => {
  const big = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, name: `Hélène ${i}`, n: i }));

  it('nothing at load; the first focus of a bound field prepares it in idle time', () => {
    const t = setup({ rows: big });
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    vi.advanceTimersByTime(5000);
    expect(warm).not.toHaveBeenCalled();
    t.box.focus();
    expect(warm).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    const before = t.g.kernel.rows.diagnostics.foldBuilds;
    typeIn(t.box, 'hel');
    keyOn(t.box, 'Enter');
    expect(t.g.kernel.rows.diagnostics.foldBuilds).toBe(before);
    expect(t.shown()).toBe(3000);
    // A second focus prepares nothing more.
    t.box.blur();
    t.box.focus();
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('prepares again after new rows while a field is bound; not once the last one is unbound', () => {
    const t = setup({ rows: big });
    const b = field();
    const off = t.search.bind(b);
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    t.box.focus();
    expect(warm).toHaveBeenCalledTimes(1);
    t.g.update({ rows: big.slice(0, 100) });
    expect(warm).toHaveBeenCalledTimes(2);
    t.unbind();
    t.g.update({ rows: big.slice(0, 50) });
    expect(warm).toHaveBeenCalledTimes(3);
    off();
    t.g.update({ rows: big.slice(0, 20) });
    expect(warm).toHaveBeenCalledTimes(3);
  });

  it('binding a field that has focus prepares at once', () => {
    const t = setup({ rows: big, bind: false });
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    const b = field();
    b.focus();
    t.search.bind(b);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('never when the search runs on the server', () => {
    const t = setup({ server: true });
    t.f.answer(['a']);
    const warm = vi.spyOn(t.ctx.rows, 'warmSearch');
    t.box.focus();
    vi.advanceTimersByTime(5000);
    expect(warm).not.toHaveBeenCalled();
  });

  it('builds nothing more when the grid already prepares in idle time (searchWarmup: idle)', () => {
    const t = setup({ rows: big, settings: { searchWarmup: 'idle' } });
    vi.advanceTimersByTime(5000);
    const built = t.g.kernel.rows.diagnostics.foldBuilds;
    t.box.focus();
    vi.advanceTimersByTime(5000);
    expect(t.g.kernel.rows.diagnostics.foldBuilds).toBe(built);
    typeIn(t.box, 'hel');
    keyOn(t.box, 'Enter');
    expect(t.g.kernel.rows.diagnostics.foldBuilds).toBe(built);
  });
});

describe('selection', () => {
  it('on a server, "all" is cleared once by a search, said once, mid-word or not', () => {
    const t = setup({ server: true, settings: { selection: { mode: 'multi', checkbox: true } } });
    t.f.answer(['a', 'b'], { total: 2 });
    t.g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.g.kernel.selection.mode).toBe('exclude');
    const sel = () => t.events.filter((e) => e.type === 'selectionChanged' && (e as { reason?: string }).reason === 'scope-changed');
    typeIn(t.box, 'b');
    vi.advanceTimersByTime(300);
    t.f.answer(['b'], { total: 1 });
    typeIn(t.box, 'bo');
    vi.advanceTimersByTime(300);
    t.f.answer(['b'], { total: 1 });
    expect(sel()).toHaveLength(1);
    expect(t.g.kernel.selection.mode).toBe('include');
  });

  it('keepOnFilter: false clears a selection on a search too', () => {
    const t = setup({ settings: { selection: { mode: 'multi', keepOnFilter: false } } });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key(0) }, 'user');
    expect(t.g.kernel.selection.keys.size).toBe(1);
    typeIn(t.box, 'ann');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.selection.keys.size).toBe(0);
  });
});

describe('lifecycle', () => {
  it('a bind before the grid is made waits for it', () => {
    vi.useFakeTimers();
    const search = quickSearch();
    const a = field();
    const b = field();
    search.bind(a);
    const offB = search.bind(b);
    offB();
    const t = make({ features: [search] });
    expect(a.getAttribute('dir')).toBe('auto');
    expect(b.hasAttribute('dir')).toBe(false);
    typeIn(a, 'ann');
    typeIn(b, 'bob');
    vi.advanceTimersByTime(150);
    expect(t.g.kernel.query.quick).toBe('ann');
  });

  it('a bind after the grid is gone does nothing', () => {
    const t = setup();
    t.g.destroy();
    grids.length = 0;
    const b = field();
    const off = t.search.bind(b);
    expect(b.hasAttribute('dir')).toBe(false);
    typeIn(b, 'x');
    expect(keyOn(b, 'Enter').defaultPrevented).toBe(false);
    expect(() => off()).not.toThrow();
  });

  it('destroying the grid unbinds every field: no listener, no timer left', () => {
    const t = setup();
    typeIn(t.box, 'ann');
    t.g.destroy();
    grids.length = 0;
    expect(vi.getTimerCount()).toBe(0);
    for (const a of ['dir', 'enterkeyhint', 'spellcheck', 'aria-controls', 'autocomplete']) expect(t.box.hasAttribute(a)).toBe(false);
    typeIn(t.box, 'bob');
    expect(keyOn(t.box, 'Escape').defaultPrevented).toBe(false);
    // (jsdom's own focus() sets a timer: the event alone, as our listener would hear it.)
    expect(() => t.box.dispatchEvent(new FocusEvent('focus'))).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => t.unbind()).not.toThrow();
  });

  it('is a grid feature with its own id and no parts', () => {
    const s: GridFeature = quickSearch();
    expect(s.id).toBe('search');
    expect(s.parts).toBeUndefined();
  });
});

describe('the filter boxes and input methods (key code 229)', () => {
  it('the floating box: Enter and Escape reported as key code 229 apply nothing and keep focus', () => {
    vi.useFakeTimers();
    const t = make();
    const cell = t.cell('name');
    cell.focus();
    t.key(cell, 'Enter');
    const i = t.input('name')!;
    expect(document.activeElement).toBe(i);
    t.type('name', 'ann');
    t.key(i, 'Enter', { keyCode: 229 });
    expect(t.filterEvents()).toHaveLength(0);
    t.key(i, 'Escape', { keyCode: 229 });
    expect(t.filterEvents()).toHaveLength(0);
    expect(document.activeElement).toBe(i);
    vi.advanceTimersByTime(150);
    expect(t.filterEvents()).toHaveLength(1);
  });

  it('the popup: Enter reported as key code 229 neither applies nor closes', () => {
    vi.useFakeTimers();
    const f = filters({ popup: true }) as GridFeature & { openFilter(c: string): boolean };
    const t = make({ server: true, features: [f] });
    t.f.answer(['a']);
    expect(f.openFilter('name')).toBe(true);
    const pop = () => t.host.querySelector<HTMLElement>('.dzg-popup');
    const v = pop()!.querySelector<HTMLInputElement>('input.dzg-fval')!;
    v.value = 'ann';
    v.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const before = t.f.calls.length;
    t.key(v, 'Enter', { keyCode: 229 });
    expect(pop()).not.toBeNull();
    expect(t.f.calls.length).toBe(before);
    t.key(v, 'Enter');
    expect(t.f.calls.length).toBe(before + 1);
  });
});
