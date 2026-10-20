// Coverage gaps of step 19's export (review of 767653e): fail-closed edges, cancel at every
// boundary, the sentinel's reach, URL schemes, the file name as a property, the loading wait.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { safeFileName } from '../src/export/run/name.js';
import { cellCap } from '../src/export/run/index.js';
import { cleanup, flush, read, xmake, type R } from './support-export.js';

afterEach(cleanup);

const ch = (cp: number) => String.fromCodePoint(cp);
const THREE: R[] = [{ id: 'a', name: 'ann', n: 1.5 }, { id: 'b', name: 'bob', n: -5 }, { id: 'c', name: 'cyd', n: 3 }];
const big = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i }));
const ready = (o: Parameters<typeof xmake>[0] = {}) => {
  const t = xmake({ mode: 'offset', ...o });
  t.answer(10, { total: 95 });
  return t;
};
/** The promise's value, or 'pending' when it has not settled after the flush. */
const settled = async <X>(p: Promise<X>, n = 30): Promise<X | 'pending'> => {
  let v: X | 'pending' = 'pending';
  void p.then((x) => (v = x), () => {});
  await flush(n);
  return v;
};
function spyDownload() {
  const URLs = window.URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
  URLs.createObjectURL ??= () => '';
  URLs.revokeObjectURL ??= () => {};
  const create = vi.spyOn(URLs, 'createObjectURL').mockReturnValue('blob:x/1');
  const revoke = vi.spyOn(URLs, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { create, revoke, click };
}

describe('canExport: fail closed on every not-true answer, sync or async', () => {
  it('async truthy answers refuse; a non-string reason is not said', async () => {
    const answers: unknown[] = [1, 'true', { ok: true }, [true], Object(true), Promise.resolve('yes'), { then: (r: (v: unknown) => void) => r({ ok: true }) }];
    for (const v of answers) {
      const t = xmake({ rows: THREE, options: { canExport: (async () => v) as never } });
      expect(await t.feature.run(), String(v)).toBe('refused');
      expect(t.delivered).toEqual([]);
      cleanup();
    }
    const t = xmake({ rows: THREE, options: { canExport: (() => ({ ok: false, reason: { toString: () => 'obj' } })) as never } });
    expect(await t.feature.run()).toBe('refused');
    expect(t.said()).toEqual(['Export not allowed']);
    expect(t.exportEvents()[1]).not.toHaveProperty('reason');
  });
  it('a thrown AbortError-looking object is a refusal (error), not a cancel', async () => {
    const t = xmake({ rows: THREE, options: { canExport: () => { throw { name: 'AbortError' }; } } });
    expect(await t.feature.run()).toBe('refused');
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportRefused', refusal: 'error' });
  });
  it('canExport swapped for a non-function after construction refuses (no throw out of run)', async () => {
    const o = { canExport: true, deliver: () => {}, loadRun: () => import('../src/export/run/index.js') } as { -readonly [K in keyof CsvExportOptions]: CsvExportOptions[K] };
    const f = csvExport(o);
    const t = xmake({ rows: THREE, feature: f });
    (o as { canExport: unknown }).canExport = 1;
    expect(await t.feature.run()).toBe('refused');
    expect(t.exportEvents().at(-1)).toMatchObject({ refusal: 'error' });
  });
  it('a canExport that rejects after cancel: cancelled, not refused', async () => {
    let no!: (e: unknown) => void;
    const t = xmake({ rows: THREE, options: { canExport: () => new Promise((_, r) => (no = r)) } });
    const p = t.feature.run();
    await flush();
    t.feature.cancel();
    no(new Error('late'));
    expect(await p).toBe('cancelled');
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportRequested', 'exportFinished']);
  });
});

describe('the sentinel, further: failures, progress, the server path', () => {
  const SECRET = 'PATIENT-7f3a';
  it('no cell value in events, problems, sentences or onProgress when deliver, exportAll or the rows fail', async () => {
    const seen: unknown[] = [];
    const onProgress = (p: unknown) => void seen.push(p);
    const rows: R[] = Array.from({ length: 5 }, (_, i) => ({ id: `K-${SECRET}-${i}`, name: `${SECRET} ${i}`, n: 900_000 + i }));
    const told: string[] = [];
    // deliver throws an error carrying a cell value.
    const a = xmake({ rows, options: { onProgress, deliver: () => { throw new TypeError(`${SECRET} 900003`); } } });
    expect(await a.feature.run()).toBe('failed');
    told.push(JSON.stringify([a.exportEvents(), a.problems(), a.said(), seen]));
    // exportAll rejects, and hands a progress.
    const b = ready({ options: { onProgress, exportAll: async (_r, c) => { c.progress(3); throw new Error(SECRET); } } });
    expect(await b.feature.run('all')).toBe('failed');
    told.push(JSON.stringify([b.exportEvents(), b.problems(), b.said(), seen]));
    // The page fails while the export waits.
    const c = ready({ options: { onProgress } });
    c.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = c.feature.run('displayed');
    await flush();
    c.f.fail(new Error(`${SECRET} 900004`));
    expect(await p).toBe('failed');
    told.push(JSON.stringify([c.exportEvents(), c.problems(), c.said(), seen]));
    for (const s of told) {
      expect(s).not.toContain(SECRET);
      expect(s).not.toMatch(/90000[0-9]/);
    }
  });
  it('the progress the host hands without a total takes the request count', async () => {
    const seen: string[] = [];
    const t = ready({ options: { exportAll: async (_r, c) => { c.progress(5); }, onProgress: (p) => void seen.push(`${p.phase}:${p.rows}/${p.total}`) } });
    await t.feature.run('all');
    expect(seen).toContain('waiting:5/95');
  });
});

describe('exportAll { url }: scheme edge cases', () => {
  it('leading space, upper case, tab inside, vbscript, about, ftp: all fail invalid-url', async () => {
    for (const url of [' javascript:alert(1)', 'JAVASCRIPT:alert(1)', `java${ch(9)}script:alert(1)`, `${ch(0)}javascript:x`, 'vbscript:x', 'about:blank', 'ftp://h/x.csv', 'DATA:text/csv,a', 'http://']) {
      const t = ready({ options: { exportAll: async () => ({ url }) } });
      expect(await t.feature.run('all'), JSON.stringify(url)).toBe('failed');
      expect(t.delivered).toEqual([]);
      expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'exportAll', name: 'invalid-url' } });
      cleanup();
    }
  });
  it('a protocol-relative URL resolves against the page (https or http, another host): accepted as http(s)', async () => {
    const t = ready({ options: { exportAll: async () => ({ url: '//files.example/x.csv' }) } });
    expect(await t.feature.run('all')).toBe('done');
    expect(t.delivered[0]!.url).toBe(new URL('//files.example/x.csv', location.href).href);
  });
  it('the server’s file name is cleaned on both paths; the server’s name wins over the option', async () => {
    const bad = `a/b${ch(0x202e)}c`;
    for (const res of [{ url: 'https://h/x', fileName: bad }, { blob: new Blob(['x']), fileName: bad }]) {
      const t = ready({ options: { exportAll: async () => res, fileName: () => 'option' } });
      expect(await t.feature.run('all')).toBe('done');
      expect(t.delivered[0]!.fileName).toBe('abc.csv');
      cleanup();
    }
  });
});

