// A random walk over the quick search box (step 16; docs/behaviors/quick-search-box.md): typing,
// input-method compositions, pauses, Enter, Escape, leaving the field, a host's quick.set, the
// overlay's clear-all, a second field bound and unbound, the first unbound and bound again, a
// locale change, a floating-row filter, and on a server answers in and out of order. Invariants
// after every step. Seeded: a failure prints its seed and the steps that led there
// (`WALK_SEED=12` replays one, `WALK_SEEDS=500` runs more).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeQuery } from '@dzgrid/core';
import { quickSearch } from '../src/search.js';
import { filters } from '../src/filters.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import type { GridContext } from '../src/context.js';
import { cleanup, grids, make, MESSAGES, ROWS } from './support-filters.js';

afterEach(cleanup);
const SEEDS = Number(process.env['WALK_SEEDS'] ?? 60);
const ONLY = process.env['WALK_SEED'] ? Number(process.env['WALK_SEED']) : 0;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

const TEXTS = ['', ' ', 'a', 'an', 'ann', 'ann ', ' bob', 'bob1', 'b  o', 'zz', '  ', 'مَرِيض', 'ann1'];
const FR_ALL = { ...FR, text: { ...FR.text, ...FR_FILTERS.text } };

function field(): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'search';
  i.setAttribute('aria-label', 'Search');
  document.body.append(i);
  return i;
}

type Box = { el: HTMLInputElement; bound: boolean; composing: boolean; off: () => void };
/** What a field holds in the middle of a composition: never sent. */
const PARTIAL = ['مَ', 'مَرِ', 'ك'];

