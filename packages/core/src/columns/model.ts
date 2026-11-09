import { PrefixSums } from '../layout/prefix-sums.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem } from '../problems.js';
import { resolveColumns, type ColumnOrGroup, type ResolvedColumn, type Side } from './defs.js';

export interface ColumnLookup<T> {
  get(id: string): ResolvedColumn<T> | undefined;
  /** Displayed columns, start segment first, then centre, then end. */
  visible(): readonly ResolvedColumn<T>[];
  /** Bumped by any change, widths included: what layout follows. */
  readonly version: number;
  /** Bumped only when what the cells hold or which columns show changes: what sorting and filtering follow. */
  readonly dataVersion: number;
  /**
   * The shown columns and those collapsed under their rows (`@dzgrid/dom/responsive`, 1.9.0), in screen order: what the
   * quick search reads and a file writes. Absent: `visible()`.
   */
  withCollapsed?(): readonly ResolvedColumn<T>[];
}

/** What the user (or the host) changed about a column. Sorting lives in the query, not here (D6). */
export interface ColumnState {
  readonly id: string;
  /** null in a patch: the user's width cleared, the definition's again (Phase 6 step 3, owner Q3-3); never kept. */
  readonly width?: number | null;
  readonly hidden?: boolean;
  readonly pinned?: Side | null;
  readonly order?: number;
}

export interface ColumnSlice {
  readonly columns: readonly ResolvedColumn<any>[];
  readonly widths: PrefixSums;
  readonly width: number;
}
export interface ColumnLayout {
  readonly start: ColumnSlice;
  readonly center: ColumnSlice;
  readonly end: ColumnSlice;
  readonly totalWidth: number;
}
export interface ColumnChange {
  readonly changed: readonly string[];
  readonly layoutChanged: boolean;
  readonly problems: readonly Problem[];
}
export interface ColumnModel<T> extends ColumnLookup<T> {
  readonly layout: ColumnLayout;
  readonly problems: readonly Problem[];
  state(): readonly ColumnState[];
  apply(patch: readonly ColumnState[], source: ChangeSource): ColumnChange;
  /** New definitions from the host; what the user set is kept by id. */
  setDefs(defs: readonly ColumnOrGroup<T>[]): ColumnChange;
  /** The width the columns share; drives flexible columns. */
  setAvailableInline(px: number): ColumnChange;
  /** Column ids hidden by a closed header group (Phase 6 step 7, header-groups.md 3): apart from the user's `hidden`. */
  readonly folded: ReadonlySet<string>;
  /**
   * The columns closed groups hide (`@dzgrid/dom/spans`), replacing the last set; `state()` and `hidden` untouched.
   * Refused, nothing changed, when it would leave no column shown (O1). Tells no event: its caller does.
   */
  fold(ids: ReadonlySet<string>): ColumnChange;
  /** The centre columns collapsed under their rows for want of room (responsive-columns.md 1); empty while `collapse` is off. Optional in the type only (1.9.0, an addition): the grid's model has it. */
  readonly collapsed?: ReadonlySet<string>;
  /**
   * Collapses centre columns, by `rank` (highest first, the last on screen among equals; 0 or less never), until the rest
   * fit the room `setAvailableInline` gives; never the first shown column nor a pinned one. Decided again at each change;
   * null: off. `state()`, `hidden`, `folded` and `dataVersion` untouched (responsive-columns.md 1, 5, 9).
   */
  collapse?(rank: ((c: ResolvedColumn<T>) => number) | null): ColumnChange;
}

const DEFAULT_WIDTH = 150;
const DEFAULT_MIN = 40;

