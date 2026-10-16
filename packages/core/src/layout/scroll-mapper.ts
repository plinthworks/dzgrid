/**
 * Long lists against the browser's limits (S1).
 *
 * Elements cannot be arbitrarily tall — Firefox collapses one above 17.9 M px —
 * and above 2²² px positions lose their half pixels. So a list taller than
 * `MAX_PHYSICAL` scrolls a shorter element and maps one onto the other. What
 * is mapped is the *scroll range*, not the height: mapping heights leaves the
 * last rows unreachable. A resize builds a new mapper.
 */
export const MAX_PHYSICAL = 4_000_000;
/** Lengths the page holds are kept below this, relative to a base re-anchored every REBASE px. */
export const REBASE = 1 << 20;

export interface ScrollMapper {
  readonly scaled: boolean;
  readonly logicalHeight: number;
  readonly physicalHeight: number;
  /** Logical px per physical px of scroll (1 when not scaled). */
  readonly ratio: number;
  readonly maxLogical: number;
  readonly maxPhysical: number;
  toLogical(physicalTop: number): number;
  toPhysical(logicalTop: number): number;
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo || x !== x ? lo : x > hi ? hi : x);
const size = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

export function scrollMapper(logicalHeight: number, maxPhysical: number, viewportBlockSize: number): ScrollMapper {
  const L = size(logicalHeight);
  const vp = size(viewportBlockSize);
  if (L <= maxPhysical) {
    const max = Math.max(0, L - vp);
    return {
      scaled: false, logicalHeight: L, physicalHeight: L, ratio: 1, maxLogical: max, maxPhysical: max,
      toLogical: (p) => clamp(p, 0, max),
      toPhysical: (l) => clamp(l, 0, max),
    };
  }
  const maxL = Math.max(0, L - vp);
  const maxP = Math.max(0, maxPhysical - vp);
  const ratio = maxP === 0 ? 0 : maxL / maxP;
  return {
    scaled: true, logicalHeight: L, physicalHeight: maxPhysical, ratio, maxLogical: maxL, maxPhysical: maxP,
    // The end points are exact on purpose: p × (maxL / maxP) need not round to maxL.
    toLogical: (p) => {
      // A view as tall as the cap leaves no physical range: the top is the only place.
      if (maxP === 0) return 0;
      const c = clamp(p, 0, maxP);
      return c === maxP ? maxL : c * ratio;
    },
    toPhysical: (l) => {
      const c = clamp(l, 0, maxL);
      return c === maxL ? maxP : ratio === 0 ? 0 : c / ratio;
    },
  };
}

/** Where the row layer sits: rows are placed relative to `base`, the layer at `layerTop`. */
export interface LayerPlacement {
  readonly base: number;
  readonly layerTop: number;
}

export function layerPlacement(logicalTop: number, physicalTop: number, rebase: number = REBASE): LayerPlacement {
  const base = Math.floor(logicalTop / rebase) * rebase;
  return { base, layerTop: physicalTop - logicalTop + base };
}
