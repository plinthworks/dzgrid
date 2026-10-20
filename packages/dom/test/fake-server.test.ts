// The audit screen's fake server (step 18, docs/behaviors/audit-screen.md): rows computed from
// their index, the wire filters, the search, the sort by arithmetic, pages and the fetched set,
// the value list, the scan cap, and its two modes (timers, hold) with the signal and the log.
// Expectations by hand, from the formulas in the sheet.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { DataRequest, DataResponse, ValuesRequest } from '@dzgrid/core/server';
import { ACTIONS, ACTORS, auditRow, createFakeServer, type AuditRow, type FakeServerOptions } from '../../../perf/fake-server.js';

afterEach(() => void vi.useRealTimers());

const req = (o: Partial<DataRequest> = {}, ac = new AbortController()): DataRequest => ({ params: {}, zone: 'Africa/Algiers', key: o.key ?? 'k', signal: ac.signal, ...o });
const vreq = (o: Partial<ValuesRequest> = {}, ac = new AbortController()): ValuesRequest => ({ column: 'resource', search: '', limit: 2000, params: {}, zone: 'Africa/Algiers', key: 'v', signal: ac.signal, ...o });
const page = (offset: number, size: number) => ({ index: Math.floor(offset / size), size, offset, cursor: null });
const ids = (r: DataResponse<AuditRow>) => r.rows.map((x) => x.id);
const server = (o: Partial<FakeServerOptions> = {}) => createFakeServer({ universe: 300, mode: 'timers', latency: 0, ...o });
const fetchNow = async (o: Partial<FakeServerOptions>, r: DataRequest) => (await server(o).source.fetch(r)) as DataResponse<AuditRow>;

describe('rows computed from the index', () => {
  it('row 0 is the newest event, time falls by 37 s a row, the day is Algiers time', () => {
    const r0 = auditRow(0);
    expect(r0).toMatchObject({ id: 'e0', occurredAt: '2026-10-20T12:00:00.000Z', day: '2026-10-20', resource: null, outcome: true, durationMs: 0 });
    expect(auditRow(1).occurredAt).toBe('2026-10-20T11:59:23.000Z');
    // 23:00:32 UTC on the 19th is 00:00:32 in Algiers on the 20th; 37 s more is 23:59:55 on the 19th.
    expect(auditRow(1264)).toMatchObject({ occurredAt: '2026-10-19T23:00:32.000Z', day: '2026-10-20' });
    expect(auditRow(1265)).toMatchObject({ occurredAt: '2026-10-19T22:59:55.000Z', day: '2026-10-19' });
  });

  it('actor i mod 97 (every seventh in Arabic), action (i·7) mod 12, resource, outcome and duration from i', () => {
    expect(ACTORS).toHaveLength(97);
    expect(new Set(ACTORS).size).toBe(97);
    expect(ACTIONS).toHaveLength(12);
    expect(ACTORS.filter((a) => /[؀-ۿ]/.test(a))).toHaveLength(14);
    expect(/[؀-ۿ]/.test(ACTORS[0]!) && /[؀-ۿ]/.test(ACTORS[7]!) && !/[؀-ۿ]/.test(ACTORS[1]!)).toBe(true);
    expect(auditRow(98).actor).toBe(ACTORS[1]);
    expect(auditRow(1).action).toBe(ACTIONS[7]);
    expect(auditRow(2).action).toBe(ACTIONS[2]);
    expect(auditRow(1)).toMatchObject({ resource: 'ordonnance-1919', durationMs: 2920, outcome: true });
    expect(auditRow(2)).toMatchObject({ resource: 'compte-1838', durationMs: 841 });
    expect(auditRow(3).outcome).toBe(false);
    expect(auditRow(101).resource).toBeNull();
    // 2 000 resources, each once in 2 000 consecutive rows; a blank every 101 rows.
    expect(new Set(Array.from({ length: 2000 }, (_, i) => auditRow(i * 101 + 1).resource)).size).toBe(2000);
    expect(new Set(Array.from({ length: 4000 }, (_, i) => auditRow(i).resource)).size).toBe(2001);
  });
});

