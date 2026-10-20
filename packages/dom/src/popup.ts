import { fixedInlineStart, type Dir } from './dir.js';
import { setPx } from './render/rows.js';
import type { Scope } from './render/scope.js';
import type { GridContext } from './context.js';

export interface PopupOptions {
  /** Below the anchor (block-end), or beside it toward the end of the line (inline-end). */
  readonly placement: 'block-end' | 'inline-end';
  /** Focus moves in and stays in until it closes (a filter popup). Every popup closes on a pointer down outside it (owner Q4, step 18). */
  readonly modal?: boolean;
  readonly label?: string;
  /** The control a press on which is left to its click (it toggles the popup), from the anchor; the anchor by default. */
  readonly opener?: (anchor: HTMLElement) => HTMLElement | null;
  readonly onClose?: () => void;
}

export interface PopupRef {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Places it again (its content changed size). */
  reposition(): void;
  /** Anchors it to another element (its anchor left, its place stays): placed there, focus back there. */
  move(anchor: HTMLElement): void;
  close(): void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const topLayer = (el: HTMLElement): el is HTMLElement & { showPopover(): void; hidePopover(): void } =>
  typeof (el as { showPopover?: unknown }).showPopover === 'function';

/**
 * Popups (a filter, a menu) and the tooltip, in the browser's top layer when
 * it has one (`popover="manual"`): a host ancestor with `transform`,
 * `overflow` or `contain` (a dialog, a card) can neither clip nor trap them.
 * Fixed in the grid's root otherwise. Placed in logical coordinates; Escape
 * closes and gives focus back to the anchor; a modal popup keeps Tab inside.
 * A pointer down outside it (not on its opener) closes it and leaves the focus
 * where the press puts it: back to the anchor only if it lands nowhere.
 * Its controls own their keys (`data-dzg-owner="popup"`).
 */
export class PopupHost {
  readonly #doc: Document;
  readonly #root: HTMLElement;
  readonly #dir: () => Dir;
  readonly #scope: Scope;
  readonly #open = new Map<PopupRef, HTMLElement>();
  /** Where focus goes when a popup closes and its anchor is gone (the grid's focused cell). */
  fallback: () => void = () => {};

  constructor(doc: Document, root: HTMLElement, scope: Scope, dir: () => Dir) {
    this.#doc = doc;
    this.#root = root;
    this.#dir = dir;
    this.#scope = scope;
    scope.add(() => { for (const p of [...this.#open.keys()]) p.close(); });
  }

  /** Closes the popups whose anchor left the page (a header recycled, a column hidden). */
  sweep(): void {
    for (const [p, anchor] of this.#open) if (!anchor.isConnected) p.close();
  }

  open(anchor: HTMLElement, content: HTMLElement, o: PopupOptions): PopupRef {
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'dzg-popup';
    el.dataset['dzgOwner'] = 'popup';
    if (o.modal) {
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
    }
    if (o.label) el.setAttribute('aria-label', o.label);
    el.setAttribute('dir', this.#dir());
    el.append(content);
    const usesTopLayer = topLayer(el);
    if (usesTopLayer) el.setAttribute('popover', 'manual');
    this.#root.append(el);
    if (usesTopLayer) (el as HTMLElement & { showPopover(): void }).showPopover();

    let isOpen = true;
    let outside = false;
    let at = anchor;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement, type: K, fn: (e: DocumentEventMap[K]) => void, capture = false) => {
      target.addEventListener(type, fn as EventListener, capture);
      cleanups.push(() => target.removeEventListener(type, fn as EventListener, capture));
    };
    const ref: PopupRef = {
      el,
      get open() { return isOpen; },
      reposition: () => this.#place(at, el, o.placement),
      move: (a) => {
        if (isOpen) this.#open.set(ref, (at = a)), ref.reposition();
      },
      close: () => {
        if (!isOpen) return;
        isOpen = false;
        this.#open.delete(ref);
        for (const c of cleanups.splice(0)) c();
        if (usesTopLayer) {
          try {
            (el as HTMLElement & { hidePopover(): void }).hidePopover();
          } catch {
            /* already hidden */
          }
        }
        const hadFocus = el.contains(doc.activeElement);
        el.remove();
        const back = (): void => (at.isConnected ? at.focus({ preventScroll: true }) : this.fallback());
        const lost = (): boolean => !doc.activeElement || doc.activeElement === doc.body;
        // A grid going moves no focus (nothing of it may hear a focus event). Pressed outside: the
        // press focuses what it lands on, after this; the anchor only if that is nothing.
        if (!this.#scope.isDisposed) {
          if (outside) this.#scope.timeout(() => void (lost() && back()), 0);
          else if (hadFocus || o.modal || lost()) back();
        }
        o.onClose?.();
      },
    };
    this.#open.set(ref, anchor);

    on(el, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        ref.close();
        return;
      }
      if (e.key !== 'Tab' || !o.modal) return;
      // A modal popup keeps Tab inside: from the last control to the first, and back.
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    });
    on(doc, 'pointerdown', (e: PointerEvent) => {
      // The path, not the target: inside a shadow root the target is the shadow host.
      const path = e.composedPath();
      if (path.includes(el) || path.includes((o.opener ? o.opener(at) : at) ?? el)) return;
      outside = true;
      ref.close();
    }, true);
    this.#place(anchor, el, o.placement);
    if (o.modal) el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    return ref;
  }

  /** Below (or beside) the anchor, start edges aligned; above it when there is no room below. */
  #place(anchor: HTMLElement, el: HTMLElement, placement: 'block-end' | 'inline-end'): void {
    const win = this.#doc.defaultView;
    const r = anchor.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const winBlock = win?.innerHeight ?? 0;
    const winInline = win?.innerWidth ?? 0;
    const dir = this.#dir();
    if (placement === 'block-end') {
      const below = r.bottom + 2;
      const top = below + box.height > winBlock && r.top - 2 - box.height >= 0 ? r.top - 2 - box.height : below;
      setPx(el, 'inset-block-start', Math.max(0, top));
      setPx(el, 'inset-inline-start', fixedInlineStart(r, dir, winInline, box.width));
    } else {
      setPx(el, 'inset-block-start', Math.max(0, Math.min(r.top, winBlock - box.height)));
      // Beside the anchor, toward the end of the line.
      const start = fixedInlineStart(r, dir, winInline, box.width) + r.width;
      setPx(el, 'inset-inline-start', Math.max(0, Math.min(start, winInline - box.width)));
    }
  }
}

const hosts = new WeakMap<object, PopupHost>();

/**
 * The grid's popup host, made by the first feature that needs one (filters,
 * menus): a grid without them carries none of this. Popups whose anchor
 * leaves the grid (a header recycled, a column hidden) close, focus back on
 * the grid's own focus.
 */
export function popupsFor(g: GridContext<unknown>): PopupHost {
  let host = hosts.get(g);
  if (host) return host;
  const made = new PopupHost(g.doc, g.el.root, g.scope, () => g.dir);
  made.fallback = () => g.restoreFocus();
  const Observer = (g.win as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  if (Observer) {
    const mo = new Observer(() => made.sweep());
    mo.observe(g.el.root, { childList: true, subtree: true });
    g.scope.add(() => mo.disconnect());
  }
  hosts.set(g, made);
  return made;
}
