// The CSV export feature (step 19; docs/behaviors/csv-export.md, decisions of step 19; plan
// docs/phase-3-steps/step19-export-blueprint.md, owner decisions step19-decisions.md).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { canonical } from '@dzgrid/core/internal';
import { csvExport, EXPORT_KEYS, type CsvExportOptions } from '../src/export.js';
import { EN } from '../src/locales/en.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { FR_EXPORT } from '../src/locales/fr-export.js';
import { AR_EXPORT } from '../src/locales/ar-export.js';
import { spans } from '../src/spans.js';
import { cleanup, flush, read, xmake, BUNDLES, type R } from './support-export.js';

afterEach(cleanup);

const THREE: R[] = [{ id: 'a', name: 'ann', n: 1.5 }, { id: 'b', name: '=SUM(A1)', n: -5 }, { id: 'c', name: 'سارة', n: 3 }];
const run = (t: ReturnType<typeof xmake>, ...a: Parameters<ReturnType<typeof xmake>['feature']['run']>) => t.feature.run(...a);

describe('the options and the setup', () => {
  it('canExport is required: the type refuses it missing, and so does the call (fail closed)', () => {
    // @ts-expect-error canExport is required
    expect(() => csvExport({})).toThrow(TypeError);
    expect(() => csvExport({ canExport: undefined } as never)).toThrow(/canExport/);
    expect(() => csvExport({ canExport: false } as never)).toThrow(/canExport/);
  });
  it('lists the eight keys, and every bundle has them all', () => {
    expect(EXPORT_KEYS).toHaveLength(8);
    for (const b of [EN_EXPORT, FR_EXPORT, AR_EXPORT]) expect(Object.keys(b.text).sort()).toEqual([...EXPORT_KEYS].sort());
  });
  it('throws at setup, naming each missing text', () => {
    expect(() => xmake({ settings: { messages: EN } })).toThrow(/csvExport: missing .*announce\.exportDone/);
  });
  it('one feature object per grid: a second live grid throws; once the first is destroyed, a new grid takes it', () => {
    const a = xmake();
    expect(() => xmake({ feature: a.feature })).toThrow(TypeError);
    a.g.destroy();
    expect(() => xmake({ feature: a.feature })).not.toThrow();
  });
  it('the code is not loaded before it is needed', () => {
    const loadRun = vi.fn(() => import('../src/export/run/index.js'));
    xmake({ options: { loadRun } });
    expect(loadRun).not.toHaveBeenCalled();
  });
});

