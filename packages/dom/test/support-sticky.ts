// The brute-force oracle of sticky parent rows (docs/behaviors/tree-sticky.md), shared by the stack's
// property test and the DOM walk: written from the sheet, never from `stickyStack`.

/**
 * The oracle, from the sheet, as plainly as possible: offsets summed, the row at an offset by a
 * linear walk, a row's parent the nearest earlier row of a smaller level, whole paths, the stack
 * grown until it stops, each subtree's end found by a scan to the end of the rows.
 */
export function stickyOracle(levels: readonly number[], heights: readonly number[] | number, o: { top: number; n: number; viewBlock: number; h?: number }) {
  const count = levels.length;
  const hs = typeof heights === 'number' ? levels.map(() => heights) : heights;
  const off: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) (off[i] = sum), (sum += hs[i]!);
  const h = o.h ?? 32;
  const cap = Math.min(o.n, Math.floor(o.viewBlock / 2 / h));
  if (!count || !(cap >= 1)) return { at: [] as number[], y: [] as number[], height: 0 };
  const indexAt = (y: number) => {
    let i = 0;
    while (i < count - 1 && off[i + 1]! <= y) i++;
    return i;
  };
  const parentOf = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (levels[j]! < levels[i]!) return j;
    return -1;
  };
  const open = (i: number) => i + 1 < count && levels[i + 1]! > levels[i]!;
  const pathOf = (q: number, line: number) => {
    const p: number[] = [];
    for (let a = parentOf(q); a >= 0; a = parentOf(a)) p.unshift(a);
    if (open(q) && off[q]! < line) p.push(q);
    return p;
  };
  let chain: number[] = [];
  for (;;) {
    const shown = chain.slice(-cap);
    const line = o.top + shown.reduce((s, c) => s + hs[c]!, 0);
    const p = pathOf(indexAt(line), line);
    const prefix = chain.every((c, k) => p[k] === c);
    if (!prefix || p.length <= chain.length) break;
    chain = p;
  }
  const shown = chain.slice(-cap);
  const at: number[] = [];
  const y: number[] = [];
  let slot = 0;
  let height = 0;
  for (const c of shown) {
    let end = -1;
    for (let j = c + 1; j < count; j++) if (levels[j]! <= levels[c]!) { end = j; break; }
    const ys = end < 0 ? slot : Math.min(slot, off[end]! - o.top - hs[c]!);
    slot += hs[c]!;
    if (ys > -hs[c]!) at.push(c), y.push(ys), (height = Math.max(height, ys + hs[c]!));
  }
  return { at, y, height };
}

