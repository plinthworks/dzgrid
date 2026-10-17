import { fixedInlineStart, type Dir } from './dir.js';
import { setPx } from './render/rows.js';
import type { Scope } from './render/scope.js';

export interface PopupOptions {
  /** Below the anchor (block-end), or beside it toward the end of the line (inline-end). */
  readonly placement: 'block-end' | 'inline-end';
  /** Focus moves in and stays in until it closes (a filter popup); non-modal popups close on a click outside. */
  readonly modal?: boolean;
  readonly label?: string;
  readonly onClose?: () => void;
}

export interface PopupRef {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Places it again (its content changed size). */
  reposition(): void;
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
 * Its controls own their keys (`data-dzg-owner="popup"`).
 */
export class PopupHost {
  readonly #doc: Document;
  readonly #root: HTMLElement;
  readonly #dir: () => Dir;
  readonly #open = new Set<PopupRef>();

  constructor(doc: Document, root: HTMLElement, scope: Scope, dir: () => Dir) {
    this.#doc = doc;
    this.#root = root;
    this.#dir = dir;
    scope.add(() => { for (const p of [...this.#open]) p.close(); });
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
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement, type: K, fn: (e: DocumentEventMap[K]) => void, capture = false) => {
      target.addEventListener(type, fn as EventListener, capture);
      cleanups.push(() => target.removeEventListener(type, fn as EventListener, capture));
    };
    const ref: PopupRef = {
      el,
      get open() { return isOpen; },
      reposition: () => this.#place(anchor, el, o.placement),
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
        if (hadFocus || o.modal) anchor.focus({ preventScroll: true });
        o.onClose?.();
      },
    };
    this.#open.add(ref);

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
    if (!o.modal) {
      on(doc, 'pointerdown', (e: PointerEvent) => {
        const t = e.target as Node | null;
        if (t && (el.contains(t) || anchor.contains(t))) return;
        ref.close();
      }, true);
    }
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