describe('result shapes: the export never throws (bugs)', () => {
  for (const [label, res] of [['a string', 'https://h/x.csv'], ['a number', 1], ['{ blob: null }', { blob: null }]] as const) {
    it(`exportAll resolving ${label} fails the export instead of rejecting run()`, async () => {
      const t = ready({ options: { exportAll: (async () => res) as never } });
      await expect(t.feature.run('all')).resolves.toBe('failed');
    });
  }
});

describe('cancel at every boundary: no file, busy cleared, the URL not made', () => {
  const at = async (phase: string, extra: Partial<CsvExportOptions> = {}, rows = THREE) => {
    const d = spyDownload();
    const f = csvExport({
      canExport: true, loadRun: () => import('../src/export/run/index.js'), ...extra,
      onProgress: (p) => void (p.phase === phase && f.cancel()),
    });
    const t = xmake({ rows, feature: f });
    const out = await t.feature.run();
    return { t, out, ...d };
  };
  it('preparing', async () => {
    const { t, out, create, click } = await at('preparing');
    expect(out).toBe('cancelled');
    expect(create).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(t.feature.busy).toBe(false);
  });
  it('building (first progress, before any slice), on one slice and on many', async () => {
    for (const rows of [THREE, big(30_000)]) {
      const { t, out, create, click } = await at('building', {}, rows);
      expect(out).toBe('cancelled');
      expect(create).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      expect(t.feature.busy).toBe(false);
      expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'cancelled', fileName: null });
      cleanup();
    }
  });
  it('saving (bug: the download is clicked after the cancel)', async () => {
    const { out, create, click } = await at('saving');
    expect(out).toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it('saving with deliver (bug: deliver is handed the file after the cancel)', async () => {
    const deliver = vi.fn();
    const { out } = await at('saving', { deliver });
    expect(out).toBe('cancelled');
    expect(deliver).not.toHaveBeenCalled();
  });
  it('cancelled from exportRequested (bug: canExport is still asked, the audit sees an export that never ran)', async () => {
    const canExport = vi.fn(() => true as const);
    let f!: ReturnType<typeof csvExport>;
    const t = xmake({ rows: THREE, settings: { onEvent: (e: { type: string }) => void (e.type === 'exportRequested' && f.cancel()) } as never, options: { canExport } });
    f = t.feature;
    expect(await t.feature.run()).toBe('cancelled');
    expect(canExport).not.toHaveBeenCalled();
  });
  it('waiting on the server path (bug: exportAll is still called after the cancel)', async () => {
    const exportAll = vi.fn(async () => undefined);
    let f!: ReturnType<typeof csvExport>;
    const t = ready({ options: { exportAll, onProgress: (p) => void (p.phase === 'waiting' && f.cancel()) } });
    f = t.feature;
    expect(await t.feature.run('all')).toBe('cancelled');
    expect(exportAll).not.toHaveBeenCalled();
  });
  it('cancelled at saving and the deliver then throws: still cancelled, not failed', async () => {
    const { out, t } = await at('saving', { deliver: () => { throw new TypeError('gone'); } });
    expect(out).toBe('cancelled');
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'cancelled' });
    expect(t.exportEvents().at(-1)).not.toHaveProperty('failure');
  });
  it('a deliver that never settles: cancel ends it, busy cleared; destroy ends it silently', async () => {
    const t = xmake({ rows: THREE, options: { deliver: () => new Promise(() => {}) } });
    const p = t.feature.run();
    await flush();
    expect(t.feature.busy).toBe(true);
    t.feature.cancel();
    expect(await p).toBe('cancelled');
    expect(t.feature.busy).toBe(false);
    const u = xmake({ rows: THREE, options: { deliver: () => new Promise(() => {}) } });
    const q = u.feature.run();
    await flush();
    const n = u.exportEvents().length;
    u.g.destroy();
    expect(await q).toBe('cancelled');
    expect(u.exportEvents().length).toBe(n);
    expect(u.said()).toEqual([]);
    expect(u.feature.busy).toBe(false);
  });
  it('destroyed while canExport is pending: silent, no exportRefused nor exportFinished', async () => {
    let answer!: (v: unknown) => void;
    const t = xmake({ rows: THREE, options: { canExport: () => new Promise((r) => (answer = r)) as never } });
    const p = t.feature.run();
    await flush();
    t.g.destroy();
    answer(false);
    expect(await p).toBe('cancelled');
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportRequested']);
    expect(t.said()).toEqual([]);
  });
  it('"Exporting…" is never said after a cancel', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = xmake({ rows: THREE, options: { deliver: () => new Promise(() => {}) } });
    const p = t.feature.run();
    await vi.advanceTimersByTimeAsync(500);
    t.feature.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBe('cancelled');
    expect(t.said()).toEqual(['Export cancelled']);
  });
  it('a chunk that never loads: cancel still ends the run (bug: busy for ever)', async () => {
    const t = xmake({ rows: THREE, options: { loadRun: () => new Promise(() => {}) } });
    const p = t.feature.run();
    await flush();
    t.feature.cancel();
    expect(await settled(p)).toBe('cancelled');
    expect(t.feature.busy).toBe(false);
  });
});

