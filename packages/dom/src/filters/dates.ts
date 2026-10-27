import { parseDay, problem, readInstant, RELATIVE_RANGES, type LocaleCtx, type Problem, type RelativeRange } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import { conditions, el, form, hide, NUM, tx, type F, type Spec } from './forms.js';
import { notice, once, type Once } from '@dzgrid/dom/internal';

type C = SlotContext['filter'];

/** The three lazy kits (docs/behaviors/filter-date-picker.md): a day, a period, a moment. */
export type DateKitName = 'date' | 'range' | 'moment';

/** What a field holds, in the model's own types: days `YYYY-MM-DD`, moments UTC with milliseconds, or a shortcut. */
export interface DatePart {
  readonly value?: string;
  readonly valueTo?: string;
  readonly day?: string;
  readonly dayTo?: string;
  readonly at?: string;
  readonly atTo?: string;
  readonly range?: RelativeRange;
}

/** What a field is given, read again at each `update()`. */
export interface DateSettings {
  /** The grid's locale, digits and zone (the widget reads `intlTag(ctx)`: Gregorian, the grid's digits). */
  readonly ctx: LocaleCtx;
  /** The clock's day in the grid's zone. */
  readonly today: string;
  /** The field's name and visible label. */
  readonly label: string;
  /** `filters({ dateMessages })`: the widget's words by language, over its own. */
  readonly messages?: Readonly<Record<string, object>>;
  /** `filters({ dateCalendar })`, checked: the period widget's months and shortcuts. */
  readonly calendar?: DateCalendarOptions;
}

/** `filters({ dateCalendar })`: how the period widget shows itself (filter-date-picker.md, Calendar options). */
export interface DateCalendarOptions {
  /** Months side by side, a positive integer; 2 when absent. */
  readonly months?: number;
  /** The shortcuts beside the calendar, in this order; `[]` for none; the six when absent. Never between two moments. */
  readonly presets?: readonly RelativeRange[];
}

const BAD = (name: string, v: unknown): Problem => problem('invalid-setting', 'warning', `features.filters.dateCalendar.${name}`, String(v));

/**
 * The host's `dateCalendar`, kept to what tzslot can take: a months that is not a positive integer,
 * presets that are not a list, an unknown name in it, each dropped with a warning (said at setup), never thrown.
 */
export function calendarOf(c: DateCalendarOptions): { calendar: DateCalendarOptions; problems: Problem[] } {
  const problems: Problem[] = [];
  const { months: m, presets: p } = c;
  const ok = Number.isInteger(m) && m! > 0;
  if (m !== undefined && !ok) problems.push(BAD('months', m));
  if (p !== undefined && !Array.isArray(p)) problems.push(BAD('presets', p));
  const list = Array.isArray(p) ? p.filter((n, i) => (RELATIVE_RANGES.has(n) ? p.indexOf(n) === i : (problems.push(BAD('presets', n)), false))) : undefined;
  return { calendar: { ...(ok && { months: m! }), ...(list && { presets: list }) }, problems };
}

/** What a kit's `adapt` is given: where to draw, which field, its settings, and how to say a change. */
export interface DateAdapter {
  readonly host: HTMLElement;
  /** The grid's root element: its root node (the document or a shadow root) takes the sheets, as the popup's do (the host is not attached yet). */
  readonly grid: HTMLElement;
  /** Where the widget's panel goes: inside the popup (its top layer, direction and theme). */
  readonly panel: HTMLElement;
  readonly kind: 'day' | 'instant';
  /** The operator: which widget (a period of days or of moments). */
  readonly op: string;
  settings(): DateSettings;
  /** A change by the user: `now` for a pick, false for typing (after the pause). */
  changed(now: boolean): void;
  /** The widget's sheets are DzGrid's to inject (`injectStyles`), with the grid's nonce. */
  readonly inject: boolean;
  readonly nonce?: string;
}

/** A widget, as the popup sees it. `read()`: the part, null when incomplete, undefined when it does not read. */
export interface DateField {
  write(p: DatePart | null): void;
  read(): DatePart | null | undefined;
  update(): void;
  /** Closes an open panel: true when one was open. */
  closePanel(): boolean;
  focus(): void;
  destroy(): void;
}

