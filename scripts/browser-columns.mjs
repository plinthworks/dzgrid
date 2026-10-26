/**
 * Phase 6 step 2 in real browsers (docs/phase-6-steps/step02-plan.md §7), called by scripts/browser.mjs
 * (`-- --only columns`; `--engine firefox|webkit` for the right-to-left drag): the REAL playground page
 * `orders-edit.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted.
 * - A real mouse drag, fr light and ar dark: the bar on the gap's side, the drop lands, header and body aligned within 1 px
 *   after the move, the click after the drag does not sort; into and out of the pinned segments (pins, unpins), the bar
 *   inside its segment; auto-scroll to the far end and back in a narrow view (Firefox and WebKit right to left too).
 * - Chrome: the keys (Cmd+Shift on a Mac, Ctrl+Shift elsewhere; the other modifier does nothing), the focus kept on the
 *   moved header and fully seen, the sentence after the pause; axe 0 mid-drag and after; forced colours: the bar in
 *   Highlight; a finger drag (CDP touch) never moves; 1 000 columns × 1 000 rows: a drag across with auto-scroll, a drop
 *   at the far end and a key move, times printed (Q17d: not gated).
 * Header groups leaving and joining are checked in jsdom (`columns-interplay.test.ts`): no playground page has groups.
 */
