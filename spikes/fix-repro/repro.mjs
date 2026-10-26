// `node repro.mjs old` puts back the 0.3.0 hit box (24 px) by a style in the page, for the « before » evidence.
// Reproduces the owner's report on the live playground with real mouse events (headless Chrome). No writes are saved anywhere but the page.
import { browser } from '../kit.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('./results/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const b = await browser('chrome');
const log = {};
try {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  const go = async () => { await page.goto('http://127.0.0.1:4700/orders-edit.html?focus=range'); await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 }); if (process.argv[2] === 'old') await page.addStyleTag({ content: '.dzg-fill { inline-size: 24px !important; block-size: 24px !important; }' }); await page.waitForTimeout(300); };
  const cell = (ref, col) => page.evaluate(([ref, col]) => { const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }, [ref, col]);
  const state = () => page.evaluate(() => { const a = document.activeElement; const row = a.closest('.dzg-row'); const fh = document.querySelector('.dzg-fill'); return { focus: row && `${row.querySelector('[data-col="ref"]').textContent}/${a.dataset.col}`, block: [...document.querySelectorAll('.dzg-cell--range')].length, handleAt: fh && `${fh.closest('.dzg-row').querySelector('[data-col="ref"]').textContent}/${fh.closest('.dzg-cell').dataset.col}`, rows: [...document.querySelectorAll('.dzg-layer > .dzg-row')].slice(0, 10).map((r) => [...r.querySelectorAll('.dzg-cell')].map((c) => c.textContent).slice(0, 6).join(' | ')) }; });
  // A: a plain block drag Client O-0001 -> Qté O-0007, 10 steps.
  await go();
  let a = await cell('O-0001', 'client'), z = await cell('O-0007', 'qty');
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(z.x, z.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
  log.A_dragBlock = await state();
  // B: the owner's next move: press inside the corner cell (14 px from its bottom-right corner), drag down one row.
  z = await cell('O-0007', 'qty'); const n = await cell('O-0008', 'qty');
  await page.mouse.move(z.r - 14, z.b - 14); await page.mouse.down(); await page.mouse.move(n.x, n.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  log.B_pressInsideCornerThenDown = await state();
  await page.screenshot({ path: `${OUT}B-${process.argv[2] ?? 'now'}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  log.B_escape = await state();
  // C: block drag released near the cell's lower-right (where the handle sits for one cell already focused).
  await go();
  a = await cell('O-0005', 'amount');
  await page.mouse.click(a.x, a.y); await page.waitForTimeout(100);
  const e = await cell('O-0009', 'amount');
  await page.mouse.move(a.r - 16, a.b - 16); await page.mouse.down(); await page.mouse.move(e.x, e.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  log.C_clickThenPressNearCornerAmount = await state();
  await page.screenshot({ path: `${OUT}C-${process.argv[2] ?? 'now'}.png` });
} finally { await b.close(); }
writeFileSync(`${OUT}repro-${process.argv[2] ?? 'now'}.json`, JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
