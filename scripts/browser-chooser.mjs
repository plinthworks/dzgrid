/**
 * Phase 6 step 4 in real browsers (docs/phase-6-steps/step04-plan.md §9), called by scripts/browser.mjs
 * (`-- --only chooser`; `--engine firefox|webkit`: the keys, the Tab loop and the handle's mouse drag only): the REAL
 * playground page `orders-edit.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted.
 * - The « Colonnes » button pressed with the mouse: the dialog under it (end edges aligned), the focus in its search box;
 *   a real Tab / Shift+Tab loop of five stops, never the grid; Escape empties a search, then closes, the focus back on
 *   the button.
 * - From the ⋮ menu: « Choisir les colonnes… »; unticking that header's own column keeps the dialog open; Escape: the
 *   focus in the grid.
 * - Alt+ArrowDown (Option on a Mac's engine) on a box: the sentence (hidden columns counted), the grid's header moved and
 *   aligned with its cells; ▲ ▼ with the mouse; a real mouse drag of a handle.
 * - Chrome: a finger drag (CDP touch) on a handle moves the column; fr light and ar dark: the handles at the inline end,
 *   Latin names isolated (`bdi`); every button ≥ 24 × 24; axe 0 open; forced colours (the shapes drawn); a 320 px view
 *   and a 640 px one (200 % zoom of 1 280): the dialog inside, its list scrolling; 300 columns: the list scrolls to its
 *   last row.
 */
