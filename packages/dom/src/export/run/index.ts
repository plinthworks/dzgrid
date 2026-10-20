import { problem, type ChangeSource, type GridEvent } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { csvChunks, type CsvScope } from '@dzgrid/core/csv';
import type { GridContext } from '../../context.js';
import type { ExportMessageKey } from '../../messages.js';
import type { CsvExportOptions, ExportOutcome, ExportProgress } from '../index.js';
import { download } from './download.js';
import { defaultFileName, safeFileName } from './name.js';
import { buildRequest } from './request.js';
import { batcher, drain, yieldTo } from './slice.js';

/** What the eager part hands the chunk for one run. */
export interface RunArgs {
  readonly scope: CsvScope;
  readonly columns: readonly string[] | undefined;
  readonly source: ChangeSource;
  readonly id: string;
  /** When the export was asked (`g.now()`). */
  readonly t0: number;
  readonly signal: AbortSignal;
}

type Stage = NonNullable<Extract<GridEvent<unknown>, { type: 'exportFinished' }>['failure']>['stage'];
type Finished = Extract<GridEvent<unknown>, { type: 'exportFinished' }>;
/** A wait cut short by the user's cancel (or the grid's end). */
const ABORT = { name: 'AbortError' };
/** Rows the export waits for at most before failing (`rows`). */
const ROWS_MS = 30_000;
const ROWS_PER_CHUNK = 500;
const URLS = ['http:', 'https:', 'blob:'];
const nameOf = (err: unknown): string => String((err as Error)?.name ?? 'Error');

/**
 * One export (docs/behaviors/csv-export.md, step 19 §3): the rows awaited, the request built and told
 * (`exportRequested`), the browser cap, `canExport`, then the file built here in slices or asked of
 * the host's `exportAll`, named and saved; `exportRefused` or `exportFinished` and a sentence at the end.
 * Never throws: a host's error is reported and becomes the outcome. The grid destroyed: silent.
 */
