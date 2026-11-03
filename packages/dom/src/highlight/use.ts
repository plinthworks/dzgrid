import type { GridContext } from '../context.js';

/** What a tint is given at each paint: the quick search's text, or find's text and its hits (row → column → current). */
export type TintArg = string | readonly [string, ReadonlyMap<unknown, ReadonlyMap<string, boolean>>];

/** The chunk, asked once for the page (again after a failed load). */
let chunk: Promise<typeof import('./chunk.js')> | null = null;

/**
 * A grid's tint (search-highlight.md): `find` false for the quick search's, true for find's; called at each paint with
 * what to tint (null: nothing). Nothing where the browser has no CSS Custom Highlight API; the chunk loaded at the
 * first call with something to tint, then a paint.
 */
export function marker(g: GridContext<unknown>, find: boolean): (arg: TintArg | null) => void {
  const w = g.win as unknown as { CSS?: { highlights?: unknown }; Highlight?: unknown } | null;
  if (!w?.CSS?.highlights || !w.Highlight) return () => {};
  /** undefined: not asked; null: loading; then the tint. */
  let p: ((arg: TintArg | null) => void) | null | undefined;
  return (arg) =>
    p
      ? p(arg)
      : void (arg &&
          p === undefined &&
          ((p = null),
          (chunk ??= import('./chunk.js')).then(
            (m) => {
              p = m.tinter(g, find);
              // A grid gone meanwhile paints nothing.
              if (g.el.root.isConnected) g.schedule();
            },
            () => void ((chunk = null), (p = undefined)),
          )));
}
