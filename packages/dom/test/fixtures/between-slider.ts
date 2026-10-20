// Worked example 2 (docs/phase-3-plugins.md §B2.8): a "between two numbers" filter with two sliders,
// written as a host would, from the public contract only (a FilterKind and a `filter.<kind>` part).
// A test fixture, not shipped (step 20, lead decision).
import type { FilterKind } from '@dzgrid/core';
import { definePart, type SlotContext, type SlotPart } from '../../src/part.js';

export type Between = { readonly min: number | null; readonly max: number | null };

const bound = (x: unknown): boolean => x === null || (typeof x === 'number' && Number.isFinite(x));
export const isBetween = (s: unknown): s is Between =>
  typeof s === 'object' && s !== null && !Array.isArray(s) && Object.keys(s).length === 2 && bound((s as Between).min) && bound((s as Between).max);

/** The core part: pure, serialisable, the same in Node. */
export const between: FilterKind<Between, number> = {
  name: 'between',
  types: ['number'],
  read: (s) => (isBetween(s) ? s : 'invalid'),
  active: (s) => s.min !== null || s.max !== null,
  test: (s) => (v) => v !== null && (s.min === null || v >= s.min) && (s.max === null || v <= s.max),
  wire: (s) => ({ gte: s.min, lte: s.max }),
};

/**
 * The DOM part: two range inputs named by the host's own texts (`app.between.min`, `app.between.max`).
 * A slider at its end means "no bound"; both at their ends, no filter (null, as the contract asks of
 * an inactive state). Debounced: the grid applies the last move after its pause.
 */
export function betweenSlider(lo = 0, hi = 120): SlotPart<'filter'> {
  return definePart('filter', {
    mount(host, c0) {
      const range = (c: SlotContext['filter'], key: 'app.between.min' | 'app.between.max') => {
        const r = c.doc.createElement('input');
        r.type = 'range';
        r.min = String(lo);
        r.max = String(hi);
        r.setAttribute('aria-label', c.msg(key));
        return r;
      };
      const min = range(c0, 'app.between.min');
      const max = range(c0, 'app.between.max');
      let c = c0;
      const push = () => {
        const s: Between = { min: min.valueAsNumber > lo ? min.valueAsNumber : null, max: max.valueAsNumber < hi ? max.valueAsNumber : null };
        c.set(between.active(s) ? s : null, { commit: 'debounced' });
      };
      min.addEventListener('input', push);
      max.addEventListener('input', push);
      host.append(min, max);
      const show = (next: SlotContext['filter']) => {
        c = next;
        const s = isBetween(next.state) ? next.state : null;
        min.value = String(s?.min ?? lo);
        max.value = String(s?.max ?? hi);
      };
      show(c0);
      return { update: show, focus: () => (min.focus(), true), destroy: () => { min.remove(); max.remove(); } };
    },
  });
}
