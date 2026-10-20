import type { ChangeSource, LocaleCtx } from '@dzgrid/core';
import type { CsvOptions, CsvScope, ExportRequest } from '@dzgrid/core/csv';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { ExportMessageKey } from '../messages.js';
import type * as Chunk from './run/index.js';

/** What an export ended with; `busy`: another one was running (nothing sent). */
export type ExportOutcome = 'done' | 'refused' | 'failed' | 'cancelled' | 'busy';
/** `canExport`'s answer: only `true` allows (owner Q1, fail closed). */
export type Refusal = boolean | { readonly ok: false; readonly reason?: string };
export interface ExportAllContext {
  /** Aborted when the user cancels or the grid goes. */
  readonly signal: AbortSignal;
  /** Rows done so far, and the total when known: handed to `onProgress` (`waiting`). */
  progress(done: number, total?: number): void;
}
/** A file to download (`url`: http, https or blob; `blob`), or nothing: the host did it. */
export type ExportAllResult = { readonly url: string; readonly fileName?: string } | { readonly blob: Blob; readonly fileName?: string } | void;
export interface ExportProgress {
  readonly phase: 'preparing' | 'building' | 'waiting' | 'saving';
  readonly rows: number;
  readonly total: number | null;
}

/** `csvExport()`'s options: how the file is written (step 10's), and the export's own. */
export interface CsvExportOptions extends Omit<CsvOptions, 'chunkRows'> {
  /**
   * Required (owner Q1): `true` allows every export, explicitly; a function gets the request (data
   * only) and allows with `true`. `false`, `{ ok: false, reason }`, a throw or a rejection refuses.
   * It is the user's comfort, not security: the server checks again.
   */
  readonly canExport: true | ((r: ExportRequest) => Refusal | Promise<Refusal>);
  /** Server pages' `all` and `selected`: the host's export of the whole query. */
  readonly exportAll?: (r: ExportRequest, c: ExportAllContext) => Promise<ExportAllResult>;
  /** The file's name (`.csv` added, cleaned); default `${export.fileName}-YYYY-MM-DD-HHmm.csv` in the display zone. */
  readonly fileName?: (c: { readonly scope: CsvScope; readonly ctx: LocaleCtx; readonly now: number }) => string;
  /** For a host's progress bar: the grid says no progress sentences. */
  readonly onProgress?: (p: ExportProgress) => void;
  /** A browser export above this many cells (rows × columns) is refused; 10 000 000 by default (owner Q4). */
  readonly maxCells?: number;
  /** Takes the file instead of the grid's `<a download>` (tests, a host's own saving). */
  readonly deliver?: (f: { readonly blob?: Blob; readonly url?: string; readonly fileName: string }) => void | Promise<void>;
  /** Where the export's code comes from (`import()` of the chunk otherwise). */
  readonly loadRun?: () => Promise<typeof Chunk>;
}

export interface CsvExport extends GridFeature {
  /** Exports `scope` (`displayed` by default); `columns` other than the options' (or the visible ones). */
  run(scope?: CsvScope, o?: { readonly columns?: readonly string[] }): Promise<ExportOutcome>;
  /** Stops the export running: nothing downloads. */
  cancel(): void;
  readonly busy: boolean;
  /** Fetches the export's code ahead (a hover, a focus). */
  prefetch(): void;
  /**
   * The host's button: a click exports (`source: 'user'`), `aria-busy` while one runs (never
   * `disabled`), a hover or focus fetches the code. Returns the unbind.
   */
  bind(button: HTMLElement, o?: { readonly scope?: CsvScope }): () => void;
}

/** The texts `csvExport()` needs, from `@dzgrid/dom/locales/<lang>-export`. */
export const EXPORT_KEYS = [
  'export.fileName', 'announce.exportStarted', 'announce.exportDone', 'announce.exportDoneHidden', 'announce.exportDoneOpen',
  'announce.exportFailed', 'announce.exportRefused', 'announce.exportCancelled',
] satisfies readonly ExportMessageKey[];

