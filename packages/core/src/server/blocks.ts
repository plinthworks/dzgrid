/**
 * The block cache and its scheduler (Phase 8 D5–D6, infinite-scroll.md): which blocks of rows a list loaded in blocks
 * holds, which it asks, in what order, and which it lets go. No request, no gate, no clock here: the model says what
 * the window is and what answered; the store calls `ask` and `cancel` back. Internal: `@dzgrid/core/infinite` (and the
 * server-side model to come) carry it.
 */

/** `waiting`: wanted, not asked; `asked`: a request runs (rows kept while asked again); `held`: rows; `failed`. */
export type BlockState = 'waiting' | 'asked' | 'held' | 'failed';

export interface Block<R> {
  readonly n: number;
  state: BlockState;
  /** The rows, by place in the block; null before the first answer, or after a failure. */
  rows: readonly R[] | null;
  /** The store's tick when last in the window (or kept): the least recent goes first. */
  seen: number;
  /** Asked again when next shown (a refresh, a transaction): dropped first. */
  stale: boolean;
}

export interface BlockStoreOptions {
  /** At most this many blocks hold rows (the window may hold more). */
  readonly max: number;
  /** Blocks asked past the window, in the scroll's direction. */
  readonly ahead: number;
  /** Requests running at once. */
  readonly concurrency: number;
  ask(n: number): void;
  cancel(n: number): void;
  /** A block let go (its rows are no longer shown). */
  dropped(b: Block<unknown>): void;
}

export interface BlockStore<R> {
  readonly blocks: ReadonlyMap<number, Block<R>>;
  /**
   * The blocks the window touches (`lo`..`hi`), those to keep besides (the focused row's), and how many blocks the list
   * may have (`limit`, Infinity while unknown): what lacks is asked, nearest first, what left is let go.
   */
  want(lo: number, hi: number, keep: readonly number[], limit: number): void;
  /** A block's rows arrived: held, then the cache trimmed to `max` and the next asked. */
  answered(n: number, rows: readonly R[]): void;
  /** A block's request failed: rows kept if it had some (asked again), else the block fails; `hard`: its rows let go too. */
  failed(n: number, hard?: boolean): void;
  /** Asks a block again now, its rows kept (a refresh): first in line. */
  again(n: number): void;
  /** Lets one block go (a request aborted, a total that shrank). */
  drop(n: number): void;
  /** Every block marked to be asked again when shown, dropped first. */
  stale(): void;
  /** Everything let go: a new epoch. */
  clear(): void;
  /** A held block may be let go now (not in the window, not kept, not running). */
  pinned(n: number): boolean;
  readonly running: ReadonlySet<number>;
  readonly diagnostics: { readonly held: number; readonly asked: number; readonly evicted: number; readonly max: number };
}