describe('a browser export', () => {
  it('writes the rows shown, BOM first (EF BB BF), the text of step 10, and names the file in the display zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 23, 5));
    const t = xmake({ rows: THREE });
    expect(await run(t)).toBe('done');
    expect(t.delivered).toHaveLength(1);
    const d = t.delivered[0]!;
    // Algiers is UTC+1: 00:05 the next day there.
    expect(d.fileName).toBe('export-2026-10-21-0005.csv');
    expect(d.blob!.type).toBe('text/csv;charset=utf-8');
    const { bytes, text } = await read(d.blob!);
    expect(bytes).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toBe("Name,N\r\nann,1.5\r\n'=SUM(A1),-5\r\nسارة,3\r\n");
  });
  it('follows the locale: ; and 1,5 in French; the file name prefix from the bundle', async () => {
    const t = xmake({ rows: THREE, lang: 'ar' });
    await run(t);
    expect(t.delivered[0]!.fileName).toMatch(/^تصدير-\d{4}-\d\d-\d\d-\d{4}\.csv$/);
    const f = xmake({ rows: THREE, lang: 'fr' });
    await run(f);
    expect((await read(f.delivered[0]!.blob!)).text).toBe("Name;N\r\nann;1,5\r\n'=SUM(A1);-5\r\nسارة;3\r\n");
  });
  it('the host’s csv options and its file name, cleaned', async () => {
    const fileName = vi.fn(() => 'rapport: «juin»/2026');
    const t = xmake({ rows: THREE, options: { bom: false, separator: '\t', header: false, fileName } });
    await run(t);
    expect(fileName).toHaveBeenCalledWith(expect.objectContaining({ scope: 'displayed', ctx: expect.objectContaining({ timeZone: 'Africa/Algiers' }), now: expect.any(Number) }));
    expect(t.delivered[0]!.fileName).toBe('rapport «juin»2026.csv');
    const { bytes, text } = await read(t.delivered[0]!.blob!);
    expect(bytes[0]).toBe(0x61);
    expect(text).toBe("ann\t1.5\r\n'=SUM(A1)\t-5\r\nسارة\t3\r\n");
  });
  it('a file name that throws: the default name, the error reported', async () => {
    const t = xmake({ rows: THREE, options: { fileName: () => { throw new Error('host'); } } });
    expect(await run(t)).toBe('done');
    expect(t.delivered[0]!.fileName).toMatch(/^export-/);
    expect(t.report).toHaveBeenCalled();
  });
  it('the columns asked, in their order, a hidden one included; an unknown one skipped and told', async () => {
    const t = xmake({ rows: THREE, columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }, { id: 'id', header: 'Key', hidden: true }] });
    await run(t, 'displayed', { columns: ['id', 'nope', 'name'] });
    expect((await read(t.delivered[0]!.blob!)).text).toBe('Key,Name\r\na,ann\r\nb,\'=SUM(A1)\r\nc,سارة\r\n');
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'unknown-column', path: 'csv.columns[1]' }));
    const req = t.exportEvents()[0] as unknown as { columns: string[] };
    expect(req.columns).toEqual(['id', 'name']);
  });
  it('displayed is the page; all every page, filtered and sorted as shown; selected the selected rows shown', async () => {
    const t = xmake({ mode: 'paged' });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    await run(t, 'displayed');
    await run(t, 'all');
    const lines = async (k: number) => (await read(t.delivered[k]!.blob!)).text.split('\r\n').slice(1, -1).map((l) => l.split(',')[1]);
    expect(await lines(0)).toEqual(['29', '28', '26', '25', '23', '22', '20', '19', '17', '16']);
    expect((await lines(1)).length).toBe(20);
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r28') }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r16') }, 'user');
    expect(await run(t, 'selected')).toBe('done');
    expect(await lines(2)).toEqual(['28', '16']);
  });
  it('selected rows the filters hide are not written, and the end says how many', async () => {
    const t = xmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r0') }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r1') }, 'user');
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r2') }, 'user');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'bob' } }, 'user');
    expect(await run(t, 'selected')).toBe('done');
    expect((await read(t.delivered[0]!.blob!)).text).toBe('Name,N\r\nbob1,1\r\nbob2,2\r\n');
    const fin = t.exportEvents().at(-1)!;
    expect(fin).toMatchObject({ type: 'exportFinished', outcome: 'done', rows: 2, hidden: 1 });
    expect(t.said().at(-1)).toBe('Exported. 2 rows. Selected, hidden by filters: 1');
  });
  it('an empty result is a header-only file, done, "Exported. 0 rows"', async () => {
    const t = xmake({ rows: [] });
    expect(await run(t)).toBe('done');
    expect((await read(t.delivered[0]!.blob!)).text).toBe('Name,N\r\n');
    expect(t.said().at(-1)).toBe('Exported. 0 rows');
  });
  it('spans: merged cells repeat their value, as step 10 writes them', async () => {
    const rows: R[] = [{ id: 'a', name: 'W1', n: 1 }, { id: 'b', name: 'W2', n: 2 }, { id: 'c', name: 'Z', n: 3 }];
    // Merged by their first letter: the covered slot holds the origin's value (W1), not its own (W2).
    const merge = (a: { value: unknown }, b: { value: unknown }) => String(a.value)[0] === String(b.value)[0];
    const got: { blob?: Blob }[] = [];
    const f = csvExport({ canExport: true, deliver: (d) => void got.push(d), loadRun: () => import('../src/export/run/index.js') });
    const t = xmake({ rows, columns: [{ id: 'name', header: 'Ward', merge }, { id: 'n', header: 'N', type: 'number' }], feature: f, features: [spans(), f] });
    expect(await t.feature.run()).toBe('done');
    expect((await read(got[0]!.blob!)).text).toBe('Ward,N\r\nW1,1\r\nW1,2\r\nZ,3\r\n');
    expect(await t.feature.run('all', { columns: ['n', 'name'] })).toBe('done');
    expect((await read(got[1]!.blob!)).text).toBe('N,Ward\r\n1,W1\r\n2,W1\r\n3,Z\r\n');
  });
  it('the browser cap: more than maxCells cells is refused before building, without asking canExport', async () => {
    const canExport = vi.fn(() => true as const);
    const t = xmake({ options: { maxCells: 59, canExport } });
    expect(await run(t)).toBe('refused');
    expect(canExport).not.toHaveBeenCalled();
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportRequested', 'exportRefused']);
    expect(t.exportEvents()[1]).toMatchObject({ refusal: 'too-large' });
    expect(t.said().at(-1)).toBe('Export not allowed');
    const u = xmake({ options: { maxCells: 60 } });
    expect(await run(u)).toBe('done');
  });
  it('10 000 000 cells by default', async () => {
    const t = xmake();
    const rows = t.g.kernel.rows;
    vi.spyOn(rows, 'displayed', 'get').mockReturnValue({ ...rows.displayed, count: 5_000_001 } as never);
    expect(await run(t)).toBe('refused');
    expect(t.exportEvents().at(-1)).toMatchObject({ refusal: 'too-large' });
  });
});

