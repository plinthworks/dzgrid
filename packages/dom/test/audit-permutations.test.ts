// The audit screen under seeded permutations, tier 1 (step 18, docs/behaviors/audit-screen.md):
// the real grid, gate and features in jsdom, fake timers, the fake server holding every request.
// Each seed plays the same gestures on configuration A (a fetched set paged in the browser) and
// B (server pages), with answers in the seed's order (about 8 % failing), and checks I1-I7 after
// every answer and at rest (perf/permutation.ts). `PERM_SEED=n` replays one; `PERMS=n` runs n seeds
// per configuration. The 1 000 of the exit criterion take about 107 s on one worker (measured
// 2026-10-20, over the ~90 s rule): `npm run test:perm` runs them and is in the commit gate
// (docs/STATUS.md); `test:ci` runs the first 25 per configuration.
import { describe, it, expect, afterAll, vi } from 'vitest';
import { joinMessages, mountAudit, type AuditConfig } from '../../../perf/audit-screen.js';
import { createFakeServer } from '../../../perf/fake-server.js';
import { runPermutation, script } from '../../../perf/permutation.js';
import * as kit from '../src/filters/set/index.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';

const PERMS = Number(process.env['PERMS'] ?? 25);
const ONLY = process.env['PERM_SEED'] ? Number(process.env['PERM_SEED']) : null;
const SEEDS = ONLY !== null ? [ONLY] : Array.from({ length: PERMS }, (_, i) => i + 1);
const UNIVERSE = 2000;
const MESSAGES = joinMessages(EN, EN_FILTERS, EN_PAGINATION);
type Final = { ids: readonly string[] | null; index: number; query: string };
const finals = { fetched: new Map<number, Final>(), server: new Map<number, Final>() };
const timing: Record<string, number> = {};

async function one(seed: number, config: AuditConfig): Promise<Final> {
  const s = script(seed, { typing: true });
  const box = { block: 400, inline: 1200, scrollTop: 0, scrollInline: 0 };
  const geometry = { read: () => ({ ...box }), writeScrollTop: (px: number) => void (box.scrollTop = px), writeScrollInline: (px: number) => void (box.scrollInline = px) };
  const search = document.createElement('input');
  search.type = 'search';
  search.setAttribute('aria-label', 'Search the journal');
  const host = document.createElement('div');
  document.body.append(search, host);
  const server = createFakeServer({ universe: UNIVERSE, fetched: config === 'fetched', total: s.total, mode: 'hold', honourSignal: s.honour });
  const screen = mountAudit({ host, search, config, lang: 'en', messages: MESSAGES, source: server.source, pageSize: 25, env: { geometry, sync: true }, loadSet: () => Promise.resolve(kit) as never });
  try {
    const r = await runPermutation(s, { screen, server, host, search, config, universe: UNIVERSE, scanCap: 200_000, text: MESSAGES.text, env: { advance: (ms) => vi.advanceTimersByTimeAsync(ms).then(() => {}) } });
    return r;
  } finally {
    screen.destroy();
    document.body.innerHTML = '';
  }
}

describe('audit screen permutations (tier 1, jsdom)', () => {
  for (const config of ['fetched', 'server'] as const) {
    it(`${SEEDS.length} seeds on configuration ${config === 'fetched' ? 'A (fetched set)' : 'B (server pages)'}: I1-I6 after every answer and at rest`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      const t0 = performance.now();
      try {
        for (const seed of SEEDS) finals[config].set(seed, await one(seed, config));
      } finally {
        vi.useRealTimers();
        timing[config] = performance.now() - t0;
      }
    }, 900_000);
  }

  // A pages the old set while a new one loads (its pages then start again at 1); B asks the new
  // query's pages: a page turned during a load can leave them on different pages of the same rows.
  it('I7: A and B end on the same query, and on the same page shows the same rows, seed by seed', () => {
    let compared = 0;
    let otherPage = 0;
    for (const seed of SEEDS) {
      const a = finals.fetched.get(seed);
      const b = finals.server.get(seed);
      if (!a?.ids || !b?.ids) continue;
      expect(b.query, `seed ${seed}: A and B end on different queries`).toBe(a.query);
      if (a.index !== b.index) {
        otherPage++;
        continue;
      }
      expect(b.ids, `seed ${seed}: A and B differ at rest`).toEqual(a.ids);
      compared++;
    }
    expect(compared).toBeGreaterThan(SEEDS.length * 0.6);
    console.log(`I7: ${compared} seeds compared row for row, ${otherPage} on another page of the same rows (A paged the old set while a new one loaded)`);
  });

  afterAll(() => {
    // The measure that decides whether tier 1 stays in test:ci (step 18 lead decision: under ~90 s in all).
    console.log(`audit permutations: ${SEEDS.length} seeds, A ${Math.round(timing['fetched'] ?? 0)} ms, B ${Math.round(timing['server'] ?? 0)} ms`);
  });
});
