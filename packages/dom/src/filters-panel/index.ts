import { fold, instantToDayIn, makeQuery, problem, type GridKernel, type ResolvedColumn } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { mounted, needTexts, type Mounted } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { Part, PartBase, SlotContext } from '../part.js';
import type { FiltersPanelMessageKey } from '../part-texts.js';
import { injectPanelStyles } from './styles.js';

/** The texts `filtersPanel()` needs, from `@dzgrid/dom/locales/<lang>-filters-panel`. */
export const FILTERS_PANEL_KEYS = 'title close clearAll search none matches active count'.split(' ').map((k) => `fpanel.${k}`) as readonly FiltersPanelMessageKey[];

export interface FiltersPanelOptions {
  /** The grid's side it stands on, logical: `'end'` (the default) or `'start'`; right to left puts `end` at the left. */
  readonly side?: 'start' | 'end';
  /** Open from the start (closed by default). */
  readonly open?: boolean;
  /** The strip with the « Filters » button (on by default); `false`: the application opens it through `api(grid)`. */
  readonly button?: boolean;
}
/** A grid's filters panel, for the application (its own button, a test). */
export interface FiltersPanelApi {
  /** Opens it, the focus in its column search; `column`: that column unfolded, the focus in its form. False without `filters()` or such a column. */
  open(column?: string): boolean;
  /** Closes it (what is pending applied), the focus back on its button, else on the grid. */
  close(): void;
  /** Opens or closes it; true when it is open after. */
  toggle(): boolean;
  readonly isOpen: boolean;
}
export interface FiltersPanelFeature extends GridFeature {
  /** The panel of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): FiltersPanelApi | null;
}

type C = SlotContext['filter'];
/** What `filters()` hands the panel on its handle (filters/index.ts), by shape: the panel never imports the filters' code. */
type PanelBridge = {
  readonly resolve: (col: ResolvedColumn<unknown>, slot: 'filter') => { readonly part: Part<any> | null; readonly kind: string };
  readonly commit: { edits(col: ResolvedColumn<unknown>, kind: string, who: object): Pick<C, 'column' | 'kind' | 'state' | 'where' | 'debounceMs' | 'dropped' | 'set'>; flush(column: string): void };
  readonly apply?: 'button' | 'live' | undefined;
};
type Item = { readonly li: HTMLElement; readonly btn: HTMLButtonElement; readonly label: HTMLElement; readonly dot: HTMLElement; box: HTMLElement | null; m: Mounted<C> | null };
/** The panel's body, apart from where it stands (filters-panel.md 15): the dock will host it as the panel `filters`. */
interface Body {
  readonly el: HTMLElement;
  readonly head: HTMLElement;
  paint(): void;
  /** Every column folded (what is pending applied). */
  foldAll(): void;
  /** The column search focused, or `column` unfolded and its form focused. */
  focus(column?: string): boolean;
  /** How many filters are in force. */
  count(): number;
}
const NONE: readonly string[] = Object.freeze([]);
const tx = (el: Element, s: string): void => void (el.textContent !== s && (el.textContent = s));
let uid = 0;

/**
 * `filtersPanel(options)`: every column's filter in one side panel (docs/behaviors/filters-panel.md; owner answers
 * 2026-11-03), beside `filters()` whose forms it shows: a strip with the « Filters » button at the side the application
 * chose, the panel beside the rows (they take the room left), « Clear all filters », a column search, each filterable
 * column unfolding to the popup's own form, a dot on active filters; apply as `filters({ apply })`; in step with every
 * other writer. One feature object may serve several grids.
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * import { filtersPanel } from '@dzgrid/dom/filters-panel';
 * import { FR_FILTERS_PANEL } from '@dzgrid/dom/locales/fr-filters-panel';
 * import '@dzgrid/theme/filters-panel.css';
 * createGrid(host, { …, features: [filters(), filtersPanel({ side: 'end' })] });
 * ```
 */
export function filtersPanel(o: FiltersPanelOptions = {}): FiltersPanelFeature {
  const apis = new WeakMap<object, FiltersPanelApi>();
  return { id: 'filters-panel', api: (grid) => apis.get(grid.kernel) ?? null, setup: (g) => setup(g, o, apis) };
}

function setup(g: GridContext<unknown>, o: FiltersPanelOptions, apis: WeakMap<object, FiltersPanelApi>): FeatureHandle {
  needTexts(g, FILTERS_PANEL_KEYS, 'filters-panel');
  const { kernel: k, doc, el: { root } } = g;
  const off: FiltersPanelApi = { open: () => false, close() {}, toggle: () => false, isOpen: false };
  if (!g.settings.features?.some((f) => f.id === 'filters')) {
    emit(k, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.filtersPanel', '@dzgrid/dom/filters')] });
    apis.set(k, off);
    return { destroy: () => void apis.delete(k) };
  }
  const target = root.getRootNode();
  if (g.settings.injectStyles !== false) injectPanelStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);
  const fx = (): PanelBridge | undefined => g.features.map((h) => (h as { panel?: PanelBridge }).panel).find(Boolean);
  const b = body(g, fx);
  const side = doc.createElement('div');
  side.className = 'dzg-fside';
  side.append(b.el);
  let btn: HTMLButtonElement | null = null;
  let label: HTMLElement;
  let n: HTMLElement;
  if (o.button !== false) {
    btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dzg-fp-toggle';
    btn.setAttribute('aria-controls', b.el.id);
    label = doc.createElement('span');
    n = doc.createElement('span');
    n.className = 'dzg-fp-n';
    btn.append(label, n);
    side.append(btn);
  } else root.style.setProperty('--dzg-fstrip-size', '0px');
  root.append(side);
  root.dataset['dzgFside'] = o.side === 'start' ? 'start' : 'end';

  let on = false;
  const show = (v: boolean): void => {
    on = v;
    b.el.hidden = !v;
    root.toggleAttribute('data-dzg-fopen', v);
    btn?.setAttribute('aria-expanded', String(v));
    g.schedule();
  };
  /** `own`: its × pressed (WebKit focuses nothing on a click: the focus was not seen inside). */
  const close = (own?: boolean): void => {
    if (!on) return;
    const inside = own || b.el.contains(doc.activeElement);
    b.foldAll();
    show(false);
    if (inside) btn ? btn.focus() : g.restoreFocus();
  };
  const api: FiltersPanelApi = {
    open(column) {
      if (!fx()) return false;
      if (!on) show(true), b.paint();
      return b.focus(column);
    },
    close: () => close(),
    toggle: () => (on ? api.close() : api.open(), on),
    get isOpen() {
      return on;
    },
  };
  btn?.addEventListener('click', () => void api.toggle());
  b.head.querySelector('button')!.addEventListener('click', () => close(true));
  apis.set(k, api);
  show(!!o.open);
  return {
    afterRows() {
      if (btn) {
        const c = b.count();
        tx(label!, g.msg('fpanel.title'));
        tx(n!, c ? ` ${g.msg('fpanel.count', { n: c })}` : '');
      }
      if (on) b.paint();
    },
    destroy() {
      b.foldAll();
      side.remove();
      root.removeAttribute('data-dzg-fside');
      root.removeAttribute('data-dzg-fopen');
      root.style.removeProperty('--dzg-fstrip-size');
      apis.delete(k);
    },
  };
}

/** The panel's body (filters-panel.md 5–13): its head, « Clear all filters », the column search, the list. */
function body(g: GridContext<unknown>, fx: () => PanelBridge | undefined): Body {
  const { kernel: k, doc, scope } = g;
  const id = `dzg-fp${++uid}`;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Element | null, cls = ''): HTMLElementTagNameMap[K] => {
    const x = doc.createElement(tag);
    if (cls) x.className = cls;
    parent?.append(x);
    return x;
  };
  const el = mk('div', null, 'dzg-fpanel');
  el.id = id;
  el.setAttribute('role', 'region');
  el.setAttribute('aria-labelledby', `${id}t`);
  const head = mk('div', el, 'dzg-fp-head');
  const title = mk('span', head, 'dzg-fp-title');
  title.id = `${id}t`;
  const x = mk('button', head, 'dzg-fp-close');
  x.type = 'button';
  x.textContent = '×';
  const clr = mk('button', el, 'dzg-fp-clear');
  clr.type = 'button';
  const lab = mk('label', el, 'dzg-fp-q');
  const labText = mk('span', lab);
  const search = mk('input', lab);
  search.type = 'search';
  const none = mk('div', el, 'dzg-fp-none');
  none.setAttribute('role', 'status');
  const list = mk('ul', el, 'dzg-fp-list');
  list.setAttribute('role', 'list');
  const items = new Map<string, Item>();
  let q = '';
  let seq = 0;
  let hush = (): void => {};

