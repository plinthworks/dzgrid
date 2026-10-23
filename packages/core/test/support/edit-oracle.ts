/**
 * The edit controller's oracle (Phase 5 step 3, step03-plan.md « Tests first » 5–6): what each cell
 * shows and which requests leave, written from the sheets' rules (edit-save.md 1–5, 13–21,
 * edit-undo.md 1–7; ARCH §3.10 rules 1–6), cell by cell and gesture by gesture, without the
 * controller's code. Cells are `row.column` strings; rows are told replaced by a token that changes
 * with each new row object.
 */
export type Fate = 'live' | 'ok' | 'failed';

/** What one cell holds since its entry was born (a stage over nothing, or over a dead entry). */
interface Entry {
  /** The value of the newest gesture of this cell that the host saved, since the entry's birth. */
  lastOk?: { readonly v: unknown };
  latest: { g: number; v: unknown; fate: Fate; why?: string | null; code?: string | null };
  /** The row token the entry last read (stage, a save accepted, a row replaced while live). */
  tok: number;
  /** The gesture it was born with: an answer to an older one (a save still flying when it was born) never lands in it. */
  born: number;
  /** The row was removed while its save flew: shows the source; dropped at the answer. */
  gone?: boolean;
  dead?: boolean;
}

export interface Gesture {
  readonly g: number;
  readonly origin: string;
  /** cell → [value, previous], in the order given. */
  readonly cells: Map<string, [unknown, unknown]>;
  state: 'waiting' | 'flying' | 'done';
}

export interface Batch {
  readonly g: number;
  cells: { cell: string; before: unknown; after: unknown }[];
}

const blank = (v: unknown) => v === null || v === undefined || v === '';
export const same = (a: unknown, b: unknown) => Object.is(a, b) || (blank(a) && blank(b));

export class EditOracle {
  entries = new Map<string, Entry>();
  gestures: Gesture[] = [];
  /** What the oracle expects `save` to have been asked, in order. */
  sent: { g: number; origin: string; changes: [string, unknown, unknown][] }[] = [];
  undo: Batch[] = [];
  redo: Batch[] = [];
  gen = 0;

  constructor(
    /** The source value of a cell and its row's token; undefined when the row is not held. */
    readonly src: (cell: string) => { v: unknown; tok: number } | undefined,
    /** A removed row (client): its waiting changes are cancelled. A source model only pages. */
    readonly client: boolean,
    readonly hasSave: () => boolean,
  ) {}

  shown(cell: string): unknown {
    const s = this.src(cell);
    const e = this.entries.get(cell);
    if (!e || e.dead || e.gone) return s?.v;
    if (e.latest.fate === 'live') return e.latest.v;
    if (!s || e.tok !== s.tok) return s?.v;
    if (e.latest.fate === 'ok') return e.latest.v;
    return e.lastOk ? e.lastOk.v : s.v;
  }

  status(cell: string): string | undefined {
    const e = this.entries.get(cell);
    if (!e || e.dead || e.gone) return undefined;
    const s = this.src(cell);
    if (e.latest.fate === 'live') return this.flying(cell) === e.latest.g ? 'saving' : 'pending';
    if (!s || e.tok !== s.tok) return undefined;
    return e.latest.fate === 'ok' ? 'saved' : 'failed';
  }

  /** A refused cell's reason and code, while it shows its refusal. */
  refusal(cell: string): [string | null, string | null] | undefined {
    const e = this.entries.get(cell);
    return this.status(cell) === 'failed' ? [e!.latest.why ?? null, e!.latest.code ?? null] : undefined;
  }

  /** The generation in flight for a cell, if any. */
  flying(cell: string): number | undefined {
    return this.gestures.find((x) => x.state === 'flying' && x.cells.has(cell))?.g;
  }

