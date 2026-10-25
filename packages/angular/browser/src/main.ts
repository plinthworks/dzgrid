/**
 * The fixture's harness: `window.fx` for run.mjs. `?lang=ar` Arabic right to left; `?bench=1`
 * synchronous paints (DZG_ENV), for the rebind measure; `?a=1` dataset A alone (a.ts), for
 * scripts/perf-browser.mjs (step 25: `<dz-grid>` first render, 1 000 create/destroy cycles).
 */
import { provideZonelessChangeDetection, type ApplicationRef } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DZG_ENV } from '@dzgrid/angular';
import { dataKey } from '@dzgrid/core';
import { AR_MODE, App, stats } from './app';
import { AppA } from './a';
import { DetailApp, TreeApp, treeStats } from './tree';
import { EditApp, editStats } from './edit';

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

/** `?page=tree` and `?page=detail` (Phase 4 step 11). */
async function mainTree(page: string): Promise<void> {
  const appRef: ApplicationRef = await bootstrapApplication(page === 'tree' ? TreeApp : DetailApp, { providers: [provideZonelessChangeDetection()] });
  const app = appRef.components[0]!.instance as TreeApp | DetailApp;
  await frame();
  await frame();
  const outer = () => document.querySelector<HTMLElement>('dzg-fixture .host > dz-grid > .dzg')!;
  const viewport = () => outer().querySelector<HTMLElement>(':scope > .dzg-viewport')!;
  const settle = async () => (await frame(), await frame());
  window.fx = {
    treeStats,
    state: () => ({
      dir: outer()?.getAttribute('dir'),
      role: viewport()?.getAttribute('role'),
      open: document.querySelector('.fx-open')?.textContent,
      roots: document.querySelectorAll('.dzg').length,
      cells: document.querySelectorAll('.dzg-layer fx-tcell').length,
      stickyRows: document.querySelectorAll('.dzg-sticky > .dzg-row').length,
      stickyParts: document.querySelectorAll('.dzg-sticky fx-tcell').length,
      panels: document.querySelectorAll('fx-visits').length,
    }),
    async toggleFirst() {
      outer().querySelector<HTMLElement>('.dzg-layer .dzg-row[aria-rowindex="2"] .dzg-toggle')!.click();
      appRef.tick();
      await settle();
      return document.querySelector('.fx-open')?.textContent;
    },
    async scrollTo(top: number) {
      viewport().scrollTop = top;
      await settle();
    },
    async scroll(n: number) {
      const vp = viewport();
      let seed = 11;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) {
        vp.scrollTop = Math.floor(rand() * (vp.scrollHeight - vp.clientHeight));
        await frame();
      }
      vp.scrollTop = 0;
      await settle();
      return { ...treeStats, live: document.querySelectorAll('fx-tcell').length, panelsLive: document.querySelectorAll('fx-visits').length, roots: document.querySelectorAll('.dzg').length };
    },
    async openAll(n: number) {
      app.open.set(new Set(Array.from({ length: n }, (_, i) => dataKey(page === 'tree' ? `s${i}` : `m${i}`)!)));
      appRef.tick();
      await settle();
      return document.querySelectorAll('fx-visits').length;
    },
    async destroyGrid() {
      app.shown.set(false);
      appRef.tick();
      await settle();
      return { ...treeStats, live: document.querySelectorAll('fx-tcell, fx-visits').length, roots: document.querySelectorAll('.dzg').length };
    },
  };
  window.fxReady = true;
}

/** `?page=edit` (Phase 5 step 9): the theme's edit.css and the skin (fr light Clinic, ar dark Midnight) first. */
async function mainEdit(): Promise<void> {
  document.documentElement.dataset['theme'] = AR_MODE ? 'dark' : 'light';
  await Promise.all(['edit.css', AR_MODE ? 'midnight.css' : 'clinic.css'].map((href) => new Promise((r) => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `./${href}`, onload: r, onerror: r });
    document.head.append(l);
  })));
  const appRef: ApplicationRef = await bootstrapApplication(EditApp, { providers: [provideZonelessChangeDetection()] });
  const app = appRef.components[0]!.instance as EditApp;
  await frame();
  await frame();
  const settle = async () => (await frame(), await frame());
  const grid = () => document.querySelector<HTMLElement>('dzg-fixture .host .dzg')!;
  const cell = (id: string, col: string) => grid()?.querySelector<HTMLElement>(`.dzg-layer .dzg-row[aria-rowindex="${Number(id.slice(1)) + 2}"] .dzg-cell[data-col="${col}"]`) ?? null;
  const key = (k: string, on: Element = document.activeElement!) => on.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  window.fx = {
    editStats,
    cellSel: (id: string, col: string) => `.dzg-layer .dzg-row[aria-rowindex="${Number(id.slice(1)) + 2}"] .dzg-cell[data-col="${col}"]`,
    hold: (on: boolean) => void (app.hold = on),
    answer: async () => {
      for (const a of editStats.held.splice(0)) a();
      await settle();
    },
    state: () => {
      const ed = grid()?.querySelector<HTMLElement>('.dzg-editor');
      const a = document.activeElement as HTMLElement | null;
      const f = a?.closest('.dzg-cell');
      return {
        dir: grid()?.getAttribute('dir'),
        editor: ed ? { owner: ed.getAttribute('data-dzg-owner'), note: !!ed.querySelector('.fx-note'), shelf: !!ed.querySelector('.fx-shelf') } : null,
        field: !!grid()?.querySelector('.dzg-field'),
        active: a?.className ?? null,
        focus: f ? `${f.closest('.dzg-row')?.getAttribute('aria-rowindex')}/${f.getAttribute('data-col')}` : null,
        log: document.querySelector('.fx-log')?.textContent?.trim(),
        live: document.querySelectorAll('fx-shelf-editor, fx-note-life').length,
      };
    },
    text: (id: string, col: string) => cell(id, col)?.textContent ?? null,
    cls: (id: string, col: string) => cell(id, col)?.className ?? '',
    /** `n` opens and closes on the template and component columns, with scrolls between. */
    async churn(n: number) {
      const vp = grid().querySelector<HTMLElement>(':scope > .dzg-viewport')!;
      for (let i = 0; i < n; i++) {
        vp.scrollTop = 0;
        await settle();
        const c = cell(`s${i % 8}`, i % 2 ? 'note' : 'shelf');
        if (!c) throw new Error(`churn ${i}: no cell s${i % 8} in view`);
        app.ctl!.focusCell(dataKey(`s${i % 8}`)!, i % 2 ? 'note' : 'shelf');
        c.focus();
        key('F2');
        key('Escape');
        if (i % 10 === 0) {
          vp.scrollTop = 300 + i * 5;
          await frame();
        }
      }
      vp.scrollTop = 0;
      await settle();
      return { made: editStats.made, gone: editStats.gone, live: document.querySelectorAll('fx-shelf-editor, fx-note-life').length };
    },
    async destroyGrid() {
      app.shown.set(false);
      await settle();
      return { made: editStats.made, gone: editStats.gone, live: document.querySelectorAll('fx-shelf-editor, fx-note-life').length, grids: document.querySelectorAll('.dzg').length };
    },
  };
  window.fxReady = true;
}

async function main(): Promise<void> {
  if (params.get('a') === '1') return mainA();
  const page = params.get('page');
  if (page === 'edit') return mainEdit();
  if (page === 'tree' || page === 'detail') return mainTree(page);
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
