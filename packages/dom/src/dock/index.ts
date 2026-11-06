import { intentFor, problem, type ChangeSource, type GridKernel, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { checkDock, type DockArea, type DockAreaState, type DockPanelState, type DockState } from '@dzgrid/core/dock';
import { menuList, needTexts } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { DockMessageKey } from '../part-texts.js';
import { logicalX } from '../dir.js';
import { setAttr } from '../render/write.js';
import type { DockHost, DockPanelSpec } from './types.js';
import { injectDockStyles } from './styles.js';

/** The texts `dock()` needs, from `@dzgrid/dom/locales/<lang>-dock`. */
export const DOCK_KEYS = 'region tabs collapse expand close place start end bottom width height'.split(' ').map((k) => `dock.${k}`) as readonly DockMessageKey[];

/** An application's own panel (dock.md 1, 3). */
export interface DockPanel {
  readonly id: string;
  /** Its title in the page's language; a function is asked again at each paint (another language). */
  readonly title: string | (() => string);
  /** Where it goes first (`end` by default): hidden there until shown, unless `dock({ open })` names it. */
  readonly area?: DockArea;
  /** Draws its content into `host`, once; what it returns runs when the grid goes. */
  mount(host: HTMLElement): void | (() => void);
}
export interface DockOptions {
  /** The panels shown at the start, and where (dock.md 3): over each panel's own default. `float` is refused for now. */
  readonly open?: Readonly<Record<string, DockArea>>;
  readonly panels?: readonly DockPanel[];
  /** An area's size in CSS px, between `min` (160) and `max` (800), and what leaves the rows 160 px (dock.md 9). */
  readonly sizes?: { readonly min?: number; readonly max?: number };
  /** After each change made by the user or the API (never a restore): the layout as a state keeps it. */
  readonly onChange?: (layout: DockState) => void;
}
/** A grid's dock, for the application. Each method returns false when it did nothing. */
export interface DockApi {
  /** Shows a panel in `area` (else where it stands), its tab selected, its area restored. */
  show(id: string, area?: DockArea): boolean;
  hide(id: string): boolean;
  /** As `show`, the focus on the panel's tab or « Place » button in its new place (dock.md 10). */
  move(id: string, area: DockArea): boolean;
  /** Collapses (`true`) or restores (`false`) an area, or flips it. */
  collapse(area: DockArea, on?: boolean): boolean;
  /** An area's size in CSS px, kept between the limits. */
  resize(area: DockArea, px: number): boolean;
  /** The layout now, as the grid's state keeps it (`GridState.dock`). */
  layout(): DockState;
  /** Applies a layout (checked; as a restore: no `onChange`); returns what was skipped. */
  setLayout(layout: unknown): Problem[];
}
export interface DockFeature extends GridFeature {
  /** The dock of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): DockApi | null;
}

type Side = 'start' | 'end' | 'bottom';
const SIDES: readonly Side[] = ['start', 'end', 'bottom'];
type Reg = { readonly s: DockPanelSpec; readonly tab: HTMLButtonElement; readonly box: HTMLElement; seen: boolean };
type Area = { readonly el: HTMLElement; readonly title: HTMLElement; readonly tabs: HTMLElement; readonly tog: HTMLButtonElement; readonly place: HTMLButtonElement; readonly shut: HTMLButtonElement; readonly sep: HTMLElement; readonly body: HTMLElement };
const tx = (el: Element, s: string): void => void (el.textContent !== s && (el.textContent = s));
let uid = 0;

/**
 * `dock(options)`: the panels beside and under the grid (docs/behaviors/dock.md; owner Q-SB5, « Dock — owner B »
 * 2026-11-06): areas `start`, `end` and `bottom` inside the grid's box, tabs when an area holds several panels, the edge
 * resized by the pointer and the keys (APG window splitter), collapse to a strip, « Place » to move a panel, the layout
 * in the grid's state. The columns panel and the filters panel stand in it when both are used; an application adds its
 * own. One feature object may serve several grids.
 *
 * ```ts
 * import { dock } from '@dzgrid/dom/dock';
 * import { FR_DOCK } from '@dzgrid/dom/locales/fr-dock';
 * import '@dzgrid/theme/dock.css';
 * createGrid(host, { …, features: [columnsChooser(), filtersPanel(), dock({ open: { columns: 'end' } })] });
 * ```
 */
export function dock(o: DockOptions = {}): DockFeature {
  const apis = new WeakMap<object, DockApi>();
  return { id: 'dock', api: (grid) => apis.get(grid.kernel) ?? null, setup: (g) => setup(g, o, apis) };
}

function setup(g: GridContext<unknown>, o: DockOptions, apis: WeakMap<object, DockApi>): FeatureHandle {
  needTexts(g, DOCK_KEYS, 'dock');
  const { kernel: k, doc, el: { root }, scope } = g;
  const target = root.getRootNode();
  if (g.settings.injectStyles !== false) injectDockStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);
  const min = o.sizes?.min ?? 160;
  const max = o.sizes?.max ?? 800;
  const base = `dzg-dk${++uid}`;
  const tell = (p: readonly Problem[]): unknown => p.length && emit(k, { type: 'problems', source: 'host', problems: [...p] });
  const side = (a: unknown): a is Side => SIDES.includes(a as Side);
  /** `float` and anything else: refused, told once (dock.md 12). */
  const refuse = (path: string, a: unknown): false => (tell([problem('invalid-setting', 'warning', path, String(a))]), false);
  for (const [id, a] of Object.entries(o.open ?? {})) if (!side(a)) refuse(`dock.open.${id}`, a);

  let pl: Record<string, DockPanelState> = {};
  let ar: Partial<Record<Side, { -readonly [K in keyof DockAreaState]?: DockAreaState[K] }>> = {};
  const reg = new Map<string, Reg>();
  /** Where the focus was when a panel was shown from outside the dock (dock.md 6). */
  const backs = new Map<string, HTMLElement>();
  const rooms: Record<Side, number> = { start: max, end: max, bottom: max };
  const cleanups: (() => void)[] = [];

  const ids = (s: Side): string[] => [...reg.keys()].filter((id) => pl[id]!.open && pl[id]!.area === s);
  const active = (s: Side): string | undefined => {
    const all = ids(s);
    return all.includes(ar[s]?.active!) ? ar[s]!.active : all[0];
  };
  const size = (s: Side): number => Math.min(ar[s]?.size ?? (s === 'bottom' ? 240 : 288), rooms[s]);
  const clamp = (s: Side, px: number): number => Math.round(Math.max(min, Math.min(rooms[s], px)));
  const title = (id: string | undefined): string => (id === undefined ? '' : reg.get(id)!.s.title());
  const T = (key: DockMessageKey, id?: string): string => g.msg(key, { panel: title(id), grid: g.settings.label ?? g.msg('grid.label') });

  /** A panel's first place (dock.md 3): `dock({ open })`, else its own default; a collapsed one alone in its area collapses it. */
  const place = (into: typeof pl, areas: typeof ar, s: DockPanelSpec): void => {
    if (into[s.id]) return;
    const want = o.open?.[s.id];
    const a: Side = side(want) ? want : side(s.area) ? s.area : 'end';
    const open = side(want) || !!s.open;
    const alone = !Object.entries(into).some(([id, p]) => p.open && p.area === a && reg.has(id));
    into[s.id] = { area: a, open };
    if (side(want)) (areas[a] ??= {}).active ??= s.id;
    else if (open && s.collapsed && alone) (areas[a] ??= {}).collapsed = true;
  };
  /** The layout as a state keeps it: areas left empty dropped, plain JSON. */
  const layout = (): DockState =>
    JSON.parse(JSON.stringify({ panels: pl, areas: Object.fromEntries(Object.entries(ar).filter(([, v]) => Object.keys(JSON.parse(JSON.stringify(v))).length)) }));

  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Element | null, cls: string): HTMLElementTagNameMap[K] => {
    const x = doc.createElement(tag);
    x.className = cls;
    parent?.append(x);
    return x;
  };
  const btn = (parent: Element, cls: string, glyph: string): HTMLButtonElement => {
    const b = mk('button', parent, cls);
    b.type = 'button';
    b.textContent = glyph;
    return b;
  };

  // ---- the areas (dock.md 2, 4): the start one before the grid in the page's order, the others after it.
  const A = {} as Record<Side, Area>;
  for (const s of SIDES) {
    const el = mk('div', null, 'dzg-dock');
    el.dataset['area'] = s;
    el.hidden = true;
    el.setAttribute('role', 'region');
    const sep = mk('div', el, 'dzg-dock-sep');
    sep.tabIndex = 0;
    sep.setAttribute('role', 'separator');
    sep.setAttribute('aria-orientation', s === 'bottom' ? 'horizontal' : 'vertical');
    const main = mk('div', el, 'dzg-dock-main');
    const head = mk('div', main, 'dzg-dock-head');
    const body = mk('div', null, 'dzg-dock-body');
    const a: Area = { el, sep, body, title: mk('span', head, 'dzg-dock-title'), tabs: mk('div', head, 'dzg-dock-tabs'), tog: btn(head, 'dzg-dock-tog', ''), place: btn(head, 'dzg-dock-place', '⋯'), shut: btn(head, 'dzg-dock-x', '×') };
    main.append(body);
    body.id = `${base}${s}`;
    sep.setAttribute('aria-controls', body.id);
    a.place.setAttribute('aria-haspopup', 'menu');
    A[s] = a;
    if (s === 'start') root.prepend(el);
    else root.append(el);
  }
  root.toggleAttribute('data-dzg-dock', true);

  /** Draws every area from the layout: which panels, the tabs, the sizes, the names; guarded writes, no layout read. */
  const lay = (): void => {
    for (const s of SIDES) {
      const a = A[s];
      const all = ids(s);
      const id = active(s);
      const col = !!ar[s]?.collapsed && !!id;
      const many = all.length > 1;
      a.el.hidden = !id;
      const room = !id ? '0px' : col ? 'var(--dzg-dock-strip,2rem)' : `${size(s)}px`;
      if (root.style.getPropertyValue(`--dzg-dock-${s}`) !== room) root.style.setProperty(`--dzg-dock-${s}`, room);
      if (!id) continue;
      a.el.toggleAttribute('data-collapsed', col);
      setAttr(a.el, 'aria-label', T('dock.region', id));
      tx(a.title, title(id));
      a.title.hidden = many;
      a.tabs.hidden = !many;
      setAttr(a.tabs, 'role', many ? 'tablist' : null);
      setAttr(a.tabs, 'aria-label', many ? g.msg('dock.tabs') : null);
      setAttr(a.tabs, 'aria-orientation', many ? (col && s !== 'bottom' ? 'vertical' : 'horizontal') : null);
      tx(a.tog, col ? '+' : '−');
      setAttr(a.tog, 'aria-label', T(col ? 'dock.expand' : 'dock.collapse', id));
      setAttr(a.tog, 'aria-expanded', String(!col));
      setAttr(a.place, 'aria-label', T('dock.place', id));
      setAttr(a.shut, 'aria-label', T('dock.close', id));
      a.sep.hidden = col;
      setAttr(a.sep, 'aria-label', T(s === 'bottom' ? 'dock.height' : 'dock.width', id));
      setAttr(a.sep, 'aria-valuemin', String(min));
      setAttr(a.sep, 'aria-valuemax', String(Math.max(min, rooms[s])));
      setAttr(a.sep, 'aria-valuenow', String(size(s)));
    }
    for (const [id, r] of reg) {
      const p = pl[id]!;
      const a = A[p.area as Side];
      const s = p.area as Side;
      const many = ids(s).length > 1;
      if (r.box.parentElement !== a.body) a.body.append(r.box);
      if (r.tab.parentElement !== a.tabs) a.tabs.append(r.tab);
      const sel = active(s) === id;
      const on = p.open && sel && !ar[s]?.collapsed;
      r.tab.hidden = !p.open;
      r.box.hidden = !on;
      tx(r.tab, title(id));
      setAttr(r.tab, 'role', many ? 'tab' : null);
      setAttr(r.tab, 'aria-selected', many ? String(sel) : null);
      setAttr(r.tab, 'aria-controls', many ? r.box.id : null);
      r.tab.tabIndex = sel ? 0 : -1;
      setAttr(r.box, 'role', many ? 'tabpanel' : null);
      setAttr(r.box, 'aria-labelledby', many ? r.tab.id : null);
      if (on !== r.seen) (r.seen = on), r.s.shown?.(on);
    }
  };
  /** The room each area may take now (dock.md 9): one read of the root's box; none (jsdom, hidden): `max`. */
  const measure = (): void => {
    const r = root.getBoundingClientRect();
    for (const s of SIDES) {
      const o2: Side = s === 'start' ? 'end' : 'start';
      const other = s === 'bottom' || !active(o2) || ar[o2]?.collapsed ? 0 : size(o2);
      rooms[s] = r.width ? Math.max(min, Math.min(max, (s === 'bottom' ? r.height : r.width) - other - 160)) : max;
    }
    lay();
  };
  /** One change: drawn; told (`onChange`, the state's pause) when the layout moved. */
  const act = (src: ChangeSource, fn: () => void): true => {
    const was = JSON.stringify(layout());
    fn();
    lay();
    const now = JSON.stringify(layout());
    if (now !== was) o.onChange?.(JSON.parse(now)), g.saved?.(src);
    return true;
  };
  const inside = (s: Side): boolean => A[s].el.contains(doc.activeElement);

  const add = (s: DockPanelSpec): void => {
    // Same rule as the saved layout: an id every object already has is refused, never a key.
    if (s.id in {}) return void refuse('dock.panels', s.id);
    const tab = btn(A.end.tabs, 'dzg-dock-tab', '');
    tab.id = `${base}t${reg.size}`;
    const box = mk('div', null, 'dzg-dock-box');
    box.id = `${tab.id}p`;
    box.append(s.el);
    tab.addEventListener('click', () => void show(s.id, undefined, 'user'));
    reg.set(s.id, { s, tab, box, seen: false });
    place(pl, ar, s);
  };
  for (const p of o.panels ?? []) {
    const el = doc.createElement('div');
    const t = p.title;
    add({ id: p.id, title: typeof t == 'function' ? t : () => t, el, ...(p.area && { area: p.area }) });
    try {
      const c = p.mount(el);
      if (c) cleanups.push(c);
    } catch (err) {
      g.report(err);
    }
  }
  /** The features' panels, handed on their handles (by shape), once the grid's features are set up. */
  const collect = (): void => {
    const n = reg.size;
    for (const h of g.features) {
      const s = (h as { dock?: DockPanelSpec }).dock;
      if (s && !reg.has(s.id)) add(s);
    }
    if (reg.size !== n) lay();
  };

  const show = (id: string, area?: DockArea, src: ChangeSource = 'api'): boolean => {
    collect();
    if (area !== undefined && !side(area)) return refuse('dock.area', area);
    if (!reg.has(id)) return false;
    const s = area ?? (pl[id]!.area as Side);
    const f = doc.activeElement as HTMLElement | null;
    if (f && !SIDES.some((x) => A[x].el.contains(f))) backs.set(id, f);
    return act(src, () => {
      pl[id] = { area: s, open: true };
      const a = (ar[s] ??= {});
      a.active = id;
      delete a.collapsed;
    });
  };
  const hide = (id: string, src: ChangeSource = 'api'): boolean => {
    collect();
    const p = pl[id];
    if (!p?.open || !reg.has(id)) return false;
    const was = inside(p.area as Side);
    act(src, () => void (pl[id] = { area: p.area, open: false }));
    const b = backs.get(id);
    if (was) b?.isConnected && !b.closest('.dzg-dock') ? b.focus({ preventScroll: true }) : g.restoreFocus();
    return true;
  };
  const collapse = (s: DockArea, on?: boolean, src: ChangeSource = 'api'): boolean => {
    if (!side(s) || !active(s)) return false;
    const col = on ?? !ar[s]?.collapsed;
    const focus = col && A[s].body.contains(doc.activeElement);
    act(src, () => {
      const a = (ar[s] ??= {});
      if (col) a.collapsed = true;
      else delete a.collapsed;
    });
    if (focus) A[s].tog.focus();
    return true;
  };
  const resize = (s: DockArea, px: number, src: ChangeSource = 'api'): boolean =>
    side(s) && !!active(s) && Number.isFinite(px) && act(src, () => void ((ar[s] ??= {}).size = clamp(s, px)));
  const move = (id: string, area: DockArea, src: ChangeSource = 'api'): boolean => {
    if (!side(area)) return refuse('dock.move', area);
    if (!show(id, area, src)) return false;
    (ids(area).length > 1 ? reg.get(id)!.tab : A[area].place).focus();
    return true;
  };
  const close = (id: string, src: ChangeSource = 'api'): boolean => {
    const p = pl[id];
    return !!p && (reg.get(id)?.s.keep ? collapse(p.area, true, src) : hide(id, src));
  };
  /** A restore (dock.md 11): replaces the layout; `float` refused; the grid's panels it does not name back at their first place. */
  const set = (raw: unknown): Problem[] => {
    const { dock: d, problems } = checkDock(raw, { min, max });
    if (d) {
      pl = {};
      ar = JSON.parse(JSON.stringify(d.areas));
      for (const [id, p] of Object.entries(d.panels)) {
        if (p.area === 'float') problems.push(problem('state-field', 'warning', `dock.panels.${id}.area`, 'float'));
        else pl[id] = { area: p.area, open: p.open };
      }
      for (const r of reg.values()) place(pl, ar, r.s);
      lay();
    }
    return problems;
  };

  // ---- the controls (dock.md 4–8, 10)
  const mine = {};
  for (const s of SIDES) {
    const a = A[s];
    a.tog.addEventListener('click', () => void collapse(s, undefined, 'user'));
    a.shut.addEventListener('click', () => void (active(s) !== undefined && close(active(s)!, 'user')));
    a.place.addEventListener('click', () => {
      const id = active(s);
      const L = menuList(g);
      const cur = L.current();
      if (id === undefined) return;
      if (cur?.owner === mine && cur.id === s) return L.close();
      L.open({
        owner: mine, id: s, anchor: a.place, from: a.place, align: 'end', label: T('dock.place', id),
        entries: () => SIDES.map((x) => ({ id: `dock.${x}`, label: g.msg(`dock.${x}`), kind: 'radio' as const, group: T('dock.place', id), checked: x === s, action: () => (L.hand(), void move(id, x, 'user')) })),
        ctx: () => ({}), part: () => ({}),
      });
    });
    // Tabs (APG, manual activation): the arrows the reading way move the focus, wrapping; Enter / Space / a click show.
    a.tabs.addEventListener('keydown', (e) => {
      const ts = [...a.tabs.children].filter((t) => !(t as HTMLElement).hidden) as HTMLElement[];
      const i = ts.indexOf(e.target as HTMLElement);
      if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      const it = intentFor({ key: e.key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: g.dir, owner: 'cell', mac: false });
      const across = a.tabs.getAttribute('aria-orientation') !== 'vertical';
      const by = e.key === 'Home' ? -i : e.key === 'End' ? ts.length - 1 - i : it?.kind === 'move' && (it.axis === 'col') === across ? it.delta : 0;
      if (!by) return;
      e.preventDefault();
      ts[(i + by + ts.length) % ts.length]!.focus();
    });
    // The edge (APG window splitter): the arrows move it the way they point, Shift further; Home / End; Enter collapses.
    a.sep.addEventListener('keydown', (e) => {
      const key = e.key;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (key === 'Enter') return e.preventDefault(), void collapse(s, true, 'user'), a.tog.focus();
      if (key === 'Home' || key === 'End') return e.preventDefault(), void resize(s, key === 'Home' ? min : rooms[s], 'user');
      const it = intentFor({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { dir: g.dir, owner: 'cell', mac: false });
      if (it?.kind !== 'move' || (it.axis === 'row') !== (s === 'bottom')) return;
      e.preventDefault();
      const step = (e.shiftKey ? 64 : 16) * it.delta;
      resize(s, size(s) + (s === 'start' ? step : -step), 'user');
    });
    // Dragged by the mouse, a pen or a finger: the size is the pointer's distance from the area's far edge, kept as grabbed.
    let drag: { readonly id: number; readonly d: number; readonly was: string } | null = null;
    const at = (e: PointerEvent): number => {
      const r = a.el.getBoundingClientRect();
      return s === 'bottom' ? r.bottom - e.clientY : s === 'start' ? logicalX(e, r, g.dir) : r.width - logicalX(e, r, g.dir);
    };
    a.sep.addEventListener('pointerdown', (e) => {
      if (e.button || drag) return;
      e.preventDefault();
      measure();
      drag = { id: e.pointerId, d: size(s) - at(e), was: JSON.stringify(layout()) };
      a.sep.setPointerCapture?.(e.pointerId);
      a.sep.focus({ preventScroll: true });
    });
    a.sep.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      (ar[s] ??= {}).size = clamp(s, at(e) + drag.d);
      lay();
    });
    const end = (e: Event): void => {
      if (drag?.id !== (e as PointerEvent).pointerId) return;
      const was = drag.was;
      drag = null;
      const now = JSON.stringify(layout());
      if (now !== was) o.onChange?.(JSON.parse(now)), g.saved?.('user');
    };
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) a.sep.addEventListener(t, end);
  }

  const RO = (g.win as (Window & typeof globalThis) | null)?.ResizeObserver;
  const ro = RO && new RO(() => measure());
  ro?.observe(root, { box: 'border-box' });
  ro && scope.observe(ro);

  const host: DockHost = {
    show, hide, close,
    seen: (id) => !!reg.get(id)?.seen,
    get: layout,
    set,
    get initial() {
      collect();
      const p = {};
      const a = {};
      for (const r of reg.values()) place(p, a, r.s);
      return JSON.parse(JSON.stringify({ panels: p, areas: a }));
    },
  };
  g.dock = host;
  if (g.dockLater !== undefined) tell(set(g.dockLater)), delete g.dockLater;
  apis.set(k, {
    show: (id, a) => show(id, a),
    hide: (id) => hide(id),
    move: (id, a) => move(id, a),
    collapse: (a, on) => collapse(a, on),
    resize: (a, px) => resize(a, px),
    layout,
    setLayout: (raw) => set(raw),
  });
  lay();
  return {
    afterRows() {
      collect();
      lay();
    },
    destroy() {
      for (const s of SIDES) A[s].el.remove(), root.style.removeProperty(`--dzg-dock-${s}`);
      root.removeAttribute('data-dzg-dock');
      for (const c of cleanups) c();
      if (g.dock === host) delete g.dock;
      apis.delete(k);
    },
  };
}
