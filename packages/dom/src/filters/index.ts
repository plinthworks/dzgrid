import { dayAt } from '@dzgrid/core';
import { hasRelative, onCommand } from '@dzgrid/core/internal';
import { settled } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { HeaderFilter } from '../part.js';
import type { FilterMessageKey } from '../messages.js';
import { committer } from './commit.js';
import { dateForms, kits, type DateEnv, type DateKit, type DateKitName } from './dates.js';
import { floatingRow } from './floating.js';
import { filterBoxPart } from './header-box.js';
import { booleanForm, numberForm, textForm } from './forms.js';
import { numberPart, textPart } from './inputs.js';
import { menu, type Menu } from './menu.js';
import { setForm, setKit, type SetKit } from './set.js';
import { resolver } from './resolve.js';
import { injectFilterStyles } from './styles.js';
import { summaryPart } from './summary.js';
import { toggle, type FloatingToggle, type Toggle } from './toggle.js';
import { asked } from './resolve.js';

export interface FiltersOptions {
  /** A floating row under the headers, for every filterable column (a column's `filter.floating` wins); shown or hidden live by `floating`. */
  readonly floating?: boolean;
  /** The pause before a typed filter applies; 150 ms in the browser, 300 on a server by default. */
  readonly debounceMs?: number;
  /** The header's filter button and the popup (step 13); `false`: neither. On by default. */
  readonly popup?: boolean;
  /**
   * Advanced (step 14): where the date kits come from, instead of DzGrid's own `import()` of its
   * lazy chunks (tests; a host serving its chunks its own way). A rejected promise shows the
   * failure and Retry; a module without `adapt` is a failure.
   */
  readonly loadDates?: (kit: DateKitName) => Promise<DateKit>;
  /** tzslot's words for a language beyond English, French and Arabic, or over them: `{ es: {...} }` (its `TzslotMessages`, in part). */
  readonly dateMessages?: Readonly<Record<string, object>>;
  /** Advanced (step 15): where the set filter's chunk comes from, instead of DzGrid's own `import()` (as `loadDates`). */
  readonly loadSet?: () => Promise<SetKit>;
}

/** The feature, with the popup's handles (owner decision O6: here, not on the grid). */
export interface FiltersFeature extends GridFeature {
  /** Opens the column's popup: false when it has no `filter.<kind>` part, its header is not mounted, or its kind cannot filter here. */
  openFilter(column: string): boolean;
  closeFilter(): void;
  /** The floating row shown or hidden live (Phase 4 step 12): `get`, `set(on)`, `bind(button)`. */
  readonly floating: FloatingToggle;
}

const OPS = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank', 'lt', 'lte', 'gt', 'gte', 'between', 'onDay', 'notOnDay', 'betweenDays', 'before', 'after', 'onOrBefore', 'onOrAfter'] as const;

/** The texts `filters()` needs, from `@dzgrid/dom/locales/<lang>-filters`. */
export const FILTER_KEYS = [
  'filter.inputLabel', 'filter.summaryActive', 'filter.clear', 'filter.invalid', 'announce.filtered', 'announce.filteredOpen',
  'filter.popupLabel', 'header.withFilter', 'filter.op', 'filter.value', 'filter.valueTo', 'filter.apply',
  ...OPS.map((o) => `filter.op.${o}` as const), 'filter.all', 'filter.yes', 'filter.no',
  'filter.date', 'filter.dateTime', 'filter.period', 'filter.zone', 'filter.loadingDates', 'filter.loadFailed',
  ...(['search', 'all', 'allShown', 'blanks', 'option', 'count', 'truncated', 'failed'] as const).map((k) => `filter.set.${k}` as const),
  'filter.floatingToggle', 'announce.floatingHidden', 'announce.floatingShown',
] satisfies readonly FilterMessageKey[];

/**
 * `filters()`: the filter UI (docs/behaviors/filter-ui.md). Step 12: the floating row, with its
 * parts `floating.text`, `floating.number` and the summary (`floating`). Step 13: the popup, with
 * `filter.text`, `filter.number` and `filter.boolean`, opened from the header's button or with
 * Alt+ArrowDown. A host's part of the same name replaces each.
 *
 * ```ts
 * import { filters } from '@dzgrid/dom/filters';
 * import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_FILTERS.text } }, features: [filters({ floating: true })], … });
 * ```
 * `openFilter` and `closeFilter` act on the last grid the feature was set up on.
 */
export function filters(o: FiltersOptions = {}): FiltersFeature {
  let popup: Menu | null = null;
  const env: DateEnv = { g: null, ...kits(o.loadDates), ...(o.dateMessages && { messages: o.dateMessages }) };
  const d = dateForms(env);
  const sets = setKit(o.loadSet);
  const set = setForm(env, sets);
  const shown = toggle(o.floating === true);
  return {
    id: 'filters',
    parts: {
      'floating.text': { slot: 'floating', part: textPart }, 'floating.number': { slot: 'floating', part: numberPart }, floating: { slot: 'floating', part: summaryPart },
      'filter.text': { slot: 'filter', part: textForm }, 'filter.number': { slot: 'filter', part: numberForm }, 'filter.boolean': { slot: 'filter', part: booleanForm },
      'filter.day': { slot: 'filter', part: d.day }, 'filter.instant': { slot: 'filter', part: d.instant }, 'filter.set': { slot: 'filter', part: set },
      // Step 21: a ready header part with the column's box (needs `slots()`), named per column.
      'header.filterBox': { slot: 'header', part: filterBoxPart },
    },
    setup: (g) => setup(g, o, (m) => (popup = m), env, set, () => void sets.load('').catch(() => {}), shown),
    openFilter: (column) => !!popup?.open(column),
    closeFilter: () => popup?.close(),
    floating: shown.api,
  };
}

