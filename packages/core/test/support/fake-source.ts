import type { AbortHandle } from '@dzgrid/core';
import type { DataRequest, DataSource } from '@dzgrid/core/server';

/** One fetch the model made: what it asked, and the test's hands on the answer. */
export interface Call {
  /** `c1`, `c2`, … in the order of the calls. */
  readonly name: string;
  readonly req: DataRequest;
  /** Settles the call; a second settle is the source's bug, and is passed on anyway. */
  resolve(response: unknown): void;
  reject(error: unknown): void;
}

/**
 * A data source driven by the test. Each fetch returns a synchronous thenable
 * (the answer is applied inside `resolve`, so tests and the conformance runner
 * stay synchronous), or a real Promise with `promise: true`, or whatever
 * `reply` returns. `abort` is a handle factory that records each abort with
 * the call it belongs to: the n-th handle is the n-th call's.
 */
export function fakeSource(o: { promise?: boolean; reply?: (req: DataRequest, call: Call) => unknown } = {}) {
  const calls: Call[] = [];
  const aborted: [string, unknown][] = [];
  let handles = 0;
  const abort = (): AbortHandle => {
    const name = `c${++handles}`;
    const signal = { aborted: false, reason: undefined as unknown };
    return {
      signal,
      abort(reason) {
        if (signal.aborted) return;
        signal.aborted = true;
        signal.reason = reason;
        aborted.push([name, reason]);
      },
    };
  };
  const source: DataSource<any> = {
    fetch(req) {
      const ways: { ok?: (v: unknown) => void; err?: (e: unknown) => void } = {};
      const early: { ok: boolean; v: unknown }[] = [];
      const fire = (ok: boolean, v: unknown) => {
        if (ways.ok) (ok ? ways.ok : ways.err!)(v);
        else early.push({ ok, v });
      };
      const call: Call = { name: `c${calls.length + 1}`, req, resolve: (v) => fire(true, v), reject: (e) => fire(false, e) };
      calls.push(call);
      if (o.reply) return o.reply(req, call) as never;
      if (o.promise) {
        return new Promise((ok, err) => {
          ways.ok = ok as (v: unknown) => void;
          ways.err = err;
        });
      }
      return {
        then(ok: (v: unknown) => void, err: (e: unknown) => void) {
          ways.ok = ok;
          ways.err = err;
          for (const e of early.splice(0)) fire(e.ok, e.v);
        },
      } as never;
    },
  };
  return { source, calls, aborted, abort, last: () => calls[calls.length - 1]! };
}

/** Rows for ids: `{ id, name: id }`. */
export const rowsOf = (ids: readonly string[]) => ids.map((id) => ({ id, name: id }));
