/** What `stickyStack` reads: the paint's row layout, the rows' levels and parents (display indices). */
export interface StackInput {
  /** The view's logical top. */
  readonly top: number;
  /** Copies asked (`tree({ sticky })`). */
  readonly n: number;
  readonly viewBlock: number;
  /** The row height: the copies never take more than half the view. */
  readonly h: number;
  readonly count: number;
  readonly layout: { offsetOf(i: number): number; heightOf(i: number): number; indexAt(y: number): number };
  levelAt(i: number): number;
  /** The row's parent, -1 for a root. */
  ancestorOf(i: number): number;
}

/** The copies, outermost first: their rows, their places under the header, the stack's height; rounds, for tests. */
export interface Stack {
  readonly at: number[];
  readonly y: number[];
  readonly height: number;
  readonly rounds: number;
}

/**
 * The parents pinned at a scroll top (docs/behaviors/tree-sticky.md). From no copy: the row at the
 * stack's lower edge; its ancestors, and itself when an open parent starting above the edge, join
 * when they continue the stack (the nearest `cap`); again until it stops growing or leaves the
 * innermost copy. Each copy then at its slot, or pushed up by the end of its subtree; out: dropped.
 * Only rows between the view's top and the edge are scanned.
 */
export function stickyStack(o: StackInput): Stack {
  const { top, count, layout: L, levelAt: lv, ancestorOf: up } = o;
  const cap = Math.min(o.n, Math.floor(o.viewBlock / 2 / o.h));
  let shown: number[] = [];
  let rounds = 0;
  let q = 0;
  while (count > 0 && cap >= 1) {
    rounds++;
    let line = top;
    for (const c of shown) line += L.heightOf(c);
    q = L.indexAt(line);
    const inner = shown.length ? shown[shown.length - 1]! : -1;
    const stop = inner < 0 ? -1 : lv(inner);
    const ext: number[] = [];
    let a = q + 1 < count && lv(q + 1) > lv(q) && L.offsetOf(q) < line ? q : up(q);
    for (; a >= 0 && lv(a) > stop && (inner >= 0 || ext.length < cap); a = up(a)) if (ext.length < cap) ext.push(a);
    if (!ext.length || (inner >= 0 && a !== inner)) break;
    shown = shown.concat(ext.reverse()).slice(-cap);
  }
  const m = shown.length;
  const end: number[] = shown.map(() => -1);
  if (m) {
    for (let j = Math.max(shown[m - 1]! + 1, L.indexAt(top)); j <= q; j++) {
      const l = lv(j);
      for (let s = m - 1; s >= 0 && lv(shown[s]!) >= l; s--) if (end[s]! < 0) end[s] = j;
    }
  }
  const at: number[] = [];
  const y: number[] = [];
  let slot = 0;
  let height = 0;
  shown.forEach((c, s) => {
    const hc = L.heightOf(c);
    const ys = end[s]! < 0 ? slot : Math.min(slot, L.offsetOf(end[s]!) - top - hc);
    slot += hc;
    if (ys > -hc) at.push(c), y.push(ys), (height = Math.max(height, ys + hc));
  });
  return { at, y, height, rounds };
}
