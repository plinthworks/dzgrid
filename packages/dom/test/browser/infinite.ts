// A list loaded in blocks on the browser page (Phase 8 step 4, scripts/browser-infinite.mjs, infinite-scroll.md): data
// set C of the plan — a simulated server of 10⁷ made-up rows (row i computed from i: a fruit, a shop, a quantity), a
// latency (150 ms by default), a known or an unknown total. Query: locale, theme, `latency`, `total=unknown`,
// `fail=<block>` (that block fails once), `stall=1`. `window.t` gives the grid, the model and the server's log to the checks.
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { infiniteRows } from '@dzgrid/core/infinite';
import type { DataRequest, DataSource } from '@dzgrid/core/server';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const latency = Number(q.get('latency') ?? 150);
const known = q.get('total') !== 'unknown';
const failing = new Set((q.get('fail') ?? '').split(',').filter(Boolean).map(Number));
/** `stall=1`: only block 0 and the failing blocks answer; the others stay loading (the axe check). */
const stall = q.get('stall') === '1';
const TOTAL = 10_000_000;
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: number; fruit: string; shop: string; qty: number };
const FRUIT = ar ? ['تفاح', 'إجاص', 'تين', 'تمر', 'عنب', 'برتقال', 'رمان'] : ['pomme', 'poire', 'figue', 'datte', 'raisin', 'orange', 'grenade'];
const row = (i: number): Row => ({ id: i, fruit: FRUIT[i % 7]!, shop: `${ar ? 'متجر' : 'Boutique'} ${(i * 7919) % 500}`, qty: (i * 37) % 1000 });

/** Every request, its block, when it was sent and answered (performance.now()), and how it ended. */
const log: { block: number; sent: number; answered?: number; end?: string }[] = [];
const data: DataSource<Row> = {
  fetch(req: DataRequest) {
    const p = req.page!;
    const entry: { block: number; sent: number; answered?: number; end?: string } = { block: p.index, sent: performance.now() };
    log.push(entry);
    const desc = req.sort?.[0]?.dir === 'desc';
    return new Promise((ok, no) => {
      if (stall && p.index !== 0 && !failing.has(p.index)) return;
      const timer = setTimeout(() => {
        entry.answered = performance.now();
        if (failing.delete(p.index)) return (entry.end = 'failed'), no(new Error('down'));
        const end = Math.min(TOTAL, p.offset + p.size);
        const rows = Array.from({ length: end - p.offset }, (_, j) => row(desc ? TOTAL - 1 - (p.offset + j) : p.offset + j));
        entry.end = 'ok';
        ok(known ? { rows, total: TOTAL } : { rows, hasNext: end < TOTAL });
      }, latency);
      (req.signal as AbortSignal).addEventListener?.('abort', () => {
        clearTimeout(timer);
        entry.end = 'aborted';
        no(new DOMException('aborted', 'AbortError'));
      });
    });
  },
};

const source = infiniteRows<Row>(data);
const grid = createGrid<Row>(document.getElementById('host')!, {
  source,
  getRowId: (r) => r.id,
  columns: [
    { id: 'id', header: ar ? 'رقم' : 'N°', type: 'number', width: 120 },
    { id: 'fruit', header: ar ? 'فاكهة' : 'Fruit', width: 200 },
    { id: 'shop', header: ar ? 'متجر' : 'Boutique', width: 220 },
    { id: 'qty', header: ar ? 'كمية' : 'Quantité', type: 'number', width: 140 },
  ],
  messages: ar ? AR : FR,
  locale,
  selection: { mode: 'multi' },
});
(window as unknown as { t: unknown }).t = { grid, model: grid.kernel.rows, log, TOTAL };
(window as unknown as { ready: boolean }).ready = true;
