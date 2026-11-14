/**
 * @dzgrid/angular/popover (1.12.0, docs/behaviors/tooltips-popovers.md 10–15): `[dzPopover]`, the bubble that stays — a
 * non-modal dialog by any element of the app or of a grid's cell, holding a template, a component (a form, a grid),
 * words, or cleaned HTML. Placed and animated like the tooltips (`@dzgrid/theme/tooltips.css`). Nothing runs on a server.
 */
import {
  ApplicationRef, DestroyRef, Directive, ElementRef, EnvironmentInjector, Injector, PLATFORM_ID,
  afterNextRender, effect, inject, input, output, signal, untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { popover, type PopoverCloseReason, type PopoverHandle } from '@dzgrid/dom/popover';
import { ɵdefined, ɵdzDraw, type DzTipContent, type TipAnimate, type TipAnimation, type TipTone, type TooltipPlacement } from '@dzgrid/angular/tooltip';

/**
 * `<button [dzPopover]="details" [dzPopoverContext]="row" #p="dzPopover" (opened)="…" (closed)="…">`. A click on the
 * host opens and closes it (`dzPopoverOpenOn="manual"`: only `open()`, `close()`, `toggle()`); Escape, a press outside
 * or the focus leaving close it. A template's `let-` value is the context, and `close()` is in its context.
 */
@Directive({ selector: '[dzPopover]', exportAs: 'dzPopover' })
export class DzPopover {
  readonly dzPopover = input<DzTipContent>();
  readonly dzPopoverContext = input<unknown>();
  readonly dzPopoverInputs = input<Readonly<Record<string, unknown>>>();
  readonly dzPopoverPlacement = input<TooltipPlacement>();
  readonly dzPopoverFlip = input<boolean>();
  /** The bubble drawn as this SVG path (`d`, a 100 × 100 box), for an animation that morphs it. */
  readonly dzPopoverShape = input<string>();
  readonly dzPopoverReducedMotion = input<'none' | 'fade'>();
  readonly dzPopoverTone = input<TipTone>();
  readonly dzPopoverAnimation = input<TipAnimation>();
  readonly dzPopoverAnimate = input<TipAnimate>();
  readonly dzPopoverLabel = input<string>();
  readonly dzPopoverGroup = input<string>();
  readonly dzPopoverOpenOn = input<'click' | 'manual'>();
  readonly opened = output<void>();
  readonly closed = output<PopoverCloseReason>();
  readonly #open = signal(false);
  /** Whether it is open (a signal). */
  readonly isOpen = this.#open.asReadonly();
  #handle: PopoverHandle | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const el: HTMLElement = inject(ElementRef).nativeElement;
    const ng = { app: inject(ApplicationRef), env: inject(EnvironmentInjector), injector: inject(Injector) };
    const rendered = signal(false);
    afterNextRender(() => rendered.set(true));
    effect(() => {
      if (!rendered()) return;
      const what = this.dzPopover();
      const o = {
        content: what == null || typeof what === 'string' ? (what ?? '') : ɵdzDraw(what, () => untracked(this.dzPopoverContext), () => untracked(this.dzPopoverInputs), () => this.close(), ng),
        ...ɵdefined({
          placement: this.dzPopoverPlacement(), flip: this.dzPopoverFlip(), shape: this.dzPopoverShape(), reducedMotion: this.dzPopoverReducedMotion(), tone: this.dzPopoverTone(), animation: this.dzPopoverAnimation(), animate: this.dzPopoverAnimate(),
          label: this.dzPopoverLabel(), group: this.dzPopoverGroup(), openOn: this.dzPopoverOpenOn(),
        }),
        onOpen: () => (this.#open.set(true), this.opened.emit()),
        onClose: (r: PopoverCloseReason) => (this.#open.set(false), this.closed.emit(r)),
      };
      untracked(() => (this.#handle ? this.#handle.update(o) : (this.#handle = popover(el, o))));
    });
    inject(DestroyRef).onDestroy(() => this.#handle?.destroy());
  }

  open(): void {
    this.#handle?.open();
  }

  close(): void {
    this.#handle?.close();
  }

  toggle(): void {
    this.#handle?.toggle();
  }

  /** Places it again (its content changed size). */
  reposition(): void {
    this.#handle?.reposition();
  }
}

export type { PopoverCloseReason };
