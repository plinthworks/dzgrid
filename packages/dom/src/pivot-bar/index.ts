import { intentFor, type GridKernel } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { GroupMessageKey, PivotBarMessageKey, PivotMessageKey } from '../part-texts.js';
import type { PivotApi } from '../pivot/index.js';
import { ZONE_CSS } from '../group-zone/index.js';
import { atPoint, slotAt, travel } from '../dir.js';
import { menuList, needTexts } from '@dzgrid/dom/internal';

type Grid = { readonly kernel: GridKernel<any, any> };
type Key = GroupMessageKey | PivotMessageKey | PivotBarMessageKey;

/** The texts `pivotBar()` needs of its own, from `@dzgrid/dom/locales/<lang>-pivot-bar` (with the -group and -pivot ones). */
export const PIVOT_BAR_KEYS = ['rows', 'columns', 'values', 'valuesEmpty', 'addValue', 'removeValue', 'valueAdded', 'valueRemoved', 'valuePlaced', 'order', 'reversed', 'ordered', 'refused', 'mode']
  .map((k) => `pivot.${k}`) as readonly PivotBarMessageKey[];
const FNS = ['sum', 'avg', 'min', 'max', 'count'] as const;

export interface PivotBarOptions {
  readonly use: {
    /** The row grouping (`grouping({ pivot })`): the « Lignes » part. */
    readonly grouping: { api(grid: Grid): { by(): readonly string[]; setBy(by: readonly string[], o?: { readonly user?: boolean }): void } | null };
    /** The pivot handed to that grouping: the « Colonnes » and « Valeurs » parts. */
    readonly pivot: { api(grid: Grid): PivotApi | null };
    /** Moving columns (`columns()`): a header dropped on a part adds its column there. */
    readonly columns?: { api(grid: Grid): { readonly dropTargets: { add(el: Element, t: { accept(column: string): boolean; drop(column: string): void; readonly label?: string }): () => void } } | null };
  };
  /** The columns panel's « Mode pivot » switch and parts (pivot.md 36; default true, with `columnsChooser()`). */
  readonly panel?: boolean;
}

/**
 * The bar's layout (no colour: `@dzgrid/theme/pivot.css`; logical sides only; zero specificity), over the bands' own
 * (`ZONE_CSS`): the parts side by side with a rule between them, stacked one per line when the bar is 30 rem wide or less.
 */
export const PIVOT_BAR_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-pzone){display:flex;flex-wrap:wrap;container-type:inline-size}' +
  ':where(.dzg-ppart,.dzg-pzone>.dzg-pbar){flex:1 1 auto}' +
  ':where(.dzg-ppart+.dzg-ppart,.dzg-pzone>.dzg-pbar){border-inline-start:var(--dzg-line,1px) solid}' +
  ':where(.dzg-ppart-name){font-weight:600;margin-inline-end:.25rem}' +
  ':where(.dzg-chip-o){min-block-size:var(--dzg-target-min,24px);inline-size:var(--dzg-target-min,24px);padding:0;font:inherit;color:inherit;cursor:pointer}' +
  ':where(.dzg-cp-top) :where(.dzg-ppart){flex-basis:100%}' +
  ':where(.dzg-cp-top) :where(.dzg-pswitch){margin-block-end:.25rem}' +
  '@container (max-width:30rem){:where(.dzg-ppart,.dzg-pzone>.dzg-pbar){flex-basis:100%}:where(.dzg-ppart+.dzg-ppart,.dzg-pzone>.dzg-pbar){border-inline-start:0;border-block-start:var(--dzg-line,1px) solid}}' +
  '}';

/**
 * `pivotBar(options)`: the pivot's one bar (docs/behaviors/pivot.md 31–37; owner 2026-11-07) — « Lignes », « Colonnes »,
 * « Valeurs », each a named `toolbar` of chips with the bands' keys (group-drop-zone.md 9, 14–18), the values' function
 * menu, the ↑/↓ order of a pivot column, Ctrl+Shift+ArrowUp / ArrowDown (or a chip dropped there) to move a column to
 * another part; the pivot's strip joins it; with `columnsChooser()`, the same parts and a « Mode pivot » switch at the
 * top of the columns panel. Use it instead of the two `groupZone()` bands beside a pivot.
 *
 * ```ts
 * const p = pivot({ columns: ['month'], values: { amount: 'sum' } });
 * const g = grouping({ by: ['region'], pivot: p });
 * createGrid(host, { …, features: [spans(), moves, g, pivotBar({ use: { grouping: g, pivot: p, columns: moves } })] });
 * ```
 */
