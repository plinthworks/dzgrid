// The real grid, from the sources, for scripts/browser.mjs. Query: rows, locale, dir, theme, select, box;
// spans=1 merges the city (runs of 5 000 rows) with the spans feature, pin=1 pins it at the start;
// groups=1 puts the columns in groups (two levels) with the spans feature; filters=1&floating=1 the floating filter row;
// filters=1&popup=1 the header's filter buttons and popup, with a boolean column (step 13);
// dates=1 an instant column around Paris's two clock changes, the grid's zone (`zone`, Europe/Paris by default),
// `numerals`, and a clock the runner can move (`t.offset`); dates=fail a date kit that never loads (step 14);
// sets=1 a "Commune" column of 2 000 values asking for the value list (`filter.kind: 'set'`) and a
// "Statut" enum column that does not (no button, owner Q2); setfail=1 a set chunk that never loads (step 15).
// search=1 a labelled search field above the grid (`#q`), bound with quickSearch() before the grid is made (step 16).
// paging=client pages the rows with the footer (pagination(), step 17), size `size` (50); paging=cursor serves them from
// a server in memory by cursor without a total (`delay` ms, 0 by default; `t.fetches` counts its requests, `t.failNext`
// fails the next one); parts=1 the ready cell parts (badge and yes/no, step 20); two=1 adds a second grid with the footer, labelled, under the first;
// rules=1 a selection rule (rows 4 and 8 exclude each other, at most `t.context.max`), and "Nom"'s header with its own search box (step 21).
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
const paging = q.get('paging');
const pagingTexts = paging ? (await import(`/packages/dom/src/locales/${locale.slice(0, 2)}-pagination.ts`)) : null;
// `parts=1`: the ready cell parts (step 20): a badge column over every tone, a yes/no column, their texts.
const cellParts = q.get('parts') ? await (await import('./parts.ts')).partsSetup(locale.slice(0, 2) as 'fr') : null;
// `rules=1`: the selection rule and the header's search box (step 21), their texts and features.
const ruled = q.get('rules') ? await (await import('./rules.ts')).rulesSetup(locale.slice(0, 2) as 'fr') : null;
const more = [...[filterTexts, pagingTexts].flatMap((m) => (m ? [(Object.values(m)[0] as { text: object }).text] : [])), ...(cellParts ? [cellParts.texts] : []), ...(ruled ? ruled.texts : [])];
const messages = more.length ? { ...base, text: Object.assign({}, base.text, ...more) } : base;
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (locale.startsWith('ar') ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
// `reset=1` (feedback pass A): an unlayered reset like Tailwind 3's preflight, which beats every layered rule.
if (q.get('reset')) document.head.append(Object.assign(document.createElement('style'), { textContent: '*,::before,::after{border-width:0;border-style:solid}' }));

type Row = { id: number; name: string; city: string; amount: number; day: string; paid: boolean; at?: string; commune?: string | null; status?: string };
const sets = q.get('sets');
/** 2 000 place names (one row in 97 blank), Arabic ones in an Arabic grid. */
const communeOf = (i: number) => (i % 97 === 0 ? null : locale.startsWith('ar') ? `بلدية ${i % 2000}` : `${i % 50 ? 'Commune' : 'Écart'} ${String(i % 2000).padStart(4, '0')}`);
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
  ...(sets && { commune: communeOf(i), status: ['open', 'closed', 'held'][i % 3]! }),
}));

