// Review of 0c114e3, finding 1: a chunk's `ready` was one promise made at import; a failed Temporal load stayed
// failed (ES modules are kept), so Retry could never succeed. Now `once` asks each chunk again on each load.
import { describe, it, expect, vi } from 'vitest';

const fail = vi.hoisted(() => ({ n: 0 }));
vi.mock('@tzslot/dom/lazy', async (orig) => {
  const m = await orig<typeof import('@tzslot/dom/lazy')>();
  return { ...m, loadTemporal: () => (fail.n-- > 0 ? Promise.reject(new Error('offline')) : m.loadTemporal()) };
});

const { kits } = await import('../src/filters/dates.js');
const { calendars } = await import('../src/editors/dates.js');

describe('Temporal failed once: Retry loads the chunk (review finding 1)', () => {
  for (const k of ['date', 'range', 'moment'] as const)
    it(`the ${k} date kit`, async () => {
      fail.n = 1;
      const l = kits();
      await expect(l.load(k)).rejects.toThrow('offline');
      const m = await l.load(k);
      expect(typeof m.adapt).toBe('function');
      expect(l.done(k)).toBe(m);
    });

  it("the editors' calendar", async () => {
    fail.n = 1;
    const l = calendars();
    await expect(l.load(0)).rejects.toThrow('offline');
    expect(typeof (await l.load(0)).open).toBe('function');
  });

  it('importing a chunk asks for nothing: no promise left to reject unhandled', async () => {
    fail.n = 1;
    vi.resetModules();
    await import('../src/dates/shared.js');
    expect(fail.n).toBe(1);
    fail.n = 0;
  });
});
