import { describe, it, expect, expectTypeOf } from 'vitest';
import { createGate, type AbortHandle, type DropReason } from '@dzgrid/core/server';

function recorder() {
  const log: { n: number; reason: unknown }[] = [];
  let made = 0;
  const factory = (): AbortHandle => {
    const n = ++made;
    const signal = { aborted: false, reason: undefined as unknown };
    return { signal, abort: (reason) => { signal.aborted = true; signal.reason = reason; log.push({ n, reason }); } };
  };
  return { log, factory, made: () => made };
}

describe('the gate, diagnostics', () => {
  it('start at zero with every reason present, a fresh object per read', () => {
    const g = createGate(recorder().factory);
    expect(g.diagnostics).toEqual({ begun: 0, accepted: 0, dropped: { superseded: 0, 'stale-epoch': 0, aborted: 0, destroyed: 0 } });
    const d = g.diagnostics as { begun: number };
    d.begun = 99;
    expect(g.diagnostics.begun).toBe(0);
    expect(g.diagnostics).not.toBe(g.diagnostics);
  });

  it('accepts is a pure question; settle counts, once per ticket', () => {
    const g = createGate(recorder().factory);
    const { ticket } = g.begin('rows', 'k');
    expect(g.accepts(ticket)).toBeNull();
    expect(g.accepts(ticket)).toBeNull();
    expect(g.diagnostics.accepted).toBe(0);
    g.settle(ticket);
    g.settle(ticket);
    expect(g.diagnostics.accepted).toBe(1);
  });

  it('survive destroy', () => {
    const g = createGate(recorder().factory);
    g.settle(g.begin('rows', 'k').ticket);
    g.destroy();
    expect(g.diagnostics).toMatchObject({ begun: 1, accepted: 1 });
  });
});

describe('the gate, destroy', () => {
  it('aborts every live request once, in the order the channels began, and only once', () => {
    const r = recorder();
    const g = createGate(r.factory);
    g.begin('rows', 'a');
    g.begin('values:x', 'b');
    g.destroy();
    g.destroy();
    expect(r.log).toEqual([{ n: 1, reason: 'destroyed' }, { n: 2, reason: 'destroyed' }]);
  });

  it('leaves begin, newEpoch and cancel inert: no request made, nothing thrown', () => {
    const r = recorder();
    const g = createGate(r.factory);
    g.destroy();
    const { ticket, signal } = g.begin('rows', 'a');
    expect(() => { g.newEpoch(); g.cancel('rows'); }).not.toThrow();
    expect(r.made()).toBe(0);
    expect(signal).toMatchObject({ aborted: true, reason: 'destroyed' });
    expect(g.settle(ticket)).toBe('destroyed');
  });

  it('a handle whose abort throws still lets the others abort, and the error comes out', () => {
    let n = 0;
    const g = createGate((): AbortHandle => {
      const i = ++n;
      const signal = { aborted: false };
      return { signal, abort: () => { signal.aborted = true; if (i === 1) throw new Error('host bug'); } };
    });
    const a = g.begin('rows', 'a');
    const b = g.begin('values:x', 'b');
    expect(() => g.destroy()).toThrow('host bug');
    expect(a.signal.aborted && b.signal.aborted).toBe(true);
    expect(g.settle(b.ticket)).toBe('destroyed');
  });
});

describe('the gate, requests', () => {
  it('makes one abort handle per begin and gives its signal', () => {
    const r = recorder();
    const g = createGate(r.factory);
    const one = g.begin('rows', 'a');
    g.begin('rows', 'b');
    expect(r.made()).toBe(2);
    expect(one.signal.aborted).toBe(true);
    expect(one.signal.reason).toBe('superseded');
  });

  it('an abort listener that begins again during a new epoch sees a consistent gate', () => {
    let gate!: ReturnType<typeof createGate>;
    let again: ReturnType<typeof gate.begin> | null = null;
    gate = createGate((): AbortHandle => {
      const signal = { aborted: false, reason: undefined as unknown };
      return { signal, abort: (reason) => { signal.aborted = true; signal.reason = reason; if (!again) again = gate.begin('rows', 'retry'); } };
    });
    gate.begin('rows', 'a');
    gate.newEpoch();
    expect(again!.ticket.epoch).toBe(1);
    expect(gate.settle(again!.ticket)).toBeNull();
  });

  it('a ticket from another gate is not accepted', () => {
    const one = createGate(recorder().factory);
    const two = createGate(recorder().factory);
    one.begin('x', 'a');
    two.begin('rows', 'a');
    expect(two.accepts(one.begin('other', 'b').ticket)).toBe('superseded');
  });

  it('tickets are frozen; the epoch is readable', () => {
    const g = createGate(recorder().factory);
    const { ticket } = g.begin('rows', 'a');
    expect(Object.isFrozen(ticket)).toBe(true);
    g.newEpoch();
    expect(g.epoch).toBe(1);
  });

  it('types: four reasons, and a real AbortController fits', () => {
    expectTypeOf<DropReason>().toEqualTypeOf<'superseded' | 'stale-epoch' | 'aborted' | 'destroyed'>();
    const g = createGate(() => new AbortController());
    expect(g.begin('rows', 'a').signal.aborted).toBe(false);
  });
});
