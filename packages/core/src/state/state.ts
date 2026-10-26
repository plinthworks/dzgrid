import type { Side } from '../columns/defs.js';
import type { ColumnModel, ColumnState } from '../columns/model.js';
import type { FilterModel } from '../filter/model.js';
import type { GridCommand, GridKernel } from '../kernel.js';
import { canonical, makeQuery, type Query } from '../model/query.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem, type StateProblemCode } from '../problems.js';
import type { SortItem } from '../sort/compile.js';

/**
 * The grid's state as the user arranged it (Phase 6 step 5, docs/behaviors/grid-state.md, owner Q-S1, Q-S2, O1, E5-1–E5-6):
 * a small JSON of ids, numbers and the query — never a row, a `RowKey` or a cell value. Captured and restored here, pure;
 * kept and carried by `@dzgrid/dom/state`.
 */
export const STATE_VERSION = 1;
/** The problems a state can give (owner E5-2): a type only, in the base (`StateProblemCode`), so no byte is shipped for them. */
export type { StateProblemCode };
/** Index n reads a state of version n as version n + 1 (sets its `v`); none yet: version 1 is the first (grid-state.md 9). */
export const STATE_UPGRADES: readonly ((s: any) => any)[] = [];

export type Density = 'compact' | 'comfortable' | 'spacious';

export interface GridStateColumn {
  readonly id: string;
  /** Only for a column the user sized (absent: the definition's width, flexible stays flexible). */
  readonly width?: number;
  /** Only when hidden (absent: shown). */
  readonly hidden?: boolean;
  /** Logical: in right to left, the start is on the right. */
  readonly pinned: Side | null;
  /** The place in the full order, hidden columns included. */
  readonly order: number;
}

export interface GridState {
  readonly v: 1;
  readonly columns: readonly GridStateColumn[];
  /** Header group id → open (step 8; absent until a grid has collapsible groups). */
  readonly groups?: Readonly<Record<string, boolean>>;
  readonly sort: readonly SortItem[];
  readonly filter: FilterModel;
  readonly quick: string;
  /** From 0, with `pageSize`: on a paged grid only. */
  readonly page?: number;
  readonly pageSize?: number;
  readonly density?: Density;
}

export type StatePart = 'columns' | 'groups' | 'sort' | 'filter' | 'quick' | 'page' | 'density';
/** Which parts a capture writes and a restore applies: every one by default. `page` stands for `page` and `pageSize`. */
export interface StateOptions {
  readonly include?: readonly StatePart[];
  readonly exclude?: readonly StatePart[];
}

/** A grid's header groups that open and close (step 8 wires them; until then a state's `groups` are unknown). */
export interface GroupsAdapter {
  /** False for an id the grid does not have. */
  collapsible(id: string): boolean;
  get(): Readonly<Record<string, boolean>>;
  set(open: Readonly<Record<string, boolean>>): void;
}

/** What the DOM layer holds and the core does not: the density, the groups. */
export interface StateEnv {
  density?(): Density | undefined;
  /** False: not a density (`state-field`, nothing changed). */
  setDensity?(d: unknown): boolean | void;
  readonly groups?: GroupsAdapter;
}

/** A column entry's fields: the test of a value, and what an absent one means (an order: its place in the list). */
const FIELDS: readonly [string, (v: any) => unknown, unknown][] = [
  ['order', Number.isFinite, undefined],
  ['width', (v) => v === +v && v > 0 && v < Infinity, null],
  ['hidden', (v) => v === !!v, false],
  ['pinned', (v) => v === null || v === 'start' || v === 'end', null],
];

const on = (o: StateOptions | undefined, p: StatePart): boolean => (!o?.include || o.include.includes(p)) && !o?.exclude?.includes(p);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v == 'object' && !Array.isArray(v);
const whole = (n: unknown, min: number): n is number => Number.isInteger(n) && (n as number) >= min;

/** Every column, hidden ones too, in the order the model sorts them (each segment by `order ?? place`; ties: asked first). */
const fullOrder = (m: ColumnModel<any>): ColumnState[] => {
  const st = m.state();
  const key = (i: number) => st[i]!.order ?? i;
  return st.map((_, i) => i).sort((a, b) => key(a) - key(b) || +(st[a]!.order === undefined) - +(st[b]!.order === undefined) || a - b).map((i) => st[i]!);
};
/** A column as shown now: hidden, side, the user's width. */
const now = (m: ColumnModel<any>, s: ColumnState) => {
  const d = m.get(s.id)!.def;
  return { hidden: s.hidden ?? !!d.hidden, pinned: s.pinned !== undefined ? s.pinned : (d.pinned ?? null), width: s.width };
};

