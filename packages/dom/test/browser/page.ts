// The real grid, from the sources, for scripts/browser.mjs. Query: rows, locale, dir, theme, select, box;
// spans=1 merges the city (runs of 5 000 rows) with the spans feature, pin=1 pins it at the start;
// groups=1 puts the columns in groups (two levels) with the spans feature; filters=1&floating=1 the floating filter row;
// filters=1&popup=1 the header's filter buttons and popup, with a boolean column (step 13);
// dates=1 an instant column around Paris's two clock changes, the grid's zone (`zone`, Europe/Paris by default),
// `numerals`, and a clock the runner can move (`t.offset`); dates=fail a date kit that never loads (step 14).
import { createGrid } from '/packages/dom/src/index.ts';
import { EN } from '/packages/dom/src/locales/en.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const N = Number(q.get('rows') ?? 100_000);
const locale = q.get('locale') ?? 'fr-FR';
const base = locale.startsWith('ar') ? AR : locale.startsWith('fr') ? FR : EN;
// `filters=1`: the filters feature, its texts spread into the bundle; `floating=1` its floating row (step 12).
const withFilters = !!q.get('filters');
const filterTexts = withFilters ? (await import(`/packages/dom/src/locales/${locale.slice(0, 2)}-filters.ts`)) : null;
const messages = filterTexts ? { ...base, text: { ...base.text, ...(Object.values(filterTexts)[0] as { text: object }).text } } : base;
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (locale.startsWith('ar') ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: number; name: string; city: string; amount: number; day: string; paid: boolean; at?: string };
const dates = q.get('dates');
// Every 15 minutes from 2026-10-18 (even rows) and from 2026-03-27 (odd rows), in UTC.
const atOf = (i: number) => new Date(Date.UTC(2026, i % 2 ? 2 : 9, i % 2 ? 27 : 18) + Math.floor(i / 2) * 900_000).toISOString();
const CITIES_FR = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif'];
const CITIES_AR = ['الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'البليدة', 'سطيف'];
const cities = locale.startsWith('ar') ? CITIES_AR : CITIES_FR;
// Rows are made from their index, small: a million of them must fit.
const rows: Row[] = Array.from({ length: N }, (_, i) => ({
  id: i,
  name: locale.startsWith('ar') ? `مريض ${i}` : `Patient ${i}`,
  city: cities[(q.get('spans') ? Math.floor(i / 5000) : i) % cities.length]!,
  amount: ((i * 7919) % 100000) / 100,
  paid: i % 3 === 0,
  day: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  ...(dates && { at: atOf(i) }),
}));

const columns = [
  { id: 'name', header: base === AR ? 'الاسم' : 'Nom', pinned: 'start' as const, width: 140 },
  { id: 'city', header: base === AR ? 'المدينة' : 'Ville', width: 130, headerTooltip: base === AR ? 'مدينة الإقامة' : 'Ville de résidence', ...(q.get('spans') && { merge: true as const }), ...(q.get('pin') && { pinned: 'start' as const }) },
  { id: 'amount', header: base === AR ? 'المبلغ' : 'Montant', type: 'number' as const, width: 120 },
  { id: 'day', header: base === AR ? 'اليوم' : 'Jour', type: 'day' as const, width: 120 },
  ...(dates ? [{ id: 'at', header: base === AR ? 'الموعد' : 'Rendez-vous', type: 'instant' as const, width: 170 }] : []),
  ...(q.get('popup') ? [{ id: 'paid', header: base === AR ? 'مدفوع' : 'Payé', type: 'boolean' as const, width: 100 }] : []),
  ...Array.from({ length: 16 }, (_, k) => ({ id: `x${k}`, header: `C${k}`, width: 110, value: (r: Row) => (r.id * (k + 3)) % 997 })),
  { id: 'ref', header: 'Réf', pinned: 'end' as const, width: 90, value: (r: Row) => `R-${r.id}` },
];

// Patient over name and city (the start-pinned name); Finances over amount and day; Données over
// Mesures (C0 to C3) and C4, C5; the other columns and Réf have no group (their headers stretched up).
const tree = q.get('groups')
  ? [
      { id: 'g-patient', header: 'Patient', children: columns.slice(0, 2) },
      { id: 'g-fin', header: 'Finances', children: columns.slice(2, 4) },
      { id: 'g-data', header: 'Données', children: [{ id: 'g-mes', header: 'Mesures', children: columns.slice(4, 8) }, ...columns.slice(8, 10)] },
      ...columns.slice(10),
    ]
  : columns;

const mode = (q.get('select') ?? 'multi') as 'none' | 'single' | 'multi';
const events: string[] = [];
for (const type of ['blur', 'focusout', 'focusin']) document.addEventListener(type, (e) => events.push(`${type} ${(e.target as HTMLElement).dataset?.['col'] ?? (e.target as HTMLElement).id ?? ''}`), true);

const host = document.getElementById('host')!;
const features = q.get('spans') || q.get('groups') ? [(await import('/packages/dom/src/spans.ts')).spans()] : [];
// `slots=1`: an overlay part with a link and a field (they must take the pointer though the overlay does not).
let parts: Record<string, unknown> | undefined;
if (q.get('slots')) {
  const { slots } = await import('/packages/dom/src/slots.ts');
  const { definePart } = await import('/packages/dom/src/part.ts');
  features.push(slots() as never);
  parts = {
    overlay: definePart('overlay', {
      mount(el) {
        const p = document.createElement('p');
        p.innerHTML = 'See <a href="#help" class="help">help</a> <input class="ask" aria-label="ask">';
        el.append(p);
        return {};
      },
    }),
  };
}
const fail = dates === 'fail' && { loadDates: () => Promise.reject(new Error('the date kit is unreachable (dates=fail)')) };
if (withFilters) features.push((await import('/packages/dom/src/filters.ts')).filters({ floating: q.get('floating') === '1', popup: q.get('popup') === '1', ...fail }) as never);
// The clock the date shortcuts count from: the machine's, moved by `t.offset` (ms).
const clock = { offset: 0 };
const grid = createGrid<Row>(host, {
  rows, getRowId: (r) => r.id, columns: tree, messages, locale, features, ...(parts && { parts }),
  ...(dates && { timeZone: q.get('zone') ?? 'Europe/Paris', clock: () => Date.now() + clock.offset }),
  ...(q.get('numerals') && { numerals: q.get('numerals') as 'latn' | 'locale' }),
  selection: { mode, checkbox: q.get('box') === '1', click: true },
});

(window as any).t = {
  grid, N, events, dataKey, rows, clock,
  key: (id: number) => dataKey(id)!,
  indexOf: (el: Element) => {
    const row = el.closest('.dzg-row');
    if (!row) return -1;
    return Number(row.getAttribute('aria-rowindex')) - 2;
  },
  scrollTo: (logical: number) => (grid as any).scroll.scrollTo(logical),
  logicalTop: () => (grid as any).scroll.logicalTop,
  mapper: () => (grid as any).scroll.mapper,
};
(window as any).ready = true;
