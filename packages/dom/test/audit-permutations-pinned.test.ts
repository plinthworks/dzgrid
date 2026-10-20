// Pinned seeds of the audit permutations (test analysis of step 18).
import { describe, it, vi } from 'vitest';
import { joinMessages, mountAudit, type AuditConfig } from '../../../perf/audit-screen.js';
import { createFakeServer } from '../../../perf/fake-server.js';
import { runPermutation, script } from '../../../perf/permutation.js';
import * as kit from '../src/filters/set/index.js';
import { EN } from '../src/locales/en.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';

const UNIVERSE = 2000;
const MESSAGES = joinMessages(EN, EN_FILTERS, EN_PAGINATION);
type Final = { ids: readonly string[] | null; index: number; query: string };

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

// Seeds that caught a defect, run on every test:ci (the first 25 seeds do not reach them):
// 217 (A): a query changed and changed back kept the old set's page (step 18, server/rows.ts).
const PINNED: readonly [number, AuditConfig][] = [[217, 'fetched']];

describe('audit permutations: pinned regression seeds', () => {
  for (const [seed, config] of PINNED) {
    it(`seed ${seed} on ${config}`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      try {
        await one(seed, config);
      } finally {
        vi.useRealTimers();
      }
    });
  }
});
