import { Tooltip, type TipLook, type TipTone } from '../render/tooltip.js';
import { enhance } from './engine.js';
import { dirAt, drawn, floatStyles, keyed, pageOf, type TipContent } from './float.js';

/** A tooltip on any element of the page (tooltips-popovers.md 1–9). */
export interface TooltipOptions extends TipLook {
  readonly content: TipContent;
  /** Before it shows on hover, ms. @default 500 */
  readonly delayMs?: number;
  /** The grace after the pointer leaves, ms. @default 150 */
  readonly hideDelayMs?: number;
  readonly disabled?: boolean;
  /** The page's nonce for the one `<style>` it adds (a strict CSP). */
  readonly nonce?: string;
}

export interface TooltipHandle {
  /** Shows it now (as a keyboard focus would). */
  show(): void;
  hide(): void;
  /** New options, merged; a shown tooltip shows the new content at once. */
  update(o: Partial<TooltipOptions>): void;
  readonly shown: boolean;
  destroy(): void;
}

/** One bubble per document: one tooltip on screen at a time (3). */
const bubbles = new WeakMap<Document, Tooltip>();
function bubbleOf(doc: Document, nonce: string | undefined): Tooltip {
  let t = bubbles.get(doc);
  // A page that emptied its body (a single-page app's view swap) gets it back.
  if (t) return t.el.isConnected || doc.body.append(t.el), t;
  floatStyles(doc, nonce);
  const el = doc.createElement('div');
  el.className = 'dzg-tooltip dzg-float';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  doc.body.append(el);
  // The page's content: an app's nodes in place of the words, told when they go (a view destroyed).
  let gone: (() => void) | undefined;
  t = new Tooltip(el, pageOf(doc).scope, (tip) => {
    const g = gone;
    gone = tip?.gone;
    g?.();
    if (tip?.node) el.replaceChildren(tip.node);
    else if (!tip) el.replaceChildren();
    return !!tip?.node;
  });
  t.report = (e) => void doc.defaultView?.reportError?.(e);
  // Below and centred unless placed; the app's animation, the fade awaited, one at a time with the grids'.
  enhance(t, 'bottom', t.report);
  bubbles.set(doc, t);
  return t;
}

/**
 * Gives `el` a tooltip: after `delayMs` on hover (never on touch alone), at once on a keyboard focus; the pointer may
 * move onto it; Escape, a press, a scroll or the pointer leaving hide it. `aria-describedby` on `el` while shown.
 */
export function tooltip(el: HTMLElement, options: TooltipOptions): TooltipHandle {
  const doc = el.ownerDocument;
  let o = options;
  const page = pageOf(doc);
  const ac = new AbortController();
  const on = (t: EventTarget, type: string, fn: (e: Event) => void, capture = false): void => t.addEventListener(type, fn, { signal: ac.signal, capture, passive: true });
  const tip = (): Tooltip => bubbleOf(doc, o.nonce);
  const mine = (): boolean => bubbles.get(doc)?.anchor === el;
  const show = (delay: number): void => {
    if (o.disabled) return;
    const t = tip();
    const look = o;
    t.look = () => look;
    const c = drawn(look.content, doc);
    if (!c.text && !c.node) return void c.gone?.();
    // Its words read in the anchor's direction, and its logical place measured in it.
    const d = dirAt(el);
    t.el.dir = d;
    t.showFor(el, { text: c.text, node: c.node, ...(c.gone && { gone: c.gone }), tone: look.tone }, d, delay);
  };
  const hide = (): void => {
    if (mine()) bubbles.get(doc)!.hide();
  };
  on(el, 'pointerenter', (e) => void ((e as PointerEvent).pointerType !== 'touch' && show(o.delayMs ?? 500)));
  on(el, 'pointerleave', (e) => {
    const t = bubbles.get(doc);
    if (t && !t.el.contains((e as PointerEvent).relatedTarget as Node | null)) t.hideSoon();
  });
  on(el, 'focusin', () => void (keyed(doc) && show(0)));
  on(el, 'focusout', hide);
  on(el, 'pointerdown', hide);
  on(doc, 'scroll', hide, true);
  const escape = (): void => hide();
  page.escape.add(escape);
  return {
    show: () => show(0),
    hide,
    update(n) {
      o = { ...o, ...n };
      if (mine()) o.disabled ? hide() : show(0);
    },
    get shown() {
      return mine() && !bubbles.get(doc)!.el.hidden;
    },
    destroy() {
      hide();
      ac.abort();
      page.escape.delete(escape);
    },
  };
}

export type { TipContent, TipTone };
