import type { ChangeSource } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { diffState, foldedColumns, groupTable, type GroupTable } from '@dzgrid/core/spans';
import type { GridContext } from '../context.js';
import type { GridFeature, GroupsApi } from '../features.js';
import { setAttr } from '../render/write.js';
import { injectGroupStyles } from './styles.js';

export type { GroupsApi };

export interface GroupsFeature extends GridFeature {
  /** The grid's collapsible header groups; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: object }): GroupsApi | null;
}
/** Each grid's groups, by kernel. */
const APIS = new WeakMap<object, GroupsApi>();

/**
 * `groups()`: collapsible header groups (Phase 6 step 7, docs/behaviors/header-groups.md; owner Q-GH, Q8-4), with
 * `spans()` (the group rows). Its own entry, loaded only with collapsible groups.
 *
 * ```ts
 * import { spans } from '@dzgrid/dom/spans';
 * import { groups } from '@dzgrid/dom/groups';
 * import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
 * const folds = groups();
 * createGrid(host, { columns: [{ id: 'patient', header: 'Patient', collapsible: true, children: [...] }], messages: { ...FR, text: { ...FR.text, ...FR_COLUMNS.text } }, features: [spans(), folds] });
 * folds.api(grid)!.toggle('patient');
 * ```
 */
export function groups(): GroupsFeature {
  return {
    id: 'groups',
    api: (grid) => APIS.get(grid.kernel) ?? null,
    setup(g) {
      const root = g.el.root.getRootNode();
      if (g.settings.injectStyles !== false) injectGroupStyles(root.nodeType === 11 ? (root as ShadowRoot) : g.doc, g.settings.nonce);
      const api = (g.groups = createGroups(g));
      APIS.set(g.kernel, api);
      /** A gesture on a group's header (`data-g`): toggled and said; false when it does not open and close. */
      const toggle = (id?: string): boolean => !!id && api.toggle(id, undefined, { say: true, user: true });
      // The button's press never takes the focus nor reaches the header's handlers (no sort, no drag); its click toggles.
      const btn = (e: Event) => (e.target as Element).closest?.<HTMLElement>('.dzg-gtoggle');
      g.scope.on(g.el.header, 'pointerdown', (e) => void (btn(e) && (e.preventDefault(), e.stopPropagation())), { capture: true });
      g.scope.on(g.el.header, 'click', (e) => void (btn(e) && (e.stopPropagation(), toggle(btn(e)!.parentElement!.dataset['g']))), { capture: true });
      // Its button and name, at each paint of a group's header (header-groups.md 8, 9).
      g.groupCell = (el, id, text) => {
        const open = api.isOpen(id);
        let b = el.childNodes[1] as HTMLButtonElement | undefined;
        if (open === null) b?.remove();
        else {
          if (!b) {
            b = el.appendChild(g.doc.createElement('button'));
            b.type = 'button';
            b.tabIndex = -1;
            b.className = 'dzg-gtoggle';
          }
          setAttr(b, 'aria-expanded', String(open));
          setAttr(b, 'aria-label', g.msg('group.toggle', { group: text }));
        }
        setAttr(el, 'aria-label', open === null ? null : g.msg(open ? 'group.open' : 'group.closed', { group: text }));
      };
      return {
        // Enter or Space on a collapsible group's header (10); any other group: nothing, as before.
        keys: (e) => (e.key === 'Enter' || e.key === ' ') && !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) && toggle((e.target as HTMLElement).dataset?.['g']),
        destroy() {
          APIS.delete(g.kernel);
        },
      };
    },
  };
}

/**
 * Collapsible header groups (Phase 6 step 7, docs/behaviors/header-groups.md; plan step08-plan.md §1): the user's
 * states, the columns they fold (the base's `fold`, apart from the user's
 * `hidden`), the focus kept when its column goes, the sentence. A change is one `columnsChanged`, emitted here after an
 * empty `column.state` that brings the rows and the kernel's focus up to date (no kernel command of its own, Q8-2).
 * Needs the `-columns` texts when the tree has a collapsible group (a `TypeError` at setup otherwise, as the other
 * column features).
 */
