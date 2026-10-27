import type { ValuesHandle } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import { el } from './dom.js';
import { form, type Body, type Changed, type F } from './forms.js';
import { mounted, notice, once, type Once } from '@dzgrid/dom/internal';
import { injectFilterStyles } from './styles.js';

type C = SlotContext['filter'];

/** The set filter's lazy chunk (`filters({ loadSet })` returns one): its fields, and its layout CSS. */
export interface SetKit {
  body(get: () => C, doc: Document, changed: Changed, note: typeof notice, g: GridContext<unknown>, mount: typeof mounted): Omit<Body, 'edits'>;
  readonly css: string;
}

/** The chunk, imported once (`lazy.ts`); `own` replaces the `import()`. A module without `body` is a failure. */
export const setKit = (own?: () => Promise<SetKit>): Once<string, SetKit> =>
  once(() => (own ?? (() => import('./set/index.js')))(), (m) => typeof m?.body === 'function', 'body in the set chunk');

const list = (l: unknown): boolean => Array.isArray(l) && l.every((x) => typeof x === 'string');
/** What the list can show: none, or a set filter with exactly one list of texts and a valid `blanks`. */
const edits = (s: F | null): boolean =>
  s === null || (s.type === 'set' && !s['include'] !== !s['exclude'] && list(s['include'] ?? s['exclude']) && [undefined, 'include', 'exclude'].includes(s['blanks'] as string));

/**
 * `filter.set` (docs/behaviors/filter-set.md): the popup's shell (`form`) around a proxy that loads
 * the chunk on first use. Meanwhile `grid.loading` (`aria-busy`); a failure says
 * `filter.set.failed` with Retry (the error reported); the filter in force stays (it reads null).
 * The chunk's sheet is injected once per root, with the grid's nonce, unless `injectStyles: false`.
 */
export const setForm = (env: { g: GridContext<unknown> | null }, kit: Once<string, SetKit>): Part<C> =>
  form((get, doc, changed) => {
    const box = el(doc, 'div', 'dzg-fset');
    box.tabIndex = -1;
    let inner: Omit<Body, 'edits'> | null = null;
    let last: F | null = null;
    let dead = false;
    const n = notice(doc, box, () => (box.focus(), start()), (w) => get().msg(w === 'load' ? 'grid.loading' : 'filter.set.failed'), () => get().msg('grid.retry'));
    const fail = (err: unknown): void => {
      env.g!.report(err);
      n.say('fail');
    };
    const attach = (k: SetKit): void => {
      const g = env.g!;
      const focused = box.contains(doc.activeElement);
      n.stop();
      // The values handles the body opens, closed on a failure (a body that throws has no `destroy`).
      const hs: ValuesHandle[] = [];
      try {
        const root = g.el.root.getRootNode();
        if (g.settings.injectStyles !== false) injectFilterStyles(root.nodeType === 11 ? (root as ShadowRoot) : doc, g.settings.nonce, k.css, 'data-dzgrid-set');
        inner = k.body(() => (inner ? get() : { ...get(), values: (o) => hs[hs.push(get().values(o)) - 1]! }), doc, changed, notice, g, mounted);
        // The draft (and the status line's first text) before the fields show; the texts once in
        // the page, so the list measures its rows there.
        inner.write(last);
        box.append(...inner.els);
        inner.texts();
      } catch (err) {
        inner?.destroy?.();
        for (const h of hs) h.close();
        inner = null;
        box.replaceChildren();
        return fail(err);
      }
      if (focused) inner.focus();
      // The popup grows: placed again.
      box.dispatchEvent(new Event('change', { bubbles: true }));
    };
    function start(): void {
      const k = kit.done('');
      if (k) return attach(k);
      n.say('load');
      kit.load('').then((m) => !dead && attach(m), (err) => !dead && fail(err));
    }
    start();
    return {
      els: [box],
      edits,
      write(s) {
        last = s;
        inner?.write(s);
      },
      read: (judge) => (inner ? inner.read(judge) : null),
      texts() {
        n.words();
        inner?.texts();
      },
      focus: () => (inner ? inner.focus() : box.focus()),
      destroy() {
        dead = true;
        inner?.destroy?.();
      },
    };
  });
