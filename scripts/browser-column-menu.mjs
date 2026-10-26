/**
 * Phase 6 step 3 in real browsers (docs/phase-6-steps/step03-plan.md §8), called by scripts/browser.mjs
 * (`-- --only column-menu`; `--engine firefox|webkit`: the right-click and the keys only): the REAL playground page
 * `orders-edit.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted.
 * - A real right-click on a header: our menu, the browser's `contextmenu` prevented; Shift+right-click: not prevented,
 *   no menu. Shift+F10, the Menu key, Alt+ArrowDown on a focused header: one menu, its first item focused, every
 *   `contextmenu` the engine sends after prevented; Escape and Tab back to the header.
 * - Chrome: a block selected with the real mouse, the ⋮ pressed, « Recopier vers le bas » clicked: the cells written, the
 *   block still drawn, the sentence (S12-Q12); « Élargir » three times: +30 px, the menu not moved, one sentence; fr light
 *   and ar dark: the ⋮ at the inline end, the menu's end edge on the button's, a right-click's menu opening from the
 *   pointer (leftward in Arabic), every target ≥ 24 × 24, the ⋮ gone under 96 px; axe 0 with the menu open; forced
 *   colours (the focused item in Highlight); a 320 px view: the menu inside it.
 */
export async function columnMenuChecks(name, ctx, h) {
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
      window.menus = [];
      for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true });
      // Every contextmenu event, as it ends: prevented or not (the browser's own menu shows when not).
      window.addEventListener('contextmenu', (e) => window.menus.push(e.defaultPrevented));
    });
    const head = (col) => page.evaluate((col) => {
      const c = document.querySelector(`.dzg-header .dzg-hcell[data-col="${col}"]:not(.dzg-hgroup):not(.dzg-hextra)`);
      const r = c?.getBoundingClientRect();
      const b = c?.querySelector(':scope > .dzg-mbtn')?.getBoundingClientRect();
      return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, w: r.width, btn: b && { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right, w: b.width, h: b.height } };
    }, col);
    /** The open menu: its box, its items' ids and boxes, the focused one. */
    const menu = () => page.evaluate(() => {
      const l = document.querySelector('.dzg-popup [role=menu]');
      if (!l) return null;
      const p = l.closest('.dzg-popup').getBoundingClientRect();
      const items = [...l.querySelectorAll('[role^=menuitem]')].map((x) => { const r = x.getBoundingClientRect(); return { id: x.dataset.id, w: r.width, h: r.height }; });
      return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, count: document.querySelectorAll('[role=menu]').length, items, focused: document.activeElement?.dataset?.id ?? null };
    });
    const active = () => page.evaluate(() => (document.activeElement?.closest('.dzg-hcell')?.dataset.col ?? null) + (document.activeElement?.matches('.dzg-hcell') ? ':header' : ''));
    const focusHeader = async (col) => {
      await page.evaluate((col) => { window.demo.grid.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: col } }, 'user'); document.querySelector(`.dzg-header .dzg-hcell[data-col="${col}"]:not(.dzg-hgroup)`).focus(); }, col);
      await frames(page, 1);
    };
    const reset = () => page.evaluate(() => (window.menus = []));

    // 1. A real right-click; then Shift+right-click (the browser's).
    const q = await head('qty');
    await reset();
    await page.mouse.click(q.x - 10, q.y, { button: 'right' });
    await frames(page, 2);
    const m1 = await menu();
    const ev1 = await page.evaluate(() => window.menus);
    check(name, `column-menu ${tag}: a real right-click on « qty »: our menu (one), its first item focused, the browser's menu prevented`, m1 && m1.count === 1 && m1.focused === m1.items[0]?.id && ev1.length === 1 && ev1[0] === true, { m1, ev1 });
    if (chrome) check(name, `column-menu ${tag}: by the pointer, its start corner at the pointer (${ar ? 'opening leftward' : 'opening rightward'})`, m1 && (ar ? Math.abs(m1.right - (q.x - 10)) <= 3 : Math.abs(m1.left - (q.x - 10)) <= 3), { m1, x: q.x - 10 });
    await page.keyboard.press('Escape');
    await frames(page, 1);
    await reset();
    await page.keyboard.down('Shift');
    await page.mouse.click(q.x - 10, q.y, { button: 'right' });
    await page.keyboard.up('Shift');
    await frames(page, 2);
    const ev2 = await page.evaluate(() => window.menus);
    // The native menu (if any) closed.
    await page.keyboard.press('Escape');
    // Firefox sends no event to the page for a Shift+right-click (its own menu, always): none, or one not prevented.
    check(name, `column-menu ${tag}: Shift+right-click keeps the browser's menu: not prevented (${ev2.length} event), none of ours`, (await menu()) === null && ev2.length <= 1 && ev2.every((x) => x === false), { ev2 });

    // 1b. A Mac's Ctrl+click (this machine is a Mac: the grid takes Cmd for its keys): when the engine turns it into
    // `contextmenu`, our menu and no sort; an engine that does not (headless) is said, not failed.
    if (await page.evaluate(() => window.demo.grid.context.mac)) {
      await reset();
      const sorts0 = await page.evaluate(() => JSON.stringify(window.demo.grid.kernel.query.sort));
      await page.keyboard.down('Control');
      await page.mouse.click(q.x - 10, q.y);
      await page.keyboard.up('Control');
      await frames(page, 2);
      const ev = await page.evaluate(() => window.menus);
      const sorted = (await page.evaluate(() => JSON.stringify(window.demo.grid.kernel.query.sort))) !== sorts0;
      const m = await menu();
      check(name, `column-menu ${tag}: a Mac's Ctrl+click on « qty »: ${ev.length ? 'our menu, no sort' : 'the engine sends no contextmenu here (headless): nothing to check'}`, ev.length ? !!m && !sorted && ev.every((x) => x === true) : true, { ev, sorted, m: !!m });
      await page.keyboard.press('Escape');
      if (sorted) await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'sort.set', sort: [] }, 'api'));
    }

    // 2. The keys on a focused header.
    for (const [label, press] of [['Shift+F10', 'Shift+F10'], ['the Menu key', 'ContextMenu'], ['Alt+ArrowDown (no filter popup)', 'Alt+ArrowDown']]) {
      await focusHeader('amount');
      await reset();
      await page.keyboard.press(press);
      await frames(page, 2);
      const m = await menu();
      const ev = await page.evaluate(() => window.menus);
      check(name, `column-menu ${tag}: ${label} on « amount »: one menu, its first item focused; any contextmenu the engine sent prevented (${ev.length})`, m && m.count === 1 && m.focused === m.items[0]?.id && ev.every((x) => x === true), { m, ev });
      await page.keyboard.press(label === 'Shift+F10' ? 'Tab' : 'Escape');
      await frames(page, 1);
      check(name, `column-menu ${tag}: ${label === 'Shift+F10' ? 'Tab' : 'Escape'} closes it, the focus back on the header`, (await menu()) === null && (await active()) === 'amount:header', await active());
    }

    if (chrome) {
      // 3. A block with the real mouse, the ⋮, « Recopier vers le bas ».
      const cell = (row, col) => page.evaluate(([row, col]) => { const r = [...document.querySelectorAll('.dzg-layer > .dzg-row')][row].querySelector(`.dzg-cell[data-col="${col}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [row, col]);
      const qtys = () => page.evaluate(() => [...document.querySelectorAll('.dzg-layer > .dzg-row')].slice(0, 6).map((r) => r.querySelector('.dzg-cell[data-col="qty"]').textContent));
      const a = await cell(1, 'qty');
      const b = await cell(3, 'qty');
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up();
      await frames(page, 2);
      const before = await qtys();
      const ranged = () => page.evaluate(() => document.querySelectorAll('.dzg-cell.dzg-cell--range').length);
      const r0 = await ranged();
      await reset();
      const h1 = await head('qty');
      await page.mouse.move(h1.x, h1.y);
      await page.mouse.click(h1.btn.x, h1.btn.y);
      await frames(page, 2);
      const r1 = await ranged();
      const fillItem = await page.evaluate(() => { const x = document.querySelector('[data-id="fill.down"]'); const r = x?.getBoundingClientRect(); return x && { x: r.left + r.width / 2, y: r.top + r.height / 2, off: x.getAttribute('aria-disabled') }; });
      await page.mouse.click(fillItem.x, fillItem.y);
      await frames(page, 3);
      await page.waitForTimeout(300);
      const after = await qtys();
      const said = await page.evaluate(() => window.said.join(' | '));
      check(name, `column-menu ${tag}: a mouse block, the ⋮, « Recopier vers le bas »: the block kept through the menu (${r0} → ${r1} cells), the first row copied down, still drawn, said`,
        r0 === 3 && r1 === 3 && fillItem.off === null && after[2] === before[1] && after[3] === before[1] && (await ranged()) === 3 && (ar ? /التعبئة/ : /recopiées/).test(said) && (await menu()) === null, { r0, r1, fillItem, before, after, said });

      // 4. « Élargir » three times.
      const w0 = (await head('qty')).w;
      await page.mouse.click(h1.btn.x, h1.btn.y);
      await frames(page, 2);
      const box0 = await menu();
      await page.evaluate(() => (window.said = []));
      for (let i = 0; i < 3; i++) {
        const it = await page.evaluate(() => { const r = document.querySelector('[data-id="size.widen"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.click(it.x, it.y);
        await frames(page, 1);
      }
      const box1 = await menu();
      await page.waitForTimeout(600);
      const w1 = (await head('qty')).w;
      const said4 = await page.evaluate(() => window.said.filter((s) => /pixels|بكسل/.test(s)));
      check(name, `column-menu ${tag}: « Élargir » ×3: +30 px (${w0} → ${w1}), the menu open and not moved, one sentence`, Math.round(w1 - w0) === 30 && box1 && Math.abs(box1.left - box0.left) < 0.5 && Math.abs(box1.top - box0.top) < 0.5 && said4.length === 1, { w0, w1, box0, box1, said4 });

      // 5. Placement, targets, the 96 px rule.
      const h5 = await head('qty');
      // The menu as opened (before « Élargir » moved the button under it: a menu is never moved while open).
      check(name, `column-menu ${tag}: the ⋮ at the header's inline end (${ar ? 'left' : 'right'}); the menu's end edge on the button's`,
        h5.btn && (ar ? h5.btn.x < h5.x : h5.btn.x > h5.x) && box0 && (ar ? Math.abs(box0.left - h1.btn.left) <= 1.5 : Math.abs(box0.right - h1.btn.right) <= 1.5), { h5, h1, box0 });
      check(name, `column-menu ${tag}: every target ≥ 24 × 24 (the ⋮ and each item)`, h5.btn.w >= 24 && h5.btn.h >= 24 && box1.items.every((x) => x.h >= 24 && x.w >= 24), { btn: h5.btn, items: box1.items });
      // 6. axe with the menu open; forced colours.
      const v = await (async () => { await h.axe(page); return page.evaluate(async () => (await window.axe.run(document.querySelector('.dzg'), { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`)); })();
      check(name, `column-menu ${tag}: axe 0 with the menu open`, v.length === 0, v);
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => { const x = document.activeElement; const s = getComputedStyle(x); return { bg: s.backgroundColor, fg: s.color, id: x.dataset.id }; });
      await page.emulateMedia({ forcedColors: 'none' });
      check(name, `column-menu ${tag}: forced colours: the focused item filled (Highlight), its text apart`, fc.bg !== 'rgba(0, 0, 0, 0)' && fc.bg !== fc.fg, fc);
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'column.resize', column: 'qty', width: 90, finished: true }, 'api'));
      await frames(page, 2);
      const n90 = (await head('qty')).btn;
      await page.evaluate(() => window.demo.grid.kernel.dispatch({ type: 'column.resize', column: 'qty', width: 100, finished: true }, 'api'));
      await frames(page, 2);
      const n100 = (await head('qty')).btn;
      check(name, `column-menu ${tag}: the ⋮ gone at 90 px, back at 100 px`, !n90 && !!n100, { n90, n100 });
      // 320 px view (1.4.10): the menu inside it, scrolling inside if taller.
      await page.setViewportSize({ width: 320, height: 480 });
      await frames(page, 3);
      await focusHeader((await page.evaluate(() => window.demo.grid.kernel.columns.visible()[0].id)));
      await page.keyboard.press('Shift+F10');
      await frames(page, 2);
      const small = await page.evaluate(() => { const p = document.querySelector('.dzg-popup:has([role=menu])').getBoundingClientRect(); const l = document.querySelector('[role=menu]'); return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, scrolls: l.scrollHeight > l.clientHeight }; });
      check(name, `column-menu ${tag}: a 320 × 480 view: the menu inside it (${Math.round(small.left)}–${Math.round(small.right)}, ${Math.round(small.top)}–${Math.round(small.bottom)})`, small.left >= 0 && small.right <= 320.5 && small.top >= 0 && small.bottom <= 480.5, small);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    check(name, `column-menu ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
