/**
 * Whether a cell's text needs its own bidi paragraph (S2, refined in Phase 2):
 * only when it mixes directions with the grid. A Latin name in a left-to-right
 * grid, an Arabic one in a right-to-left grid, read correctly as they are;
 * isolating them costs a node per cell for nothing (the body's node budget).
 *
 * - Free text: in LTR, when it holds a right-to-left letter; in RTL, when it
 *   holds anything but right-to-left letters, marks and spaces (a Latin word,
 *   a digit, a final punctuation would be reordered).
 * - Numbers: in RTL only, where a minus or a percent sign would move to the
 *   other side; they are then isolated left to right.
 */
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const ONLY_RTL = /^[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\s\p{M}]*$/u;

export type Isolation = 'free' | 'num' | null;

export function isolationFor(text: string, type: string, dir: 'ltr' | 'rtl'): Isolation {
  if (text === '') return null;
  if (type === 'number') return dir === 'rtl' ? 'num' : null;
  if (type !== 'text') return null;
  return (dir === 'ltr' ? RTL_LETTER.test(text) : !ONLY_RTL.test(text)) ? 'free' : null;
}