// `fb=1` (the feedback pass, docs/phase-6-steps/feedback-plan.md): « Rendez-vous » with one operator (between days: no
// « Condition », the period form in the popup), « Commune » drawn as pills (a `filterOption` part, its tones in
// `ui.data`), « Nom » with a header search part over its filter (the doc's example), « Jour » a 44-character name.
const fb = q.get('fb') === '1';
const columns = [
  { id: 'name', header: base === AR ? 'الاسم' : 'Nom', pinned: 'start' as const, width: ruled || fb ? 220 : 140, ...(ruled && { ui: { header: 'nameSearch' } }), ...(fb && { ui: { header: 'hsearch' } }) },
  { id: 'city', header: base === AR ? 'المدينة' : 'Ville', width: 130, headerTooltip: base === AR ? 'مدينة الإقامة' : 'Ville de résidence', ...(q.get('spans') && { merge: true as const }), ...(q.get('pin') && { pinned: 'start' as const }) },
  ...(sets ? [
    { id: 'commune', header: base === AR ? 'البلدية' : 'Commune', width: 150, filter: { kind: 'set' as const, ...(fb && { optionPart: 'pill' }) }, ...(fb && { ui: { data: { tones: ['a', 'b'] } } }) },
    { id: 'status', header: base === AR ? 'الحالة' : 'Statut', type: 'enum' as const, width: 110, enumOptions: [{ value: 'open', label: base === AR ? 'مفتوح' : 'Ouvert' }, { value: 'closed', label: base === AR ? 'مغلق' : 'Fermé' }, { value: 'held', label: base === AR ? 'معلق' : 'Suspendu' }] },
  ] : []),
  { id: 'amount', header: base === AR ? 'المبلغ' : 'Montant', type: 'number' as const, width: 120 },
  { id: 'day', header: fb ? (base === AR ? 'يوم آخر زيارة إلى المركز الصحي في المدينة' : 'Jour de la dernière visite au centre de santé') : base === AR ? 'اليوم' : 'Jour', type: 'day' as const, width: 120 },
  ...(dates ? [{ id: 'at', header: base === AR ? 'الموعد' : 'Rendez-vous', type: 'instant' as const, width: 170, ...(fb && { filter: { kind: 'instant', ops: ['betweenDays'] } }) }] : []),
  ...(cellParts ? cellParts.columns : []),
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
if (cellParts) parts = { ...parts, ...cellParts.parts };
if (fb) {
  const { slots } = await import('/packages/dom/src/slots.ts');
  const { definePart } = await import('/packages/dom/src/part.ts');
  if (!q.get('slots')) features.push(slots() as never);
  parts = {
    ...parts,
    // The set filter's rows as pills (feedback pass C): the page paints the content, the grid keeps the row.
    pill: definePart('filterOption', {
      mount(el, c) {
        const pill = document.createElement('span');
        pill.className = 'fb-pill';
        const n = document.createElement('span');
        n.className = 'fb-n';
        el.append(pill, n);
        // The count drawn by CSS from `data-n`, as the grid's own row does: the visible text stays the label, inside the
        // option's name « label, count » (WCAG 2.5.3, axe label-content-name-mismatch).
        const draw = (x: typeof c) => { pill.textContent = x.label; pill.dataset['on'] = String(x.selected); n.dataset['n'] = x.countText; };
        draw(c);
        return { update: draw };
      },
    }),
    // A header search over the column's filter (feedback pass I, docs/behaviors/parts.md « A header search »).
    hsearch: definePart('header', {
      mount(el, c) {
        const name = document.createElement('span');
        const input = document.createElement('input');
        input.className = 'fb-hsearch';
        input.style.cssText = 'flex:1;min-inline-size:0;margin-inline-start:.25rem';
        el.style.cssText = 'display:flex;flex:1;align-items:center';
        el.append(name, input);
        let cur = c;
        let last: unknown;
        let dropped = -1;
        input.addEventListener('input', () => cur.filter?.set(input.value ? { type: 'text', op: 'contains', value: input.value } : null));
        const draw = (x: typeof c) => {
          cur = x;
          name.textContent = x.label;
          input.setAttribute('aria-label', `${base === AR ? 'البحث في' : 'Chercher dans'} ${x.label}`);
          const state = x.filter?.state ?? null;
          const v = (state as { value?: string } | null)?.value ?? '';
          if ((state !== last || x.filter?.dropped !== dropped) && v !== input.value) input.value = v;
          last = state;
          dropped = x.filter?.dropped ?? 0;
        };
        draw(c);
        return { update: draw, focus: () => (input.focus(), true) };
      },
    }),
  };
  document.head.append(Object.assign(document.createElement('style'), { textContent: '.fb-pill{padding:2px 10px;border-radius:9999px;outline:1px solid var(--tz-accent);color:var(--tz-fg)}.fb-pill[data-on=true]{background:color-mix(in srgb,var(--tz-accent) 20%,var(--tz-bg))}.fb-n{margin-inline-start:auto;color:var(--tz-fg-muted)}.fb-n::before{content:attr(data-n)}' }));
}
if (ruled) (parts = { ...parts, ...ruled.parts }), features.push(...(ruled.features as never[]));
const context = { max: 5 };
const fail = { ...(dates === 'fail' && { loadDates: () => Promise.reject(new Error('the date kit is unreachable (dates=fail)')) }), ...(q.get('setfail') && { loadSet: () => Promise.reject(new Error('the set chunk is unreachable (setfail=1)')) }) };
if (q.get('search')) {
  const { quickSearch } = await import('/packages/dom/src/search.ts');
  const search = quickSearch();
  features.push(search as never);
  const label = document.createElement('label');
  label.className = 'mark';
  label.textContent = base === AR ? 'البحث في الجدول ' : base === FR ? 'Rechercher dans la grille ' : 'Search the grid ';
  const box = document.createElement('input');
  box.type = 'search';
  box.id = 'q';
  label.append(box);
  host.before(label);
  search.bind(box);
}
const filtering = withFilters ? (await import('/packages/dom/src/filters.ts')).filters({ floating: q.get('floating') === '1', popup: q.get('popup') === '1', ...fail }) : null;
if (filtering) features.push(filtering as never);
// `toggle=1`: a "Filter row" button with its own words, `toggle=icon` one without (the bundle names it), bound to the
// floating row (Phase 4 step 12).
if (filtering && q.get('toggle')) {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'floating';
  if (q.get('toggle') === 'icon') b.innerHTML = '<svg width="16" height="16" aria-hidden="true" focusable="false"><path d="M1 2h14L9 9v5l-2 1V9z" fill="currentColor"/></svg>';
  else b.textContent = base === AR ? 'صف المرشحات' : base === FR ? 'Ligne de filtres' : 'Filter row';
  b.style.minInlineSize = b.style.minBlockSize = '24px';
  host.before(b);
  filtering.floating.bind(b);
}
// Paging (step 17): the footer, and for `cursor` a server in memory that does not say its total.
const served = { fetches: 0, failNext: false };
let data: Record<string, unknown> = { rows };
if (paging) {
  const { pagination } = await import('/packages/dom/src/pagination.ts');
  features.push(pagination() as never);
  data = { rows, pagination: { pageSize: Number(q.get('size') ?? 50) } };
}
if (paging === 'cursor') {
  const { sourceRows } = await import('/packages/core/src/server.ts');
  const delay = Number(q.get('delay') ?? 0);
  const fetch = (req: any) => {
    served.fetches++;
    const fail = served.failNext;
    served.failNext = false;
    return new Promise((done, no) => setTimeout(() => {
      if (fail) return no(new Error('down (t.failNext)'));
      const at = req.page.cursor ? Number(req.page.cursor) : 0;
      const page = rows.slice(at, at + req.page.size);
      const more = at + req.page.size < rows.length;
      done({ rows: page, hasNext: more, ...(more && { nextCursor: String(at + req.page.size) }) });
    }, delay));
  };
  data = { source: sourceRows({ fetch } as never, { paging: 'cursor' }), operations: 'server', pagination: { pageSize: Number(q.get('size') ?? 50) } };
}
// The clock the date shortcuts count from: the machine's, moved by `t.offset` (ms); `clock=<ISO>` starts it there, so
// a run never depends on the day it is run (the « midnight in Paris » check failed on the real 24 October).
const clock = { offset: q.get('clock') ? Date.parse(q.get('clock')!) - Date.now() : 0 };
const grid = createGrid<Row>(host, {
  ...data, getRowId: (r) => r.id, columns: tree, messages, locale, features, ...(parts && { parts }),
  ...(dates && { timeZone: q.get('zone') ?? 'Europe/Paris', clock: () => Date.now() + clock.offset }),
  ...(q.get('numerals') && { numerals: q.get('numerals') as 'latn' | 'locale' }),
  selection: { mode, checkbox: q.get('box') === '1', click: true, ...(ruled && { canSelect: ruled.canSelect as never }) },
  ...(ruled && { context }),
});

if (q.get('two')) {
  const second = document.createElement('div');
  second.style.blockSize = '240px';
  host.after(second);
  const { pagination } = await import('/packages/dom/src/pagination.ts');
  createGrid<Row>(second, { rows: rows.slice(0, 200), getRowId: (r) => r.id, columns: columns.slice(0, 3), messages, locale, label: base === AR ? 'المواعيد' : 'Rendez-vous', features: [pagination() as never], pagination: { pageSize: 25 } });
}

(window as any).t = {
  served, filters: filtering,
  grid, N, events, dataKey, rows, clock, context,
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
