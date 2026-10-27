// Shared fixtures for `@dzgrid/dom/pinned-rows` (Phase 6 step 8b-1, step08b-plan.md §5): a grid with pinned rows on the
// fake geometry of support-edit (rows 32 px at 16 px text, a 320 px body view), optionally with edit() and editors().
import type { ColumnDef, RowKey } from '@dzgrid/core';
import { pinnedKey } from '@dzgrid/core';
import type { SaveHandler } from '@dzgrid/core/edit';
import type { GridFeature } from '../src/features.js';
import type { GridSettings } from '../src/settings.js';
import { pinnedRows, type PinnedRowsFeature } from '../src/pinned-rows.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { FR_PINNED } from '../src/locales/fr-pinned.js';
import { AR_PINNED } from '../src/locales/ar-pinned.js';
import { BASE, emake, join, rowsOf, type R } from './support-edit.js';
import { ed, EDIT, EDITORS, ECOLS } from './support-editors.js';
import type { EditorsOptions } from '../src/editors.js';

export { cleanup, k, rowsOf, type R } from './support-edit.js';
export const PINNED = { en: EN_PINNED, fr: FR_PINNED, ar: AR_PINNED } as const;

export const T = (id: string): RowKey => pinnedKey('top', id)!;
export const B = (id: string): RowKey => pinnedKey('bottom', id)!;
/** A reference row (top) and a totals row (bottom), in the shape of `rowsOf`. */
export const ref = (id = 'ref'): R => ({ id, name: 'Reference', n: 10, s: 'ref', q: 50 });
export const tot = (id = 'tot', n = 999): R => ({ id, name: 'Total', n, s: 'sum', q: 0 });

export interface PMake {
  readonly top?: R[];
  readonly bottom?: R[];
  readonly rows?: R[];
  readonly columns?: ColumnDef<R, any>[];
  readonly lang?: 'en' | 'fr' | 'ar';
  readonly block?: number;
  readonly settings?: Partial<GridSettings<R>>;
  /** Other features, after the pinned rows' (default none). */
  readonly more?: GridFeature[];
}

/** A grid with pinned rows only (no editing). */
export function pm(o: PMake = {}) {
  const lang = o.lang ?? 'en';
  const pins = pinnedRows<R>({ ...(o.top && { top: o.top }), ...(o.bottom && { bottom: o.bottom }) });
  const m = emake({
    rows: o.rows ?? rowsOf(200), ...(o.columns && { columns: o.columns }), ...(o.block && { block: o.block }),
    settings: { features: [pins, ...(o.more ?? [])], messages: join(BASE[lang], PINNED[lang]), ...(lang === 'ar' && { direction: 'rtl' }), ...o.settings },
  });
  return { ...m, pins, ...bands(m.host, m.ctx), api: pins.api(m.g)! };
}

/** A grid with pinned rows, edit() and editors() (the editors' fixtures). */
export function pe(o: PMake & { save?: SaveHandler<R>; order?: 'first' | 'last'; options?: EditorsOptions } = {}) {
  const lang = o.lang ?? 'en';
  let pins!: PinnedRowsFeature<R>;
  const x = ed({
    lang, ...(o.save && { save: o.save }), ...(o.options && { options: o.options }), columns: o.columns ?? ECOLS, rows: o.rows ?? rowsOf(200), ...(o.block && { block: o.block }),
    features: (e, xs) => {
      pins = pinnedRows<R>({ ...(o.top && { top: o.top }), ...(o.bottom && { bottom: o.bottom }) });
      return o.order === 'last' ? [e, xs, pins] : [pins, e, xs];
    },
    settings: { messages: join(BASE[lang], EDIT[lang], EDITORS[lang], PINNED[lang]), ...o.settings },
  });
  return { ...x, pins, ...bands(x.host, x.ctx), papi: pins.api(x.g)! };
}

function bands(host: HTMLElement, ctx: { rowRenderer: { keyOf(el: Element): RowKey | undefined } }) {
  const top = () => host.querySelector<HTMLElement>('.dzg-pins-top');
  const bottom = () => host.querySelector<HTMLElement>('.dzg-pins-bottom');
  /** A band's rows, in DOM order. */
  const prow = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-pins > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const pcell = (key: RowKey, col = 'name') => prow(key)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  return { top, bottom, prow, pcell };
}
