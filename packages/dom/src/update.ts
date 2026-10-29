import { liveChangeProblems, localeCtx, problem, type ClientModel, type LocaleCtx, type Problem, type SourceHandle } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from './context.js';
import { checkMessages } from './messages.js';
import { rowPx, type GridSettings } from './settings.js';

/** A `rowHeight` the grid does not take, told (null and undefined are no value). */
export const rowHeightProblems = (v: unknown): Problem[] => (v == null || rowPx(v) ? [] : [problem('invalid-setting', 'warning', 'settings.rowHeight', String(v))]);

/**
 * Which settings change live and which a grid takes only at creation. The
 * type lists every setting: a new one without a policy does not compile.
 * Fixed: the row identity (every key would change), how styles are
 * injected, and the features (set up once). The selection mode is live: a
 * narrower mode clears what it cannot hold (an app binds it to a control).
 */
export type UpdatePolicy = { readonly [K in keyof Required<GridSettings<unknown>>]: 'live' | 'fixed' };

export const UPDATE_POLICY: UpdatePolicy = {
  rows: 'live',
  getRowId: 'fixed',
  columns: 'live',
  messages: 'live',
  locale: 'live',
  timeZone: 'live',
  numerals: 'live',
  direction: 'live',
  density: 'live',
  rowHeight: 'live',
  selection: 'live',
  overlay: 'live',
  label: 'live',
  tooltips: 'live',
  onEvent: 'live',
  injectStyles: 'fixed',
  nonce: 'fixed',
  overscan: 'live',
  searchWarmup: 'live',
  features: 'fixed',
  parts: 'live',
  pagination: 'fixed',
  source: 'live',
  operations: 'fixed',
  filterKinds: 'fixed',
  clock: 'fixed',
  fullWidth: 'live',
  context: 'live',
  rowClass: 'live',
  motion: 'live',
  multiSort: 'fixed',
  sameRow: 'fixed',
};

/** A selection rule without `rules()` (step 21): no row is selectable unvetted (fail closed). */
export const closed = <T>(s: GridSettings<T>): GridSettings<T> =>
  s.selection?.canSelect && !s.features?.some((f) => f.id === 'rules') ? { ...s, selection: { ...s.selection, mode: 'none' } } : s;

export const ctxOf = <T>(s: GridSettings<T>): LocaleCtx =>
  localeCtx({ locale: s.locale ?? s.messages.locale, ...(s.timeZone && { timeZone: s.timeZone }), ...(s.numerals && { numerals: s.numerals }) });

export interface UpdateHooks {
  applyDir(): void;
  recheckDir(): void;
  warm(): void;
}

/**
 * `update(patch)`: fixed settings refused and said; everything computed that
 * can throw before anything changes; columns and language through the kernel
 * (its events, its focus reconcile).
 */
export function applyUpdate<T>(g: GridContext<T>, input: Partial<GridSettings<T>>, hooks: UpdateHooks): void {
  const prev = g.settings;
  const refused = liveChangeProblems(UPDATE_POLICY, prev as unknown as Record<string, unknown>, input as Record<string, unknown>);
  // Rows go to the browser's model, a source to a server's: never the one to the other.
  const served = g.rows.kind === 'source';
  // A settings object spread whole leaves them undefined: no change. A source cannot be taken away.
  if (served && input.rows !== undefined && input.rows !== prev.rows) refused.push(problem('unsupported-live-change', 'error', 'settings.rows'));
  if ('source' in input && (served ? !input.source : input.source)) refused.push(problem('unsupported-live-change', 'error', 'settings.source'));
  const patch: { -readonly [K in keyof GridSettings<T>]?: GridSettings<T>[K] } = { ...input };
  for (const p of refused) delete patch[p.path.slice('settings.'.length) as keyof GridSettings<T>];
  // A row height the grid does not take is told, kept, and the density's used (not refused: its path stays).
  // `Object.is`: the same value again (NaN included) is not told again.
  if ('rowHeight' in patch && !Object.is(patch.rowHeight, prev.rowHeight)) refused.push(...rowHeightProblems(patch.rowHeight));
  if (refused.length) emit(g.kernel, { type: 'problems', source: 'host', problems: refused });
  const open: GridSettings<T> = { ...prev, ...patch };
  const next = closed(open);
  if (next !== open && !prev.selection?.canSelect) emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'error', 'settings.selection.canSelect', 'rules')] });
  if (patch.messages) checkMessages(patch.messages);
  // `in`, not `!== undefined`: clearing a setting goes back to its default. Computed before
  // anything changes: a locale that does not exist throws and leaves the grid as it was.
  const contextChanged = 'locale' in patch || 'timeZone' in patch || 'numerals' in patch || (!!patch.messages && patch.messages.locale !== prev.messages.locale && !next.locale);
  const nextCtx = contextChanged ? ctxOf(next) : g.ctx;
  g.settings = next;
  if (patch.columns && patch.columns !== prev.columns) g.kernel.dispatch({ type: 'columns.set', defs: patch.columns }, 'host');
  if (contextChanged) {
    g.ctx = nextCtx;
    g.kernel.dispatch({ type: 'context.set', ctx: g.ctx }, 'host');
  }
  // A narrower selection mode cannot hold what was selected: none holds nothing, single one row.
  const mode = next.selection?.mode ?? 'none';
  if (mode !== (prev.selection?.mode ?? 'none')) {
    const s = g.kernel.selection;
    if (mode === 'none' || (mode === 'single' && (s.mode === 'exclude' || s.keys.size > 1))) g.kernel.dispatch({ type: 'selection.clear' }, 'host');
  }
  if (next.context !== prev.context) g.kernel.dispatch({ type: 'context.app', value: next.context }, 'host');
  const keep = next.selection?.keepOnFilter !== false;
  if (keep !== (prev.selection?.keepOnFilter !== false)) g.kernel.dispatch({ type: 'selection.keepOnFilter', keep }, 'host');
  if (patch.rows && !served) (g.rows as ClientModel<T>).setRows(patch.rows, 'host');
  if (patch.source) (g.rows as SourceHandle<T>).setSource(patch.source, 'host');
  hooks.recheckDir();
  if ('direction' in patch) hooks.applyDir();
  if ('searchWarmup' in patch && patch.searchWarmup !== prev.searchWarmup) hooks.warm();
  if ('overlay' in patch && patch.overlay !== prev.overlay && patch.overlay) g.live.announce(g.msg(patch.overlay === 'loading' ? 'announce.loading' : 'announce.error'));
  g.schedule();
}