describe('server pages (configuration B)', () => {
  it('the first page in index order, hasNext, no total unless asked', async () => {
    const r = await fetchNow({}, req({ page: page(0, 3) }));
    expect(ids(r)).toEqual(['e0', 'e1', 'e2']);
    expect(r.hasNext).toBe(true);
    expect('total' in r).toBe(false);
    const t = await fetchNow({ total: true }, req({ page: page(297, 3) }));
    expect(ids(t)).toEqual(['e297', 'e298', 'e299']);
    expect(t).toMatchObject({ total: 300, hasNext: false });
  });

  it('occurredAt ascending is the index backwards', async () => {
    const r = await fetchNow({ universe: 10 }, req({ page: page(0, 2), sort: [{ column: 'occurredAt', dir: 'asc' }] }));
    expect(ids(r)).toEqual(['e9', 'e8']);
    const d = await fetchNow({ universe: 10 }, req({ page: page(8, 2), sort: [{ column: 'occurredAt', dir: 'desc' }] }));
    expect(ids(d)).toEqual(['e8', 'e9']);
    expect(d.hasNext).toBe(false);
  });

  it('a text filter (folded), then the page of its matches, total counted', async () => {
    const who = ACTORS[5]!;
    const all = await fetchNow({ total: true }, req({ filter: { actor: { type: 'text', op: 'equals', value: who.toUpperCase() } }, page: page(0, 10) }));
    expect(ids(all)).toEqual(['e5', 'e102', 'e199', 'e296']);
    expect(all.total).toBe(4);
    const p = await fetchNow({}, req({ filter: { actor: { type: 'text', op: 'equals', value: who } }, page: page(2, 2) }));
    expect(ids(p)).toEqual(['e199', 'e296']);
    expect(p.hasNext).toBe(false);
    const q = await fetchNow({}, req({ filter: { actor: { type: 'text', op: 'equals', value: who } }, page: page(0, 3) }));
    expect(q.hasNext).toBe(true);
  });

  it('number, set (include, exclude, blanks), boolean and combined filters', async () => {
    const f = async (filter: DataRequest['filter']) => ids(await fetchNow({ universe: 12 }, req({ filter, page: page(0, 50) })));
    expect(await f({ durationMs: { type: 'number', op: 'lt', value: 900 } })).toEqual(['e0', 'e2', 'e7']);
    expect(await f({ durationMs: { type: 'number', op: 'between', value: 800, valueTo: 900 } })).toEqual(['e2']);
    expect(await f({ resource: { type: 'set', include: ['compte-1838', 'nothing'] } })).toEqual(['e2']);
    expect(await f({ resource: { type: 'set', include: ['compte-1838'], blanks: 'include' } })).toEqual(['e0', 'e2']);
    expect((await f({ resource: { type: 'set', exclude: ['compte-1838'] } })).includes('e2')).toBe(false);
    expect((await f({ resource: { type: 'set', exclude: [], blanks: 'exclude' } })).includes('e0')).toBe(false);
    expect(await f({ outcome: { type: 'boolean', value: false } })).toEqual(['e3']);
    expect(await f({ durationMs: { type: 'combined', join: 'or', conditions: [{ type: 'number', op: 'equals', value: 0 }, { type: 'number', op: 'equals', value: 841 }] } })).toEqual(['e0', 'e2']);
  });

  it('the search looks in actor, action and resource, folded', async () => {
    const r = await fetchNow({ universe: 12 }, req({ quick: 'COMPTE-1838', page: page(0, 50) }));
    expect(ids(r)).toEqual(['e2']);
  });

  it('a filtered query looks at the newest scanCap events only; an unfiltered one counts them all', async () => {
    const who = ACTORS[5]!;
    const r = await fetchNow({ universe: 1000, scanCap: 100, total: true }, req({ filter: { actor: { type: 'text', op: 'equals', value: who } }, page: page(0, 10) }));
    expect(ids(r)).toEqual(['e5']);
    expect(r.total).toBe(1);
    const all = await fetchNow({ universe: 1000, scanCap: 100, total: true }, req({ page: page(990, 10) }));
    expect(all.total).toBe(1000);
    expect(ids(all).at(-1)).toBe('e999');
  });

  it('ten million rows: a page is computed, never the universe', async () => {
    const t0 = performance.now();
    const r = await fetchNow({ universe: 10_000_000, total: true }, req({ page: page(9_999_990, 10), sort: [{ column: 'occurredAt', dir: 'asc' }] }));
    expect(ids(r)).toEqual(['e9', 'e8', 'e7', 'e6', 'e5', 'e4', 'e3', 'e2', 'e1', 'e0']);
    expect(r.total).toBe(10_000_000);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('the fetched set (configuration A)', () => {
  it('no page asked: every match, sorted by any column, nothing else said', async () => {
    const r = await fetchNow({ universe: 12, fetched: true }, req({ sort: [{ column: 'durationMs', dir: 'asc' }] }));
    expect(r.rows).toHaveLength(12);
    expect(ids(r).slice(0, 3)).toEqual(['e0', 'e7', 'e2']);
    const f = await fetchNow({ universe: 300, fetched: true }, req({ filter: { actor: { type: 'text', op: 'equals', value: ACTORS[5]! } } }));
    expect(ids(f)).toEqual(['e5', 'e102', 'e199', 'e296']);
  });
});

describe('the value list', () => {
  it('values of the rows the other filters and the search keep, with counts, in order, blanks apart', async () => {
    const s = server({ universe: 12 });
    const v = (await s.source.values!(vreq())) as unknown as { values: { value: string; label: string; count: number | null }[]; blanks: number; truncated: boolean };
    expect(v.blanks).toBe(1);
    expect(v.truncated).toBe(false);
    expect(v.values).toHaveLength(11);
    expect(v.values.find((x) => x.value === 'compte-1838')).toEqual({ value: 'compte-1838', label: 'compte-1838', count: 1 });
    const labels = v.values.map((x) => x.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    const n = (await s.source.values!(vreq({ filter: { durationMs: { type: 'number', op: 'lt', value: 900 } } }))) as unknown as { values: unknown[]; blanks: number };
    expect(n.values).toEqual([{ value: 'compte-1433', label: 'compte-1433', count: 1 }, { value: 'compte-1838', label: 'compte-1838', count: 1 }]);
    expect(n.blanks).toBe(1);
  });

  it('the search narrows, the limit truncates', async () => {
    const s = server({ universe: 4000 });
    const a = (await s.source.values!(vreq({ search: 'COMPTE-18' }))) as unknown as { values: { value: string }[] };
    expect(a.values.length).toBeGreaterThan(0);
    expect(a.values.every((x) => x.value.startsWith('compte-18'))).toBe(true);
    const t = (await s.source.values!(vreq({ limit: 10 }))) as unknown as { values: unknown[]; truncated: boolean };
    expect(t.values).toHaveLength(10);
    expect(t.truncated).toBe(true);
  });
});

describe('modes, the signal and the log', () => {
  it('timers: the latency, a seeded jitter, the failure rate, the next failure', async () => {
    vi.useFakeTimers();
    const s = server({ latency: 150 });
    let got: DataResponse<AuditRow> | null = null;
    void Promise.resolve(s.source.fetch(req({ page: page(0, 2) }))).then((r) => (got = r as DataResponse<AuditRow>));
    await vi.advanceTimersByTimeAsync(149);
    expect(got).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(got).not.toBeNull();
    const delays = (seed: number) => { const x = server({ latency: 100, jitter: 500, seed }); return [0, 1, 2].map(() => x.delay()); };
    expect(delays(7)).toEqual(delays(7));
    expect(delays(7)).not.toEqual(delays(8));
    expect(delays(7).every((d) => d >= 100 && d <= 600)).toBe(true);
    const bad = server({ failRate: 1 });
    await expect(Promise.all([bad.source.fetch(req({ page: page(0, 2) })), vi.advanceTimersByTimeAsync(1)])).rejects.toThrow(/fake server/);
    const once = server();
    once.failNext();
    await expect(Promise.all([once.source.fetch(req({ page: page(0, 2) })), vi.advanceTimersByTimeAsync(1)])).rejects.toThrow(/fake server/);
    await expect(Promise.all([once.source.fetch(req({ page: page(0, 2) })), vi.advanceTimersByTimeAsync(1)]).then(([r]) => ids(r as never))).resolves.toEqual(['e0', 'e1']);
    expect(once.log.map((e) => e.state)).toEqual(['failed', 'ok']);
  });

  it('hold: each request waits for release or fail, in any order; the log says what happened', async () => {
    const s = server({ mode: 'hold' });
    const a = Promise.resolve(s.source.fetch(req({ key: 'a', page: page(0, 2) })));
    const b = Promise.resolve(s.source.fetch(req({ key: 'b', page: page(2, 2) })));
    const v = Promise.resolve(s.source.values!(vreq()));
    expect(s.pending().map((e) => [e.seq, e.channel, e.key])).toEqual([[1, 'rows', 'a'], [2, 'rows', 'b'], [3, 'values:resource', 'v']]);
    expect(s.release(2)).toBe(true);
    expect(ids((await b) as never)).toEqual(['e2', 'e3']);
    expect(s.fail(1)).toBe(true);
    await expect(a).rejects.toThrow(/fake server/);
    expect(s.release(1)).toBe(false);
    s.release(3);
    await v;
    expect(s.log.map((e) => e.state)).toEqual(['failed', 'ok', 'ok']);
    expect(s.log[1]!.ids).toEqual(['e2', 'e3']);
    expect(s.log.every((e) => typeof e.settledAt === 'number')).toBe(true);
    expect(s.pending()).toEqual([]);
  });

  it('the signal honoured: an abort rejects with its reason at once, logged; ignored: the late answer still comes', async () => {
    const s = server({ mode: 'hold' });
    const ac = new AbortController();
    const a = Promise.resolve(s.source.fetch(req({ page: page(0, 2) }, ac)));
    ac.abort('superseded');
    await expect(a).rejects.toBe('superseded');
    expect(s.log[0]).toMatchObject({ state: 'aborted', abort: 'superseded' });
    expect(s.pending()).toEqual([]);
    const late = server({ mode: 'hold', honourSignal: false });
    const ac2 = new AbortController();
    const b = Promise.resolve(late.source.fetch(req({ page: page(0, 2) }, ac2)));
    ac2.abort('stale-epoch');
    expect(late.pending()).toHaveLength(1);
    expect(late.log[0]!.abort).toBe('stale-epoch');
    late.release(1);
    expect(ids((await b) as never)).toEqual(['e0', 'e1']);
    // Already aborted when it comes in: rejected at once.
    const ac3 = new AbortController();
    ac3.abort('destroyed');
    await expect(Promise.resolve(s.source.fetch(req({ page: page(0, 2) }, ac3)))).rejects.toBe('destroyed');
  });
});
