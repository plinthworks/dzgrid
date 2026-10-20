/**
 * The audit screen (step 18, docs/behaviors/audit-screen.md; `docs/phase-3-plugins.md` B2,
 * example 3): its columns, its two configurations and its features, shared by the playground
 * (`playground/audit.ts`), the browser runner's page (`packages/dom/test/browser/audit.ts`) and
 * the jsdom permutations. No CSS: the page brings the theme. The K.8 profile
 * (`perf/profiles/audit.ts`) names every library import of this file (guard:
 * `perf/test/audit-profile.test.ts`).
 */
import { createGrid, type GridEnv, type GridInstance, type GridMessages, type GridSettings } from '@dzgrid/dom';
import { filters, type DateKit, type DateKitName, type FiltersFeature, type SetKit } from '@dzgrid/dom/filters';
import { quickSearch, type QuickSearch } from '@dzgrid/dom/search';
import { pagination } from '@dzgrid/dom/pagination';
import { csvExport, type CsvExport, type CsvExportOptions } from '@dzgrid/dom/export';
import { sourceRows, type DataSource, type SourceModel } from '@dzgrid/core/server';
import { booleanCodecWith, type ColumnDef, type GridEvent, type OperationsInput } from '@dzgrid/core';
import { ACTIONS, type AuditRow } from './fake-server.js';

/** A: the server filters, searches and sorts, the browser pages the set it got. B: everything on the server. */
export type AuditConfig = 'fetched' | 'server';
export type AuditLang = 'fr' | 'en' | 'ar';

export const AUDIT_ZONE = 'Africa/Algiers';
export const PAGE_SIZES = [25, 50, 100] as const;

const WORDS = {
  fr: {
    occurredAt: 'Date et heure', day: 'Jour', actor: 'Acteur', action: 'Action', resource: 'Ressource', outcome: 'Réussi', durationMs: 'Durée (ms)',
    search: 'Rechercher dans le journal', grid: "Journal d'audit", yes: 'Oui', no: 'Non',
    actions: ['Connexion', 'Déconnexion', 'Lecture', 'Création', 'Modification', 'Suppression', 'Export', 'Impression', 'Partage', 'Signature', 'Validation', 'Refus'],
  },
  en: {
    occurredAt: 'Time', day: 'Day', actor: 'Actor', action: 'Action', resource: 'Resource', outcome: 'Succeeded', durationMs: 'Duration (ms)',
    search: 'Search the journal', grid: 'Audit journal', yes: 'Yes', no: 'No',
    actions: ['Sign in', 'Sign out', 'Read', 'Create', 'Update', 'Delete', 'Export', 'Print', 'Share', 'Sign', 'Approve', 'Reject'],
  },
  ar: {
    occurredAt: 'التاريخ والوقت', day: 'اليوم', actor: 'الفاعل', action: 'الإجراء', resource: 'المورد', outcome: 'نجح', durationMs: 'المدة (ملي ثانية)',
    search: 'البحث في السجل', grid: 'سجل التدقيق', yes: 'نعم', no: 'لا',
    actions: ['تسجيل الدخول', 'تسجيل الخروج', 'قراءة', 'إنشاء', 'تعديل', 'حذف', 'تصدير', 'طباعة', 'مشاركة', 'توقيع', 'موافقة', 'رفض'],
  },
} as const;

/** The page's own words (its search field's label, the grid's name), in the screen's language. */
export const auditWords = (lang: AuditLang) => WORDS[lang];

/** Where each operation runs: A pages in the browser, B on the server. */
export const auditOperations = (config: AuditConfig): OperationsInput =>
  config === 'fetched' ? { filter: 'server', quick: 'server', sort: 'server', page: 'client' } : 'server';

/**
 * Seven columns. In B only `occurredAt` sorts (the server sorts by arithmetic on the index and
 * by nothing else, as the owner's server flags its columns); A's server sorts anything.
 */