/**
 * The state's text (G 4, 18): JSON with every object's keys sorted (the query key's form), so one state is one text
 * whatever order its keys were written in.
 */
export const stateText = (s: GridState): string => canonical(s);

/** The grid's state now (grid-state.md 4): deterministic, every part named by `opts` written even at its default. */
export function captureState<T>(k: GridKernel<T>, env: StateEnv = {}, opts?: StateOptions): GridState {
  const m = k.columns;
  const q = k.query;
  const pg = k.rows.page;
  const s: Record<string, unknown> = {
    columns: fullOrder(m).map((c, order) => {
      const n = now(m, c);
      return { id: c.id, width: n.width, hidden: n.hidden || undefined, pinned: n.pinned, order };
    }),
    groups: env.groups?.get(),
    sort: q.sort,
    filter: q.filter,
    quick: q.quick,
    page: pg?.index,
    pageSize: pg?.size,
    density: env.density?.(),
  };
  for (const p in s) if (!on(opts, (p == 'pageSize' ? 'page' : p) as StatePart)) delete s[p];
  return JSON.parse(canonical({ ...s, v: 1 }));
}

/**
 * The pure half (grid-state.md 8, 9): a copy of plain data only (a cycle, a getter that throws, a BigInt: refused), its
 * version read — a lower one upgraded one version at a time, a higher, missing or odd one refused (`state-version`,
 * nothing applied). The parts are checked against the grid by `restoreState`.
 */
export function checkState(raw: unknown, upgrades: readonly ((s: any) => any)[] = STATE_UPGRADES): { state: GridState | null; problems: Problem[] } {
  try {
    let s = JSON.parse(JSON.stringify(raw));
    for (let v = s?.v; isObj(s) && whole(v, 0) && v < STATE_VERSION && upgrades[v]; v++) s = upgrades[v]!(s);
    if (isObj(s) && s.v === STATE_VERSION) return { state: s as GridState, problems: [] };
  } catch {
    // Not plain data, or an upgrade that threw: refused below.
  }
  return { state: null, problems: [problem('state-version', 'error', 'v')] };
}

/**
 * Applies a state (grid-state.md 6–15): columns (order, pins, widths, hidden), groups, density, then sort, filter and search
 * in one query, page size, page — under the model's hold, so a server is asked once (E5-1). Never throws: what is wrong is
 * skipped and told (`state-column`, `state-group`, `state-field`: a path, never a value). As the host's change (`source`):
 * not a user's gesture, nothing said. Returns what was skipped.
 */
