import { place, reveal, type TipLook } from '../render/tooltip.js';
import { conceal, custom, play, shapeOf } from '../tooltip/engine.js';
import { logicalBox, placementOf } from '../dir.js';
import { dirAt, drawn, floatStyles, type TipContent } from '../tooltip/float.js';

/** Why a popover closed (tooltips-popovers.md 10, 13, 14). */
export type PopoverCloseReason = 'escape' | 'outside' | 'focus' | 'trigger' | 'code' | 'group' | 'gone';

/** A popover: the bubble that stays (tooltips-popovers.md 10–15). */
export interface PopoverOptions extends TipLook {
  /** Drawn at each opening (a function is called then; its `gone()` when it closes). */
  readonly content: TipContent;
  /** Its accessible name; the trigger's own name otherwise (`aria-labelledby`). */
  readonly label?: string;
  /** One open at a time in a group, nesting aside. @default 'default' */
  readonly group?: string;
  /** `click`: the trigger toggles it; `manual`: only code. @default 'click' */
  readonly openOn?: 'click' | 'manual';
  /** The page's nonce for the one `<style>` it adds (a strict CSP). */
  readonly nonce?: string;
  readonly onOpen?: () => void;
  readonly onClose?: (reason: PopoverCloseReason) => void;
}

export interface PopoverHandle {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  /** The bubble while open. */
  readonly el: HTMLElement | null;
  /** Places it again (its content changed size). */
  reposition(): void;
  update(o: Partial<PopoverOptions>): void;
  destroy(): void;
}

/** What Tab stops on. */
const FOCUSABLE = ':is(a[href], button, input, select, textarea, summary, [contenteditable=true]):not([disabled], [type=hidden], [tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

interface Open {
  readonly bubble: HTMLElement;
  readonly group: string;
  readonly kids: Set<Open>;
  parent: Open | null;
  has(n: Node | null): boolean;
  close(reason: PopoverCloseReason): void;
}
/** The open popovers of a page. */
const opened = new Set<Open>();

let ids = 0;

/**
 * Gives `trigger` a popover: a non-modal dialog opened by a click (or by code), closed by Escape (focus back to the
 * trigger), a press outside, the focus leaving, the trigger again, or code. Placed like a tooltip, in the top layer,
 * followed on scroll and resize; closed when its trigger leaves the page or the window, or its grid row is recycled.
 */