export async function columnsChecks(name, ctx, h) {
  const { check, frames } = h;
  /** axe on the grid only (the demo page's own log and title are not this step's). */
  const axe = async (page) => {
    await h.axe(page);
    return page.evaluate(async () => (await window.axe.run(document.querySelector('.dzg'), { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target?.join(' ')})`));
  };
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const rtlOnly = name !== 'chrome';
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    if (rtlOnly && !ar) continue;
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
      window.sorts = 0;
      for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true });
      window.demo.grid.kernel.subscribe((e) => { if (e.type === 'sortChanged') window.sorts++; });
    });
    const order = () => page.evaluate(() => window.demo.grid.kernel.columns.visible().map((c) => c.id));
    const seg = (s) => page.evaluate((s) => window.demo.grid.kernel.columns.layout[s].columns.map((c) => c.id), s);
    const head = (col) => page.evaluate((col) => {
      const r = document.querySelector(`.dzg-header .dzg-hcell[data-col="${col}"]:not(.dzg-hgroup)`)?.getBoundingClientRect();
      return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, w: r.width };
    }, col);
    /** Every mounted column: its header and a body cell, start and end edges within 1 px. */
    const aligned = () => page.evaluate(() => {
      const row = [...document.querySelectorAll('.dzg-layer > .dzg-row')][2];
      let worst = 0;
      for (const c of row.querySelectorAll('.dzg-cell[data-col]')) {
        const hd = document.querySelector(`.dzg-header .dzg-hcell[data-col="${c.dataset.col}"]:not(.dzg-hgroup)`);
        if (!hd) continue;
        const a = c.getBoundingClientRect(), b = hd.getBoundingClientRect();
        worst = Math.max(worst, Math.abs(a.left - b.left), Math.abs(a.right - b.right));
      }
      return worst;
    });
    const bar = () => page.evaluate(() => {
      const b = document.querySelector('.dzg-move-bar');
      if (!b || b.hidden) return null;
      const r = b.getBoundingClientRect();
      return { left: r.left, right: r.right, w: r.width, h: r.height, bg: getComputedStyle(b).backgroundColor };
    });
    /** A real drag: pressed on `from`'s header, moved in steps to (x, y), checked by `mid` before the release. */
    const drag = async (from, x, y, mid) => {
      const p = await head(from);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + (x > p.x ? 6 : -6), p.y, { steps: 2 });
      await page.mouse.move(x, y ?? p.y, { steps: 8 });
      await frames(page, 2);
      const m = mid ? await mid() : null;
      await page.mouse.up();
      await frames(page, 2);
      return m;
    };

    // 1. A drag: qty dropped just past the middle of amount (after it).
    const before = await order();
    const a = await head('amount');
    const after = (x) => (ar ? x.left + 4 : x.right - 4);
    const bar1 = await drag('qty', after(a), undefined, bar);
    await page.waitForTimeout(400);
    const o1 = await order();
    const want1 = before.filter((c) => c !== 'qty');
    want1.splice(want1.indexOf('amount') + 1, 0, 'qty');
    const a1 = await head('amount');
    check(name, `columns ${tag}: a real drag of « qty » past « amount »: the bar at amount's end edge (${ar ? 'left' : 'right'} side), the drop lands, one sentence, no sort`,
      bar1 && Math.abs((ar ? bar1.right : bar1.left) - (ar ? a.left + 1 : a.right - 1)) <= 2 && JSON.stringify(o1) === JSON.stringify(want1) && (await page.evaluate(() => window.sorts)) === 0 && (await page.evaluate(() => window.said.length)) >= 1 && a1, { bar1, a, o1, want1, said: await page.evaluate(() => window.said) });
    check(name, `columns ${tag}: header and body aligned within 1 px after the move`, (await aligned()) <= 1, await aligned());

    // 2. Pinned segments: ref pinned start, urgent end (by the API); client dragged into the start segment, then out.
    await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'ref', pinned: 'start' }, { id: 'urgent', pinned: 'end' }] }, 'api'));
    await frames(page, 2);
    const r = await head('ref');
    const inStart = await drag('client', ar ? r.left + 8 : r.right - 8, undefined, bar);
    const s1 = await seg('start');
    const r2 = await head('ref');
    const client = await head('client');
    check(name, `columns ${tag}: dropped among the start-pinned columns, « client » is pinned start; the bar was inside that segment`,
      JSON.stringify(s1) === JSON.stringify(['ref', 'client']) && inStart && (ar ? inStart.right <= r.right + 0.5 && inStart.left >= r.left - 0.5 : inStart.left >= r.left - 0.5 && inStart.right <= r.right + 0.5) && r2 && client, { s1, inStart, r });
    const q = await head('qty');
    await drag('client', q.x);
    const s2 = await seg('start');
    check(name, `columns ${tag}: dragged out to the centre, « client » unpinned; aligned within 1 px`, JSON.stringify(s2) === JSON.stringify(['ref']) && (await seg('center')).includes('client') && (await aligned()) <= 1, { s2, al: await aligned() });

    // 3. Auto-scroll in a 700 px view, to the far end and back.
    await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'ref', pinned: null }, { id: 'urgent', pinned: null }] }, 'api'));
    await page.setViewportSize({ width: 700, height: 900 });
    await frames(page, 3);
    const vpBox = await page.evaluate(() => { const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); return { left: v.left, right: v.right, top: v.top }; });
    const scroll = () => page.evaluate(() => window.demo.grid.context.geometry.read().scrollInline);
    const first = (await order())[0];
    const f = await head(first);
    await page.mouse.move(f.x, f.y);
    await page.mouse.down();
    await page.mouse.move(f.x + (ar ? -8 : 8), f.y, { steps: 2 });
    const endX = ar ? vpBox.left + 6 : vpBox.right - 20;
    await page.mouse.move(endX, f.y, { steps: 6 });
    await page.waitForTimeout(1500);
    const far = await scroll();
    const max = await page.evaluate(() => { const g = window.demo.grid.context; const L = g.columns.layout; return Math.max(0, L.center.width - g.geometry.read().inline + L.start.width + L.end.width); });
    await page.mouse.up();
    await frames(page, 2);
    const o3 = await order();
    check(name, `columns ${tag}: auto-scroll near the end edge reaches the far end (${far} / ${max}); the column lands last`, max > 0 && Math.abs(far - max) <= 1 && o3.at(-1) === first, { far, max, o3 });
    const l = await head(first);
    await page.mouse.move(l.x, l.y);
    await page.mouse.down();
    await page.mouse.move(l.x + (ar ? 8 : -8), l.y, { steps: 2 });
    await page.mouse.move(ar ? vpBox.right - 20 : vpBox.left + 6, l.y, { steps: 6 });
    await page.waitForTimeout(1500);
    const back = await scroll();
    await page.mouse.up();
    await frames(page, 2);
    check(name, `columns ${tag}: and back to the start edge (scroll ${back}); the column first again; aligned`, back === 0 && (await order())[0] === first && (await aligned()) <= 1, { back, o: await order() });
    await page.setViewportSize({ width: 1280, height: 900 });
    await frames(page, 2);
    check(name, `columns ${tag}: no page error`, errors.length === 0, errors);

    if (rtlOnly) {
      await page.close();
      continue;
    }

    // 4. The keys: Cmd+Shift on a Mac, Ctrl+Shift elsewhere.
    const mac = await page.evaluate(() => /mac/i.test(navigator.platform));
    const [mod, other] = mac ? ['Meta', 'Control'] : ['Control', 'Meta'];
    await page.evaluate(() => (window.said = []));
    const st = await head('status');
    await page.mouse.click(st.x, st.y);
    await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'sort.set', sort: [] }, 'api'));
    await frames(page, 2);
    const k0 = await order();
    await page.keyboard.press(`${other}+Shift+ArrowRight`);
    await frames(page, 2);
    const k1 = await order();
    const toEnd = ar ? 'ArrowLeft' : 'ArrowRight';
    for (let i = 0; i < 3; i++) await page.keyboard.press(`${mod}+Shift+${toEnd}`);
    await frames(page, 2);
    const k2 = await order();
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      const v = document.querySelector('.dzg-viewport').getBoundingClientRect();
      const r = a.getBoundingClientRect();
      return { col: a.dataset.col, seen: r.left >= v.left - 0.5 && r.right <= v.right + 0.5 };
    });
    await page.waitForTimeout(450);
    const said = await page.evaluate(() => window.said);
    const i0 = k0.indexOf('status');
    check(name, `columns ${tag}: ${other}+Shift+arrow does nothing; ${mod}+Shift+${toEnd} × 3 moves « status » three places; the focus stays on it, fully seen; one sentence after the pause`,
      JSON.stringify(k1) === JSON.stringify(k0) && k2.indexOf('status') === Math.min(k0.length - 1, i0 + 3) && focus.col === 'status' && focus.seen && said.filter((x) => /status|Statut|الحالة/.test(x) || /\d/.test(x)).length >= 1 && said.length <= 2, { k0, k1, k2, focus, said });
    await page.keyboard.press(`${mod}+Shift+Home`);
    await frames(page, 2);
    check(name, `columns ${tag}: ${mod}+Shift+Home: first place`, (await order())[0] === 'status' && (await page.evaluate(() => document.activeElement.dataset.col)) === 'status', await order());

    // 6. axe mid-drag and after; forced colours: the bar in Highlight.
    const c = await head('client');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 60, c.y, { steps: 4 });
    await frames(page, 2);
    let v = await axe(page);
    const hidden = await page.evaluate(() => document.querySelector('.dzg-move')?.getAttribute('aria-hidden'));
    check(name, `columns ${tag}: axe 0 mid-drag (the layer aria-hidden)`, v.length === 0 && hidden === 'true', { v, hidden });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.mouse.move(c.x + 80, c.y, { steps: 2 });
    await frames(page, 2);
    const fc = await page.evaluate(() => {
      const b = document.querySelector('.dzg-move-bar');
      const probe = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'background: Highlight' }));
      const want = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { got: b && getComputedStyle(b).backgroundColor, want };
    });
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await frames(page, 2);
    v = await axe(page);
    check(name, `columns ${tag}: forced colours: the bar in Highlight; Escape cancels; axe 0 after`, fc.got === fc.want && v.length === 0 && !(await page.evaluate(() => !!document.querySelector('.dzg-move'))), { fc, v });

    // 8. A finger never drags (CDP touch): the header scrolls, no column moves.
    const t0 = await order();
    const cdp = await ctx.newCDPSession(page);
    const p = await head('day');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + i * 30, y: p.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames(page, 2);
    check(name, `columns ${tag}: a finger dragged on a header never moves a column (Q-M3)`, JSON.stringify(await order()) === JSON.stringify(t0) && !(await page.evaluate(() => document.querySelector('.dzg')?.hasAttribute('data-dzg-dragging'))), await order());
    check(name, `columns ${tag}: no page error (keys, axe, touch)`, errors.length === 0, errors);
    await page.close();
  }
  if (name === 'chrome') await thousand(name, ctx, h);
}

