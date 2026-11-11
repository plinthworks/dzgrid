import { intentFor, type GridKernel } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { GroupMessageKey } from '../part-texts.js';
import { slotAt, travel } from '../dir.js';
import { menuList } from '@dzgrid/dom/internal';

/** The texts `groupZone()` needs, from `@dzgrid/dom/locales/<lang>-group`. */
export const ZONE_KEYS = ['zone.label', 'zone.empty', 'zone.remove', 'zone.grouped', 'zone.removed', 'zone.placed'] as const satisfies readonly GroupMessageKey[];

type Grid = { readonly kernel: GridKernel<any, any> };
/** What the zone drives of `grouping()` (its `api(grid)`): typed here, so the zone ships none of it. */
export interface GroupingApiLike {
  by(): readonly string[];
  setBy(by: readonly string[], o?: { readonly user?: boolean }): void;
  /** Whether the « + » may offer a column (absent: any groupable one; group-drop-zone.md 18). */
  accepts?(id: string): boolean;
}
export interface GroupZoneOptions {
  readonly use: {
    /** The grouping the chips show and change. */
    readonly grouping: { api(grid: Grid): GroupingApiLike | null };
    /** Moving columns (`columns()`): a header dragged onto the band groups by it. Absent: no drop (the menu and the keys still work). */
    readonly columns?: { api(grid: Grid): { readonly dropTargets: { add(el: Element, t: { accept(column: string): boolean; drop(column: string): void; readonly label?: string }): () => void } } | null };
  };
  /** Another band's texts: `'pivot'` reads `pivot.label`, `pivot.empty`… instead of `zone.*` (the « Colonnes » band, pivot.md 19). */
  readonly texts?: 'pivot';
}

/**
 * The band's layout, injected by the feature (no colour: `@dzgrid/theme/grouping.css`; logical sides only; zero
 * specificity): a wrapping row of chips above the grid's rows, each chip its name and its ×, 24 px targets (WCAG 2.5.8).
 */
export const ZONE_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-gzone){display:flex;flex-wrap:wrap;align-items:center;gap:.25rem;min-block-size:calc(var(--dzg-target-min,24px) + .5rem);padding:.25rem .5rem;box-sizing:border-box}' +
  ':where(.dzg-gchip){display:inline-flex;align-items:center;position:relative;user-select:none}' +
  ':where(.dzg-chip,.dzg-chip-x){min-block-size:var(--dzg-target-min,24px);font:inherit;color:inherit;cursor:pointer}' +
  ':where(.dzg-chip-x){inline-size:var(--dzg-target-min,24px);padding:0}' +
  ':where(.dzg-gchip[data-dzg-gap])::before{content:"";position:absolute;inset-block:0;inline-size:2px;background:currentColor}' +
  ':where(.dzg-gchip[data-dzg-gap=before])::before{inset-inline-start:-.2rem}:where(.dzg-gchip[data-dzg-gap=after])::before{inset-inline-end:-.2rem}' +
  '}';

/**
 * `groupZone(options)`: the « Regrouper par » band (docs/behaviors/group-drop-zone.md part 2; owner Q-Z1 B, Q-Z2 A): a
 * `toolbar` above the rows with a chip « Nom × » per grouping column, in order. A header dragged onto it (with
 * `columns()`) groups by its column; × or Delete removes one; Ctrl+Shift+arrows or a mouse drag moves one; each change
 * said. One tab stop, the arrows between its items (mirrored right to left).
 *
 * ```ts
 * const g = grouping({ by: ['ward'] });
 * const moves = columns();
 * createGrid(host, { …, features: [moves, g, groupZone({ use: { grouping: g, columns: moves } })] });
 * ```
 */
export function groupZone(o: GroupZoneOptions): GridFeature {
  return { id: 'group-zone', setup: (g) => setup(g, o) };
}

