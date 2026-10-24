/**
 * The DOM's editing oracle (Phase 5 step 7, step07-plan.md « Tests first » 8): what each mounted cell shows — its
 * text, its mark tokens, its description — what the open field holds, the assertive sentences and the tooltip, written
 * from the sheets (edit-save.md 6–21, edit-validation.md 2–7, editing.md, edit-reapply.md), never from the DOM code.
 * The values, the statuses and the requests are the core's oracle's (`EditOracle`, step 3); this layer adds the
 * DOM's clocks (saved 1.5 s, refusal 0.5 s and its blink limiter 1 s, saving still after 5 s), the field, the
 * sentences. Cells are `id.column` strings.
 */
import { EditOracle } from '../../../core/test/support/edit-oracle.js';

interface Clock {
  savedUntil: number;
  /** A refusal shown 0.5 s: its value (`has`: the server's refused value; a local refusal shows the cell's), its blink. */
  hold: { until: number; v: unknown; has: boolean; ab: string } | null;
  lockUntil: number;
  ab: string;
  /** The gesture whose border runs, and since when. */
  gen: number | null;
  start: number;
  /** The last refusal looked like a network cut. */
  net: boolean;
}
type Snap = string;

export interface Words {
  readonly header: (col: string) => string;
  /** A refusal code's text for a column (`validation.<code>`). */
  readonly code: (col: string, code: string) => string;
  readonly unknown: string;
  readonly network: string;
  readonly failed: (reason: string) => string;
  readonly saveRefused: (col: string, reason: string) => string;
  readonly refused: (col: string, reason: string) => string;
  readonly dropped: (col: string) => string;
  readonly removed: string;
}

export class EditDomOracle {
  readonly core: EditOracle;
  now = 0;
  readonly clocks = new Map<string, Clock>();
  editor: { cell: string; text: string } | null = null;
  /** The assertive sentences, in order. */
  readonly loud: string[] = [];
  /** Refused gestures already said (once per gesture). */
  private readonly told = new Set<number>();

  constructor(
    readonly src: (cell: string) => { v: unknown; tok: number } | undefined,
    readonly client: boolean,
    readonly words: Words,
  ) {
    this.core = new EditOracle(src, client, () => true);
  }

  clock(cell: string): Clock {
    let c = this.clocks.get(cell);
    if (!c) this.clocks.set(cell, (c = { savedUntil: 0, hold: null, lockUntil: 0, ab: 'b', gen: null, start: 0, net: false }));
    return c;
  }

  private snap(): Map<string, Snap> {
    const m = new Map<string, Snap>();
    for (const cell of new Set([...this.core.entries.keys(), ...this.clocks.keys()])) m.set(cell, `${this.core.status(cell)}|${this.core.flying(cell)}|${this.core.entries.get(cell)?.latest.g}`);
    return m;
  }
  /** What a cell's state change does to its clocks (edit-save.md 6–13): told for `cells` and every cell that changed. */
  private touched(before: Map<string, Snap>, cells: Iterable<string>): void {
    const after = this.snap();
    const all = new Set(cells);
    // A cell absent from a snapshot had no state: the same as one with none.
    const none = 'undefined|undefined|undefined';
    for (const [c, s] of after) if ((before.get(c) ?? none) !== s) all.add(c);
    for (const [c, s] of before) if (!after.has(c) && s !== none) all.add(c);
    for (const cell of all) {
      const x = this.clock(cell);
      const st = this.core.status(cell);
      if (st !== 'failed') x.hold = null;
      x.savedUntil = st === 'saved' ? this.now + 1500 : 0;
      if (st !== 'saving') x.gen = null;
      else {
        const f = this.core.flying(cell)!;
        if (x.gen !== f) (x.gen = f), (x.start = this.now);
      }
    }
  }

  /**
   * At a paint: a cell with nothing left (no state, no clock running) is forgotten, its blink keyframes back to the
   * first (which pair a blink uses is not seen; kept so the tokens compare).
   */
  idle(): void {
    for (const [cell, x] of this.clocks) {
      if (this.core.status(cell) || this.now < x.savedUntil || (x.hold && this.now < x.hold.until) || this.now < x.lockUntil || x.gen !== null) continue;
      this.clocks.delete(cell);
    }
  }

  /** A refusal on a cell (limiter: a blink only 1 s after the last one began). */
  refuse(cell: string, v?: unknown, has = false): void {
    const x = this.clock(cell);
    const blink = this.now >= x.lockUntil;
    if (blink) (x.ab = x.ab === 'a' ? 'b' : 'a'), (x.lockUntil = this.now + 1000);
    x.hold = { until: this.now + 500, v, has, ab: blink ? x.ab : '' };
  }

