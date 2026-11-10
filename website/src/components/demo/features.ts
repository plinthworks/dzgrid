/**
 * What a live demo may switch on, by name, each loaded only by a demo that names it. A demo's page gives plain JSON
 * (`features={['columns', ['grouping', { by: ['island'] }]]}`); this file turns each name into the real feature, with
 * the options a JSON cannot hold (a function, another feature) made here, and its texts in the page's language.
 *
 * The features are made in the order the demo lists them, each seeing the ones made before it (`made`): list `range`
 * before `fill`, `pivot` before `grouping`, the features a menu drives before the menu. Some add a control above the
 * grid (a search field, export buttons): `bar` builds it once the grid exists.
 */
import type { GridInstance } from '@dzgrid/dom';

export type Lang = 'en' | 'fr' | 'ar';
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the features' api are reached by name
/** A grid as the demo holds it: from `createGrid`, or the element's once it is ready. */
export type GetGrid = () => Promise<GridInstance<Any> | null>;
export type Made = {
  feature: unknown;
  /** The feature's texts, merged into the grid's messages. */
  texts?: string[];
  /** Not in the grid's `features` (the pivot: given to `grouping` only). */
  aside?: boolean;
  /** A control above the grid, once the grid exists. */
  bar?: (bar: HTMLElement, grid: GetGrid) => void;
};
type Maker = (o: Record<string, Any>, made: Record<string, Made>, lang: Lang) => Promise<Made>;

/** The texts bundles, by name and language: each module's one export that has `text`. */
const BUNDLES: Record<string, Partial<Record<Lang, () => Promise<Record<string, unknown>>>>> = {
  base: { en: () => import('@dzgrid/dom/locales/en'), fr: () => import('@dzgrid/dom/locales/fr'), ar: () => import('@dzgrid/dom/locales/ar') },
  filters: { en: () => import('@dzgrid/dom/locales/en-filters'), fr: () => import('@dzgrid/dom/locales/fr-filters'), ar: () => import('@dzgrid/dom/locales/ar-filters') },
  pagination: { en: () => import('@dzgrid/dom/locales/en-pagination'), fr: () => import('@dzgrid/dom/locales/fr-pagination'), ar: () => import('@dzgrid/dom/locales/ar-pagination') },
  columns: { en: () => import('@dzgrid/dom/locales/en-columns'), fr: () => import('@dzgrid/dom/locales/fr-columns'), ar: () => import('@dzgrid/dom/locales/ar-columns') },
  'column-menu': { en: () => import('@dzgrid/dom/locales/en-column-menu'), fr: () => import('@dzgrid/dom/locales/fr-column-menu'), ar: () => import('@dzgrid/dom/locales/ar-column-menu') },
  'context-menu': { en: () => import('@dzgrid/dom/locales/en-context-menu'), fr: () => import('@dzgrid/dom/locales/fr-context-menu') },
  pinned: { en: () => import('@dzgrid/dom/locales/en-pinned'), fr: () => import('@dzgrid/dom/locales/fr-pinned'), ar: () => import('@dzgrid/dom/locales/ar-pinned') },
  totals: { en: () => import('@dzgrid/dom/locales/en-totals'), fr: () => import('@dzgrid/dom/locales/fr-totals'), ar: () => import('@dzgrid/dom/locales/ar-totals') },
  detail: { en: () => import('@dzgrid/dom/locales/en-detail'), fr: () => import('@dzgrid/dom/locales/fr-detail') },
  tree: { en: () => import('@dzgrid/dom/locales/en-tree'), fr: () => import('@dzgrid/dom/locales/fr-tree') },
  edit: { en: () => import('@dzgrid/dom/locales/en-edit'), fr: () => import('@dzgrid/dom/locales/fr-edit') },
  editors: { en: () => import('@dzgrid/dom/locales/en-editors'), fr: () => import('@dzgrid/dom/locales/fr-editors') },
  range: { en: () => import('@dzgrid/dom/locales/en-range'), fr: () => import('@dzgrid/dom/locales/fr-range') },
  fill: { en: () => import('@dzgrid/dom/locales/en-fill'), fr: () => import('@dzgrid/dom/locales/fr-fill') },
  rules: { en: () => import('@dzgrid/dom/locales/en-rules'), fr: () => import('@dzgrid/dom/locales/fr-rules') },
  find: { en: () => import('@dzgrid/dom/locales/en-find'), fr: () => import('@dzgrid/dom/locales/fr-find') },
  group: { en: () => import('@dzgrid/dom/locales/en-group'), fr: () => import('@dzgrid/dom/locales/fr-group') },
  pivot: { en: () => import('@dzgrid/dom/locales/en-pivot'), fr: () => import('@dzgrid/dom/locales/fr-pivot') },
  'pivot-bar': { en: () => import('@dzgrid/dom/locales/en-pivot-bar'), fr: () => import('@dzgrid/dom/locales/fr-pivot-bar') },
  'row-drag': { en: () => import('@dzgrid/dom/locales/en-row-drag'), fr: () => import('@dzgrid/dom/locales/fr-row-drag') },
  dock: { en: () => import('@dzgrid/dom/locales/en-dock'), fr: () => import('@dzgrid/dom/locales/fr-dock') },
  'filters-panel': { en: () => import('@dzgrid/dom/locales/en-filters-panel'), fr: () => import('@dzgrid/dom/locales/fr-filters-panel') },
  export: { en: () => import('@dzgrid/dom/locales/en-export'), fr: () => import('@dzgrid/dom/locales/fr-export') },
  print: { en: () => import('@dzgrid/dom/locales/en-print'), fr: () => import('@dzgrid/dom/locales/fr-print') },
};

