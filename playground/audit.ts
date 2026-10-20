// The audit screen (step 18, docs/behaviors/audit-screen.md): one fake server, two settings.
// `?config=server` (B, 10⁷ rows, offset pages, no total unless `total=1`) or `?config=fetched`
// (A, 20 000 rows fetched, paged in the browser); `lang` fr/en/ar, `direction`, `theme`,
// `density`; the server's `latency`, `jitter` (ms) and `fail` (%) live, and a button that fails
// the next request. A change of configuration or language reloads the page.
import { EN } from '@dzgrid/dom/locales/en';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { auditWords, joinMessages, mountAudit, type AuditConfig, type AuditLang } from '../perf/audit-screen.js';
import { createFakeServer } from '../perf/fake-server.js';
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement;
const params = new URLSearchParams(location.search);
for (const [k, v] of params) if (field(k)) field(k).value = v;
const num = (n: string) => Math.max(0, Number(field(n).value) || 0);
const config = field('config').value as AuditConfig;
const lang = field('lang').value as AuditLang;
const BUNDLES = { fr: joinMessages(FR, FR_FILTERS, FR_PAGINATION), en: joinMessages(EN, EN_FILTERS, EN_PAGINATION), ar: joinMessages(AR, AR_FILTERS, AR_PAGINATION) };

const server = createFakeServer({
  universe: config === 'fetched' ? 20_000 : 10_000_000, fetched: config === 'fetched', total: field('total').value === '1',
  mode: 'timers', latency: num('latency'), jitter: num('jitter'), failRate: num('fail') / 100, seed: Date.now() % 100_000,
});
const status = document.getElementById('status')!;
const q = document.getElementById('q') as HTMLInputElement;

function page(): void {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = field('direction').value === 'auto' ? (lang === 'ar' ? 'rtl' : 'ltr') : field('direction').value;
  if (field('theme').value) html.dataset['theme'] = field('theme').value;
  else delete html.dataset['theme'];
  const accent = field('palette').value;
  if (accent) html.style.setProperty('--tz-accent', accent);
  else html.style.removeProperty('--tz-accent');
  document.getElementById('qlabel')!.textContent = auditWords(lang).search;
}
page();

const screen = mountAudit({
  host: document.getElementById('host')!, search: q, config, lang, messages: BUNDLES[lang], source: server.source,
  direction: field('direction').value as 'auto', density: field('density').value as 'comfortable',
  onEvent: (e) => {
    if (e.type === 'fetchFailed') status.textContent = `échec : ${String((e.error as Error)?.message ?? e.error)}`;
    else if (e.type === 'modelUpdated') status.textContent = `${server.log.length} requêtes`;
  },
});

form.addEventListener('change', (e) => {
  const name = (e.target as HTMLInputElement).name;
  if (name === 'config' || name === 'lang') {
    const next = new URLSearchParams();
    for (const el of form.elements) if ((el as HTMLInputElement).name) next.set((el as HTMLInputElement).name, (el as HTMLInputElement).value);
    location.search = next.toString();
    return;
  }
  page();
  server.configure({ latency: num('latency'), jitter: num('jitter'), failRate: num('fail') / 100, total: field('total').value === '1' });
  screen.grid.update({ direction: field('direction').value as 'auto', density: field('density').value as 'comfortable' });
});
document.getElementById('failNext')!.addEventListener('click', () => server.failNext());
(window as unknown as { audit: unknown }).audit = { screen, server };
