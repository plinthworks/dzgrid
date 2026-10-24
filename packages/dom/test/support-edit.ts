// Shared fixtures for the DOM seams of editing (Phase 5 step 4, docs/phase-5-steps/step04-plan.md).
import { vi } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridMessages } from '../src/messages.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

export type R = { id: string; name: string; n: number; s: string; q: number };

export const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: `s${i % 7}`, q: (i * 37) % 101 }));

export const COLUMNS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 80 },
  { id: 's', header: 'S', width: 80 },
  { id: 'q', header: 'Q', type: 'number', width: 80 },
];

export const k = (id: string): RowKey => dataKey(id)!;
export const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^d:\d+:/, ''));
export const join = (...b: { locale: string; text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
export const BASE = { en: EN, fr: FR, ar: AR } as const;

export const grids: GridInstance<R, any>[] = [];
export function cleanup(): void {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
}

export interface EMake {
  readonly rows?: R[];
  readonly columns?: ColumnDef<R, any>[];
  readonly settings?: Partial<GridSettings<R>>;
  readonly block?: number;
  readonly host?: HTMLElement;
  /** Frames of the test's own (paints wait for them) instead of synchronous paints. */
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

/** A grid with synchronous paints and a fake geometry; `cell(id, col)` finds a mounted cell by its row id. */
export function emake(o: EMake = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = o.host ?? document.body.appendChild(document.createElement('div'));
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, {
    rows: o.rows ?? rowsOf(200), getRowId: (r) => r.id, columns: o.columns ?? COLUMNS, messages: EN, onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, ...(o.raf ? { raf: o.raf } : { sync: true }) });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const row = (id: string) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === k(id)) ?? null;
  const cell = (id: string, col = 'name') => row(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const active = () => document.activeElement as HTMLElement;
  const press = (key: string, mods: KeyboardEventInit = {}, at: Element = active()) => at.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  return { g, ctx, host, vp, box, events, row, cell, scroll, active, press };
}
