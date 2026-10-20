import type { Scene } from './index.js';

/**
 * A page change slides the rows' layer 24 px from the side the reading goes to (the next page from
 * the end side: the left right to left), 200 ms, from 0.4 opacity; an unknown page fades only.
 */
export function slide(s: Scene, from: number | undefined, to: number | undefined): void {
  const layer = s.g.el.layer;
  const sign = from === undefined || to === undefined || from === to ? 0 : (to > from ? 1 : -1) * (s.g.dir === 'rtl' ? -1 : 1);
  s.play(layer, () => layer.isConnected, { x: sign * 24, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.2 });
}
