import type { LocaleCtx } from '@dzgrid/core';
import type { Part, SlotContext } from '../part.js';
import { composing } from '@dzgrid/dom/internal';
import { el, labelled, tx } from './dom.js';
import { echo, nameOf, numberIn, shown, textField } from './field.js';

export { el, labelled, tx };

type C = SlotContext['filter'];
/** A filter as the forms read and write it (any built-in kind's fields). */
export type F = { readonly type: string; readonly op?: string; readonly value?: unknown; readonly valueTo?: unknown; readonly caseSensitive?: boolean; readonly [k: string]: unknown };

/** A kind's fields in the popup: what they can show, show, read and focus. */
export interface Body {
  readonly els: readonly HTMLElement[];
  edits(s: F | null): boolean;
  write(s: F | null): void;
  /** The draft: a filter, null (none), undefined: a field does not read (marked and said when `judge`). */
  read(judge: boolean): F | null | undefined;
  texts(): void;
  focus(): void;
  destroy?(): void;
}
/** `now` null: the form changed under the user (an operator no longer offered): recorded, nothing sent. `clr`: a null draft removes the filter (Clear, All). */
export type Changed = (now: boolean | null, clr?: boolean) => void;
export type Make = (c: () => C, doc: Document, changed: Changed) => Body;

let uid = 0;
/**
 * The popup's shell (docs/behaviors/filter-ui.md, step 13): the kind's fields, or the summary
 * (`filter.summaryActive`) for a filter they cannot show; a footer with Clear and Apply. In the
 * browser what is typed goes to `set` after the pause, a choice at once, Apply and Enter apply now
 * and close. On a server (owner decision O3), or with `filters({ apply: 'button' })` (owner's look, app-feedback 20),
 * the fields are a draft: Apply or Enter sends it, closing without drops it. A number that does not read is never sent: marked, said once, and at
 * Apply the focus goes to it, the popup stays. The echo rules are the floating box's (`field.ts`):
 * a filter from elsewhere rewrites clean fields, never ones being edited. A draft that cannot
 * filter yet (between with one bound, an empty value) keeps the filter in force and drops the
 * pending edit (lead decision L1); only Clear or All remove it.
 */
export function form(make: Make): Part<C> {
  return {
    mount(host, first) {
      let c = first;
      const doc = host.ownerDocument;
      const e = echo();
      let draft: F | null = null;
      let showing: boolean | null = null;
      /** The last change removes: a null draft is applied (Clear, All), not kept (L1). */
      let none = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const live = (): boolean => c.where !== 'server' && c.apply !== 'button';
      const sum = el(doc, 'p', 'dzg-fsum');
      const clear = el(doc, 'button', 'dzg-fclr');
      const apply = el(doc, 'button', 'dzg-fapply');
      const foot = el(doc, 'div', 'dzg-ffoot');
      clear.type = apply.type = 'button';
      foot.append(clear, apply);

      function changed(now: boolean | null, clr = false): void {
        if (now === null && !showing) return;
        clearTimeout(timer);
        none = clr;
        const f = body.read(false);
        if (f !== undefined) draft = f;
        // An inactive draft sends nothing: the filter in force stays (L1). Clear and All always
        // write (a pending edit of the floating box's included).
        const send = ((e.edit(f, c.state, f !== undefined) && f !== null) || clr) && now !== null;
        if (!live()) return;
        // Unreadable: judged once the edit would have applied.
        if (f === undefined && now !== null) timer = setTimeout(() => body.read(true), c.debounceMs);
        if (send) c.set(f as never, now ? { commit: 'now' } : undefined);
        else c.set(null, { commit: 'cancel' });
      }
      const body = make(() => c, doc, changed);
      const show = (): void => {
        const f = body.edits(draft);
        // The footer stays put: a focused Clear keeps the focus when the fields come back.
        if (f === showing) return;
        while (host.firstChild !== foot) host.firstChild!.remove();
        foot.before(...((showing = f) ? body.els : [sum]));
      };
      const draw = (): void => {
        // A filter the fields cannot show is not written to them (no date kit loaded behind a summary).
        if (e.stale(c.state, c.ctx, c.dropped) && body.edits((draft = c.state as F | null))) body.write(draft);
        show();
        body.texts();
        tx(sum, c.msg('filter.summaryActive'));
        // The column in the name, not in the text: a long name wrapped the footer (feedback pass J). The text is the
        // name's start (WCAG 2.5.3): the template without its column.
        const cl = c.msg('filter.clear', { column: nameOf(c) });
        tx(clear, c.msg('filter.clear', { column: '' }).trim());
        if (clear.getAttribute('aria-label') !== cl) clear.setAttribute('aria-label', cl);
        tx(apply, c.msg('filter.apply'));
      };
      const commit = (): void => {
        clearTimeout(timer);
        if (showing) {
          const f = body.read(true);
          // Unreadable: the focus on the first such field; the popup stays.
          if (f === undefined) return host.querySelector<HTMLElement>('[aria-invalid=true]')?.focus();
          // The filter in force again stores nothing (the kernel keeps an equal filter as it is);
          // an inactive draft keeps it (L1).
          if (f !== null || none) c.set(f as never, { commit: 'now' });
        }
        c.close();
      };
      clear.addEventListener('click', () => {
        body.write((draft = null));
        show();
        changed(true, true);
      });
      apply.addEventListener('click', commit);
      host.addEventListener('keydown', (k) => {
        const t = k.target as HTMLInputElement;
        // Enter inside a date panel is the panel's (step 14).
        if (k.key === 'Enter' && !composing(k) && t.tagName !== 'BUTTON' && !t.closest('.tz-field__panel')) k.preventDefault(), commit();
        // A radio group is one Tab stop: back from it wraps to the last control.
        else if (k.key === 'Tab' && k.shiftKey && t.type === 'radio') k.preventDefault(), apply.focus();
      });
      host.append(foot);
      draw();
      return {
        update(n) {
          c = n;
          draw();
        },
        destroy() {
          clearTimeout(timer);
          body.destroy?.();
        },
        focus() {
          if (showing) body.focus();
          else clear.focus();
          return true;
        },
      };
    },
  };
}