describe('host callbacks that throw', () => {
  it('onProgress throwing at every phase: the export is done, each error reported', async () => {
    const t = xmake({ rows: THREE, options: { onProgress: () => { throw new Error('bar'); } } });
    expect(await t.feature.run()).toBe('done');
    expect(t.delivered).toHaveLength(1);
    expect(t.report.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
  it('a deliver that rejects asynchronously fails (stage download), busy cleared', async () => {
    const t = xmake({ rows: THREE, options: { deliver: async () => { throw new SyntaxError('x'); } } });
    expect(await t.feature.run()).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'download', name: 'SyntaxError' } });
    expect(t.feature.busy).toBe(false);
  });
  it('the browser download failing (createObjectURL throws) fails at download, run resolves', async () => {
    const URLs = window.URL as unknown as { createObjectURL: (b: Blob) => string };
    URLs.createObjectURL ??= () => '';
    vi.spyOn(URLs, 'createObjectURL').mockImplementation(() => { throw new TypeError('quota'); });
    const t = xmake({ rows: THREE, feature: csvExport({ canExport: true, loadRun: () => import('../src/export/run/index.js') }) });
    expect(await t.feature.run()).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'download', name: 'TypeError' } });
  });
});

describe('the loading wait', () => {
  it('a page turned again while waiting: the file is the last page asked, never the stale one', async () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = t.feature.run('displayed');
    await flush();
    const stale = t.f.calls.at(-1)!;
    t.g.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    stale.ok({ rows: Array.from({ length: 10 }, (_, i) => ({ id: `r${10 + i}`, name: `x${10 + i}`, n: 10 + i })), total: 95 });
    await flush();
    expect(t.delivered).toEqual([]);
    t.answer(10, { total: 95 });
    expect(await p).toBe('done');
    expect((await read(t.delivered[0]!.blob!)).text.split('\r\n')[1]).toBe('x20,20');
  });
  it('cancel while waiting: cancelled at once, nothing built', async () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = t.feature.run('displayed');
    await flush();
    t.feature.cancel();
    expect(await settled(p)).toBe('cancelled');
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportFinished']);
    expect(t.feature.busy).toBe(false);
  });
  it('destroyed while waiting: silent, cancelled', async () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = t.feature.run('displayed');
    await flush();
    t.g.destroy();
    expect(await settled(p)).toBe('cancelled');
    expect(t.exportEvents()).toEqual([]);
    expect(t.said()).toEqual([]);
  });
  it('a model already in error (a page that failed before): the export fails at rows, nothing built', async () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.fail(new Error('down'));
    await flush();
    expect(await t.feature.run('displayed')).toBe('failed');
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents()).toEqual([expect.objectContaining({ type: 'exportFinished', failure: { stage: 'rows', name: 'Error' } })]);
  });
  it('30 s without an answer fails (stage rows, TimeoutError)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = t.feature.run('displayed');
    await vi.advanceTimersByTimeAsync(29_000);
    expect(t.exportEvents()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await p).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'rows', name: 'TimeoutError' } });
  });
});

