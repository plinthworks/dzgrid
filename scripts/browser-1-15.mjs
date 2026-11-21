/**
 * 1.15.0's `sortMark: 'always'` in real browsers (owner 2026-11-21 « ★ partout »; presentation-settings.md 49): the
 * playground page `v1-15.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — a search box as a header part
 * on « shop », the kept mark without a part on « town », a plain column « sales ». Chrome, Firefox and WebKit one after
 * another, each closed in a `finally`; French left to right and Arabic right to left. `--engine chrome|firefox|webkit`.
 * - one mark beside the part: a button, 24 px at least, inside its header and clear of the resize grip, its arrow drawn, named in the page's
 *   language; the plain column shows none until sorted;
 * - a real click on it sorts ascending, descending, none, `aria-sort` on the header; typing in the part does not sort;
 * - keys: Enter into the part, Tab to the button (its ring drawn), Enter and Space sort, Escape back to the header,
 *   Shift+Enter on the header adds to the sort (Shift+click on the button too);
 * - right to left: the button on the part's left, left to right on its right.
 */
import { browser } from '../spikes/kit.mjs';

const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const HEAD = (c) => `.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`;
const HEADS = { shop: HEAD('shop'), town: HEAD('town'), sales: HEAD('sales') };
const sortOf = (page) => page.evaluate(() => JSON.stringify(window.grid.context.kernel.query.sort.map((s) => `${s.column}:${s.dir}`)));

