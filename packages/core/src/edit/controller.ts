import type { AbortHandle, AbortSignalLike } from '../abort.js';
import type { ValueReader } from '../columns/defs.js';
import { dataKey, idOfDataKey, type RowKey } from '../ids.js';
import { emit, type GridEvent, type GridKernel, type SaveOrigin } from '../kernel.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem } from '../problems.js';
import type { LocaleCtx } from '../value/locale.js';
import { checkValue, parseInput, rulesOf, same, type CellInput, type Checked } from './input.js';

/** One cell of a request: the value kept, the value shown before it, and the row held when it left. */
export interface SaveChange<T> {
  readonly key: RowKey;
  readonly column: string;
  readonly value: unknown;
  readonly previous: unknown;
  readonly row: Readonly<T>;
}
/** One gesture's save: one generation, never reused. */
export interface SaveRequest<T> {
  readonly origin: SaveOrigin;
  readonly generation: number;
  readonly changes: readonly SaveChange<T>[];
}
/**
 * The host's save (edit-save.md 1; owner S3-O2). A value or a promise that resolves: saved. A throw or
 * a rejection: refused, every cell of the request, unless the error names some (`cells: [{ key,
 * column, reason?, code? }]`): only those are refused, the others saved. A reason or a code is read
 * from the named cell, else from the error (`reason`, a non-empty string; `code`, a string).
 */
export type SaveHandler<T> = (req: SaveRequest<T>, signal: AbortSignalLike) => unknown;
export interface EditOptions<T> {
  /** The grid's locale context: what typed text is read in. */
  readonly ctx: () => LocaleCtx;
  /** Absent: a kept value is saved at once, no request (edit-save.md 2). */
  readonly save?: SaveHandler<T>;
  /**
   * One handle per request (the DOM passes `() => new AbortController()`). Without one, `save` is handed
   * a signal that never aborts: `destroy` then only ignores the answer (cut for the budget, S3-O4).
   */
  readonly abort?: () => AbortHandle;
}
export interface CellState {
  readonly status: 'pending' | 'saving' | 'saved' | 'failed';
  readonly generation: number;
  /** A refused value, offered again when the cell is reopened (edit-save.md 15). */
  readonly refused?: unknown;
  readonly reason: string | null;
  readonly code: string | null;
}
/** What an undo or a redo gave back (the first cell takes the focus), and how many cells it skipped. */
export interface UndoResult {
  readonly cells: readonly { readonly key: RowKey; readonly column: string }[];
  readonly skipped: number;
}
export interface CommitResult {
  /** The gesture's generation; null when nothing was staged. */
  readonly generation: number | null;
  readonly staged: number;
  readonly refused: readonly { readonly key: RowKey; readonly column: string; readonly code: string }[];
}
export interface EditController<T> {
  /** The overlay the kernel's rows read (`edits.reader`): the same object for the controller's life. */
  readonly reader: ValueReader<T>;
  /** What `commit` would make of one cell, staging nothing; `read-only` for a cell that cannot be edited. */
  check(key: RowKey, column: string, input: CellInput): Checked;
  /** One gesture: refused cells skipped (codes returned), unchanged cells dropped, the rest staged as one request. */
  commit(cells: readonly { readonly key: RowKey; readonly column: string; readonly input: CellInput }[], o?: { readonly origin?: SaveOrigin; readonly source?: ChangeSource }): CommitResult;
  state(key: RowKey, column: string): CellState | undefined;
  /** Something waits to be sent or is being saved. */
  readonly dirty: boolean;
  undo(source?: ChangeSource): UndoResult | null;
  redo(source?: ChangeSource): UndoResult | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Another save (an Angular input change): requests in flight keep theirs. */
  setSave(save?: SaveHandler<T>): void;
  /** Aborts the requests in flight and ignores their answers; returns how many changes were dropped. */
  destroy(): number;
}