/** 7. 1 000 columns × 1 000 rows on a bare page of the playground's server: times printed, not gated (Q17d). */
async function thousand(name, ctx, { check, frames }) {
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/index.html`);
  const src = '/@fs/Users/nadou/Dev/dzgrid/packages/dom/src';
  await page.evaluate(async (src) => {
    const { createGrid } = await import(`${src}/index.ts`);
    const { columns } = await import(`${src}/columns.ts`);
    const { EN } = await import(`${src}/locales/en.ts`);
    const { EN_COLUMNS } = await import(`${src}/locales/en-columns.ts`);
    document.body.replaceChildren();
    const host = document.body.appendChild(document.createElement('div'));
    host.style.cssText = 'inline-size: 1200px; block-size: 600px';
    const cols = Array.from({ length: 1000 }, (_, i) => ({ id: `k${i}`, header: `K${i}`, width: 90, value: (r) => r.n * i }));
    const rows = Array.from({ length: 1000 }, (_, n) => ({ id: `r${n}`, n }));
    const f = columns();
    window.g = createGrid(host, { rows, getRowId: (r) => r.id, columns: cols, messages: { locale: 'en', text: { ...EN.text, ...EN_COLUMNS.text } }, features: [f] });
    window.f = f;
  }, src);
  await page.waitForSelector('.dzg-header .dzg-hcell[data-col="k2"]');
  await frames(page, 3);
  const box = await page.evaluate(() => { const r = document.querySelector('.dzg-header .dzg-hcell[data-col="k2"]').getBoundingClientRect(); const v = document.querySelector('.dzg-viewport').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, end: v.right - 10 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y, { steps: 2 });
  await page.mouse.move(box.end, box.y, { steps: 6 });
  const s0 = await page.evaluate(() => window.g.context.geometry.read().scrollInline);
  await page.waitForTimeout(2000);
  const s1 = await page.evaluate(() => window.g.context.geometry.read().scrollInline);
  const across = Math.round(((s1 - s0) / 2) * 10) / 10;
  // The far end: 90 000 px at ≤ 24 px a frame is about a minute; the view is taken there, the drag still under way.
  await page.evaluate(() => { const g = window.g.context; const L = g.columns.layout; g.geometry.writeScrollInline(L.center.width); g.el.viewport.dispatchEvent(new Event('scroll')); });
  await frames(page, 3);
  const drop = await page.evaluate(() => new Promise((ok) => {
    const t = performance.now();
    window.g.kernel.subscribe((e) => { if (e.type === 'columnsChanged') requestAnimationFrame(() => requestAnimationFrame(() => ok(performance.now() - t))); });
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: window.innerWidth - 300, clientY: 20 }));
  }));
  await page.mouse.up();
  const last = await page.evaluate(() => window.g.kernel.columns.visible().map((c) => c.id).indexOf('k2'));
  const key = await page.evaluate(() => { const t = performance.now(); window.f.api(window.g).move('k500', 1, { say: false }); return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(performance.now() - t)))); });
  console.log(`     columns 1 000 × 1 000: auto-scroll ${across} px/s; drop (patch + paint) ${drop.toFixed(1)} ms; a key move ${key.toFixed(1)} ms (not gated, Q17d)`);
  check(name, `columns 1 000 × 1 000: a drag across with auto-scroll, a drop at the far end (k2 at ${last}), a key move; times printed; no page error`, last > 900 && errors.length === 0, { last, errors });
  await page.close();
}
