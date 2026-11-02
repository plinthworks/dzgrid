// The cell menu and the system clipboard (docs/behaviors/context-menu.md 9–10; ARCHITECTURE « Ajustements après la
// Phase 0 » §3.8; context-menu-plan §8 19–21): « Copy » writes text/plain and text/html synchronously inside the
// gesture (`writeText` where `ClipboardItem` is missing); « Cut » clears only once the write succeeded and the block is
// the same; « Paste » reads with `readText`; refused or missing: one sentence naming the keys.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake, fakeClipboard, k, R_ } from './support-context-menu.js';

let clip: ReturnType<typeof fakeClipboard> | null = null;
afterEach(() => (clip?.restore(), (clip = null), cleanup(), vi.restoreAllMocks()));
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const textOf = async (b: Blob) => await b.text();

describe('Copy (context-menu.md 9)', () => {
  it('one `write`, synchronous inside the click, text/plain = the TSV, text/html a table; the range’s sentence', async () => {
    const t = cmake();
    clip = fakeClipboard({ write: 'ok' });
    t.focusAt('r1', 'n');
    t.api().set(R_(['r1', 'n'], ['r2', 's']));
    t.rclick(t.cell('r1', 'n')!);
    clip.begin();
    t.item('copy')!.click();
    expect(clip.calls.map((c) => [c.kind, c.sync])).toEqual([['write', true]]);
    const data = (clip.calls[0]!.data as { data: Record<string, Blob> }[])[0]!.data;
    expect(await textOf(data['text/plain']!)).toBe('1\ts1\r\n2\ts2\r\n');
    expect(await textOf(data['text/html']!)).toMatch(/^<table[^>]*>.*<td>1<\/td><td>s1<\/td>/s);
    await flush();
    expect(t.said().at(-1)).toBe('Cells copied: 4');
  });

  it('« Copy with headers »: the header row first', async () => {
    const t = cmake();
    clip = fakeClipboard({ write: 'ok' });
    t.rclick(t.cell('r1', 'n')!);
    t.item('copy.headers')!.click();
    const data = (clip.calls[0]!.data as { data: Record<string, Blob> }[])[0]!.data;
    expect(await textOf(data['text/plain']!)).toBe('N\r\n1\r\n');
  });

  it('no ClipboardItem: `writeText` with the TSV', () => {
    const t = cmake();
    clip = fakeClipboard({ write: 'ok', item: false });
    t.rclick(t.cell('r3', 's')!);
    clip.begin();
    t.item('copy')!.click();
    expect(clip.calls.map((c) => [c.kind, c.data, c.sync])).toEqual([['writeText', 's3\r\n', true]]);
  });

  for (const how of ['no', 'missing'] as const) {
    it(`write ${how === 'no' ? 'refused' : 'missing'}: « Use Ctrl+C to copy » (⌘C on a Mac)`, async () => {
      const t = cmake();
      clip = fakeClipboard({ write: how, writeText: 'no', item: how !== 'missing' });
      t.rclick(t.cell('r3', 's')!);
      t.item('copy')!.click();
      await flush();
      expect(t.said().at(-1)).toBe('Use Ctrl+C to copy');
      cleanup();
      const m = cmake({ mac: true });
      m.rclick(m.cell('r3', 's')!);
      m.item('copy')!.click();
      await flush();
      expect(m.said().at(-1)).toBe('Use ⌘C to copy');
    });
  }

  it('no navigator.clipboard at all (an insecure page): the sentence, no throw', async () => {
    const t = cmake();
    clip = fakeClipboard();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    t.rclick(t.cell('r3', 's')!);
    expect(() => t.item('copy')!.click()).not.toThrow();
    await flush();
    expect(t.said().at(-1)).toBe('Use Ctrl+C to copy');
  });
});

describe('Cut never loses data (context-menu.md 10)', () => {
  it('the write resolves: the cells cleared, one save (origin cut)', async () => {
    const t = cmake({ with: ['edit'] });
    clip = fakeClipboard({ write: 'ok' });
    t.rclick(t.cell('r3', 's')!);
    t.item('cut')!.click();
    expect(t.requests).toHaveLength(0);
    await flush();
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.origin).toBe('cut');
  });

  it('the write rejects: nothing cleared, the sentence', async () => {
    const t = cmake({ with: ['edit'] });
    clip = fakeClipboard({ write: 'no', writeText: 'no' });
    t.rclick(t.cell('r3', 's')!);
    t.item('cut')!.click();
    await flush();
    expect(t.requests).toHaveLength(0);
    expect(t.said().at(-1)).toBe('Use Ctrl+C to copy');
  });

  it('the block changed before the write resolved: nothing cleared', async () => {
    const t = cmake({ with: ['edit'] });
    clip = fakeClipboard({ write: 'ok' });
    t.rclick(t.cell('r3', 's')!);
    t.item('cut')!.click();
    t.api().set(R_(['r5', 'n'], ['r6', 'n']));
    await flush();
    expect(t.requests).toHaveLength(0);
  });
});

describe('Paste (context-menu.md 9)', () => {
  it('readText resolves: pasted as Ctrl+V, the range’s sentence', async () => {
    const t = cmake({ with: ['edit'] });
    clip = fakeClipboard({ read: 'ok', text: 'x\ty' });
    t.rclick(t.cell('r3', 's')!);
    clip.begin();
    t.item('paste')!.click();
    expect(clip.calls.map((c) => [c.kind, c.sync])).toEqual([['readText', true]]);
    await flush();
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}/${c.column}=${String(c.value)}`)).toEqual(['r3/s=x']);
    expect(t.said().some((x) => /^Cells pasted/.test(x))).toBe(true);
    expect(t.g.kernel.focus).toMatchObject({ row: k('r3') });
  });

  for (const how of ['no', 'missing'] as const) {
    it(`readText ${how === 'no' ? 'refused' : 'missing'}: « Use Ctrl+V to paste », nothing written`, async () => {
      const t = cmake({ with: ['edit'] });
      clip = fakeClipboard({ read: how });
      t.rclick(t.cell('r3', 's')!);
      t.item('paste')!.click();
      await flush();
      expect(t.requests).toHaveLength(0);
      expect(t.said().at(-1)).toBe('Use Ctrl+V to paste');
    });
  }
});
