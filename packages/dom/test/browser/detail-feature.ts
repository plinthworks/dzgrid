// `@dzgrid/dom/detail` on the browser page (Phase 4 step 10, scripts/browser.mjs `detailFeatureChecks`):
// `rows` masters (1 000 000 by default) of which 200 are open, spread from row 0 to the last, each panel a
// grid of 30 visits (`nestedGrid`, 240 px); `?content=free`: free text measured (`height: 'auto'`) with a
// button adding a line. Mounts and destroys of the inner grids counted. Query: locale, dir, theme, rows, content.
import { createGrid, definePart } from '/packages/dom/src/index.ts';
import { detail, nestedGrid } from '/packages/dom/src/detail.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_DETAIL } from '/packages/dom/src/locales/fr-detail.ts';
import { AR_DETAIL } from '/packages/dom/src/locales/ar-detail.ts';
import { dataKey, detailKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (ar ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
const free = q.get('content') === 'free';

type Row = { id: number; name: string; n: number };
type Visit = { id: string; day: string; n: number; what: string };
const N = Number(q.get('rows') ?? 1_000_000);
const rows: Row[] = new Array(N);
for (let i = 0; i < N; i++) rows[i] = { id: i, name: `Patient ${i}`, n: (i * 7919) % 1000 };
const masters = Array.from({ length: 200 }, (_, j) => Math.round((j * (N - 1)) / 199));
const key = (i: number) => dataKey(String(i))!;
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_DETAIL : FR_DETAIL).text } };
const count = { mounts: 0, destroys: 0, grids: new Set<unknown>() };
const visits = nestedGrid<Visit>({
  settings: (c) => ({
    rows: Array.from({ length: 30 }, (_, v) => ({ id: `${(c.row as Row).id}-${v}`, day: `2026-01-${String((v % 28) + 1).padStart(2, '0')}`, n: (v * 13) % 30, what: ar ? 'فحص' : 'Consultation' })),
    getRowId: (r) => r.id, messages, locale, label: `${ar ? 'زيارات' : 'Visites de'} ${(c.row as Row).name}`,
    columns: [{ id: 'day', header: ar ? 'اليوم' : 'Jour', type: 'day', width: 140 }, { id: 'n', header: 'N', type: 'number', width: 90 }, { id: 'what', header: ar ? 'السبب' : 'Motif', width: 200 }],
  }),
  onGrid: (g) => {
    count.mounts++;
    count.grids.add(g);
    const was = g.destroy;
    g.destroy = () => (count.destroys++, count.grids.delete(g), was.call(g));
  },
});
const notes = definePart('detail', {
  mount(host, c) {
    const box = document.createElement('div');
    box.className = 'free';
    for (let n = 0; n <= (c.row as Row).id % 3; n++) box.append(Object.assign(document.createElement('p'), { textContent: `${ar ? 'ملاحظة' : 'Note'} ${n + 1}` }));
    const add = Object.assign(document.createElement('button'), { type: 'button', textContent: ar ? 'إضافة' : 'Ajouter' });
    add.addEventListener('click', () => add.before(Object.assign(document.createElement('p'), { textContent: 'Une ligne de plus' })));
    box.append(add);
    host.append(box);
    count.mounts++;
    return { focus: () => (add.focus(), true), destroy: () => void count.destroys++ };
  },
});
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => String(r.id), messages, locale, label: 'Patients',
  columns: [
    { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 200 },
    { id: 'n', header: 'N', type: 'number', width: 100 },
    ...Array.from({ length: 4 }, (_, k) => ({ id: `c${k}`, header: `C${k}`, width: 120, value: (r: Row) => (r.n * (k + 3)) % 97 })),
  ],
  features: [detail<Row>(free ? { part: notes, height: 'auto' } : { part: visits })],
});
grid.kernel.dispatch({ type: 'rows.expand', rows: (free ? [0, 1, 2] : masters).map(key), expanded: true }, 'host');
const ctx = (grid as any).context;
(window as any).t = { grid, ctx, masters, key, x: (i: number) => detailKey(key(i)), count, scrollTo: (l: number) => ctx.scroll.scrollTo(l) || ctx.schedule(), logicalTop: () => ctx.scroll.logicalTop };
(window as any).ready = true;