function setup(g: GridContext<unknown>, o: GroupZoneOptions): FeatureHandle {
  /** A text's key in this band's bundle. */
  const K = (k: string): GroupMessageKey => (o.texts ? k.replace('zone', o.texts) : k) as GroupMessageKey;
  const missing = ZONE_KEYS.map(K).filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`groupZone: missing ${missing.join(', ')}`);
  const { el, doc, columns: m, scope } = g;
  const root = el.root.getRootNode() as Document | ShadowRoot;
  if (!root.querySelector('style[data-dzgrid-zone]') && g.settings.injectStyles !== false) {
    const st = doc.createElement('style');
    st.setAttribute('data-dzgrid-zone', '');
    if (g.settings.nonce) st.setAttribute('nonce', g.settings.nonce);
    st.textContent = ZONE_CSS;
    ('head' in root ? root.head : root).append(st);
  }
  const zone = doc.createElement('div');
  zone.className = 'dzg-gzone';
  zone.setAttribute('role', 'toolbar');
  zone.tabIndex = -1;
  // Just above the rows: under a band set up before it (group-drop-zone.md 19).
  el.root.insertBefore(zone, el.viewport);

  const api = (): GroupingApiLike | null => o.use.grouping.api(g);
  const name = (id: string): string => m.get(id)?.def.header ?? id;
  const say = (k: GroupMessageKey, column: string, p?: Record<string, number>): void => g.live.announce(g.msg(K(k), { column: name(column), ...p }));
  /** The columns shown as chips: known, groupable, once each, in grouping order (sheet 17). */
  const shown = (): string[] => [...new Set(api()?.by() ?? [])].filter((id) => m.get(id) && m.get(id)!.def.groupable !== false);
  const set = (by: readonly string[]): void => api()?.setBy(by, { user: true });

  /** Moves a column to place `to` (0 = first); said. */
  const place = (id: string, to: number): void => {
    const by = shown();
    const from = by.indexOf(id);
    to = Math.max(0, Math.min(by.length - 1, to));
    if (from < 0 || to === from) return;
    by.splice(from, 1);
    by.splice(to, 0, id);
    set(by);
    if (shown().indexOf(id) === to) say('zone.placed', id, { n: to + 1, total: by.length });
  };
  const remove = (id: string): void => {
    const by = shown();
    if (!by.includes(id)) return;
    set(by.filter((c) => c !== id));
    if (!shown().includes(id)) say('zone.removed', id);
  };

  // ---- drawing: again only when what it shows changed ----
  let sig = '';
  let at = 0;
  const items = (): HTMLElement[] => [...zone.querySelectorAll<HTMLElement>('.dzg-chip, .dzg-chip-x')];

  // ---- « + » (group-drop-zone.md 18): the columns the band accepts, in the grid's menu; the way without dragging ----
  const L = menuList(g);
  const plus = g.settings.messages.text[K('zone.add')] === undefined ? null : doc.createElement('button');
  /** Known, groupable, in neither band, in the grid's order. */
  const offer = (): string[] => m.state().map((x) => x.id).filter((id) => !shown().includes(id) && m.get(id)!.def.groupable !== false && api()?.accepts?.(id) !== false);
  let back = false;
  if (plus) {
    plus.type = 'button';
    // Drawn and sized as a chip's ×.
    plus.className = 'dzg-chip-x dzg-zadd';
    plus.textContent = '+';
    plus.setAttribute('aria-haspopup', 'menu');
    scope.on(plus, 'click', () => L.open({
      owner: zone, id: '+', anchor: plus, label: g.msg(K('zone.add')), ctx: () => ({}), part: () => ({}),
      entries: () => offer().map((id) => ({ id, label: name(id), action: () => (L.hand(), set([...shown(), id]), say('zone.grouped', id), plus.focus()) })),
      // Escape: the focus back on « + », not on the grid (the popup's own way, then this).
      back: () => void (back = true), onClose: () => back && ((back = false), plus.focus()),
    }));
  }
  const rove = (i: number, focus?: boolean): void => {
    const all = items();
    at = Math.max(0, Math.min(all.length - 1, i));
    all.forEach((b, j) => (b.tabIndex = j === at ? 0 : -1));
    if (focus) all[at]?.focus();
  };
  const draw = (): void => {
    const by = shown();
    const next = [g.settings.messages.locale, g.msg(K('zone.label')), offer().length, ...by.map((id) => `${id}\u0000${name(id)}`)].join('\u0001');
    if (next === sig) return;
    sig = next;
    const had = zone.contains(root.activeElement ?? null);
    const was = had ? (root.activeElement as HTMLElement) : null;
    const wasCol = was?.closest<HTMLElement>('.dzg-gchip')?.dataset['col'];
    const wasX = was?.classList.contains('dzg-chip-x');
    zone.setAttribute('aria-label', g.msg(K('zone.label')));
    zone.replaceChildren();
    if (!by.length) {
      const e = doc.createElement('span');
      e.className = 'dzg-gzone-empty';
      e.textContent = g.msg(K('zone.empty'));
      zone.append(e);
    }
    for (const id of by) {
      const c = doc.createElement('span');
      c.className = 'dzg-gchip';
      c.dataset['col'] = id;
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'dzg-chip';
      b.textContent = name(id);
      b.setAttribute('aria-keyshortcuts', 'Delete Control+Shift+ArrowLeft Control+Shift+ArrowRight');
      const x = doc.createElement('button');
      x.type = 'button';
      x.className = 'dzg-chip-x';
      x.textContent = '×';
      x.setAttribute('aria-label', g.msg(K('zone.remove'), { column: name(id) }));
      c.append(b, x);
      zone.append(c);
    }
    // Nothing to offer: no « + ».
    if (plus && offer().length) plus.setAttribute('aria-label', g.msg(K('zone.add'))), zone.append(plus);
    // The focus kept on its column's item; its column gone, the item at the same place; nothing left, the grid.
    const all = items();
    const same = wasCol ? all.findIndex((b) => b.closest<HTMLElement>('.dzg-gchip')?.dataset['col'] === wasCol && b.classList.contains('dzg-chip-x') === wasX) : -1;
    rove(same >= 0 ? same : at, had);
    if (had && !all.length) g.restoreFocus();
  };

  // ---- keys (APG toolbar; group-drop-zone.md 9, 14) ----
  scope.on(zone, 'keydown', (e: KeyboardEvent) => {
    const t = (e.target as Element).closest<HTMLElement>('.dzg-chip, .dzg-chip-x');
    const id = t?.closest<HTMLElement>('.dzg-gchip')?.dataset['col'] ?? '';
    if (!t) return;
    const all = items();
    const i = all.indexOf(t);
    const k = e.key;
    // The grid's own reading of an arrow, mirrored right to left (forward: +1).
    const step = intentFor({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, { dir: g.dir, owner: 'cell', mac: g.mac });
    const by = step?.kind === 'move' && step.axis === 'col' ? step.delta : 0;
    const am = e.altKey || e.metaKey;
    const mods = e.ctrlKey || e.shiftKey || am;
    let done = true;
    if (by && e.ctrlKey && e.shiftKey && !am) place(id, shown().indexOf(id) + by);
    else if (by && !mods) rove(i + by, true);
    else if (mods) done = false;
    else if (k === 'Home' || k === 'End') rove(k === 'Home' ? 0 : all.length - 1, true);
    else if (k === 'Delete' || k === 'Backspace') remove(id);
    else done = false;
    if (done) e.preventDefault(), e.stopPropagation();
  });
  scope.on(zone, 'click', (e: MouseEvent) => {
    const x = (e.target as Element).closest<HTMLElement>('.dzg-chip-x');
    const id = x?.closest<HTMLElement>('.dzg-gchip')?.dataset['col'];
    if (id) rove(items().indexOf(x!)), remove(id);
  });
  scope.on(zone, 'focusin', (e: FocusEvent) => {
    const i = items().indexOf(e.target as HTMLElement);
    if (i >= 0) rove(i);
  });

  // ---- a chip dragged by the mouse or a pen (sheet 16): a gap marked, one move on release inside the band ----
  type Drag = { id: string; p0: PointerEvent; pid: number; on?: boolean; to?: number | undefined };
  let d: Drag | null = null;
  const chips = (): HTMLElement[] => [...zone.querySelectorAll<HTMLElement>('.dzg-gchip')];
  const unmark = (): void => chips().forEach((c) => c.removeAttribute('data-dzg-gap'));
  const end = (): void => {
    if (d?.on && zone.hasPointerCapture?.(d.pid)) zone.releasePointerCapture(d.pid);
    d = null;
    unmark();
  };
  scope.on(zone, 'pointerdown', (e: PointerEvent) => {
    const c = (e.target as Element).closest<HTMLElement>('.dzg-gchip');
    if (!c || e.button !== 0 || e.pointerType === 'touch' || (e.target as Element).closest('.dzg-chip-x')) return;
    d = { id: c.dataset['col']!, p0: e, pid: e.pointerId };
  });
  scope.on(zone, 'pointermove', (e: PointerEvent) => {
    if (!d || e.pointerId !== d.pid) return;
    if (!d.on && travel(e, d.p0) < 4) return;
    if (!d.on) zone.setPointerCapture?.(d.pid);
    d.on = true;
    const all = chips();
    unmark();
    const to = slotAt(e, all.map((c) => c.getBoundingClientRect()), zone.getBoundingClientRect(), g.dir);
    d.to = to ?? undefined;
    // The gap: before the chip it lands on, or after the last.
    if (to !== null) (to < all.length ? all[to] : all[all.length - 1])?.setAttribute('data-dzg-gap', to < all.length ? 'before' : 'after');
  });
  scope.on(zone, 'pointerup', (e: PointerEvent) => {
    if (!d || e.pointerId !== d.pid) return;
    const { id, on, to } = d;
    end();
    if (!on || to === undefined) return;
    const from = shown().indexOf(id);
    // A gap after itself is its own place.
    place(id, to > from ? to - 1 : to);
  });
  scope.on(zone, 'pointercancel', end);
  scope.on(doc, 'keydown', (e: Event) => void (d?.on && (e as KeyboardEvent).key === 'Escape' && (e.preventDefault(), end())), { capture: true });

  // ---- a header dropped onto the band (group-drop-zone.md 15, through `columns()`); registered once both are there ----
  let unregister: (() => void) | null = null;
  const register = (): void => {
    const cols = unregister ? null : o.use.columns?.api(g);
    if (!cols) return;
    unregister = cols.dropTargets.add(zone, {
      accept: (id) => !!api() && !!m.get(id) && m.get(id)!.def.groupable !== false && !shown().includes(id),
      drop: (id) => (set([...shown(), id]), shown().includes(id) && say('zone.grouped', id)),
      label: g.msg(K('zone.label')),
    });
  };

  return {
    afterRows() {
      register();
      draw();
    },
    destroy() {
      end();
      unregister?.();
      zone.remove();
    },
  };
}
