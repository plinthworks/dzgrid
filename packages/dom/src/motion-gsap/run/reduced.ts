import type { Gsap } from '../index.js';

export interface Reduced {
  /** Whether the user asked for reduced motion; true until the media answers (as DzCalendar). */
  (): boolean;
  revert(): void;
}

/**
 * The reduced-motion setting, followed live through `gsap.matchMedia`, made at the first question
 * (never at load: a page without `matchMedia` reads "reduce"); `changed` when it flips.
 */
export function reducedMotion(gsap: Gsap, changed: () => void): Reduced {
  let reduce = true;
  let mm: ReturnType<Gsap['matchMedia']> | null = null;
  const ask = (() => {
    if (!mm && typeof matchMedia == 'function') {
      mm = gsap.matchMedia();
      mm.add({ r: '(prefers-reduced-motion: reduce)', f: '(prefers-reduced-motion: no-preference)' }, (c) => {
        const next = !!c.conditions?.['r'];
        if (next !== reduce) (reduce = next), changed();
      });
    }
    return reduce;
  }) as Reduced;
  ask.revert = () => {
    mm?.revert();
    mm = null;
    reduce = true;
  };
  return ask;
}