type Status = CellState['status'];
/** A cell's edit: what it shows while it counts, and where its saves stand. */
interface Entry {
  readonly k: RowKey;
  readonly c: string;
  /** Its key in the overlay (`cellKey`). */
  readonly id: string;
  v: unknown;
  s: Status;
  /** The newest gesture staged on the cell. */
  g: number;
  /** The gesture in flight, if any (one at a time per cell). */
  f?: number | undefined;
  /** The newest value saved (saves are serial per cell: the last answer accepted is the newest). */
  l?: { readonly v: unknown };
  /** The row object last read (followed while the change is live): a saved or refused value counts while the rows hold this one. */
  d: unknown;
  /** The refusal of the newest gesture: its value, reason and code (cleared by the next change). */
  r?: { readonly v: unknown; readonly why: string | null; readonly code: string | null } | undefined;
  /** The row was removed while its save flew: the answer will not show (edit-save.md 21). */
  x?: boolean;
}
interface Change { readonly v: unknown; readonly p: unknown }
interface Gesture { readonly g: number; readonly origin: SaveOrigin; readonly cells: Map<Entry, Change> }
/** An undo entry: per cell, its key, the value before the gesture and the value it kept. */
interface Batch { readonly g: number; cells: { readonly k: RowKey; readonly c: string; readonly e: string; readonly b: unknown; readonly a: unknown }[] }

const live = (e: Entry): boolean => e.s === 'pending' || e.s === 'saving';
/** One cell's key: the row id, length first, so no id and column can run together. */
const cellKey = (id: string, c: string): string => `${id.length}:${id}${c}`;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** The signal handed to `save` when no abort factory was given. */
const NEVER: AbortSignalLike = Object.freeze({ aborted: false });

/**
 * The edit controller of one kernel (Phase 5 step 3; ARCH §3.10 rules 1–6, ported from our own
 * `cell-edits.ts`): an overlay the rows read, never the rows written; one gesture, one generation,
 * one request; a cell's saves one at a time, a newer waiting change taking the place of an older one;
 * a refusal back to the last saved value; undo and redo as new gestures. Events go through the kernel.
 */
