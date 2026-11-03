import type { GridContext } from '../context.js';

/**
 * The strip under the rows (Phase 9, status-bar.md; pagination-footer.md « The shared strip »): `div.dzg-footer`, last
 * in the grid's root, outside `role="grid"`, made by the first feature asking, then found by the others (one per grid);
 * `--dzg-footer-size` follows its height so the overlay stops above it. Each feature places its own hosts (the pager's
 * parts, then the status bar's group, then the pager) and takes them away; the last one leaving an empty strip removes it.
 */
export function bottomStrip(g: GridContext<unknown>): HTMLElement {
  const root = g.el.root;
  let s = root.querySelector<HTMLElement>(':scope>.dzg-footer');
  if (!s) {
    const el = (s = g.doc.createElement('div'));
    el.className = 'dzg-footer';
    root.append(el);
    const size = (): void => root.style.setProperty('--dzg-footer-size', `${el.offsetHeight}px`);
    const RO = (g.win as (Window & typeof globalThis) | null)?.ResizeObserver;
    const ro = RO && new RO(size);
    size();
    ro?.observe(el);
    ro && g.scope.observe(ro);
  }
  return s;
}
