// The audit screen in Chrome, for scripts/audit-browser.mjs (step 18, docs/behaviors/audit-screen.md).
// `window.audit.perm(config, seeds, typing)` plays permutations (perf/permutation.ts) with real DOM
// events: on a clock of the page's own (fast), or on real timers with the keyboard from Playwright
// (`window.pwKey`, typing). `window.audit.mount(o)` shows one screen for the axe states, the stable
// size check and the screenshots, its server holding every request (`audit.server`).
import { EN } from '/packages/dom/src/locales/en.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { EN_FILTERS } from '/packages/dom/src/locales/en-filters.ts';
import { FR_FILTERS } from '/packages/dom/src/locales/fr-filters.ts';
import { AR_FILTERS } from '/packages/dom/src/locales/ar-filters.ts';
import { EN_PAGINATION } from '/packages/dom/src/locales/en-pagination.ts';
import { FR_PAGINATION } from '/packages/dom/src/locales/fr-pagination.ts';
import { AR_PAGINATION } from '/packages/dom/src/locales/ar-pagination.ts';
import { auditWords, joinMessages, mountAudit, type AuditConfig, type AuditLang, type AuditScreen } from '/perf/audit-screen.ts';
import { createFakeServer, type FakeServer } from '/perf/fake-server.ts';
import { pageClock, runPermutation, script } from '/perf/permutation.ts';

const BUNDLES = { en: joinMessages(EN, EN_FILTERS, EN_PAGINATION), fr: joinMessages(FR, FR_FILTERS, FR_PAGINATION), ar: joinMessages(AR, AR_FILTERS, AR_PAGINATION) };
const host = document.getElementById('host')!;
const search = document.getElementById('q') as HTMLInputElement;
/** Universes: A a fetched set under maxRows, B ten million rows; a filtered query scans the newest SCAN. */
const UNIVERSE = { fetched: 20_000, server: 10_000_000 } as const;
const SCAN = 20_000;

let cur: { screen: AuditScreen; server: FakeServer } | null = null;
function unmount(): void {
  cur?.screen.destroy();
  cur = null;
  host.replaceChildren();
  search.value = '';
}

interface MountOptions {
  readonly config: AuditConfig;
  readonly lang: AuditLang;
  readonly dir?: 'ltr' | 'rtl';
  readonly theme?: 'light' | 'dark';
  readonly total?: boolean;
  /** `hold` by default: each request waits for `audit.server.release(seq)`. */
  readonly mode?: 'hold' | 'timers';
  readonly latency?: number;
  readonly honour?: boolean;
  readonly pageSize?: number;
  /** Paint at once (the permutations); the frames otherwise. */
  readonly sync?: boolean;
}

function mount(o: MountOptions): void {
  unmount();
  const html = document.documentElement;
  html.lang = o.lang;
  html.dir = o.dir ?? (o.lang === 'ar' ? 'rtl' : 'ltr');
  if (o.theme) html.dataset['theme'] = o.theme;
  else delete html.dataset['theme'];
  document.getElementById('qlabel')!.textContent = auditWords(o.lang).search;
  document.getElementById('title')!.textContent = auditWords(o.lang).grid;
  const server = createFakeServer({ universe: UNIVERSE[o.config], scanCap: SCAN, fetched: o.config === 'fetched', total: !!o.total, mode: o.mode ?? 'hold', latency: o.latency ?? 0, honourSignal: o.honour !== false });
  // A fixed clock for the date shortcuts (the screenshots): 2026-10-20 12:00 UTC.
  const screen = mountAudit({ host, search, config: o.config, lang: o.lang, messages: BUNDLES[o.lang], source: server.source, pageSize: o.pageSize ?? 25, clock: () => Date.UTC(2026, 9, 20, 12), ...(o.sync && { env: { sync: true } }) });
  cur = { screen, server };
}

declare global {
  interface Window { pwKey?: (key: string) => Promise<void>; audit: unknown; ready: boolean }
}

async function perm(config: AuditConfig, seeds: readonly number[], typing: boolean) {
  const t0 = performance.now();
  let releases = 0;
  let requests = 0;
  for (const seed of seeds) {
    const s = script(seed, { typing });
    mount({ config, lang: 'en', total: s.total, honour: s.honour, sync: true });
    const clock = typing ? null : pageClock(window as never);
    const advance = clock ? (ms: number) => clock.advance(ms) : (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    try {
      const r = await runPermutation(s, {
        screen: cur!.screen, server: cur!.server, host, search, config, universe: UNIVERSE[config], scanCap: SCAN, text: BUNDLES.en.text,
        env: {
          advance,
          ...(typing && {
            // The keyboard, from Playwright: what is in the field selected and replaced, key by key.
            async type(input: HTMLInputElement, text: string, between: (k: number) => Promise<void>) {
              input.focus();
              await window.pwKey!('ControlOrMeta+A');
              await window.pwKey!('Backspace');
              if (!text) return between(0);
              for (let k = 0; k < text.length; k++) {
                await window.pwKey!(text[k]!);
                await between(k);
              }
            },
          }),
        },
      });
      releases += r.releases;
      requests += r.requests;
      // One frame at rest: what is painted is what the model holds.
      clock?.restore();
      await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
      const painted = [...host.querySelectorAll('.dzg-layer > .dzg-row')].length;
      if (r.ids && r.ids.length && !painted) return { ok: false, error: `seed ${seed} (${config}): nothing painted at rest`, done: seeds.indexOf(seed), ms: performance.now() - t0 };
    } catch (e) {
      clock?.restore();
      return { ok: false, error: String((e as Error).message ?? e), done: seeds.indexOf(seed), ms: performance.now() - t0 };
    } finally {
      clock?.restore();
      unmount();
    }
  }
  return { ok: true, done: seeds.length, ms: performance.now() - t0, releases, requests };
}

window.audit = {
  mount, unmount, perm,
  get screen() { return cur?.screen; },
  get server() { return cur?.server; },
  get grid() { return cur?.screen.grid; },
};
window.ready = true;
