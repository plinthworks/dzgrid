import { describe, it, expect } from 'vitest';
import { localeCtx } from '@dzgrid/core';
import { toCsv } from '@dzgrid/core/csv';
import { wallWriter } from '../../src/csv/wall.js';
import { mulberry32 } from '../support/rng.js';
import { grid } from './support.js';

/** Independent oracle: Intl.DateTimeFormat in the zone, h23, seconds; never the code's offsetAt. */
const fmts = new Map<string, Intl.DateTimeFormat>();
function oracle(ms: number, zone: string): string {
  let f = fmts.get(zone);
  if (!f) fmts.set(zone, (f = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', era: 'short' })));
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(Math.floor(ms / 1000) * 1000)) p[x.type] = x.value;
  return `${p.year!.padStart(4, '0')}-${p.month}-${p.day} ${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}:${p.second}`;
}
const ZONES = [
  'UTC', 'Africa/Algiers', 'Europe/Paris', 'Europe/Dublin', 'Europe/London', 'Europe/Amsterdam', 'America/New_York', 'America/St_Johns',
  'America/Santiago', 'America/Sao_Paulo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Tehran', 'Asia/Riyadh', 'Australia/Eucla', 'Australia/Adelaide',
  'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Apia', 'Pacific/Kiritimati', 'Africa/Casablanca', 'Antarctica/Troll', 'America/Caracas', 'Asia/Pyongyang',
];
const Y = 365.2425 * 86_400_000;
const T1900 = -70 * Y;

/** Transitions of a zone between 1900 and 2040, to the second (a probe every 2 days, then bisection). */
function transitions(zone: string, max = 40): number[] {
  const out: number[] = [];
  const key = (t: number) => {
    // the offset, by an independent route: wall text minus the instant
    const w = oracle(t, zone);
    const [d, h] = w.split(' ');
    const [y, mo, da] = d!.split('-').map(Number);
    const [hh, mi, ss] = h!.split(':').map(Number);
    return Date.UTC(y!, mo! - 1, da!, hh!, mi!, ss!) - Math.floor(t / 1000) * 1000;
  };
  const step = 2 * 86_400_000;
  let t = T1900;
  let k = key(t);
  const end = 70 * Y;
  while (t < end) {
    const n = t + step;
    const kn = key(n);
    if (kn !== k) {
      let lo = t, hi = n;
      while (hi - lo > 1000) {
        const m = Math.floor((lo + hi) / 2000) * 1000;
        if (key(m) === k) lo = m; else hi = m;
      }
      out.push(hi);
    }
    t = n;
    k = kn;
  }
  // keep the oldest few, the newest, and a spread
  if (out.length <= max) return out;
  const pick = new Set<number>();
  for (let i = 0; i < max; i++) pick.add(out[Math.floor((i * (out.length - 1)) / (max - 1))]!);
  return [...pick];
}

describe('wall time vs Intl (independent oracle)', () => {
  for (const zone of ZONES) {
    it(`${zone}: random instants 1900-2100 and every second around transitions`, () => {
      const r = mulberry32(zone.length * 131 + zone.charCodeAt(1));
      const w = wallWriter(zone);
      const bad: string[] = [];
      const check = (ms: number) => {
        const got = w(ms);
        const want = oracle(ms, zone);
        if (got !== want && bad.length < 5) bad.push(`${new Date(ms).toISOString()} got ${got} want ${want}`);
      };
      for (let i = 0; i < 1500; i++) check(T1900 + r() * 200 * Y + Math.floor(r() * 1000));
      for (const t of transitions(zone)) {
        for (const d of [-7_200_000, -3_600_000, -1_801_000, -1000, -1, 0, 1, 999, 1000, 1_800_000, 3_600_000, 21_599_000]) check(t + d);
        // the six-hour block the transition is in: its first and last second, and random seconds within
        const b = Math.floor(t / 21_600_000) * 21_600_000;
        check(b); check(b + 21_599_000); check(b - 1000); check(b + 21_600_000);
        for (let i = 0; i < 8; i++) check(b + Math.floor(r() * 21_600) * 1000);
      }
      expect(bad).toEqual([]);
    });
  }
  it('one writer reused across zones of calls in any order gives the same as a fresh one per call', () => {
    const r = mulberry32(99);
    const zone = 'Australia/Lord_Howe';
    const shared = wallWriter(zone);
    for (let i = 0; i < 2000; i++) {
      const ms = 30 * Y + r() * 30 * Y;
      expect(shared(ms)).toBe(wallWriter(zone)(ms));
    }
  });
  it('through toCsv: a 45-minute zone and a 30-minute DST zone', () => {
    for (const zone of ['Pacific/Chatham', 'Australia/Lord_Howe', 'Asia/Kathmandu']) {
      const ctx = localeCtx({ locale: 'en-US', timeZone: zone });
      const ms = [Date.UTC(2024, 3, 6, 15, 0, 0), Date.UTC(2024, 3, 6, 14, 59, 59), Date.UTC(1986, 0, 1, 0, 0, 0), Date.UTC(2024, 9, 5, 15, 30, 0)];
      const g = grid([{ id: 't', header: 'T', type: 'instant' as const }], ms.map((t) => ({ t })), ctx);
      const text = toCsv({ rows: g.model.displayed, columns: g.columns, ctx }, { bom: false });
      expect(text).toBe(`T (${zone})\r\n` + ms.map((t) => oracle(t, zone) + '\r\n').join(''));
    }
  });
});