describe('canExport (owner Q1: required, fail closed)', () => {
  const refusedBy = async (canExport: CsvExportOptions['canExport']) => {
    const t = xmake({ rows: THREE, options: { canExport } });
    const out = await run(t);
    return { t, out, report: t.report };
  };
  it('receives the request (data only) after exportRequested; true allows', async () => {
    const seen: unknown[] = [];
    const t = xmake({ rows: THREE, options: { canExport: (r) => { seen.push(r, t.exportEvents().map((e) => e.type)); return true; } } });
    expect(await run(t, 'all')).toBe('done');
    expect(seen[0]).toEqual({ scope: 'all', columns: ['name', 'n'], query: t.g.kernel.query, count: 3 });
    expect(seen[1]).toEqual(['exportRequested']);
  });
  it('false refuses: no file, exportRefused { refusal: host }, "Export not allowed"', async () => {
    const { t, out } = await refusedBy(() => false);
    expect(out).toBe('refused');
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportRequested', 'exportRefused']);
    expect(t.exportEvents()[1]).toMatchObject({ refusal: 'host', scope: 'displayed' });
    expect(t.exportEvents()[1]).not.toHaveProperty('reason');
    expect(t.said()).toEqual(['Export not allowed']);
  });
  it('{ ok: false, reason } refuses with the host’s sentence, said and in the event', async () => {
    const { t, out } = await refusedBy(async () => ({ ok: false, reason: 'Ask your administrator' }));
    expect(out).toBe('refused');
    expect(t.exportEvents()[1]).toMatchObject({ refusal: 'host', reason: 'Ask your administrator' });
    expect(t.said()).toEqual(['Ask your administrator']);
  });
  it('a throw or a rejection refuses (refusal: error), reported', async () => {
    for (const c of [() => { throw new Error('x'); }, () => Promise.reject(new Error('y'))]) {
      const { t, out, report } = await refusedBy(c as never);
      expect(out).toBe('refused');
      expect(t.delivered).toEqual([]);
      expect(t.exportEvents()[1]).toMatchObject({ refusal: 'error' });
      expect(report).toHaveBeenCalledWith(expect.any(Error));
    }
  });
  it('anything but true refuses (undefined, a truthy object, "yes")', async () => {
    for (const v of [undefined, { ok: true }, 'yes', 1]) expect((await refusedBy(() => v as never)).out).toBe('refused');
  });
  it('a canExport that never settles: cancel() ends it, busy cleared, "Export cancelled"', async () => {
    const t = xmake({ rows: THREE, options: { canExport: () => new Promise(() => {}) } });
    const p = run(t);
    await flush();
    expect(t.feature.busy).toBe(true);
    t.feature.cancel();
    expect(await p).toBe('cancelled');
    expect(t.feature.busy).toBe(false);
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportFinished', outcome: 'cancelled', fileName: null, bytes: null });
    expect(t.said().at(-1)).toBe('Export cancelled');
    expect(t.delivered).toEqual([]);
  });
});

