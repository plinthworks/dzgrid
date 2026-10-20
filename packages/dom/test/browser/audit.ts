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
import { applyIntent, exportIntent, fileRows, mountExportGrid, oracleRows, type ExportConfig, type ExportGrid } from '/perf/export-permutation.ts';
import { datasetA, type RowA } from '/perf/dataset.ts';
import { createGrid, type GridInstance } from '/packages/dom/src/index.ts';
import { csvExport } from '/packages/dom/src/export.ts';
import { FR_EXPORT } from '/packages/dom/src/locales/fr-export.ts';

const BUNDLES = { en: joinMessages(EN, EN_FILTERS, EN_PAGINATION), fr: joinMessages(FR, FR_FILTERS, FR_PAGINATION), ar: joinMessages(AR, AR_FILTERS, AR_PAGINATION) };
const host = document.getElementById('host')!;
const search = document.getElementById('q') as HTMLInputElement;
/** Universes: A a fetched set under maxRows, B ten million rows; a filtered query scans the newest SCAN. */
const UNIVERSE = { fetched: 20_000, server: 10_000_000 } as const;
const SCAN = 20_000;

let cur: { screen: AuditScreen; server: FakeServer } | null = null;
/** The export checks' grid (step 19), and the bench's. */
let xg: ExportGrid | null = null;
let bench: GridInstance<RowA> | null = null;
function unmount(): void {
  cur?.screen.destroy();
  cur = null;
  xg?.destroy();
  xg = null;
  bench?.destroy();
  bench = null;
  document.getElementById('export')!.hidden = true;
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The export (step 19): a grid of the three configurations (perf/export-permutation.ts) with the page's
 * export button bound (`all`), its server answering on timers; the seed's query applied. Returns the
 * oracle's rows for `all`. `never`: a canExport that never answers (the busy button).
 */
async function exportMount(o: { config: ExportConfig; seed: number; lang?: AuditLang; dir?: 'ltr' | 'rtl'; never?: boolean }) {
  unmount();
  const lang = o.lang ?? 'en';
  const html = document.documentElement;
  html.lang = lang;
  html.dir = o.dir ?? (lang === 'ar' ? 'rtl' : 'ltr');
  delete html.dataset['theme'];
  document.getElementById('qlabel')!.textContent = auditWords(lang).search;
  document.getElementById('title')!.textContent = auditWords(lang).grid;
  const button = document.getElementById('export')!;
  button.hidden = false;
  button.textContent = { en: 'Export CSV', fr: 'Exporter en CSV', ar: 'تصدير CSV' }[lang];
  const g = (xg = mountExportGrid(o.config, { host, search, lang, button, mode: 'timers', ...(o.never && { options: { canExport: () => new Promise<never>(() => {}) } }) }));
  const settle = async () => {
    for (let k = 0; k < 300; k++) {
      await sleep(10);
      if (g.ctx.rows.status.phase !== 'loading' && !g.server?.pending().length) return;
    }
  };
  await settle();
  const intent = exportIntent(o.seed, o.config);
  await applyIntent(g, intent, settle);
  return { want: oracleRows(intent, o.config, lang).map((r) => r.id) };
}

/** A downloaded file's rows (its text) against the oracle's. */
async function exportCompare(text: string, want: readonly string[]) {
  const got = await fileRows(text);
  return { ok: got.length === want.length && got.every((id, k) => id === want[k]), got: got.length, want: want.length, first: got.slice(0, 3), wantFirst: want.slice(0, 3) };
}

/**
 * 100 000 × 30 (dataset A) exported `runs` times (`all`, French, the file kept, not saved): the wall time
 * of each, and the long animation frames and long tasks (over 50 ms) seen during it.
 */
async function exportBench(runs = 3) {
  unmount();
  const types: Record<string, string> = { n: 'number', d: 'day', i: 'instant', b: 'boolean' };
  const ids = ['id', 't0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'd0', 'd1', 'd2', 'd3', 'i0', 'i1', 'e0', 'e1', 'e2', 'b0', 'b1'];
  const columns = ids.map((id) => ({ id, width: 110, ...(id !== 'id' && types[id[0]!] ? { type: types[id[0]!] as never } : {}) }));
  const files: Blob[] = [];
  const exporter = csvExport({ canExport: true, deliver: (d) => void files.push(d.blob!) });
  const rows = datasetA(100_000);
  bench = createGrid<RowA>(host, { rows, getRowId: (r) => r.id, columns, messages: joinMessages(BUNDLES.fr, FR_EXPORT), locale: 'fr-FR', timeZone: 'Africa/Algiers', features: [exporter] });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  exporter.prefetch();
  await sleep(200);
  const seen: { type: string; duration: number; start: number }[] = [];
  const observers = (['long-animation-frame', 'longtask'] as const).flatMap((type) => {
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push({ type, duration: e.duration, start: e.startTime }); });
      po.observe({ type, buffered: false });
      return [po];
    } catch {
      return [];
    }
  });
  const out: { wall: number; loaf: number; longtask: number; frames: number }[] = [];
  // Frames keep coming while the export runs (a page that animates): what a user would feel.
  let spinning = true;
  const spin = () => spinning && requestAnimationFrame(spin);
  spin();
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    const outcome = await exporter.run('all');
    const t1 = performance.now();
    await sleep(100);
    const during = seen.filter((e) => e.start >= t0 - 1 && e.start <= t1);
    if (outcome !== 'done') return { error: outcome };
    out.push({ wall: Math.round(t1 - t0), loaf: Math.round(Math.max(0, ...during.filter((e) => e.type === 'long-animation-frame').map((e) => e.duration))), longtask: Math.round(Math.max(0, ...during.filter((e) => e.type === 'longtask').map((e) => e.duration))), frames: during.length });
    await sleep(300);
  }
  spinning = false;
  observers.forEach((o) => o.disconnect());
  const b = files.at(-1)!;
  const head = new Uint8Array(await b.slice(0, 3).arrayBuffer());
  return { runs: out, bytes: b.size, bom: [...head], lines: (await b.text()).split('\r\n').length - 2, supported: observers.length };
}

window.audit = {
  mount, unmount, perm, exportMount, exportCompare, exportBench,
  get xg() { return xg; },
  get screen() { return cur?.screen; },
  get server() { return cur?.server; },
  get grid() { return cur?.screen.grid; },
};
window.ready = true;