function createGroups(g: GridContext<unknown>): GroupsApi {
  const { kernel, columns } = g;
  let tree: unknown;
  let t: GroupTable;
  let open = new Map<string, boolean>();
  /** The table of the tree now: new definitions keep the states of the groups still there; a warning told once per tree. */
  const table = (): GroupTable => {
    if (tree !== g.settings.columns) {
      t = groupTable((tree = g.settings.columns));
      open = new Map([...open].filter(([id]) => t.groups.has(id)));
      if (t.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: t.problems });
    }
    return t;
  };
  if (table().groups.size && g.settings.messages.text['group.toggle'] === undefined) throw new TypeError('groups: missing group.toggle');
  const ids = (): string[] => columns.visible().map((c) => c.id);

  /** The states `next` applied; `id`: the group a gesture changed (the focus follows it, the sentence names it). */
  const apply = (next: Map<string, boolean>, source: ChangeSource, id?: string, say?: boolean): boolean => {
    const was = columns.folded;
    const before = ids();
    const f = foldedColumns(table(), next);
    const { layoutChanged } = columns.fold(f);
    // Refused: it would leave no column shown (O1).
    if (columns.folded !== f) return false;
    open = next;
    const now = ids();
    const shown = (id !== undefined && t.groups.get(id)?.leaves.filter((l) => now.includes(l))) || [];
    const b = id !== undefined && g.groupBands?.find(id);
    const fo = kernel.focus;
    // The focus on a column that went (11): a header to its group's header, a cell to the group's first column shown in
    // the same row, else the next one shown (then the one before). Set before the rows are told, so the kernel's own
    // fallback never wins.
    if (b && fo && !now.includes(fo.column)) {
      const i = before.indexOf(fo.column);
      const to = shown[0] ?? (fo.kind === 'cell' ? [...before.slice(i), ...before.slice(0, i).reverse()].find((c) => now.includes(c)) : 0);
      if (to) kernel.dispatch({ type: 'focus.set', focus: fo.kind === 'cell' ? { ...fo, column: to } : { kind: 'header', column: to, level: b.level } }, 'data');
    }
    kernel.dispatch({ type: 'column.state', patch: [] }, source);
    emit(kernel, { type: 'columnsChanged', source, changed: [...was, ...f].filter((c) => was.has(c) !== f.has(c)), layoutChanged });
    if (say && b) g.live.announce(g.msg(api.isOpen(id!) ? 'group.openedSaid' : 'group.closedSaid', { group: b.label || id!, n: shown.length }));
    return true;
  };

  // New definitions (`update`): the fold again, before the rows are told (inside the kernel's `columns.set`).
  g.scope.add(kernel.subscribe((ev) => void (ev.type === 'columnsChanged' && tree !== g.settings.columns && columns.fold(foldedColumns(table(), open)))));
  // The definitions' states, at once and quietly (nothing changed yet for anyone): the rows told.
  if (columns.fold(foldedColumns(table(), open)).layoutChanged) kernel.dispatch({ type: 'column.state', patch: [] }, 'host');

  const api: GroupsApi = {
    collapsible: (id) => table().groups.has(id),
    isOpen: (id) => {
      const e = table().groups.get(id);
      return e ? open.get(id) ?? e.open : null;
    },
    toggle(id, to, o = {}) {
      const cur = api.isOpen(id);
      if (cur === null) return false;
      to ??= !cur;
      return to === cur || apply(new Map(open).set(id, to), o.user ? 'user' : 'api', id, o.say);
    },
    reset: (o) => void (open.size && apply(new Map(), o?.user ? 'user' : 'api')),
    get: () => diffState(table(), open),
    set: (o) => void apply(new Map(Object.entries(o)), 'host'),
  };
  return api;
}
