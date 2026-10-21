/**
 * The fixture's harness: `window.fx` for run.mjs. `?lang=ar` Arabic right to left; `?bench=1`
 * synchronous paints (DZG_ENV), for the rebind measure; `?a=1` dataset A alone (a.ts), for
 * scripts/perf-browser.mjs (step 25: `<dz-grid>` first render, 1 000 create/destroy cycles).
 */
import { provideZonelessChangeDetection, type ApplicationRef } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DZG_ENV } from '@dzgrid/angular';
import { AR_MODE, App, stats } from './app';
import { AppA } from './a';

declare global {
  interface Window {
    fx: unknown;
    fxReady: boolean;
    fxError: string;
  }
}

const params = new URLSearchParams(location.search);
const bench = params.get('bench') === '1';
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

if (AR_MODE) {
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
}

/** Dataset A alone: the time from showing `<dz-grid>` (rows in memory) to the second frame, and cycles. */
async function mainA(): Promise<void> {
  const appRef: ApplicationRef = await bootstrapApplication(AppA, { providers: [provideZonelessChangeDetection()] });
  const app = appRef.components[0]!.instance as AppA;
  await frame();
  window.fx = {
    async firstRender() {
      app.rows.set(app.all);
      const t0 = performance.now();
      app.shown.set(true);
      appRef.tick();
      await frame();
      await frame();
      return performance.now() - t0;
    },
    bodyRows: () => document.querySelectorAll('.dzg-layer .dzg-row').length,
    /** `n` times: `<dz-grid>` created on 200 rows, then destroyed, each with its change detection. */
    async cycles(n: number) {
      app.rows.set(app.small);
      for (let i = 0; i < n; i++) {
        app.shown.set(true);
        appRef.tick();
        app.shown.set(false);
        appRef.tick();
      }
      await frame();
      return document.querySelectorAll('.dzg').length;
    },
  };
  window.fxReady = true;
}

async function main(): Promise<void> {
  if (params.get('a') === '1') return mainA();
  const appRef: ApplicationRef = await bootstrapApplication(App, {
    providers: [provideZonelessChangeDetection(), ...(bench ? [{ provide: DZG_ENV, useValue: { sync: true } }] : [])],
  });
  const app = appRef.components[0]!.instance as App;
  await frame();
  await frame();
  const viewport = () => document.querySelector<HTMLElement>('.dzg-viewport')!;
  const live = () => document.querySelectorAll('fx-status, fx-count, fx-head, fx-float, fx-overlay, fx-footer').length;
  /** Scripted scroll jumps of `rows` rows, synchronous paints: script time per jump. */
  const jumps = (n: number, rows: number): number[] => {
    const vp = viewport();
    const h = (document.querySelector('.dzg-row') as HTMLElement).getBoundingClientRect().height;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      vp.scrollTop = ((i + 1) * rows * h) % (4000 * h);
      vp.dispatchEvent(new Event('scroll'));
      out.push(performance.now() - t0);
    }
    return out;
  };
  window.fx = {
    stats,
    live,
    cells: () => document.querySelectorAll('.dzg-layer fx-status').length,
    rowsInWindow: () => document.querySelectorAll('.dzg-layer .dzg-row').length,
    async scroll(n: number) {
      const vp = viewport();
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        vp.scrollTop = Math.floor(rand() * (vp.scrollHeight - vp.clientHeight));
        await frame();
      }
      await frame();
      return { made: stats.made, gone: stats.gone, live: live() };
    },
    async clickStatus() {
      const b = document.querySelector<HTMLButtonElement>('.dzg-layer .fx-st')!;
      const before = stats.actions;
      b.click();
      await frame();
      return { ok: stats.actions === before + 1, sent: stats.lastAction, label: b.textContent?.trim() };
    },
    async toggleRows() {
      app.toggle();
      await frame();
      await frame();
      return { overlay: document.querySelector('.dzg-overlay .fx-ov')?.textContent ?? null };
    },
    async destroyGrid() {
      app.shown.set(false);
      await frame();
      await frame();
      return { made: stats.made, gone: stats.gone, live: live(), grids: document.querySelectorAll('.dzg').length };
    },
    /** Per-rebind cost: jumps with the Angular cells against the same jumps as plain text (S6's slope). */
    async bench(n = 200, rows = 40) {
      jumps(30, rows);
      const on = jumps(n, rows);
      // The status column's components only: the flag template stays (templates are not in [parts]).
      const cells = document.querySelectorAll('.dzg-layer fx-status').length;
      app.parts.set({});
      await frame();
      jumps(30, rows);
      const off = jumps(n, rows);
      const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
      return { onMs: med(on), offMs: med(off), templatedCells: cells, usPerCell: ((med(on) - med(off)) * 1000) / cells };
    },
  };
  window.fxReady = true;
}

main().catch((e) => {
  window.fxError = String((e as Error)?.stack ?? e);
});
