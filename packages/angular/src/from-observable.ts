import type { AbortSignalLike } from '@dzgrid/core';
import type { DataRequest, DataResponse, DataSource, ValuesRequest, ValuesResponse } from '@dzgrid/core/server';

/** What `fromObservable` needs of an observable: rxjs's `Observable` fits, no rxjs import here. */
export interface ObservableLike<V> {
  subscribe(o: { next(v: V): void; error(e: unknown): void; complete(): void }): { unsubscribe(): void };
}

/** The first value, then unsubscribed; an abort of the request unsubscribes (an HTTP call is cancelled). */
function first<V>(o: ObservableLike<V>, signal: AbortSignalLike): Promise<V> {
  return new Promise<V>((ok, ko) => {
    let done = false;
    let sub: { unsubscribe(): void } | undefined;
    const s = signal as AbortSignalLike & Partial<Pick<EventTarget, 'addEventListener' | 'removeEventListener'>>;
    // Settled: no more listening to the request's signal (a long-lived signal keeps no closure).
    const settle = (): void => void ((done = true), s.removeEventListener?.('abort', abort));
    const end = (): void => void (settle(), sub?.unsubscribe());
    const abort = (): void => void (done || (end(), ko(s.reason ?? new Error('aborted'))));
    if (s.aborted) return abort();
    sub = o.subscribe({
      next: (v) => void (done || (end(), ok(v))),
      error: (e) => void (done || (settle(), ko(e))),
      complete: () => void (done || (settle(), ko(new Error('fromObservable: completed without a value')))),
    });
    // A value given during subscribe: unsubscribed now that the subscription exists.
    if (done) sub.unsubscribe();
    else s.addEventListener?.('abort', abort, { once: true });
  });
}

/**
 * A server source from functions returning observables (an `HttpClient` call):
 * `sourceRows(fromObservable((req) => http.get<DataResponse<Row>>(url, { params: … })))`.
 * The first value answers; an error rejects; completing without a value rejects.
 */
export function fromObservable<T>(
  fetch: (req: DataRequest) => ObservableLike<DataResponse<T>>,
  values?: (req: ValuesRequest) => ObservableLike<ValuesResponse>,
): DataSource<T> {
  return {
    fetch: (req) => first(fetch(req), req.signal),
    ...(values && { values: (req: ValuesRequest) => first(values(req), req.signal) }),
  };
}
