// The pasted-HTML reader that cannot be loaded (Phase 5 step 11b, owner S11b-Q5): the paste is refused with a
// sentence (« Loading failed »), nothing is written, a text paste never asks for the chunk, a later paste tries again.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, clip, cmake, flush } from './support-clip.js';

const asked = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/range/html/index.js', () => {
  asked.n++;
  throw new Error('chunk failed');
});

afterEach(cleanup);

const settle = async () => {
  await vi.dynamicImportSettled();
  for (let i = 0; i < 4; i++) await flush();
};

describe('the reader\'s chunk fails to load (S11b-Q5)', () => {
  it('a text paste never asks for it', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/plain': 'x', 'text/html': '<table><tr><td>y</td></tr></table>' });
    await settle();
    expect(asked.n).toBe(0);
    expect(t.changes()).toEqual(['r0/name="x"']);
  });

  it('an HTML-only paste: refused, « Loading failed » said, nothing written; the next one tries again', async () => {
    const t = cmake();
    t.at('r0', 'name');
    const { e } = clip('paste', { 'text/html': '<table><tr><td>y</td><td>1</td></tr></table>' });
    expect(e.defaultPrevented).toBe(true);
    await settle();
    expect(t.requests).toEqual([]);
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.said()).toEqual(['Loading failed']);
    const before = asked.n;
    clip('paste', { 'text/html': '<table><tr><td>z</td></tr></table>' });
    await settle();
    expect(asked.n).toBeGreaterThan(before);
    expect(t.said()).toEqual(['Loading failed', 'Loading failed']);
  });

  it('m20 the grid destroyed before the failed load: nothing said', async () => {
    const t = cmake();
    t.at('r0', 'name');
    clip('paste', { 'text/html': '<table><tr><td>y</td></tr></table>' });
    t.g.destroy();
    await settle();
    expect(t.said()).toEqual([]);
  });
});