describe('the events (owner Q2: data only)', () => {
  it('exportRequested and exportFinished carry exactly the trace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 10, 0));
    const t = xmake({ rows: THREE });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'a' }, 'user');
    await t.feature.run('displayed');
    const [req, fin] = t.exportEvents() as Record<string, unknown>[];
    expect(req).toEqual({
      type: 'exportRequested', source: 'api', id: expect.any(String), at: '2026-10-20T10:00:00.000Z', scope: 'displayed',
      columns: ['name', 'n'], query: t.g.kernel.query, queryKey: t.g.kernel.rows.membershipOf(t.g.kernel.query), count: 2, zone: 'Africa/Algiers', locale: 'en-US',
    });
    expect(req!['query']).toMatchObject({ quick: 'a' });
    expect(fin).toEqual({
      type: 'exportFinished', source: 'api', id: req!['id'], at: '2026-10-20T10:00:00.000Z', scope: 'displayed', outcome: 'done', via: 'browser',
      rows: 2, columns: 2, bytes: t.delivered[0]!.blob!.size, fileName: 'export-2026-10-20-1100.csv', durationMs: expect.any(Number), blank: 0, invalid: 0,
    });
    // 'a' finds ann and =SUM(A1) (case ignored), not سارة.
    expect(t.delivered[0]!.blob!.size).toBe(3 + "Name,N\r\nann,1.5\r\n'=SUM(A1),-5\r\n".length);
  });
  it('selected: the selection as mode and count only, never its keys', async () => {
    const t = xmake();
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r4') }, 'user');
    await t.feature.run('selected');
    const req = t.exportEvents()[0] as Record<string, unknown>;
    expect(req['selection']).toEqual({ mode: 'include', count: 1 });
  });
  it('each run has its own id; a bound button says source user', async () => {
    const t = xmake();
    await t.feature.run();
    const b = document.createElement('button');
    document.body.append(b);
    t.feature.bind(b);
    b.click();
    await flush();
    const ids = t.exportEvents().map((e) => (e as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
    expect(t.exportEvents().map((e) => e.source)).toEqual(['api', 'api', 'user', 'user']);
  });
  it('sentinel: no cell value nor row key in any event, problem or sentence, whatever the outcome', async () => {
    const SECRET = 'PATIENT-7f3a';
    const rows: R[] = Array.from({ length: 12 }, (_, i) => ({ id: `KEY-${SECRET}-${i}`, name: `${SECRET} ${i}`, n: 900_000 + i }));
    const outcomes: string[] = [];
    for (const canExport of [() => true as const, () => false, () => { throw new Error(SECRET); }, () => ({ ok: false as const })]) {
      for (const scope of ['displayed', 'all', 'selected'] as const) {
        const t = xmake({ rows, options: { canExport, maxCells: scope === 'all' ? 3 : undefined as never } });
        t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key(`KEY-${SECRET}-3`) }, 'user');
        t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 900_002 } }, 'user');
        outcomes.push(await t.feature.run(scope));
        const told = JSON.stringify([t.exportEvents(), t.problems(), t.said()]);
        expect(told).not.toContain(SECRET);
        expect(told).not.toMatch(/90000[3-9]|90001\d/);
      }
    }
    expect(new Set(outcomes)).toEqual(new Set(['done', 'refused']));
  });
  it('a host onEvent that throws does not stop the export', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const t = xmake({ rows: THREE, settings: { onEvent: () => { throw new Error('host'); } } });
    expect(await run(t)).toBe('done');
    expect(t.delivered).toHaveLength(1);
    expect(reportError).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('progress, busy, cancel and destroy', () => {
  const big = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `n${i}`, n: i }));
  it('onProgress: preparing, building (up to the total), saving', async () => {
    const seen: string[] = [];
    const t = xmake({ rows: big(1200), options: { onProgress: (p) => void seen.push(`${p.phase}:${p.rows}/${p.total}`) } });
    await run(t);
    expect(seen[0]).toBe('preparing:0/null');
    expect(seen).toContain('building:1200/1200');
    expect(seen.at(-1)).toBe('saving:1200/1200');
  });
  it('one export at a time: a second run while busy is "busy" and sends nothing', async () => {
    let allow!: () => void;
    const t = xmake({ rows: THREE, options: { canExport: () => new Promise<true>((r) => (allow = () => r(true))) } });
    const p = run(t);
    await flush();
    expect(t.feature.busy).toBe(true);
    expect(await run(t)).toBe('busy');
    expect(t.exportEvents().map((e) => e.type)).toEqual(['exportRequested']);
    allow();
    expect(await p).toBe('done');
    expect(t.feature.busy).toBe(false);
  });
  it('cancel mid-build: no file, exportFinished cancelled, "Export cancelled"', async () => {
    const t = xmake({ rows: big(40_000), options: { onProgress: (p) => void (p.phase === 'building' && p.rows > 0 && t.feature.cancel()) } });
    expect(await run(t)).toBe('cancelled');
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportFinished', outcome: 'cancelled', via: 'browser' });
    expect(t.said().at(-1)).toBe('Export cancelled');
  });
  it('the grid destroyed mid-build: stops silently (no event, no sentence), resolves cancelled', async () => {
    const t = xmake({ rows: big(40_000), options: { onProgress: (p) => void (p.phase === 'building' && p.rows > 0 && t.g.destroy()) } });
    const before = () => t.exportEvents().length;
    expect(await run(t)).toBe('cancelled');
    expect(t.delivered).toEqual([]);
    expect(before()).toBe(1);
    expect(t.said()).toEqual([]);
  });
  it('a column change during the build does not change the file (the columns taken at the start)', async () => {
    let changed = false;
    const t = xmake({ rows: big(3000), options: { onProgress: (p) => { if (p.phase === 'building' && p.rows > 0 && !changed) { changed = true; t.g.update({ columns: [{ id: 'n', header: 'Other', type: 'number' }] }); } } } });
    expect(await run(t)).toBe('done');
    expect(changed).toBe(true);
    const text = (await read(t.delivered[0]!.blob!)).text;
    expect(text.startsWith('Name,N\r\nn0,0\r\n')).toBe(true);
    expect(text.split('\r\n').length).toBe(3002);
    expect(text.endsWith('n2999,2999\r\n')).toBe(true);
  });
  it('"Exporting…" only when still running after 1 s; the end always', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let allow!: () => void;
    const t = xmake({ rows: THREE, options: { deliver: () => new Promise<void>((r) => (allow = r)) } });
    const p = run(t);
    await vi.advanceTimersByTimeAsync(900);
    expect(t.said()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(t.said()).toEqual(['Exporting…']);
    allow();
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toBe('done');
    expect(t.said()).toEqual(['Exporting…', 'Exported. 3 rows']);
    const q = xmake({ rows: THREE });
    await run(q);
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.said()).toEqual(['Exported. 3 rows']);
  });
});

