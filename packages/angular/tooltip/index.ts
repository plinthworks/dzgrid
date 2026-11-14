/**
 * @dzgrid/angular/tooltip (1.12.0, docs/behaviors/tooltips-popovers.md): `[dzTooltip]` on any element of the app —
 * words, an `<ng-template>`, a component, or HTML through Angular's `DomSanitizer` and then DzGrid's own
 * cleaner. The
 * grid's engine, tones and animations (`@dzgrid/theme/tooltips.css`). Nothing runs on a server.
 */
import {
  ApplicationRef, ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, EnvironmentInjector, Injector, PLATFORM_ID, TemplateRef,
  afterNextRender, createComponent, effect, inject, input, signal, untracked, type Type,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { tooltip, type TipAnimate, type TipAnimation, type TipContent, type TipTone, type TooltipHandle, type TooltipPlacement } from '@dzgrid/dom/tooltip';

/** What `[dzTooltip]` (and `[dzPopover]`) show: words, a template, a component class, or HTML (opt-in, cleaned twice). */
export type DzTipContent = string | TemplateRef<any> | Type<unknown> | { readonly html: string } | null | undefined;

/** A template's context: `let-x` is `context` (also as `context`); a popover's adds `close()`. */
export interface DzTipTemplateContext<C = unknown> {
  $implicit: C;
  context: C;
  close: () => void;
}

/**
 * Not public API (shared with `@dzgrid/angular/popover`): an Angular content made into the DOM layer's — a template's
 * or a component's view created at each opening, attached to the application and checked, destroyed when it goes.
 */
export function ɵdzDraw(
  what: Exclude<DzTipContent, null | undefined | string>,
  context: () => unknown,
  inputs: () => Readonly<Record<string, unknown>> | undefined,
  close: () => void,
  ng: { app: ApplicationRef; env: EnvironmentInjector; injector: Injector },
): TipContent {
  if (what instanceof TemplateRef) {
    return () => {
      const c = context();
      const view = what.createEmbeddedView({ $implicit: c, context: c, close } satisfies DzTipTemplateContext, ng.injector);
      ng.app.attachView(view);
      view.detectChanges();
      const node = document.createDocumentFragment();
      node.append(...view.rootNodes);
      return { node, gone: () => view.destroy() };
    };
  }
  if (typeof what === 'function') {
    return () => {
      const ref = createComponent(what, { environmentInjector: ng.env, elementInjector: ng.injector });
      for (const [k, v] of Object.entries(inputs() ?? {})) ref.setInput(k, v);
      ng.app.attachView(ref.hostView);
      ref.changeDetectorRef.detectChanges();
      return { node: ref.location.nativeElement as Node, gone: () => ref.destroy() };
    };
  }
  // HTML: Angular's own sanitizing first (an `[innerHTML]` binding: the app's DomSanitizer), then DzGrid's allowlist (no
  // image, no link, no style survives).
  const ref = createComponent(ɵDzHtml, { environmentInjector: ng.env });
  ref.setInput('html', what.html);
  ref.changeDetectorRef.detectChanges();
  const html = (ref.location.nativeElement as HTMLElement).innerHTML;
  ref.destroy();
  return { html };
}

/** Not public API: HTML through Angular's `[innerHTML]` sanitizing, read back as text. */
@Component({ selector: 'dz-html', changeDetection: ChangeDetectionStrategy.OnPush, template: '', host: { '[innerHTML]': 'html()' } })
export class ɵDzHtml {
  readonly html = input('');
}

/**
 * `<button [dzTooltip]="'Delete the row'" dzTooltipTone="danger">`. After `dzTooltipDelay` ms on hover (never on touch
 * alone), at once on a keyboard focus; Escape hides it; `aria-describedby` while shown. A template gets
 * `dzTooltipContext` as its `let-` value; a component gets `dzTooltipInputs`.
 */
@Directive({ selector: '[dzTooltip]', exportAs: 'dzTooltip' })
export class DzTooltip {
  readonly dzTooltip = input<DzTipContent>();
  readonly dzTooltipContext = input<unknown>();
  readonly dzTooltipInputs = input<Readonly<Record<string, unknown>>>();
  readonly dzTooltipPlacement = input<TooltipPlacement>();
  readonly dzTooltipFlip = input<boolean>();
  /** The bubble drawn as this SVG path (`d`, a 100 × 100 box), for an animation that morphs it. */
  readonly dzTooltipShape = input<string>();
  readonly dzTooltipReducedMotion = input<'none' | 'fade'>();
  readonly dzTooltipTone = input<TipTone>();
  readonly dzTooltipAnimation = input<TipAnimation>();
  readonly dzTooltipAnimate = input<TipAnimate>();
  readonly dzTooltipDelay = input<number>();
  readonly dzTooltipDisabled = input<boolean>(false);
  #handle: TooltipHandle | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const el: HTMLElement = inject(ElementRef).nativeElement;
    const ng = { app: inject(ApplicationRef), env: inject(EnvironmentInjector), injector: inject(Injector) };
    const rendered = signal(false);
    afterNextRender(() => rendered.set(true));
    effect(() => {
      if (!rendered()) return;
      const what = this.dzTooltip();
      const o = {
        content: what == null || typeof what === 'string' ? (what ?? '') : ɵdzDraw(what, () => untracked(this.dzTooltipContext), () => untracked(this.dzTooltipInputs), () => this.hide(), ng),
        disabled: this.dzTooltipDisabled() || what == null || what === '',
        ...ɵdefined({ placement: this.dzTooltipPlacement(), flip: this.dzTooltipFlip(), shape: this.dzTooltipShape(), reducedMotion: this.dzTooltipReducedMotion(), tone: this.dzTooltipTone(), animation: this.dzTooltipAnimation(), animate: this.dzTooltipAnimate(), delayMs: this.dzTooltipDelay() }),
      };
      untracked(() => (this.#handle ? this.#handle.update(o) : (this.#handle = tooltip(el, o))));
    });
    // A context or inputs changed while shown: drawn again.
    effect(() => {
      this.dzTooltipContext();
      this.dzTooltipInputs();
      untracked(() => this.#handle?.shown && this.#handle.show());
    });
    inject(DestroyRef).onDestroy(() => this.#handle?.destroy());
  }

  /** Shows it now (as a keyboard focus would). */
  show(): void {
    this.#handle?.show();
  }

  hide(): void {
    this.#handle?.hide();
  }
}

/** Not public API: only the options given (an unset input keeps the DOM layer's default). */
export function ɵdefined<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
}

export type { TipAnimate, TipAnimation, TipTone, TooltipPlacement };