function walk(seed: number, server: boolean, steps = 60) {
  const r = rng(seed);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed}${server ? ' (server)' : ''}: ${m}\n  ${log.join('\n  ')}`;
  vi.useFakeTimers();
  const search = quickSearch();
  const t = make({ server, features: [search, filters({ floating: true })] });
  const g = (t.g as unknown as { context: GridContext<unknown> }).context;
  const answered = new Set<unknown>();
  const answer = (c: (typeof t.f.calls)[number], rows: { id: string; name: string; n: number }[]) => {
    if (answered.has(c)) return;
    answered.add(c);
    c.ok({ rows, total: rows.length });
  };
  const answerLatest = () => {
    const c = t.f.calls.at(-1);
    if (!server || !c) return;
    const q = (c.req.quick ?? '').toLowerCase();
    answer(c, ROWS.filter((x) => x.name.includes(q)).map((x) => ({ id: x.id, name: x.name, n: x.n })));
  };
  answerLatest();
  const pause = server ? 300 : 150;
  const boxes: Box[] = [field(), field()].map((el) => ({ el, bound: false, composing: false, off: () => {} }));
  const bind = (b: Box) => {
    b.off = search.bind(b.el);
    b.bound = true;
  };
  bind(boxes[0]!);
  // A composing field's partial text is never dispatched by the user's typing (a field bound in the
  // middle of a composition applies what it holds, as any restored text: not the user's edit).
  // (Recorded, not thrown: an error inside an event listener would not reach the test.)
  const partials: string[] = [];
  const dispatch = t.g.kernel.dispatch.bind(t.g.kernel);
  vi.spyOn(t.g.kernel, 'dispatch').mockImplementation((cmd, source) => {
    if (cmd.type === 'quick.set' && source === 'user' && PARTIAL.includes(cmd.text)) partials.push(cmd.text);
    return dispatch(cmd, source);
  });
  // A change the search does not announce (a host's quick.set, a bind applying a restored text, a locale) since the last sentence.
  let silent = false;
  const say = g.live.announce.bind(g.live);
  vi.spyOn(g.live, 'announce').mockImplementation((text) => {
    silent = false;
    say(text);
  });
  const type = (b: Box, text: string) => {
    b.el.value = text;
    b.el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: b.composing }));
  };
  const key = (b: Box, k: string, init: KeyboardEventInit = {}) => b.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  const name = (b: Box) => boxes.indexOf(b);

  for (let i = 0; i < steps; i++) {
    const b = r.pick(boxes);
    const step = r.int(16);
    const callsBefore = t.f.calls.length;
    let settled = false;
    switch (step) {
      case 0: case 1: case 2: {
        if (!b.bound) break;
        const s = b.composing ? r.pick(PARTIAL) : r.pick(TEXTS);
        log.push(`type ${name(b)} ${JSON.stringify(s)}${b.composing ? ' (composing)' : ''}`);
        type(b, s);
        break;
      }
      case 3: {
        if (!b.bound) break;
        if (!b.composing) {
          log.push(`compose start ${name(b)}`);
          b.el.focus();
          b.composing = true;
          b.el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
          type(b, r.pick(PARTIAL));
        } else {
          const s = r.pick(['مَرِيض', 'كتاب', '']);
          log.push(`compose end ${name(b)} ${JSON.stringify(s)}`);
          b.composing = false;
          b.el.value = s;
          b.el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: s }));
        }
        break;
      }
      case 4: case 5: {
        log.push('pause');
        vi.advanceTimersByTime(pause);
        // At most one search request per pause (a floating filter's edit may ask too).
        const searched = t.f.calls.slice(callsBefore).filter((c, k, a) => (c.req.quick ?? '') !== ((k ? a[k - 1] : t.f.calls[callsBefore - 1])?.req.quick ?? ''));
        expect(searched.length, fail('more than one search request in a pause')).toBeLessThanOrEqual(1);
        answerLatest();
        settled = true;
        break;
      }
      case 6: {
        if (!b.bound) break;
        log.push(`enter ${name(b)}${b.composing ? ' (229)' : ''}`);
        key(b, 'Enter', b.composing ? { keyCode: 229 } : {});
        break;
      }
      case 7: {
        if (!b.bound) break;
        log.push(`escape ${name(b)}${b.composing ? ' (composing)' : ''}`);
        key(b, 'Escape', b.composing ? { isComposing: true } : {});
        break;
      }
      case 8: {
        if (!b.bound || b.composing) break;
        log.push(`focus and leave ${name(b)}`);
        b.el.focus();
        b.el.blur();
        break;
      }
      case 9: {
        const s = r.pick(['bob', 'ann', '', 'zz']);
        log.push(`host quick.set ${JSON.stringify(s)}`);
        if (s !== t.g.kernel.query.quick) silent = true;
        t.g.kernel.dispatch({ type: 'quick.set', text: s }, 'api');
        break;
      }
      case 10: {
        log.push('clear all');
        t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'user');
        break;
      }
      case 11: {
        const x = boxes[1]!;
        if (x.bound) {
          log.push('unbind 1');
          x.off();
          x.bound = false;
          x.composing = false;
        } else {
          log.push(`bind 1 (holding ${JSON.stringify(x.el.value)})`);
          x.composing = false;
          silent = true;
          bind(x);
        }
        break;
      }
      case 12: {
        const x = boxes[0]!;
        log.push(`unbind and bind 0 (holding ${JSON.stringify(x.el.value)})`);
        x.off();
        x.composing = false;
        silent = true;
        bind(x);
        break;
      }
      case 13: {
        const fr = r.int(2) === 0;
        log.push(`locale ${fr ? 'fr' : 'en'}`);
        silent = true;
        t.g.update({ locale: fr ? 'fr-FR' : 'en-US', messages: fr ? FR_ALL : MESSAGES } as never);
        break;
      }
      case 14: {
        const inp = t.input('n');
        if (!inp) break;
        const v = r.pick(['', '3', '12']);
        log.push(`floating filter n ${JSON.stringify(v)}`);
        inp.value = v;
        inp.dispatchEvent(new InputEvent('input', { bubbles: true }));
        break;
      }
      case 15: {
        const old = t.f.calls.slice(0, -1).filter((c) => !answered.has(c)).at(-1);
        if (!server || !old) break;
        log.push('an older answer arrives');
        const said = t.live.said;
        answer(old, [{ id: 'x', name: 'x', n: 0 }]);
        expect(t.live.said, fail('a stale answer was announced')).toBe(said);
        break;
      }
    }
    expect(partials, fail('a composing field dispatched its partial text')).toEqual([]);
    // Every request's search is trimmed, never empty.
    for (const c of t.f.calls) {
      const q = c.req.quick;
      expect(q === undefined || (q !== '' && q === q.trim()), fail(`wire quick ${JSON.stringify(q)}`)).toBe(true);
    }
    if (!settled) continue;
    vi.advanceTimersByTime(1000);
    answerLatest();
    // Settled: every bound field not in a composition shows the grid's search (trimmed).
    for (const x of boxes) {
      if (!x.bound || x.composing) continue;
      expect(x.el.value.trim(), fail(`field ${name(x)} shows ${JSON.stringify(x.el.value)}, grid ${JSON.stringify(t.g.kernel.query.quick)}`)).toBe(t.g.kernel.query.quick);
    }
    // When the search spoke last, the live text is the settled count.
    const n = t.g.kernel.rows.counts.filtered;
    if (!silent && n !== null && /^\d+ (rows?|lignes?)$/.test(t.live.said)) expect(t.live.said, fail(`live text, ${n} rows held`)).toMatch(new RegExp(`^${n} `));
  }
  // Everything unbound and the grid gone: no timer, no listener left.
  for (const x of boxes) if (x.bound) x.off();
  t.g.destroy();
  grids.length = 0;
  vi.advanceTimersByTime(100);
  expect(vi.getTimerCount(), fail('timers left')).toBe(0);
  for (const x of boxes) {
    x.el.value = 'late';
    x.el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    x.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(vi.getTimerCount(), fail('a listener left')).toBe(0);
  }
}

describe('the quick search box, a random walk', () => {
  const seeds = ONLY ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it(`holds its invariants in the browser (${seeds.length} seeds)`, () => {
    for (const s of seeds) {
      walk(s, false);
      cleanup();
    }
  });
  it(`holds its invariants on a server (${seeds.length} seeds)`, () => {
    for (const s of seeds) {
      walk(s, true);
      cleanup();
    }
  });
});
