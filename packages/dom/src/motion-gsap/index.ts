import { problem, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { gsap } from 'gsap';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type * as Run from './run/index.js';

/** The application's GSAP instance: the one its own hook tweens use. */
export type Gsap = typeof gsap;

/** Each on by default; `false` turns one off (the hooks are still called). */
export interface MotionEffects {
  /** Rows glide to their new place after a sort or a filter. */
  readonly flip?: boolean;
  /** Rows coming into view after a sort or a filter fade in. */
  readonly enter?: boolean;
  /** A value a transaction changed is tinted and marked a moment. */
  readonly flash?: boolean;
  /** The rows slide a little on a page change. */
  readonly page?: boolean;
  /** A popup opening and the overlay appearing fade in (owner Q2). */
  readonly popup?: boolean;
  /** A tree's rows opened or closed: the rows below glide, the children shown fade in (Phase 4 step 6). */
  readonly expand?: boolean;
}

/** What `onCell` is told: the cell's row and column (id), its value and text, the text before. */
export interface CellMotion {
  readonly key: RowKey;
  readonly column: string;
  readonly value: unknown;
  readonly text: string;
  readonly previousText: string;
  readonly row: unknown;
  readonly context: unknown;
  /** The user asked for reduced motion: mark, do not move. */
  readonly reduced: boolean;
}

/** What `onRow` is told: the row, its key and display index. */
export interface RowMotion {
  readonly key: RowKey;
  readonly row: unknown;
  readonly index: number;
  readonly context: unknown;
  readonly reduced: boolean;
}

export interface MotionOptions {
  /** How it feels; `sober` (the only one yet): short, eased, no bounce. */
  readonly preset?: 'sober';
  readonly effects?: MotionEffects;
  /** The application's GSAP; else the chunk imports the package itself. */
  readonly gsap?: Gsap;
  /**
   * A cell whose value a transaction changed, after the grid's guards (at most 50 calls a paint).
   * Animate `el` only (transform, opacity, `--dzg-*`, classes). `false`: handled, the built-in flash
   * is skipped. Either way `el` is followed: its tweens are finished when it shows another row. Reasons `saving`, `saved`, `failed` are reserved (Phase 4).
   */
  readonly onCell?: (el: HTMLElement, c: CellMotion, reason: 'changed') => void | false;
  /** A row that moved or entered after a sort, a filter or a tree's toggle, or that was added live (owner Q5; not under reduced motion). */
  readonly onRow?: (el: HTMLElement, c: RowMotion, reason: 'entered' | 'moved') => void | false;
}

export interface Motion extends GridFeature {
  /** Loads the motion code and GSAP now (else at idle after the first rows); false without GSAP. */
  load(): Promise<boolean>;
  readonly loaded: boolean;
}

/**
 * `motion()`: rows gliding after a sort or a filter, a value flash on live changes, a page slide,
 * popups and the overlay fading in (docs/behaviors/motion.md, step 26). This part is small; the
 * tweens and GSAP are a chunk loaded in idle time once the first rows are painted (owner Q1). One
 * `motion()` may serve several grids.
 *
 * ```ts
 * import { motion } from '@dzgrid/dom/motion-gsap';
 * createGrid(host, { features: [motion()], … });
 * ```
 */
export function motion(o: MotionOptions = {}): Motion {
  let engine: Run.Engine | null = null;
  let chunk: Promise<Run.Engine | null> | null = null;
  let missing = false;
  const grids = new Map<GridContext<unknown>, { h: FeatureHandle | null }>();
  // GSAP missing: the grid works without motion, told once.
  const tell = (g: GridContext<unknown>): void => emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'error', 'features.motion', 'gsap')] });
  const load = (): Promise<Run.Engine | null> => {
    const p = (chunk ??= import('./run/index.js').then((m) => m.start(o)));
    return p.then(
      (e) => {
        if (!e && !missing) (missing = true), grids.forEach((_, g) => tell(g));
        for (const [g, s] of grids) if (e && !s.h) s.h = e.attach(g);
        return (engine = e);
      },
      (err) => {
        // A chunk that failed to load is asked again next time.
        if (chunk === p) chunk = null;
        grids.forEach((_, g) => g.report(err));
        return null;
      },
    );
  };
  return {
    id: 'motion',
    get loaded() {
      return !!engine;
    },
    load: () => load().then((e) => !!e),
    setup(g) {
      const s: { h: FeatureHandle | null } = { h: engine?.attach(g) ?? null };
      grids.set(g, s);
      if (missing) tell(g);
      let asked = false;
      return {
        beforeRows: () => s.h?.beforeRows?.(),
        afterRows(f) {
          if (s.h) return s.h.afterRows?.(f);
          // Once rows are on screen, in idle time: never in the first paint's way.
          if (asked || !f.displayed.count || g.settings.motion === false) return;
          asked = true;
          const w = g.win as (Window & { requestIdleCallback?: (fn: () => void, o: object) => number }) | null;
          // Turned off meanwhile: not loaded, asked again at a paint once on.
          const go = (): void => void (g.scope.isDisposed || (g.settings.motion === false ? (asked = false) : load()));
          if (w?.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 });
          else g.scope.timeout(go, 50);
        },
        destroy() {
          grids.delete(g);
          s.h?.destroy();
          s.h = null;
        },
      };
    },
  };
}
