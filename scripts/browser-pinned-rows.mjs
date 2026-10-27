/**
 * Phase 6 step 8b-1 in real browsers (docs/phase-6-steps/step08b-plan.md §6; `-- --only pinned-rows`): the REAL playground
 * page `pinned.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — a reference row « Objectif » pinned at the top,
 * a totals row « Total » at the bottom, editable, « Produit » pinned at the start.
 * Chrome, fr light and ar dark: the top band right under the header, the bottom band at the view's foot (short body too,
 * Q3); band cells aligned to 1 px with the header cells at the scroll's start, middle and end and scrolled sideways (the
 * pinned start column sticking inside the band); a body cell reached by the keys never under a band (2.4.11) — Down,
 * PageDown, Ctrl+End —, then Down into the totals row; an editor opened in a band cell stays on it while the body scrolls,
 * Enter saves (the mark, the value), Ctrl+Z gives it back; a body save recomputes the total; `?many=1`: the band at most half
 * the view, whole rows, its rows moved by the wheel and by the keys; forced colours (the line in CanvasText); 200 % zoom
 * (aligned, the band under the header); axe 0; no page error. Firefox and WebKit (`--engine`): the keys, the sticky foot
 * in RTL, the pinned column inside a band scrolled sideways, an editor opened and closed in a band.
 */