export function createBlockStore<R>(o: BlockStoreOptions): BlockStore<R> {
  const blocks = new Map<number, Block<R>>();
  const running = new Set<number>();
  let queue: number[] = [];
  let pins = new Set<number>();
  let tick = 0;
  let asked = 0;
  let evicted = 0;
  let max = 0;
  let lastLo = 0;
  let dir = 1;

  const holding = (): number => {
    let h = 0;
    for (const b of blocks.values()) if (b.rows) h++;
    return h;
  };
  const drop = (n: number, count = true): void => {
    const b = blocks.get(n);
    if (!b) return;
    blocks.delete(n);
    queue = queue.filter((x) => x !== n);
    if (running.delete(n)) o.cancel(n);
    if (b.rows) {
      if (count) evicted++;
      o.dropped(b as Block<unknown>);
    }
  };
  /** Above `max`: the least recently seen held block that is not pinned nor running (stale ones first) goes. */
  const trim = (): void => {
    let h = holding();
    while (h > o.max) {
      let pick: Block<R> | null = null;
      for (const b of blocks.values()) {
        if (!b.rows || pins.has(b.n) || running.has(b.n)) continue;
        if (!pick || (b.stale ? -1 : b.seen) < (pick.stale ? -1 : pick.seen)) pick = b;
      }
      if (!pick) break;
      drop(pick.n);
      h--;
    }
    if (h > max) max = h;
  };
  const pump = (): void => {
    while (running.size < o.concurrency && queue.length) {
      const n = queue.shift()!;
      const b = blocks.get(n);
      if (!b || b.state !== 'waiting') continue;
      b.state = 'asked';
      running.add(n);
      asked++;
      o.ask(n);
    }
  };

  return {
    blocks,
    running,
    want(lo, hi, keep, limit) {
      if (lo !== lastLo) dir = lo > lastLo ? 1 : -1;
      lastLo = lo;
      tick++;
      // The kept ones first (the focused row: where the user looks), the window in the scroll's direction, then ahead.
      const order: number[] = [];
      for (let n = lo; n <= hi && n < limit; n++) order.push(n);
      if (dir < 0) order.reverse();
      order.unshift(...keep.filter((n) => n >= lo && n <= hi && n < limit));
      for (let k = 1; k <= o.ahead; k++) {
        const n = dir > 0 ? hi + k : lo - k;
        if (n >= 0 && n < limit) order.push(n);
      }
      pins = new Set([...order, ...keep]);
      order.splice(0, order.length, ...new Set(order));
      for (const n of keep) {
        const b = blocks.get(n);
        if (b) b.seen = tick;
      }
      const next: number[] = [];
      for (const n of order) {
        let b = blocks.get(n);
        if (b) b.seen = tick;
        if (!b || (b.stale && b.state === 'held')) {
          if (!b) blocks.set(n, (b = { n, state: 'waiting', rows: null, seen: tick, stale: false }));
          else b.state = 'waiting';
          next.push(n);
        } else if (b.state === 'waiting') next.push(n);
      }
      // A failed block out of view is forgotten: shown again, it is asked again.
      for (const b of [...blocks.values()]) if (b.state === 'failed' && !pins.has(b.n)) blocks.delete(b.n);
      // A waiting block that left the window is never asked (one with rows keeps them, stale).
      for (const n of queue) {
        if (next.includes(n)) continue;
        const b = blocks.get(n)!;
        if (b.rows) b.state = 'held';
        else blocks.delete(n);
      }
      queue = next;
      // Two newer blocks waiting: requests running for blocks out of the window give their places (farthest first), as many as wait.
      if (queue.length >= o.concurrency) {
        const out = [...running].filter((n) => !pins.has(n)).sort((a, b) => Math.abs(b - lo) - Math.abs(a - lo));
        for (const n of out) {
          if (queue.length <= o.concurrency - running.size) break;
          const b = blocks.get(n)!;
          running.delete(n);
          o.cancel(n);
          if (b.rows) b.state = 'held';
          else blocks.delete(n);
        }
      }
      pump();
      trim();
    },
    answered(n, rows) {
      running.delete(n);
      const b = blocks.get(n);
      if (b) {
        b.state = 'held';
        b.rows = rows;
        b.stale = false;
        if (pins.has(n)) b.seen = tick;
      }
      trim();
      pump();
    },
    failed(n, hard) {
      if (running.delete(n) && hard) o.cancel(n);
      const b = blocks.get(n);
      if (b && hard && b.rows) {
        o.dropped(b as Block<unknown>);
        b.rows = null;
      }
      if (b) b.state = b.rows ? 'held' : 'failed';
      pump();
    },
    again(n) {
      let b = blocks.get(n);
      if (!b) blocks.set(n, (b = { n, state: 'waiting', rows: null, seen: tick, stale: false }));
      if (running.has(n)) {
        running.delete(n);
        o.cancel(n);
      }
      b.state = 'waiting';
      b.stale = false;
      queue = [n, ...queue.filter((x) => x !== n)];
      pump();
    },
    drop: (n) => drop(n),
    stale() {
      for (const b of blocks.values()) if (b.rows) b.stale = true;
    },
    clear() {
      for (const n of [...blocks.keys()]) drop(n, false);
      queue = [];
      pins = new Set();
      lastLo = 0;
      dir = 1;
    },
    pinned: (n) => pins.has(n),
    get diagnostics() {
      return { held: holding(), asked, evicted, max };
    },
  };
}
