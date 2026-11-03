import { fold, quickWords } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { TintArg } from './use.js';

/**
 * The searched text tinted in the cells (docs/behaviors/search-highlight.md): the lazy chunk shared by `quickSearch()`
 * and `find()`, loaded at the first search that needs it. Pure matching (`spans`) and the CSS Custom Highlight API's
 * registry (`painter`); the cells' DOM is never changed.
 */

/**
 * Where `needles` (already folded, as `fold` gives them) are found in `text`, folded the way the search folds: each
 * match as `[start, end)` offsets into the original `text`, combining marks after a matched letter included. A text
 * whose folding letter by letter differs from its whole folding (Greek final sigma, recomposing scripts) gives none:
 * never a tint at the wrong place (search-highlight.md, « differently on purpose »).
 */
export function spans(text: string, needles: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  if (!text || !needles.some(Boolean)) return out;
  let f = '';
  /** Per folded code unit: where its letter starts, and ends (marks folded to nothing after it included). */
  const s: number[] = [];
  const e: number[] = [];
  for (let i = 0; i < text.length; ) {
    const n = text.codePointAt(i)! > 0xffff ? 2 : 1;
    const x = fold(text.slice(i, i + n));
    if (!x && e.length) e[e.length - 1] = i + n;
    for (let j = 0; j < x.length; j++) s.push(i), e.push(i + n);
    f += x;
    i += n;
  }
  if (f !== fold(text)) return out;
  for (const q of needles) for (let p = q ? f.indexOf(q) : -1; p >= 0; p = f.indexOf(q, p + 1)) out.push([s[p]!, e[p + q.length - 1]!]);
  return out;
}

type Registry = Map<string, Set<Range> & { priority: number }>;
export interface Painter {
  /** The ranges of these texts (each with its folded needles), and no other of this painter's. */
  paint(items: Iterable<readonly [Text, readonly string[]]>): void;
}

/**
 * One grid's tint under one highlight `name` (several grids share it: each adds and removes its own ranges only); a
 * higher `priority` drawn over a lower. Ranges kept per text node while its text and needles are the same.
 */
export function painter(win: Window, name: string, priority: number): Painter {
  const w = win as unknown as { CSS: { highlights: Registry }; Highlight: new () => Set<Range> & { priority: number } };
  const reg = w.CSS.highlights;
  const cache = new WeakMap<Text, { d: string; q: string; r: Range[] }>();
  let mine: Range[] = [];
  return {
    paint(items) {
      const next: Range[] = [];
      for (const [t, qs] of items) {
        const q = qs.join('\0');
        let c = cache.get(t);
        if (!c || c.d !== t.data || c.q !== q) {
          const r = spans(t.data, qs).map(([a, b]) => {
            const x = t.ownerDocument.createRange();
            x.setStart(t, a);
            x.setEnd(t, b);
            return x;
          });
          cache.set(t, (c = { d: t.data, q, r }));
        }
        next.push(...c.r);
      }
      let h = reg.get(name);
      if (!h && !next.length) return void (mine = next);
      if (!h) reg.set(name, (h = new w.Highlight())), (h.priority = priority);
      const keep = new Set(next);
      for (const r of mine) keep.has(r) || h.delete(r);
      for (const r of next) h.add(r);
      mine = next;
      if (!h.size) reg.delete(name);
    },
  };
}

type Items = Iterable<readonly [Text, readonly string[]]>;

/**
 * A grid's tint (search-highlight.md 3–6): the quick search's words where the search looks (text, list and text-keyed
 * columns always; numbers and dates for a word with a digit), or find's text in its hit cells, the current hit apart.
 * Only the body's mounted cells the grid draws: never a part's, nor the editor's.
 */
export function tinter(g: GridContext<unknown>, find: boolean): (arg: TintArg | null) => void {
  const win = g.win!;
  const a = painter(win, find ? 'dzg-find' : 'dzg-search', find ? 1 : 0);
  const b = find ? painter(win, 'dzg-find-current', 2) : null;
  /** The cells the grid draws, each with what to look for in it (none: skipped); `cur` picks the current hit's. */
  const cells = (want: (key: unknown, c: { col: { type: string; codec: { keyKind?: string } } | null }, id: string) => readonly string[] | null | undefined): Items => {
    const out: [Text, readonly string[]][] = [];
    for (const [key, v] of g.rowRenderer.mounted) {
      for (const [id, c] of v.cells) {
        const qs = !c.part && c.el !== g.editor?.cell && c.text.data ? want(key, c, id) : null;
        if (qs?.length) out.push([c.text, qs]);
      }
    }
    return out;
  };
  return (arg) => {
    if (!arg) return a.paint([]), b?.paint([]);
    if (typeof arg === 'string') {
      const words = quickWords(arg);
      const digits = words.filter((w) => /[0-9]/.test(w));
      const t = (c: { col: { type: string; codec: { keyKind?: string } } | null }): readonly string[] => {
        const x = c.col?.type;
        return x === 'text' || x === 'enum' || (x === 'custom' && c.col!.codec.keyKind === 'text') ? words : x === 'number' || x === 'day' || x === 'instant' ? digits : [];
      };
      return a.paint(words.length ? cells((_, c) => t(c)) : []);
    }
    const q = [fold(arg[0])];
    const at = arg[1];
    a.paint(cells((k, _, id) => (at.get(k)?.get(id) === false ? q : null)));
    b!.paint(cells((k, _, id) => (at.get(k)?.get(id) ? q : null)));
  };
}
