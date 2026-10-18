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
}

/** What the user (or the host) changed about a column. Sorting lives in the query, not here (D6). */
export interface ColumnState {
  readonly id: string;
  readonly width?: number;
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
    const shown = columns.filter((c) => !(user.get(c.id)?.hidden ?? c.def.hidden ?? false));
    const side = (c: ResolvedColumn<T>): Side | null => {
      const u = user.get(c.id);
      return u && u.pinned !== undefined ? u.pinned : (c.def.pinned ?? null);
    };
    const seg = (s: Side | null) =>
      shown.filter((c) => side(c) === s).sort((a, b) => order(a) - order(b) || asked(a) - asked(b) || pos.get(a.id)! - pos.get(b.id)!);
    const start = seg('start');
    const center = seg(null);
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
    const s = slice(start);
    const c = slice(center);
    const e = slice(end);
    layout = { start: s, center: c, end: e, totalWidth: s.width + c.width + e.width };
    visibleList = [...start, ...center, ...end];
  };

  setColumns(initial);
  recompute();

  const signature = (): string =>
    JSON.stringify([layout.start, layout.center, layout.end].map((sl) => sl.columns.map((col, i) => [col.id, sl.widths.sizeAt(i)])));

  /** `problems` is read after `mutate`, so a change reports what it found, not what the last one did. */
  const shownIds = (): string => visibleList.map((c) => c.id).sort().join(',');
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
    get: (id) => byId.get(id),
    visible: () => visibleList,
    state: () => columns.map((col) => ({ id: col.id, ...user.get(col.id) })),
    apply(patch, _source) {
      const problems: Problem[] = [];
      return change(() => {
        const changed: string[] = [];
        patch.forEach((p, i) => {
          if (!byId.has(p.id)) return void problems.push(problem('unknown-column', 'warning', `state[${i}]`));
          if (p.width !== undefined && !(Number.isFinite(p.width) && p.width >= 0)) {
            return void problems.push(problem('invalid-column', 'error', `state[${i}].width`));
          }
          if (p.order !== undefined && !Number.isFinite(p.order)) return void problems.push(problem('invalid-column', 'error', `state[${i}].order`));
          if (p.pinned !== undefined && p.pinned !== null && p.pinned !== 'start' && p.pinned !== 'end') {
            return void problems.push(problem('invalid-column', 'error', `state[${i}].pinned`));
          }
          // An undefined key in a patch means "unchanged", not "cleared".
          const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as ColumnState;
          user.set(p.id, { ...user.get(p.id), ...clean });
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