for (const name of engines) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      const tag = `${name} ${lang}`;
      const ctx = await B.newContext({ viewport: { width: 1000, height: 640 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${base}/v1-15.html${lang === 'ar' ? '?lang=ar' : ''}`);
      await page.waitForSelector(`${HEAD('shop')} input.search`);
      await frames(page);

      const facts = await page.evaluate((sel) => {
        const head = document.querySelector(sel.shop);
        const marks = head.querySelectorAll(':scope > .dzg-sort');
        const b = marks[0];
        const r = b?.getBoundingClientRect(), h = head.getBoundingClientRect(), i = head.querySelector('input').getBoundingClientRect();
        return {
          count: marks.length, tag: b?.tagName, type: b?.type, name: b?.getAttribute('aria-label'), tab: b?.tabIndex,
          w: r?.width, hgt: r?.height, inside: r && r.left >= h.left - 0.5 && r.right <= h.right + 0.5,
          arrow: b && getComputedStyle(b, '::before').content, grip: (() => { const g = head.querySelector(':scope > .dzg-resize').getBoundingClientRect(); return r && (r.right <= g.left + 0.5 || r.left >= g.right - 0.5); })(), beforeInput: r && r.right <= i.left + 0.5, afterInput: r && r.left >= i.right - 0.5,
          town: document.querySelector(sel.town).querySelectorAll(':scope > button.dzg-sort').length,
          sales: document.querySelector(sel.sales).querySelectorAll(':scope > .dzg-sort').length,
        };
      }, HEADS);
      check(`${tag}: one mark beside the part, a button`, facts.count === 1 && facts.tag === 'BUTTON' && facts.type === 'button', JSON.stringify(facts));
      check(`${tag}: named in the page's language`, facts.name === (lang === 'ar' ? 'الترتيب حسب متجر' : 'Trier par Boutique'), facts.name);
      check(`${tag}: out of the Tab order at rest`, facts.tab === -1);
      check(`${tag}: a 24 px target, inside its header`, facts.w >= 23.5 && facts.hgt >= 23.5 && facts.inside, `${facts.w}×${facts.hgt}`);
      check(`${tag}: clear of the resize grip`, facts.grip);
      check(`${tag}: the two-way arrow drawn unsorted`, /⇅/.test(facts.arrow ?? ''), facts.arrow);
      check(`${tag}: at the header's logical end`, lang === 'ar' ? facts.beforeInput : facts.afterInput);
      check(`${tag}: the kept mark without a part, a button too; none on the plain column`, facts.town === 1 && facts.sales === 0);

      // A real click, three times; aria-sort on the header.
      const button = page.locator(`${HEAD('shop')} > button.dzg-sort`);
      const ariaSort = () => page.locator(HEAD('shop')).getAttribute('aria-sort');
      await button.click();
      await frames(page);
      const s1 = await sortOf(page), a1 = await ariaSort();
      await button.click();
      await frames(page);
      const s2 = await sortOf(page), a2 = await ariaSort();
      await button.click();
      await frames(page);
      const s3 = await sortOf(page), a3 = await ariaSort();
      check(`${tag}: a click sorts ascending, descending, none`, s1 === '["shop:asc"]' && s2 === '["shop:desc"]' && s3 === '[]', `${s1} ${s2} ${s3}`);
      check(`${tag}: aria-sort on the header follows`, a1 === 'ascending' && a2 === 'descending' && a3 === null, `${a1} ${a2} ${a3}`);
      await page.locator(`${HEAD('shop')} input.search`).click();
      await page.keyboard.type('1');
      await page.waitForTimeout(400);
      check(`${tag}: typing in the part filters, never sorts`, (await sortOf(page)) === '[]');
      await page.locator(`${HEAD('shop')} input.search`).fill('');
      await page.waitForTimeout(400);

      // Keys: from the header, Enter into the part, Tab to the button, Enter / Space / Shift+Enter, Escape out.
      await page.evaluate((sel) => {
        const g = window.grid.context;
        g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'shop' } }, 'user');
        document.querySelector(sel.shop).focus();
      }, HEADS);
      await frames(page);
      await page.keyboard.press('Enter');
      const inInput = await page.evaluate(() => document.activeElement?.classList.contains('search'));
      await page.keyboard.press('Tab');
      const onButton = await page.evaluate(() => document.activeElement?.matches('button.dzg-sort'));
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
      check(`${tag}: Enter into the part, Tab to the button`, inInput && onButton, `${inInput} ${onButton}`);
      check(`${tag}: its focus ring drawn`, /^solid 2px$/.test(ring), ring);
      await page.keyboard.press('Enter');
      await frames(page);
      const k1 = await sortOf(page);
      await page.keyboard.press('Space');
      await frames(page);
      const k2 = await sortOf(page);
      check(`${tag}: Enter then Space on it sort, once each`, k1 === '["shop:asc"]' && k2 === '["shop:desc"]', `${k1} ${k2}`);
      const still = await page.evaluate(() => document.activeElement?.matches('button.dzg-sort'));
      check(`${tag}: the focus stays on the button after a sort`, still);
      await page.keyboard.press('Escape');
      const back = await page.evaluate((sel) => document.activeElement === document.querySelector(sel.shop), HEADS);
      const tabOut = await button.evaluate((b) => b.tabIndex);
      check(`${tag}: Escape back to the header, the button out of the Tab order again`, back && tabOut === -1, `${back} ${tabOut}`);
      // Adding to the sort by keyboard: Shift+Enter on the header (a part's header too); Shift+click on the button.
      await page.evaluate(() => window.grid.context.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'sales', dir: 'asc' }] }, 'api'));
      await frames(page);
      await page.keyboard.press('Shift+Enter');
      await frames(page);
      const k3 = await sortOf(page);
      const num = await button.textContent();
      check(`${tag}: Shift+Enter on the header adds to the sort, its precedence shown`, k3 === '["sales:asc","shop:asc"]' && num.length > 0, `${k3} «${num}»`);
      await button.click({ modifiers: ['Shift'] });
      await frames(page);
      check(`${tag}: Shift+click on the button turns its part of the sort`, (await sortOf(page)) === '["sales:asc","shop:desc"]', await sortOf(page));
      check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
      await page.close();
      await ctx.close();
    }
  } finally {
    await B.close();
  }
}
console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
