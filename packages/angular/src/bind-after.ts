import { DestroyRef, PLATFORM_ID, afterNextRender, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Binds a host element to a feature after the first render (never on a server), again when what
 * `read` returns changes, and unbinds on destroy. For the directives' constructors.
 */
export function bindAfterRender<A>(read: () => A, bind: (a: A) => () => void): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const rendered = signal(false);
  let off: (() => void) | undefined;
  afterNextRender(() => rendered.set(true));
  effect(() => {
    if (!rendered()) return;
    const a = read();
    untracked(() => {
      off?.();
      off = bind(a);
    });
  });
  inject(DestroyRef).onDestroy(() => off?.());
}
