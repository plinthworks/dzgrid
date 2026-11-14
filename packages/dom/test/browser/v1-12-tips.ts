// Tooltips and popovers in real browsers (scripts/browser-1-12.mjs (11); docs/behaviors/tooltips-popovers.md):
// `?lang=ar`, `?dark=1`, `?css=unlayered`, `?preflight=1`. Made-up rows: a seed library's packets.
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, definePart, type GridMessages } from '../../src/index.js';
import { slots } from '../../src/slots.js';
import { filters } from '../../src/filters-base.js';
import { tooltip, tooltips, safeHtml, type TooltipOptions } from '../../src/tooltip.js';
import { popover, type PopoverOptions } from '../../src/popover.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_FILTERS } from '../../src/locales/fr-filters.js';
import { AR_FILTERS } from '../../src/locales/ar-filters.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

const $ = (id: string) => document.getElementById(id)!;
type P = { id: string; seed: string; grams: number };
const rows: P[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, seed: ar ? `بذرة ${i}` : `Graine ${i}`, grams: (i * 37) % 1000 }));
/** A cell's own button with a popover about its row (a cell's action icon). */
const act = definePart('cell', {
  mount(host, c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act';
    b.textContent = '⋯';
    b.setAttribute('aria-label', ar ? 'تفاصيل' : 'Détails');
    host.append(b);
    let row = c.row as P;
    const h = popover(b, { content: () => Object.assign(document.createElement('p'), { className: 'about', textContent: row.seed }) });
    return { update(n) { row = n.row as P; }, destroy() { h.destroy(); b.remove(); } };
  },
});
const columns: ColumnDef<P, any>[] = [
  { id: 'seed', header: ar ? 'البذرة' : 'Graine', width: 160, filter: { kind: 'text' }, tooltip: (v) => ({ html: `<b>${v}</b><img src="x" onerror="window.__hit=1"><script>window.__hit=1</script>` }) },
  { id: 'grams', header: ar ? 'غرام' : 'Grammes', type: 'number', width: 140, tooltip: (v: number | null) => ({ text: `${v} g`, tone: (v ?? 0) > 500 ? 'danger' : 'success' }) },
  { id: 'act', header: '', width: 60, value: () => '', ui: { cell: 'act' } },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text } };
const told: Problem[] = [];
const grid = createGrid<P>($('host'), {
  rows, getRowId: (p) => p.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', direction: ar ? 'rtl' : 'ltr',
  label: ar ? 'البذور' : 'Graines', tooltips: { delayMs: 0, header: true, html: safeHtml }, parts: { act },
  features: [slots(), filters({ floating: false }), tooltips()],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});

const tips = new Map<string, ReturnType<typeof tooltip>>();
/** A tooltip on an element of the page, (re)made with these options. */
const tip = (id: string, o: Partial<TooltipOptions>) => {
  tips.get(id)?.destroy();
  const h = tooltip($(id), { content: ar ? 'نص المساعدة' : 'Texte d’aide un peu long', delayMs: 0, ...o });
  tips.set(id, h);
  h.show();
  return h;
};
const pops = new Map<string, ReturnType<typeof popover>>();
const pop = (id: string, o: Partial<PopoverOptions>) => {
  pops.get(id)?.destroy();
  const h = popover($(id), { content: '', ...o });
  pops.set(id, h);
  return h;
};
/** The form a popover holds, and a nested popover's trigger in it. */
const form = () => {
  const f = document.createElement('div');
  const label = document.createElement('label');
  label.append(ar ? 'ملاحظة ' : 'Note ', Object.assign(document.createElement('input'), { className: 'note' }));
  const inner = Object.assign(document.createElement('button'), { type: 'button', className: 'inner', textContent: ar ? 'المزيد' : 'Plus' });
  const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'ok', textContent: 'OK' });
  f.append(label, inner, ok);
  return f;
};
Object.assign(window, { grid, told, tip, tips, pop, pops, form, popover, ready: true });