  const name = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
  const kind = (b: PanelBridge, col: ResolvedColumn<unknown>) => b.resolve(col, 'filter');
  /** The part's context, as the popup's: the shared edits, the column's operators, today; `close` applies what waits and keeps the form. */
  const ctx = (b: PanelBridge, col: ResolvedColumn<unknown>, host: HTMLElement): Omit<C, keyof PartBase> => {
    const f = col.def.filter;
    const today = instantToDayIn((g.settings.clock ?? Date.now)() as never, g.ctx.timeZone) ?? '1970-01-01';
    return { ...b.commit.edits(col, kind(b, col).kind, host), ops: (f && f.ops) || NONE, today, close: () => b.commit.flush(col.id), apply: b.apply, values: (v) => k.values(col.id, v) };
  };
  const shut = (it: Item): void => {
    // Folding applies what waits; a grid going applies nothing (as the popup).
    if (!g.scope.isDisposed) fx()?.commit.flush(it.li.dataset['col']!);
    it.m?.clear();
    it.box?.remove();
    it.m = it.box = null;
    it.btn.setAttribute('aria-expanded', 'false');
    it.btn.removeAttribute('aria-controls');
  };
  /** Drawn (again) into its form; false when its part cannot draw (the item folds). */
  const draw = (it: Item, b: PanelBridge, col: ResolvedColumn<unknown>): boolean => {
    const host = it.box!.firstElementChild as HTMLElement;
    return it.m!.set(host, kind(b, col).part as Part<C>, ctx(b, col, host)) || (shut(it), false);
  };
  const unfold = (it: Item): boolean => {
    const b = fx();
    const col = g.columns.get(it.li.dataset['col']!);
    if (!b || !col) return false;
    const box = (it.box = mk('div', it.li));
    box.id = `${it.btn.id}g`;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-labelledby', it.btn.id);
    const host = mk('div', box, 'dzg-fpop');
    host.dataset['column'] = col.id;
    host.dataset['kind'] = kind(b, col).kind;
    it.m = mounted<C>(g);
    it.btn.setAttribute('aria-expanded', 'true');
    it.btn.setAttribute('aria-controls', box.id);
    return draw(it, b, col);
  };
  const item = (col: string): Item => {
    const li = mk('li', null, 'dzg-fp-item');
    li.dataset['col'] = col;
    const btn = mk('button', li, 'dzg-fp-col');
    btn.type = 'button';
    btn.id = `${id}c${++seq}`;
    btn.setAttribute('aria-expanded', 'false');
    const it: Item = { li, btn, label: mk('bdi', btn), dot: mk('span', btn, 'dzg-fp-dot'), box: null, m: null };
    btn.addEventListener('click', () => void (it.m ? shut(it) : unfold(it)));
    items.set(col, it);
    return it;
  };
  const heads = (): HTMLButtonElement[] => [...items.values()].filter((it) => !it.li.hidden).map((it) => it.btn);