export function popover(trigger: HTMLElement, options: PopoverOptions): PopoverHandle {
  const doc = trigger.ownerDocument;
  const win = doc.defaultView;
  let o = options;
  let cur: Open | null = null;
  let stop: AbortController | null = null;
  let gone: (() => void) | undefined;
  let frame = 0;
  /** A closing still running: what ends it (a destroy ends it at once). */
  let pending: (() => void) | null = null;
  trigger.id ||= `dzg-pt-${++ids}`;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const report = (e: unknown): void => void win?.reportError?.(e);
  // A trigger in a grid's row: the row it shows when the popover opened (a recycled row shows another).
  const rowOf = (): string | null => trigger.closest('[aria-rowindex]')?.getAttribute('aria-rowindex') ?? null;
  let row: string | null = null;

  /** Where it goes (`placement`, below and centred by default; `flip` false: never to the other side). */
  const placeIt = (): void => {
    if (!cur) return;
    const dir = dirAt(trigger);
    const [side, align] = placementOf(o.placement, dir, 'bottom');
    place(cur.bubble, trigger, dir, side, align, o.flip !== false);
  };
  /** The trigger still seen: inside the window and every scrolling box around it (it is clipped there otherwise). */
  const seen = (): boolean => {
    const W = win?.innerWidth ?? 0;
    const r = logicalBox(trigger.getBoundingClientRect(), 'ltr', W);
    if (!win || r.be < 0 || r.bs > win.innerHeight || r.ie < 0 || r.is > W) return false;
    for (let p = trigger.parentElement; p && p !== doc.body; p = p.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflow)) continue;
      const c = logicalBox(p.getBoundingClientRect(), 'ltr', W);
      if (r.be <= c.bs || r.bs >= c.be || r.ie <= c.is || r.is >= c.ie) return false;
    }
    return true;
  };
  const follow = (): void => {
    frame = 0;
    if (!cur) return;
    if (!trigger.isConnected || !seen() || rowOf() !== row) return close('gone');
    placeIt();
  };
  const soon = (): void => {
    if (!frame && cur) frame = win?.requestAnimationFrame?.(follow) ?? (follow(), 0);
  };

  function open(): void {
    if (cur) return;
    floatStyles(doc, o.nonce);
    const parent = [...opened].find((p) => p.bubble.contains(trigger)) ?? null;
    const group = o.group ?? 'default';
    for (const p of [...opened]) if (p.group === group && p !== parent && !p.has(trigger)) p.close('group');
    const bubble = doc.createElement('div');
    bubble.className = 'dzg-popover dzg-float';
    bubble.id = `dzg-pop-${++ids}`;
    bubble.setAttribute('role', 'dialog');
    bubble.tabIndex = -1;
    if (o.label) bubble.setAttribute('aria-label', o.label);
    else bubble.setAttribute('aria-labelledby', trigger.id);
    const c = drawn(o.content, doc);
    gone = c.gone;
    // Its content in a body of its own, which scrolls when tall (the bubble keeps its arrow outside it, never clipped).
    const body = doc.createElement('div');
    body.className = 'dzg-popover-body';
    if (c.node) body.append(c.node);
    else body.textContent = c.text;
    bubble.append(body);
    bubble.hidden = true;
    doc.body.append(bubble);
    const me: Open = {
      bubble, group, kids: new Set(), parent,
      has: (n) => !!n && (bubble.contains(n) || trigger.contains(n) || [...me.kids].some((k) => k.has(n))),
      close,
    };
    parent?.kids.add(me);
    cur = me;
    opened.add(me);
    row = rowOf();
    const dir = dirAt(trigger);
    bubble.dir = dir;
    reveal(bubble, o, undefined);
    custom(bubble, o);
    shapeOf(bubble, o);
    placeIt();
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', bubble.id);
    stop = new AbortController();
    const on = (t: EventTarget, type: string, fn: (e: Event) => void, capture = false): void => t.addEventListener(type, fn, { signal: stop!.signal, capture });
    on(doc, 'pointerdown', (e) => void (!me.has(e.target as Node) && close('outside')), true);
    const esc = (e: Event): void => {
      if ((e as KeyboardEvent).key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close('escape');
    };
    on(bubble, 'keydown', esc);
    // The bubble lives at the page's end, the trigger anywhere: Tab past its last control goes on to what follows the
    // trigger, Shift+Tab before its first back to the trigger — the page's order, as if it sat after its trigger.
    on(bubble, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (k.key !== 'Tab' || k.defaultPrevented) return;
      const mine = [...bubble.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const at = mine.indexOf(doc.activeElement as HTMLElement);
      if (k.shiftKey ? at > 0 : at < mine.length - 1 && at >= 0) return;
      e.preventDefault();
      const all = [...doc.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !me.has(x) || x === trigger);
      const to = k.shiftKey ? trigger : all[all.indexOf(trigger) + 1];
      close('focus');
      to?.focus();
    });
    on(trigger, 'keydown', esc);
    // Tab past its last control (or a click elsewhere that takes the focus) closes it, the focus left where it went.
    on(bubble, 'focusout', (e) => {
      const to = (e as FocusEvent).relatedTarget as Node | null;
      if (to && !me.has(to)) close('focus');
    });
    on(doc, 'scroll', soon, true);
    // Its content changing size (a form growing, a grid loading): placed again at the next frame.
    const Resize = win?.ResizeObserver;
    if (Resize) {
      const ro = new Resize(soon);
      ro.observe(bubble);
      stop.signal.addEventListener('abort', () => ro.disconnect());
    }
    if (win) on(win, 'resize', soon);
    play(bubble, o, 'open', report);
    // Into it when it has something to focus (an `autofocus` first); else the focus stays on the trigger.
    const first = bubble.querySelector<HTMLElement>('[autofocus]') ?? bubble.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    o.onOpen?.();
  }

  function close(reason: PopoverCloseReason = 'code'): void {
    const me = cur;
    if (!me) return;
    for (const k of [...me.kids]) k.close(reason === 'escape' ? 'code' : reason);
    cur = null;
    opened.delete(me);
    me.parent?.kids.delete(me);
    stop?.abort();
    stop = null;
    if (frame) win?.cancelAnimationFrame?.(frame);
    frame = 0;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    // Escape, the trigger or code with the focus inside: back to the trigger (never after a press elsewhere).
    if (me.bubble.contains(doc.activeElement) && (reason === 'escape' || reason === 'code' || reason === 'trigger')) trigger.focus();
    const g = gone;
    gone = undefined;
    const done = (): void => {
      pending = null;
      me.bubble.remove();
      g?.();
    };
    pending = done;
    conceal(me.bubble, o, done, report);
    o.onClose?.(reason);
  }

  const toggle = (): void => (cur ? close('trigger') : open());
  const onClick = (): void => void (o.openOn !== 'manual' && toggle());
  trigger.addEventListener('click', onClick);

  return {
    open,
    close: () => close('code'),
    toggle,
    get isOpen() {
      return !!cur;
    },
    get el() {
      return cur?.bubble ?? null;
    },
    reposition: placeIt,
    update(n) {
      o = { ...o, ...n };
      if (cur && n.label !== undefined) cur.bubble.setAttribute('aria-label', n.label);
      placeIt();
    },
    destroy() {
      close('code');
      pending?.();
      trigger.removeEventListener('click', onClick);
      trigger.removeAttribute('aria-haspopup');
      trigger.removeAttribute('aria-expanded');
    },
  };
}
