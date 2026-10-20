// GSAP not installed (step 26; docs/behaviors/motion.md): the grid works without motion and tells one
// problem; nothing throws.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { motion } from '../src/motion-gsap.js';
import { mount, stubMedia, type R } from './support-motion.js';

vi.mock('gsap', () => {
  throw new Error("Cannot find package 'gsap'");
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('without GSAP', () => {
  it('tells missing-feature (features.motion, gsap) once per grid; the grid sorts and paints as without motion', async () => {
    stubMedia();
    const m = motion();
    const events: GridEvent<R>[] = [];
    const g = mount({ features: [m], onEvent: (e) => events.push(e) });
    expect(await m.load()).toBe(false);
    expect(await m.load()).toBe(false);
    const problems = events.flatMap((e) => (e.type === 'problems' ? e.problems : [])) as Problem[];
    expect(problems.filter((p) => p.path === 'features.motion')).toEqual([{ code: 'missing-feature', severity: 'error', path: 'features.motion', detail: 'gsap' }]);
    g.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    g.frame();
    expect(g.host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="id"]')!.textContent).toBe('r1');
    g.g.destroy();
  });
});