function setup(g: GridContext<unknown>, o: FiltersOptions, keep: (m: Menu) => void, env: DateEnv, set: object, fetchSet: () => void, shown: Toggle): FeatureHandle {
  env.g = g;
  const missing = FILTER_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`filters: missing ${missing.join(', ')}`);
  const root = g.el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectFilterStyles(root.nodeType === 11 ? (root as ShadowRoot) : g.doc, g.settings.nonce);
  // After a user's filter change, the filtered count (`announce.filtered {rows}`, or `announce.filteredOpen` when
  // nobody knows it), once the rows are in. Any filter change asks for a paint, which `filterChanged` alone does not.
  const quiet = g.kernel.subscribe(settled(g, (e) => e.type === 'filterChanged' && (g.schedule(), e.source === 'user'), () => {
    const n = g.rows.counts.filtered;
    g.live.announce(n === null ? g.msg('announce.filteredOpen') : g.msg('announce.filtered', { rows: g.msg('announce.rows', { n }) }));
  }));
  const resolve = resolver(g, o, set);
  const commit = committer(g, o);
  onCommand(g.kernel, commit.heard);
  const popup = menu(g, resolve, commit, o.popup !== false);
  keep(popup);
  const row = floatingRow(g, resolve, commit, popup);
  // Shown or hidden live (floating-toggle.md): the row's spec in the header rows or not; a hide moves the grid's
  // focus off the row first. The paint reads the view's height before the header changes: one more reads it after.
  let again = false;
  shown.attach(g, o.floating === true || asked(g), (on, source) => {
    if (!on) row.leave(source);
    g.headerRows = on ? [...g.headerRows, row.spec] : g.headerRows.filter((r) => r !== row.spec);
    again = true;
    g.schedule();
    if (source === 'user') g.live.announce(g.msg(on ? 'announce.floatingShown' : 'announce.floatingHidden'));
  });
  // The date kit (or the set chunk) fetched ahead: the pointer over the column's button, the focus on its header.
  const ahead = (e: Event): void => {
    const t = e.target as HTMLElement;
    const col = g.columns.get(t.closest<HTMLElement>('.dzg-hcell')?.dataset['col'] ?? '');
    const kind = col && popup.can(col) && resolve(col, 'filter').kind;
    if (e.type !== 'focusin' && !t.closest('.dzg-fbtn')) return;
    if (kind === 'day' || kind === 'instant') env.load('date').catch(() => {});
    else if (kind === 'set') fetchSet();
  };
  g.scope.on(g.el.header, 'pointerover', ahead);
  g.scope.on(g.el.header, 'focusin', ahead);
  const midnight = clockwork(g);
  // A header part's filter (step 21): the shared edits, one object per column while what it holds stays.
  const heads = new Map<string, { readonly k: readonly unknown[]; readonly f: HeaderFilter }>();
  return {
    filter: {
      edits(col, who) {
        const r = resolve(col, 'filter');
        if (!r.ok) return null;
        const e = commit.edits(col, r.kind, who);
        // The column too (a rename), and `dropped`: a new object when another write dropped its edit.
        const k = [r.kind, e.state, e.where, e.debounceMs, popup.can(col), who, col, e.dropped];
        const hit = heads.get(col.id);
        if (hit && k.every((v, i) => v === hit.k[i])) return hit.f;
        const f: HeaderFilter = { ...e, canOpen: k[4] as boolean, openFilter: () => popup.toggle(col.id, null) };
        heads.set(col.id, { k, f });
        return f;
      },
      flush: commit.flush,
    },
    headerRows: shown.api.get() ? [row.spec] : [],
    decorateHeader: popup.decorate,
    afterRows(f) {
      row.sweep();
      popup.paint(f);
      midnight();
      shown.paint();
      if (again) (again = false), g.schedule();

    },
    destroy() {
      onCommand(g.kernel);
      quiet();
      popup.close();
      row.destroy();
      shown.detach(g);
    },
  };
}

/**
 * Midnight while a shortcut is in force (docs/behaviors/filter-relative.md): `kernel.tick()` when
 * the day ends in the grid's zone (plus 50 ms, at most a timer's 2^31−1 ms), re-armed at each
 * paint, and at once when the page becomes visible again. No shortcut, no timer.
 */
function clockwork(g: GridContext<unknown>): () => void {
  const clock = g.settings.clock ?? Date.now;
  let until = 0;
  let stop = (): void => {};
  const relative = (): boolean => hasRelative(g.kernel.query.filter);
  const arm = (): void => {
    if (!relative()) return stop(), void (until = 0);
    const d = dayAt(clock(), g.ctx.timeZone);
    if (!d || d.until === until) return;
    stop();
    until = d.until;
    stop = g.scope.timeout(tick, Math.min(d.until - clock() + 50, 2 ** 31 - 1));
  };
  const tick = (): void => {
    until = 0;
    g.kernel.tick();
    arm();
  };
  g.scope.on(g.doc, 'visibilitychange', () => g.doc.visibilityState !== 'hidden' && relative() && tick());
  return arm;
}