const TEXT = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank'];
export const NUM = ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank'];
export const empty = (op: string): boolean => op === 'blank' || op === 'notBlank';
export const hide = (l: HTMLElement, v: boolean): void => void (l.hidden !== v && (l.hidden = v));

/** The fields under a condition's operator: what they show for one, write, read and focus. */
export interface Values {
  readonly els: readonly HTMLElement[];
  /** A stored filter of the kind, its operator offered: can the fields show it? */
  can(s: F): boolean;
  /** The operator now chosen (or written). */
  show(op: string): void;
  write(s: F | null, op: string): void;
  /** The draft for a value operator (`read` of `Body`). */
  read(op: string, judge: boolean): F | null | undefined;
  texts(): void;
  /** False: nothing to focus (the operator takes it). */
  focus(op: string): boolean;
  destroy?(): void;
}

/**
 * A condition form (text, number, day, instant): an operator (the column's `filter.ops` in its
 * order, else the kind's), labelled `filter.op.<label[op] ?? op>`, and the kind's fields under it.
 * `opOf`: the operator a stored filter shows under (a date shortcut under between).
 */
export interface Spec {
  readonly type: string;
  readonly ops: readonly string[];
  readonly label?: Readonly<Record<string, string>>;
  readonly opOf?: (s: F) => string;
  readonly values: (get: () => C, doc: Document, changed: Changed) => Values;
}

export const conditions = (spec: Spec): Make => (get, doc, changed) => {
  const { type, ops: all } = spec;
  const ops = (): readonly string[] => {
    const own = get().ops.filter((o) => all.includes(o));
    return own.length ? own : all;
  };
  const opOf = (s: F): string => spec.opOf?.(s) ?? s.op!;
  const op = el(doc, 'select', 'dzg-fop');
  const [lo, so] = labelled(doc, op);
  const v = spec.values(get, doc, changed);
  const vis = (): void => v.show(op.value);
  op.addEventListener('change', () => (vis(), changed(true)));
  /** The options of the column's operators; the one chosen kept when still offered. True: it was not (the first now). */
  const fill = (): boolean => {
    const list = ops();
    if ([...op.options].map((o) => o.value).join() === list.join()) return false;
    const was = op.value;
    op.replaceChildren(...list.map((o) => Object.assign(el(doc, 'option'), { value: o })));
    op.value = list.includes(was) ? was : list[0]!;
    return !!was && op.value !== was;
  };
  return {
    els: [lo, ...v.els],
    edits: (s) => s === null || (s.type === type && ops().includes(opOf(s)) && v.can(s)),
    write(s) {
      fill();
      op.value = s ? opOf(s) : ops()[0]!;
      v.write(s, op.value);
      vis();
    },
    read: (judge) => (empty(op.value) ? { type, op: op.value } : v.read(op.value, judge)),
    texts() {
      const c = get();
      // An operator no longer offered: the first shown, and the draft is what the form says.
      if (fill()) vis(), changed(null);
      // One operator: no « Condition » to choose (feedback pass B); hidden, so out of the tab order.
      hide(lo, op.options.length < 2);
      tx(so, c.msg('filter.op'));
      v.texts();
      for (const o of op.options) tx(o, c.msg(`filter.op.${spec.label?.[o.value] ?? o.value}` as never));
    },
    focus() {
      if (empty(op.value) || !v.focus(op.value)) op.focus();
    },
    destroy: () => v.destroy?.(),
  };
};

