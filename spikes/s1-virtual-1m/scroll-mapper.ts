/**
 * Maps a logical scroll offset (rows × row height) onto a physical one that
 * fits under the browser's element-height cap.
 *
 * What is mapped is the *scroll range*, not the height: logical
 * [0, logicalHeight − viewport] onto physical [0, physicalHeight − viewport].
 * Mapping heights instead (p × L / P) leaves the last `viewport × (L/P − 1)`
 * pixels of rows unreachable — the "last rows can't be scrolled to" bug.
 * So the viewport height is a parameter, and a resize builds a new mapper.
 */
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

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export function scrollMapper(logicalHeight: number, maxPhysical: number, viewport: number): ScrollMapper {
  const L = Math.max(0, logicalHeight);
  const vp = Math.max(0, viewport);
  if (L <= maxPhysical) {
    const max = Math.max(0, L - vp);
    return {
      scaled: false, logicalHeight: L, physicalHeight: L, ratio: 1, maxLogical: max, maxPhysical: max,
      toLogical: (p) => clamp(p, 0, max),
      toPhysical: (l) => clamp(l, 0, max),
    };
  }
  const maxL = L - vp;
  const maxP = Math.max(0, maxPhysical - vp);
  const ratio = maxP === 0 ? 0 : maxL / maxP;
  return {
    scaled: true, logicalHeight: L, physicalHeight: maxPhysical, ratio, maxLogical: maxL, maxPhysical: maxP,
    // The end points are exact on purpose: p × (maxL / maxP) need not round to maxL.
    toLogical: (p) => { const c = clamp(p, 0, maxP); return c === maxP ? maxL : c * ratio; },
    toPhysical: (l) => { const c = clamp(l, 0, maxL); return c === maxL ? maxP : ratio === 0 ? 0 : c / ratio; },
  };
}
