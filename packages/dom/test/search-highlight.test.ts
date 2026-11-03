// The searched text tinted inside the cells (1.4.0, docs/behaviors/search-highlight.md; owner decisions 2026-11-03):
// the quick search's words and find's text, folded as the search folds, mapped back to the text shown; through the CSS
// Custom Highlight API (a stand-in registry here: jsdom has none), never in a part's DOM; a part given the texts
// (`search.quick`, `search.find`). Expectations written by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fold } from '@dzgrid/core';
import type { SlotContext, SlotPart } from '../src/index.js';
import { spans } from '../src/highlight/chunk.js';
import { quickSearch } from '../src/search.js';
import { find } from '../src/find.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_FIND } from '../src/locales/en-find.js';
import { cleanup, idOf, join, rmake, type R, type RMake } from './support-range.js';

/** A stand-in for the browser's registry: `CSS.highlights` (a map) and `Highlight` (a set with a priority). */
class FakeHighlight extends Set<Range> {
  priority = 0;
}
const win = window as unknown as { CSS?: { highlights?: Map<string, FakeHighlight> }; Highlight?: unknown };
let saved: { CSS: unknown; Highlight: unknown };
beforeEach(() => {
  saved = { CSS: win.CSS, Highlight: win.Highlight };
  win.CSS = { ...(win.CSS ?? {}), highlights: new Map() };
  win.Highlight = FakeHighlight;
});
afterEach(() => {
  cleanup();
  win.CSS = saved.CSS as never; // restoring jsdom's own (absent) objects
  win.Highlight = saved.Highlight;
});

/** The text each range of a highlight covers, `row/col:text`, sorted. */
const tinted = (name: string, rowOf: (el: Element) => string | null): string[] =>
  [...(win.CSS!.highlights!.get(name) ?? [])].map((r) => `${rowOf(r.startContainer.parentElement!)}/${r.startContainer.parentElement!.closest<HTMLElement>('.dzg-cell')!.dataset['col']}:${r.toString()}`).sort();

describe('spans: folded matches mapped back to the text shown (search-highlight.md 2)', () => {
  it('case and accents ignored, the original letters covered', () => {
    expect(spans('Été brûlant', ['ete'])).toEqual([[0, 3]]);
    expect(spans('SÉVÈRE', ['ver'])).toEqual([[2, 5]]);
    expect(spans('abcabc', ['bc'])).toEqual([[1, 3], [4, 6]]);
  });

  it('decomposed accents: the marks go with their letter, a trailing one too', () => {
    expect(spans('éte', ['ete'])).toEqual([[0, 4]]);
    expect(spans('café', ['cafe'])).toEqual([[0, 5]]);
  });

  it('Arabic short vowels and Arabic-Indic digits fold as the search folds', () => {
    const s = 'مُحَمَّد';
    expect(spans(s, [fold('محمد')])).toEqual([[0, s.length]]);
    expect(spans('١٢٣', ['12'])).toEqual([[0, 2]]);
  });

  it('a script folded across letters (Greek final sigma): nothing rather than a wrong place', () => {
    expect(spans('ΟΔΟΣ', [fold('ΟΔΟΣ')])).toEqual([]);
  });

  it('no needle, an empty needle or text: nothing', () => {
    expect(spans('abc', [])).toEqual([]);
    expect(spans('abc', [''])).toEqual([]);
    expect(spans('', ['a'])).toEqual([]);
  });
});

function hmake(o: RMake & { search?: Parameters<typeof quickSearch>[0]; find?: Parameters<typeof find>[0] } = {}) {
  const qs = quickSearch(o.search);
  const fd = find({ debounceMs: 0, ...o.find });
  const t = rmake({ messages: join(EN, EN_RANGE, EN_FIND), ...o, features: (r) => [r, qs, fd] });
  const rowOf = (el: Element) => idOf(t.ctx.rowRenderer.keyOf(el.closest('.dzg-row')!));
  /** Lets the lazy chunk load, then paints. */
  const settle = async () => {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
    t.tick();
  };
  return { ...t, qs, fd, tinted: (name: string) => tinted(name, rowOf), settle };
}

describe('the quick search (search-highlight.md 1, 3, 8, 9)', () => {
  it('each word, where the search looks: text always, numbers for a word with a digit', async () => {
    const t = hmake();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name 1' }, 'api');
    await t.settle();
    const r1 = t.tinted('dzg-search').filter((x) => x.startsWith('r1/'));
    expect(r1).toEqual(['r1/n:1', 'r1/name:1', 'r1/name:Name', 'r1/s:1']);
  });

  it('emptied: nothing tinted', async () => {
    const t = hmake();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name' }, 'api');
    await t.settle();
    expect(t.tinted('dzg-search').length).toBeGreaterThan(0);
    t.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'api');
    await t.settle();
    expect(t.tinted('dzg-search')).toEqual([]);
  });

  it('highlight: false: nothing tinted, the search the same', async () => {
    const t = hmake({ search: { highlight: false } });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name 1' }, 'api');
    await t.settle();
    expect(t.tinted('dzg-search')).toEqual([]);
    expect(t.g.kernel.rows.counts.filtered).toBeGreaterThan(0);
  });

  it('no API in the browser: nothing tinted, nothing thrown', async () => {
    win.Highlight = undefined;
    const t = hmake();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name' }, 'api');
    await t.settle();
    expect(win.CSS!.highlights!.size).toBe(0);
  });
});

describe('find (search-highlight.md 4, 5)', () => {
  it('the text in the hit cells, the current hit\'s apart; closed: gone', async () => {
    const t = hmake({ rows: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: `s${i % 7}`, q: 0 })) });
    t.fd.api(t.g)!.open('name 1');
    await t.settle();
    expect(t.tinted('dzg-find-current')).toEqual(['r1/name:Name 1']);
    expect(t.tinted('dzg-find')).toEqual(['r10/name:Name 1', 'r11/name:Name 1']);
    expect((win.CSS!.highlights!.get('dzg-find-current') as FakeHighlight).priority).toBeGreaterThan((win.CSS!.highlights!.get('dzg-find') as FakeHighlight).priority);
    t.fd.api(t.g)!.close();
    await t.settle();
    expect(t.tinted('dzg-find')).toEqual([]);
    expect(t.tinted('dzg-find-current')).toEqual([]);
  });
});

describe('parts (search-highlight.md 6, parts.md)', () => {
  it('a part\'s cell is never tinted; its context carries the texts searched', async () => {
    const seen: SlotContext['cell'][] = [];
    const part: SlotPart<'cell'> = { slot: 'cell', part: { mount: (el, c) => (seen.push(c), (el.textContent = c.text), { update: (n) => void seen.push(n) }) } };
    const t = hmake({ settings: { parts: { mine: part } }, columns: [{ id: 'name', header: 'Name', width: 120, ui: { cell: 'mine' } }, { id: 's', header: 'S', width: 80 }] as never }); // the columns' row type is the support's R; cast for brevity
    expect(seen.at(-1)!.search).toEqual({ quick: '', find: '' });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name 1' }, 'api');
    await t.settle();
    expect(seen.at(-1)!.search).toEqual({ quick: 'name 1', find: '' });
    expect(t.tinted('dzg-search').filter((x) => x.includes('/name:'))).toEqual([]);
    t.fd.api(t.g)!.open('s1');
    await t.settle();
    expect(seen.at(-1)!.search).toEqual({ quick: 'name 1', find: 's1' });
  });
});

export type { R };