/** Text and number: a value, a second one for between. */
const boxes = (num: boolean): Spec['values'] => (get, doc, changed) => {
  const type = num ? 'number' : 'text';
  const a = textField(doc, num);
  const b = textField(doc, num);
  a.classList.add('dzg-fval');
  b.classList.add('dzg-fto');
  const [la, sa] = labelled(doc, a);
  const [lb, sb] = labelled(doc, b);
  /** The locale each value was typed or written in: read in it, once (a locale switch since changes nothing). */
  const at = new Map<HTMLInputElement, LocaleCtx>();
  for (const i of [a, b]) {
    i.addEventListener('input', (k) => {
      if ((k as InputEvent).isComposing) return;
      i.removeAttribute('aria-invalid');
      at.set(i, get().ctx);
      changed(false);
    });
    i.addEventListener('compositionend', () => (at.set(i, get().ctx), changed(false)));
  }
  return {
    els: [la, lb],
    can: () => true,
    show(o) {
      hide(la, empty(o));
      hide(lb, o !== 'between');
    },
    write(s) {
      const g = get();
      a.value = s ? (num ? shown(g.ctx, s.value) : ((s.value as string) ?? '')) : '';
      b.value = s ? shown(g.ctx, s.valueTo) : '';
      a.removeAttribute('aria-invalid');
      b.removeAttribute('aria-invalid');
      at.set(a, g.ctx).set(b, g.ctx);
    },
    read(o, judge) {
      const c = get();
      if (!num) return a.value ? { type, op: o, value: a.value, ...((c.state as F | null)?.caseSensitive && { caseSensitive: true }) } : null;
      const fields = o === 'between' ? [a, b] : [a];
      const read = (i: HTMLInputElement) => numberIn(i, at.get(i) ?? c.ctx);
      const [x, y] = fields.map(read);
      const bad = fields.filter((i) => read(i) === null);
      if (bad.length) {
        // Said once: a field already marked is not said again.
        if (judge && bad.some((i) => !i.hasAttribute('aria-invalid'))) c.announce(c.msg('filter.invalid', { column: nameOf(c) }));
        if (judge) for (const i of bad) i.setAttribute('aria-invalid', 'true');
        return undefined;
      }
      if (x == null || (o === 'between' && y == null)) return null;
      return o === 'between' ? { type, op: o, value: x, valueTo: y! } : { type, op: o, value: x };
    },
    texts() {
      const c = get();
      tx(sa, c.msg('filter.value'));
      tx(sb, c.msg('filter.valueTo'));
    },
    focus() {
      a.focus();
      a.select();
      return true;
    },
  };
};

/** Boolean: a radio group named for the column, All / Yes / No (null, true, false). */
const yesNo: Make = (get, doc, changed) => {
  const group = el(doc, 'div');
  group.setAttribute('role', 'radiogroup');
  const id = `dzg-fb${uid++}`;
  const spans: HTMLSpanElement[] = [];
  const radios = [0, 1, 2].map(() => {
    const r = el(doc, 'input');
    r.type = 'radio';
    r.name = id;
    // All is a choice: it removes the filter.
    r.addEventListener('change', () => changed(true, true));
    const [l, s] = labelled(doc, r);
    l.append(s);
    spans.push(s);
    group.append(l);
    return r;
  });
  return {
    els: [group],
    edits: (s) => s === null || (s.type === 'boolean' && typeof s.value === 'boolean'),
    write: (s) => void (radios[s ? (s.value ? 1 : 2) : 0]!.checked = true),
    read() {
      const i = radios.findIndex((r) => r.checked);
      return i > 0 ? { type: 'boolean', value: i === 1 } : null;
    },
    texts() {
      const c = get();
      const l = c.msg('filter.popupLabel', { column: nameOf(c) });
      if (group.getAttribute('aria-label') !== l) group.setAttribute('aria-label', l);
      ['filter.all', 'filter.yes', 'filter.no'].forEach((k, i) => tx(spans[i]!, c.msg(k as never)));
    },
    focus: () => radios.find((r) => r.checked)?.focus(),
  };
};

export const textForm = form(conditions({ type: 'text', ops: TEXT, values: boxes(false) }));
export const numberForm = form(conditions({ type: 'number', ops: NUM, values: boxes(true) }));
export const booleanForm = form(yesNo);
