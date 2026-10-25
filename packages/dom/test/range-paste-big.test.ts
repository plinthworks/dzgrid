// A huge plain-text paste (Phase 5 step 11b, review 3; clipboard.md 20, owner QB4): a text over 64 K characters is
// read by the chunk loaded on demand, which refuses it before decoding when it holds more cells than the cap — its
// lines (one final break dropped) × its first line's cells — with the same « too large » sentence; within the cap it is
// decoded once and pasted as always. A shorter text is decoded at once (it is small).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, clip, cmake, flush } from './support-clip.js';

const seen = vi.hoisted(() => ({ decoded: [] as number[] }));
vi.mock('@dzgrid/core/range', async (orig) => {
  const m = await orig<typeof import('@dzgrid/core/range')>();
  return { ...m, decodeTsv: (t: string, o?: { pad?: boolean }) => (seen.decoded.push(t.length), m.decodeTsv(t, o)) };
});

afterEach(() => {
  cleanup();
  seen.decoded.length = 0;
});
const loaded = async () => {
  await vi.dynamicImportSettled();
  await flush();
};

describe('a huge plain-text paste (review 3)', () => {
  it('over the cap by its count: never decoded, nothing written, « too large » said', async () => {
    const t = cmake({ range: { maxPaste: 1000 } });
    t.at('r0', 'name');
    // 30 000 rows of 1 cell (a last break dropped), then 20 000 rows × 2 cells: both over 64 K characters.
    for (const text of ['x\r\n'.repeat(30_000), 'a\tb\n'.repeat(20_000)]) {
      const { e } = clip('paste', { 'text/plain': text });
      expect(e.defaultPrevented).toBe(true);
      await loaded();
    }
    expect(seen.decoded).toEqual([]);
    expect(t.requests).toEqual([]);
    expect(t.said().filter((s) => s.startsWith('Paste too large'))).toEqual(['Paste too large: at most 1,000 cells; nothing pasted', 'Paste too large: at most 1,000 cells; nothing pasted']);
  });

  it('a million rows at the default cap: refused without decoding, quickly (the same count spares 100 MB)', async () => {
    const t = cmake();
    t.at('r0', 'name');
    const text = '1\n'.repeat(1 << 20);
    const t0 = performance.now();
    expect(t.api().paste(text)).toBeNull();
    await loaded();
    expect(seen.decoded).toEqual([]);
    expect(t.requests).toEqual([]);
    expect(t.said().at(-1)).toBe('Paste too large: at most 100,000 cells; nothing pasted');
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('a long text within the cap (1 000 rows of 70 characters): decoded once by the chunk, pasted', async () => {
    const t = cmake({ range: { maxPaste: 1000 } });
    t.at('r0', 'name');
    clip('paste', { 'text/plain': `${'y'.repeat(70)}\r\n`.repeat(1000) });
    expect(t.requests).toEqual([]);
    await loaded();
    expect(seen.decoded).toHaveLength(1);
    expect(t.requests).toHaveLength(1);
  });

  it('a short text is decoded at once, without the chunk', () => {
    const t = cmake({ range: { maxPaste: 1000 } });
    t.at('r0', 'name');
    clip('paste', { 'text/plain': 'x\r\n'.repeat(1001) });
    expect(seen.decoded).toEqual([3003]);
    expect(t.requests).toHaveLength(1);
  });
});
