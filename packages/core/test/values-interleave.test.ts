import { describe, it, expect } from 'vitest';
import { run } from './support/values-interleave.js';

/** docs/behaviors/value-list.md, request-order.md: the property is described in support/values-interleave.ts. */
describe('value lists on a server, under seeded interleavings', () => {
  it('500 scenarios of 40 steps (one source): the list is the last request\'s answer, the request the state\'s, no storm, exact notifications', () => {
    let calls = 0;
    for (let seed = 1; seed <= 500; seed++) calls += run(seed, 40, { sources: false }).vcalls;
    expect(calls).toBeGreaterThan(2000);
  });

  it('500 scenarios of 40 steps switching between sources (two with equal params): the list in force always comes from the current source', () => {
    let calls = 0;
    for (let seed = 1; seed <= 500; seed++) calls += run(seed, 40, { sources: true }).vcalls;
    expect(calls).toBeGreaterThan(2000);
  });

});