describe('safeFileName as a property', () => {
  // A seeded generator (mulberry32): replayable.
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const POOL = [
    'a', 'Z', '7', 'é', 'ش', 'ـ', ' ', '  ', '.', '..', '.csv', '.CSV', 'CON', 'nul', 'com1', 'LPT9', '/', '\\', ':', '*', '?', '"', '<', '>', '|',
    ch(0), ch(9), ch(10), ch(13), ch(0x1f), ch(0x7f), ch(0x85), ch(0xa0), ch(0x2028), ch(0x061c), ch(0x200b), ch(0x200d), ch(0x200e), ch(0x200f),
    ch(0x202a), ch(0x202e), ch(0x2066), ch(0x2069), ch(0x2060), ch(0xfeff), ch(0x1f600), ch(0x1f469) + ch(0x200d) + ch(0x1f4bb), 'e' + ch(0x301),
  ];
  const BAD = new RegExp(`[${[[0, 0x1f], [0x7f, 0x9f]].map(([a, b]) => `${ch(a!)}-${ch(b!)}`).join('')}\\\\/:*?"<>|${ch(0x061c)}${ch(0x200b)}-${ch(0x200f)}${ch(0x202a)}-${ch(0x202e)}${ch(0x2060)}-${ch(0x2069)}${ch(0xfeff)}]`, 'u');
  const gen = (r: () => number) => Array.from({ length: Math.floor(r() * (r() < 0.2 ? 80 : 12)) }, () => POOL[Math.floor(r() * POOL.length)]!).join('');
  it('2 000 random names: .csv at the end, <= 120 code points, no bad character, no edge dot or space, not reserved', () => {
    const r = rng(19);
    for (let i = 0; i < 2000; i++) {
      const input = gen(r);
      const out = safeFileName(input);
      const why = JSON.stringify(input);
      expect(out.endsWith('.csv'), why).toBe(true);
      expect([...out].length, why).toBeLessThanOrEqual(120);
      expect(BAD.test(out), why).toBe(false);
      const stem = out.slice(0, -4);
      expect(/^[.\s]|[.\s]$/.test(stem), why).toBe(false);
      expect(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(stem), why).toBe(false);
      expect(/\s\s/.test(stem), why).toBe(false);
    }
  });
  it('bug: a cut that lands on ".csv" leaves the name ending in .csv.csv (and is not idempotent)', () => {
    const input = 'x'.repeat(112) + '.csv' + 'yyy';
    const out = safeFileName(input);
    expect(out.slice(0, -4).toLowerCase().endsWith('.csv')).toBe(false);
    expect(safeFileName(out)).toBe(out);
  });
  it('gap: invisible format characters outside the list survive (soft hyphen, U+206A-206F, Mongolian vowel separator, tags)', () => {
    for (const cp of [0xad, 0x180e, 0x206a, 0x206f, 0xe0041, 0xe007f]) expect(safeFileName(`ab${ch(cp)}c`), cp.toString(16)).toBe('abc.csv');
  });
  it('gap: Windows reserved names it misses (COM¹, LPT², CONIN$, CONOUT$)', () => {
    for (const n of ['COM' + ch(0xb9), 'LPT' + ch(0xb2), 'CONIN$', 'conout$']) expect(safeFileName(n), n).toMatch(/^_/);
  });
});

