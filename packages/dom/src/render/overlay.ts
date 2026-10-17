import type { GridContext } from '../context.js';
import { setPx } from './rows.js';

/** The overlay: the host's state first (loading, error), then what the counts say. Outside `role="grid"` (S4). */
export function paintOverlay<T>(g: GridContext<T>, displayed: number, top: number): void {
  const { overlay } = g.el;
  const state = g.settings.overlay ?? (g.rows.counts.total === 0 ? 'noRows' : displayed === 0 ? 'noMatches' : null);
  overlay.hidden = state === null;
  if (state === null) {
    if (overlay.textContent) overlay.textContent = '';
    return;
  }
  const text = g.msg(state === 'loading' ? 'grid.loading' : state === 'error' ? 'grid.error' : state === 'noRows' ? 'grid.noRows' : 'grid.noMatches');
  if (overlay.textContent !== text) overlay.textContent = text;
  setPx(overlay, 'inset-block-start', top);
}