/** A bundle's texts (`{ key: sentence }`), or the whole base bundle for `base`. */
export async function bundle(name: string, lang: Lang): Promise<Record<string, Any>> {
  const load = BUNDLES[name]?.[lang];
  if (!load) throw new Error(`no ${lang} texts for the demo bundle ${name}`);
  const mod = await load();
  const value = Object.values(mod).find((v) => !!v && typeof v === 'object' && 'text' in (v as object));
  if (!value) throw new Error(`the bundle ${name} (${lang}) has no texts`);
  return value as Record<string, Any>;
}

/** The labels of the controls a demo adds above its grid. */
const SAY: Record<Lang, Record<string, string>> = {
  en: { search: 'Search', csv: 'CSV file', xlsx: 'Excel file', json: 'JSON file', print: 'Print', reset: 'Reset the layout', undo: 'Undo', redo: 'Redo', expand: 'Open all', collapse: 'Close all' },
  fr: { search: 'Rechercher', csv: 'Fichier CSV', xlsx: 'Fichier Excel', json: 'Fichier JSON', print: 'Imprimer', reset: 'Rétablir la disposition', undo: 'Annuler', redo: 'Rétablir', expand: 'Tout ouvrir', collapse: 'Tout fermer' },
  ar: { search: 'بحث', csv: 'ملف CSV', xlsx: 'ملف Excel', json: 'ملف JSON', print: 'طباعة', reset: 'إعادة الترتيب', undo: 'تراجع', redo: 'إعادة', expand: 'فتح الكل', collapse: 'إغلاق الكل' },
};
const button = (bar: HTMLElement, text: string, act: () => void) => {
  const b = bar.ownerDocument.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', act);
  bar.append(b);
  return b;
};
const api = (made: Made | undefined, grid: GridInstance<Any>) => (made?.feature as { api(g: unknown): Any } | undefined)?.api(grid) ?? null;
/** The features a menu or a band can drive, among those made before it. */
const uses = (made: Record<string, Made>, names: Record<string, string>) => {
  const use: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(names)) if (made[name]) use[key] = made[name]!.feature;
  return use;
};

