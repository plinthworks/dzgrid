// The block's far corner against the release point: many release heights, the page scrolled or not, a retina scale, fast or slow moves, near the body's bottom (auto-scroll).
import { browser } from '../kit.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('./results/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await browser('chrome');
const bad = []; let n = 0;
try {
  for (const dsf of [1, 2]) for (const vh of [900, 700]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: vh }, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:4700/orders-edit.html?focus=range');
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    for (const sy of [0, 150]) for (const steps of [1, 5, 20]) for (const target of [3, 6, 9, 12]) for (const dy of [-14, -8, 0, 8, 14]) {
      await page.keyboard.press('Escape');
      await page.evaluate((sy) => { scrollTo(0, sy); document.querySelector('.dzg-viewport').scrollTop = 0; }, sy);
      await page.waitForTimeout(60);
      const geo = await page.evaluate((target) => {
        const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
        const pick = (i, col) => { const r = rows.find((x) => x.querySelector('[data-col="ref"]')?.textContent === `O-${String(i).padStart(4, '0')}`); const c = r?.querySelector(`[data-col="${col}"]`)?.getBoundingClientRect(); return c && { x: c.left + c.width / 2, y: c.top + c.height / 2 }; };
        return { a: pick(1, 'client'), z: pick(target, 'qty') };
      }, target);
      if (!geo.a || !geo.z || geo.z.y + dy > vh - 1) continue;
      await page.mouse.move(geo.a.x, geo.a.y); await page.mouse.down();
      await page.mouse.move(geo.z.x, geo.z.y + dy, { steps });
      const under = await page.evaluate(([x, y]) => { const c = document.elementFromPoint(x, y)?.closest('.dzg-cell'); return c && `${c.closest('.dzg-row').querySelector('[data-col="ref"]').textContent}/${c.dataset.col}`; }, [geo.z.x, geo.z.y + dy]);
      await page.mouse.up(); await page.waitForTimeout(80);
      const s = await page.evaluate(() => { const a = document.activeElement; const r = a.closest('.dzg-row'); const cs = [...document.querySelectorAll('.dzg-cell--range')]; const refs = cs.map((c) => c.closest('.dzg-row').querySelector('[data-col="ref"]').textContent).sort(); return { focus: r && `${r.querySelector('[data-col="ref"]').textContent}/${a.dataset.col}`, last: refs.at(-1), vtop: document.querySelector('.dzg-viewport').scrollTop }; });
      n++;
      const ok = s.focus === under && s.last === under?.split('/')[0];
      if (!ok) bad.push({ dsf, vh, sy, steps, target, dy, under, ...s });
    }
    await ctx.close();
  }
} finally { await b.close(); }
const res = { tried: n, mismatches: bad.length, bad: bad.slice(0, 40) };
writeFileSync(`${OUT}corner.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
