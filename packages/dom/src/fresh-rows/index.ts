import { problem, type ChangeSource, type Problem, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';

/** The texts `freshRows()` needs, from `@dzgrid/dom/locales/<lang>-fresh`: the sentence told once per refresh. */
export const FRESH_KEYS = ['announce.fresh'] as const;

export interface FreshRowsOptions {
  /** How long a new row stays marked, in ms: 5000 by default, from 0 to 60 000. */
  readonly ms?: number;
  /** Told once per refresh, with the keys of the rows marked (never row data) and who changed the rows; a throw is reported. */
  readonly rowsArrived?: (keys: readonly RowKey[], source: ChangeSource) => void;
}

/**
 * `freshRows({ ms })` (docs/behaviors/fresh-rows.md, owner Q16-9 A): the rows a live change of the rows added (a delta:
 * a transaction, or a reload or a server's answer for the same page and query compared by `sameRow`) and the query
 * keeps get `data-dzg-fresh` for `ms` wherever they are drawn; one polite sentence counts them; `rowsArrived` is
 * given their keys. Never on a first load, a page, a sort or a filter (new answers, not arrivals). Its look:
 * `@dzgrid/theme/fresh-rows.css`.
 *
 * ```ts
 * import { freshRows } from '@dzgrid/dom/fresh-rows';
 * import { FR_FRESH } from '@dzgrid/dom/locales/fr-fresh';
 * createGrid(host, { …, sameRow: sameValues, messages: { ...FR, text: { ...FR.text, ...FR_FRESH.text } }, features: [freshRows()] });
 * ```
 */
export function freshRows(o: FreshRowsOptions = {}): GridFeature {
  return { id: 'fresh-rows', setup: (g) => setup(g, o) };
}

function setup(g: GridContext<unknown>, o: FreshRowsOptions): FeatureHandle {
  const missing = FRESH_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`freshRows: missing ${missing.join(', ')}`);
  let ms = o.ms ?? 5e3;
  const bad: Problem[] = [];
  if (!(typeof ms === 'number' && ms >= 0 && ms <= 6e4)) (ms = 5e3), bad.push(problem('invalid-setting', 'warning', 'freshRows.ms'));
  // A server's answer is a reset without it: nothing would ever be new (the feature stays on: client deltas mark).
  if (g.rows.kind === 'source' && !g.settings.sameRow) bad.push(problem('missing-feature', 'warning', 'freshRows', 'sameRow'));
  if (bad.length) emit(g.kernel, { type: 'problems', source: 'host', problems: bad });

  /** Each new row's refresh (a token): the timer of a refresh takes off the rows it still owns (no clock read). */
  const fresh = new Map<RowKey, object>();
  const timers = new Set<() => void>();
  /** The row elements marked at the last paint: a pooled one shown for another row is unmarked at the next. */
  let on = new Set<HTMLElement>();
  /** Our last sentence (the live region's `said` may be it, still waiting). */
  let mine = '';
  const unsubscribe = g.rows.subscribe((c) => {
    const t = c.transaction;
    if (c.kind !== 'rows' || t?.kind !== 'delta') return;
    // The rows the query keeps, on any page; one hidden by a filter is not counted.
    const all = g.rows.allRows ?? c.displayed;
    const keys = t.added.filter((k) => all.indexOf(k) >= 0);
    if (!keys.length) return;
    const token = {};
    for (const k of keys) fresh.set(k, token);
    const cancel = g.scope.timeout(() => {
      timers.delete(cancel);
      for (const k of keys) if (fresh.get(k) === token) fresh.delete(k);
      g.schedule();
    }, ms);
    timers.add(cancel);
    // A sentence still waiting (e.g. « selection reduced » from the same change) is joined, never dropped (review of 16h).
    // Ours still waiting is replaced, as any newer sentence.
    const live = g.live, other = !live.el.textContent && live.said && live.said !== mine ? live.said : '';
    mine = g.msg('announce.fresh', { n: keys.length });
    live.announce(other ? `${other} ${mine}` : mine);
    try {
      o.rowsArrived?.(keys, c.source);
    } catch (err) {
      g.report(err);
    }
    // The paint the change asked for may have run before this listener: one more.
    g.schedule();
  });
  const mark = (next: Set<HTMLElement>): void => {
    for (const el of on) if (!next.has(el)) el.removeAttribute('data-dzg-fresh');
    for (const el of next) if (!on.has(el)) el.setAttribute('data-dzg-fresh', '');
    on = next;
  };
  return {
    afterRows() {
      if (!fresh.size && !on.size) return;
      const next = new Set<HTMLElement>();
      for (const [k, v] of g.rowRenderer.mounted) if (fresh.has(k)) next.add(v.el);
      mark(next);
    },
    destroy() {
      unsubscribe();
      for (const cancel of timers) cancel();
      timers.clear();
      fresh.clear();
      mark(new Set());
    },
  };
}
