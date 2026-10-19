import type { Part, SlotContext } from '../part.js';
import { echo, nameOf, numberIn, shown, textField } from './field.js';

type C = SlotContext['filter'];
type F = { readonly type: string; readonly op?: string; readonly value?: unknown; readonly valueTo?: unknown; readonly caseSensitive?: boolean };

/** A kind's fields in the popup: what they can show, show, read and focus. */
interface Body {
  readonly els: readonly HTMLElement[];
  edits(s: F | null): boolean;
  write(s: F | null): void;
  /** The draft: a filter, null (none), undefined: a field does not read (marked and said when `judge`). */
  read(judge: boolean): F | null | undefined;
  texts(): void;
  focus(): void;
}
type Make = (c: () => C, doc: Document, changed: (now: boolean) => void) => Body;

let uid = 0;
const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = ''): HTMLElementTagNameMap[K] => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
/** A visible label holding its control (its name), the label's text first. */
const labelled = (doc: Document, control: HTMLElement): [HTMLLabelElement, HTMLSpanElement] => {
  const l = el(doc, 'label');
  const s = el(doc, 'span');
  l.append(s, control);
  return [l, s];
};

/**
 * The popup's shell (docs/behaviors/filter-ui.md, step 13): the kind's fields, or the summary
 * (`filter.summaryActive`) for a filter they cannot show; a footer with Clear and Apply. In the
 * browser what is typed goes to `set` after the pause, a choice at once, Apply and Enter apply now
 * and close. On a server (owner decision O3) the fields are a draft: Apply or Enter sends it,
 * closing without drops it. A number that does not read is never sent: marked, said once, and at
 * Apply the focus goes to it, the popup stays. The echo rules are the floating box's (`field.ts`):
 * a filter from elsewhere rewrites clean fields, never ones being edited.
 */
function form(make: Make): Part<C> {
  return {
    mount(host, first) {
      let c = first;
      const doc = host.ownerDocument;
      const e = echo();
      let draft: F | null = null;
      let showing: boolean | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const live = (): boolean => c.where !== 'server';
      const sum = el(doc, 'p', 'dzg-fsum');
      const clear = el(doc, 'button', 'dzg-fclr');
      const apply = el(doc, 'button', 'dzg-fapply');
      const foot = el(doc, 'div', 'dzg-ffoot');
      clear.type = apply.type = 'button';
      foot.append(clear, apply);

      function changed(now: boolean): void {
        clearTimeout(timer);
        const f = body.read(false);
        if (f !== undefined) draft = f;
        const send = e.edit(f, c.state, f !== undefined);
        if (!live()) return;
        // Unreadable: judged once the edit would have applied.
        if (f === undefined) timer = setTimeout(() => body.read(true), c.debounceMs);
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
        if (e.stale(c.state, c.ctx)) body.write((draft = c.state as F | null));
        show();
        body.texts();
        sum.textContent = c.msg('filter.summaryActive');
        clear.textContent = c.msg('filter.clear', { column: nameOf(c) });
        apply.textContent = c.msg('filter.apply');
      };
      const commit = (): void => {
        clearTimeout(timer);
        if (showing) {
          const f = body.read(true);
          // Unreadable: the focus on the first such field; the popup stays.
          if (f === undefined) return host.querySelector<HTMLElement>('[aria-invalid=true]')?.focus();
          // The filter in force again stores nothing (the kernel keeps an equal filter as it is).
          c.set(f as never, { commit: 'now' });
        }
        c.close();
      };
      clear.addEventListener('click', () => {
        body.write((draft = null));
        show();
        changed(true);
      });
      apply.addEventListener('click', commit);
      host.addEventListener('keydown', (k) => {
        const t = k.target as HTMLInputElement;
        if (k.key === 'Enter' && !k.isComposing && t.tagName !== 'BUTTON') k.preventDefault(), commit();
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
        destroy: () => clearTimeout(timer),
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
const NUM = ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank'];
const empty = (op: string): boolean => op === 'blank' || op === 'notBlank';

/** Text and number: an operator (the column's `filter.ops` in its order, else all), a value, a second one for between. */
const conditions = (num: boolean): Make => (get, doc, changed) => {
  const all = num ? NUM : TEXT;
  const type = num ? 'number' : 'text';
  const ops = (): string[] => {
    const own = get().ops.filter((o) => all.includes(o));
    return own.length ? own : all;
  };
  const op = el(doc, 'select', 'dzg-fop');
  const a = textField(doc, num);
  const b = textField(doc, num);
  a.classList.add('dzg-fval');
  b.classList.add('dzg-fto');
  const [lo, so] = labelled(doc, op);
  const [la, sa] = labelled(doc, a);
  const [lb, sb] = labelled(doc, b);
  const vis = (): void => {
    la.hidden = empty(op.value);
    lb.hidden = op.value !== 'between';
  };
  op.addEventListener('change', () => (vis(), changed(true)));
  for (const i of [a, b]) {
    i.addEventListener('input', (k) => {
      if ((k as InputEvent).isComposing) return;
      i.removeAttribute('aria-invalid');
      changed(false);
    });
    i.addEventListener('compositionend', () => changed(false));
  }
  const fill = (): void => {
    const list = ops();
    if ([...op.options].map((o) => o.value).join() === list.join()) return;
    op.replaceChildren(...list.map((v) => Object.assign(el(doc, 'option'), { value: v })));
  };
  return {
    els: [lo, la, lb],
    edits: (s) => s === null || (s.type === type && ops().includes(s.op!)),
    write(s) {
      const list = ops();
      const g = get();
      fill();
      op.value = s ? s.op! : list[0]!;
      a.value = s ? (num ? shown(g.ctx, s.value) : ((s.value as string) ?? '')) : '';
      b.value = s ? shown(g.ctx, s.valueTo) : '';
      a.removeAttribute('aria-invalid');
      b.removeAttribute('aria-invalid');
      vis();
    },
    read(judge) {
      const c = get();
      const o = op.value;
      if (empty(o)) return { type, op: o };
      if (!num) return a.value ? { type, op: o, value: a.value, ...((c.state as F | null)?.caseSensitive && { caseSensitive: true }) } : null;
      const fields = o === 'between' ? [a, b] : [a];
      const [x, y] = fields.map((i) => numberIn(i, c.ctx));
      const bad = fields.filter((i) => numberIn(i, c.ctx) === null);
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
      fill();
      so.textContent = c.msg('filter.op');
      sa.textContent = c.msg('filter.value');
      sb.textContent = c.msg('filter.valueTo');
      for (const o of op.options) o.textContent = c.msg(`filter.op.${o.value}` as never);
    },
    focus() {
      if (empty(op.value)) return op.focus();
      a.focus();
      a.select();
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
    r.addEventListener('change', () => changed(true));
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
      group.setAttribute('aria-label', c.msg('filter.popupLabel', { column: nameOf(c) }));
      ['filter.all', 'filter.yes', 'filter.no'].forEach((k, i) => (spans[i]!.textContent = c.msg(k as never)));
    },
    focus: () => radios.find((r) => r.checked)?.focus(),
  };
};

export const textForm = form(conditions(false));
export const numberForm = form(conditions(true));
export const booleanForm = form(yesNo);
