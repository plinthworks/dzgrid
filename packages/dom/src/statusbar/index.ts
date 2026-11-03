import { formattersFor, problem, type CellRange, type GridKernel, type NumberFormatSpec, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { rangeBox, rangeStats, type RangeBox } from '@dzgrid/core/range';
import { bottomStrip, mounted } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { Part, PartBase, SlotContext, SlotPart, StatusStats } from '../part.js';
import type { StatusMessageKey } from '../part-texts.js';
import { injectStatusStyles } from './styles.js';

type C = SlotContext['status'];
type Fig = 'count' | 'sum' | 'avg' | 'min' | 'max';
const FIGS: readonly string[] = ['count', 'sum', 'avg', 'min', 'max'];

/** The texts `statusBar()` needs, from `@dzgrid/dom/locales/<lang>-status`. */
export const STATUS_KEYS = 'label rows filtered selected all count sum avg min max partial read none sep'.split(' ').map((k) => `status.${k}`) as readonly StatusMessageKey[];

export interface StatusBarOptions {
  /**
   * The items, in order: `status.rows`, `status.filtered`, `status.selected`, `status.count`, `status.sum`, `status.avg`,
   * `status.min`, `status.max`, or a host's own `status` part. Default: the block's five figures (owner Q-SB1).
   */
  readonly items?: readonly string[];
  /** Past this many cells a moving block shows « … » until it stops (150 ms after a key, a pointer released). Default 200 000. */
  readonly maxCells?: number;
}
/** A grid's status bar, for the application. */
export interface StatusBarApi {
  /** Says what the strip shows in one polite sentence (« No totals » when nothing). */
  announce(): void;
  /** The block's figures now, counted at the call; null without a block. */
  stats(): StatusStats | null;
}
export interface StatusBarFeature extends GridFeature {
  /** The status bar of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): StatusBarApi | null;
}

/** Where a figure goes in the item's text (`{v}`): the strip isolates it in a `<bdi>`. */
const MARK = '';
/** An item's text and figure, or null when it shows nothing. */
type Pick = (c: C) => readonly [StatusMessageKey, string] | null;
const PICKS: Record<string, Pick> = {
  'status.rows': (c) => (c.counts.total === null ? null : ['status.rows', c.format(c.counts.total)]),
  'status.filtered': (c) => (c.counts.filtered === null || c.counts.filtered === c.counts.total ? null : ['status.filtered', c.format(c.counts.filtered)]),
  'status.selected': (c) => (c.selection.count === null ? ['status.all', ''] : c.selection.count ? ['status.selected', c.format(c.selection.count)] : null),
};
for (const f of FIGS)
  PICKS[`status.${f}`] = (c) => {
    const v = c.figure(f as Fig);
    return v === null ? null : [`status.${f}` as StatusMessageKey, v];
  };
/** A built-in item: its text, the figure in a `<bdi>` (label and figure isolated pieces); hidden when it shows nothing. */
const item = (pick: Pick): Part<C> => ({
  mount(host, c) {
    const doc = host.ownerDocument;
    const s = doc.createElement('span');
    host.append(s);
    const update = (n: C): void => {
      const x = pick(n);
      s.hidden = !x;
      if (!x) return;
      const [a, b] = n.msg(x[0], { v: MARK }).split(MARK);
      if (s.textContent === a! + x[1] + (b ?? '')) return;
      if (b === undefined) return s.replaceChildren(a!);
      const i = doc.createElement('bdi');
      i.textContent = x[1];
      s.replaceChildren(a!, i, b);
    };
    update(c);
    return { update };
  },
});
const parts: Record<string, SlotPart> = {};
for (const n in PICKS) parts[n] = { slot: 'status', part: item(PICKS[n]!) };

/** Formats that differ: the language's plain number (owner Q-SB4). */
const PLAIN: NumberFormatSpec = { maximumFractionDigits: 2 };
/** The mean: two more decimals than its format allows (a mean of whole numbers is rarely whole). */
const mean = (f: NumberFormatSpec): NumberFormatSpec => ({ ...f, maximumFractionDigits: Math.min(20, Math.max(f.minimumFractionDigits ?? 0, f.maximumFractionDigits ?? (f.style === 'currency' ? 2 : 0)) + 2) });

/**
 * `statusBar({ items, maxCells })`: the strip under the rows (docs/behaviors/status-bar.md; owner Q-SB1–Q-SB4) — the
 * block's count, sum, mean, smallest and largest in the column's format and the grid's digits, the row counts on
 * request, the host's own items; one strip with the pager. Nothing is said on its own: `api(grid).announce()` and the
 * cell menu's « Read the totals » (`contextMenu({ use: { status } })`) say it on demand.
 *
 * ```ts
 * import { statusBar } from '@dzgrid/dom/statusbar';
 * import { FR_STATUS } from '@dzgrid/dom/locales/fr-status';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_RANGE.text, ...FR_STATUS.text } }, features: [range(), statusBar()], … });
 * ```
 */
export function statusBar(o: StatusBarOptions = {}): StatusBarFeature {
  const apis = new WeakMap<object, StatusBarApi>();
  return { id: 'statusbar', parts, api: (grid) => apis.get(grid.kernel) ?? null, setup: (g) => setup(g, o, apis) };
}

function setup(g: GridContext<unknown>, o: StatusBarOptions, apis: WeakMap<object, StatusBarApi>): FeatureHandle {
  const missing = STATUS_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`statusBar: missing ${missing.join(', ')}`);
  const { kernel: k, doc, el, scope } = g;
  const bad: Problem[] = [];
  let max = o.maxCells ?? 2e5;
  if (!(Number.isInteger(max) && max >= 1)) (max = 2e5), bad.push(problem('invalid-setting', 'warning', 'statusBar.maxCells'));
  const names = o.items ?? FIGS.map((f) => `status.${f}`);
  const fig = (n: string): boolean => n.startsWith('status.') && FIGS.includes(n.slice(7));
  if (names.some(fig) && !g.settings.features?.some((f) => f.id === 'range')) bad.push(problem('missing-feature', 'warning', 'features.statusBar', 'range'));
  const target = el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectStatusStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);

  // A group named after the grid, in the shared strip: the row counts first, the figures pushed to the reading end.
  const group = doc.createElement('div');
  group.className = 'dzg-status';
  group.setAttribute('role', 'group');
  let end = true;
  const hosts = names.flatMap((name, i) => {
    if (g.parts()[name]?.slot !== 'status') return bad.push(problem('unknown-part', 'error', `statusBar.items[${i}]`, name)), [];
    const h = doc.createElement('div');
    h.dataset['part'] = name;
    if (end && fig(name)) (end = false), (h.dataset['at'] = 'end');
    group.append(h);
    return [{ h, m: mounted<C>(g) }];
  });
  const partial = doc.createElement('span');
  group.append(partial);
  const strip = bottomStrip(g);
  // After the pager's parts, before the pager when it is last.
  strip.insertBefore(group, strip.querySelector(':scope>nav:last-child'));
  if (bad.length) emit(k, { type: 'problems', source: 'host', problems: bad });

  let r: CellRange | null = null;
  let count: number | null = 0;
  // A big block moving: by the keys, until 150 ms after the last; by the pointer, until it is released.
  let held = false, keyed = false, quiet = true, stop = (): void => {};
  scope.add(k.subscribe((e) => {
    if (e.type === 'rangeChanged') {
      r = e.range;
      if (e.source === 'user' && keyed) (quiet = false), stop(), (stop = scope.timeout(() => ((quiet = true), g.schedule()), 150));
    } else if (e.type === 'selectionChanged') (count = e.count), g.schedule();
  }));
  scope.on(el.root, 'keydown', () => void (keyed = true), { capture: true });
  scope.on(el.viewport, 'pointerdown', () => void ((held = true), (keyed = false)), { capture: true });
  const release = (): void => void (held && ((held = false), g.schedule()));
  scope.on(doc, 'pointerup', release, { capture: true });
  scope.on(doc, 'pointercancel', release, { capture: true });

  let stats: StatusStats | null = null;
  let busy = false;
  let seen: readonly unknown[] = [];
  let counts = g.rows.counts;
  let selection: { readonly count: number | null } = { count };
  let told = false;
  /** `n` in format `f`; a format Intl refuses (a currency without its code…): the plain number, told once, never a throw. */
  const write = (n: number, f: NumberFormatSpec, avg?: boolean): string => {
    try {
      return formattersFor(g.ctx).number(avg ? mean(f) : f)(n);
    } catch {
      if (!told) (told = true), emit(k, { type: 'problems', source: 'host', problems: [problem('invalid-setting', 'warning', 'statusBar.numberFormat')] });
      return formattersFor(g.ctx).number(avg ? mean(PLAIN) : PLAIN)(n);
    }
  };
  const format = (n: number, column?: string): string => write(n, (column && g.columns.get(column)?.def.numberFormat) || {});
  const figure = (f: Fig): string | null => {
    const s = stats;
    if (busy) return '…';
    if (!s || (f !== 'count' && s.numbers < 2)) return null;
    if (f === 'count') return format(s.filled);
    const spec = s.formats.length === 1 ? s.formats[0]! : PLAIN;
    return write(s[f]!, spec, f === 'avg');
  };
  /** Counts again when what the figures read changed (the block, the rows, the edits, the columns, the language); `force`: now, whatever its size. */
  const refresh = (force?: boolean): void => {
    const d = r && (g.rowsOf?.(r.anchor.row) || g.rows.displayed);
    const vis = g.columns.visible();
    const now = [r, d, d?.version, k.reader.version, g.ctx, ...vis];
    if (!force && now.length === seen.length && now.every((v, i) => Object.is(v, seen[i]))) return void (busy = false);
    const b: RangeBox | null = d && rangeBox(r!, d, vis.map((c) => c.id));
    busy = !force && !!b && (b.bottom - b.top + 1) * (b.end - b.start + 1) > max && (held || !quiet);
    if (busy) return;
    seen = now;
    const s = b && rangeStats(b, d!, vis, { ctx: g.ctx, reader: k.reader });
    stats = s && { ...s, avg: s.numbers ? s.sum / s.numbers : null };
  };
  const own = (): Omit<C, keyof PartBase> => {
    const c = g.rows.counts;
    if (c.total !== counts.total || c.filtered !== counts.filtered) counts = c;
    if (selection.count !== count) selection = { count };
    return { stats, busy, counts, selection, figure, format };
  };
  const say = (): void => {
    refresh(true);
    const c = { ...g.partBase!, ...own() } as C;
    const said = names.flatMap((n) => {
      const x = PICKS[n]?.(c);
      return x ? [g.msg(x[0], { v: x[1] })] : [];
    });
    if (stats?.partial) said.push(g.msg('status.partial'));
    g.live.announce(said.length ? said.join(g.msg('status.sep')) : g.msg('status.none'));
    g.schedule();
  };
  apis.set(k, { announce: say, stats: () => (refresh(true), g.schedule(), stats) });

  return {
    afterRows() {
      refresh();
      group.setAttribute('aria-label', g.msg('status.label', { grid: g.settings.label ?? g.msg('grid.label') }));
      const all = g.parts();
      const c = own();
      for (const { h, m } of hosts) {
        const p = all[h.dataset['part']!];
        m.set(h, p?.slot === 'status' ? (p.part as Part<C>) : null, c);
      }
      partial.hidden = busy || !stats?.partial;
      partial.textContent = g.msg('status.partial');
    },
    destroy() {
      for (const { m } of hosts) m.clear();
      group.remove();
      if (!strip.firstChild) strip.remove();
      apis.delete(k);
    },
  };
}