  /** One gesture: refused inputs already left out by the caller; unchanged cells dropped here. Returns the generation or null. */
  /** `during`: what a listener does while hearing the gesture's first `cellEdited` (the gesture recorded, not yet sent). */
  commit(changes: [string, unknown][], origin = 'edit', during?: () => void): number | null {
    const staged = new Map<string, [unknown, unknown]>();
    for (const [cell, v] of changes) {
      const before = this.shown(cell);
      if (!same(before, v)) staged.set(cell, [v, before]);
      else staged.delete(cell);
    }
    if (!staged.size) return null;
    const g = ++this.gen;
    for (const [cell, [v]] of staged) {
      // The last wins: a waiting gesture gives the cell up.
      for (const x of this.gestures) if (x.state === 'waiting') x.cells.delete(cell);
      const s = this.src(cell)!;
      let e = this.entries.get(cell);
      if (!e || e.dead || e.gone) {
        e = { latest: { g, v, fate: 'live' }, tok: s.tok, born: g };
        this.entries.set(cell, e);
      }
      e.latest = { g, v, fate: 'live' };
      e.tok = s.tok;
    }
    this.gestures = this.gestures.filter((x) => x.state !== 'waiting' || x.cells.size > 0);
    if (origin !== 'undo' && origin !== 'redo') {
      this.undo.push({ g, cells: [...staged].map(([cell, [after, before]]) => ({ cell, before, after })) });
      if (this.undo.length > 100) this.undo.shift();
      this.redo = [];
    }
    // Without a save function a gesture is saved at once, but still after the cell's save in flight (serial per cell).
    this.gestures.push({ g, origin, cells: staged, state: 'waiting' });
    during?.();
    this.pump();
    return g;
  }

  /** Sends every waiting gesture none of whose cells is in flight, oldest first. */
  pump(): void {
    for (const x of this.gestures) {
      if (x.state !== 'waiting') continue;
      if ([...x.cells.keys()].some((c) => this.flying(c) !== undefined)) continue;
      x.state = 'flying';
      if (this.hasSave()) this.sent.push({ g: x.g, origin: x.origin, changes: [...x.cells].map(([c, [v, p]]) => [c, v, p]) });
      else this.settle(x.g);
    }
  }

  /** The answer to gesture g: `refused` the cells refused (all of them, some, or none for a success), with their reason and code. */
  settle(g: number, refused: ReadonlyMap<string, [string | null, string | null]> = new Map()): void {
    const x = this.gestures.find((y) => y.g === g && y.state === 'flying')!;
    x.state = 'done';
    for (const [cell, [v]] of x.cells) {
      const e = this.entries.get(cell);
      if (!e || e.dead || g < e.born) continue;
      if (e.gone) {
        if (e.latest.g === g) this.entries.delete(cell);
        continue;
      }
      if (refused.has(cell)) {
        if (e.latest.g === g) Object.assign(e.latest, { fate: 'failed', why: refused.get(cell)![0], code: refused.get(cell)![1] });
      } else {
        e.lastOk = { v };
        if (e.latest.g === g) {
          e.latest.fate = 'ok';
          e.tok = this.src(cell)?.tok ?? e.tok;
        }
      }
    }
    if (refused.size) {
      for (const stack of [this.undo, this.redo]) {
        for (const b of stack) if (b.g === g) b.cells = b.cells.filter((c) => !refused.has(c.cell));
        const kept = stack.filter((b) => b.cells.length > 0);
        stack.splice(0, stack.length, ...kept);
      }
    }
    this.gestures = this.gestures.filter((y) => y.state !== 'done');
    this.pump();
  }

  /** Rows replaced (a host update, a reload, a server answer) or gone: told after the model changed. */
  rowsChanged(cells: readonly string[]): void {
    for (const cell of cells) {
      const e = this.entries.get(cell);
      if (!e || e.dead) continue;
      const s = this.src(cell);
      if (e.latest.fate !== 'live') {
        if (!s || s.tok !== e.tok) e.dead = true;
      } else if (s) e.tok = s.tok;
      else if (this.client) {
        // Removed: its waiting change leaves its gesture; a save in flight is only waited for.
        for (const x of this.gestures) if (x.state === 'waiting') x.cells.delete(cell);
        const f = this.flying(cell);
        if (f !== undefined) {
          e.gone = true;
          e.latest = { ...e.latest, g: f };
        } else this.entries.delete(cell);
      }
    }
    this.gestures = this.gestures.filter((x) => x.state !== 'waiting' || x.cells.size > 0);
    this.pump();
  }

  /** Undo or redo: the cells it can give back (held, editable, still showing the gesture's value). */
  move(dir: 'undo' | 'redo', editable: (cell: string) => boolean): { cells: string[]; skipped: number } | null {
    const from = dir === 'undo' ? this.undo : this.redo;
    const b = from.pop();
    if (!b) return null;
    const changes: [string, unknown][] = [];
    let skipped = 0;
    for (const c of b.cells) {
      const want = dir === 'undo' ? c.after : c.before;
      if (!this.src(c.cell) || !editable(c.cell) || !same(this.shown(c.cell), want)) skipped++;
      else changes.push([c.cell, dir === 'undo' ? c.before : c.after]);
    }
    (dir === 'undo' ? this.redo : this.undo).push(b);
    this.commit(changes, dir);
    return { cells: changes.map(([c]) => c), skipped };
  }
}
