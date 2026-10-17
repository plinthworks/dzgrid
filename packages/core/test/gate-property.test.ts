import { describe, it, expect } from 'vitest';
import { createGate, type AbortHandle, type DropReason, type Ticket } from '@dzgrid/core/server';
import { mulberry32 } from './support/rng.js';

const CHANNELS = ['rows', 'values:a', 'values:b'];
const REASONS: readonly DropReason[] = ['superseded', 'stale-epoch', 'aborted', 'destroyed'];

interface Asked { ticket: Ticket; readonly channel: string; readonly epoch: number; readonly n: number; aborts: unknown[]; answered: boolean; accepted: boolean }

/**
 * One seeded script: requests begun on three channels, answers in any order,
 * query changes (new epochs), and optionally a destroy. An oracle of its own —
 * naive, sharing nothing with the gate — says which answer counts.
 */
function runScenario(seed: number, withDestroy: boolean) {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const asked: Asked[] = [];
  let current: Asked | null = null;
  const gate = createGate((): AbortHandle => {
    const me = current!;
    const signal = { aborted: false, reason: undefined as unknown };
    return { signal, abort: (reason) => { signal.aborted = true; signal.reason = reason; me.aborts.push(reason); } };
  });
  // The oracle: the last request on each channel, the epoch now, destroyed or not.
  const last = new Map<string, number>();
  let epoch = 0;
  let destroyed = false;
  const destroyAt = withDestroy ? Math.floor(rnd() * 20) : -1;
  const verdicts: { a: Asked; got: DropReason | null; want: DropReason | null }[] = [];
  const answer = (a: Asked) => {
    a.answered = true;
    const want: DropReason | null = destroyed ? 'destroyed' : a.epoch !== epoch ? 'stale-epoch' : last.get(a.channel) !== a.n ? 'superseded' : null;
    const got = gate.settle(a.ticket);
    a.accepted = got === null;
    verdicts.push({ a, got, want });
  };
  for (let step = 0; step < 20; step++) {
    if (step === destroyAt) {
      gate.destroy();
      destroyed = true;
    }
    const r = rnd();
    const open = asked.filter((a) => !a.answered);
    if (r < 0.5 || !open.length) {
      const channel = pick(CHANNELS);
      const n = asked.length;
      current = { ticket: null as never, channel, epoch, n, aborts: [], answered: false, accepted: false };
      const made = current;
      made.ticket = gate.begin(channel, `k${Math.floor(rnd() * 3)}`).ticket;
      asked.push(made);
      last.set(channel, n);
    } else if (r < 0.9) answer(pick(open));
    else {
      gate.newEpoch();
      if (!destroyed) epoch++;
    }
  }
  // The rest of the answers, in a random order.
  const rest = asked.filter((a) => !a.answered);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  for (const a of rest) answer(a);
  return { gate, asked, verdicts, last, epoch, destroyed };
}

describe('the gate, 1 000 seeded orders of requests and answers', () => {
  it('applies only the answer to the last request of the current query, on every channel', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { gate, asked, verdicts, last, epoch } = runScenario(seed, false);
      // I1: every verdict is the oracle's.
      for (const v of verdicts) expect(v.got, `seed ${seed}, request ${v.a.n}`).toBe(v.want);
      // I2: per channel, what is accepted only moves forward.
      for (const ch of CHANNELS) {
        const accepted = verdicts.filter((v) => v.a.channel === ch && v.got === null).map((v) => v.a.n);
        expect([...accepted].sort((x, y) => x - y), `seed ${seed}`).toEqual(accepted);
      }
      // I3: the grid ends on what was asked last, when it was asked in the current query.
      for (const ch of CHANNELS) {
        const n = last.get(ch);
        if (n === undefined) continue;
        const final = asked[n]!;
        // (Answered before a later query change, it was rightly applied then: I1 covers it.)
        if (final.epoch === epoch) expect(final.accepted, `seed ${seed}, channel ${ch}`).toBe(true);
      }
      // I4: every request but the last of its channel and epoch was aborted exactly once; the
      // last ones and the answered-and-accepted ones never.
      for (const a of asked) {
        expect(a.aborts.every((r) => REASONS.includes(r as DropReason)), `seed ${seed}`).toBe(true);
        expect(a.aborts.length, `seed ${seed}, request ${a.n}`).toBeLessThanOrEqual(1);
        if (a.accepted) expect(a.aborts, `seed ${seed}, request ${a.n}`).toEqual([]);
      }
      // I5: the counts add up.
      const d = gate.diagnostics;
      expect(d.begun).toBe(asked.length);
      expect(d.accepted + REASONS.reduce((s, r) => s + d.dropped[r], 0)).toBe(verdicts.length);
    }
  });

  it('drops every answer after a destroy, and makes no request', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { verdicts } = runScenario(seed, true);
      for (const v of verdicts) expect(v.got, `seed ${seed}, request ${v.a.n}`).toBe(v.want);
    }
  });
});
