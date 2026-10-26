// The two sweep mismatches again (page scrolled 150 px, release in the body's bottom band): what is under the pointer before and after the release.
import { browser } from '../kit.mjs';
const b = await browser('chrome');
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 700 } });
  await page.goto('http://127.0.0.1:4700/orders-edit.html?focus=range');
  await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
  await page.evaluate(() => scrollTo(0, 150)); await page.waitForTimeout(100);
  const at = (x, y) => page.evaluate(([x, y]) => { const c = document.elementFromPoint(x, y)?.closest('.dzg-cell'); return c && `${c.closest('.dzg-row').querySelector('[data-col="ref"]').textContent}/${c.dataset.col}`; }, [x, y]);
  const geo = await page.evaluate(() => { const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')]; const p = (i, col) => { const c = rows.find((x) => x.querySelector('[data-col="ref"]')?.textContent === `O-${String(i).padStart(4, '0')}`).querySelector(`[data-col="${col}"]`).getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }; const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); return { a: p(1, 'client'), z: p(12, 'qty'), vb: v.bottom, hb: document.querySelector('.dzg-header').getBoundingClientRect().bottom }; });
  const y = geo.z.y + 14;
  console.log({ y, viewportBottom: geo.vb, window: 700 });
  await page.mouse.move(geo.a.x, geo.a.y); await page.mouse.down();
  await page.mouse.move(geo.z.x, y, { steps: 20 });
  const log = [];
  for (let i = 0; i < 6; i++) { log.push({ t: i * 50, under: await at(geo.z.x, y), vtop: await page.evaluate(() => document.querySelector('.dzg-viewport').scrollTop), corner: await page.evaluate(() => { const cs = [...document.querySelectorAll('.dzg-cell--range')]; return cs.map((c) => c.closest('.dzg-row').querySelector('[data-col="ref"]').textContent).sort().at(-1); }) }); await page.waitForTimeout(50); }
  await page.mouse.up(); await page.waitForTimeout(100);
  log.push({ after: true, under: await at(geo.z.x, y), focus: await page.evaluate(() => { const a = document.activeElement; return `${a.closest('.dzg-row').querySelector('[data-col="ref"]').textContent}/${a.dataset.col}`; }) });
  console.log(JSON.stringify(log, null, 1));
} finally { await b.close(); }