  const paint = (): void => {
    const b = fx();
    if (!b) return;
    const all = k.query.filter;
    tx(title, g.msg('fpanel.title'));
    x.setAttribute('aria-label', g.msg('fpanel.close'));
    tx(clr, g.msg('fpanel.clearAll'));
    tx(labText, g.msg('fpanel.search'));
    // Nothing to clear: still reached, does nothing (as the menus' item is absent then).
    if (makeQuery({ sort: k.query.sort }).key === k.query.key) clr.setAttribute('aria-disabled', 'true');
    else clr.removeAttribute('aria-disabled');
    const cols = g.columns.state().map((s) => g.columns.get(s.id)!).filter((c) => c && kind(b, c).part);
    const ids = new Set(cols.map((c) => c.id));
    for (const [c, it] of items) if (!ids.has(c)) shut(it), it.li.remove(), items.delete(c);
    let shown = 0;
    cols.forEach((col, i) => {
      const it = items.get(col.id) ?? item(col.id);
      // Moved only when out of place: a moved node would lose the focus inside it.
      if (list.children[i] !== it.li) list.insertBefore(it.li, list.children[i] ?? null);
      const nm = name(col);
      tx(it.label, nm);
      const active = Object.hasOwn(all, col.id);
      it.li.toggleAttribute('data-dzg-active', active);
      tx(it.dot, active ? ` ${g.msg('fpanel.active')}` : '');
      shown += +!(it.li.hidden = !!q && !fold(nm).includes(q));
      if (it.m) draw(it, b, col);
    });
    tx(none, shown ? '' : g.msg('fpanel.none'));
  };
  const find = (): void => {
    q = fold(search.value.trim());
    paint();
    hush();
    hush = scope.timeout(() => void (q && g.live.announce(g.msg('fpanel.matches', { n: heads().length }))), 500);
  };
  search.addEventListener('input', find);
  // Disabled, the query is already the cleared one: the kernel keeps it, nothing is said.
  clr.addEventListener('click', () => void k.dispatch({ type: 'query.set', query: makeQuery({ sort: k.query.sort }) }, 'user'));
  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const stop = (): void => (e.preventDefault(), e.stopPropagation());
    if (e.key === 'Escape') {
      // The form's own Escape first (a date panel, a list's search); then the search emptied, or back to the column.
      if (e.defaultPrevented) return;
      const it = items.get(t.closest<HTMLElement>('.dzg-fp-item')?.dataset['col'] ?? '');
      if (t === search && search.value) (search.value = ''), find(), stop();
      else if (it && t !== it.btn) it.btn.focus(), stop();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const hs = heads();
    const to = (j: number): void => (stop(), j < 0 ? search.focus() : hs[Math.min(j, hs.length - 1)]?.focus());
    const i = hs.indexOf(t as HTMLButtonElement);
    if (t === search) return void (e.key === 'ArrowDown' && to(0));
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') to(i + (e.key === 'ArrowUp' ? -1 : 1));
    else if (e.key === 'Home' || e.key === 'End') to(e.key === 'Home' ? 0 : hs.length - 1);
  });

  return {
    el,
    head,
    paint,
    foldAll: () => items.forEach(shut),
    focus(column) {
      if (column === undefined) return search.focus(), true;
      const it = items.get(column);
      if (!it || (!it.m && !unfold(it))) return false;
      it.li.hidden = false;
      if (!it.m!.focus()) it.btn.focus();
      return true;
    },
    count: () => Object.keys(k.query.filter).length,
  };
}
