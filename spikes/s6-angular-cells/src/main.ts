/**
 * S6 harness. The page is a production AOT build; run.mjs drives it through
 * `window.s6`. One variant per page load, chosen by `?v=<variant>&t=<templated columns>`.
 */
import { isDevMode, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App, S6Grid } from './app';
import { VISIBLE_ROWS, ROW_COUNT, stats } from './shared';
import type { MiniGrid } from './grid';

const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

async function main() {
  const appRef = await bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] });
  const params = new URLSearchParams(location.search);
  const variant = params.get('v') ?? 'text';
  const usesTick = variant === 'view-signal';

  // Count and time every global change-detection pass. The zoneless scheduler
  // calls `_tick()`; the public `tick()` goes through it too.
  const ref = appRef as unknown as { _tick: () => void };
  const original = ref._tick.bind(appRef);
  let waiters: (() => void)[] = [];
  let lastTickMs = 0;
  /** Where the frame loop wants tick time attributed. */
  let onTick: ((ms: number) => void) | null = null;
  ref._tick = () => {
    const t0 = performance.now();
    original();
    lastTickMs = performance.now() - t0;
    stats.ticks++;
    stats.tickMs += lastTickMs;
    onTick?.(lastTickMs);
    const w = waiters;
    waiters = [];
    for (const f of w) f();
  };
  const waitTick = () =>
    new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no tick scheduled')), 1000);
      waiters.push(() => {
        clearTimeout(timer);
        resolve(lastTickMs);
      });
    });

  // Let bootstrap's own passes settle before anything is measured.
  await nextFrame();
  await nextFrame();
  const wrapper = S6Grid.current!;
  let grid: MiniGrid | null = null;
  let top = 0;

  const forceLayout = () => document.body.getBoundingClientRect().height + (grid?.viewport.scrollHeight ?? 0);
  const snapshot = () => ({ ...stats });
  const diff = (a: typeof stats, b: typeof stats) => ({
    checks: b.checks - a.checks,
    detectChanges: b.detectChanges - a.detectChanges,
    ticks: b.ticks - a.ticks,
    viewsCreated: b.viewsCreated - a.viewsCreated,
    viewsDestroyed: b.viewsDestroyed - a.viewsDestroyed,
    tickMs: b.tickMs - a.tickMs,
  });

  (window as any).s6 = {
    devMode: isDevMode(),
    variant,
    /** Builds the grid and draws the first 40 rows. */
    async mount() {
      const before = snapshot();
      const t0 = performance.now();
      const p = usesTick ? waitTick() : null;
      grid = wrapper.mount();
      const script = performance.now() - t0;
      const tick = p ? await p : 0;
      const t1 = performance.now();
      forceLayout();
      const layout = performance.now() - t1;
      await nextFrame();
      await nextFrame();
      return {
        scriptMs: script + tick,
        layoutMs: layout,
        cells: document.querySelectorAll('.cell').length,
        hostNodes: document.querySelectorAll('s6-badge, s6-action').length,
        counts: diff(before, snapshot()),
      };
    },
    /** `n` jumps of `rows` rows (40 = every row recycled), one per frame; script and forced-layout times per jump. */
    async steps(rows: number, n: number) {
      const script: number[] = [];
      const layout: number[] = [];
      const before = snapshot();
      for (let i = 0; i < n; i++) {
        top = (top + rows) % (ROW_COUNT - VISIBLE_ROWS);
        const p = usesTick ? waitTick() : null;
        const t0 = performance.now();
        const rebound = grid!.scrollTo(top);
        const s = performance.now() - t0;
        const tick = p ? await p : 0;
        const t1 = performance.now();
        forceLayout();
        layout.push(performance.now() - t1);
        script.push(s + tick);
        if (rebound !== Math.min(rows, VISIBLE_ROWS)) throw new Error(`rebound ${rebound}`);
        await nextFrame();
      }
      return { script, layout, counts: diff(before, snapshot()) };
    },
    /**
     * A scripted scroll: `frames` animation frames, `rows` rows further each
     * frame. Records rAF-to-rAF intervals and the work done per frame
     * (scrollTo + any tick it caused).
     */
    async scroll(rows: number, frames: number) {
      const work: number[] = [];
      const intervals: number[] = [];
      const before = snapshot();
      let last = 0;
      onTick = (ms) => {
        if (work.length) work[work.length - 1]! += ms;
      };
      await new Promise<void>((done) => {
        const frame = (ts: number) => {
          if (last) intervals.push(ts - last);
          last = ts;
          if (work.length === frames) return done();
          top = (top + rows) % (ROW_COUNT - VISIBLE_ROWS);
          const t0 = performance.now();
          grid!.scrollTo(top);
          work.push(performance.now() - t0);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      onTick = null;
      return { work, intervals, counts: diff(before, snapshot()) };
    },
    /** Clicks the first visible button; true if the host's handler saw that row. */
    async click() {
      const b = document.querySelector<HTMLButtonElement>('.act');
      if (!b) return { ok: false, reason: 'no button' };
      const before = stats.actions;
      b.click();
      await nextFrame();
      await nextFrame();
      // hot: the host signal the template reads reached the view without a re-bind.
      return { ok: stats.actions === before + 1, row: stats.lastAction, label: b.textContent, hot: b.classList.contains('hot') };
    },
    stats,
  };
  (window as any).s6ready = true;
}

main().catch((e) => {
  (window as any).s6error = String(e?.stack ?? e);
});
