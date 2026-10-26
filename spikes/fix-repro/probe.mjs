import { browser } from '../kit.mjs';
const b = await browser('chrome');
try {
  const page = await b.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:4700/orders-edit.html?focus=range');
  await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
  const info = await page.evaluate(() => {
    const hdr = [...document.querySelectorAll('.dzg-header .dzg-hcell')].map((h) => [h.dataset.col, h.textContent.trim(), Math.round(h.getBoundingClientRect().left), Math.round(h.getBoundingClientRect().right)]);
    const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')].slice(0, 12).map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), [...r.querySelectorAll('.dzg-cell')].map((c) => c.textContent).join(' | ')]; });
    const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
    return { hdr, rows, vp: [vp.top, vp.bottom], hb: document.querySelector('.dzg-header').getBoundingClientRect().bottom, scrollY: scrollY, docH: document.documentElement.scrollHeight };
  });
  console.log(JSON.stringify(info, null, 1));
} finally { await b.close(); }
