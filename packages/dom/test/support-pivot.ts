// Shared fixtures for the pivot (Phase 10, docs/behaviors/pivot.md 17–30). Made-up data: a bookshop's sales, by region and
// month, an amount and a quantity. Expectations in the tests are written by hand from these rows.
import { groupKey, type ColumnDef, type RowKey, type RowModel } from '@dzgrid/core';
import type { GridInstance } from '../src/grid.js';
import { spans } from '../src/spans.js';
import { pivot, type PivotFeature, type PivotFeatureOptions } from '../src/pivot.js';
import type { GridFeature } from '../src/features.js';
import type { GridMessages } from '../src/messages.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { FR_GROUP } from '../src/locales/fr-group.js';
import { AR_GROUP } from '../src/locales/ar-group.js';
import { EN_PIVOT } from '../src/locales/en-pivot.js';
import { FR_PIVOT } from '../src/locales/fr-pivot.js';
import { AR_PIVOT } from '../src/locales/ar-pivot.js';
import { gmake, type GMake } from './support-grouping.js';
import type { GroupingFeatureOptions } from '../src/grouping.js';

export type S = { id: string; title: string; region: string | null; month: string; amount: number; qty: number; sold: string; code: string };

/**
 * Nord: r1 Jan 10 (qty 1), r2 Feb 5 (qty 2); Sud: r3 Jan 2 (qty 3, sold in March), r4 Jan 4 (qty 1); no region: r5 Feb 1.
 * Months are texts: « Feb » before « Jan » in English order.
 */
export const SALES: S[] = [
  { id: 'r1', title: 'Atlas', region: 'Nord', month: 'Jan', amount: 10, qty: 1, sold: '2026-01-05', code: 'secret' },
  { id: 'r2', title: 'Bleu', region: 'Nord', month: 'Feb', amount: 5, qty: 2, sold: '2026-02-06', code: 'secret' },
  { id: 'r3', title: 'Citron', region: 'Sud', month: 'Jan', amount: 2, qty: 3, sold: '2026-03-07', code: 'secret' },
  { id: 'r4', title: 'Dune', region: 'Sud', month: 'Jan', amount: 4, qty: 1, sold: '2026-01-08', code: 'secret' },
  { id: 'r5', title: 'Écume', region: null, month: 'Feb', amount: 1, qty: 1, sold: '2026-02-09', code: 'secret' },
];

export const SALE_COLUMNS: ColumnDef<S, any>[] = [
  { id: 'title', header: 'Title', width: 140 },
  { id: 'region', header: 'Region', width: 120 },
  { id: 'month', header: 'Month', width: 100 },
  { id: 'amount', header: 'Amount', type: 'number', width: 110, aggFunc: 'sum' },
  { id: 'qty', header: 'Qty', type: 'number', width: 90 },
  { id: 'sold', header: 'Sold', type: 'day', width: 120 },
  { id: 'code', header: 'Code', width: 90, hidden: true },
];

const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const PIVOT_BUNDLES = { en: join(EN, EN_GROUP, EN_PIVOT), fr: join(FR, FR_GROUP, FR_PIVOT), ar: join(AR, AR_GROUP, AR_PIVOT) } as const;

/** A created column's id, as the core makes it: `~p` + the pivot columns' and values' key segments + the value column. */
export const made = (pairs: readonly (readonly [string, string])[], value: string): string => '~p' + groupKey(pairs.flat()).slice(2) + groupKey([value]).slice(2);
/** A created band's id (the same, without the value). */
export const band = (pairs: readonly (readonly [string, string])[]): string => '~b' + groupKey(pairs.flat()).slice(2);
export const LABEL = '~p:rows';
export const NORD: RowKey = groupKey(['region', 'tNord']);
export const SUD: RowKey = groupKey(['region', 'tSud']);
export const BLANK: RowKey = groupKey(['region', '']);
export const JAN = made([['month', 'tJan']], 'amount');
export const FEB = made([['month', 'tFeb']], 'amount');

export interface PMake extends Omit<GMake, 'grouping' | 'lang'> {
  readonly pivot?: PivotFeatureOptions;
  /** A pivot feature made by the test (its `make` spied). */
  readonly feature?: PivotFeature;
  readonly grouping?: Omit<GroupingFeatureOptions, 'pivot'>;
  readonly lang?: keyof typeof PIVOT_BUNDLES;
  /** No `spans()` (header bands not drawn). */
  readonly noSpans?: boolean;
}

/** A grid of sales grouped by region, pivoted by month, the amount summed; `spans()` loaded; synchronous paints. */
export function pmake(o: PMake = {}) {
  const p: PivotFeature = o.feature ?? pivot(o.pivot ?? { columns: ['month'], values: { amount: 'sum' } });
  const t = gmake({
    ...o,
    // gmake is typed for the grouping fixture's rows; these are the sales'.
    rows: (o.rows ?? SALES) as never,
    // The same: the sales' columns.
    columns: (o.columns ?? SALE_COLUMNS) as never,
    grouping: { by: ['region'], ...o.grouping, pivot: p },
    before: [...(o.noSpans ? [] : [spans()]), ...((o.before ?? []) as GridFeature[])],
    // The sales' settings, typed for the sales' rows.
    settings: { messages: PIVOT_BUNDLES[o.lang ?? 'en'], ...(o.lang === 'ar' && { direction: 'rtl' as const }), ...(o.settings as Partial<GridSettings<any>>) } as never,
  });
  const papi = () => p.api(t.g)!;
  const visible = () => t.ctx.columns.visible().map((c) => c.id);
  const cellText = (key: RowKey | string, col: string) => t.cell(key as string, col)?.textContent ?? null;
  return { ...t, g: t.g as unknown as GridInstance<S, RowModel<S>>, p, papi, visible, cellText };
}
