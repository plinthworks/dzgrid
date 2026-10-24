import { dayFieldOrder, epochDayToDay, instantToDayIn, offsetAt, REJECTED, stripMarks, type LocaleCtx, type ResolvedColumn } from '@dzgrid/core';
import { intlTag } from '@dzgrid/core/internal';
import { notice, once } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import { popupsFor, type PopupRef } from '../popup.js';
import { setAttr } from '../render/write.js';
import type { Ed, EdEnv } from './index.js';

/** What the lazy calendar is told (step06-plan « Behaviour » 4–5): where to draw, the grid's locale, today, the value. */
export interface CalendarAdapter {
  /** Inside the dialog (its top layer, direction and theme). */
  readonly host: HTMLElement;
  /** The grid's root element: its root node takes tzslot's sheets, with the nonce. */
  readonly grid: HTMLElement;
  readonly inject: boolean;
  readonly nonce?: string;
  readonly kind: 'day' | 'instant';
  readonly ctx: LocaleCtx;
  /** The clock's day in the grid's zone. */
  readonly today: string;
  readonly label: string;
  /** `editors({ dateMessages })`: tzslot's words by language, over its own. */
  readonly messages?: Readonly<Record<string, object>>;
  /** The field's value if it reads, else the cell's: a `Day` (day) or epoch milliseconds (instant); null: none. */
  readonly value: string | number | null;
  /** A day (day) or an instant in ms (instant) chosen: written into the field, kept as picked (the written-value rule). */
  pick(v: string | number): void;
  /** Closes the dialog, the focus back in the field. */
  close(): void;
}
/** What the chunk drew. */
export interface CalendarView {
  focus(): void;
  destroy(): void;
}
/** The lazy chunk's one export (`editors({ loadCalendar })` returns one). */
export interface CalendarKit {
  open(a: CalendarAdapter): CalendarView;
}

const DAY = 86_400_000;
/** A whole number in the grid's digits, `w` digits at least, no groups. */
const num = (ctx: LocaleCtx, n: number, w: number): string => new Intl.NumberFormat(intlTag(ctx), { minimumIntegerDigits: w, useGrouping: false }).format(n);

/**
 * A day as a field writes it (Behaviour 2): numbers in the locale's order, two-digit day and month, four-digit
 * year, the locale's separator (its bidi marks dropped), the grid's digits — what the day codec reads back.
 */
