import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

export type R = { id: string; name: string };
export const grids: GridInstance<R, any>[] = [];
export const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function fake() {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  const rows = (ids: string[]) => ids.map((id) => ({ id, name: id }));
  return { source, calls, answer: (ids: string[], more: object = { total: ids.length }) => calls[calls.length - 1]!.ok({ rows: rows(ids), ...more }) };
}

/** A grid over a fake source (server pages of 2 by default), or over rows when `rows` is given. */
export function make(more: Record<string, unknown> = {}) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fake();
  const columns: ColumnDef<R, any>[] = [{ id: 'name' }];
  const base = more.rows ? {} : { source: sourceRows(f.source), operations: 'server' };
  const g = createGrid<R>(host, {
    ...base, pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN,
    selection: { mode: 'multi', checkbox: true }, onEvent: (e: GridEvent<R>) => events.push(e), ...more,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const headBox = () => host.querySelector<HTMLElement>('.dzg-header [role=checkbox]')!;
  const rowEl = (id: string) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${g.kernel.rows.displayed.indexOf(dataKey(id)!) + 2}"]`)!;
  const click = (el: HTMLElement, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  const live = () => host.querySelector('.dzg-live')!.textContent;
  const checked = () => headBox().getAttribute('aria-checked');
  return { g, host, events, f, headBox, rowEl, click, live, checked };
}
