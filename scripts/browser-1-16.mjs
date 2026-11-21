/**
 * 1.16.0 in real browsers (owner 2026-11-21 « commence par les mini-courbes et le reste »): the playground pages on
 * 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted. Chrome, Firefox and WebKit one after another, each closed in a
 * `finally`; French left to right and Arabic right to left, light and dark. `--engine chrome|firefox|webkit`,
 * `--only sparkline|perf`.
 *
 * Sparklines (`v1-16.html`, docs/behaviors/sparklines.md; not committed):
 * - the drawing laid in its cell (stretched, inside it), its line in `--dzg-sparkline-line` (the accent) with a
 *   non-scaling stroke, its last point's dot painted (hit at its place), 3:1 at least on the row;
 * - the cell's words the summary, the drawing out of the accessibility tree;
 * - a real pointer over the third point: after the hover delay « 41 (3 sur 12) » in the grid's tooltip, a ring on it, the
 *   tooltip off the cell; the fourth point then at once;
 * - a keyboard arrow onto the cell: the summary at once;
 * - right to left: time still left to right (the first point left of the last).
 * Master / detail in Excel (`--only xlsx`, `v1-16-xlsx.html`, xlsx-export.md 12–18; not committed), French and Arabic: the
 * file built by the browser (its own deflate), read back in the page: the open master's deliveries under it one column
 * in, its header row, the block at outline level 1, the filter on the master's columns; `&detail=all` every master with
 * deliveries; `&detail=all&async` the application's slow promises asked one master after another, the file the same.
 * Cascading ticks in a tree (`--only tree`, `v1-16-tree.html`, tree-selection.md « Cascading ticks »; not committed), French
 * and Arabic, light and dark: a real click on a service's box ticks its branch (every row aria-selected), a visit's
 * box then unticks it and the rows above, the parents' boxes partly ticked (the dash drawn, `aria-checked` mixed), Space
 * on the service gives the branch back; the boxes on the row's start side.
 * Perf (`--only perf`, light, French): 10 000 rows × 4 sparkline columns (30, 12, 12, 16 points), the viewport scrolled
 * 90 px a frame for 240 frames; frame times (p50, p95, max) beside the same grid without the feature (`&plain`: the
 * numbers as text).
 */
import { browser } from '../spikes/kit.mjs';

const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
const only = arg('--only');
const wants = (x) => !only || only === x;
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** Row 0's cell of a column (the first row: aria-rowindex 2). */
const CELL = (c) => `.dzg-row[aria-rowindex="2"] .dzg-cell[data-col="${c}"]`;

