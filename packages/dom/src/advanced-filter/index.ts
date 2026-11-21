import { advancedOf, instantToDayIn, problem, setAdvanced, type ColumnFilter, type FilterExpression, type GridKernel, type Json, type ResolvedColumn } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { mounted, needTexts, type Mounted } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { Part, PartBase, SlotContext } from '../part.js';
import type { AdvancedFilterMessageKey } from '../part-texts.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { injectAdvancedStyles } from './styles.js';

/** The texts `advancedFilter()` needs, from `@dzgrid/dom/locales/<lang>-advanced-filter`. */
export const ADVANCED_FILTER_KEYS = 'title join and or groupAnd groupOr addCondition addGroup removeCondition removeGroup column pick condition apply clear cancel conditionAdded groupAdded removed'
  .split(' ')
  .map((k) => `adv.${k}`) as readonly AdvancedFilterMessageKey[];

/** Nothing to set yet: the builder's look is the theme's (`@dzgrid/theme/advanced-filter.css`). */
export type AdvancedFilterOptions = Record<string, never>;

/** A grid's advanced filter, for the application (its button, its saved views, a test). */
export interface AdvancedFilterApi {
  /** Opens the builder (a modal dialog under `anchor`, else under the bound button, else under the headers), the focus on its first column. False without `filters()`. */
  open(anchor?: HTMLElement): boolean;
  /** Closes it, the draft dropped, the focus back on its button (else the grid). */
  close(): void;
  /** The application's own button opens and closes it (`aria-haspopup="dialog"`, `aria-expanded`); returns the unbinding. */
  bind(button: HTMLElement): () => void;
  /** The expression in force (the filter model's `''` entry), null when there is none. */
  get(): FilterExpression | null;
  /** Sets the expression in force (null removes it), the column filters kept: what `filter.set` answers. */
  set(expression: FilterExpression | null): boolean;
  readonly isOpen: boolean;
}
export interface AdvancedFilterFeature extends GridFeature {
  /** The builder of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): AdvancedFilterApi | null;
}

type C = SlotContext['filter'];
/** What `filters()` hands the panels on its handle (filters/index.ts), by shape: the builder never imports the filters' code. */
type Bridge = { readonly resolve: (col: ResolvedColumn<unknown>, slot: 'filter') => { readonly part: Part<any> | null; readonly kind: string } };
/** The draft: a group (its join, its items) or a condition (its column, its filter, its form). */
type G = { readonly g: true; join: 'and' | 'or'; readonly items: N[]; readonly li: HTMLElement; readonly box: HTMLElement; readonly list: HTMLElement; readonly radios: HTMLInputElement[]; readonly add: HTMLButtonElement; readonly level: number; readonly up: G | null };
type D = { readonly g?: undefined; column: string; filter: ColumnFilter | null; readonly li: HTMLElement; readonly box: HTMLElement; readonly sel: HTMLSelectElement; readonly host: HTMLElement; readonly m: Mounted<C>; readonly up: G };
type N = G | D;

const BUILT_IN: ReadonlySet<string> = new Set(['text', 'number', 'day', 'instant', 'boolean', 'set']);
const NONE: readonly string[] = Object.freeze([]);
/** Groups nest 5 deep at most (the core's rule, advanced-filter.md 1). */
const DEEPEST = 5;
const tx = (el: Element, s: string): void => void (el.textContent !== s && (el.textContent = s));
let uid = 0;

/**
 * `advancedFilter()`: one expression across columns, AND / OR groups nested, built in a dialog
 * (docs/behaviors/advanced-filter.md 9–18), beside `filters()` whose forms each condition shows. The expression is the
 * filter model's `''` entry (`@dzgrid/core`'s `advancedOf` / `withAdvanced`), applied with the column filters (AND).
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * import { advancedFilter } from '@dzgrid/dom/advanced-filter';
 * import { FR_ADVANCED_FILTER } from '@dzgrid/dom/locales/fr-advanced-filter';
 * import '@dzgrid/theme/advanced-filter.css';
 * const adv = advancedFilter();
 * const grid = createGrid(host, { …, features: [filters(), adv] });
 * adv.api(grid)!.bind(myButton);
 * ```
 */
export function advancedFilter(_o: AdvancedFilterOptions = {}): AdvancedFilterFeature {
  const apis = new WeakMap<object, AdvancedFilterApi>();
  return { id: 'advanced-filter', api: (grid) => apis.get(grid.kernel) ?? null, setup: (g) => setup(g, apis) };
}

function setup(g: GridContext<unknown>, apis: WeakMap<object, AdvancedFilterApi>): FeatureHandle {
  needTexts(g, ADVANCED_FILTER_KEYS, 'advanced-filter');
  const { kernel: k, doc } = g;
  const get = (): FilterExpression | null => advancedOf(k.query.filter);
  const set = (e: FilterExpression | null, source: 'api' | 'user' = 'api'): boolean => setAdvanced(k, e, source);
  const fx = (): Bridge | undefined => g.features.map((h) => (h as { panel?: Bridge }).panel).find(Boolean);
  if (!g.settings.features?.some((f) => f.id === 'filters')) {
    emit(k, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.advancedFilter', '@dzgrid/dom/filters')] });
    apis.set(k, { open: () => false, close() {}, bind: () => () => {}, get, set, isOpen: false });
    return { destroy: () => void apis.delete(k) };
  }
  const target = g.el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectAdvancedStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);

  const msg = (key: AdvancedFilterMessageKey, p?: Readonly<Record<string, number>>): string => g.msg(key, p);
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Element | null, cls = '', text?: string): HTMLElementTagNameMap[K] => {
    const x = doc.createElement(tag);
    if (cls) x.className = cls;
    if (text !== undefined) x.textContent = text;
    parent?.append(x);
    return x;
  };
  const button = (parent: Element, cls: string, text: string, fn: () => void): HTMLButtonElement => {
    const b = mk('button', parent, cls, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };

  let ref: PopupRef | null = null;
  let bound: HTMLElement | null = null;
  let root: G | null = null;
  const id = `dzg-adv${++uid}`;
  const el = mk('div', null, 'dzg-adv');
  const title = mk('div', el, 'dzg-adv-title');
  title.id = `${id}t`;
  const tree = mk('div', el, 'dzg-adv-tree');
  const foot = mk('div', el, 'dzg-adv-foot');
  const clr = button(foot, 'dzg-adv-clear', '', () => {
    fill(null);
    focusIn(root!.items[0]);
  });
  const cancel = button(foot, 'dzg-adv-cancel', '', () => ref?.close());
  const ok = button(foot, 'dzg-adv-apply', '', () => apply());

  /** The columns a condition may name: filterable, with a form (hidden ones too), in the columns' order. */
  const formOf = (col: ResolvedColumn<unknown> | undefined): { part: Part<any>; kind: string } | null => {
    const r = col?.filterable && fx()?.resolve(col, 'filter');
    if (!r) return null;
    if (r.part) return { part: r.part, kind: r.kind };
    // An enum column keeps no popup (filter-ui.md, Q2); here it takes the value list.
    const set = col!.type === 'enum' ? g.parts()['filter.set']?.part : undefined;
    return set ? { part: set as Part<any>, kind: 'set' } : null;
  };
  const columns = (): ResolvedColumn<unknown>[] => g.columns.state().map((s) => g.columns.get(s.id)!).filter((c) => !!formOf(c));
  const name = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
  const today = (): string => instantToDayIn((g.settings.clock ?? Date.now)() as never, g.ctx.timeZone) ?? '1970-01-01';

  /** A condition's form, (re)drawn for its column: the popup's own, on the draft (`set` writes it; `close` is Apply). */
  const draw = (d: D): void => {
    d.m.clear();
    const col = g.columns.get(d.column);
    const f = formOf(col);
    d.host.hidden = !f;
    if (!f || !col) return;
    const custom = !BUILT_IN.has(f.kind);
    d.host.dataset['column'] = col.id;
    d.host.dataset['kind'] = f.kind;
    const state = (custom ? (d.filter as { state?: Json } | null)?.state : d.filter) ?? null;
    d.m.set(d.host, f.part, {
      column: col,
      kind: f.kind,
      state: state as Json | null,
      where: 'client',
      apply: 'live',
      debounceMs: 0,
      dropped: 0,
      ops: (col.def.filter && col.def.filter.ops) || NONE,
      today: today(),
      // A draft that filters nothing yet (`cancel`) leaves the condition empty: left out at Apply.
      set: (next) => void (d.filter = next === null ? null : custom ? { type: 'custom', kind: f.kind, state: next } : (next as ColumnFilter)),
      close: () => apply(),
      values: (v) => k.values(col.id, v),
    } as Omit<C, keyof PartBase>);
  };

  const drop = (n: N): void => (n.g ? n.items.forEach(drop) : n.m.clear());
  /** Conditions numbered in reading order, groups named by their join. */
  const names = (): void => {
    let i = 0;
    const walk = (n: N): void => {
      if (n.g) {
        n.box.setAttribute('aria-label', msg(n.join === 'and' ? 'adv.groupAnd' : 'adv.groupOr'));
        n.items.forEach(walk);
      } else n.box.setAttribute('aria-label', msg('adv.condition', { n: ++i }));
    };
    if (root) walk(root);
  };

  const condition = (up: G, at: number, column = '', filter: ColumnFilter | null = null): D => {
    const li = mk('li', null, 'dzg-adv-item');
    const box = mk('div', li, 'dzg-adv-c');
    box.setAttribute('role', 'group');
    const lab = mk('label', box, 'dzg-adv-col');
    mk('span', lab, '', msg('adv.column'));
    const sel = mk('select', lab);
    mk('option', sel, '', msg('adv.pick')).value = '';
    for (const c of columns()) mk('option', sel, '', name(c)).value = c.id;
    const host = mk('div', box, 'dzg-fpop dzg-adv-form');
    const d: D = { column, filter, li, box, sel, host, m: mounted<C>(g), up };
    sel.value = column;
    // A column gone since: the condition starts empty.
    if (sel.value !== column) d.column = '';
    sel.addEventListener('change', () => {
      d.column = sel.value;
      d.filter = null;
      draw(d);
    });
    button(box, 'dzg-adv-rm', msg('adv.removeCondition'), () => remove(d));
    up.items.splice(at, 0, d);
    up.list.insertBefore(li, up.list.children[at] ?? null);
    draw(d);
    return d;
  };

  const group = (up: G | null, at: number, join: 'and' | 'or'): G => {
    const level = up ? up.level + 1 : 1;
    const li = mk(up ? 'li' : 'div', null, up ? 'dzg-adv-item' : 'dzg-adv-root');
    const box = mk('div', li, 'dzg-adv-g');
    box.setAttribute('role', 'group');
    box.dataset['level'] = String(level);
    const rg = mk('div', box, 'dzg-adv-join');
    rg.setAttribute('role', 'radiogroup');
    rg.setAttribute('aria-label', msg('adv.join'));
    const radio = `${id}r${++uid}`;
    const radios = (['and', 'or'] as const).map((j) => {
      const lab = mk('label', rg);
      const r = mk('input', lab);
      r.type = 'radio';
      r.name = radio;
      r.value = j;
      r.checked = j === join;
      mk('span', lab, '', msg(j === 'and' ? 'adv.and' : 'adv.or'));
      r.addEventListener('change', () => {
        n.join = j;
        names();
        g.live.announce(msg(j === 'and' ? 'adv.and' : 'adv.or'));
      });
      return r;
    });
    const list = mk('ul', box, 'dzg-adv-items');
    const acts = mk('div', box, 'dzg-adv-acts');
    const n: G = {
      g: true,
      join,
      items: [],
      li,
      box,
      list,
      radios,
      level,
      up,
      add: button(acts, 'dzg-adv-add', msg('adv.addCondition'), () => {
        const d = condition(n, n.items.length);
        names();
        d.sel.focus();
        g.live.announce(msg('adv.conditionAdded'));
      }),
    };
    if (level < DEEPEST) {
      button(acts, 'dzg-adv-addg', msg('adv.addGroup'), () => {
        const s = group(n, n.items.length, 'and');
        const d = condition(s, 0);
        names();
        d.sel.focus();
        g.live.announce(msg('adv.groupAdded'));
      });
    }
    if (up) {
      button(acts, 'dzg-adv-rmg', msg('adv.removeGroup'), () => remove(n));
      up.items.splice(at, 0, n);
      up.list.insertBefore(li, up.list.children[at] ?? null);
    }
    return n;
  };

  /** Its first control: a condition's column, a group's join. */
  const focusIn = (n: N | undefined): void => void (n ? (n.g ? n.radios.find((r) => r.checked)! : n.sel).focus() : root?.add.focus());
  const remove = (n: N): void => {
    const up = n.up!;
    const i = up.items.indexOf(n);
    up.items.splice(i, 1);
    drop(n);
    n.li.remove();
    names();
    // The item before, else the next one, else the group's « + Condition ».
    const near = up.items[i - 1] ?? up.items[i];
    near ? focusIn(near) : up.add.focus();
    g.live.announce(msg('adv.removed'));
  };

  /** The draft from an expression: a condition alone sits in an AND group; nothing: one empty condition. */
  const fill = (e: FilterExpression | null): void => {
    if (root) drop(root);
    tree.replaceChildren();
    const grp = (e: FilterExpression | null): e is Extract<FilterExpression, { items: unknown }> => !!e && 'items' in e && Array.isArray(e.items);
    root = group(null, 0, grp(e) && e.join === 'or' ? 'or' : 'and');
    tree.append(root.li);
    const put = (x: FilterExpression, into: G): void => {
      if (!x || typeof x !== 'object') return;
      if (grp(x)) {
        if (into.level >= DEEPEST) return;
        const s = group(into, into.items.length, x.join === 'or' ? 'or' : 'and');
        x.items.forEach((y) => put(y, s));
      } else if (typeof x.column === 'string') condition(into, into.items.length, x.column, x.filter ?? null);
    };
    if (grp(e)) e.items.forEach((x) => put(x, root!));
    else if (e) put(e, root);
    if (!root.items.length) condition(root, 0);
    names();
  };

  /** The draft as an expression: conditions without a column or a live form left out, empty groups too. */
  const read = (n: N): FilterExpression | null => {
    if (!n.g) return n.column && n.filter ? { column: n.column, filter: n.filter } : null;
    const items = n.items.map(read).filter((x): x is FilterExpression => !!x);
    return items.length ? { join: n.join, items } : null;
  };

  /** Apply: a value that does not read keeps the dialog, its field focused (the form marks it); else one `filter.set`. */
  const apply = (): void => {
    const bad = el.querySelector<HTMLElement>('[aria-invalid=true]');
    if (bad) return bad.focus();
    set(root && read(root), 'user');
    ref?.close();
  };

  const texts = (): void => {
    tx(title, msg('adv.title'));
    tx(clr, msg('adv.clear'));
    tx(cancel, msg('adv.cancel'));
    tx(ok, msg('adv.apply'));
  };

  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    // Alt+ArrowUp / Alt+ArrowDown on a column list: the previous / next condition's.
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || t.tagName !== 'SELECT') return;
    const all = [...el.querySelectorAll<HTMLSelectElement>('.dzg-adv-col select')];
    const to = all[all.indexOf(t as HTMLSelectElement) + (e.key === 'ArrowUp' ? -1 : 1)];
    e.preventDefault();
    e.stopPropagation();
    to?.focus();
  });

  const open = (anchor?: HTMLElement): boolean => {
    if (ref) return true;
    if (!fx()) return false;
    texts();
    fill(get());
    const at = anchor ?? bound ?? g.el.root;
    const opener = at === g.el.root ? null : at;
    opener?.setAttribute('aria-expanded', 'true');
    ref = popupsFor(g).open(at, el, {
      placement: 'block-end',
      modal: true,
      label: msg('adv.title'),
      ...(!opener && { from: g.el.header, back: () => g.restoreFocus() }),
      onClose: () => {
        ref = null;
        if (root) drop(root);
        opener?.setAttribute('aria-expanded', 'false');
      },
    });
    ref.el.setAttribute('aria-labelledby', title.id);
    ref.el.removeAttribute('aria-label');
    ref.el.classList.add('dzg-adv-pop');
    // The first column list, nested or not (advanced-filter.md 13).
    (el.querySelector<HTMLElement>('.dzg-adv-col select') ?? root!.add).focus();
    return true;
  };

  const api: AdvancedFilterApi = {
    open,
    close: () => ref?.close(),
    bind(b) {
      bound = b;
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-expanded', String(!!ref));
      const click = (): void => void (ref ? ref.close() : open(b));
      b.addEventListener('click', click);
      return () => {
        b.removeEventListener('click', click);
        if (bound === b) bound = null;
      };
    },
    get,
    set: (e) => set(e),
    get isOpen() {
      return !!ref;
    },
  };
  apis.set(k, api);
  return {
    destroy() {
      ref?.close();
      apis.delete(k);
    },
  };
}
