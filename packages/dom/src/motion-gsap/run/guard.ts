import type { RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
import type { Gsap } from '../index.js';

/** What a tween may leave inline, and only that: the grid's own sizes and offsets stay (never `clearProps: 'all'`). */
export const CLEAR = 'transform,opacity,--dzg-flash';

export interface Guard {
  /** An element animated while `valid()` holds (the row, the column it was for). */
  track(el: HTMLElement, valid: () => boolean, call?: { kill(): unknown }): void;
  /** Its effects finished at once (progress 1, the host's tweens too) and their props cleared. */
  finish(el: HTMLElement): void;
  /** Its props cleared, no longer followed (a tween that ended). */
  release(el: HTMLElement): void;
  /** Each element whose row or column changed (a pooled one shown again) finished; ended ones forgotten. */
  sweep(): void;
  finishAll(): void;
  has(el: HTMLElement): boolean;
}

/**
 * The pooled-row guard (step 26): the grid recycles its row and cell elements, so an element still
 * moving when it is shown for another row is finished and cleared first, the host hook's own tweens
 * included (they must use the same GSAP).
 */
export function guard(gsap: Gsap): Guard {
  const active = new Map<HTMLElement, { valid: () => boolean; call?: { kill(): unknown } | undefined }>();
  const release = (el: HTMLElement): void => {
    gsap.set(el, { clearProps: CLEAR });
    el.style.removeProperty('--dzg-flash');
    el.classList.remove('dzg-flash');
    active.get(el)?.call?.kill();
    active.delete(el);
  };
  const finish = (el: HTMLElement): void => {
    for (const t of gsap.getTweensOf(el)) t.progress(1);
    release(el);
  };
  return {
    track: (el, valid, call) => void active.set(el, { valid, call }),
    finish,
    release,
    sweep() {
      for (const [el, r] of active) {
        if (!r.valid()) finish(el);
        else if (!r.call && !gsap.getTweensOf(el).some((t) => t.progress() < 1)) active.delete(el);
      }
    },
    finishAll: () => active.forEach((_, el) => finish(el)),
    has: (el) => active.has(el),
  };
}

/** A row element still shows `key`; a cell element still shows `key` and `col`. */
export const showing = (g: GridContext<unknown>, el: HTMLElement, key: RowKey, col?: string): (() => boolean) => () =>
  el.isConnected && (col === undefined || el.getAttribute('data-col') === col) && g.rowRenderer.keyOf(col === undefined ? el : el.closest('.dzg-row')!) === key;