export function dayText(ctx: LocaleCtx, d: string): string {
  const lit = new Intl.DateTimeFormat(intlTag(ctx), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(0).find((p) => p.type === 'literal');
  const s = stripMarks(lit?.value ?? '');
  const part = { y: num(ctx, +d.slice(0, 4), 4), m: num(ctx, +d.slice(5, 7), 2), d: num(ctx, +d.slice(8, 10), 2) };
  return dayFieldOrder(ctx).map((k) => part[k]).join(/^[/.\-\s]+$/.test(s) ? s : '/');
}

/** An instant as a field writes it: its day in the grid's zone, then `HH:mm` (24 h), `:ss` only when not 0. */
export function atText(ctx: LocaleCtx, ms: number): string {
  const wall = ms + offsetAt(ms, ctx.timeZone);
  const n = Math.floor(wall / DAY);
  // Floored, never rounded (review R4): 23:59:59.5 is 23:59:59, never « 24:00 »; 12:05:00.600 is 12:05.
  const r = Math.floor((wall - n * DAY) / 1000);
  const two = (v: number): string => num(ctx, v, 2);
  return `${dayText(ctx, epochDayToDay(n)!)} ${two(Math.floor(r / 3600))}:${two(Math.floor(r / 60) % 60)}${r % 60 ? `:${two(r % 60)}` : ''}`;
}

/** Today by the grid's clock, in its zone. */
export const today = (g: GridContext<unknown>): string => instantToDayIn((g.settings.clock ?? Date.now)() as never, g.ctx.timeZone) ?? '1970-01-01';

/** The calendar chunk, imported once (a failure forgotten: Retry imports again), `loadCalendar` replacing the import. */
export const calendars = (own?: () => Promise<CalendarKit>) =>
  once((_: 0) => (own ?? (() => import('./dates/calendar.js')))(), (m) => typeof m?.open === 'function', 'open in calendar ', 'editors');

let uid = 0;

/**
 * A day or instant editor (editors.md 6–9, step06-plan « Behaviour » 1–10): the field in a box with the calendar
 * button; Alt+Down or the button open the calendar in a modal dialog under the cell (above when no room), loaded on
 * the first open only (prefetched by the button's pointerenter / pointerdown, never by typing: S6-O4); its loading
 * line, its failure with Retry. The written-value rule: an untouched text keeps the value written into it.
 */
export function dateEd(x: EdEnv, f: HTMLInputElement, col: ResolvedColumn<unknown>, raw: unknown, ch: string | undefined, blur: () => void): Ed {
  const { g, o } = x;
  const at = col.type === 'instant';
  const doc = g.doc;
  const box = doc.createElement('span');
  box.className = 'dzg-datebox';
  const text = (v: unknown): string => (v == null ? '' : at ? atText(g.ctx, v as number) : dayText(g.ctx, v as string));
  const v0 = col.codec.coerce(raw, g.ctx);
  /** What the grid wrote into the field, and its text (Behaviour 3). */
  let w = { t: text(v0), v: raw };
  f.value = ch ?? w.t;
  f.placeholder = dayText(g.ctx, today(g)) + (at ? ` ${num(g.ctx, 0, 2)}:${num(g.ctx, 0, 2)}` : '');
  box.append(f);
  let pop: PopupRef | null = null;
  const btn = o.calendar === false ? null : doc.createElement('button');
  const L = x.cal;
  const calendar = (): void => {
    if (pop) return;
    const host = doc.createElement('div');
    host.className = 'dzg-cal';
    host.tabIndex = -1;
    let view: { destroy(): void } | null = null;
    const p: PopupRef = (pop = popupsFor(g).open(f, host, {
      placement: 'block-end', modal: true, label: x.msg('edit.calendar', {}), opener: () => btn,
      onClose() {
        pop = null;
        try {
          view?.destroy();
        } catch (err) {
          g.report(err);
        }
        setAttr(f, 'aria-expanded', 'false');
        f.removeAttribute('aria-controls');
        // A press outside: the focus went elsewhere, the field's blur rule decides (Q5).
        blur();
      },
    }));
    p.el.id = `dzg-cal${++uid}`;
    setAttr(f, 'aria-expanded', 'true');
    f.setAttribute('aria-controls', p.el.id);
    const live = (): boolean => pop === p;
    const n = notice(doc, host, () => mount(), (s) => x.msg(s === 'load' ? 'edit.calendarLoading' : 'edit.calendarFailed', {}), () => g.msg('grid.retry'));
    const fail = (err: unknown): void => {
      g.report(err);
      n.say('fail');
    };
    const attach = (k: { open: (a: CalendarAdapter) => CalendarView }): void => {
      n.stop();
      const v = doc.createElement('div');
      host.append(v);
      const read = col.codec.parse(f.value, g.ctx);
      const s = g.settings;
      try {
        const cv = k.open({
          host: v, grid: g.el.root, inject: s.injectStyles !== false, ...(s.nonce && { nonce: s.nonce }), kind: at ? 'instant' : 'day', ctx: g.ctx,
          today: today(g), label: x.msg('edit.calendar', {}), ...(o.dateMessages && { messages: o.dateMessages }),
          value: (read !== REJECTED && read !== null ? read : v0) as string | number | null,
          pick(d) {
            w = { t: (f.value = text(d)), v: d };
          },
          close() {
            p.close();
            f.setSelectionRange(f.value.length, f.value.length);
          },
        });
        view = cv;
        cv.focus();
      } catch (err) {
        v.remove();
        fail(err);
      }
    };
    const mount = (): void => {
      const k = L.done(0);
      if (k) return attach(k);
      n.say('load');
      host.focus();
      L.load(0).then((m) => live() && attach(m), (err) => live() && fail(err));
    };
    mount();
  };
  if (btn) {
    btn.type = 'button';
    btn.className = 'dzg-calbtn';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', x.msg('edit.calendar', {}));
    // A combobox opening a dialog (ARIA 1.2): a text box may not say it is expanded.
    setAttr(f, 'role', 'combobox');
    setAttr(f, 'aria-haspopup', 'dialog');
    setAttr(f, 'aria-expanded', 'false');
    setAttr(f, 'aria-keyshortcuts', 'Alt+ArrowDown');
    // Hovering or pressing the button fetches the chunk ahead (S6-O4); the press keeps the focus in the field.
    const ahead = (): void => void L.load(0).catch(() => {});
    btn.addEventListener('pointerenter', ahead);
    btn.addEventListener('pointerdown', (e) => (ahead(), e.preventDefault()));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => (pop ? pop.close() : calendar()));
    box.append(btn);
  }
  return {
    root: box,
    focus: f,
    input: () => (f.value === w.t ? { value: w.v } : { text: f.value }),
    keys: (e) => !!btn && e.key === 'ArrowDown' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (calendar(), true),
    inside: (n) => !!pop?.el.contains(n),
    place: () => pop?.reposition(),
    drop: () => pop?.close(),
  };
}