describe('the code chunk', () => {
  it('a chunk that fails to load: failed (stage load), busy cleared, "Export failed"; the next run tries again', async () => {
    let fails = true;
    const loadRun = vi.fn(() => (fails ? Promise.reject(new Error('offline')) : import('../src/export/run/index.js')));
    const t = xmake({ rows: THREE, options: { loadRun } });
        expect(await run(t)).toBe('failed');
    expect(t.feature.busy).toBe(false);
    expect(t.exportEvents()).toEqual([expect.objectContaining({ type: 'exportFinished', outcome: 'failed', failure: { stage: 'load', name: 'Error' }, rows: null, fileName: null })]);
    expect(t.said()).toEqual(['Export failed']);
    fails = false;
    expect(await run(t)).toBe('done');
    expect(loadRun).toHaveBeenCalledTimes(2);
  });
  it('prefetch loads it once', async () => {
    const loadRun = vi.fn(() => import('../src/export/run/index.js'));
    const t = xmake({ options: { loadRun } });
    t.feature.prefetch();
    t.feature.prefetch();
    await flush();
    await run(t);
    expect(loadRun).toHaveBeenCalledTimes(1);
  });
});

describe('bind(button)', () => {
  it('a click exports (source user); aria-busy while running, never disabled; busy clicks ignored; hover and focus fetch the code', async () => {
    const loadRun = vi.fn(() => import('../src/export/run/index.js'));
    let allow!: () => void;
    const canExport = vi.fn(() => new Promise<true>((r) => (allow = () => r(true))));
    const t = xmake({ rows: THREE, options: { loadRun, canExport } });
    const b = document.createElement('button');
    document.body.append(b);
    const unbind = t.feature.bind(b, { scope: 'all' });
    b.dispatchEvent(new Event('pointerenter'));
    expect(loadRun).toHaveBeenCalledTimes(1);
    b.click();
    await flush();
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    b.click();
    await flush();
    expect(canExport).toHaveBeenCalledTimes(1);
    allow();
    await flush();
    expect(b.hasAttribute('aria-busy')).toBe(false);
    expect(t.exportEvents()[0]).toMatchObject({ source: 'user', scope: 'all' });
    expect(t.delivered).toHaveLength(1);
    unbind();
    b.click();
    await flush();
    expect(canExport).toHaveBeenCalledTimes(1);
  });
  it('focus fetches the code too; unbinding during a run takes aria-busy away', async () => {
    const loadRun = vi.fn(() => import('../src/export/run/index.js'));
    const t = xmake({ rows: THREE, options: { loadRun, canExport: () => new Promise(() => {}) } });
    const b = document.createElement('button');
    document.body.append(b);
    const unbind = t.feature.bind(b);
    b.dispatchEvent(new FocusEvent('focus'));
    expect(loadRun).toHaveBeenCalledTimes(1);
    b.click();
    await flush();
    expect(b.getAttribute('aria-busy')).toBe('true');
    unbind();
    expect(b.hasAttribute('aria-busy')).toBe(false);
    t.feature.cancel();
  });
  it('without a grid, a run fails quietly', async () => {
    const f = csvExport({ canExport: true });
    expect(await f.run()).toBe('failed');
  });
});