export function restoreState<T>(k: GridKernel<T>, raw: unknown, env: StateEnv = {}, source: ChangeSource = 'host'): Problem[] {
  const { state, problems } = checkState(raw);
  if (!state) return problems;
  const s = state as Record<string, any>;
  const m = k.columns;
  const say = (code: StateProblemCode, path: string, detail?: string): void => void problems.push(problem(code, 'warning', path, detail));
  const bad = (path: string): void => say('state-field', path);
  /** A part present: applied (an absent part is not: the grid keeps its own, G 19). */
  const has = (key: string): boolean => s[key] !== undefined;
  const list = (key: string): any[] => (Array.isArray(s[key]) ? s[key] : (bad(key), []));
  /** What the restore does, in order: a command, or the DOM's part (groups, density). */
  const run: (GridCommand | (() => void))[] = [];

  // ---- columns (G 10–12): named first by their order, the others after them as they are; locked ones keep their slot.
  if (has('columns')) {
    const cur = fullOrder(m);
    const ids = cur.map((c) => c.id);
    const named = new Map<string, Record<string, any>>();
    list('columns').forEach((e, i) => {
      const p = `columns.${i}`;
      const col = m.get(e?.id);
      if (typeof e?.id != 'string' || named.has(e.id)) return bad(p);
      if (!col) return say('state-column', p, e.id);
      // Absent: the default (no user width, shown, unpinned); wrong: skipped, the column keeps its own (undefined in a patch).
      const n: Record<string, any> = { i };
      for (const [f, ok, absent] of FIELDS) n[f] = e[f] === undefined ? absent : ok(e[f]) ? e[f] : bad(`${p}.${f}`);
      n.order ??= i;
      if (n.hidden && col.def.hideable === false) n.hidden = bad(`${p}.hidden`) ?? false;
      // A column that does not move keeps its side (O3) and its slot (below); a state placing it elsewhere is told.
      if (col.def.movable === false && (n.pinned = undefined, n.order !== ids.indexOf(e.id))) bad(`${p}.order`);
      named.set(e.id, n);
    });
    const locked = (id: string): unknown => m.get(id)!.def.movable === false;
    // A stable sort: entries with one order keep the state's order.
    const want = [...[...named.keys()].sort((a, b) => named.get(a)!.order - named.get(b)!.order), ...ids.filter((id) => !named.has(id))];
    const free = want.filter((id) => !locked(id));
    let j = 0;
    const full = ids.map((id) => (locked(id) ? id : free[j++]!));
    const hidden = (id: string): boolean => named.get(id)?.hidden ?? now(m, cur[ids.indexOf(id)]!).hidden;
    // O1: never every column hidden; the first of the restored order is shown.
    const first = full.every(hidden) ? full[0] : undefined;
    if (first !== undefined) bad(named.has(first) ? `columns.${named.get(first)!.i}.hidden` : 'columns');
    // Every column's place, and what the state says of it (undefined: unchanged); a state equal to the grid changes nothing.
    run.push({ type: 'column.state', patch: full.map((id, order) => ({ id, order, width: named.get(id)?.width, pinned: named.get(id)?.pinned, hidden: id !== first && hidden(id) })) });
  }

  // ---- groups (step 8): only the grid's collapsible ones.
  if (has('groups')) {
    const a = env.groups;
    const open = Object.entries(isObj(s.groups) ? s.groups : bad('groups') ?? {}).filter(([id, v]) =>
      !a?.collapsible(id) ? say('state-group', `groups.${id}`) : v === !!v || bad(`groups.${id}`));
    if (open.length) run.push(() => a!.set(Object.fromEntries(open)));
  }
  // The DOM's to check: not one of the three, refused (false) and told.
  if (has('density')) run.push(() => void (env.setDensity?.(s.density) === false && bad('density')));

  // ---- the query (G 10, 11): unknown or removed columns dropped; what the state does not name stays the grid's.
  if (has('sort') || has('filter') || has('quick')) {
    const q = k.query;
    const sort: SortItem[] = [];
    if (has('sort')) list('sort').forEach((x, i) => {
      const col = m.get(x?.column);
      const p = `sort.${i}`;
      // Not sortable, twice, `nulls` wrong: the model refuses the item itself (invalid-sort).
      if (typeof x?.column != 'string' || !['asc', 'desc'].includes(x.dir)) bad(p);
      else if (!col) say('state-column', p, x.column);
      else sort.push({ column: x.column, dir: x.dir, nulls: x.nulls });
    });
    const query = makeQuery({
      sort: has('sort') ? sort : q.sort,
      filter: has('filter')
        ? Object.fromEntries(Object.entries(isObj(s.filter) ? s.filter : bad('filter') ?? {}).filter(([id, f]) => {
          const col = m.get(id);
          return !col ? say('state-column', `filter.${id}`) : isObj(f) || bad(`filter.${id}`);
        }))
        : q.filter,
      quick: has('quick') ? (typeof s.quick == 'string' ? s.quick : bad('quick') ?? q.quick) : q.quick,
    });
    run.push({ type: 'query.set', query });
  }

  // ---- the page (G 13): a grid without pages ignores it; past the last page, the model shows the last.
  if (k.rows.page) {
    if (has('pageSize')) {
      const size = s.pageSize;
      if (whole(size, 1)) run.push({ type: 'page.size', size });
      else bad('pageSize');
    }
    if (has('page')) {
      const index = s.page;
      if (whole(index, 0)) run.push({ type: 'page.go', index });
      else bad('page');
    }
  }

  const all = (): void => run.forEach((c) => (typeof c == 'function' ? c() : k.dispatch(c, source)));
  if (k.rows.hold) k.rows.hold(all);
  else all();
  return problems;
}
