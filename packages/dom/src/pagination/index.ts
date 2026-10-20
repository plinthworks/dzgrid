import { problem, type GridCommand, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { mounted, settled } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { PaginationMessageKey } from '../messages.js';
import type { Part, SlotContext } from '../part.js';
import { attr, footerContext, words } from './context.js';
import { countPart } from './count.js';
import { pagerPart } from './pager.js';
import { selectedPart } from './selected.js';
import { injectPaginationStyles } from './styles.js';

export interface PaginationOptions {
  /** The footer's parts, in order (fixed): `footer.*` names, or a host's own `footer` parts. */
  readonly footer?: readonly string[];
}

/** The texts `pagination()` needs, from `@dzgrid/dom/locales/<lang>-pagination`. */
export const PAGINATION_KEYS = [
  'pager.label', 'pager.first', 'pager.prev', 'pager.next', 'pager.last', 'pager.page', 'pager.pageOpen', 'pager.size',
  'count.range', 'count.rangeOpen', 'count.filtered', 'selected.hidden', 'selected.selectAll', 'selected.clear', 'announce.page', 'announce.pageOpen',
] satisfies readonly PaginationMessageKey[];

type C = SlotContext['footer'];
const footerPart = (part: Part<C>) => ({ slot: 'footer' as const, part });

/**
 * `pagination()`: a footer under the rows (docs/behaviors/pagination-footer.md, step 17) — what is
 * selected, where the user is, and the pager in a named `<nav>`. Its parts `footer.selected`,
 * `footer.count` and `footer.pager` are replaced by a host's of the same name.
 *
 * ```ts
 * import { pagination } from '@dzgrid/dom/pagination';
 * import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
 * createGrid(host, { pagination: { pageSize: 50 }, messages: { ...FR, text: { ...FR.text, ...FR_PAGINATION.text } }, features: [pagination()], … });
 * ```
 */
export function pagination(o: PaginationOptions = {}): GridFeature {
  const names = o.footer ?? ['footer.selected', 'footer.count', 'footer.pager'];
  return {
    id: 'pagination',
    parts: { 'footer.selected': footerPart(selectedPart), 'footer.count': footerPart(countPart), 'footer.pager': footerPart(pagerPart) },
    setup: (g) => setup(g, names),
  };
}

function setup(g: GridContext<unknown>, names: readonly string[]): FeatureHandle {
  const tell = (problems: Problem[]): void => void emit(g.kernel, { type: 'problems', source: 'host', problems });
  // Rows that are not paged: nothing to draw (said once).
  if (!g.rows.page) return tell([problem('invalid-page', 'warning', 'features.pagination')]), { destroy() {} };
  const missing = PAGINATION_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`pagination: missing ${missing.join(', ')}`);
  const { doc, el } = g;
  const target = el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectPaginationStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);

  // The strip, last in the grid, outside role="grid"; one host per name, the pager's a <nav>.
  const footer = doc.createElement('div');
  footer.className = 'dzg-footer';
  const parts = g.parts();
  const hosts = names.map((name, i) => {
    const h = doc.createElement(name === 'footer.pager' ? 'nav' : 'div');
    h.dataset['part'] = name;
    footer.append(h);
    if (parts[name]?.slot !== 'footer') tell([problem('unknown-part', 'error', `pagination.footer[${i}]`, name)]);
    return { name, h, m: mounted<C>(g) };
  });
  el.root.append(footer);
  // The overlay stops above it.
  const size = (): void => el.root.style.setProperty('--dzg-footer-size', `${footer.offsetHeight}px`);
  size();
  const RO = (g.win as (Window & typeof globalThis) | null)?.ResizeObserver;
  if (RO) {
    const ro = new RO(size);
    ro.observe(footer);
    g.scope.observe(ro);
  }

  // The user's own page change (a button, the size): said once the rows are in.
  let mine = false;
  const act = (cmd: GridCommand): void => {
    mine = true;
    try {
      g.kernel.dispatch(cmd, 'user');
    } finally {
      mine = false;
    }
  };
  const own = footerContext(g, act);
  const say = settled(g, (e) => mine && e.type === 'pageChanged', () => {
    const c = own();
    const p = c.page;
    const range = words(g.msg, c);
    g.live.announce(p.pageCount === null ? g.msg('announce.pageOpen', { page: p.index + 1, range }) : g.msg('announce.page', { page: p.index + 1, count: p.pageCount, range }));
  });
  g.scope.add(g.kernel.subscribe((e) => {
    // A new page starts at the top (a refresh keeps the scroll).
    if (e.type === 'modelUpdated' && e.kind === 'page') g.scroll.scrollTo(0), g.schedule();
    say(e);
  }));

  return {
    afterRows() {
      const all = g.parts();
      const c = own();
      for (const { name, h, m } of hosts) {
        if (name === 'footer.pager') attr(h, 'aria-label', g.msg('pager.label', { grid: g.settings.label ?? g.msg('grid.label') }));
        const p = all[name];
        m.set(h, p?.slot === 'footer' ? (p.part as Part<C>) : null, c);
      }
    },
    destroy() {
      for (const { m } of hosts) m.clear();
      footer.remove();
    },
  };
}