describe('server pages: all and selected go to exportAll (the grid never pages through the server)', () => {
  const ready = (o: Parameters<typeof xmake>[0] = {}) => {
    const t = xmake({ mode: 'offset', ...o });
    t.answer(10, { total: 95 });
    return t;
  };
  it('exportAll receives the request with the server part (the page and signal left out) and the count; no page fetched', async () => {
    const exportAll = vi.fn(async () => ({ blob: new Blob(['x']), fileName: 'serveur.csv' }));
    const t = ready({ options: { exportAll } });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'x' } }, 'user');
    t.answer(10, { total: 40 });
    const fetches = t.f.calls.length;
    expect(await run(t, 'all')).toBe('done');
    expect(t.f.calls.length).toBe(fetches);
    const [req, ctx] = exportAll.mock.calls[0] as unknown as [Record<string, unknown>, { signal: AbortSignal }];
    const sent = t.f.calls.at(-1)!.req;
    const { page: _p, signal: _s, key: _k, ...parts } = sent;
    expect(req).toEqual({ scope: 'all', columns: ['name', 'n'], query: t.g.kernel.query, count: 40, server: { ...parts, key: canonical(parts) } });
    expect(ctx.signal.aborted).toBe(false);
    expect(t.delivered[0]!.fileName).toBe('serveur.csv');
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'done', via: 'server', rows: 40, bytes: 1, fileName: 'serveur.csv' });
    expect((t.exportEvents()[0] as Record<string, unknown>)['server']).toEqual(req['server']);
  });
  it('selected: the selection (its keys go to the host’s API, never into the event), the count from the selection', async () => {
    const exportAll = vi.fn(async (_r: unknown, _c: unknown) => undefined);
    const t = ready({ options: { exportAll } });
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.key('r3') }, 'user');
    expect(await run(t, 'selected')).toBe('done');
    const req = exportAll.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(req['count']).toBe(1);
    expect(req['selection']).toBe(t.g.kernel.selection);
    expect((t.exportEvents()[0] as Record<string, unknown>)['selection']).toEqual({ mode: 'include', count: 1 });
    // Nothing returned: the host did it.
    expect(t.delivered).toEqual([]);
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'done', bytes: null, fileName: null, rows: 1 });
  });
  it('an unknown total: count null, "Exported"', async () => {
    const t = xmake({ mode: 'offset', options: { exportAll: async () => undefined } });
    t.answer(10, { hasNext: true });
    await run(t, 'all');
    expect((t.exportEvents()[0] as Record<string, unknown>)['count']).toBeNull();
    expect(t.said().at(-1)).toBe('Exported');
  });
  it('without exportAll: failed, missing-feature at export.exportAll', async () => {
    const t = ready();
    expect(await run(t, 'all')).toBe('failed');
    expect(t.problems()).toContainEqual(expect.objectContaining({ code: 'missing-feature', path: 'export.exportAll' }));
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'failed', failure: { stage: 'exportAll', name: 'missing-feature' } });
    expect(t.said().at(-1)).toBe('Export failed');
  });
  it('{ url }: http, https, blob and relative ones are downloaded; any other scheme fails (invalid-url)', async () => {
    for (const [url, ok] of [['https://files.example/x.csv', true], ['http://h/x', true], ['/api/export/42', true], ['blob:http://localhost/abc', true], ['javascript:alert(1)', false], ['data:text/csv,a', false], ['file:///etc/passwd', false]] as const) {
      const t = ready({ options: { exportAll: async () => ({ url }) } });
      expect(await run(t, 'all'), url).toBe(ok ? 'done' : 'failed');
      if (ok) expect(t.delivered[0]!.url).toBe(new URL(url, location.href).href);
      else {
        expect(t.delivered).toEqual([]);
        expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'exportAll', name: 'invalid-url' } });
      }
      cleanup();
    }
  });
  it('a rejected exportAll fails (stage exportAll, the error’s name only)', async () => {
    const t = ready({ options: { exportAll: async () => { throw new RangeError('secret detail'); } } });
        expect(await run(t, 'all')).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'exportAll', name: 'RangeError' } });
    expect(JSON.stringify(t.exportEvents())).not.toContain('secret');
  });
  it('cancel while exportAll runs: its signal aborts, cancelled', async () => {
    let signal!: AbortSignal;
    const t = ready({ options: { exportAll: (_r, c) => { signal = c.signal; return new Promise(() => {}); } } });
    const p = run(t, 'all');
    await flush();
    t.feature.cancel();
    expect(await p).toBe('cancelled');
    expect(signal.aborted).toBe(true);
  });
  it('progress from the host reaches onProgress (waiting)', async () => {
    const seen: string[] = [];
    const t = ready({ options: { exportAll: async (_r, c) => { c.progress(10, 95); }, onProgress: (p) => void seen.push(`${p.phase}:${p.rows}/${p.total}`) } });
    await run(t, 'all');
    expect(seen).toContain('waiting:10/95');
  });
  it('displayed on server pages is the page shown, built in the browser; it waits for a page still loading (no stale page)', async () => {
    const t = ready();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = run(t, 'displayed');
    await flush();
    expect(t.delivered).toEqual([]);
    t.answer(10, { total: 95 });
    expect(await p).toBe('done');
    const text = (await read(t.delivered[0]!.blob!)).text;
    expect(text.split('\r\n')[1]).toBe('x10,10');
  });
  it('a page that fails to load fails the export (stage rows)', async () => {
    const t = ready();
        t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    const p = run(t, 'displayed');
    await flush();
    t.f.fail(new Error('down'));
    expect(await p).toBe('failed');
    expect(t.exportEvents()).toEqual([expect.objectContaining({ type: 'exportFinished', failure: { stage: 'rows', name: 'Error' } })]);
  });
});