for (const name of wants('sparkline') ? engines : []) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      for (const dark of [false, true]) {
        const tag = `${name} ${lang} ${dark ? 'dark' : 'light'}`;
        const ctx = await B.newContext({ viewport: { width: 1040, height: 640 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${base}/v1-16.html?${lang === 'ar' ? 'lang=ar' : ''}${dark ? '&dark' : ''}`);
          await page.waitForSelector(`${CELL('trend')} svg.dzg-spark path`);
          await frames(page);

          const f = await page.evaluate((sel) => {
            const cell = document.querySelector(sel);
            const svg = cell.querySelector('svg.dzg-spark');
            const line = svg.querySelector('.dzg-spark-line');
            const dot = svg.querySelector('.dzg-spark-dot');
            const c = cell.getBoundingClientRect(), s = svg.getBoundingClientRect();
            // The accent as the page resolves it, and the row's background.
            const probe = document.createElement('span');
            probe.style.color = 'var(--tz-accent)';
            cell.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            let bgEl = cell, bg = 'rgba(0, 0, 0, 0)';
            while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; }
            const [, dx, dy] = /M([\d.]+) ([\d.]+)h0/.exec(dot.getAttribute('d'));
            const px = s.left + (Number(dx) / 100) * s.width, py = s.top + (Number(dy) / 100) * s.height;
            const hit = document.elementFromPoint(px, py);
            const pts = [...line.getAttribute('d').matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => s.left + (Number(m[1]) / 100) * s.width);
            return {
              w: s.width, h: s.height, cw: c.width, inside: s.left >= c.left - 0.5 && s.right <= c.right + 0.5 && s.top >= c.top - 0.5 && s.bottom <= c.bottom + 0.5,
              stroke: getComputedStyle(line).stroke, accent, ve: getComputedStyle(line).vectorEffect, bg,
              hitDot: hit === dot, text: cell.textContent, hidden: svg.getAttribute('aria-hidden'),
              ltr: pts[0] < pts.at(-1),
            };
          }, CELL('trend'));
          const rgb = (t) => (t.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
          const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
          check(`${tag}: the drawing laid in its cell, stretched`, f.inside && f.w > 150 && f.h >= 12, `${f.w.toFixed(0)}×${f.h.toFixed(0)} in ${f.cw.toFixed(0)}`);
          check(`${tag}: the line in the accent, a non-scaling stroke`, f.stroke === f.accent && f.ve === 'non-scaling-stroke', `${f.stroke} / ${f.accent} / ${f.ve}`);
          check(`${tag}: the line 3:1 at least on the row`, ratio(f.stroke, f.bg) >= 3, `${ratio(f.stroke, f.bg).toFixed(2)} on ${f.bg}`);
          check(`${tag}: the last point's dot painted (hit at its place)`, f.hitDot);
          const words = lang === 'ar' ? '12 قيمة، من 3 إلى 41، الأخيرة 27' : '12 valeurs, de 3 à 41, dernière 27';
          check(`${tag}: the cell's words the summary, the drawing hidden`, f.text === words && f.hidden === 'true', f.text);
          const aria = await page.locator(CELL('trend')).ariaSnapshot().catch((e) => `ERR ${e.message}`);
          check(`${tag}: the accessibility tree reads the summary, no graphic`, aria.includes(words) && !/img|graphics/.test(aria), aria.replace(/\n/g, ' '));
          check(`${tag}: time left to right`, f.ltr);

          // A real pointer: the third point (x 3 + 2·94/11 %), after the hover delay; then the fourth at once.
          const s = await page.locator(`${CELL('trend')} svg.dzg-spark`).boundingBox();
          const at = (i) => s.x + ((3 + (i * 94) / 11) / 100) * s.width;
          await page.mouse.move(at(2), s.y + s.height / 2, { steps: 4 });
          await page.waitForTimeout(700);
          const t1 = await page.evaluate((sel) => {
            const tip = document.querySelector('.dzg-tooltip');
            const ring = document.querySelector(`${sel} .dzg-spark-hover`);
            const r = tip.getBoundingClientRect(), c = document.querySelector(sel).getBoundingClientRect();
            return { shown: !tip.hidden, text: tip.textContent, ring: ring?.getAttribute('d'), off: r.top >= c.bottom - 0.5 || r.bottom <= c.top + 0.5 };
          }, CELL('trend'));
          const point = (v, i) => (lang === 'ar' ? `${v} (${i} من 12)` : `${v} (${i} sur 12)`);
          check(`${tag}: hover, the point's value in the tooltip, a ring on it, off the cell`, t1.shown && t1.text === point(41, 3) && t1.ring === 'M20.09 8h0' && t1.off, JSON.stringify(t1));
          await page.mouse.move(at(3), s.y + s.height / 2);
          await frames(page);
          const t2 = await page.evaluate(() => document.querySelector('.dzg-tooltip').textContent);
          check(`${tag}: the next point at once`, t2 === point(27, 4), t2);
          await page.mouse.move(5, 5);
          await page.waitForTimeout(400);

          // The keyboard: from the site cell, one arrow towards the line's end.
          await page.evaluate(() => window.grid.api.focusCell(window.grid.kernel.rows.displayed.keyAt(0), 'site'));
          // The focus settled first (WebKit once took the arrow before it, 2026-11-21).
          await page.waitForFunction(() => document.activeElement?.dataset?.col === 'site');
          await frames(page);
          await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
          await frames(page);
          const k = await page.evaluate((sel) => ({ on: document.activeElement === document.querySelector(sel), shown: !document.querySelector('.dzg-tooltip').hidden, text: document.querySelector('.dzg-tooltip').textContent }), CELL('trend'));
          check(`${tag}: a keyboard focus shows the summary at once`, k.on && k.shown && k.text === words, JSON.stringify(k));
          check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
          if (lang === 'ar' && dark) await page.screenshot({ path: `/tmp/dzg-browser-1-16-${name}-ar-dark.png` });
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await B.close();
  }
}

// ---- Master / detail in the Excel file.
for (const name of wants('xlsx') ? engines : []) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      for (const mode of ['', '&detail=all', '&detail=all&async']) {
        const tag = `${name} ${lang}${mode || ' expanded'}`;
        const ctx = await B.newContext({ viewport: { width: 900, height: 600 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${base}/v1-16-xlsx.html?${lang === 'ar' ? 'lang=ar' : ''}${mode}`);
          await page.waitForSelector('.dzg-row[aria-rowindex="2"]');
          await frames(page);
          const r = await page.evaluate(() => window.exportXlsx());
          const strings = [...r.strings.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
          const cell = (ref) => {
            const m = new RegExp(`<c r="${ref}"([^>]*?)/?>(?:<v>([^<]*)</v>)?`).exec(r.sheet);
            return !m || m[2] === undefined ? undefined : / t="s"/.test(m[1]) ? strings[Number(m[2])] : Number(m[2]);
          };
          const lv = (y) => (new RegExp(`<row r="${y}"[^>]*outlineLevel="(\\d)"`).exec(r.sheet) ?? [])[1] ?? null;
          const ref = lang === 'ar' ? 'مرجع' : 'Réf.';
          check(`${tag}: exported`, r.outcome === 'done', r.outcome);
          check(`${tag}: the first master's deliveries under it, one column in, its header row`, [cell('B3'), cell('B4'), cell('D4'), cell('B5'), cell('D5')].join('|') === [ref, 'D-1', 4, 'D-2', 1.5].join('|'), [cell('B3'), cell('B4'), cell('D4'), cell('B5'), cell('D5')].join('|'));
          check(`${tag}: the block one outline level down, the master none`, [lv(2), lv(3), lv(4), lv(5)].join() === ',1,1,1' && /summaryBelow="0"/.test(r.sheet));
          const all = mode !== '';
          check(`${tag}: ${all ? 'every master with deliveries' : 'only the open master'}`, all ? cell('B8') === 'D-3' && lv(8) === '1' : lv(6) === null && lv(7) === null && cell('B6') === 100 && cell('B7') === 50, `${cell('B6')} ${cell('B7')} ${cell('B8')}`);
          check(`${tag}: the filter on the master's two columns`, new RegExp(`<autoFilter ref="A1:B${all ? 9 : 7}"/>`).test(r.sheet), /<autoFilter[^>]*>/.exec(r.sheet)?.[0]);
          check(`${tag}: right to left in Arabic`, lang === 'ar' ? /rightToLeft="1"/.test(r.sheet) : !/rightToLeft/.test(r.sheet));
          if (mode.endsWith('&async')) check(`${tag}: the application's promises, one per master, in order`, r.asked.join() === 's1,s2,s3', r.asked.join());
          check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await B.close();
  }
}

// ---- Cascading ticks in a tree.
for (const name of wants('tree') ? engines : []) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      for (const dark of [false, true]) {
        const tag = `${name} tree ${lang} ${dark ? 'dark' : 'light'}`;
        const ctx = await B.newContext({ viewport: { width: 800, height: 520 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${base}/v1-16-tree.html?${lang === 'ar' ? 'lang=ar' : ''}${dark ? '&dark' : ''}`);
          await page.waitForSelector('.dzg-row[aria-rowindex="8"]');
          await frames(page);
          const ROW = (i) => `.dzg-row[aria-rowindex="${i + 2}"]`;
          const BOX = (i) => `${ROW(i)} .dzg-check .dzg-box`;
          const sel = () => page.evaluate(() => [...document.querySelectorAll('.dzg-row')].sort((a, b) => a.getAttribute('aria-rowindex') - b.getAttribute('aria-rowindex')).map((r) => (r.getAttribute('aria-selected') === 'true' ? 1 : 0)).join(''));
          const box = (i) => page.evaluate((s) => { const b = document.querySelector(s); return { role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), mark: getComputedStyle(b, '::before').content }; }, BOX(i));
          // Rows: 0 S0, 1 P1, 2 V1, 3 V2, 4 P2, 5 S1, 6 P3.
          await page.locator(BOX(0)).click();
          await frames(page);
          check(`${tag}: a click on the service's box ticks its branch`, (await sel()) === '1111100', await sel());
          const s0 = await box(0);
          check(`${tag}: its box a ticked checkbox`, s0.role === 'checkbox' && s0.checked === 'true' && /✓/.test(s0.mark), JSON.stringify(s0));
          await page.locator(BOX(2)).click();
          await frames(page);
          check(`${tag}: a visit unticked unticks the rows above`, (await sel()) === '0001100', await sel());
          const [b0, b1] = [await box(0), await box(1)];
          check(`${tag}: the parents partly ticked, the dash drawn`, b0.checked === 'mixed' && b1.checked === 'mixed' && /−/.test(b0.mark) && /−/.test(b1.mark), JSON.stringify([b0, b1]));
          await page.locator(`${ROW(0)} .dzg-cell[data-col="n"]`).click();
          await page.keyboard.press(' ');
          await frames(page);
          check(`${tag}: Space on the service ticks its branch again`, (await sel()) === '1111100', await sel());
          const side = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(), r = document.querySelector('.dzg-row[aria-rowindex="2"]').getBoundingClientRect(); return { l: b.left - r.left, r: r.right - b.right }; }, BOX(0));
          check(`${tag}: the box at the row's start`, lang === 'ar' ? side.r < side.l : side.l < side.r, JSON.stringify(side));
          check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await B.close();
  }
}

// ---- 10 000 rows: frame times while scrolling, with and without the drawings.
const stats = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { p50: q(0.5), p95: q(0.95), max: s.at(-1) }; };
for (const name of wants('perf') ? engines : []) {
  const B = await browser(name);
  try {
    const out = {};
    for (const plain of [false, true]) {
      const ctx = await B.newContext({ viewport: { width: 1040, height: 640 } });
      try {
        const page = await ctx.newPage();
        const t0 = Date.now();
        await page.goto(`${base}/v1-16.html?rows=10000${plain ? '&plain' : ''}`);
        await page.waitForSelector('.dzg-row[aria-rowindex="2"]');
        const first = Date.now() - t0;
        await frames(page, 10);
        out[plain ? 'text' : 'sparklines'] = { first, ...(await page.evaluate(() => new Promise((done) => {
          const vp = document.querySelector('.dzg-viewport');
          const times = [];
          let last = performance.now();
          let k = 0;
          const step = () => {
            const now = performance.now();
            if (k++) times.push(now - last);
            last = now;
            if (k > 240) return done({ times, drawn: document.querySelectorAll('svg.dzg-spark').length, top: vp.scrollTop });
            vp.scrollTop += 90;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }))) };
      } finally {
        await ctx.close();
      }
    }
    const a = stats(out.sparklines.times), b = stats(out.text.times);
    const f = (x) => `p50 ${x.p50.toFixed(1)} ms, p95 ${x.p95.toFixed(1)} ms, max ${x.max.toFixed(1)} ms`;
    console.log(`perf ${name}: sparklines ${f(a)} (${out.sparklines.drawn} drawings mounted, scrolled to ${out.sparklines.top}px; page ready ${out.sparklines.first} ms); text ${f(b)} (page ready ${out.text.first} ms)`);
    // Smooth: no more than one frame in twenty over 2 frames' time, and within 1.5× the text grid's p95 (+4 ms).
    check(`perf ${name}: 10 000 rows of sparklines scroll as text does`, a.p95 <= b.p95 * 1.5 + 4 && a.p95 <= 34, `${a.p95.toFixed(1)} vs ${b.p95.toFixed(1)} ms`);
  } finally {
    await B.close();
  }
}

console.log(`browser-1-16: ${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