/** A kit's module: `adapt` only (`filters({ loadDates })` returns one). */
export interface DateKit {
  adapt(a: DateAdapter): DateField;
}

/** The feature's side the date forms need: the grid (set up last), the kits, the words. */
export interface DateEnv {
  g: GridContext<unknown> | null;
  readonly load: (kit: DateKitName) => Promise<DateKit>;
  readonly done: (kit: DateKitName) => DateKit | undefined;
  readonly messages?: Readonly<Record<string, object>>;
  readonly calendar?: DateCalendarOptions;
  /** What was wrong in `dateCalendar`, said once the grid is there. */
  readonly calendarProblems?: readonly Problem[];
}

const KITS: Record<DateKitName, () => Promise<DateKit>> = {
  date: () => import('./dates/date.js'),
  range: () => import('./dates/range.js'),
  moment: () => import('./dates/moment.js'),
};

/** The kits, each imported once (`loadDates` replaces the import; `lazy.ts`). A module without `adapt` is a failure. */
export const kits = (own?: (kit: DateKitName) => Promise<DateKit>): Once<DateKitName, DateKit> =>
  once((k) => (own ?? KITS[k])(k), (m) => typeof m?.adapt === 'function', 'adapt in date kit ');

const DATE = 'date';
/** The kit of each operator (the others need none). */
const KIT: Readonly<Record<string, DateKitName>> = { equals: DATE, notEqual: DATE, lt: DATE, lte: DATE, gt: DATE, gte: DATE, onDay: DATE, between: 'range', betweenDays: 'range', before: 'moment', after: 'moment' };
const LABEL: Readonly<Record<DateKitName, string>> = { date: 'filter.date', range: 'filter.period', moment: 'filter.dateTime' };
const INSTANT_OPS = ['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank'];
const DAY_LABELS = { equals: 'onDay', notEqual: 'notOnDay', lt: 'before', lte: 'onOrBefore', gt: 'after', gte: 'onOrAfter' };

/** A day the fields can show: 0001–9999 (undefined: not given yet). */
const okDay = (v: unknown): boolean => v === undefined || (!!parseDay(v) && (v as string) >= '0001');
/** A moment the fields can show: a whole minute, 1900–9999. */
const okAt = (v: unknown): boolean => {
  if (v === undefined) return true;
  const r = readInstant(v);
  return r.ok && r.value % 60_000 === 0 && r.value >= -2_208_988_800_000 && r.value < 253_402_300_800_000;
};
const can = (kind: 'day' | 'instant', s: F): boolean =>
  s.op === 'relative'
    ? RELATIVE_RANGES.has(s['range'] as RelativeRange)
    : kind === 'day'
      ? okDay(s.value) && okDay(s.valueTo)
      : okDay(s['day']) && okDay(s['dayTo']) && okAt(s['at']) && okAt(s['atTo']) && (!KIT[s.op!]?.startsWith('m') || s['day'] === undefined);

/**
 * A date kind's fields (docs/behaviors/filter-date-picker.md): tzslot's widget for the operator,
 * from its kit, loaded on first need. While it loads, a status line and `aria-busy`; if it fails,
 * an alert and Retry (`grid.retry`), the error reported. The filter in force stays meanwhile (L1:
 * a field not there reads null). An instant's form says its zone. An open panel takes the first
 * Escape (captured here: the popup's own would close everything first).
 */
