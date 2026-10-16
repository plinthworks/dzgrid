import type { ScrollMapper } from '@dzgrid/core';
import type { Geometry } from '../render/measure.js';

/**
 * The block scroll position, kept logically (S1, S11, D5). Below the cap
 * logical and physical are the same. Above it:
 * - the wheel is the grid's: its distance moves the logical offset;
 * - any other native scroll (touch, momentum, a key the grid did not take)
 *   moves it by the same physical distance — relative mapping — and the
 *   matching physical position is written back; at either end it snaps;
 * - a scrollbar drag maps absolutely: the thumb's place is the list's place.
 * Our own writes come back as scroll events, and are recognised (±1 px).
 */
export class ScrollController {
  #logical = 0;
  #physical = 0;
  #expected = 0;
  #mapper: ScrollMapper | null = null;
  #dragging = false;
  readonly #geometry: Geometry;

  constructor(geometry: Geometry) {
    this.#geometry = geometry;
    this.#physical = geometry.read().scrollTop;
    this.#expected = this.#physical;
    this.#logical = this.#physical;
  }

  get logicalTop(): number {
    return this.#logical;
  }
  /** Where the browser's view is, for placing the row layer. */
  get physicalTop(): number {
    return this.#physical;
  }
  get mapper(): ScrollMapper | null {
    return this.#mapper;
  }
  get atTop(): boolean {
    return this.#logical <= 0;
  }
  get atEnd(): boolean {
    return !!this.#mapper && this.#mapper.maxLogical > 0 && this.#logical >= this.#mapper.maxLogical - 0.5;
  }

  /** A new mapper (the count, the row height or the view changed): the logical offset stays, clamped. */
  setMapper(m: ScrollMapper): void {
    this.#mapper = m;
    this.#write(this.#logical);
  }

  scrollTo(logical: number): void {
    this.#write(logical);
  }

  /** The scroll event: returns true when the view moved for the grid. */
  onScroll(): boolean {
    const physical = this.#geometry.read().scrollTop;
    if (Math.abs(physical - this.#expected) <= 1) {
      this.#physical = physical;
      return false;
    }
    const m = this.#mapper;
    if (!m || !m.scaled) {
      this.#physical = this.#expected = physical;
      this.#logical = m ? m.toLogical(physical) : physical;
      return true;
    }
    if (this.#dragging) {
      this.#physical = this.#expected = physical;
      this.#logical = m.toLogical(physical);
      return true;
    }
    const delta = physical - this.#expected;
    let next = this.#logical + delta;
    if (physical <= 0) next = 0;
    else if (physical >= m.maxPhysical - 0.5) next = m.maxLogical;
    this.#write(next);
    return true;
  }

  /** The wheel, above the cap. Returns false when it is the browser's (below the cap). */
  onWheel(deltaBlock: number): boolean {
    if (!this.#mapper?.scaled) return false;
    this.#write(this.#logical + deltaBlock);
    return true;
  }

  pointerDown(onScrollbar: boolean): void {
    this.#dragging = onScrollbar;
  }
  pointerUp(): void {
    this.#dragging = false;
  }

  #write(logical: number): void {
    const m = this.#mapper;
    const max = m ? m.maxLogical : Number.POSITIVE_INFINITY;
    this.#logical = Math.max(0, Math.min(max, Number.isFinite(logical) ? logical : logical > 0 ? max : 0));
    const physical = m ? m.toPhysical(this.#logical) : this.#logical;
    this.#geometry.writeScrollTop(physical);
    this.#physical = this.#expected = this.#geometry.read().scrollTop;
  }
}
