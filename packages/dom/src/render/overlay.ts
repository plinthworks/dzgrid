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
  return (displayed, top) => {
    // A server's failure covers the rows kept; its loading shows only when there is nothing to keep.
    const phase = g.rows.status.phase;
    const state: OverlayState | null = g.settings.overlay ?? (phase === 'error' ? phase : phase === 'loading' ? (displayed ? null : phase) : g.rows.counts.total === 0 ? 'noRows' : displayed ? null : 'noMatches');
    // Written only when it changes: a repaint that changes nothing touches nothing.
    if (overlay.hidden !== (state === null)) overlay.hidden = state === null;
    setPx(overlay, 'inset-block-start', top);
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
