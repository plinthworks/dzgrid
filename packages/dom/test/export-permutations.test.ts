// The CSV export under seeded queries (step 19, docs/behaviors/csv-export.md; perf/export-permutation.ts):
// filters, quick search with and without accents, sorts, a page, a selection; each seed exported as
// displayed, all and selected on a grid on rows in memory, on configuration A (a fetched set) and B
// (server pages, the server's own file through exportAll). The file is parsed (RFC 4180) and its rows
// compared, in order, with an oracle that never reads the grid; B's request with what the grid asks
// its server; no row key nor cell value in any event, problem or sentence. `PERMS=n` runs n seeds
// (200 in test:ci, 1 000 in test:perm); `PERM_SEED=n` replays one.
import { describe, it, expect } from 'vitest';
import { runExportSeed, type ExportConfig } from '../../../perf/export-permutation.js';

const PERMS = Number(process.env['PERMS'] ?? 200);
const ONLY = process.env['PERM_SEED'] ? Number(process.env['PERM_SEED']) : null;
const SEEDS = ONLY !== null ? [ONLY] : Array.from({ length: PERMS }, (_, i) => i + 1);

describe('export permutations (oracle)', () => {
  for (const config of ['client', 'fetched', 'server'] as ExportConfig[]) {
    it(`${SEEDS.length} seeds on ${config}: the file holds the oracle's rows in order, for displayed, all and selected`, async () => {
      const t0 = performance.now();
      const tally = { files: 0, rows: 0, hidden: 0, viaServer: 0 };
      for (const seed of SEEDS) {
        const r = await runExportSeed(seed, config);
        tally.files += r.files;
        tally.rows += r.rows;
        tally.hidden += r.hidden;
        tally.viaServer += r.viaServer;
      }
      expect(tally.files).toBe(SEEDS.length * 3);
      if (config === 'server') expect(tally.viaServer).toBe(SEEDS.length * 2);
      // Hidden selected rows: the browser's rows only (a fetched set drops the keys its answer lacks; B's server writes the file).
      if (SEEDS.length >= 50 && config === 'client') expect(tally.hidden).toBeGreaterThan(0);
      console.log(`export permutations ${config}: ${SEEDS.length} seeds, ${tally.files} files, ${tally.rows} rows checked, ${tally.hidden} selected rows hidden, ${Math.round(performance.now() - t0)} ms`);
    }, 900_000);
  }
});