export function pivotBar(o: PivotBarOptions): GridFeature {
  return { id: 'pivot-bar', setup: (g) => setup(g, o) };
}

type PartKey = 'rows' | 'columns' | 'values';
interface Part {
  readonly k: PartKey;
  by(): string[];
  set(ids: readonly string[]): void;
  /** The column may stand in this part (wherever it is now). */
  fits(id: string): boolean;
  /** Its texts: name, empty, remove, added, removed, placed, « + ». */
  readonly t: readonly [Key, Key, Key, Key, Key, Key, Key];
}

function setup(g: GridContext<unknown>, o: PivotBarOptions): FeatureHandle {
  needTexts(g, [...PIVOT_BAR_KEYS, 'zone.empty', 'zone.remove', 'zone.grouped', 'zone.removed', 'zone.placed', 'zone.add', 'pivot.empty', 'pivot.remove', 'pivot.grouped', 'pivot.removed', 'pivot.placed', 'pivot.add', 'pivot.fnSaid', 'pivot.valueChip', 'menu.total', ...FNS.map((f) => `fn.${f}`)], 'pivot-bar');
  const { el, doc, columns: m, scope } = g;
  const root = el.root.getRootNode() as Document | ShadowRoot;
  for (const [k, css] of [['zone', ZONE_CSS], ['pbar', PIVOT_BAR_CSS]] as const) {
    if (root.querySelector(`style[data-dzgrid-${k}]`)) continue;
    const st = doc.createElement('style');
    st.setAttribute(`data-dzgrid-${k}`, '');
    if (g.settings.nonce) st.setAttribute('nonce', g.settings.nonce);
    st.textContent = css;
    ('head' in root ? root.head : root).append(st);
  }
  const P = (): PivotApi | null => o.use.pivot.api(g);
  const G = () => o.use.grouping.api(g);
  const T = (k: Key, p?: Record<string, string | number>): string => g.msg(k, p);
  const name = (id: string): string => P()?.name(id) ?? m.get(id)?.def.header ?? id;
  const say = (k: Key, id: string, p?: Record<string, string | number>): void => g.live.announce(T(k, { column: name(id), ...p }));
  const user = { user: true } as const;
  const known = (id: string): boolean => !!m.get(id) && id[0] !== '~';
  const groupable = (id: string): boolean => known(id) && m.get(id)!.def.groupable !== false;
  /** The functions that fit a column (pivot.md 20; the column menu's rule). */
  const fits = (id: string, f: string): boolean => {
    const t = m.get(id)?.type ?? '';
    return f === 'count' || (f === 'sum' || f === 'avg' ? t === 'number' : /^(number|day|instant|text)$/.test(t));
  };
  const vals = () => P()?.values() ?? {};
  /** A value added: its `aggFunc` when it fits, else `sum` for a number, `count` otherwise (pivot.md 32). */
  const first = (id: string) => {
    const a = m.get(id)!.def.aggFunc;
    return typeof a == 'function' || (typeof a == 'string' && fits(id, a)) ? a : fits(id, 'sum') ? 'sum' : 'count';
  };
  const parts: readonly Part[] = [
    { k: 'rows', by: () => [...new Set(G()?.by() ?? [])].filter(groupable), set: (ids) => G()?.setBy(ids, user), fits: groupable, t: ['pivot.rows', 'zone.empty', 'zone.remove', 'zone.grouped', 'zone.removed', 'zone.placed', 'zone.add'] },
    { k: 'columns', by: () => [...(P()?.by() ?? [])].filter(groupable), set: (ids) => P()?.setBy(ids, user), fits: groupable, t: ['pivot.columns', 'pivot.empty', 'pivot.remove', 'pivot.grouped', 'pivot.removed', 'pivot.placed', 'pivot.add'] },
    {
      k: 'values', by: () => Object.keys(vals()).filter(known),
      set: (ids) => { const v = vals(); P()?.setValues(Object.fromEntries(ids.map((id) => [id, v[id] ?? first(id)])), user); },
      fits: (id) => known(id) && (m.get(id)!.type === 'number' || m.get(id)!.def.aggFunc !== undefined),
      t: ['pivot.values', 'pivot.valuesEmpty', 'pivot.removeValue', 'pivot.valueAdded', 'pivot.valueRemoved', 'pivot.valuePlaced', 'pivot.addValue'],
    },
  ];
  /** A value's chip: « sum(Amount) »; an application's own function, the name alone (pivot.md 32). */
  const label = (p: Part, id: string): string => {
    const t = p.k === 'values' && g.settings.messages.text[`fn.${vals()[id]}` as 'fn.sum'];
    return typeof t == 'string' ? T('pivot.valueChip', { fn: t.toLocaleLowerCase(g.settings.messages.locale), column: name(id) }) : name(id);
  };
  /** Added at the end of a part, said; a band's column leaves the other band first (each column in one band). */
  const add = (p: Part, id: string): void => {
    if (p.k !== 'values') for (const q of parts) if (q.k !== 'values' && q !== p && q.by().includes(id)) q.set(q.by().filter((x) => x !== id));
    if (!p.by().includes(id)) p.set([...p.by(), id]);
    if (p.by().includes(id)) say(p.t[3], id);
  };

  const L = menuList(g);
  /** One drawing of the three parts: the bar's, or the columns panel's (pivot.md 36). */
  const bar = (host: HTMLElement, panel?: boolean) => {
    const zone = host.appendChild(doc.createElement('div'));
    zone.className = 'dzg-pzone';
    zone.id = `dzg-pb${++uid}`;
    let sw: HTMLButtonElement | null = null;
    if (panel) {
      // « Mode pivot » (pivot.md 35): the same mode as the pivot's own switch.
      sw = zone.insertAdjacentElement('beforebegin', doc.createElement('button')) as HTMLButtonElement;
      sw.type = 'button';
      sw.className = 'dzg-chip dzg-pswitch';
      sw.tabIndex = 0;
      sw.setAttribute('role', 'switch');
      sw.onclick = () => P()?.setOn(!P()!.on(), user);
    }
    const els: HTMLElement[] = parts.map((p, i) => {
      const z = zone.appendChild(doc.createElement('div'));
      z.className = 'dzg-gzone dzg-ppart';
      z.dataset['part'] = p.k;
      z.setAttribute('role', 'toolbar');
      z.id = `${zone.id}-${i}`;
      // Named by its visible name (pivot.md 31).
      z.setAttribute('aria-labelledby', z.id + 'n');
      return z;
    });
    const sigs = ['', '', ''];
    const at = [0, 0, 0];
    const items = (z: Element): HTMLElement[] => [...z.querySelectorAll<HTMLElement>('.dzg-chip, .dzg-chip-o, .dzg-chip-x')];
    const rove = (i: number, j: number, focus?: boolean): void => {
      const all = items(els[i]!);
      at[i] = Math.max(0, Math.min(all.length - 1, j));
      all.forEach((b, x) => (b.tabIndex = x === at[i] ? 0 : -1));
      if (focus) all[at[i]!]?.focus();
    };
    /** The columns « + » offers: in the grid's order, fitting, not in this part (nor in the other band for a band). */
    const offer = (p: Part): string[] => m.state().map((x) => x.id).filter((id) => p.fits(id) && !(p.k === 'values' ? p.by() : [...parts[0]!.by(), ...parts[1]!.by()]).includes(id));
    const chipOf = (i: number, id: string): HTMLElement | undefined => [...els[i]!.querySelectorAll<HTMLElement>('.dzg-gchip')].find((c) => c.dataset['col'] === id);
    const focusChip = (i: number, id: string): void => {
      draw();
      const b = chipOf(i, id)?.querySelector<HTMLElement>('.dzg-chip');
      if (b) rove(i, items(els[i]!).indexOf(b), true);
    };
    const draw = (): void => {
      const pv = P();
      if (sw) sw.replaceChildren(Object.assign(doc.createElement('span'), { className: 'dzg-pswitch-track' }), T('pivot.mode')), sw.setAttribute('aria-checked', String(!!pv?.on()));
      parts.forEach((p, i) => {
        const z = els[i]!;
        // Without the pivot (refused beside a server): the rows' part alone.
        z.hidden = !pv && i > 0;
        const by = p.by();
        const desc = pv?.desc() ?? [];
        const next = [g.settings.messages.locale, offer(p).length, ...by.map((id) => `${id}\u0000${label(p, id)}\u0000${desc.includes(id)}`)].join('\u0001');
        if (next === sigs[i]) return;
        sigs[i] = next;
        const was = z.contains(root.activeElement) ? (root.activeElement as HTMLElement) : null;
        const wasCol = was?.closest<HTMLElement>('.dzg-gchip')?.dataset['col'];
        const wasCls = was?.className;
        z.replaceChildren();
        const n = z.appendChild(doc.createElement('span'));
        n.className = 'dzg-ppart-name';
        n.id = z.id + 'n';
        n.textContent = T(p.t[0]);
        if (!by.length) {
          const e = z.appendChild(doc.createElement('span'));
          e.className = 'dzg-gzone-empty';
          e.textContent = T(p.t[1]);
        }
        for (const id of by) {
          const c = z.appendChild(doc.createElement('span'));
          c.className = 'dzg-gchip';
          c.dataset['col'] = id;
          const btn = (cls: string, text: string, aria?: string): HTMLButtonElement => {
            const b = c.appendChild(doc.createElement('button'));
            b.type = 'button';
            b.className = cls;
            b.textContent = text;
            if (aria) b.setAttribute('aria-label', aria);
            return b;
          };
          const b = btn('dzg-chip', label(p, id));
          b.setAttribute('aria-keyshortcuts', 'Delete Control+Shift+ArrowLeft Control+Shift+ArrowRight Control+Shift+ArrowUp Control+Shift+ArrowDown');
          if (p.k === 'values') b.setAttribute('aria-haspopup', 'menu');
          // The order of a pivot column's created columns (pivot.md 33).
          if (p.k === 'columns') btn('dzg-chip-o', desc.includes(id) ? '↓' : '↑', T('pivot.order', { column: name(id) })).setAttribute('aria-pressed', String(desc.includes(id)));
          btn('dzg-chip-x', '×', T(p.t[2], { column: name(id) }));
        }
        if (offer(p).length) {
          const plus = z.appendChild(doc.createElement('button'));
          plus.type = 'button';
          plus.className = 'dzg-chip-x dzg-zadd';
          plus.textContent = '+';
          plus.setAttribute('aria-haspopup', 'menu');
          plus.setAttribute('aria-label', T(p.t[6]));
        }
        // The focus kept on its column's item; its column gone, the item at the same place.
        const all = items(z);
        const same = wasCol ? all.findIndex((x) => x.closest<HTMLElement>('.dzg-gchip')?.dataset['col'] === wasCol && x.className === wasCls) : was?.classList.contains('dzg-zadd') ? all.length - 1 : -1;
        rove(i, same >= 0 ? same : at[i]!, !!was);
        if (was && !all.length) g.restoreFocus();
      });
    };
    const partOf = (t: Element): number => els.indexOf(t.closest<HTMLElement>('.dzg-ppart')!);
    const colOf = (t: Element): string => t.closest<HTMLElement>('.dzg-gchip')?.dataset['col'] ?? '';
    /** Moved to another part (pivot.md 37): added last there when it fits, else nothing, said. */
    const move = (id: string, i: number, j: number): void => {
      const to = parts[j];
      if (!to || j === i) return;
      if (!to.fits(id)) return void say('pivot.refused', id, { part: T(to.t[0]) });
      parts[i]!.set(parts[i]!.by().filter((x) => x !== id));
      add(to, id);
      focusChip(j, id);
    };
    const place = (i: number, id: string, to: number): void => {
      const p = parts[i]!;
      const by = p.by();
      const from = by.indexOf(id);
      to = Math.max(0, Math.min(by.length - 1, to));
      if (from < 0 || to === from) return;
      by.splice(from, 1);
      by.splice(to, 0, id);
      p.set(by);
      if (p.by().indexOf(id) === to) say(p.t[5], id, { n: to + 1, total: by.length });
      focusChip(i, id);
    };
    const remove = (i: number, id: string): void => {
      const p = parts[i]!;
      if (!p.by().includes(id)) return;
      p.set(p.by().filter((x) => x !== id));
      if (!p.by().includes(id)) say(p.t[4], id);
      draw();
    };
    /** The grid's menu under `anchor`; Escape puts the focus back on what opened it. */
    const menu = (anchor: HTMLElement, i: number, id: string, title: Key, entries: () => { id: string; label: string; kind?: 'radio'; group?: string; checked?: boolean; action: () => void }[]): void => {
      let back = false;
      const again = (): void => (id ? focusChip(i, id) : els[i]!.querySelector<HTMLElement>('.dzg-zadd')?.focus());
      L.open({ owner: zone, id: id || '+', anchor, label: T(title, { column: name(id) }), ctx: () => ({}), part: () => ({}), entries: () => entries().map((e) => ({ ...e, action: () => (L.hand(), e.action(), again()) })), back: () => void (back = true), onClose: () => back && ((back = false), again()) });
    };
    scope.on(zone, 'click', (e: MouseEvent) => {
      const t = (e.target as Element).closest<HTMLElement>('.dzg-chip, .dzg-chip-o, .dzg-chip-x');
      if (!t) return;
      const i = partOf(t);
      const p = parts[i]!;
      const id = colOf(t);
      const pv = P();
      rove(i, items(els[i]!).indexOf(t));
      if (t.classList.contains('dzg-zadd'))
        menu(t, i, '', p.t[6], () => offer(p).map((c) => ({ id: c, label: name(c), action: () => add(p, c) })));
      else if (t.classList.contains('dzg-chip-x')) remove(i, id);
      else if (t.classList.contains('dzg-chip-o') && pv) {
        const on = !pv.desc().includes(id);
        pv.setDesc(on ? [...pv.desc(), id] : pv.desc().filter((x) => x !== id), user);
        say(on ? 'pivot.reversed' : 'pivot.ordered', id);
        draw();
        chipOf(i, id)?.querySelector<HTMLElement>('.dzg-chip-o')?.focus();
      } else if (p.k === 'values' && pv)
        // The value's function (pivot.md 32, 20): radios « Total », for all its columns.
        menu(t, i, id, 'menu.total', () => FNS.filter((f) => fits(id, f)).map((f) => ({
          id: `fn.${f}`, label: T(`fn.${f}`), kind: 'radio', group: T('menu.total'), checked: vals()[id] === f,
          action: () => (pv.setValues({ ...vals(), [id]: f }, user), say('pivot.fnSaid', id, { fn: T(`fn.${f}`) })),
        })));
    });
    // ---- keys (APG toolbar; group-drop-zone.md 9, 14; pivot.md 37) ----
    scope.on(zone, 'keydown', (e: KeyboardEvent) => {
      const t = (e.target as Element).closest<HTMLElement>('.dzg-chip, .dzg-chip-o, .dzg-chip-x');
      if (!t) return;
      const i = partOf(t);
      const id = colOf(t);
      const all = items(els[i]!);
      const k = e.key;
      const step = intentFor({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, { dir: g.dir, owner: 'cell', mac: g.mac });
      const by = step?.kind === 'move' && step.axis === 'col' ? step.delta : 0;
      const cs = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
      const none = !(e.ctrlKey || e.shiftKey || e.altKey || e.metaKey);
      if (cs && id && by) place(i, id, parts[i]!.by().indexOf(id) + by);
      else if (cs && id && (k === 'ArrowUp' || k === 'ArrowDown')) move(id, i, i + (k === 'ArrowUp' ? -1 : 1));
      else if (none && by) rove(i, all.indexOf(t) + by, true);
      else if (none && (k === 'Home' || k === 'End')) rove(i, k === 'Home' ? 0 : all.length - 1, true);
      else if (none && id && (k === 'Delete' || k === 'Backspace')) remove(i, id);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    scope.on(zone, 'focusin', (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      const i = partOf(t);
      if (i >= 0) rove(i, items(els[i]!).indexOf(t));
    });

    // ---- a chip dragged by the mouse or a pen: reordered in its part, or moved to the part it is released over ----
    type Drag = { id: string; i: number; p0: PointerEvent; z: HTMLElement; on?: boolean; to?: number | undefined; over?: number };
    let d: Drag | null = null;
    const unmark = (): void => zone.querySelectorAll('[data-dzg-gap], [data-dzg-drop]').forEach((x) => (x.removeAttribute('data-dzg-gap'), x.removeAttribute('data-dzg-drop')));
    const end = (): void => {
      if (d?.on && d.z.hasPointerCapture?.(d.p0.pointerId)) d.z.releasePointerCapture(d.p0.pointerId);
      d = null;
      unmark();
    };
    scope.on(zone, 'pointerdown', (e: PointerEvent) => {
      const c = (e.target as Element).closest<HTMLElement>('.dzg-gchip');
      if (!c || e.button !== 0 || e.pointerType === 'touch' || (e.target as Element).closest('.dzg-chip-x, .dzg-chip-o')) return;
      d = { id: c.dataset['col']!, i: partOf(c), p0: e, z: c.closest<HTMLElement>('.dzg-ppart')! };
    });
    scope.on(zone, 'pointermove', (e: PointerEvent) => {
      if (!d || e.pointerId !== d.p0.pointerId) return;
      if (!d.on && travel(e, d.p0) < 4) return;
      if (!d.on) d.z.setPointerCapture?.(e.pointerId);
      d.on = true;
      unmark();
      const over = atPoint(doc, e)?.closest<HTMLElement>('.dzg-ppart');
      d.over = over ? els.indexOf(over) : -1;
      d.to = undefined;
      if (d.over >= 0 && d.over !== d.i) return void els[d.over]!.setAttribute('data-dzg-drop', 'over');
      const chips = [...d.z.querySelectorAll<HTMLElement>('.dzg-gchip')];
      const to = slotAt(e, chips.map((c) => c.getBoundingClientRect()), d.z.getBoundingClientRect(), g.dir);
      d.to = to ?? undefined;
      if (to !== null) (to < chips.length ? chips[to] : chips[chips.length - 1])?.setAttribute('data-dzg-gap', to < chips.length ? 'before' : 'after');
    });
    scope.on(zone, 'pointerup', (e: PointerEvent) => {
      if (!d || e.pointerId !== d.p0.pointerId) return;
      const { id, i, on, to, over } = d;
      end();
      if (!on) return;
      if (over !== undefined && over >= 0 && over !== i) return move(id, i, over);
      if (to === undefined) return;
      const from = parts[i]!.by().indexOf(id);
      place(i, id, to > from ? to - 1 : to);
    });
    scope.on(zone, 'pointercancel', end);
    scope.on(doc, 'keydown', (e: Event) => void (d?.on && (e as KeyboardEvent).key === 'Escape' && (e.preventDefault(), end())), { capture: true });

    // ---- a header dropped on a part (with `columns()`) ----
    let drops: (() => void)[] | null = null;
    const register = (): void => {
      const cols = drops ? null : o.use.columns?.api(g);
      if (cols) drops = parts.map((p, i) => cols.dropTargets.add(els[i]!, { accept: (id) => p.fits(id) && !p.by().includes(id), drop: (id) => (add(p, id), draw()), label: T(p.t[0]) }));
    };
    return { zone, sw, draw, register, end: (): void => (end(), drops?.forEach((f) => f()), zone.remove(), sw?.remove()) };
  };

  const main = bar(doc.createElement('div'));
  main.zone.remove();
  el.root.insertBefore(main.zone, el.viewport);
  /** The columns panel's drawings (a dialog builds its body at each opening, the dock once). */
  let panels: { host: HTMLElement; b: ReturnType<typeof bar> }[] = [];
  if (o.panel !== false)
    g.panelTop = (host) => {
      panels = panels.filter((x) => x.host.isConnected || x.host === host || x.b.end());
      (panels.find((x) => x.host === host) ?? panels[panels.push({ host, b: bar(host, true) }) - 1]!).b.draw();
    };
  return {
    afterRows() {
      // The pivot's own strip (its switch, the limit's note) joins the bar at its end.
      const strip = el.root.querySelector<HTMLElement>(':scope > .dzg-pbar');
      if (strip) main.zone.append(strip);
      main.register();
      main.draw();
      for (const x of panels) if (x.host.isConnected) x.b.draw();
    },
    destroy() {
      main.end();
      for (const x of panels) x.b.end();
      if (g.panelTop) delete g.panelTop;
    },
  };
}
let uid = 0;
