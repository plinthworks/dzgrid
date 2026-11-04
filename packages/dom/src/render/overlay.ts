import type { GridContext } from '../context.js';
import { setPx } from './rows.js';

/** What the overlay says: the host's state or a server's, then what the counts say. */
export type OverlayState = 'loading' | 'error' | 'noRows' | 'noMatches';

/**
 * The overlay (docs/behaviors/overlays.md): the host's state first (loading, error), then what
 * the counts say. Outside `role="grid"` (S4). Its message, and under an error the retry button
 * (made the first time one shows); or what the overlay part draws (`@dzgrid/dom/slots`).
 */
export function overlayPainter<T>(g: GridContext<T>): (displayed: number, top: number) => void {
  const { overlay } = g.el;
  const text = g.doc.createTextNode('');
  let retry: HTMLButtonElement | null = null;
  // The busy bar (overlays.md « Busy bar »): made when it first shows, unless a busy part draws it (`@dzgrid/dom/slots`);
  // `on` shown, `wait` the 200 ms before, `held` the 400 ms after.
  let mq: MediaQueryList | null | undefined, bar: HTMLElement | null = null, mark: HTMLElement | null = null, wait: (() => void) | null = null, held = false, on = false, at = 0;
  // Outside `role="grid"`, decorative (the grid's `aria-busy` says it), after the viewport.
  const make = (c: string, css = ''): HTMLElement => {
    const el = g.doc.createElement('div');
    el.className = c;
    el.style.cssText = css;
    el.setAttribute('aria-hidden', 'true');
    g.el.viewport.after(el);
    return el;
  };
  // Reduced motion for a busy part: followed live once asked; a page that cannot tell reads « reduce ».
  const still = (): boolean => {
    if (mq === undefined && (mq = g.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null)) g.scope.on(mq, 'change', () => g.schedule());
    return g.settings.motion === false || !mq || mq.matches;
  };
  const draw = (): void => {
    // The part's host: placed here, not by the layout CSS (its block size is the part's).
    const own = !!g.slots?.busy?.(on, () => (mark ??= make('dzg-busy-part', 'position:absolute;inset-inline:0;z-index:3;pointer-events:none')), still);
    if (on && !own) bar ??= make('dzg-busy');
    // Hidden inline too: an app's `display` on the class would beat [hidden] (owner's example, 2026-11-04).
    for (const [el, show] of [[bar, !own], [mark, own]] as const) if (el) (el.hidden = !on || !show), (el.style.display = el.hidden ? 'none' : ''), setPx(el, 'inset-block-start', at);
  };
  const paintBar = (want: boolean, cover: boolean): void => {
    if (want)
      wait ??= on ? null : g.scope.timeout(() => {
        wait = null;
        held = on = true;
        draw();
        g.scope.timeout(() => ((held = false), g.schedule()), 400);
      }, 200);
    else {
      wait?.();
      wait = null;
      if (!held || cover) on = false;
    }
    draw();
  };
  return (displayed, top) => {
    // A server's failure covers the rows kept; its loading shows only when there is nothing to keep.
    const phase = g.rows.status.phase;
    const state: OverlayState | null = g.settings.overlay ?? (phase === 'error' ? phase : phase === 'loading' ? (displayed ? null : phase) : g.rows.counts.total === 0 ? 'noRows' : displayed ? null : 'noMatches');
    // Written only when it changes: a repaint that changes nothing touches nothing.
    if (overlay.hidden !== (state === null)) overlay.hidden = state === null;
    setPx(overlay, 'inset-block-start', top);
    at = top;
    // Rows reloaded and kept: a server's request, or the host's `busy`; never with the loading overlay.
    paintBar((!!g.settings.busy || phase === 'loading') && state !== 'loading', state === 'loading');
    if (g.slots?.overlay(state)) return;
    if (state === null) {
      if (overlay.firstChild) overlay.replaceChildren();
      return;
    }
    const words = g.msg(state === 'loading' ? 'grid.loading' : state === 'error' ? 'grid.error' : state === 'noRows' ? 'grid.noRows' : 'grid.noMatches');
    if (text.data !== words) text.data = words;
    let button: HTMLButtonElement | null = null;
    if (state === 'error') {
      // Every server grid needs it (O3): asks again, the focus back on the grid, the loading said.
      if (!retry) {
        retry = g.doc.createElement('button');
        retry.type = 'button';
        g.scope.on(retry, 'click', () => {
          g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
          g.restoreFocus();
          g.live.announce(g.msg('announce.loading'));
        });
      }
      button = retry;
      const label = g.msg('grid.retry');
      if (button.textContent !== label) button.textContent = label;
    }
    if (overlay.firstChild !== text || overlay.lastChild !== (button ?? text)) overlay.replaceChildren(text, ...(button ? [button] : []));
  };
}