export async function run(g: GridContext<unknown>, o: CsvExportOptions, r: RunArgs): Promise<ExportOutcome> {
  const { kernel: K, rows: M } = g;
  const { scope, signal } = r;
  const gone = (): boolean => g.scope.isDisposed;
  // Events are told whatever a listener does (a host's onEvent is fenced by the grid already).
  const tell = (e: Record<string, unknown>): void => {
    try {
      emit(K, { ...e, source: r.source, id: r.id, at: new Date().toISOString(), scope } as GridEvent<unknown>);
    } catch (err) {
      g.report(err);
    }
  };
  const say = (k: ExportMessageKey): void => g.live.announce(g.msg(k));
  const progress = (phase: ExportProgress['phase'], rows: number, total: number | null): void => {
    try {
      o.onProgress?.({ phase, rows, total });
    } catch (err) {
      g.report(err);
    }
  };
  /** `p`, unless the export is cancelled first (a promise that never settles included). */
  const race = <X>(p: X | PromiseLike<X>): Promise<X> => new Promise<X>((ok, ko) => {
    if (signal.aborted) return ko(ABORT);
    signal.addEventListener('abort', () => ko(ABORT), { once: true });
    Promise.resolve(p).then(ok, ko);
  });

  const server = scope !== 'displayed' && !M.allRows;
  const end: { -readonly [K in keyof Finished]?: Finished[K] } = { via: server ? 'server' : 'browser', rows: null, columns: 0, bytes: null, fileName: null };
  let quiet: (() => void) | null = null;
  const finish = (outcome: Finished['outcome'], failure?: { stage: Stage; err: unknown }): ExportOutcome => {
    quiet?.();
    if (gone()) return 'cancelled';
    if (failure && failure.err !== ABORT) g.report(failure.err);
    tell({ type: 'exportFinished', outcome, ...end, durationMs: Math.round(g.now() - r.t0), ...(failure && { failure: { stage: failure.stage, name: nameOf(failure.err) } }) });
    if (outcome !== 'done') say(outcome === 'failed' ? 'announce.exportFailed' : 'announce.exportCancelled');
    else if (end.rows == null) say('announce.exportDoneOpen');
    // The count in the base bundle's words (its plural forms): "Exported. 3 rows".
    else g.live.announce(g.msg(end.hidden ? 'announce.exportDoneHidden' : 'announce.exportDone', { rows: g.msg('announce.rows', { n: end.rows }), hidden: end.hidden ?? 0 }));
    return outcome;
  };
  const refuse = (refusal: 'host' | 'too-large' | 'error', reason?: string): ExportOutcome => {
    if (gone()) return 'cancelled';
    tell({ type: 'exportRefused', refusal, ...(reason && { reason }) });
    g.live.announce(reason || g.msg('announce.exportRefused'));
    return 'refused';
  };
  /** The outcome of an error: cancelled when it is the user's cancel, else failed at `stage`. */
  const failed = (stage: Stage, err: unknown): ExportOutcome => (err === ABORT || signal.aborted ? finish('cancelled') : finish('failed', { stage, err }));

  if (signal.aborted) return finish('cancelled');
  // The rows the browser writes are those of a settled model: never a page still loading.
  if (!server) {
    progress('preparing', 0, null);
    try {
      await race(settledRows(g, signal));
    } catch (err) {
      return failed('rows', err);
    }
  }

  const { request, held, event } = await buildRequest(g, scope, r.columns);
  end.columns = request.columns.length;
  if (gone()) return 'cancelled';
  tell(event);
  // The browser's cap (owner Q4), before asking anyone: past it, the host's server export.
  if (held && held.count * request.columns.length > (o.maxCells ?? 10_000_000)) return refuse('too-large');

  let verdict: unknown;
  try {
    verdict = o.canExport === true || (await race(o.canExport(request)));
  } catch (err) {
    if (err === ABORT) return finish('cancelled');
    g.report(err);
    return refuse('error');
  }
  if (verdict !== true) {
    const reason = (verdict as { reason?: unknown } | null)?.reason;
    return refuse('host', typeof reason === 'string' ? reason : undefined);
  }
  // "Exporting…" only if still running a second after the user asked.
  quiet = g.scope.timeout(() => say('announce.exportStarted'), Math.max(0, 1000 - (g.now() - r.t0)));

  const name = (given?: string): string => {
    const now = Date.now();
    try {
      if (given ?? o.fileName) return safeFileName(given ?? o.fileName!({ scope, ctx: g.ctx, now }));
    } catch (err) {
      g.report(err);
    }
    return defaultFileName(g.msg('export.fileName'), now, g.ctx.timeZone);
  };
  const save = async (f: { blob?: Blob; url?: string; fileName: string }): Promise<ExportOutcome> => {
    if (signal.aborted) return finish('cancelled');
    progress('saving', end.rows ?? 0, end.rows ?? null);
    try {
      await race(o.deliver ? o.deliver(f) : download(g, f));
    } catch (err) {
      return failed('download', err);
    }
    end.fileName = f.fileName;
    return finish('done');
  };

  if (!held) {
    end.rows = request.count;
    if (!o.exportAll) {
      emit(K, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'export.exportAll')] });
      quiet();
      return finish('failed', { stage: 'exportAll', err: { name: 'missing-feature' } });
    }
    progress('waiting', 0, request.count);
    let res: Awaited<ReturnType<NonNullable<CsvExportOptions['exportAll']>>>;
    try {
      res = await race(o.exportAll(request, { signal, progress: (done, total) => progress('waiting', done, total ?? request.count) }));
    } catch (err) {
      return failed('exportAll', err);
    }
    if (!res) return finish('done');
    if ('blob' in res) return (end.bytes = res.blob.size), save({ blob: res.blob, fileName: name(res.fileName) });
    let url: URL | null = null;
    try {
      url = new URL(res.url, g.win?.location.href);
    } catch {
      /* not a URL: refused below */
    }
    if (!url || !URLS.includes(url.protocol)) return finish('failed', { stage: 'exportAll', err: { name: 'invalid-url' } });
    return save({ url: url.href, fileName: name(res.fileName) });
  }

  // In the browser: the span map over the same rows when the grid has spans, then the text in slices.
  let blob: Blob;
  try {
    progress('building', 0, held.count);
    let spans = {};
    if (g.spans) {
      const { buildSpanMap } = await race(import('@dzgrid/core/spans'));
      spans = { spans: buildSpanMap({ rows: held.rows, columns: g.columns, ctx: g.ctx, fullWidth: g.settings.fullWidth }), spanColumns: g.columns.visible().map((c) => c.id) };
    }
    const it = csvChunks({ rows: held.rows, at: held.at, columns: g.columns, ctx: g.ctx, ...spans }, { ...o, columns: request.columns, chunkRows: ROWS_PER_CHUNK });
    const b = batcher();
    const sum = await drain(it, { now: g.now, yield: yieldTo(g.win), aborted: () => signal.aborted }, b.push, (k) => progress('building', Math.min(k * ROWS_PER_CHUNK, held.count), held.count));
    if (!sum) return finish('cancelled');
    blob = b.blob('text/csv;charset=utf-8');
    const sel = K.selection;
    const hidden = scope === 'selected' && sel.mode === 'include' ? sel.keys.size - sum.rows : 0;
    Object.assign(end, { rows: sum.rows, bytes: blob.size, ...(hidden > 0 && { hidden }), blank: sum.blank, invalid: sum.invalid });
  } catch (err) {
    return failed('build', err);
  }
  return save({ blob, fileName: name() });
}

/** Resolves once the model is not loading (the first answer, a page turned); rejects on its error, or after 30 s. */
function settledRows(g: GridContext<unknown>, signal: AbortSignal): Promise<void> {
  return new Promise((ok, ko) => {
    const offs: (() => void)[] = [];
    const done = (err?: unknown): void => {
      offs.forEach((f) => f());
      err === undefined ? ok() : ko(err);
    };
    const look = (): unknown => {
      const s = g.rows.status;
      return s.phase === 'loading' ? 0 : done(s.phase === 'error' ? (s.failure ?? new Error('rows')) : undefined);
    };
    if (g.rows.status.phase !== 'loading') return look();
    offs.push(g.kernel.subscribe((e) => void ((e.type === 'modelUpdated' || e.type === 'fetchFailed') && look())), g.scope.timeout(() => done({ name: 'TimeoutError' }), ROWS_MS));
    signal.addEventListener('abort', () => done(ABORT), { once: true });
  });
}
