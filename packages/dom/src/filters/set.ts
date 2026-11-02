import type { ValuesHandle } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import { el } from './dom.js';
import { form, type Body, type Changed, type F, type Make } from './forms.js';
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
export const setForm = (env: { g: GridContext<unknown> | null }, kit: Once<string, SetKit>, m: Readonly<Record<string, Make>>): Part<C> =>
  form((get, doc, changed) => {
    const list = setBody(env, kit, get, doc, changed);
    // A condition above the list (filter-multi.md, owner Q-F3 A): the column type's (a day or instant one only with the kits).
    const f = get().column.def.filter;
    const t = get().column.type;
    const mk = f && f.condition && (/^(number|day|instant)$/.test(t) ? m[t] : m['text']);
    if (!mk) return list;
    const cond = mk(get, doc, changed);
    const hr = el(doc, 'hr', 'dzg-fsep');
    hr.setAttribute('role', 'presentation');
    /** A stored filter as [condition, list]: a combined AND of a condition then a set, a set alone, else a condition alone. */
    const split = (s: F | null): [F | null, F | null] => {
      const cs = s?.['conditions'] as readonly F[] | undefined;
      return s?.type === 'set' ? [null, s] : s?.type === 'combined' && s['join'] === 'and' && cs?.length === 2 && cs[1]?.type === 'set' ? [cs[0]!, cs[1]] : [s, null];
    };
    return {
      els: [...cond.els, hr, ...list.els],
      edits(s) {
        const [a, b] = split(s);
        return cond.edits(a) && list.edits(b);
      },
      write(s) {
        const [a, b] = split(s);
        cond.write(a);
        list.write(b);
      },
      read(j) {
        const a = cond.read(j);
        const b = list.read(j);
        if (a === undefined || b === undefined) return undefined;
        return a && b ? { type: 'combined', join: 'and', conditions: [a, b] } : (a ?? b);
      },
      texts() {
        cond.texts();
        list.texts();
      },
      // The list measures its rows once shown (its focus), then the condition takes the focus.
      focus() {
        list.focus();
        cond.focus();
      },
      destroy() {
        cond.destroy?.();
        list.destroy?.();
      },
    };
  });

/** The list's body: a proxy that loads the chunk on first use. */
function setBody(env: { g: GridContext<unknown> | null }, kit: Once<string, SetKit>, get: () => C, doc: Document, changed: Changed): Body {
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
      // Not loaded yet: the part written stays (a condition beside it must not drop it).
      read: (judge) => (inner ? inner.read(judge) : last),
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
}
