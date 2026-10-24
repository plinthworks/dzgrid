import { idOfDataKey, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { EditController } from '@dzgrid/core/edit';
import type { GridContext } from '../context.js';
import type { EditSeam } from '../features.js';
import type { EditMessageKey } from '../part-texts.js';
import type { Frame } from '../render/rows.js';
import { describe, setAttr } from '../render/write.js';

/** A refusal shown on a cell for 0.5 s (edit-validation.md 2): the refused value held (server) or not (local); its blink, if any. */
interface Hold { readonly v: unknown; readonly has: boolean; readonly ab: string; readonly off: () => void }
/** What the DOM adds to a cell's save state: its clocks (the core has none). */
interface Mark {
  readonly k: RowKey;
  readonly c: string;
  /** The 1.5 s check after a save (its timer's cancel). */
  saved?: (() => void) | undefined;
  hold?: Hold | undefined;
  /** The save in flight: its generation, and whether its border stands still (5 s, WCAG 2.2.2). */
  send?: { readonly g: number; still: boolean; readonly off: () => void } | undefined;
  /** Blinks started less than 1 s ago (2b): a new refusal stays still red. */
  lock?: (() => void) | undefined;
  /** The last blink's keyframes, a or b: the next uses the other, so the animation restarts without a reflow. */
  ab: string;
  /** The last refusal looked like a network cut (S7-O2). */
  net?: boolean;
}

let ids = 0;

/** The UI of the edits a grid's feature shares: sentences, descriptions, the marks' clocks and paint. */
export interface Marks {
  readonly seam: EditSeam;
  /** Polite, joined with any other in this task; `last`: after the others (the stale sentence after the save's). */
  say(text: string, last?: boolean): void;
  /** The id of a hidden element holding `text` (a cell's description), made once per text and paint. */
  desc(text: string): string;
  /** The 0.5 s refusal on a cell (limiter applied); `v` held as the cell's value while it lasts when `has`. */
  refuse(key: RowKey, column: string, v?: unknown, has?: boolean): void;
  /** One sentence in the assertive region, each emptied first (a refusal). */
  alert(text: string): void;
  /** A refusal's reason (edit-save.md 16): the host's text, else its code's, else a network cut's (S7-O2), else the generic one. */
  reason(column: string, code: string | null, why?: string | null, net?: boolean): string;
  /** The cells holding a mark or a state, by `key\ncolumn` (their rows: the only ones that can newly fail a filter). */
  readonly cells: ReadonlyMap<string, { readonly k: RowKey }>;
  /** Bumped when a cell's state changes: what `keys` gives may have changed. */
  readonly rev: number;
  paint(f: Frame<unknown>): void;
  /** After every painter of the frame: descriptions no cell uses any more are removed. */
  sweep(): void;
  destroy(): void;
}

/**
 * The marks of the save states (edit-save.md 6–16, edit-validation.md 2–2b; step04-plan « Marks »): classes
 * `dzg-cell--*` written at each paint on the mounted cells from the controller's states and the DOM's
 * clocks (saved 1.5 s, refusal 0.5 s, blink limiter 1 s, saving 5 s), so a pooled or scrolled cell shows its
 * own; descriptions by token; the save and refusal sentences.
 */
export function marks<T>(g: GridContext<unknown>, ctl: EditController<T>, border: boolean): Marks {
  const { kernel, doc, el } = g;
  const msg = (key: EditMessageKey, p?: Readonly<Record<string, string>>): string => g.msg(key, p);
  const cells = new Map<string, Mark>();
  const ck = (k: RowKey, c: string): string => `${k}\n${c}`;
  const at = (k: RowKey, c: string): Mark => {
    let x = cells.get(ck(k, c));
    if (!x) cells.set(ck(k, c), (x = { k, c, ab: 'b' }));
    return x;
  };
  const show = (keys: RowKey[]): void => (g.rowRenderer.touch(keys), g.schedule());
  /**
   * The clocks (review 1): the durations are fixed, so one first-in first-out queue per duration and one timer
   * per queue, whatever the number of cells (a paste of 100 000 cells: four timers). A clock ending runs its
   * `fn`; the rows of those ending together are shown once. Cancelled clocks are dropped when they reach the
   * head; a queue with none alive clears its timer.
   */
  const queues = new Map<number, { q: { at: number; k: RowKey; fn: () => void; off?: boolean }[]; live: number; t?: (() => void) | undefined }>();
  const arm = (Q: NonNullable<ReturnType<typeof queues.get>>): void => {
    Q.t = Q.q.length
      ? g.scope.timeout(() => {
          const now = Date.now();
          const keys: RowKey[] = [];
          while (Q.q[0] && (Q.q[0].off || Q.q[0].at <= now)) {
            const c = Q.q.shift()!;
            // Ended: marked so its cancel does nothing.
            if (!c.off) (c.off = true), Q.live--, c.fn(), keys.push(c.k);
          }
          show(keys);
          arm(Q);
        }, Q.q[0]!.at - Date.now())
      : undefined;
  };
  const later = (ms: number, k: RowKey, fn: () => void): (() => void) => {
    let Q = queues.get(ms);
    if (!Q) queues.set(ms, (Q = { q: [], live: 0 }));
    const c: { at: number; k: RowKey; fn: () => void; off?: boolean } = { at: Date.now() + ms, k, fn };
    Q.q.push(c);
    Q.live++;
    if (!Q.t) arm(Q);
    return () => {
      if (c.off) return;
      c.off = true;
      // None alive: no timer kept for nothing (a grid at rest holds none).
      if (!--Q.live) Q.t?.(), (Q.t = undefined), (Q.q.length = 0);
    };
  };

  // The hidden descriptions, one element per text.
  const box = doc.createElement('div');
  box.className = 'dzg-desc';
  box.hidden = true;
  el.root.append(box);
  const texts = new Map<string, HTMLElement>();
  const used = new Set<string>();
  const desc = (text: string): string => {
    let s = texts.get(text);
    if (!s) {
      texts.set(text, (s = doc.createElement('span')));
      s.id = `dzg-desc-${++ids}`;
      s.textContent = text;
      box.append(s);
    }
    used.add(text);
    return s.id;
  };

  // Sentences: polite through the grid's region; a refusal assertive, in a region of its own (S4: outside the grid).
  let q: string[] | null = null;
  const say = (text: string, last?: boolean): void => {
    if (!q) {
      q = [];
      queueMicrotask(() => (g.live.announce(q!.join('. ')), (q = null)));
    }
    // The same sentence once per task (two gestures starting together: « Saving » once).
    if (q.includes(text)) return;
    if (last) q.push(text);
    else q.unshift(text);
  };
  const loud = doc.createElement('div');
  loud.className = 'dzg-live';
  setAttr(loud, 'aria-live', 'assertive');
  setAttr(loud, 'aria-atomic', 'true');
  el.root.append(loud);
  // One refusal sentence after the other, each emptied first so the same sentence twice is read twice.
  const loudQ: string[] = [];
  const shout = (text: string): void => {
    if (loudQ.push(text) > 1) return;
    const next = (): void => {
      loud.textContent = '';
      g.scope.timeout(() => {
        loud.textContent = loudQ.shift()!;
        if (loudQ.length) g.scope.timeout(next, 50);
      }, 50);
    };
    next();
  };

  /** A refusal's reason (edit-save.md 16): the host's text, else its code's, else the generic one. */
  const reason = (column: string, code: string | null, why?: string | null, net?: boolean): string => {
    if (why) return why;
    if (!code || code === 'network') return msg(code || net ? 'edit.reasonNetwork' : 'edit.reasonUnknown');
    const col = g.columns.get(column);
    const fmt = (v: unknown): string => {
      try {
        const x = col!.codec.coerce(v, g.ctx);
        return x === null ? '' : col!.codec.format(x, g.ctx);
      } catch {
        return '';
      }
    };
    const key = `validation.${code}` as EditMessageKey;
    const r = col?.def.edit as { min?: unknown; max?: unknown } | undefined;
    return msg(g.settings.messages.text[key] === undefined ? 'validation.invalid' : key, { min: fmt(r?.min), max: fmt(r?.max) });
  };

  const refuse = (k: RowKey, c: string, v?: unknown, has = false): void => {
    const x = at(k, c);
    x.hold?.off();
    // One animation per cell, never two; a blink only 1 s after the last one began (≤ 3 flashes a second).
    const blink = !x.lock;
    if (blink) (x.ab = x.ab === 'a' ? 'b' : 'a'), (x.lock = later(1000, k, () => (x.lock = undefined)));
    const h: Hold = { v, has, ab: blink ? x.ab : '', off: later(500, k, () => x.hold === h && (x.hold = undefined)) };
    x.hold = h;
    show([k]);
  };

  // The gestures said (review 3: a gesture that waited behind another still says « Saving »), and refused (review 2).
  // One set: a gesture's « Saving » by its generation, its refusal by the generation negated.
  const said = new Set<number>();
  let rev = 0;
  const off = kernel.subscribe((e) => {
    if (e.type === 'editStates') {
      rev++;
      for (const { key, column } of e.cells) {
        const x = at(key, column);
        const s = ctl.state(key, column);
        const st = s?.status;
        // Any new state ends what showed before: the hold, the check, the border.
        if (st !== 'failed') x.hold?.off(), (x.hold = undefined);
        x.saved?.();
        x.saved = st === 'saved' ? later(1500, key, () => (x.saved = undefined)) : undefined;
        if (st !== 'saving') x.send?.off(), (x.send = undefined);
        else if (x.send?.g !== s!.generation) {
          x.send?.off();
          const n = { g: s!.generation, still: false, off: later(5000, key, () => (n.still = true)) };
          x.send = n;
          // Once per gesture, not per cell.
          if (!said.has(n.g)) said.add(n.g), say(msg('edit.saving'));
        }
      }
      show(e.cells.map((c) => c.key));
    } else if (e.type === 'saveFailed') {
      // The core rolled back already: the refused value stays shown for the 0.5 s (Q9), then the last saved.
      const s = ctl.state(e.key, e.column);
      // A row the browser's rows no longer have: the host hears it (saveFailed), not the user (edit-save.md 21). A
      // server page's row only left the page (O9): said.
      if (g.rows.kind === 'client' && !g.rows.row(e.key)) return;
      // A cut (O11 note, S7-O2; review 2): what the browsers' fetch throws (a TypeError saying fetch, network or « load
      // failed »), a TimeoutError or a NetworkError, or the grid's window offline; an app's own TypeError is not one.
      // The host's reason and code win; its code `network` says it outright.
      const x = e.error as Error | null;
      const net = (x?.name === 'TypeError' && /fetch|network|load failed/i.test(x.message)) || /^(Timeout|Network)Error$/.test(x?.name as string) || (g.win as Window).navigator.onLine === false;
      // One sentence per refused gesture (its generation; a cell no longer failed counts alone): the first cell's column.
      if (s?.status === 'failed') {
        at(e.key, e.column).net = net;
        refuse(e.key, e.column, e.value, true);
        if (said.has(-s.generation)) return;
        said.add(-s.generation);
      }
      shout(msg('edit.saveRefused', { column: g.columns.get(e.column)?.def.header ?? e.column, reason: reason(e.column, e.code, e.reason, net) }));
    }
  });

  /** A failed cell's words (its description and its tooltip); null: not failed. */
  const failed = (k: RowKey, c: string): string | null => {
    const s = ctl.state(k, c);
    return s?.status === 'failed' ? msg('edit.failedMark', { reason: reason(c, s.code, s.reason, cells.get(ck(k, c))?.net) }) : null;
  };
  /** What a cell shows: its classes (without the prefix) and its description. */
  const want = (x: Mark | undefined): [string, string | null] => {
    if (!x) return ['', null];
    if (x.hold) return [x.hold.ab ? `refused blink-${x.hold.ab}` : 'refused', null];
    const s = ctl.state(x.k, x.c);
    const st = s?.status;
    if (st === 'saving') return [!border || x.send?.still ? 'saving still' : 'saving', desc(msg('edit.saving'))];
    if (st === 'failed') return ['failed', desc(failed(x.k, x.c)!)];
    return [st === 'pending' ? 'pending' : x.saved ? 'saved' : '', null];
  };
  const drawn = new Map<HTMLElement, { t: string; d: string | null }>();
  const draw = (cell: HTMLElement, t: string, d: string | null): void => {
    const m = drawn.get(cell);
    if (m?.t !== t) {
      for (const c of m?.t.split(' ') ?? []) if (c) cell.classList.remove(`dzg-cell--${c}`);
      for (const c of t.split(' ')) if (c) cell.classList.add(`dzg-cell--${c}`);
    }
    if ((m?.d ?? null) !== d) {
      if (m?.d) describe(cell, m.d, false);
      if (d) describe(cell, d, true);
    }
    if (t || d) drawn.set(cell, { t, d });
    else drawn.delete(cell);
  };

  return {
    seam: {
      read: (col: ResolvedColumn<unknown>, row: unknown, key: RowKey): unknown => {
        const h = cells.size ? cells.get(ck(key, col.id))?.hold : undefined;
        return h?.has ? h.v : ctl.reader.value(col as never, row as never, idOfDataKey(key) ?? '');
      },
      tip: failed,
    },
    say,
    desc,
    refuse,
    alert: shout,
    reason,
    cells,
    get rev() { return rev; },
    paint() {
      used.clear();
      // A cell gone from the page (a pooled one) loses its marks; a cell whose save is over, its record.
      for (const [c] of drawn) if (!c.isConnected) draw(c, '', null);
      for (const [id, x] of cells) if (!x.saved && !x.hold && !x.send && !x.lock && !ctl.state(x.k, x.c)) cells.delete(id);
      if (!cells.size && !drawn.size) return;
      g.rowRenderer.forEach((key, v) => {
        for (const [c, cv] of v.cells) {
          const [t, d] = want(cells.get(ck(key, c)));
          if (t || d || drawn.has(cv.el)) draw(cv.el, t, d);
        }
      });
    },
    sweep() {
      for (const [t, s] of texts) if (!used.has(t)) s.remove(), texts.delete(t);
    },
    destroy() {
      off();
      box.remove();
      loud.remove();
    },
  };
}