const dates = (kind: 'day' | 'instant', env: DateEnv): Spec['values'] => (get, doc, changed) => {
  const box = el(doc, 'div', 'dzg-fdate');
  const label = el(doc, 'span', 'dzg-flabel');
  const zone = el(doc, 'p', 'dzg-fzone');
  const zname = el(doc, 'span');
  const zid = el(doc, 'bdi');
  zone.append(zname, ' ', zid);
  box.tabIndex = -1;
  box.append(label);
  let field: DateField | null = null;
  /** The widget asked for (its kit and operator), and the operator chosen. */
  let want = '';
  let op = '';
  /** What the fields hold: the filter last written, or what the widget held before an operator change. */
  let last: DatePart | null = null;
  let seen = '';
  let dead = false;
  const g = (): GridContext<unknown> => env.g!;
  const kit = (): DateKitName | undefined => KIT[op];
  const name = (): string => get().msg(LABEL[kit() ?? DATE] as never);
  const settings = (): DateSettings => {
    const { ctx, today } = get();
    return { ctx, label: name(), today, ...(env.messages && { messages: env.messages }), ...(env.calendar && { calendar: env.calendar }) };
  };
  /** The loading line or the failure (with Retry), one at a time, after the label (`lazy.ts`). The focus waits on the box while it loads again, and goes to the field when it comes. */
  const n = notice(doc, box, () => (box.focus(), (want = ''), mount()), (w) => get().msg(w === 'load' ? 'filter.loadingDates' : 'filter.loadFailed'), () => get().msg('grid.retry'));
  /** The widget goes; what it held is kept for the next one (an operator changed). */
  const drop = (): void => {
    const p = field?.read();
    if (p) last = p;
    field?.destroy();
    field = null;
    n.stop();
    while (box.lastChild !== label) box.lastChild!.remove();
  };
  const attach = (k: DateKit): void => {
    const focused = box.contains(doc.activeElement);
    drop();
    const host = el(doc, 'div', 'dzg-fwidget');
    const panel = el(doc, 'div', 'dzg-fpanel');
    box.append(host, panel);
    const { settings: s, el: { root } } = g();
    // A kit that throws (adapt, or its first write): reported, its half-built nodes gone, Retry.
    try {
      field = k.adapt({ host, panel, grid: root, kind, op, settings, changed, inject: s.injectStyles !== false, ...(s.nonce && { nonce: s.nonce }) });
      field.write(last);
    } catch (err) {
      field = null;
      drop();
      return fail(err);
    }
    seen = key();
    if (focused) field.focus();
  };
  /** Said once: the same widget is not tried again until Retry (or another operator). */
  const fail = (err: unknown): void => {
    g().report(err);
    n.say('fail');
  };
  /** The widget for the operator: none, the one in place, the kit's at once, or after it loads. */
  const mount = (): void => {
    const k = kit();
    hide(box, !k);
    hide(zone, !k);
    tx(label, name());
    const w = k && (k === 'range' ? op : k);
    if (w === want) return;
    want = w || '';
    drop();
    if (!k) return;
    const ready = env.done(k);
    if (ready) return attach(ready);
    n.say('load');
    env.load(k).then(
      (m) => !dead && want === w && attach(m),
      (err) => !dead && want === w && fail(err),
    );
  };
  const key = (): string => {
    const { ctx, today, label } = settings();
    return [ctx.timeZone, ctx.locale, ctx.numerals, today, label].join();
  };
  box.addEventListener('keydown', (k) => {
    if (k.key === 'Escape' && field?.closePanel()) k.preventDefault(), k.stopPropagation();
  }, true);
  return {
    els: kind === 'instant' ? [zone, box] : [box],
    can: (s) => can(kind, s),
    show(o) {
      op = o;
      mount();
    },
    write(s, o) {
      op = o;
      mount();
      last = s && can(kind, s) ? (s as DatePart) : null;
      field?.write(last);
    },
    read(o) {
      const p = field?.read();
      if (!p) return p === undefined && field ? undefined : null;
      return p.range ? { type: kind, op: 'relative', range: p.range } : { type: kind, op: o, ...p };
    },
    texts() {
      const c = get();
      tx(label, name());
      tx(zname, c.msg('filter.zone'));
      tx(zid, c.ctx.timeZone);
      n.words();
      const k = key();
      if (field && k !== seen) (seen = k), field.update();
    },
    focus: () => !!field && (field.focus(), true),
    destroy() {
      dead = true;
      drop();
    },
  };
};

const shortcutUnder = (op: string) => (s: F): string => (s.op === 'relative' ? op : s.op!);

/** `filter.day` and `filter.instant` (step 14): the date forms on tzslot. */
export function dateForms(env: DateEnv): { day: Part<C>; instant: Part<C> } {
  return {
    day: form(conditions({ type: 'day', ops: NUM, label: DAY_LABELS, opOf: shortcutUnder('between'), values: dates('day', env) })),
    instant: form(conditions({ type: 'instant', ops: INSTANT_OPS, opOf: shortcutUnder('betweenDays'), values: dates('instant', env) })),
  };
}
