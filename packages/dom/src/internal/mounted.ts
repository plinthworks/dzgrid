import type { GridContext } from '../context.js';
import type { Part, PartBase, PartHandle } from '../part.js';

/**
 * One part in one host (a header's label, the overlay, the tooltip, a floating filter cell, a
 * footer part), shared by the entries that draw parts through `@dzgrid/dom/internal` (one copy
 * for them all, step 17; the base never imports it): mounted once, updated
 * only when what it sees changed — its context compared value by value, functions aside, and
 * the messages — cleared when it goes. A part that throws is destroyed, its host given back
 * to the grid's own text, the error reported; it is not tried again until what it would see
 * changes. The cells keep their own, faster path (`render/rows.ts`).
 */
export interface Mounted<C extends PartBase> {
  /** Where it is drawn (null: nowhere). */
  readonly host: HTMLElement | null;
  /** `part` drawing `host`, with what every part gets and `own`: true when it drew; false, the host is the grid's. */
  set(host: HTMLElement, part: Part<C> | null, own: Omit<C, keyof PartBase>): boolean;
  /** Asks the part to take the focus: true when it did. */
  focus(): boolean;
  /** Destroys the part and empties its host. */
  clear(): void;
}

/** A closure, not a class: its state minifies. */
export function mounted<C extends PartBase>(g: GridContext<unknown>): Mounted<C> {
  let part: Part<C> | null = null;
  let handle: PartHandle<C> | null = null;
  let host: HTMLElement | null = null;
  let seen: readonly unknown[] = [];
  /** The last mount or update went well. */
  let ok = false;
  // The part destroyed (a `destroy` that throws is reported), its host emptied.
  const drop = (): void => {
    const h = handle;
    handle = null;
    try {
      h?.destroy?.();
    } catch (err) {
      g.report(err);
    }
    host?.replaceChildren();
  };
  const clear = (): void => {
    drop();
    part = host = null;
    seen = [];
  };
  return {
    get host() {
      return host;
    },
    set(at, p, own) {
      if (p !== part || at !== host) clear();
      if (!p) return false;
      const c = { ...g.partBase!, ...own } as C;
      const next = [...Object.values(c).filter((v) => typeof v !== 'function'), g.settings.messages];
      if (next.length === seen.length && next.every((v, i) => Object.is(v, seen[i]))) return ok;
      part = p;
      host = at;
      seen = next;
      try {
        if (handle) handle.update?.(c);
        else {
          at.replaceChildren();
          handle = p.mount(at, c);
        }
        return (ok = true);
      } catch (err) {
        drop();
        g.report(err);
        return (ok = false);
      }
    },
    focus: () => !!handle?.focus?.(),
    clear,
  };
}
