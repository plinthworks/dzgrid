import type { AbortHandle } from '@dzgrid/core';
import type { DataRequest, DataSource, ValuesRequest } from '@dzgrid/core/server';

/** One fetch the model made: what it asked, and the test's hands on the answer. */
export interface Call {
  /** `c1`, `c2`, … in the order of the calls. */
  readonly name: string;
  readonly req: DataRequest;
  /** Settles the call; a second settle is the source's bug, and is passed on anyway. */
  resolve(response: unknown): void;
  reject(error: unknown): void;
}

/** One value list the model asked for (`values`), named `v1`, `v2`, … */
export interface ValuesCall {
  readonly name: string;
  readonly req: ValuesRequest;
  resolve(response: unknown): void;
  reject(error: unknown): void;
}

/**
 * A data source driven by the test. Each fetch returns a synchronous thenable
 * (the answer is applied inside `resolve`, so tests and the conformance runner
 * stay synchronous), or a real Promise with `promise: true`, or whatever
 * `reply` returns. `abort` is a handle factory that records each abort with
 * the call it belongs to: a handle belongs to the call made right after it
 * (the gate takes a handle, then the model calls the source), so with fetches
 * only the n-th handle is the n-th call's. `values: true` gives the source a
 * `values` method, its calls named `v1`, `v2`… (`valueCalls`), answered the
 * same ways (`valuesReply` returns what it returns).
 */
export function fakeSource(o: { promise?: boolean; reply?: (req: DataRequest, call: Call) => unknown; values?: boolean; valuesReply?: (req: ValuesRequest, call: ValuesCall) => unknown } = {}) {
  const calls: Call[] = [];
  const valueCalls: ValuesCall[] = [];
  const aborted: [string, unknown][] = [];
  const unbound: { name: string }[] = [];
  const bind = (name: string) => {
    const h = unbound.pop();
    if (h) h.name = name;
    unbound.length = 0;
  };
  const abort = (): AbortHandle => {
    const me = { name: '?' };
    unbound.push(me);
    const signal = { aborted: false, reason: undefined as unknown };
    return {
      signal,
      abort(reason) {
        if (signal.aborted) return;
        signal.aborted = true;
        signal.reason = reason;
        aborted.push([me.name, reason]);
      },
    };
  };
  /** A synchronous thenable, a Promise, or what `reply` gives. */
  /** The call is recorded before `reply` runs: a reply may throw, or ask again from inside. */
  const settleable = <C>(make: (fire: (ok: boolean, v: unknown) => void) => C, record: (c: C) => void, reply: ((c: C) => unknown) | undefined): unknown => {
    const ways: { ok?: (v: unknown) => void; err?: (e: unknown) => void } = {};
    const early: { ok: boolean; v: unknown }[] = [];
    const fire = (ok: boolean, v: unknown) => {
      if (ways.ok) (ok ? ways.ok : ways.err!)(v);
      else early.push({ ok, v });
    };
    const call = make(fire);
    record(call);
    if (reply) return reply(call);
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
    };
  };
  const source: DataSource<any> = {
    fetch(req) {
      const name = `c${calls.length + 1}`;
      bind(name);
      return settleable<Call>((fire) => ({ name, req, resolve: (v) => fire(true, v), reject: (e) => fire(false, e) }), (c) => calls.push(c), o.reply && ((c) => o.reply!(req, c))) as never;
    },
    ...((o.values || o.valuesReply) && {
      values(req: ValuesRequest) {
        const name = `v${valueCalls.length + 1}`;
        bind(name);
        return settleable<ValuesCall>((fire) => ({ name, req, resolve: (v) => fire(true, v), reject: (e) => fire(false, e) }), (c) => valueCalls.push(c), o.valuesReply && ((c) => o.valuesReply!(req, c))) as never;
      },
    }),
  };
  return { source, calls, valueCalls, aborted, abort, last: () => calls[calls.length - 1]!, lastValues: () => valueCalls[valueCalls.length - 1]! };
}

/** Rows for ids: `{ id, name: id }`. */
export const rowsOf = (ids: readonly string[]) => ids.map((id) => ({ id, name: id }));
