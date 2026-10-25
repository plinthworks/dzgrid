// Shared fixtures for the clipboard of `@dzgrid/dom/range` (Phase 5 step 11b, docs/behaviors/clipboard.md,
// docs/phase-5-steps/step11b-plan.md): a grid with `range()`, `edit()` (a recording save) and, when asked, `editors()`;
// columns of every type; the clipboard events dispatched as the browsers do — at `<body>` (Firefox) or at the focused
// cell — with a fake `clipboardData` (Firefox ignores a synthetic ClipboardEvent's data, S7 5).
import { vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { edit, type EditApi, type EditFeature } from '../src/edit.js';
import { editors } from '../src/editors.js';
import type { GridFeature } from '../src/features.js';
import type { GridSettings } from '../src/settings.js';
import { range, type RangeFeature, type RangeOptions } from '../src/range.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { FR_EDITORS } from '../src/locales/fr-editors.js';
import { AR_EDITORS } from '../src/locales/ar-editors.js';
import { join, rmake } from './support-range.js';

export { cleanup, join } from './support-range.js';

/** A row of every type: text, numbers, a day, an instant, an enum, yes/no, an identifier, a read-only text. */
export type C = { id: string; name: string; qty: number | null; price: number | null; day: string | null; at: string | null; st: string | null; ok: boolean | null; code: string | null; ref: string };

export const crows = (n: number): C[] => Array.from({ length: n }, (_, i) => ({
  id: `r${i}`, name: `N${i}`, qty: i, price: i + 0.5, day: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`, at: '2026-03-05T22:59:00Z', st: i % 2 ? 'out' : 'in', ok: i % 3 === 0, code: `00${i}`, ref: `R${i}`,
}));

export const CCOLS: ColumnDef<C, any>[] = [
  { id: 'name', header: 'Name', width: 60, editable: true },
  { id: 'qty', header: 'Qty', type: 'number', width: 50, editable: true, edit: { min: 0 } },
  { id: 'price', header: 'Price', type: 'number', width: 50, editable: true },
  { id: 'day', header: 'Day', type: 'day', width: 60, editable: true },
  { id: 'at', header: 'At', type: 'instant', width: 60, editable: true },
  { id: 'st', header: 'State', type: 'enum', width: 50, editable: true, enumOptions: [{ value: 'in', label: 'In stock' }, { value: 'out', label: 'Rupture' }] },
  { id: 'ok', header: 'OK', type: 'boolean', width: 40, editable: true },
  { id: 'code', header: 'Code', width: 50, editable: true, csv: 'text' },
  { id: 'ref', header: 'Ref', width: 50 },
];

export const CMSG = {
  en: join(EN, EN_RANGE, EN_EDIT, EN_EDITORS),
  fr: join(FR, FR_RANGE, FR_EDIT, FR_EDITORS),
  ar: join(AR, AR_RANGE, AR_EDIT, AR_EDITORS),
} as const;

/** A fake `clipboardData`: what a test puts in, what a copy writes. */
export function fakeData(init: Record<string, string> = {}) {
  const store = new Map(Object.entries(init));
  return {
    store,
    getData: (t: string) => store.get(t) ?? '',
    setData: (t: string, v: string) => void store.set(t, v),
    get types() { return [...store.keys()]; },
  };
}
export type FakeData = ReturnType<typeof fakeData>;

/** A clipboard event as the browsers send it: at `<body>` by default (Firefox), the data readable; returns the event and its data. */
export function clip(type: 'copy' | 'cut' | 'paste', data: FakeData | Record<string, string> = {}, at: EventTarget = document.body) {
  const d = 'getData' in data ? (data as FakeData) : fakeData(data as Record<string, string>);
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: d });
  at.dispatchEvent(e);
  return { e, data: d, text: d.store.get('text/plain'), html: d.store.get('text/html') };
}

export interface CMake {
  readonly rows?: C[];
  readonly columns?: ColumnDef<C, any>[];
  readonly lang?: keyof typeof CMSG;
  readonly range?: RangeOptions;
  readonly feature?: RangeFeature;
  /** No `edit()` on the grid. */
  readonly noEdit?: boolean;
  /** `editors()` too, before (`'before'`) or after (`'after'`) `range()`. */
  readonly editors?: 'before' | 'after';
  /** The save; default: records the request and saves at once. */
  readonly save?: (req: SaveRequest<C>) => unknown;
  readonly settings?: Partial<GridSettings<C>>;
  readonly extra?: readonly GridFeature[];
  readonly host?: HTMLElement;
  readonly block?: number;
}

/** A grid with the clipboard: `range()` with `edit()` (a recording save), every type of column. */
export function cmake(o: CMake = {}) {
  const requests: SaveRequest<C>[] = [];
  const e: EditFeature<C> | null = o.noEdit ? null : edit<C>({ save: (req) => (requests.push(req), o.save?.(req)) });
  const x = o.editors ? editors() : null;
  const lang = o.lang ?? 'en';
  const t = rmake({
    rows: (o.rows ?? crows(30)) as never, columns: (o.columns ?? CCOLS) as never, lang, messages: CMSG[lang], ...(o.range && { range: o.range }), ...(o.feature && { feature: o.feature }), ...(o.host && { host: o.host }), ...(o.block && { block: o.block }),
    settings: { locale: lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : 'ar-DZ', timeZone: 'Africa/Algiers', ...o.settings } as never,
    features: (r) => [...(e ? [e] : []), ...(o.editors === 'before' ? [x!] : []), r, ...(o.editors === 'after' ? [x!] : []), ...(o.extra ?? [])],
  });
  const edits = e ? (e.api(t.g as never) as EditApi<C>) : null;
  const refuse = edits ? vi.spyOn(edits, 'refuse') : null;
  /** Focuses a cell as the user would (the kernel's focus, the DOM focus on the cell). */
  const at = (id: string, col = 'name') => {
    t.g.api.focusCell(dataKey(id)!, col);
    const c = t.cell(id, col)!;
    if (document.activeElement !== c) c.focus();
    return c;
  };
  const value = (id: string, col: string) => t.cell(id, col)?.textContent ?? null;
  const of = <K extends GridEvent<C>['type']>(type: K) => (t.events as unknown as GridEvent<C>[]).filter((ev): ev is Extract<GridEvent<C>, { type: K }> => ev.type === type);
  /** The changes of every request, as `row/col=value`. */
  const changes = () => requests.flatMap((r) => r.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}/${c.column}=${JSON.stringify(c.value)}`));
  const blinked = () => (refuse?.mock.calls ?? []).map(([key, col]) => `${String(key).replace(/^d:\d+:/, '')}/${col}`);
  return { ...t, e, edits, refuse, requests, at, value, of, changes, blinked, lang };
}

export const key = (id: string): RowKey => dataKey(id)!;
/** Runs the microtasks queued so far (the sentences are said from one). */
export const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
