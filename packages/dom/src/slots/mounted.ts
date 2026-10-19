import type { GridContext } from '../context.js';
import type { Part, PartBase, PartHandle } from '../part.js';

/**
 * One part in one host (a header's label, the overlay, the tooltip): mounted once, updated
 * only when what it sees changed — its context compared value by value, functions aside, and
 * the messages — cleared when it goes. A part that throws is destroyed, its host given back
 * to the grid's own text, the error reported; it is not tried again until what it would see
 * changes. The cells keep their own, faster path (`render/rows.ts`).
 */
export class Mounted<C extends PartBase> {
  #part: Part<C> | null = null;
  #handle: PartHandle<C> | null = null;
  #host: HTMLElement | null = null;
  #seen: readonly unknown[] = [];
  /** The last mount or update went well. */
  #ok = false;
  readonly #g: GridContext<unknown>;

  constructor(g: GridContext<unknown>) {
    this.#g = g;
  }

  /** Where it is drawn (null: nowhere). */
  get host(): HTMLElement | null {
    return this.#host;
  }

  /** `part` drawing `host`, with what every part gets and `own`: true when it drew; false, the host is the grid's. */
  set(host: HTMLElement, part: Part<C> | null, own: Omit<C, keyof PartBase>): boolean {
    if (part !== this.#part || host !== this.#host) this.clear();
    if (!part) return false;
    const g = this.#g;
    const c = { ...g.partBase!, ...own } as C;
    const seen = [...Object.values(c).filter((v) => typeof v !== 'function'), g.settings.messages];
    if (seen.length === this.#seen.length && seen.every((v, i) => Object.is(v, this.#seen[i]))) return this.#ok;
    this.#part = part;
    this.#host = host;
    this.#seen = seen;
    try {
      if (this.#handle) this.#handle.update?.(c);
      else {
        host.replaceChildren();
        this.#handle = part.mount(host, c);
      }
      return (this.#ok = true);
    } catch (err) {
      this.#drop();
      g.report(err);
      return (this.#ok = false);
    }
  }

  /** Destroys the part and empties its host. */
  clear(): void {
    this.#drop();
    this.#part = this.#host = null;
    this.#seen = [];
  }

  /** The part destroyed (a `destroy` that throws is reported), its host emptied. */
  #drop(): void {
    const handle = this.#handle;
    this.#handle = null;
    try {
      handle?.destroy?.();
    } catch (err) {
      this.#g.report(err);
    }
    this.#host?.replaceChildren();
  }
}