export function createColumnModel<T>(initial: readonly ColumnOrGroup<T>[], o: { availableInline?: number } = {}): ColumnModel<T> {
  let columns: readonly ResolvedColumn<T>[] = [];
  let byId = new Map<string, ResolvedColumn<T>>();
  let defProblems: readonly Problem[] = [];
  const user = new Map<string, ColumnState>();
  let available = o.availableInline;
  let version = 0;
  let dataVersion = 0;
  let layout: ColumnLayout;
  let visibleList: readonly ResolvedColumn<T>[] = [];
  let folded: ReadonlySet<string> = new Set();
  let rank: ((c: ResolvedColumn<T>) => number) | null = null;
  let collapsed: ReadonlySet<string> = new Set();
  let seen: readonly ResolvedColumn<T>[] = [];

  const setColumns = (defs: readonly ColumnOrGroup<T>[]): void => {
    const r = resolveColumns(defs);
    columns = r.columns;
    defProblems = r.problems;
    byId = new Map(columns.map((c) => [c.id, c]));
  };

  const recompute = (): void => {
    const pos = new Map(columns.map((c, i) => [c.id, i]));
    // A position the user asked for wins over the default position it ties with.
    const order = (c: ResolvedColumn<T>): number => user.get(c.id)?.order ?? pos.get(c.id)!;
    const asked = (c: ResolvedColumn<T>): number => (user.get(c.id)?.order === undefined ? 1 : 0);
    const shown = columns.filter((c) => !folded.has(c.id) && !(user.get(c.id)?.hidden ?? c.def.hidden ?? false));
    const side = (c: ResolvedColumn<T>): Side | null => {
      const u = user.get(c.id);
      return u && u.pinned !== undefined ? u.pinned : (c.def.pinned ?? null);
    };
    const seg = (s: Side | null) =>
      shown.filter((c) => side(c) === s).sort((a, b) => order(a) - order(b) || asked(a) - asked(b) || pos.get(a.id)! - pos.get(b.id)!);
    const start = seg('start');
    let center = seg(null);
    const end = seg('end');

    const bounds = (c: ResolvedColumn<T>) => {
      const min = c.def.minWidth ?? DEFAULT_MIN;
      return { min, max: Math.max(min, c.def.maxWidth ?? Infinity) };
    };
    const clamp = (c: ResolvedColumn<T>, w: number) => {
      const { min, max } = bounds(c);
      return Math.min(max, Math.max(min, w));
    };
    const isFlex = (c: ResolvedColumn<T>) => (c.def.flex ?? 0) > 0 && user.get(c.id)?.width === undefined;
    const fixed = (c: ResolvedColumn<T>) => Math.round(clamp(c, user.get(c.id)?.width ?? c.def.width ?? DEFAULT_WIDTH));

    // Columns collapsed under their rows (responsive-columns.md 1): each needs its width (a flexible one its minWidth, else
    // its width); the centre's, highest rank first and the last among equals, go until the rest fit; never the first.
    seen = [...start, ...center, ...end];
    const gone = new Set<string>();
    if (rank && available !== undefined) {
      const needs = (c: ResolvedColumn<T>) => (isFlex(c) ? Math.round(clamp(c, c.def.minWidth ?? c.def.width ?? DEFAULT_WIDTH)) : fixed(c));
      let need = 0;
      for (const c of seen) need += needs(c);
      const can = center.map((c, i) => [c, rank!(c), i] as const).filter(([c, r]) => r > 0 && c !== seen[0]).sort((a, b) => b[1] - a[1] || b[2] - a[2]);
      for (const [c] of can) {
        if (need <= available) break;
        gone.add(c.id);
        need -= needs(c);
      }
      center = center.filter((c) => !gone.has(c.id));
    }
    if ([...gone].join() !== [...collapsed].join()) collapsed = gone;

    const widths = new Map<string, number>();
    for (const c of [...start, ...center, ...end]) if (!isFlex(c)) widths.set(c.id, fixed(c));
    const flexCols = center.filter(isFlex).concat([...start, ...end].filter(isFlex));
    const used = [...widths.values()].reduce((a, b) => a + b, 0);
    for (const [id, w] of shareFlex(flexCols.map((c) => ({ id: c.id, flex: c.def.flex!, ...bounds(c), base: c.def.width ?? DEFAULT_WIDTH })), available === undefined ? null : available - used)) {
      widths.set(id, w);
    }

    const slice = (cols: readonly ResolvedColumn<T>[]): ColumnSlice => {
      const ws = new PrefixSums(cols.map((c) => widths.get(c.id)!));
      return { columns: cols, widths: ws, width: ws.total };
    };
    // A view too narrow for its pins (pinned-columns.md, L4a): released into the centre, in screen order, while they
    // would leave it less than its widest column; the state untouched.
    const w = (cs: readonly ResolvedColumn<T>[]) => cs.reduce((t, x) => t + widths.get(x.id)!, 0);
    const free = available !== undefined && (start.length || end.length) && available - w(start) - w(end) < Math.max(0, ...center.map((x) => widths.get(x.id)!));
    const s = slice(free ? [] : start);
    const c = slice(free ? [...start, ...center, ...end] : center);
    const e = slice(free ? [] : end);
    layout = { start: s, center: c, end: e, totalWidth: s.width + c.width + e.width };
    visibleList = [...start, ...center, ...end];
  };

  setColumns(initial);
  recompute();

  const signature = (): string =>
    JSON.stringify([layout.start, layout.center, layout.end].map((sl) => sl.columns.map((col, i) => [col.id, sl.widths.sizeAt(i)])));

  /** `problems` is read after `mutate`, so a change reports what it found, not what the last one did. */
  const shownIds = (): string => seen.map((c) => c.id).sort().join(',');
  const change = (mutate: () => readonly string[], problems: () => readonly Problem[] = () => [], data = false): ColumnChange => {
    const before = signature();
    const shownBefore = shownIds();
    const changed = mutate();
    recompute();
    const layoutChanged = signature() !== before;
    if (changed.length || layoutChanged) version++;
    if (data || shownIds() !== shownBefore) dataVersion++;
    return { changed, layoutChanged, problems: problems() };
  };

  return {
    get version() { return version; },
    get dataVersion() { return dataVersion; },
    get layout() { return layout; },
    get problems() { return defProblems; },
    get folded() { return folded; },
    get collapsed() { return collapsed; },
    get: (id) => byId.get(id),
    visible: () => visibleList,
    withCollapsed: () => seen,
    state: () => columns.map((col) => ({ id: col.id, ...user.get(col.id) })),
    apply(patch, _source) {
      const problems: Problem[] = [];
      return change(() => {
        const changed: string[] = [];
        patch.forEach((p, i) => {
          if (!byId.has(p.id)) return void problems.push(problem('unknown-column', 'warning', `state[${i}]`));
          if (p.width != null && !(Number.isFinite(p.width) && p.width >= 0)) {
            return void problems.push(problem('invalid-column', 'error', `state[${i}].width`));
          }
          if (p.order !== undefined && !Number.isFinite(p.order)) return void problems.push(problem('invalid-column', 'error', `state[${i}].order`));
          if (p.pinned !== undefined && p.pinned !== null && p.pinned !== 'start' && p.pinned !== 'end') {
            return void problems.push(problem('invalid-column', 'error', `state[${i}].pinned`));
          }
          // An undefined key in a patch means "unchanged", not "cleared".
          const u = { ...user.get(p.id), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as { width?: number | null };
          // A null width clears the user's (Q3-3).
          if (u.width === null) delete u.width;
          user.set(p.id, u as ColumnState);
          changed.push(p.id);
        });
        return changed;
      }, () => problems);
    },
    setDefs(defs) {
      return change(() => {
        setColumns(defs);
        return columns.map((col) => col.id);
      }, () => defProblems, true);
    },
    fold(ids) {
      const was = folded;
      return change(() => {
        folded = ids;
        recompute();
        if (!visibleList.length) folded = was;
        return [];
      });
    },
    collapse(r) {
      return change(() => {
        rank = r;
        return [];
      });
    },
    setAvailableInline(px) {
      if (!(Number.isFinite(px) && px >= 0)) {
        return { changed: [], layoutChanged: false, problems: [problem('invalid-column', 'error', 'availableInline')] };
      }
      return change(() => {
        available = px;
        return [];
      });
    },
  };
}

/**
 * Shares `room` between flexible columns by weight, holding each between its
 * minimum and maximum, then rounds to whole pixels by largest remainder so the
 * widths add up exactly. Without room (unknown, or all taken), each gets its
 * base width clamped, or its minimum.
 */
function shareFlex(
  cols: readonly { id: string; flex: number; min: number; max: number; base: number }[],
  room: number | null,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!cols.length) return out;
  if (room === null) {
    for (const c of cols) out.set(c.id, Math.round(Math.min(c.max, Math.max(c.min, c.base))));
    return out;
  }
  const minTotal = cols.reduce((a, c) => a + c.min, 0);
  if (room <= minTotal) {
    for (const c of cols) out.set(c.id, Math.round(c.min));
    return out;
  }
  const frozen = new Map<string, number>();
  for (;;) {
    const free = cols.filter((c) => !frozen.has(c.id));
    const left = room - [...frozen.values()].reduce((a, b) => a + b, 0);
    const weight = free.reduce((a, c) => a + c.flex, 0);
    // As CSS flexbox does: clamp everyone, then freeze only the side the total
    // violation leans to — mins if clamping added width, maxes if it removed some.
    let total = 0;
    const clamped = free.map((c) => {
      const w = (left * c.flex) / weight;
      const v = Math.min(c.max, Math.max(c.min, w));
      total += v - w;
      return { c, w, v };
    });
    let froze = false;
    for (const { c, w, v } of clamped) {
      if (v === w) continue;
      if (total === 0 || (total > 0 && v > w) || (total < 0 && v < w)) {
        frozen.set(c.id, v);
        froze = true;
      }
    }
    if (!froze) {
      const exact = cols.map((c) => ({ id: c.id, w: frozen.get(c.id) ?? (left * c.flex) / weight }));
      const floors = exact.map((x) => ({ id: x.id, f: Math.floor(x.w), r: x.w - Math.floor(x.w) }));
      let spare = Math.round(exact.reduce((a, x) => a + x.w, 0)) - floors.reduce((a, x) => a + x.f, 0);
      const byRemainder = [...floors].sort((a, b) => b.r - a.r);
      for (const x of byRemainder) {
        if (spare <= 0) break;
        x.f += 1;
        spare--;
      }
      for (const x of floors) out.set(x.id, x.f);
      return out;
    }
  }
}
