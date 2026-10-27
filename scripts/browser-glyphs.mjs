/**
 * Feedback pass A and G (docs/phase-6-steps/feedback-plan.md items 1 and 8): the grid's glyphs are text, never borders,
 * so an app's unlayered reset (Tailwind 3's preflight, `*,::before,::after{border-width:0;border-style:solid}`) can
 * erase none of them; the selection box's edge is an outline for the same reason. A stand-in reset is put in the page
 * (`reset=1`, before the grid's sheets) and each glyph is looked at in pixels: ink there, and pointing the right way
 * (the arrows are Bidi_Mirrored characters: right to left, the browser turns them).
 */
import { inflateSync } from 'node:zlib';
import { contrast, parseColor } from './check-contrast.mjs';

/** A PNG from Playwright (8-bit RGB or RGBA, not interlaced) as rows of [r, g, b]. */
export function decodePng(buf) {
  let at = 8;
  let w = 0, h = 0, type = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const kind = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') ((w = data.readUInt32BE(0)), (h = data.readUInt32BE(4)), (type = data[9]));
    else if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * stride + x] = (v + [0, a, b, (a + b) >> 1, pr][f]) & 255;
    }
  }
  return { w, h, px: (x, y) => [out[y * stride + x * bpp], out[y * stride + x * bpp + 1], out[y * stride + x * bpp + 2]] };
}

/**
 * The ink of an element's picture: pixels far from the background (its corner), their count, and which way a chevron
 * in it points. `x`: +1 when the ink of its middle rows lies right of the ink of its first and last rows (the apex of
 * a `›` is right of its arms' ends), -1 left (`‹`); `y`: +1 when the middle columns' ink lies under the first and last
 * columns' (a `›` turned down).
 */
export async function inkOf(handle) {
  const img = decodePng(await handle.screenshot({ animations: 'disabled' }));
  const bg = img.px(0, 0);
  const far = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 120;
  const pts = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (far(img.px(x, y))) pts.push([x, y]);
  const lean = (a, b) => {
    if (!pts.length) return null;
    const lo = Math.min(...pts.map((p) => p[b])), hi = Math.max(...pts.map((p) => p[b]));
    const mid = (lo + hi) / 2, span = Math.max(1, hi - lo);
    const mean = (ps) => ps.reduce((s, p) => s + p[a], 0) / Math.max(1, ps.length);
    const middle = mean(pts.filter((p) => Math.abs(p[b] - mid) <= span * 0.15));
    const ends = mean(pts.filter((p) => Math.abs(p[b] - mid) >= span * 0.35));
    return Math.sign(middle - ends);
  };
  return { n: pts.length, w: img.w, h: img.h, x: lean(0, 1), y: lean(1, 0) };
}

/** The pager's arrows and the selection boxes under the stand-in reset, light and dark, left to right and right to left. */
export async function pagerGlyphChecks(name, ctx, h) {
  const { check, frames, site, axe } = h;
  for (const [qs, rtl] of [['locale=fr-FR&theme=light&rows=2000&paging=client&box=1&reset=1', false], ['locale=ar-DZ&dir=rtl&theme=dark&rows=2000&paging=client&box=1&reset=1', true], ['locale=fr-FR&theme=dark&rows=2000&paging=client&box=1&reset=1', false]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.root(`packages/dom/test/browser/index.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    const tag = `glyphs ${qs.split('&reset')[0]}`;
    const reset = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-footer [data-go=next]')).borderTopWidth);
    // The stand-in reset is in force: the buttons' own borders (the theme's, layered) are gone.
    check(name, `${tag}: the unlayered reset is in force (a pager button's border ${reset})`, reset === '0px', reset);
    const ink = {};
    for (const go of ['first', 'prev', 'next']) ink[go] = await inkOf(await page.$(`.dzg-footer [data-go=${go}] > span`));
    const info = await page.evaluate(() => {
      const b = document.querySelector('.dzg-footer [data-go=next]');
      const s = b.firstElementChild;
      return { text: s.textContent, hidden: s.getAttribute('aria-hidden'), name: b.getAttribute('aria-label'), fg: getComputedStyle(b).color, bg: getComputedStyle(document.querySelector('.dzg-footer')).backgroundColor, dir: getComputedStyle(s).direction };
    });
    check(name, `${tag}: each arrow has ink (${Object.values(ink).map((i) => i.n).join(', ')} px), aria-hidden, the name in words ("${info.name}")`, Object.values(ink).every((i) => i.n > 6) && info.hidden === 'true' && !/[«‹›»]/.test(info.name), { ink, info });
    // Next points to the inline end: right in French, left in Arabic (the character mirrored by the browser).
    check(name, `${tag}: next points ${rtl ? 'left' : 'right'}, previous the other way (${ink.next.x} / ${ink.prev.x})`, ink.next.x === (rtl ? -1 : 1) && ink.prev.x === (rtl ? 1 : -1), { ink, dir: info.dir });
    check(name, `${tag}: arrow colour on the footer ≥ 3:1 (${contrast(parseColor(info.fg), parseColor(info.bg)).toFixed(2)})`, contrast(parseColor(info.fg), parseColor(info.bg)) >= 3, info);
    // The selection box (G): unticked, its edge is an outline, still drawn under the reset, 3:1 on the row.
    const box = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.dzg-layer .dzg-row:not([aria-selected=true]) .dzg-box')].find((x) => x.offsetParent);
      const s = getComputedStyle(b);
      return { style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor, row: getComputedStyle(b.closest('.dzg-row')).backgroundColor, page: getComputedStyle(document.body).backgroundColor };
    });
    const boxInk = await inkOf(await page.$('.dzg-layer .dzg-row:not([aria-selected=true]) .dzg-box'));
    check(name, `${tag}: an unticked box keeps its edge under the reset (outline ${box.style} ${box.width}, ${boxInk.n} px of ink)`, box.style === 'solid' && box.width === '1px' && boxInk.n > 20, { box, boxInk });
    const v = await axe(page);
    check(name, `${tag}: axe 0`, v.length === 0, v);
    await page.click('.dzg-footer [data-go=next]');
    await frames(page);
    const moved = await page.evaluate(() => window.t.grid.kernel.rows.page.index);
    check(name, `${tag}: a click on next still pages (page ${moved + 1})`, moved === 1, moved);
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

/** The tree's toggles under the stand-in reset: ink, pointing to the inline end closed and down open. */
export async function treeGlyphChecks(name, ctx, h) {
  const { check, frames, site } = h;
  for (const [qs, rtl] of [['locale=fr-FR&theme=light&reset=1', false], ['locale=ar-DZ&dir=rtl&theme=dark&reset=1', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 760 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.root(`packages/dom/test/browser/tree.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    const tag = `tree glyphs ${rtl ? 'ar rtl dark' : 'fr ltr light'} (unlayered reset)`;
    const closed = await page.$('.dzg-layer > .dzg-row[aria-expanded=false] .dzg-toggle');
    const open = await page.$('.dzg-layer > .dzg-row[aria-expanded=true] .dzg-toggle');
    const c = await inkOf(closed);
    const o = await inkOf(open);
    check(name, `${tag}: the closed toggle has ink and points ${rtl ? 'left' : 'right'} (${c.n} px, ${c.x})`, c.n > 6 && c.x === (rtl ? -1 : 1), c);
    check(name, `${tag}: the open toggle has ink and points down (${o.n} px, ${o.y})`, o.n > 6 && o.y === 1, o);
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
