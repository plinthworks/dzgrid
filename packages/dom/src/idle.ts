import type { Scope } from './render/scope.js';

/**
 * Runs `step` in the browser's idle time until it says it is done (D13):
 * `requestIdleCallback` where there is one, slices of about 8 ms otherwise
 * (Safari), paused while `busy()` (the user is scrolling). Stops with the
 * scope; returns a stop of its own.
 */
export function idleLoop(step: () => boolean, scope: Scope, o: { readonly win: Window | null; readonly busy: () => boolean }): () => void {
  let stopped = false;
  const win = o.win;
  const now = () => win?.performance.now() ?? 0;
  const ric = win && 'requestIdleCallback' in win ? win.requestIdleCallback.bind(win) : null;
  let cancelIdle: (() => void) | null = null;
  const later = (fn: () => void, ms: number) => {
    cancelIdle?.();
    cancelIdle = scope.timeout(fn, ms);
  };
  const run = (deadline: () => number): void => {
    if (stopped || scope.isDisposed) return;
    if (o.busy()) return void later(next, 100);
    while (deadline() > 1) if (step()) return void (stopped = true);
    next();
  };
  const next = (): void => {
    if (stopped || scope.isDisposed) return;
    if (ric) {
      const id = ric((d) => run(() => d.timeRemaining()));
      cancelIdle = () => win!.cancelIdleCallback(id);
    } else
      later(() => {
        const end = now() + 8;
        run(() => end - now());
      }, 0);
  };
  next();
  const stop = () => {
    stopped = true;
    cancelIdle?.();
  };
  scope.add(stop);
  return stop;
}
