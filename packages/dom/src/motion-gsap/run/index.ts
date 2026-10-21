import type { RowKey } from '@dzgrid/core';
import type { GridContext } from '../../context.js';
import type { FeatureHandle } from '../../features.js';
import type { Frame } from '../../render/rows.js';
import type { Gsap, MotionEffects, MotionOptions } from '../index.js';
import { flash, type Texts } from './flash.js';
import { flip } from './flip.js';
import { guard, type Guard } from './guard.js';
import { opening } from './open.js';
import { slide } from './page.js';
import { reducedMotion } from './reduced.js';

/** The chunk's side of `motion()`: one per `motion()`, any number of grids. */
export interface Engine {
  attach(g: GridContext<unknown>): FeatureHandle;
}

/** What an effect needs of its grid at one paint. */
export interface Scene {
  readonly gsap: Gsap;
  readonly g: GridContext<unknown>;
  readonly guard: Guard;
  readonly o: MotionOptions;
  readonly reduced: boolean;
  readonly now: number;
  on(k: keyof MotionEffects): boolean;
  /** The 500 ms cap of the flash, per cell (row key, then column): when each was last marked. */
  readonly marked: Map<RowKey, Map<string, number>>;
  /**
   * A host hook, fenced and counted (at most 50 calls a paint); its answer, undefined when it threw.
   * Its element is followed by the guard first (while `valid()`), whatever it answers: its own tweens
   * are finished when the element shows another row.
   */
  hook<A extends [HTMLElement, ...unknown[]]>(fn: ((...a: A) => void | false) | undefined, valid: () => boolean, ...a: A): void | false;
  /** Tweens an element from `from` to `to` (immediate render, GSAP's own ticker), followed by the guard. */
  play(el: HTMLElement, valid: () => boolean, from: object, to: object): void;
  /** The y each row is drawn at by its running glide (none: 0), by row key, before the paint. */
  readonly ys: ReadonlyMap<RowKey, number>;
}

/** Loads GSAP (the application's, or `import('gsap')`): null when it is not installed. */
export async function start(o: MotionOptions): Promise<Engine | null> {
  let gsap = o.gsap;
  if (!gsap) {
    try {
      const m = (await import('gsap')) as { gsap?: Gsap; default?: Gsap };
      gsap = m.gsap ?? m.default;
    } catch {
      return null;
    }
  }
  return gsap ? engine(gsap, o) : null;
}

const FLIP = 1;
const FLASH = 2;
const PAGE = 4;
const EXPAND = 8;

