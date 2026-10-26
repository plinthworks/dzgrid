// The four ways to fill give one result (Phase 5 step 12, step12-plan.md tests 2; owner « Step 12 »): for random
// (source, cell to fill to, swap) the handle's drag, the keyboard fill mode (arrows to the same cell, Enter or
// Ctrl+Enter), the no-drag click-then-click and `api.fill(to)` each give the same save request (deep-equal), the same
// sentence and the same block after — left to right and right to left (the same logical cell reached by mirrored
// arrows and by a drag toward the screen's other side).
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey } from '@dzgrid/core';
import { cleanup, flush, fmake } from './support-fill.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

// The visible columns in their order (the keys' arrows count them): `ref` read-only, `at` an instant.
const COLS = ['name', 'qty', 'price', 'day', 'at', 'st', 'ok', 'code', 'ref'];
const WAYS = ['api', 'drag', 'keys', 'pick'] as const;

function rng(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a % n;
  };
}

async function one(way: (typeof WAYS)[number], lang: 'en' | 'ar', s: { r0: number; r1: number; c0: number; c1: number; tr: number; tc: number; swap: boolean }) {
  const t = fmake({ lang, block: 2000 });
  const [a, b] = [`r${s.r0}`, `r${s.r1}`];
  t.at(a, COLS[s.c0]!);
  if (s.r0 !== s.r1 || s.c0 !== s.c1) t.api().set(R_([a, COLS[s.c0]!], [b, COLS[s.c1]!]));
  const to = [`r${s.tr}`, COLS[s.tc]!] as [string, string];
  if (way === 'api') t.fapi().fill({ row: dataKey(to[0])!, column: to[1] }, { swap: s.swap });
  if (way === 'drag') t.dragTo(...to, { ctrl: s.swap });
  if (way === 'pick') t.pickTo(...to, { ctrl: s.swap });
  if (way === 'keys') {
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    const end = Math.max(s.c0, s.c1);
    for (let i = Math.max(s.r0, s.r1); i !== s.tr; i += Math.sign(s.tr - i)) t.press(s.tr > i ? 'ArrowDown' : 'ArrowUp');
    for (let i = end; i !== s.tc; i += Math.sign(s.tc - i)) t.press((s.tc > i) !== (lang === 'ar') ? 'ArrowRight' : 'ArrowLeft');
    t.press('Enter', s.swap ? { ctrlKey: true } : {});
  }
  await flush();
  const out = { req: t.requests.map((r) => ({ origin: r.origin, changes: r.changes.map((c) => [String(c.key), c.column, c.value]) })), said: t.said().filter((x) => /filled|التعبئة: \d/.test(x)), block: t.block() };
  cleanup();
  return out;
}

describe('the four ways (drag, keys, no-drag click, API) give one result', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: 60 random fills`, async () => {
      const r = rng(lang === 'en' ? 7 : 11);
      let filled = 0;
      for (let i = 0; i < 60; i++) {
        const r0 = 2 + r(10), c0 = r(COLS.length - 1);
        const s = { r0, r1: r0 + r(3), c0, c1: Math.min(COLS.length - 1, c0 + r(3)), tr: r(18), tc: r(COLS.length), swap: r(3) === 0 };
        const outs = [];
        for (const way of WAYS) outs.push(await one(way, lang, s));
        for (let w = 1; w < WAYS.length; w++) expect(outs[w], `${JSON.stringify(s)} ${WAYS[w]} vs api`).toEqual(outs[0]);
        if (outs[0]!.req.length) filled++;
      }
      expect(filled).toBeGreaterThan(20);
    }, 120_000);
  }
});