  commit(changes: [string, unknown][], origin = 'edit'): number | null {
    const b = this.snap();
    const g = this.core.commit(changes, origin);
    // Only the cells staged (an unchanged value stages nothing, tells nothing).
    this.touched(b, g === null ? [] : changes.map(([c]) => c).filter((c) => this.core.entries.get(c)?.latest.g === g));
    return g;
  }
  move(dir: 'undo' | 'redo', editable: (cell: string) => boolean): ReturnType<EditOracle['move']> {
    const b = this.snap();
    const g = this.core.gen;
    const r = this.core.move(dir, editable);
    this.touched(b, this.core.gen === g ? [] : (r?.cells ?? []).filter((c) => this.core.entries.get(c)?.latest.g === this.core.gen));
    return r;
  }
  /** Before an action that may change the rows: the states as they were (a cell's status reads the rows). */
  begin(): void {
    this.pre = this.snap();
  }
  private pre: Map<string, Snap> | null = null;
  rowsChanged(): void {
    const b = this.pre ?? this.snap();
    this.core.rowsChanged([...this.core.entries.keys()]);
    this.touched(b, []);
  }
  /** The answer to the `i`th request: `refused` its cells refused, with reason, code and whether a network cut. */
  settle(i: number, refused: Map<string, { why: string | null; code: string | null; net: boolean }>, held: (cell: string) => boolean): void {
    const req = this.core.sent[i]!;
    const b = this.snap();
    const before = new Map(req.changes.map(([c]) => [c, this.core.entries.get(c)]));
    this.core.settle(req.g, new Map([...refused].map(([c, r]) => [c, [r.why, r.code]])));
    this.touched(b, req.changes.map(([c]) => c));
    // The refusals, in the request's order (edit-save.md 13, 16, 21).
    for (const [cell, v] of req.changes.map(([c, x]) => [c, x] as const)) {
      const r = refused.get(cell);
      if (!r) continue;
      const st = this.core.status(cell);
      if (st === 'failed') this.clock(cell).net = r.net, this.refuse(cell, v, true);
      // A row the browser's rows no longer have: the host hears it, not the user.
      if (this.client && !held(cell)) continue;
      void before;
      const g = this.core.entries.get(cell)?.latest.g;
      if (st === 'failed') {
        if (this.told.has(g!)) continue;
        this.told.add(g!);
      }
      this.loud.push(this.words.saveRefused(col(cell), this.reason(cell, r)));
    }
  }
  reason(cell: string, r: { why: string | null; code: string | null; net: boolean }): string {
    return r.why || (r.code ? this.words.code(col(cell), r.code) : r.net ? this.words.network : this.words.unknown);
  }
  /** The words of a failed cell (its description and its tooltip), or null. */
  failedText(cell: string): string | null {
    const r = this.core.refusal(cell);
    return r ? this.words.failed(this.reason(cell, { why: r[0], code: r[1], net: this.clock(cell).net })) : null;
  }

  /** The value a cell shows now (its refused value during the 0.5 s). */
  value(cell: string): unknown {
    const h = this.clocks.get(cell)?.hold;
    return h && this.now < h.until && h.has ? h.v : this.core.shown(cell);
  }
  /** The mark tokens a cell carries now, sorted. */
  tokens(cell: string): string {
    const x = this.clocks.get(cell);
    const h = x?.hold && this.now < x.hold.until ? x.hold : null;
    const st = this.core.status(cell);
    let t = '';
    if (h) t = h.ab ? `blink-${h.ab} refused` : 'refused';
    else if (st === 'saving') t = this.now - x!.start >= 5000 ? 'saving still' : 'saving';
    else if (st === 'failed') t = 'failed';
    else if (st === 'pending') t = 'pending';
    else if (x && this.now < x.savedUntil) t = 'saved';
    return t;
  }
  /** The description a cell carries now (the saving sentence, a failed reason), or ''. */
  desc(cell: string, saving: string): string {
    const x = this.clocks.get(cell);
    if (x?.hold && this.now < x.hold.until) return '';
    const st = this.core.status(cell);
    return st === 'saving' ? saving : st === 'failed' ? this.failedText(cell)! : '';
  }
}

export const col = (cell: string): string => cell.slice(cell.lastIndexOf('.') + 1);
export const idOfCell = (cell: string): string => cell.slice(0, cell.lastIndexOf('.'));