describe('maxCells', () => {
  it('NaN, ±Infinity, 0 or a negative maxCells (a bad config) takes the default, never "allow everything"', () => {
    for (const v of [Number('ten'), Infinity, -Infinity, 0, -1, '5' as never, undefined]) expect(cellCap(v), String(v)).toBe(10_000_000);
    expect(cellCap(6)).toBe(6);
  });
  it('a NaN or 0 maxCells exports a small grid as the default would (not refused, not unbounded)', async () => {
    for (const maxCells of [Number('ten'), 0, -3]) {
      const t = xmake({ rows: THREE, options: { maxCells } });
      expect(await t.feature.run(), String(maxCells)).toBe('done');
      cleanup();
    }
    const t = xmake({ rows: THREE, options: { maxCells: 5 } });
    expect(await t.feature.run()).toBe('refused');
  });
});

describe('R2: the hidden count is the selection taken at request time', () => {
  it('the selection changed during the build does not change hidden', async () => {
    let t!: ReturnType<typeof xmake>;
    let r1: unknown;
    t = xmake({ options: { onProgress: (p) => void (p.phase === 'building' && p.rows === 0 && t.g.kernel.dispatch({ type: 'selection.toggle', row: r1 } as never, 'user')) } });
    for (const id of ['r0', 'r1', 'r2']) t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key(id) }, 'user');
    r1 = t.key('r1');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    expect(await t.feature.run('selected')).toBe('done');
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'done', rows: 2, hidden: 1 });
  });
});