describe('a fetched set (configuration A)', () => {
  it('all is built in the browser from the set, with the server part in the request', async () => {
    const canExport = vi.fn((_r: unknown) => true as const);
    const t = xmake({ mode: 'fetched', options: { canExport } });
    t.answer(25);
    expect(await run(t, 'all')).toBe('done');
    expect((await read(t.delivered[0]!.blob!)).text.split('\r\n').length).toBe(27);
    expect(canExport.mock.calls[0]![0]).toMatchObject({ count: 25, server: { params: {}, zone: 'Africa/Algiers', key: expect.any(String) } });
    expect(t.exportEvents().at(-1)).toMatchObject({ via: 'browser' });
  });
});

describe('the download (no deliver)', () => {
  it('a detached <a download> clicked once, removed, its object URL revoked after 60 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const URLs = window.URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    URLs.createObjectURL ??= () => '';
    URLs.revokeObjectURL ??= () => {};
    const create = vi.spyOn(URLs, 'createObjectURL').mockReturnValue('blob:x/1');
    const revoke = vi.spyOn(URLs, 'revokeObjectURL').mockImplementation(() => {});
    const clicks: { href: string; download: string; inPage: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push({ href: this.href, download: this.download, inPage: this.isConnected }); });
    const t = xmake({ rows: THREE, feature: csvExport({ canExport: true, fileName: () => 'f', loadRun: () => import('../src/export/run/index.js') }) });
    const p = t.feature.run();
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBe('done');
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(clicks).toEqual([{ href: 'blob:x/1', download: 'f.csv', inPage: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:x/1');
  });
  it('a deliver that throws fails (stage download)', async () => {
    const t = xmake({ rows: THREE, options: { deliver: () => { throw new TypeError('no'); } } });
        expect(await run(t)).toBe('failed');
    expect(t.exportEvents().at(-1)).toMatchObject({ failure: { stage: 'download', name: 'TypeError' } });
  });
});

describe('the bundles', () => {
  it('the count in the base bundle’s plural forms (announce.rows): Arabic’s six, French’s own words', async () => {
    expect(AR_EXPORT.text['announce.exportDone']).toBe('تم التصدير. {rows}');
    const t = xmake({ rows: THREE, lang: 'fr' });
    await run(t);
    expect(t.said().at(-1)).toBe('Exporté. 3 lignes');
    const a = xmake({ rows: THREE, lang: 'ar' });
    await run(a);
    expect(a.said().at(-1)).toBe('تم التصدير. 3 صفوف');
    expect(BUNDLES.ar.text['announce.exportRefused']).toBe('التصدير غير مسموح به');
  });
});
