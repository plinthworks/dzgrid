import type { RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
import type { Gsap } from '../index.js';

/** What a tween may leave inline, and only that: the grid's own sizes and offsets stay (never `clearProps: 'all'`). */
export const CLEAR = 'transform,opacity,--dzg-flash';

export interface Guard {
  /**
   * An element animated (by the grid or a host hook) while `valid()` holds (the row, the column it
   * was for); followed until it is finished. A new `call` kills the one before; none keeps it.
   */
  track(el: HTMLElement, valid: () => boolean, call?: { kill(): unknown }): void;
  /** Its effects finished at once (progress 1, the host's tweens too), their props cleared, no longer followed. */
  finish(el: HTMLElement): void;
  /** The grid's own effect on it ended: its mark goes; its props are cleared unless another tween (a host's) still runs. Still followed. */
  release(el: HTMLElement): void;
  /** Each element whose row or column changed (a pooled one shown again) or that left the page: finished. */
  sweep(): void;
  finishAll(): void;
  has(el: HTMLElement): boolean;
}

/**
 * The pooled-row guard (step 26): the grid recycles its row and cell elements, so an element animated
 * for a row is finished and cleared when it is shown for another one, every tween on it included (a
 * host hook's too: it must use the same GSAP). An element stays followed until then (or until it
 * leaves the page, or the grid goes): the map holds at most the pooled elements, the layer, the
 * overlay and an open popup's content.
 */
export function guard(gsap: Gsap): Guard {
  const active = new Map<HTMLElement, { valid: () => boolean; call?: { kill(): unknown } | undefined }>();
  const clear = (el: HTMLElement): void => {
    gsap.set(el, { clearProps: CLEAR });
    el.style.removeProperty('--dzg-flash');
  };
  const finish = (el: HTMLElement): void => {
    for (const t of gsap.getTweensOf(el)) t.progress(1);
    el.classList.remove('dzg-flash');
    clear(el);
    active.get(el)?.call?.kill();
    active.delete(el);
  };
  return {
    track(el, valid, call) {
      const r = active.get(el);
      if (call && r?.call !== call) r?.call?.kill();
      active.set(el, { valid, call: call ?? r?.call });
    },
    finish,
    release(el) {
      const r = active.get(el);
      r?.call?.kill();
      if (r) r.call = undefined;
      el.classList.remove('dzg-flash');
      el.style.removeProperty('--dzg-flash');
      if (!gsap.getTweensOf(el).some((t) => t.progress() < 1)) clear(el);
    },
    sweep() {
      for (const [el, r] of active) if (!r.valid()) finish(el);
    },
    finishAll: () => active.forEach((_, el) => finish(el)),
    has: (el) => active.has(el),
  };
}

/** A row element still shows `key`; a cell element still shows `key` and `col`. */
export const showing = (g: GridContext<unknown>, el: HTMLElement, key: RowKey, col?: string): (() => boolean) => () =>
  el.isConnected && (col === undefined || el.getAttribute('data-col') === col) && g.rowRenderer.keyOf(col === undefined ? el : el.closest('.dzg-row')!) === key;
