// Checks the kit itself: the core loads in each engine and gives the same bounds.
import { serve, browser, record } from '../kit.mjs';

const site = await serve(import.meta.url);
const out = {};
for (const name of ['chrome', 'firefox', 'webkit']) {
  const b = await browser(name);
  const page = await b.newPage();
  await page.goto(site.url());
  await page.waitForFunction(() => window.result);
  out[name] = await page.evaluate(() => window.result);
  await b.close();
}
await site.close();
record(import.meta.url, { apia: out });