describe('run() never rejects: every failure is an outcome, announced, busy cleared', () => {
  const throwOn = (t: ReturnType<typeof xmake>, type: string) => t.g.kernel.subscribe((e) => { if (e.type === type) throw new RangeError('listener'); });
  it('a problems listener that throws at an unknown column: failed (build), said, not busy', async () => {
    const t = xmake({ rows: THREE });
    throwOn(t, 'problems');
    await expect(t.feature.run('displayed', { columns: ['nope'] })).resolves.toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportFinished', outcome: 'failed', failure: { stage: 'build', name: 'RangeError' } });
    expect(t.said().at(-1)).toBe('Export failed');
    expect(t.feature.busy).toBe(false);
    expect(t.delivered).toEqual([]);
  });
  it('a problems listener that throws at the missing exportAll: failed (exportAll)', async () => {
    const t = ready();
    throwOn(t, 'problems');
    await expect(t.feature.run('all')).resolves.toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'failed', failure: { stage: 'exportAll' } });
    expect(t.feature.busy).toBe(false);
  });
  it('exportAll resolving a string, a number or { blob: null }: failed at exportAll, said', async () => {
    for (const res of ['https://h/x.csv', 1, { blob: null }, { blob: 'x' }, { url: 7 }]) {
      const t = ready({ options: { exportAll: (async () => res) as never } });
      await expect(t.feature.run('all'), JSON.stringify(res)).resolves.toBe('failed');
      expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'failed', failure: { stage: 'exportAll' } });
      expect(t.said().at(-1)).toBe('Export failed');
      expect(t.delivered).toEqual([]);
      cleanup();
    }
  });
  it('a bound button whose export fails: no unhandled rejection, aria-busy cleared', async () => {
    const t = xmake({ rows: THREE, options: { columns: ['nope'] } });
    throwOn(t, 'problems');
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const b = document.createElement('button');
      document.body.append(b);
      t.feature.bind(b);
      b.click();
      await flush();
      expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'failed' });
      expect(b.hasAttribute('aria-busy')).toBe(false);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('cancel checked before each host call and side effect', () => {
  it('cancelled at once (before the chunk answers): no event, nothing asked', async () => {
    const exportAll = vi.fn(async () => undefined);
    const canExport = vi.fn(() => true as const);
    const t = ready({ options: { exportAll, canExport } });
    const p = t.feature.run('all');
    t.feature.cancel();
    expect(await p).toBe('cancelled');
    expect(t.feature.busy).toBe(false);
    expect(canExport).not.toHaveBeenCalled();
    expect(exportAll).not.toHaveBeenCalled();
    expect(t.exportEvents().map((e) => e.type)).not.toContain('exportRequested');
  });
  it('cancelled from exportRequested on the server path: exportAll never called', async () => {
    const exportAll = vi.fn(async () => undefined);
    let f!: ReturnType<typeof csvExport>;
    const t = ready({ settings: { onEvent: (e: { type: string }) => void (e.type === 'exportRequested' && f.cancel()) } as never, options: { exportAll } });
    f = t.feature;
    expect(await t.feature.run('all')).toBe('cancelled');
    expect(exportAll).not.toHaveBeenCalled();
  });
  it('a cancel inside onProgress(saving) on the server url path: nothing downloads', async () => {
    const deliver = vi.fn();
    let f!: ReturnType<typeof csvExport>;
    const t = ready({ options: { deliver, exportAll: async () => ({ url: 'https://h/x.csv' }), onProgress: (p) => void (p.phase === 'saving' && f.cancel()) } });
    f = t.feature;
    expect(await t.feature.run('all')).toBe('cancelled');
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe('the host\'s answers, further', () => {
  it('a progress the host hands after the export ended is ignored', async () => {
    const seen: string[] = [];
    let late!: (n: number) => void;
    const t = ready({ options: { exportAll: async (_r, c) => void (late = c.progress), onProgress: (p) => void seen.push(p.phase) } });
    expect(await t.feature.run('all')).toBe('done');
    const n = seen.length;
    late(42);
    expect(seen.length).toBe(n);
  });
  it('{ url: "" } fails invalid-url (an empty URL is refused, not read as the page)', async () => {
    const t = ready({ options: { exportAll: async () => ({ url: '' }) } });
    expect(await t.feature.run('all')).toBe('failed');
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'exportAll', name: 'invalid-url' } });
  });
  it('failure.name is a short identifier: a host error class cannot carry data into the event', async () => {
    const names: [unknown, string][] = [['PATIENT 7f3a', 'Error'], ['A'.repeat(41), 'Error'], [42, 'Error'], ['x-y', 'Error'], ['', 'Error'], ['QuotaExceededError', 'QuotaExceededError']];
    for (const [name, want] of names) {
      const t = xmake({ rows: THREE, options: { deliver: () => { throw Object.assign(new Error('m'), { name }); } } });
      expect(await t.feature.run()).toBe('failed');
      expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'download', name: want } });
      cleanup();
    }
    const t = xmake({ rows: THREE, options: { loadRun: () => Promise.reject(Object.assign(new Error('m'), { name: 'id 900001' })) } });
    expect(await t.feature.run()).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'load', name: 'Error' } });
  });
});