export async function pinnedRowsChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const chrome = name === 'chrome';
  for (const lang of chrome ? ['fr', 'ar'] : ['ar']) {
    const page = await ctx.newPage();
    // Narrow: the columns overflow sideways.
    await page.setViewportSize({ width: 820, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const rtl = lang === 'ar';
    await page.goto(`${base}/pinned.html?lang=${lang}&theme=${rtl ? 'dark' : 'light'}`);
    await page.waitForSelector('.dzg-pins-bottom .dzg-row');
    await frames(page, 3);
    const tag = `${name} ${lang}`;
    // The command key: Cmd on a Mac (the grid reads the platform), Ctrl elsewhere.
    const cmd = (await page.evaluate(() => /mac/i.test(navigator.platform))) ? 'Meta' : 'Control';

    /** Where the bands and their cells sit, against the header and the view. */
    const seen = () => page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const vp = document.querySelector('.dzg-viewport');
      const v = r(vp);
      const head = r(document.querySelector('.dzg-header'));
      const top = document.querySelector('.dzg-pins-top');
      const bottom = document.querySelector('.dzg-pins-bottom');
      // Misaligned band cells: each against its column header, 1 px.
      const off = [];
      for (const band of [top, bottom]) for (const cell of band.querySelectorAll('.dzg-cell[data-col]')) {
        const hc = document.querySelector(`.dzg-header .dzg-hcell[data-col="${cell.dataset.col}"]`);
        if (!hc) continue;
        const a = r(cell);
        const b = r(hc);
        // A centre cell under a pinned one is hidden: only the visible part counts (its edges inside the view's middle).
        if (Math.abs(a.left - b.left) > 1 || Math.abs(a.right - b.right) > 1) off.push(`${band.className}/${cell.dataset.col}: ${a.left}-${a.right} vs ${b.left}-${b.right}`);
      }
      const name = (band) => band.querySelector('.dzg-cell[data-col="name"]');
      const nb = r(name(top));
      return {
        topGap: Math.round(r(top).top - head.bottom),
        // The view's foot above a sideways scrollbar, by ratio (right under CSS zoom too).
        footGap: Math.round(v.top + (v.height * vp.clientHeight) / vp.offsetHeight - r(bottom).bottom),
        off,
        nameEdge: Math.round(getComputedStyle(vp).direction === 'rtl' ? v.right - (vp.offsetWidth - vp.clientWidth) - nb.right : nb.left - v.left),
        topRect: [r(top).top, r(top).bottom], bottomRect: [r(bottom).top, r(bottom).bottom],
      };
    });
    const scrollTo = (top, side = 0) => page.evaluate(([t, s]) => {
      const vp = document.querySelector('.dzg-viewport');
      vp.scrollTop = t;
      vp.scrollLeft = (getComputedStyle(vp).direction === 'rtl' ? -1 : 1) * s;
      vp.dispatchEvent(new Event('scroll'));
    }, [top, side]);

    let s = await seen();
    check(name, `${tag}: the top band right under the header, the bottom band at the view's foot`, Math.abs(s.topGap) <= 1 && Math.abs(s.footGap) <= 1, s);
    if (chrome) {
      for (const [where, top, side] of [['start', 0, 0], ['middle', 4000, 0], ['end', 1e6, 0], ['scrolled sideways', 2000, 300]]) {
        await scrollTo(top, side);
        await frames(page, 3);
        s = await seen();
        check(name, `${tag}: band cells aligned with the header to 1 px (${where}); the pinned start column stuck at the view's start edge`, s.off.length === 0 && Math.abs(s.nameEdge) <= 1 && Math.abs(s.footGap) <= 1, s);
      }
      await scrollTo(0);
      await frames(page, 2);
    } else {
      await scrollTo(1000, 300);
      await frames(page, 3);
      s = await seen();
      check(name, `${tag}: scrolled sideways, the bottom band still at the foot (RTL), its pinned column at the start edge, aligned`, Math.abs(s.footGap) <= 1 && Math.abs(s.nameEdge) <= 1 && s.off.length === 0, s);
      await scrollTo(0);
      await frames(page, 2);
    }

    // ---- the keys (pinned-rows.md 8–10) ----
    const focus = async () => (await frames(page, 2), page.evaluate(() => {
      const f = window.__pinned.grid.kernel.focus;
      const a = document.activeElement;
      const r = (el) => el.getBoundingClientRect();
      const top = r(document.querySelector('.dzg-pins-top'));
      const bottom = r(document.querySelector('.dzg-pins-bottom'));
      const c = r(a);
      const inBand = !!a.closest('.dzg-pins');
      return { row: f?.row ?? `header:${f?.column}`, col: f?.column, dom: a.classList.contains('dzg-cell') || a.classList.contains('dzg-hcell'), clear: inBand || (c.top >= top.bottom - 1 && c.bottom <= bottom.top + 1) };
    }));
    // From « Objectif » up to the header (a click on the header would sort).
    await page.locator('.dzg-pins-top .dzg-cell[data-col="stock"]').click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    let f = await focus();
    const toTop = f.row === 'p:t:6:target' && f.col === 'stock' && f.dom;
    await page.keyboard.press('ArrowDown');
    f = await focus();
    const toBody = f.row === 'd:2:p1' && f.clear;
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    f = await focus();
    const back = f.row === 'header:stock';
    check(name, `${tag}: Down from the header to « Objectif », then the body's first row; Up back to the header; the column kept`, toTop && toBody && back, { toTop, toBody, back, f });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const clear = [];
    for (const k of ['ArrowDown', 'ArrowDown', 'PageDown', 'PageDown', 'PageUp', 'ArrowDown']) {
      await page.keyboard.press(k);
      await frames(page, 2);
      clear.push((await focus()).clear);
    }
    await page.keyboard.press(`${cmd}+ArrowDown`);
    await frames(page, 2);
    f = await focus();
    const last = f.row === 'd:4:p300' && f.clear;
    await page.keyboard.press('ArrowDown');
    await frames(page, 2);
    f = await focus();
    const total = f.row === 'p:b:5:total' && f.dom;
    await page.keyboard.press(`${cmd}+Home`);
    await frames(page, 2);
    f = await focus();
    const home = f.row === 'd:2:p1' && f.col === 'name' && f.clear;
    check(name, `${tag}: Down, PageDown, PageUp in the body: the focused cell never under a band (2.4.11)`, clear.every(Boolean), clear);
    check(name, `${tag}: Ctrl+Down (Cmd on a Mac) to the body's last row, clear of the bottom band; Down into « Total »; Ctrl+Home to the body's first cell`, last && total && home, { last, total, home, f });

    // ---- editing a pinned cell (pinned-rows.md 11–15) ----
    const target = page.locator('.dzg-pins-top .dzg-cell[data-col="stock"]').first();
    await target.click();
    await page.keyboard.press('F2');
    await page.waitForSelector('.dzg-pins-top .dzg-field');
    await scrollTo(3000);
    await frames(page, 3);
    const aligned = await page.evaluate(() => {
      const fld = document.querySelector('.dzg-field').getBoundingClientRect();
      const cell = document.querySelector('.dzg-pins-top .dzg-cell[data-col="stock"]').getBoundingClientRect();
      return Math.abs(fld.top - cell.top) <= 1 && Math.abs(fld.left - cell.left) <= 1 && Math.abs(fld.width - cell.width) <= 1;
    });
    await page.locator('.dzg-pins-top .dzg-field').fill('650');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.dzg-pins-top .dzg-cell[data-col="stock"]')?.classList.contains('dzg-cell--saved'), null, { timeout: 3000 }).catch(() => {});
    const saved = await page.evaluate(() => { const c = document.querySelector('.dzg-pins-top .dzg-cell[data-col="stock"]'); return { text: c.textContent, saved: c.classList.contains('dzg-cell--saved'), field: !!document.querySelector('.dzg-field') }; });
    await page.keyboard.press(`${cmd}+z`);
    await frames(page, 2);
    await page.waitForTimeout(600);
    const undone = await page.evaluate(() => document.querySelector('.dzg-pins-top .dzg-cell[data-col="stock"]').textContent);
    check(name, `${tag}: an editor opened in a band cell stays on it while the body scrolls; Enter saves it (the mark, 650); Ctrl+Z gives 500 back`,
      aligned && saved.text.replace(/\D/g, '') === '650' && saved.saved && !saved.field && undone.replace(/\D/g, '') === '500', { aligned, saved, undone });

    if (chrome) {
      // A body save recomputes the total (the demo's save sets the bottom band again).
      const before = await page.evaluate(() => document.querySelector('.dzg-pins-bottom .dzg-cell[data-col="stock"]').textContent.replace(/\D/g, ''));
      await page.evaluate(() => window.__pinned.grid.api.focusCell('d:2:p1', 'stock'));
      await frames(page, 2);
      const was = await page.evaluate(() => window.__pinned.rows[0].stock);
      await page.keyboard.press('F2');
      await page.locator('.dzg-field').fill(String(was + 10));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => document.querySelector('.dzg-pins-bottom .dzg-cell[data-col="stock"]').textContent.replace(/\D/g, ''));
      check(name, `${tag}: a body row saved: the total recomputed (+10)`, Number(after) === Number(before) + 10, { before, after });
      // The totals' numbers are read-only (Q4: the rule's third argument), its note is not.
      const ro = await page.evaluate(() => ['stock', 'note'].map((c) => document.querySelector(`.dzg-pins-bottom .dzg-cell[data-col="${c}"]`).getAttribute('aria-readonly')));
      check(name, `${tag}: « Total »'s stock read-only, its note editable`, ro[0] === 'true' && ro[1] === null, ro);

      // Short body (Q3): the bottom band at the grid's foot.
      await page.evaluate(() => window.__pinned.grid.kernel.dispatch({ type: 'quick.set', text: 'zzzz' }, 'user'));
      await frames(page, 3);
      s = await seen();
      check(name, `${tag}: no body row: the bottom band at the grid's foot (Q3), the top band under the header`, Math.abs(s.footGap) <= 1 && Math.abs(s.topGap) <= 1, s);
      await page.evaluate(() => window.__pinned.grid.kernel.dispatch({ type: 'quick.set', text: '' }, 'user'));
      await frames(page, 2);

      const v = await h.axe(page);
      check(name, `${tag}: axe 0 (named row groups, none nested)`, v.length === 0, v);

      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => {
        const probe = document.body.appendChild(Object.assign(document.createElement('span'), { style: 'color: CanvasText' }));
        const out = { line: getComputedStyle(document.querySelector('.dzg-pins-top'), '::after').backgroundColor, CanvasText: getComputedStyle(probe).color };
        probe.remove();
        return out;
      });
      check(name, `${tag}: forced colours: the bands' line in CanvasText`, fc.line === fc.CanvasText, fc);
      await page.emulateMedia({ forcedColors: 'none' });

      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await frames(page, 3);
      await scrollTo(2000);
      await frames(page, 3);
      s = await seen();
      check(name, `${tag}: 200 % zoom: the bands under the header and at the foot, aligned`, Math.abs(s.topGap) <= 1 && Math.abs(s.footGap) <= 1 && s.off.length === 0, s);
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
      await page.screenshot({ path: `${h.OUT}/${name}-pinned-rows-${lang}.png`, fullPage: false }).catch(() => {});
    }
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }

  // ---- the half-view cap (O8): 12 reference rows ----
  if (!chrome) return;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/pinned.html?many=1`);
  await page.waitForSelector('.dzg-pins-top .dzg-row');
  await frames(page, 3);
  const cap = () => page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    const head = document.querySelector('.dzg-header').getBoundingClientRect();
    const top = document.querySelector('.dzg-pins-top').getBoundingClientRect();
    const bottom = document.querySelector('.dzg-pins-bottom').getBoundingClientRect();
    const h = parseFloat(getComputedStyle(document.querySelector('.dzg')).getPropertyValue('--dzg-row-height'));
    const view = vp.clientHeight - head.height;
    const first = document.querySelector('.dzg-pins-top .dzg-row');
    return { band: top.height + bottom.height, half: view / 2, whole: Math.abs(top.height / h - Math.round(top.height / h)) < 0.01, firstTop: first.getBoundingClientRect().top - top.top, h };
  });
  let c = await cap();
  check('chrome', 'cap: both bands at most half the view, whole rows', c.band <= c.half + 1 && c.whole, c);
  await page.mouse.move(400, (await page.locator('.dzg-pins-top').boundingBox()).y + 20);
  await page.mouse.wheel(0, 120);
  await frames(page, 3);
  const wheeled = await cap();
  check('chrome', 'cap: the wheel over the top band moves its rows', wheeled.firstTop < c.firstTop || (await page.evaluate(() => !document.querySelector('.dzg-pins-top .dzg-row[aria-rowindex="2"]'))), { c, wheeled });
  await page.evaluate(() => window.__pinned.grid.api.focusCell('p:t:5:ref12', 'stock'));
  await frames(page, 3);
  const shown = await page.evaluate(() => {
    const band = document.querySelector('.dzg-pins-top').getBoundingClientRect();
    const cell = document.activeElement.getBoundingClientRect();
    return cell.top >= band.top - 1 && cell.bottom <= band.bottom + 1;
  });
  check('chrome', 'cap: the focus on the last reference row brings it into the band\'s window', shown, shown);
  check('chrome', 'cap: no page error', errors.length === 0, errors);
  await page.close();
}