/**
 * `csvExport()`: the CSV export (docs/behaviors/csv-export.md, step 19) — no button of its own: the
 * host's, bound with `bind`. This part is small; the code that builds and saves the file is a chunk
 * loaded at the first export (or a hover). One feature object per grid.
 *
 * ```ts
 * import { csvExport } from '@dzgrid/dom/export';
 * import { FR_EXPORT } from '@dzgrid/dom/locales/fr-export';
 * const exporter = csvExport({ canExport: (r) => audit.allow(r) });
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_EXPORT.text } }, features: [exporter], … });
 * exporter.bind(document.querySelector('#export')!, { scope: 'all' });
 * ```
 */
export function csvExport(o: CsvExportOptions): CsvExport {
  if (o?.canExport !== true && typeof o?.canExport !== 'function') throw new TypeError('csvExport: canExport is required');
  let g: GridContext<unknown> | null = null;
  let ac: AbortController | null = null;
  let chunk: Promise<typeof Chunk> | null = null;
  const buttons = new Set<HTMLElement>();
  const mark = (b: HTMLElement): void => void (ac ? b.setAttribute('aria-busy', 'true') : b.removeAttribute('aria-busy'));
  // Imported once; a failure is forgotten, so the next export tries again.
  const load = (): Promise<typeof Chunk> => {
    const p = (chunk ??= (o.loadRun ?? (() => import('./run/index.js')))());
    p.catch(() => chunk === p && (chunk = null));
    return p;
  };
  const run = async (scope: CsvScope = 'displayed', ro: { readonly columns?: readonly string[] } = {}, source: ChangeSource = 'api'): Promise<ExportOutcome> => {
    const grid = g;
    if (!grid || ac) return grid ? 'busy' : 'failed';
    const c = (ac = new AbortController());
    buttons.forEach(mark);
    const t0 = grid.now();
    const id = grid.win?.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
      let m: typeof Chunk;
      try {
        m = await load();
      } catch (err) {
        // The chunk did not load: told here (what follows is the chunk's to tell), unless the grid is gone.
        grid.report(err);
        if (grid.scope.isDisposed) return 'cancelled';
        emit(grid.kernel, {
          type: 'exportFinished', source, id, at: new Date().toISOString(), scope, outcome: 'failed', via: scope !== 'displayed' && !grid.rows.allRows ? 'server' : 'browser',
          rows: null, columns: 0, bytes: null, fileName: null, durationMs: Math.round(grid.now() - t0), failure: { stage: 'load', name: (err as Error)?.name ?? 'Error' },
        });
        grid.live.announce(grid.msg('announce.exportFailed'));
        return 'failed';
      }
      return await m.run(grid, o, { scope, columns: ro.columns ?? o.columns, source, id, t0, signal: c.signal });
    } finally {
      if (ac === c) ac = null;
      buttons.forEach(mark);
    }
  };
  const prefetch = (): void => void load().catch(() => {});
  return {
    id: 'export',
    get busy() {
      return !!ac;
    },
    run: (scope, ro) => run(scope, ro),
    cancel: () => ac?.abort(),
    prefetch,
    bind(b, bo) {
      const click = (): unknown => run(bo?.scope, {}, 'user');
      const on = (fn: (e: Event) => unknown, ...types: string[]) => types.map((t) => (b.addEventListener(t, fn), () => b.removeEventListener(t, fn)));
      const offs = [...on(click, 'click'), ...on(prefetch, 'pointerenter', 'focus')];
      buttons.add(b);
      mark(b);
      return () => {
        offs.forEach((f) => f());
        buttons.delete(b);
        b.removeAttribute('aria-busy');
      };
    },
    setup(x) {
      if (g) throw new TypeError('csvExport: one grid per feature');
      const missing = EXPORT_KEYS.filter((k) => x.settings.messages.text[k] === undefined);
      if (missing.length) throw new TypeError(`csvExport: missing ${missing.join(', ')}`);
      g = x;
      // The grid gone: its export stops silently.
      return { destroy: () => void ((g = null), ac?.abort()) };
    },
  };
}