export async function chooserChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const chrome = name === 'chrome';
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    if (!chrome && ar) continue;
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    await page.evaluate(() => {
      window.said = [];
      // The grid's region and the dialog's own (made at each opening): any `.dzg-live` written.
      new MutationObserver((ms) => { for (const m of ms) { const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('.dzg-live'); if (el?.textContent) window.said.push(el.textContent); } }).observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    const box = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; }, sel);
    /** Where the focus is: `search`, a row's column, a button's act, `grid`, or the element's tag. */
    const where = () => page.evaluate(() => {
      const a = document.activeElement;
      if (a?.type === 'search') return 'search';
      if (a?.closest('.dzg-cp-row')) return `row:${a.closest('.dzg-cp-row').dataset.col}`;
      if (a?.dataset?.act) return a.dataset.act;
      if (a?.closest('.dzg') && !a.closest('.dzg-popup')) return 'grid';
      return a?.id || a?.tagName;
    });
    const open = () => page.evaluate(() => !!document.querySelector('.dzg-popup[role=dialog] .dzg-cp'));
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.dzg-cp-row')].map((r) => r.dataset.col));
    const header = () => page.evaluate(() => [...document.querySelectorAll('.dzg-header .dzg-hcell[data-col]:not(.dzg-hgroup):not(.dzg-hextra)')].map((c) => c.dataset.col));
    const visible = () => page.evaluate(() => window.demo.grid.kernel.columns.visible().map((c) => c.id));
    /** Each header's inline span against its column's body cells in the first row (both directions: from the box's edges). */
    const aligned = () => page.evaluate(() => {
      const row = document.querySelector('.dzg-layer > .dzg-row');
      let worst = 0;
      for (const c of row.querySelectorAll('.dzg-cell[data-col]')) {
        const hc = document.querySelector(`.dzg-header .dzg-hcell[data-col="${c.dataset.col}"]:not(.dzg-hgroup)`);
        if (!hc) continue;
        const a = c.getBoundingClientRect();
        const b = hc.getBoundingClientRect();
        worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
      }
      return worst;
    });
    /** The last sentence, once the live region wrote it (it may wait a little). */
    const said = async () => (await page.waitForTimeout(400), page.evaluate(() => window.said.slice(-1)[0] ?? ''));
    const click = async (sel) => { const b = await box(sel); await page.mouse.click(b.x, b.y); await frames(page, 2); };
    const reset = () => page.evaluate(() => {
      const m = window.demo.grid.kernel.columns;
      window.demo.grid.kernel.dispatch({ type: 'column.state', patch: m.state().map((s, order) => ({ id: s.id, order, width: null, hidden: false, pinned: null })) }, 'api');
    });

    // 1. The application's button with the mouse.
    const btn = await box('#open-chooser');
    await page.mouse.click(btn.x, btn.y);
    await frames(page, 3);
    const d = await box('.dzg-popup[role=dialog]');
    check(name, `chooser ${tag}: « Colonnes » pressed: the dialog under it (above when no room), end edges aligned (${ar ? 'left' : 'right'}), the focus in its search`,
      (await open()) && (await where()) === 'search' && (d.top >= btn.bottom || d.bottom <= btn.top) && (ar ? Math.abs(d.left - btn.left) <= 2 : Math.abs(d.right - btn.right) <= 2), { d, btn, where: await where() });

    // 2. Tab loop (165): five stops, wrapping, never the grid.
    const loop = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); loop.push(await where()); }
    const back = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); back.push(await where()); }
    check(name, `chooser ${tag}: Tab: ${loop.join(' → ')}; Shift+Tab: ${back.join(' → ')}`,
      /^row:/.test(loop[0]) && loop.slice(1).join() === 'all,reset,close,search' && back.slice(0, 4).join() === 'close,reset,all,' + loop[0] && back[4] === 'search', { loop, back });

    // 3. Escape: the search first (O12), then the dialog; the focus back on the button.
    await page.keyboard.type(ar ? 'ال' : 'dat');
    await frames(page, 2);
    const narrowed = await rows();
    await page.keyboard.press('Escape');
    await frames(page, 1);
    const still = (await open()) && (await rows()).length === 7;
    await page.keyboard.press('Escape');
    await frames(page, 2);
    check(name, `chooser ${tag}: typed: ${narrowed.join(', ')}; Escape empties it (still open); Escape again closes, the focus on « Colonnes »`,
      narrowed.length >= 1 && narrowed.length < 7 && still && !(await open()) && (await page.evaluate(() => document.activeElement?.id)) === 'open-chooser', { narrowed, still });

    // 4. From the ⋮ menu; unticking the opener's own column keeps it open.
    const hc = await box('.dzg-header .dzg-hcell[data-col="client"]:not(.dzg-hgroup)');
    await page.mouse.move(hc.x, hc.y);
    await frames(page, 1);
    await click('.dzg-header .dzg-hcell[data-col="client"] > .dzg-mbtn');
    await click('[role=menuitem][data-id="choose"]');
    const fromMenu = (await open()) && (await where()) === 'search';
    await click('.dzg-cp-row[data-col="client"] label');
    const hidden = !(await visible()).includes('client');
    const kept = await open();
    await click('.dzg-cp-row[data-col="client"] label');
    await page.keyboard.press('Escape');
    await frames(page, 2);
    check(name, `chooser ${tag}: ⋮ → « Choisir les colonnes… »: open, the focus in the search; unticking « client » hides it and keeps the dialog; ticked again; Escape: the focus in the grid`,
      fromMenu && hidden && kept && (await visible()).includes('client') && !(await open()) && (await where()) === 'grid', { fromMenu, hidden, kept, where: await where() });

    // 5. Alt+ArrowDown on « qty » (Option on a Mac: the same alt key); ▲ ▼ with the mouse.
    await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'status', hidden: true }] }, 'api'));
    await page.evaluate(() => window.demo.chooser.open(document.getElementById('open-chooser')));
    await frames(page, 2);
    await page.focus('.dzg-cp-row[data-col="qty"] input');
    await page.keyboard.press('Alt+ArrowDown');
    await frames(page, 3);
    const s5 = await said();
    const h5 = await header();
    check(name, `chooser ${tag}: Alt+ArrowDown on « qty »: « ${s5} » (hidden « status » counted: 6 of 7), the header moved and aligned, the focus on its box`,
      /6/.test(s5) && /7/.test(s5) && h5.indexOf('qty') > h5.indexOf('amount') && (await where()) === 'row:qty' && (await aligned()) <= 1, { s5, h5, al: await aligned() });
    await click('.dzg-cp-row[data-col="qty"] [data-act=up]');
    const h5b = await header();
    check(name, `chooser ${tag}: ▲ with the mouse: back (${h5b.join(' ')}), said, the focus on the row's box`, h5b.indexOf('qty') < h5b.indexOf('amount') && /5/.test(await said()) && (await where()) === 'row:qty', { h5b, s: await said() });

    // 6. A real mouse drag of « amount »'s handle up over « day ».
    const from = await box('.dzg-cp-row[data-col="amount"] [data-act=drag]');
    const to = await box('.dzg-cp-row[data-col="day"]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 6, { steps: 2 });
    await page.mouse.move(from.x, to.top + 4, { steps: 6 });
    await frames(page, 2);
    const barShown = await page.evaluate(() => !document.querySelector('.dzg-cp-bar').hidden);
    await page.mouse.up();
    await frames(page, 3);
    const h6 = await header();
    check(name, `chooser ${tag}: a mouse drag of « amount »'s handle onto « day »: the bar shown, amount before day (${h6.join(' ')}), said, aligned`,
      barShown && h6.indexOf('amount') === h6.indexOf('day') - 1 && /Montant|المبلغ/.test(await said()) && (await aligned()) <= 1, { barShown, h6, s: await said() });

    if (chrome) {
      // 7. A finger on a handle (O5).
      await reset();
      await frames(page, 2);
      const cdp = await ctx.newCDPSession(page);
      const f = await box('.dzg-cp-row[data-col="urgent"] [data-act=drag]');
      const t = await box('.dzg-cp-row[data-col="qty"]');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: f.x, y: f.y }] });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: f.x, y: f.y + ((t.top + 4 - f.y) * i) / 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frames(page, 3);
      const h7 = await header();
      const ta = await page.evaluate(() => [getComputedStyle(document.querySelector('.dzg-cp-row [data-act=drag]')).touchAction, getComputedStyle(document.querySelector('.dzg-cp-row')).touchAction]);
      check(name, `chooser ${tag}: a finger drag on « urgent »'s handle onto « qty »: moved (${h7.join(' ')}); touch-action none on the handle only (${ta.join(' / ')})`, h7.indexOf('urgent') === h7.indexOf('qty') - 1 && ta[0] === 'none' && ta[1] === 'auto', { h7, ta });
      await reset();
      await frames(page, 2);

      // 8. Right to left and the targets.
      const g = await page.evaluate(() => {
        const r = document.querySelector('.dzg-cp-row[data-col="qty"]');
        const b = (x) => x.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.dzg-cp button')].map((x) => ({ act: x.dataset.act, w: b(x).width, h: b(x).height }));
        return { box: b(r.querySelector('input')).left, drag: b(r.querySelector('[data-act=drag]')).left, bdi: !!r.querySelector('label bdi'), rowH: b(r).height, btns };
      });
      check(name, `chooser ${tag}: the handles at the inline end (${ar ? 'left' : 'right'}), names in <bdi>; every button ≥ 24 × 24, rows ≥ 24 high`,
        (ar ? g.drag < g.box : g.drag > g.box) && g.bdi && g.rowH >= 24 && g.btns.every((x) => x.w >= 24 && x.h >= 24), g);
      // 9. axe; forced colours.
      // The grid and its dialog (the playground page's own log list is not ours).
      await h.axe(page);
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('.dzg'), { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
      check(name, `chooser ${tag}: axe 0 with the dialog open`, v.length === 0, v);
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-cp-row [data-act=drag]'), '::before').backgroundColor);
      await page.emulateMedia({ forcedColors: 'none' });
      check(name, `chooser ${tag}: forced colours: the handle's shape drawn (${fc})`, fc !== 'rgba(0, 0, 0, 0)' && fc !== 'transparent', fc);
      // 10. Narrow views (1.4.10; 200 % zoom of 1 280 × 900 = 640 × 450).
      for (const [w, hh] of [[320, 480], [640, 450]]) {
        await page.setViewportSize({ width: w, height: hh });
        await frames(page, 3);
        await page.keyboard.press('Escape');
        // Opened by its button, scrolled into view as a person would.
        await page.evaluate(() => document.getElementById('open-chooser').scrollIntoView({ block: 'center' }));
        await click('#open-chooser');
        await frames(page, 3);
        const s = await page.evaluate(() => { const p = document.querySelector('.dzg-popup[role=dialog]').getBoundingClientRect(); const l = document.querySelector('.dzg-cp-list'); return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, scrolls: l.scrollHeight >= l.clientHeight, lh: l.clientHeight }; });
        check(name, `chooser ${tag}: a ${w} × ${hh} view: the dialog inside it (${Math.round(s.left)}–${Math.round(s.right)}, ${Math.round(s.top)}–${Math.round(s.bottom)}), its list ${s.lh} px`, s.left >= -0.5 && s.right <= w + 0.5 && s.top >= -0.5 && s.bottom <= hh + 0.5 && s.lh > 40, s);
      }
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1280, height: 900 });
      await frames(page, 2);
      if (!ar) {
        // 11. 300 columns: the list scrolls to its last row, drawn.
        const r = await page.evaluate(async () => {
          const cols = Array.from({ length: 300 }, (_, i) => ({ id: `x${i}`, header: `Colonne ${i}`, width: 80, value: () => i }));
          window.demo.grid.update({ columns: cols });
          await new Promise((ok) => requestAnimationFrame(() => ok()));
          const t0 = performance.now();
          window.demo.chooser.open();
          const opened = performance.now() - t0;
          const l = document.querySelector('.dzg-cp-list');
          l.scrollTop = l.scrollHeight;
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
          const last = document.querySelector('.dzg-cp-row[data-col="x299"]').getBoundingClientRect();
          const lb = l.getBoundingClientRect();
          return { opened, rows: document.querySelectorAll('.dzg-cp-row').length, inView: last.bottom <= lb.bottom + 1 && last.top >= lb.top - 1, h: last.height };
        });
        check(name, `chooser ${tag}: 300 columns: opened in ${Math.round(r.opened)} ms, ${r.rows} rows, the last one scrolled into view and drawn (${r.h} px)`, r.rows === 300 && r.inView && r.h >= 24, r);
      }
    }
    check(name, `chooser ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