export const FEATURES: Record<string, Maker> = {
  filters: async (o) => {
    // The full entry: day columns get their calendar (@tzslot/*, installed at the root).
    const { filters } = await import('@dzgrid/dom/filters');
    return { feature: filters(o), texts: ['filters'] };
  },
  pagination: async (o) => ({ feature: (await import('@dzgrid/dom/pagination')).pagination(o), texts: ['pagination'] }),
  columns: async (o) => ({ feature: (await import('@dzgrid/dom/columns')).columns(o), texts: ['columns'] }),
  chooser: async () => ({ feature: (await import('@dzgrid/dom/columns-panel')).columnsChooser(), texts: ['columns'] }),
  filtersPanel: async () => ({ feature: (await import('@dzgrid/dom/filters-panel')).filtersPanel(), texts: ['filters-panel'] }),
  columnMenu: async (o, made) => ({
    feature: (await import('@dzgrid/dom/column-menu')).columnMenu({ ...o, use: uses(made, { columns: 'columns', chooser: 'chooser', grouping: 'grouping', pivot: 'pivot', range: 'range', fill: 'fill' }) }),
    texts: ['column-menu'],
  }),
  spans: async () => ({ feature: (await import('@dzgrid/dom/spans')).spans() }),
  groups: async () => ({ feature: (await import('@dzgrid/dom/groups')).groups(), texts: ['columns'] }),
  totals: async () => {
    const [{ pinnedRows }, { totalsRow }] = await Promise.all([import('@dzgrid/dom/pinned-rows'), import('@dzgrid/dom/totals-row')]);
    return { feature: [pinnedRows(), totalsRow()], texts: ['pinned', 'totals'] };
  },
  verticalHeaders: async (o) => ({ feature: (await import('@dzgrid/dom/vertical-headers')).verticalHeaders(o) }),
  wrappedHeaders: async (o) => ({ feature: (await import('@dzgrid/dom/wrapped-headers')).wrappedHeaders(o) }),
  responsive: async (o) => ({ feature: (await import('@dzgrid/dom/responsive')).responsive(o), texts: ['detail'] }),
  columnHover: async () => ({ feature: (await import('@dzgrid/dom/column-hover')).columnHover() }),
  theming: async () => ({ feature: (await import('@dzgrid/dom/theme')).theming() }),
  rules: async () => ({ feature: (await import('@dzgrid/dom/rules')).rules(), texts: ['rules'] }),
  search: async (_o, _made, lang) => {
    const search = (await import('@dzgrid/dom/search')).quickSearch({ highlight: true });
    return {
      feature: search,
      bar: (bar) => {
        const input = bar.ownerDocument.createElement('input');
        input.type = 'search';
        input.placeholder = SAY[lang].search;
        input.setAttribute('aria-label', SAY[lang].search);
        bar.append(input);
        search.bind(input, { debounceMs: 150 });
      },
    };
  },
  find: async (o) => ({ feature: (await import('@dzgrid/dom/find')).find(o), texts: ['find'] }),
  edit: async (o, _made, lang) => {
    const [{ edit }, { editors }, { listEditor }] = await Promise.all([import('@dzgrid/dom/edit'), import('@dzgrid/dom/editors'), import('@dzgrid/dom/editors-list')]);
    const editing = edit(o);
    return {
      feature: [editing, editors({ enterMoves: 'down', list: listEditor })],
      texts: ['edit', 'editors'],
      bar: (bar, grid) => {
        button(bar, SAY[lang].undo, async () => api({ feature: editing }, (await grid())!)?.undo());
        button(bar, SAY[lang].redo, async () => api({ feature: editing }, (await grid())!)?.redo());
      },
    };
  },
  range: async (o) => ({ feature: (await import('@dzgrid/dom/range')).range(o), texts: ['range'] }),
  fill: async (o, made) => {
    if (!made.range) throw new Error('the demo feature fill needs range before it');
    return { feature: (await import('@dzgrid/dom/fill')).fill(made.range.feature as Any, o), texts: ['fill'] };
  },
  tree: async (o, _made, lang) => {
    const { tree } = await import('@dzgrid/dom/tree');
    // `parentField`: the field holding the parent's id (a JSON cannot hold `parentId: (r) => r.parent`).
    const { parentField = 'parent', ...rest } = o;
    const feature = tree<Record<string, unknown>>({ ...rest, parentId: (r) => (r[parentField] as string | null) ?? null });
    return {
      feature,
      texts: ['tree'],
      bar: (bar, grid) => {
        button(bar, SAY[lang].expand, async () => (await grid())?.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api'));
        button(bar, SAY[lang].collapse, async () => (await grid())?.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'api'));
      },
    };
  },
  detail: async (o, _made, lang) => {
    // `field`: the row's list shown in a nested grid, with its `columns`.
    const [{ detail, nestedGrid }, messages, texts] = await Promise.all([import('@dzgrid/dom/detail'), bundle('base', lang), bundle('detail', lang)]);
    const { field, columns, height = 180 } = o;
    const part = nestedGrid<Record<string, unknown>>({
      settings: (c) => ({
        rows: (c.row as Record<string, Record<string, unknown>[]>)[field] ?? [],
        columns,
        getRowId: (r: Record<string, unknown>) => String(r.id),
        messages: { ...messages, text: { ...messages.text, ...texts.text } } as Any,
        locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
      }),
    });
    return { feature: detail({ part, height }), texts: ['detail'] };
  },
  // Given to `grouping({ pivot })`, never in `features` itself.
  pivot: async (o) => ({ feature: (await import('@dzgrid/dom/pivot')).pivot(o), texts: ['pivot'], aside: true }),
  grouping: async (o, made) => ({
    feature: (await import('@dzgrid/dom/grouping')).grouping({ ...o, ...(made.pivot && { pivot: made.pivot.feature as Any }) }),
    texts: ['group'],
  }),
  groupZone: async (o, made) => {
    if (!made.grouping) throw new Error('the demo feature groupZone needs grouping before it');
    return { feature: (await import('@dzgrid/dom/group-zone')).groupZone({ ...o, use: uses(made, { grouping: 'grouping', columns: 'columns' }) as Any }) };
  },
  pivotBar: async (o, made) => ({
    feature: (await import('@dzgrid/dom/pivot-bar')).pivotBar({ ...o, use: uses(made, { grouping: 'grouping', pivot: 'pivot', columns: 'columns' }) as Any }),
    texts: ['pivot-bar'],
  }),
  rowDrag: async (o) => ({ feature: (await import('@dzgrid/dom/row-drag')).rowDrag(o), texts: ['row-drag'] }),
  contextMenu: async (o, made) => {
    const drag = made.rowDrag?.feature as { menuItems(c: unknown): Any[] } | undefined;
    const exporter = made.export?.feature as { xlsx?: unknown } | undefined;
    const use = { ...uses(made, { range: 'range', fill: 'fill', csv: 'export' }), ...(exporter?.xlsx ? { xlsx: exporter.xlsx } : {}) };
    return {
      feature: (await import('@dzgrid/dom/context-menu')).contextMenu({
        ...o,
        use: use as Any,
        ...(drag && { items: (c: unknown, defaults: readonly Any[]) => [...defaults, { separator: true }, ...drag.menuItems(c)] }),
      }),
      texts: ['context-menu'],
    };
  },
  dock: async (o) => ({ feature: (await import('@dzgrid/dom/dock')).dock(o), texts: ['dock'] }),
  export: async (o, _made, lang) => {
    const exporter = (await import('@dzgrid/dom/export')).csvExport({ canExport: true, xlsx: true, ...o });
    return {
      feature: exporter,
      texts: ['export'],
      bar: (bar) => {
        exporter.bind(button(bar, SAY[lang].csv, () => {}), { scope: 'displayed' });
        exporter.bind(button(bar, SAY[lang].xlsx, () => {}), { scope: 'displayed', format: 'xlsx' });
        exporter.bind(button(bar, SAY[lang].json, () => {}), { scope: 'displayed', format: 'json' });
      },
    };
  },
  print: async (o, _made, lang) => {
    const { print } = await import('@dzgrid/dom/print');
    return {
      feature: null,
      texts: ['print'],
      bar: (bar, grid) => {
        button(bar, SAY[lang].print, async () => {
          const g = await grid();
          if (g) void print(g, o);
        });
      },
    };
  },
  state: async (o, _made, lang) => {
    const state = (await import('@dzgrid/dom/state')).gridState(o);
    return {
      feature: state,
      bar: (bar, grid) => {
        button(bar, SAY[lang].reset, async () => api({ feature: state }, (await grid())!)?.reset());
      },
    };
  },
};
