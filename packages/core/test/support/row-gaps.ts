import type { RowLayout } from '@dzgrid/core';

const at = (i: number) => i as never;

/** Brute force: every pixel's row, from the boxes and the gaps laid one after the other. */
export function oracle(heights: number[], gaps: Map<number, number>) {
  const off: number[] = [];
  const pix: number[] = [];
  let y = 0;
  heights.forEach((h, i) => {
    const g = gaps.get(i) ?? 0;
    for (let k = 0; k < g; k++) pix.push(i);
    y += g;
    off.push(y);
    for (let k = 0; k < h; k++) pix.push(i);
    y += h;
  });
  return { off, pix, total: y };
}

export function check(L: RowLayout, heights: number[], gaps: Map<number, number>): string[] {
  const o = oracle(heights, gaps);
  const bad: string[] = [];
  if (L.total !== o.total) bad.push(`total ${L.total} ${o.total}`);
  heights.forEach((h, i) => {
    if (L.offsetOf(at(i)) !== o.off[i]) bad.push(`offset ${i}`);
    if (L.heightOf(at(i)) !== h) bad.push(`height ${i}`);
  });
  o.pix.forEach((r, y) => L.indexAt(y) !== r && bad.push(`indexAt ${y}`));
  return bad;
}

