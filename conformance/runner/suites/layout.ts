import { PrefixSums, uniformRowLayout, variableRowLayout, scrollMapper, layerPlacement, visibleWindow, anchorFor, scrollTopFor, MAX_PHYSICAL } from '@dzgrid/core';
import { sparseRowLayout } from '@dzgrid/core/detail';
import { extrasOf } from '../../../packages/dom/src/auto-height/layout.js';
import type { Suite } from './index.js';

/** A stand-in for displayed rows: only `count` and `index()` are needed to mint positions. */
const rowsOf = (count: number) => ({ count, index: (n: number) => (Number.isInteger(n) && n >= 0 && n < count ? (n as never) : null) });

export const layout: Record<string, Suite> = {
  'layout-rows': (input) => {
    if (input.op === 'offsets') {
      const l = variableRowLayout(rowsOf(input.heights.length), 0, input.heights);
      const r = rowsOf(input.heights.length);
      return {
        offsets: [...input.heights.map((_: number, i: number) => l.offsetOf(r.index(i)!)), l.total],
        indexAt: input.probes.map((p: number) => l.indexAt(p)),
      };
    }
    if (input.op === 'window') {
      const r = rowsOf(input.count);
      const l = uniformRowLayout(r, input.height);
      const m = scrollMapper(l.total, MAX_PHYSICAL, input.view);
      const w = visibleWindow(l, new PrefixSums([100]), m, input.scrollBlock, 0, { block: input.view, inline: 100 }, { overscanRows: input.overscan, overscanCols: 0 });
      return { rows: w.rows ? [w.rows.first, w.rows.last] : null };
    }
    if (input.op === 'auto') {
      // Automatic row height (step 9): the measured rows by key (`r<i>`), merged with a detail's extras.
      const d = { ...rowsOf(input.count), indexOf: (k: string) => (/^r\d+$/.test(k) && +k.slice(1) < input.count ? +k.slice(1) : -1) };
      const extras = extrasOf(d as never, new Map(input.measured.map(([i, v]: [number, number]) => [`r${i}`, v])), input.height, input.inner);
      const l = sparseRowLayout(d, input.height, extras);
      return {
        extras,
        offsets: [...Array.from({ length: input.count }, (_, i) => l.offsetOf(i as never)), l.total],
        indexAt: input.probes.map((p: number) => l.indexAt(p)),
      };
    }
    // anchor
    const r = rowsOf(input.count);
    const l = variableRowLayout(r, input.estimate);
    const [lo, hi] = input.measured.length ? input.measured : [-1, -2];
    const a = anchorFor(l, input.scrollTop, input.view, (i) => i >= lo && i <= hi)!;
    l.setHeight(r.index(input.grow.row)!, input.grow.to);
    return { anchor: a, scrollTop: scrollTopFor(a, l, input.view) };
  },
  'layout-cols': ({ widths, scrollInline, view, overscan }) => {
    const r = rowsOf(1);
    const w = visibleWindow(uniformRowLayout(r, 10), new PrefixSums(widths), scrollMapper(10, MAX_PHYSICAL, 10), 0, scrollInline, { block: 10, inline: view }, { overscanRows: 0, overscanCols: overscan });
    return { cols: w.cols ? [w.cols.first, w.cols.last] : null };
  },
  'scroll-mapper': (input) => {
    if (input.layer) return layerPlacement(input.layer.logical, input.layer.physical);
    const m = scrollMapper(input.logical === 'NaN' ? Number.NaN : input.logical, input.maxPhysical, input.view);
    const out: Record<string, unknown> = { scaled: m.scaled, maxLogical: m.maxLogical, toLogical: input.toLogical.map((p: number) => m.toLogical(p)) };
    if (input.toPhysical) out['toPhysical'] = input.toPhysical.map((l: number) => m.toPhysical(l));
    return out;
  },
};