export function createEdits<T>(kernel: GridKernel<T>, o: EditOptions<T>): EditController<T> {
  const { columns, rows } = kernel;
  let save = o.save;
  let version = 0;
  let gen = 0;
  let dead = false;
  const cells = new Map<string, Entry>();
  const waiting = new Map<number, Gesture>();
  const flying = new Map<number, { readonly x: Gesture; readonly h: AbortHandle | undefined }>();
  const undoS: Batch[] = [];
  const redoS: Batch[] = [];
  let can = 0;
  let told = new Set<string>();

  const ev = (e: GridEvent<T>): void => emit(kernel, e);
  const tell = (problems: Problem[]): void => ev({ type: 'problems', source: 'data', problems });
  const idOf = (k: RowKey): string => idOfDataKey(k) ?? '';
  const rowOf = (k: RowKey): T | undefined => rows.row(k)?.data;
  const at = (k: RowKey, c: string): Entry | undefined => cells.get(cellKey(idOf(k), c));
  const drop = (e: Entry): unknown => cells.delete(e.id);
  /** Takes a cell out of the waiting gesture that holds it: an emptied gesture is never sent. */
  const unwait = (e: Entry): void => {
    const x = waiting.get(e.g);
    if (x?.cells.delete(e) && !x.cells.size) waiting.delete(x.g);
  };

  const reader: ValueReader<T> = {
    get version() { return version; },
    overlay: true,
    value(col, row, id) {
      const e = cells.size ? cells.get(cellKey(id, col.id)) : undefined;
      // A saved or refused value is the overlay's while the rows hold the row it was made on (lazy: a host update shows at once).
      return !e || e.x || (!live(e) && e.d !== row) ? col.read(row) : e.v;
    },
  };
  const shown = (k: RowKey, c: string): unknown => reader.value(columns.get(c)!, rowOf(k)!, idOf(k));

  const states = (source: ChangeSource, list: readonly Entry[]): void => {
    if (list.length) ev({ type: 'editStates', source, cells: [...new Set(list)].map((e) => ({ key: e.k, column: e.c })) });
  };
  const flip = (source: ChangeSource): void => {
    const canUndo = undoS.length > 0;
    const canRedo = redoS.length > 0;
    const now = +canUndo + 2 * +canRedo;
    if (now !== can) ev({ type: 'undoChanged', source, canUndo, canRedo });
    can = now;
  };
  const showNew = (cols: Iterable<string>, source: ChangeSource): void => {
    version++;
    kernel.dispatch({ type: 'edits.reader', reader, columns: [...new Set(cols)] }, source);
  };

  /**
   * A save accepted: per cell, the newest saved value; `saved` when no newer change was staged since
   * (its row is the one it holds: a live entry follows every replace of its row).
   */
  const land = (x: Gesture, e: Entry, ch: Change): void => {
    if (e.x) return void drop(e);
    e.l = { v: ch.v };
    if (e.g === x.g) e.s = 'saved';
  };

  /** Sends each waiting gesture none of whose cells is being saved, oldest first; without a save, saves it at once. */
  const pump = (): Entry[] => {
    const out: Entry[] = [];
    // A save that commits from inside adds a gesture this loop reaches too.
    for (const x of waiting.values()) {
      if ([...x.cells.keys()].some((e) => e.f !== undefined)) continue;
      waiting.delete(x.g);
      out.push(...x.cells.keys());
      const fn = save;
      if (!fn) {
        for (const [e, ch] of x.cells) land(x, e, ch);
        continue;
      }
      for (const e of x.cells.keys()) {
        e.f = x.g;
        if (e.g === x.g) e.s = 'saving';
      }
      const h = o.abort?.();
      flying.set(x.g, { x, h });
      const req: SaveRequest<T> = {
        origin: x.origin,
        generation: x.g,
        changes: [...x.cells].map(([e, ch]) => ({ key: e.k, column: e.c, value: ch.v, previous: ch.p, row: e.d as T })),
      };
      // A save that returns or throws at once settles in a microtask, as a promise would.
      void new Promise((ok) => ok(fn(req, h?.signal ?? NEVER))).then(() => settle(x.g), (err: unknown) => settle(x.g, err, true));
    }
    return out;
  };

  /** The answer to gesture g (ARCH §3.10 rules 4–5; owner S3-O2). */
  const settle = (g: number, err?: unknown, failed = false): void => {
    const fl = flying.get(g);
    if (!fl) return;
    flying.delete(g);
    const x = fl.x;
    // The cells refused: those the error names (that are in the request), else all of them.
    const named = new Map<string, unknown>();
    const list = failed && (err as { cells?: unknown } | null)?.cells;
    // A cell named by its RowKey or by the host's own row id (review R5).
    if (Array.isArray(list)) for (const n of list) for (const e of x.cells.keys()) if ((e.k === n?.key || e.k === dataKey(n?.key)) && e.c === n.column) named.set(e.id, n);
    if (failed && !named.size) for (const e of x.cells.keys()) named.set(e.id, err);
    const rolled: string[] = [];
    const fails: GridEvent<T>[] = [];
    for (const [e, ch] of x.cells) {
      const cur = at(e.k, e.c);
      if (cur?.f === g) cur.f = undefined;
      const n = named.get(e.id) as { reason?: unknown; code?: unknown } | undefined;
      if (!named.has(e.id)) {
        if (cur === e) land(x, e, ch);
        continue;
      }
      const why = str(n?.reason) || str((err as { reason?: unknown } | null)?.reason) || null;
      const code = str(n?.code) ?? str((err as { code?: unknown } | null)?.code);
      fails.push({ type: 'saveFailed', source: 'data', key: e.k, column: e.c, value: ch.v, error: err, reason: why, code });
      if (cur !== e) continue;
      if (e.x) drop(e);
      else if (e.g === g) {
        // Back to the last saved value, or to the source: never `previous`, never the rows written (rule 4).
        const col = columns.get(e.c);
        const back = e.l ? e.l.v : col?.read(e.d as T);
        if (!col || !same(col, e.v, back, o.ctx())) rolled.push(e.c);
        Object.assign(e, { s: 'failed', v: back, r: { v: ch.v, why, code } });
      }
    }
    // A refused change leaves nothing to undo (edit-save.md 15, edit-undo.md 7).
    for (const stack of [undoS, redoS]) {
      for (const b of stack) if (b.g === g) b.cells = b.cells.filter((c) => !named.has(c.e));
      stack.splice(0, stack.length, ...stack.filter((b) => b.cells.length));
    }
    if (rolled.length) showNew(rolled, 'data');
    states('data', [...x.cells.keys(), ...pump()]);
    for (const f of fails) ev(f);
    flip('data');
  };

  /** Rows replaced or gone (edit-save.md 17–21): saved and refused values of a replaced row go; a removed row's changes too. */
  const unsubscribe = rows.subscribe(() => {
    const out: Entry[] = [];
    for (const e of cells.values()) {
      const n = rowOf(e.k);
      if (!live(e)) {
        if (n !== e.d) out.push(e), drop(e);
      } else if (n !== undefined) e.d = n;
      // A source model holds one page: a row off it is only hidden (O9), its changes kept and sent.
      else if (rows.kind === 'client' && !e.x) {
        unwait(e);
        out.push(e);
        if (e.f === undefined) drop(e);
        else Object.assign(e, { x: true, g: e.f, s: 'saving' });
      }
    }
    if (out.length) states('data', [...out, ...pump()]);
  });

  /** The columns' rules, at creation and when the columns change: each wrong one told once while it stays wrong. */
  const scan = (): void => {
    const was = told;
    told = new Set();
    const ps: Problem[] = [];
    for (const { id } of columns.state()) for (const b of rulesOf(columns.get(id)!, o.ctx()).bad) {
      const path = `columns.${id}.${b}`;
      told.add(path);
      if (!was.has(path)) ps.push(problem('invalid-column', 'warning', path));
    }
    if (ps.length) tell(ps);
  };
  const unhear = kernel.subscribe((e) => {
    if (e.type !== 'columnsChanged') return;
    scan();
  });

  const check = (key: RowKey, column: string, input: CellInput): Checked => {
    if (!kernel.editable(key, column)) return { ok: false, code: 'read-only' };
    const col = columns.get(column)!;
    const ctx = o.ctx();
    const r = parseInput(col, input, ctx);
    return r.ok
      ? checkValue(col, r.value, {
          row: rowOf(key)!, app: kernel.app, ctx, current: shown(key, column),
          // Told once per column and rule until the columns change (`scan` forgets it).
          threw: (id, rule) => {
            const path = `columns.${id}.${rule}`;
            if (!told.has(path)) tell([problem('invalid-column', 'warning', path, 'threw')]);
            told.add(path);
          },
        })
      : r;
  };

  const commit: EditController<T>['commit'] = (list, opts = {}) => {
    const origin = opts.origin ?? 'edit';
    const source = opts.source ?? 'user';
    const refused: { key: RowKey; column: string; code: string }[] = [];
    const staged = new Map<string, { k: RowKey; c: string; id: string; ch: Change }>();
    for (const { key, column, input } of dead ? [] : list) {
      const r = check(key, column, input);
      if (!r.ok) {
        refused.push({ key, column, code: r.code });
        continue;
      }
      const p = shown(key, column);
      // Unchanged (Enter without a change): no request, no event, no undo entry.
      const id = cellKey(idOf(key), column);
      if (!same(columns.get(column)!, p, r.value, o.ctx())) staged.set(id, { k: key, c: column, id, ch: { v: r.value, p } });
    }
    if (!staged.size) return { generation: null, staged: 0, refused };
    const x: Gesture = { g: ++gen, origin, cells: new Map() };
    for (const { k, c, id, ch } of staged.values()) {
      const old = cells.get(id);
      const row = rowOf(k);
      // A saved or refused value whose row was replaced, or a removed row's save still flying: a new entry (no old answer lands in it).
      const e: Entry = old && !old.x && (live(old) || old.d === row) ? old : ({ k, c, id, f: old?.f } as Entry);
      // The last wins: a waiting gesture gives the cell up.
      if (e === old) unwait(e);
      Object.assign(e, { v: ch.v, s: 'pending', g: x.g, d: row, r: undefined });
      cells.set(id, e);
      x.cells.set(e, ch);
    }
    // Recorded before anyone hears of it: a listener that commits again from `cellEdited` comes after (review R1).
    if (origin !== 'undo' && origin !== 'redo') {
      if (undoS.push({ g: x.g, cells: [...x.cells].map(([e, ch]) => ({ k: e.k, c: e.c, e: e.id, b: ch.p, a: ch.v })) }) > 100) undoS.shift();
      redoS.length = 0;
    }
    waiting.set(x.g, x);
    showNew([...x.cells.keys()].map((e) => e.c), source);
    for (const [e, ch] of x.cells) ev({ type: 'cellEdited', source, key: e.k, column: e.c, value: ch.v, previous: ch.p, origin });
    states(source, [...x.cells.keys(), ...pump()]);
    flip(source);
    return { generation: x.g, staged: x.cells.size, refused };
  };

  /** Undo or redo (edit-undo.md 2–7): the batch moves even when every cell is skipped. */
  const move = (back: boolean, source: ChangeSource = 'user'): UndoResult | null => {
    const b = dead ? undefined : (back ? undoS : redoS).pop();
    if (!b) return null;
    (back ? redoS : undoS).push(b);
    // A cell skipped: its row gone, no longer editable, its value changed since, or the value refused now.
    const done = b.cells.filter((c) => check(c.k, c.c, { value: back ? c.b : c.a }).ok && same(columns.get(c.c)!, shown(c.k, c.c), back ? c.a : c.b, o.ctx()));
    commit(done.map((c) => ({ key: c.k, column: c.c, input: { value: back ? c.b : c.a } })), { origin: back ? 'undo' : 'redo', source });
    flip(source);
    return { cells: done.map((c) => ({ key: c.k, column: c.c })), skipped: b.cells.length - done.length };
  };

  kernel.dispatch({ type: 'edits.reader', reader, columns: [] }, 'api');
  scan();

  return {
    reader,
    check,
    commit,
    state(key, column) {
      const e = at(key, column);
      if (!e || e.x || (!live(e) && e.d !== rowOf(key))) return undefined;
      return { status: e.s, generation: e.g, refused: e.r?.v, reason: e.r?.why ?? null, code: e.r?.code ?? null };
    },
    get dirty() { return waiting.size + flying.size > 0; },
    undo: (source) => move(true, source),
    redo: (source) => move(false, source),
    get canUndo() { return undoS.length > 0; },
    get canRedo() { return redoS.length > 0; },
    setSave(fn) { save = fn; },
    destroy() {
      if (dead) return 0;
      dead = true;
      let n = 0;
      for (const x of waiting.values()) n += x.cells.size;
      for (const { x, h } of flying.values()) {
        n += x.cells.size;
        h?.abort('destroyed');
      }
      // The rows read the source again (a new version, the columns that had edits); nothing left to undo (review R4).
      const cols = [...cells.values()].map((e) => e.c);
      waiting.clear();
      flying.clear();
      cells.clear();
      undoS.length = redoS.length = 0;
      unsubscribe();
      unhear();
      if (cols.length) showNew(cols, 'api');
      return n;
    },
  };
}