export function auditColumns(config: AuditConfig, lang: AuditLang): ColumnDef<AuditRow, any>[] {
  const w = WORDS[lang];
  const sorts = config === 'fetched' ? {} : { sortable: false };
  return [
    { id: 'occurredAt', header: w.occurredAt, type: 'instant', width: 190 },
    { id: 'day', header: w.day, type: 'day', width: 120, ...sorts },
    { id: 'actor', header: w.actor, width: 170, ...sorts },
    { id: 'action', header: w.action, type: 'enum', width: 140, enumOptions: ACTIONS.map((value, i) => ({ value, label: w.actions[i]! })), ...sorts },
    { id: 'resource', header: w.resource, width: 170, filter: { kind: 'set' }, ...sorts },
    { id: 'outcome', header: w.outcome, type: 'boolean', width: 100, codec: booleanCodecWith({ true: w.yes, false: w.no }), ...sorts },
    { id: 'durationMs', header: w.durationMs, type: 'number', width: 130, ...sorts },
  ];
}

/** A base bundle with the filters' and the pager's texts spread in (owner decision O1 of step 12). */
export function joinMessages(base: GridMessages, ...more: readonly { readonly text: object }[]): GridMessages {
  return { ...base, text: Object.assign({}, base.text, ...more.map((m) => m.text)) };
}

export interface AuditOptions {
  readonly host: HTMLElement;
  /** The page's search field, labelled by the page (`auditWords(lang).search`). */
  readonly search: HTMLInputElement;
  readonly config: AuditConfig;
  readonly lang: AuditLang;
  /** The base bundle of `lang` joined with its filter and pagination texts (`joinMessages`). */
  readonly messages: GridMessages;
  readonly source: DataSource<AuditRow>;
  readonly direction?: GridSettings<AuditRow>['direction'];
  readonly density?: GridSettings<AuditRow>['density'];
  readonly pageSize?: number;
  readonly onEvent?: (e: GridEvent<AuditRow>) => void;
  /** Tests: a fake geometry, synchronous paints. */
  readonly env?: GridEnv;
  /** Tests: where the lazy chunks come from (`filters()`'s own `import()` otherwise). */
  readonly loadSet?: () => Promise<SetKit>;
  readonly loadDates?: (kit: DateKitName) => Promise<DateKit>;
  readonly clock?: () => number;
  /**
   * The CSV export (step 19): on, with these options over `canExport: true` (the messages must hold
   * the export texts). `button`: the page's own export button, bound (`all`); B's `all` and
   * `selected` go to the server's `exportAll` (pass `server.exportAll`).
   */
  readonly export?: Partial<CsvExportOptions> & { readonly button?: HTMLElement };
}

export interface AuditScreen {
  readonly grid: GridInstance<AuditRow, SourceModel<AuditRow>>;
  readonly filters: FiltersFeature;
  readonly search: QuickSearch;
  /** The export feature, when `export` was given. */
  readonly exporter: CsvExport | null;
  destroy(): void;
}

export function mountAudit(o: AuditOptions): AuditScreen {
  const search = quickSearch();
  const { button, ...xo } = o.export ?? {};
  const exporter = o.export ? csvExport({ canExport: true, ...xo } as CsvExportOptions) : null;
  const feature = filters({ floating: true, popup: true, ...(o.loadSet && { loadSet: o.loadSet }), ...(o.loadDates && { loadDates: o.loadDates }) });
  const grid = createGrid<AuditRow, SourceModel<AuditRow>>(o.host, {
    source: sourceRows(o.source, { paging: 'offset', maxRows: 100_000 }),
    operations: auditOperations(o.config),
    pagination: { pageSize: o.pageSize ?? 50, pageSizes: [...PAGE_SIZES] },
    getRowId: (r) => r.id,
    columns: auditColumns(o.config, o.lang),
    messages: o.messages,
    locale: { fr: 'fr-FR', en: 'en-US', ar: 'ar-DZ' }[o.lang],
    label: WORDS[o.lang].grid,
    timeZone: AUDIT_ZONE,
    direction: o.direction ?? 'auto',
    density: o.density ?? 'comfortable',
    selection: { mode: 'multi', checkbox: true },
    features: [feature, search, pagination(), ...(exporter ? [exporter] : [])],
    ...(o.clock && { clock: o.clock }),
    ...(o.onEvent && { onEvent: o.onEvent }),
  }, o.env);
  const unbind = search.bind(o.search);
  const unbindExport = button && exporter ? exporter.bind(button, { scope: 'all' }) : null;
  return {
    grid, filters: feature, search, exporter,
    destroy() {
      unbind();
      unbindExport?.();
      grid.destroy();
    },
  };
}
