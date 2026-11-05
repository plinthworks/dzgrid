// Groups loaded from a server on the browser page (Phase 8 step 7, scripts/browser-server-groups.mjs,
// server-side-groups.md): data set C of the plan grouped — 10⁷ made-up rows (a fruit, a shop, a quantity) grouped by
// fruit (7 groups) then shop (500 under each), 2 857 rows under each shop, computed from their place; the totals made up
// by the server (never computed here). A latency (150 ms by default). Query: locale, theme, `latency`, `fail=<path>`
// (that level's first block fails once, e.g. `fail=pomme`). `window.t` gives the grid, the model and the server's log.
import { createGrid } from '/packages/dom/src/index.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { AR_GROUP } from '/packages/dom/src/locales/ar-group.ts';
import { serverSideRows } from '@dzgrid/core/server-side';
import type { DataRequest, DataSource } from '@dzgrid/core/server';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const latency = Number(q.get('latency') ?? 150);
const failing = new Set((q.get('fail') ?? '').split(',').filter(Boolean));
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: number; fruit: string; shop: string; qty: number };
const FRUIT = ar ? ['تفاح', 'إجاص', 'تين', 'تمر', 'عنب', 'برتقال', 'رمان'] : ['pomme', 'poire', 'figue', 'datte', 'raisin', 'orange', 'grenade'];
const SHOPS = 500;
const LEAVES = 2857;
const shop = (s: number) => `${ar ? 'متجر' : 'Boutique'} ${String(s).padStart(3, '0')}`;

const log: { path: readonly unknown[]; block: number; sent: number; answered?: number; end?: string }[] = [];
const data: DataSource<Row> = {
  fetch(req: DataRequest) {
    const p = req.page!;
    const path = req.group?.path ?? [];
    const entry: (typeof log)[number] = { path, block: p.index, sent: performance.now() };
    log.push(entry);
    const desc = req.sort?.[0]?.dir === 'desc';
    return new Promise((ok, no) => {
      const timer = setTimeout(() => {
        entry.answered = performance.now();
        if (p.index === 0 && failing.delete(String(path.at(-1) ?? ''))) return (entry.end = 'failed'), no(new Error('down'));
        entry.end = 'ok';
        const f = path.length ? FRUIT.indexOf(String(path[0])) : -1;
        if (path.length === 0) {
          const groups = FRUIT.slice(p.offset, p.offset + p.size).map((value) => ({ value, count: SHOPS * LEAVES, aggs: { qty: 1_234_567 } }));
          return ok({ groups: desc ? groups.reverse() : groups, total: FRUIT.length, totals: { qty: 8_641_975 } });
        }
        if (path.length === 1) {
          const groups = Array.from({ length: Math.max(0, Math.min(p.size, SHOPS - p.offset)) }, (_, j) => ({ value: shop(p.offset + j), count: LEAVES, aggs: { qty: 2469 + j } }));
          return ok({ groups, total: SHOPS });
        }
        const s = Number(String(path[1]).slice(-3));
        const rows = Array.from({ length: Math.max(0, Math.min(p.size, LEAVES - p.offset)) }, (_, j) => {
          const id = (f * SHOPS + s) * LEAVES + p.offset + j;
          return { id, fruit: String(path[0]), shop: String(path[1]), qty: (id * 37) % 1000 };
        });
        ok({ rows, total: LEAVES });
      }, latency);
      (req.signal as AbortSignal).addEventListener?.('abort', () => {
        clearTimeout(timer);
        entry.end = 'aborted';
        no(new DOMException('aborted', 'AbortError'));
      });
    });
  },
};

const messages = ar ? { locale: AR.locale, text: { ...AR.text, ...AR_GROUP.text } } : { locale: FR.locale, text: { ...FR.text, ...FR_GROUP.text } };
const grid = createGrid<Row>(document.getElementById('host')!, {
  source: serverSideRows<Row>(data),
  getRowId: (r) => r.id,
  columns: [
    { id: 'fruit', header: ar ? 'فاكهة' : 'Fruit', width: 260 },
    { id: 'shop', header: ar ? 'متجر' : 'Boutique', width: 220 },
    { id: 'id', header: ar ? 'رقم' : 'N°', type: 'number', width: 140 },
    { id: 'qty', header: ar ? 'كمية' : 'Quantité', type: 'number', width: 160, aggFunc: 'sum' },
  ],
  messages,
  locale,
  features: [grouping({ by: ['fruit', 'shop'], footers: 'both' })],
});
(window as unknown as { t: unknown }).t = { grid, model: grid.kernel.rows, log };
(window as unknown as { ready: boolean }).ready = true;
