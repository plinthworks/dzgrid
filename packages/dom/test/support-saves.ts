// Shared by the Phase 5 step 7 tests (docs/phase-5-steps/step07-plan.md, « Tests first »): a save the test answers
// by hand, the grid's polite and assertive sentences, a cell's mark tokens and description, a client or a paged
// server grid with `edit()` and `editors()`.
import { vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { sourceRows, type DataRequest, type DataResponse, type DataSource } from '@dzgrid/core/server';
import { ed, type EdMake } from './support-editors.js';
import { k, type R } from './support-edit.js';

export interface Held { readonly req: SaveRequest<R>; readonly signal: { readonly aborted: boolean }; ok(): void; no(err: unknown): void }

/** A save whose requests wait for the test: `held[i].ok()` or `.no(err)`. */
export function holding() {
  const held: Held[] = [];
  const save = (req: SaveRequest<R>, signal: { aborted: boolean }) => new Promise<void>((ok, no) => void held.push({ req, signal, ok: () => ok(), no }));
  /** The values each request carried, in order: `key/column=value`. */
  const sent = () => held.map((h) => h.req.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}/${c.column}=${String(c.value)}`).join(','));
  return { held, save, sent };
}

export const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** What a test reads of a grid made by `ed()`: tokens, description, the sentences. */
export function readers(t: ReturnType<typeof ed>) {
  const cls = (id: string, col = 'n') => [...(t.cell(id, col)?.classList ?? [])].filter((c) => c.startsWith('dzg-cell--')).map((c) => c.slice(10)).sort().join(' ');
  const descOf = (id: string, col = 'n') => (t.cell(id, col)?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)?.textContent ?? `#${x}`).join('|');
  const ids = (id: string, col = 'n') => (t.cell(id, col)?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  const announce = vi.spyOn(t.ctx.live, 'announce');
  const polite = () => announce.mock.calls.map((c) => String(c[0]));
  const loud = () => t.alert.mock.calls.map((c) => String(c[0]));
  return { cls, descOf, ids, announce, polite, loud };
}

/** A grid with a held save: everything a step-7 test needs. */
export function saving(o: Omit<EdMake, 'save'> = {}) {
  const h = holding();
  const t = ed({ ...o, save: h.save });
  return { ...t, ...h, ...readers(t) };
}

/** Opens `id/col` by F2, types `text`, keeps it by Enter. */
export function keep(t: ReturnType<typeof ed>, id: string, col: string, text: string): void {
  t.at(id, col);
  t.key('F2');
  t.type(text);
  t.key('Enter');
}

/** A paged server source the test answers by hand: each request held, answered with `pageOf(req)` or failed. */
export function server(all: () => R[], size = 20) {
  const calls: { req: DataRequest; ok(v?: DataResponse<R>): void; no(e: unknown): void }[] = [];
  const pageOf = (req: DataRequest): DataResponse<R> => {
    let rows = all();
    const s = req.sort?.[0];
    if (s) rows = [...rows].sort((a, b) => ((a as never)[s.column] < (b as never)[s.column] ? -1 : (a as never)[s.column] > (b as never)[s.column] ? 1 : 0) * (s.dir === 'desc' ? -1 : 1));
    const p = req.page ?? { offset: 0, size: rows.length };
    // New objects each answer, as JSON off the wire would be.
    return { rows: rows.slice(p.offset, p.offset + p.size).map((r) => ({ ...r })), total: rows.length };
  };
  const source: DataSource<R> = {
    fetch: (req) => new Promise<DataResponse<R>>((ok, no) => void calls.push({ req, ok: (v) => ok(v ?? pageOf(req)), no })),
  };
  const settings = { rows: undefined as never, source: sourceRows(source), operations: 'server' as const, pagination: { pageSize: size } };
  return { calls, source, settings, pageOf };
}

export { k };
export type { ColumnDef, R };
