import { describe, it, expect } from 'vitest';
import { createRowStore, createColumnModel, localeCtx, NO_OVERLAY, compileQuick, filterIndices, quickWords, canNarrow } from '@dzgrid/core';
import { ColumnCache } from '@dzgrid/core/internal';

type Row = { id: string; name: string };

describe('narrowing a search', () => {
  it('scans only the previous matches as the words grow', () => {
    const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: i % 10 === 0 ? `Hélène ${i}` : i % 3 === 0 ? `Hector ${i}` : `Zoé ${i}` }));
    const store = createRowStore<Row>((r) => r.id);
    store.replaceAll(rows);
    const columns = createColumnModel<Row>([{ id: 'name' }]);
    const cache = new ColumnCache<Row>();
    const env = { source: store.snapshot, columns, ctx: localeCtx({ locale: 'fr-FR' }), reader: NO_OVERLAY, cache };

    let within: Uint32Array | null = null;
    let prev: readonly string[] = [];
    const scans: number[] = [];
    for (const text of ['h', 'he', 'hel']) {
      const words = quickWords(text);
      const from = canNarrow(prev, words) ? within : null;
      const before = cache.stats.quickScanned;
      within = filterIndices(store.snapshot.count, [compileQuick(text, columns.visible(), env)], from);
      scans.push(cache.stats.quickScanned - before);
      prev = words;
    }
    expect(scans[0]).toBe(100);
    expect(scans[1]).toBeLessThanOrEqual(43);
    expect(scans[2]).toBeLessThanOrEqual(43);
    expect(within!.length).toBe(10);
  });

  it('narrows only when every new word contains the old one', () => {
    expect(canNarrow(['he'], ['hel'])).toBe(true);
    expect(canNarrow(['he'], ['hel', 'x'])).toBe(true);
    expect(canNarrow(['hel'], ['he'])).toBe(false);
    expect(canNarrow(['a', 'b'], ['a'])).toBe(false);
    expect(canNarrow([], ['a'])).toBe(false);
  });
});
