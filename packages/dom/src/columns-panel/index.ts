import { fold, type ColumnOrGroup, type GridKernel } from '@dzgrid/core';
import type { GridFeature } from '../features.js';
import type { ColumnsChooserMessageKey } from '../part-texts.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { setAttr, setPx } from '../render/write.js';
import { LiveRegion } from '../a11y/live-region.js';
import { canHide, listed, listOrder, moveNear, placeInList, resetPatch, sidesOf, stepList } from '../columns/order.js';

/** The texts `columnsChooser()` needs, from `@dzgrid/dom/locales/<lang>-columns` (owner Q4-1), with the moves' `move.edge`, `move.locked`, `move.cancelled`. */
export const COLUMNS_CHOOSER_KEYS = 'title search list handle up down placed showAll reset close none matches shown hidden allShown resetDone pinnedStart pinnedEnd last clearToMove'
  .split(' ')
  .map((k) => `chooser.${k}`) as readonly ColumnsChooserMessageKey[];

type Grid = { readonly kernel: GridKernel<any, any> };
export interface ColumnsChooserOptions {
  /** Told after the dialog closed (the focus is already back). */
  readonly onClose?: () => void;
}
export interface ColumnsChooserApi {
  /**
   * Opens the dialog under `anchor` (the application's button, a header), else under the grid's header, end edges
   * aligned; already open: the focus to its search box. False when no column is listed.
   */
  open(anchor?: HTMLElement): boolean;
  close(): void;
  readonly isOpen: boolean;
}
export interface ColumnsChooserFeature extends GridFeature {
  /** The chooser of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: Grid): ColumnsChooserApi | null;
}

/** A row's handle pressed (`on`: dragging, past 4 px), `to` the landing's patch (null: the same place). */
type Drag = { readonly id: string; readonly li: HTMLElement; readonly pid: number; readonly y: number; at: number; on?: boolean; to?: ReturnType<typeof moveNear> };
let uid = 0;

/**
 * `columnsChooser(options)`: « Choisir les colonnes » (docs/behaviors/columns-chooser.md; step04-plan; owner Q-C1, Q-C2,
 * Q-H, O1, O5, O12). A modal dialog in the popup host, anchored on the grid's root (unticking the opener's own column
 * keeps it) and placed under the opener: a search box, every listed column in the list's order (start-pinned, centre,
 * end-pinned, hidden ones too) inside its header groups, each a native checkbox (one tab stop, the arrows between them)
 * with ▲ ▼ and a handle; a tick, a move, « Show all », « Reset » are each one `column.state` patch (source `user`), said;
 * Alt+ArrowUp / ArrowDown move the focused row's column one place in the list. One feature object may serve several grids.
 *
 * ```ts
 * import { columnsChooser } from '@dzgrid/dom/columns-panel';
 * import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
 * import '@dzgrid/theme/columns-panel.css';
 * const chooser = columnsChooser();
 * createGrid(host, { …, features: [columnMenu({ use: { chooser } }), chooser] });
 * button.onclick = () => chooser.api(grid)?.open(button);
 * ```
 */
export function columnsChooser(o: ColumnsChooserOptions = {}): ColumnsChooserFeature {
  const apis = new WeakMap<object, ColumnsChooserApi>();
  return {
    id: 'columns-panel',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = [...COLUMNS_CHOOSER_KEYS, 'move.edge', 'move.locked', 'move.cancelled'].filter((k) => g.settings.messages.text[k as ColumnsChooserMessageKey] === undefined);
      if (missing.length) throw new TypeError(`columns-panel: missing ${missing.join(', ')}`);
      const { kernel, columns: m, el, doc, scope } = g;
      const base = `dzg-cp${++uid}`;
      /** The dialog's own polite status while it is open (the grid's region is outside the `aria-modal` dialog); the grid's otherwise. */
      let region: LiveRegion | null = null;
      const say = (t: string): void => (cur && region ? region : g.live).announce(t);
      const raf = g.env.raf ?? g.win;
      let frame = 0;
      const name = (id: string): string => m.get(id)?.def.header ?? id;
      const T = (k: string, id?: string, p?: Record<string, number>): string => g.msg(`chooser.${k}` as ColumnsChooserMessageKey, { column: id ? name(id) : '', ...p });
      const state = (patch: object[]): void => void kernel.dispatch({ type: 'column.state', patch: patch as never }, 'user');
      const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: Element, cls = '', text?: string): HTMLElementTagNameMap[K] => {
        const x = doc.createElement(tag);
        if (cls) x.className = cls;
        if (text !== undefined) x.textContent = text;
        parent.append(x);
        return x;
      };
      /** Each column's header groups, outermost first, from the definitions' tree. */
      let chains = new Map<string, readonly { readonly id: string; readonly header?: string }[]>();
      const walk = (defs: readonly ColumnOrGroup<unknown>[], up: readonly { id: string; header?: string }[]): void =>
        defs.forEach((d) => void ('children' in d ? walk(d.children, [...up, d]) : chains.set(d.id, up)));
      const path = (id: string): string[] => (chains.get(id) ?? []).map((x) => x.id);
      /** The column set: new definitions with another one close the dialog. */
      const set = (): string => m.state().map((s) => s.id).join('\n');

      let cur: { readonly ref: PopupRef; readonly set: string } | null = null;
      let search!: HTMLInputElement;
      let list!: HTMLElement;
      let status!: HTMLElement;
      let bar!: HTMLElement;
      /** The folded search; the roving box's column; the drag. */
      let q = '';
      let rov: string | undefined;
      let d: Drag | null = null;
      let hush = (): void => {};

      const boxes = (): HTMLInputElement[] => [...list.querySelectorAll<HTMLInputElement>('input')];
      /** A row's box focused and scrolled into view inside the list (a moved row). */
      const focusBox = (id: string): void => {
        const b = boxes().find((x) => x.closest('li')!.dataset['col'] === id);
        b?.focus({ preventScroll: true });
        b?.scrollIntoView?.({ block: 'nearest' });
      };
      const placed = (id: string): void => say(T('placed', id, placeInList(m, id)));

      /** The list drawn again from the model (search, groups, ticks, edges); the focused row keeps the focus by its column. */
      const draw = (): void => {
        const had = list.contains(doc.activeElement) ? doc.activeElement!.closest('li')?.dataset['col'] : undefined;
        chains = new Map();
        walk(g.settings.columns, []);
        const shown = new Set(m.visible().map((c) => c.id));
        const side = sidesOf(m);
        const rows = listOrder(m).filter((id) => listed(m)(id) && (!q || [name(id), ...(chains.get(id) ?? []).map((x) => x.header ?? '')].some((s) => fold(s).includes(q))));
        if (!rov || !rows.includes(rov)) rov = rows[0];
        list.textContent = '';
        list.append(bar);
        // A long list draws only the rows seen (CSS, owner Q4-3); a short one all (WebKit misses clicks on fresh skipped rows).
        setAttr(list, 'data-dzg-long', rows.length > 200 ? '' : null);
        /** The open groups (their list), reset at each segment: a group cut by a pin is named again. */
        let open: { readonly id: string; readonly ul: HTMLElement }[] = [];
        let seg: unknown;
        rows.forEach((id, i) => {
          const ch = chains.get(id) ?? [];
          const s = side(id);
          if (s !== seg) (open = []), (seg = s);
          let k = 0;
          while (k < open.length && open[k]!.id === ch[k]?.id) k++;
          open.length = k;
          for (; k < ch.length; k++) {
            const li = mk('li', open[k - 1]?.ul ?? list);
            li.dataset['s'] = String(s);
            const grp = mk('div', li);
            grp.setAttribute('role', 'group');
            const label = mk('span', grp, 'dzg-cp-gl', ch[k]!.header ?? '');
            label.id = `${base}g${i}-${k}`;
            grp.setAttribute('aria-labelledby', label.id);
            const ul = mk('ul', grp);
            ul.setAttribute('role', 'list');
            open.push({ id: ch[k]!.id, ul });
          }
          const li = mk('li', open.at(-1)?.ul ?? list, 'dzg-cp-row');
          li.dataset['col'] = id;
          li.dataset['s'] = String(s);
          const box = mk('input', li);
          box.type = 'checkbox';
          box.id = `${base}c${i}`;
          box.checked = shown.has(id);
          box.tabIndex = id === rov ? 0 : -1;
          if (!canHide(m, id)) box.setAttribute('aria-disabled', 'true');
          mk('bdi', mk('label', li), '', name(id)).parentElement!.setAttribute('for', box.id);
          // Its pin, and why it cannot be hidden when it is the last one shown (O1).
          const desc = [s && T(s === 'start' ? 'pinnedStart' : 'pinnedEnd'), shown.has(id) && shown.size < 2 && T('last')].filter(Boolean).join(', ');
          if (desc) {
            mk('span', li, 'dzg-cp-desc', desc).id = `${box.id}d`;
            box.setAttribute('aria-describedby', `${box.id}d`);
          }
          // Reordering is off while searching (21).
          if (!q) {
            for (const a of ['up', 'down', 'drag'] as const) {
              const b = mk('button', li);
              b.type = 'button';
              b.tabIndex = -1;
              b.dataset['act'] = a;
              b.setAttribute('aria-label', T(a === 'drag' ? 'handle' : a, id));
              if (typeof (a === 'drag' ? (m.get(id)!.def.movable === false ? 'locked' : 0) : stepList(m, id, a === 'up' ? -1 : 1, path)) === 'string') b.setAttribute('aria-disabled', 'true');
            }
          }
        });
        status.textContent = rows.length ? '' : T('none');
        if (had) focusBox(had);
      };

      /** One place in the list (the keys, ▲ ▼): its patch and sentence, or why not; the focus on its box. */
      const move = (id: string, by: -1 | 1): void => {
        const r = q ? 'clear' : stepList(m, id, by, path);
        if (r && typeof r === 'object') state(r), placed(id);
        else if (r) say(r === 'clear' ? T('clearToMove') : g.msg(`move.${r}`, { column: name(id) }));
        focusBox(id);
      };

      /** The drag given up (`speak`: Escape, « Move cancelled »). */
      const cancel = (speak?: boolean): void => {
        if (!d) return;
        setAttr(d.li, 'data-dzg-dragging', null);
        bar.hidden = true;
        if (frame) raf?.cancelAnimationFrame(frame), (frame = 0);
        if (speak && d.on) say(g.msg('move.cancelled'));
        d = null;
      };

      const open = (a?: HTMLElement): boolean => {
        if (cur) return search.focus(), true;
        if (!listOrder(m).some(listed(m))) return false;
        const p = doc.createElement('div');
        p.className = 'dzg-cp';
        mk('div', p, 'dzg-cp-title', T('title')).id = base;
        search = mk('input', mk('label', p, 'dzg-cp-q', T('search')));
        search.type = 'search';
        status = mk('div', p, 'dzg-cp-none');
        status.setAttribute('role', 'status');
        region = new LiveRegion(doc, scope);
        region.el.setAttribute('role', 'status');
        p.append(region.el);
        list = mk('ul', p, 'dzg-cp-list');
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', T('list'));
        bar = doc.createElement('li');
        bar.className = 'dzg-cp-bar';
        bar.hidden = true;
        bar.setAttribute('aria-hidden', 'true');
        const foot = mk('div', p, 'dzg-cp-foot');
        for (const [act, k] of [['all', 'showAll'], ['reset', 'reset'], ['close', 'close']] as const) {
          const b = mk('button', foot, '', T(k));
          b.type = 'button';
          b.dataset['act'] = act;
        }
        q = '';
        rov = undefined;
        draw();

        p.addEventListener('input', (e) => {
          if (e.target !== search) return;
          q = fold(search.value.trim());
          draw();
          hush();
          // The count after a pause (15).
          hush = scope.timeout(() => void (q && say(T('matches', '', { n: list.querySelectorAll('.dzg-cp-row').length }))), 500);
        });
        p.addEventListener('change', (e) => {
          const b = e.target as HTMLInputElement;
          const id = b.closest('li')?.dataset['col'];
          if (b.type !== 'checkbox' || !id) return;
          state([{ id, hidden: !b.checked }]);
          say(T(b.checked ? 'shown' : 'hidden', id));
        });
        p.addEventListener('focusin', (e) => {
          const b = e.target as HTMLInputElement;
          if (b.type !== 'checkbox') return;
          rov = b.closest('li')!.dataset['col'];
          for (const x of boxes()) x.tabIndex = x === b ? 0 : -1;
        });
        p.addEventListener('click', (e) => {
          const t = (e.target as Element).closest<HTMLElement>('button, input');
          if (!t) return;
          // A click focuses what it pressed, a row's ▲ ▼ its box (WebKit focuses nothing: Escape and Tab would leave the dialog;
          // Tab goes on from the row).
          (t.closest('.dzg-cp-row')?.querySelector('input') ?? t).focus({ preventScroll: true });
          // Disabled (aria-disabled: still reached and heard): nothing, not even the box's own flip (12).
          if (t.getAttribute('aria-disabled')) return e.preventDefault();
          const id = t.closest('li')?.dataset['col'];
          const act = t.dataset['act'];
          if (id && (act === 'up' || act === 'down')) move(id, act === 'up' ? -1 : 1);
          else if (act === 'all') {
            state(listOrder(m).filter((x) => listed(m)(x) && !m.visible().some((c) => c.id === x)).map((x) => ({ id: x, hidden: false })));
            say(T('allShown'));
          } else if (act === 'reset') {
            const r = resetPatch(m);
            if (r) state(r), say(T('resetDone'));
          } else if (act === 'close') cur?.ref.close();
        });
        p.addEventListener('keydown', (e) => {
          const t = e.target as HTMLElement;
          const k = e.key;
          const stop = (): void => (e.preventDefault(), e.stopPropagation());
          // Escape: the drag's first, then a non-empty search's (O12); else the popup host's: it closes.
          if (k === 'Escape') {
            if (d) cancel(true), stop();
            else if (search.value) (search.value = ''), (q = ''), draw(), stop();
            return;
          }
          const all = boxes();
          const i = all.indexOf(t as HTMLInputElement);
          // Tab: search → the list's one stop → « Show all » → « Reset » → « Close », wrapping (165); the same in every
          // engine (WebKit's Tab skips buttons by default).
          if (k === 'Tab') {
            const stops = [search, all.find((b) => b.tabIndex === 0), ...p.querySelectorAll<HTMLElement>('.dzg-cp-foot button')].filter((x): x is HTMLElement => !!x);
            stop();
            return void stops[(stops.indexOf(t) + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]!.focus();
          }
          const to = (j: number): void => (e.preventDefault(), j < 0 ? search.focus() : all[Math.min(j, all.length - 1)]?.focus());
          if (t === search) return void (k === 'ArrowDown' && to(0));
          if (i < 0) return;
          if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) e.preventDefault(), move(t.closest('li')!.dataset['col']!, k === 'ArrowUp' ? -1 : 1);
          else if (e.altKey || e.ctrlKey || e.metaKey) return;
          else if (k === 'ArrowDown' || k === 'ArrowUp') to(i + (k === 'ArrowUp' ? -1 : 1));
          else if (k === 'Home' || k === 'End') to(k === 'Home' ? 0 : all.length - 1);
        });
        // The handle (20): pressed by the mouse, a pen or a finger (O5); the drag past 4 px, from the document's events.
        p.addEventListener('pointerdown', (e) => {
          const h = (e.target as Element).closest<HTMLElement>('[data-act=drag]');
          if (!h || e.button || d) return;
          e.preventDefault();
          if (h.getAttribute('aria-disabled')) return;
          const li = h.closest('li')!;
          d = { id: li.dataset['col']!, li, pid: e.pointerId, y: e.clientY, at: e.clientY };
          h.setPointerCapture?.(e.pointerId);
        });

        const ref = popupsFor(g).open(el.root, p, {
          placement: 'block-end', modal: true, from: a ?? el.header, align: 'end', fit: true,
          // The application's button is left to its own click (it opens again: the focus to the search).
          opener: () => (a && !el.root.contains(a) ? a : null),
          // Back to the application's button, else the grid's own focus (the header the menu came from when it had none).
          back: () => {
            if (a?.isConnected && !el.root.contains(a)) return a.focus({ preventScroll: true });
            const id = a?.dataset['col'];
            if (!kernel.focus && id && m.visible().some((c) => c.id === id)) kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: id } }, 'user');
            g.restoreFocus();
          },
          onClose: () => {
            cancel();
            hush();
            cur = null;
            o.onClose?.();
          },
        });
        ref.el.setAttribute('aria-labelledby', base);
        cur = { ref, set: set() };
        return true;
      };

      const mine = (e: Event): boolean => !!d && (e as PointerEvent).pointerId === d.pid;
      /** Where the pointer lands now: the bar and the patch; near the list's top or bottom edge one step of scroll first (20). */
      const follow = (scroll?: boolean): boolean => {
        const x = d!;
        const y = x.at;
        const L = list.getBoundingClientRect();
        const v = y < L.top + 24 ? -8 : y > L.bottom - 24 ? 8 : 0;
        const was = list.scrollTop;
        if (scroll) list.scrollTop += v;
        // The places beside it: its own list's items (its group), of its segment (never pinned by the list).
        const units = [...x.li.parentElement!.children].filter((u) => u !== bar && (u as HTMLElement).dataset['s'] === x.li.dataset['s']) as HTMLElement[];
        const r = units.map((u) => u.getBoundingClientRect());
        const at = r.filter((b) => (b.top + b.bottom) / 2 < y).length;
        const i = units.indexOf(x.li);
        const cols = (u: HTMLElement): string[] => (u.dataset['col'] ? [u.dataset['col']] : [...u.querySelectorAll<HTMLElement>('.dzg-cp-row')].map((w) => w.dataset['col']!));
        x.to = at === i || at === i + 1 ? null : at < units.length ? moveNear(m, x.id, cols(units[at]!)[0]!, false) : moveNear(m, x.id, cols(units[at - 1]!).at(-1)!, true);
        bar.hidden = false;
        setPx(bar, 'inset-block-start', (at < units.length ? r[at]!.top : r[at - 1]!.bottom) - L.top + list.scrollTop - 1);
        return list.scrollTop !== was;
      };
      /** The auto-scroll, one frame after another while the pointer rests near an edge (stopped by the release, a cancel). */
      const tick = (): void => {
        frame = 0;
        if (d?.on && follow(true)) frame = raf!.requestAnimationFrame(tick);
      };
      scope.on(doc, 'pointermove', (e) => {
        const x = d;
        if (!x || !mine(e)) return;
        x.at = (e as PointerEvent).clientY;
        if (!x.on) {
          if (Math.abs(x.at - x.y) < 4) return;
          x.on = true;
          setAttr(x.li, 'data-dzg-dragging', '');
        }
        follow();
        if (!frame && raf) frame = raf.requestAnimationFrame(tick);
      });
      scope.on(doc, 'pointerup', (e) => {
        const x = d;
        if (!x || !mine(e)) return;
        cancel();
        if (!x.on) return;
        if (x.to) state(x.to), placed(x.id);
        focusBox(x.id);
      });
      scope.on(doc, 'pointercancel', (e) => void (mine(e) && cancel()));

      // Live sync (22): a change made anywhere redraws the list; new definitions with another column set close it.
      const off = kernel.subscribe((e) => {
        if (e.type !== 'columnsChanged' || !cur) return;
        if (set() !== cur.set) return cur.ref.close();
        cancel();
        draw();
      });

      apis.set(kernel, {
        open,
        close: () => cur?.ref.close(),
        get isOpen() {
          return !!cur;
        },
      });
      return {
        destroy() {
          off();
          hush();
          apis.delete(kernel);
        },
      };
    },
  };
}
