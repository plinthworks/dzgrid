// A full reload with rows compared by value flashes only what changed (motion.md « After a full reload »,
// row-identity-transactions.md « Rows compared by value », step 16e). Expectations by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { gsap } from 'gsap';
import { sameValues } from '@dzgrid/core/compare';
import { motion } from '../src/motion-gsap.js';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { clock, media, mount, stubMedia, type Made, type R } from './support-motion.js';

let made: Made[] = [];
beforeEach(() => {
  media.reduce = false;
  clock.now = 1000;
  stubMedia();
  gsap.ticker.lagSmoothing(1, 0);
});
afterEach(() => {
  for (const m of made) m.g.destroy();
  made = [];
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  gsap.ticker.lagSmoothing(500, 33);
  vi.restoreAllMocks();
});

// The owner's tree screen's shape: categories (path fillers) over rows, all open.
const ROWS: R[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, n: i, s: `s${i}` }));
const copy = (rows: R[]): R[] => JSON.parse(JSON.stringify(rows));
async function grid(same: boolean) {
  const m = motion({ gsap });
  const g = mount({
    rows: ROWS, messages: { ...EN, text: { ...EN.text, ...EN_TREE.text, ...EN_PAGINATION.text } },
    features: [tree<R>({ path: (r) => [`cat${r.n % 3}`, r.id], initial: 'all' }), m], ...(same && { sameRow: sameValues }),
  }, { block: 1200 });
  made.push(g);
  await m.load();
  clock.now += 1000;
  return g;
}
const flashed = (g: Made) => [...g.root.querySelectorAll('.dzg-flash')].map((c) => `${c.closest('.dzg-row')!.querySelector('[data-col="id"]')?.textContent}/${(c as HTMLElement).dataset['col']}`);

describe('sameRow: a full reload flashes only the changed cells', () => {
  it('every row a new copy, one value changed: exactly one dzg-flash cell', async () => {
    const g = await grid(true);
    const next = copy(ROWS);
    next[5]!.s = 'changed';
    g.g.update({ rows: next });
    g.frame();
    expect(flashed(g)).toEqual(['r5/s']);
  });

  it('without sameRow the same reload is a reset: nothing flashes', async () => {
    const g = await grid(false);
    const next = copy(ROWS);
    next[5]!.s = 'changed';
    g.g.update({ rows: next });
    g.frame();
    expect(flashed(g)).toEqual([]);
  });
});