describe('safeFileName, further', () => {
  it('Arabic number signs are kept; other invisible format characters go', () => {
    for (const cp of [0x600, 0x605, 0x6dd, 0x890, 0x891, 0x8e2]) expect(safeFileName(`a${ch(cp)}12`), cp.toString(16)).toBe(`a${ch(cp)}12.csv`);
    for (const cp of [0x70f, 0xfff9, 0x110bd, 0x1d173, 0xe0001, 0x2064]) expect(safeFileName(`a${ch(cp)}b`), cp.toString(16)).toBe('ab.csv');
  });
  it('every reserved form: COM¹²³, LPT¹²³, CONIN$, CONOUT$, with an extension too', () => {
    for (const n of ['COM' + ch(0xb3), 'com' + ch(0xb2) + '.txt', 'LPT' + ch(0xb9), 'lpt' + ch(0xb3), 'CONIN$', 'CONOUT$.x', 'nul.csv']) expect(safeFileName(n), n).toMatch(/^_/);
    expect(safeFileName('CONINx')).toBe('CONINx.csv');
  });
  it('idempotent, and never .csv twice, whatever the length', () => {
    for (let k = 100; k <= 125; k++) for (const tail of ['.csv', '.CSV.csv', '.csv .', '.csv' + 'z']) {
      const out = safeFileName('x'.repeat(k) + tail);
      expect(out.slice(0, -4).toLowerCase().endsWith('.csv'), `${k}${tail}`).toBe(false);
      expect(safeFileName(out)).toBe(out);
    }
    const r = safeFileName('con.' + 'y'.repeat(108) + '.csvQ');
    expect(r.slice(0, -4).toLowerCase().endsWith('.csv')).toBe(false);
    expect(safeFileName(r)).toBe(r);
  });
});