function engine(gsap: Gsap, o: MotionOptions): Engine {
  const attached = new Set<Guard>();
  // A change of the setting finishes what runs, in every grid.
  const reduced = reducedMotion(gsap, () => attached.forEach((a) => a.finishAll()));
  const on = (k: keyof MotionEffects): boolean => o.effects?.[k] !== false;
  // Each element's last glide (its start y, its tween): the y it is drawn at, computed, never read
  // back with gsap.getProperty (that read writes `translate`, `rotate`, `scale: none` inline).
  const glides = new WeakMap<HTMLElement, [number, ReturnType<Gsap['fromTo']>]>();
  const ease = gsap.parseEase('power2.out');
  return {
    attach(g) {
      const guarded = guard(gsap);
      attached.add(guarded);
      const live = (): boolean => g.settings.motion !== false;
      let armed = 0;
      let armedAt = 0;
      let lastAt = -1e9;
      let lastShown: unknown = g.rows.displayed;
      const page = (): number | undefined => g.rows.page?.index;
      // The page shown at the last paint (the model holds the next one by the time it paints).
      let shownPage = page();
      // Rows a transaction changed (updated) or brought (added), until the paint.
      const changed = new Set<RowKey>();
      const added = new Set<RowKey>();
      const marked = new Map<RowKey, Map<string, number>>();
      // The directions of the toggles until the paint: 1 opened, 2 closed (3 both).
      let dirs = 0;
      let snap: { tops: Map<RowKey, number>; ys: Map<RowKey, number>; texts: Texts; layer: string; page: number | undefined } | null = null;
      const unsubscribe = g.rows.subscribe((c) => {
        const t = c.transaction;
        const kind = c.kind === 'order' || c.kind === 'query' ? FLIP : c.kind === 'expand' ? EXPAND : c.kind === 'page' ? PAGE : t?.kind === 'delta' ? FLASH : 0;
        if (!kind) return;
        if (t) for (const k of t.updated) changed.add(k);
        if (t) for (const k of t.added) added.add(k), changed.add(k);
        armed |= kind;
        armedAt = g.now();
      });
      // The direction told by the expansion change itself, never by the counts (a transaction may land too).
      const unlisten = g.kernel.subscribe((e) => void (e.type === 'rowExpanded' && (dirs |= e.expanded ? 1 : 2)));
      const scene = (now: number, ys: ReadonlyMap<RowKey, number> = new Map()): Scene => {
        let calls = 0;
        return {
          gsap, g, guard: guarded, o, now, on, marked, ys, reduced: reduced(),
          hook(fn, valid, ...a) {
            if (!fn || calls >= 50) return;
            calls++;
            guarded.track(a[0], valid);
            try {
              return fn(...a);
            } catch (err) {
              g.report(err);
            }
          },
          play(el, valid, from, to) {
            guarded.track(el, valid);
            const t = gsap.fromTo(el, from, { ...to, ease: 'power2.out', force3D: false, overwrite: 'auto', immediateRender: true, onComplete: () => guarded.release(el) });
            if ('y' in from) glides.set(el, [(from as { y: number }).y, t]);
          },
        };
      };
      const stopOpen = opening(g, guarded, () => (live() && !reduced() && on('popup') ? scene(g.now()) : null));
      return {
        // Reads only when armed by a change of the rows, never on a scroll's paint: offsets the grid
        // wrote (no layout read), the cells' texts of the rows changed, the page.
        beforeRows() {
          if (!armed || !live() || g.rows.displayed === lastShown) return void ((armed = dirs = 0), changed.clear(), added.clear());
          snap = { tops: new Map(), ys: new Map(), texts: new Map(), layer: g.el.layer.style.getPropertyValue('inset-block-start'), page: shownPage };
          for (const [k, v] of g.rowRenderer.mounted) {
            const r = glides.get(v.el);
            const p = r?.[1].progress() ?? 1;
            if (armed & (FLIP | EXPAND)) snap.tops.set(k, v.top), p < 1 && snap.ys.set(k, r![0] * (1 - ease(p)));
            if (armed & FLASH && changed.has(k)) snap.texts.set(k, new Map([...v.cells].map(([c, cell]) => [c, cell.el.textContent ?? ''])));
          }
        },
        afterRows(f: Frame<unknown>) {
          lastShown = f.displayed;
          shownPage = page();
          guarded.sweep();
          const s = snap;
          const kinds = armed;
          const how = dirs % 3 || 3;
          snap = null;
          armed = dirs = 0;
          if (!live()) return guarded.finishAll();
          if (!s) return;
          const now = g.now();
          const sc = scene(now, s.ys);
          let flipped = false;
          // A scroll between the change and the paint (the layer moved: an anchor too): no glide.
          const still = g.scrolledAt <= armedAt && s.layer === g.el.layer.style.getPropertyValue('inset-block-start') && !sc.reduced;
          if (kinds & FLIP) {
            // Typing: paints under 150 ms apart.
            const quiet = now - lastAt >= 150 && still;
            lastAt = now;
            if (quiet) flip(sc, f, s.tops), (flipped = true);
            // A toggle and a sort in one paint: the sort's glide alone, under its `flip` switch.
          } else if (kinds & EXPAND && still) flip(sc, f, s.tops, how), (flipped = true);
          // The rows a glide brought in (added ones too) faded there, not again.
          if (kinds & FLASH && now - g.scrolledAt >= 150) flash(sc, f, s.texts, changed, added, !flipped);
          if (kinds & PAGE && !sc.reduced && on('page')) slide(sc, s.page, shownPage);
          changed.clear();
          added.clear();
        },
        destroy() {
          unsubscribe();
          unlisten();
          stopOpen();
          guarded.finishAll();
          attached.delete(guarded);
          // The last grid gone: the media watch too (made again by the next one).
          if (!attached.size) reduced.revert();
        },
      };
    },
  };
}
