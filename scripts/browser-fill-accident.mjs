/**
 * The owner's report of 2026-10-26 on the REAL playground `orders-edit.html?focus=range` (127.0.0.1:4700, or
 * DZG_PLAYGROUND; never restarted), real mouse, fr light and ar dark, called by scripts/browser.mjs with the fill checks:
 * - a press in a cell near its corner but off the handle's square (16 px and 12 px in) starts a SELECTION, never a fill;
 *   a press on the square fills;
 * - the owner's gesture: a drag-select Client O-0001 → Qté O-0007, released there: the focus and the handle on O-0007 /
 *   Qté (the block's corner, never a single-cell handle elsewhere); the handle dragged down 3 rows: the WHOLE block's
 *   rows repeated (clients O-0001…O-0003 in O-0008…O-0010), by hand; Ctrl+Z gives them back;
 * - Escape after a drag-select: the block gone, the focus on its start cell, no handle (S12-Q15, S12-Q16); a click outside the grid clears the block and
 *   hides its handle (S12-Q13, replacing S12-Q11); one cell without a block: a click outside hides its handle, a click back shows it (fill.md 25);
 * - « Envoyer la sélection (simulé) »: 0.6 s later the block is cleared by the application (`clear()`), logged
 *   « Sélection envoyée puis effacée », and the grid says nothing of it (an api clear is never said).
 */
export async function fillAccidentChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}&focus=range`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    await page.evaluate(() => { window.said = []; for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    const cell = (ref, col) => page.evaluate(([ref, col]) => {
      const c = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: c.textContent };
    }, [ref, col]);
    const state = () => page.evaluate(() => {
      const refOf = (el) => el?.closest('.dzg-row')?.querySelector('[data-col="ref"]')?.textContent;
      const a = document.activeElement;
      const fh = document.querySelector('.dzg-fill');
      const cs = [...document.querySelectorAll('.dzg-cell--range')];
      return { focus: a?.classList.contains('dzg-cell') ? `${refOf(a)}/${a.dataset.col}` : null, n: cs.length, handle: fh ? `${refOf(fh)}/${fh.closest('.dzg-cell').dataset.col}` : null, handles: document.querySelectorAll('.dzg-fill').length, filling: document.querySelector('.dzg').hasAttribute('data-dzg-filling'), shown: !!fh && getComputedStyle(fh).display !== 'none', quiet: document.querySelector('.dzg').hasAttribute('data-dzg-quiet') };
    });
    const ref = (i) => `O-${String(i).padStart(4, '0')}`;
    /** A point `d` px in from a cell's bottom inline-end corner (bottom-left right to left). */
    const inCorner = (c, d) => ({ x: ar ? c.left + d : c.right - d, y: c.bottom - d });

    // 1. A press near the corner of the focused cell, off the square, then a drag down two rows: a selection, nothing written.
    for (const d of [16, 12]) {
      const c = await cell('O-0004', 'amount');
      await page.mouse.click(c.x, c.y);
      await frames(page, 2);
      const before = await Promise.all([5, 6].map(async (i) => (await cell(ref(i), 'amount')).text));
      const p = inCorner(c, d);
      const t = await cell('O-0006', 'amount');
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 8 });
      const mid = await state();
      await page.mouse.up();
      await frames(page, 2);
      const s = await state();
      const after = await Promise.all([5, 6].map(async (i) => (await cell(ref(i), 'amount')).text));
      check(name, `fill accident ${tag}: a press ${d} px in from O-0004 / Montant's corner (off the handle's square) and a drag 2 rows down selects a block of 3 cells, the focus on its start O-0004 (S12-Q15), nothing written`, !mid.filling && s.n === 3 && s.focus === 'O-0004/amount' && JSON.stringify(after) === JSON.stringify(before), { mid, s, before, after });
      await page.keyboard.press('Escape');
    }
    // 1 bis. A press ON the square (3 px in) fills.
    {
      const c = await cell('O-0004', 'qty');
      await page.mouse.click(c.x, c.y);
      await frames(page, 2);
      const sq = await page.evaluate(() => { const r = document.querySelector('.dzg-fill').getBoundingClientRect(); return { w: r.width, h: r.height }; });
      const v = (await cell('O-0004', 'qty')).text;
      const p = inCorner(c, 3);
      const t = await cell('O-0005', 'qty');
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 8 });
      const mid = await state();
      await page.mouse.up();
      await frames(page, 2);
      const got = (await cell('O-0005', 'qty')).text;
      check(name, `fill accident ${tag}: the handle's hit box is 10 × 10 px; a press on its square (3 px in) dragged one row fills O-0005 with ${v}`, sq.w === 10 && sq.h === 10 && mid.filling && got === v, { sq, mid, got, v });
      await page.waitForTimeout(900);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(900);
    }

    // 2. The owner's gesture: drag-select Client O-0001 → Qté O-0007; the handle on the block's corner; dragged down 3 rows.
    {
      const a = await cell('O-0001', 'client');
      const z = await cell('O-0007', 'qty');
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(z.x, z.y, { steps: 12 });
      await page.mouse.up();
      await frames(page, 2);
      const s = await state();
      check(name, `fill accident ${tag}: a drag-select Client O-0001 → Qté O-0007 released on O-0007: 7 × 4 cells, the focus on the start O-0001 / Client (S12-Q15), the only handle on O-0007 / Qté`, s.n === 28 && s.focus === 'O-0001/client' && s.handle === 'O-0007/qty' && s.handles === 1, s);
      const src = await Promise.all([1, 2, 3].map(async (i) => (await cell(ref(i), 'client')).text));
      const before = await Promise.all([8, 9, 10].map(async (i) => (await cell(ref(i), 'client')).text));
      const c = await cell('O-0007', 'qty');
      const p = inCorner(c, 3);
      const t = await cell('O-0010', 'qty');
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(t.x, t.y, { steps: 10 });
      await page.mouse.up();
      await frames(page, 2);
      const got = await Promise.all([8, 9, 10].map(async (i) => (await cell(ref(i), 'client')).text));
      const s2 = await state();
      check(name, `fill accident ${tag}: the block's handle dragged down 3 rows repeats the whole block (clients of O-0001…O-0003 in O-0008…O-0010), the block O-0001…O-0010, the handle on O-0010`, JSON.stringify(got) === JSON.stringify(src) && s2.n === 40 && s2.handle === 'O-0010/qty', { src, got, s2 });
      await page.waitForTimeout(900);
      await page.keyboard.press('ControlOrMeta+z');
      await page.waitForTimeout(900);
      const back = await Promise.all([8, 9, 10].map(async (i) => (await cell(ref(i), 'client')).text));
      check(name, `fill accident ${tag}: Ctrl+Z gives the three rows back`, JSON.stringify(back) === JSON.stringify(before), { back, before });
      await page.keyboard.press('Escape');
    }

    // 3. Escape after a drag-select: the block gone, the focus kept on its start cell (S12-Q15), the quiet state
    // (S12-Q16); a click outside the grid clears the block and, the focus gone, its handle (S12-Q13; fill.md 25).
    {
      const a = await cell('O-0002', 'client');
      const z = await cell('O-0005', 'status');
      const select = async () => {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(z.x, z.y, { steps: 6 });
        await page.mouse.up();
        await frames(page, 2);
      };
      await select();
      await page.keyboard.press('Escape');
      await frames(page, 2);
      const s = await state();
      await select();
      const made = await state();
      const t = await page.evaluate(() => { const r = document.getElementById('title').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
      await page.mouse.click(t.x, t.y);
      await frames(page, 2);
      await page.waitForTimeout(50);
      const off = await state();
      check(name, `fill accident ${tag}: Escape after a drag-select clears the block, the focus kept on its start O-0002 / Client, no handle shown (the quiet state, S12-Q16); a block again, then a click outside the grid clears it and hides the handle (S12-Q13, fill.md 25)`, s.n === 0 && s.focus === 'O-0002/client' && s.quiet && !s.shown && made.n === 12 && off.n === 0 && off.handles === 0, { s, made, off });
    }

    // 3b. One cell, no block: a click outside the grid hides its handle with the focus ring; a click back shows it (fill.md 25).
    {
      const c = await cell('O-0003', 'amount');
      await page.mouse.click(c.x, c.y);
      await frames(page, 2);
      const on = await state();
      const t = await page.evaluate(() => { const r = document.getElementById('title').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
      await page.mouse.click(t.x, t.y);
      await frames(page, 3);
      const off = await state();
      const drawn = await page.evaluate(() => [...document.querySelectorAll('.dzg-fill')].filter((x) => x.getBoundingClientRect().width > 0).length);
      await page.mouse.click(c.x, c.y);
      await frames(page, 2);
      const back = await state();
      check(name, `fill accident ${tag}: one cell O-0003 / Montant clicked, then a click outside the grid: no handle drawn; clicked again: the handle back on it (fill.md 25)`, on.handle === 'O-0003/amount' && on.n === 0 && off.handles === 0 && drawn === 0 && off.focus === null && back.handle === 'O-0003/amount', { on, off, drawn, back });
    }

    // 4. « Envoyer la sélection (simulé) »: cleared by the application 0.6 s later, logged, not said by the grid.
    {
      const a = await cell('O-0002', 'qty');
      const z = await cell('O-0004', 'amount');
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(z.x, z.y, { steps: 6 });
      await page.mouse.up();
      await frames(page, 2);
      await page.waitForTimeout(600);
      await page.evaluate(() => (window.said.length = 0));
      const n0 = (await state()).n;
      const label = await page.locator('#send-block').textContent();
      await page.locator('#send-block').click();
      await page.waitForTimeout(250);
      const mid = (await state()).n;
      await page.waitForTimeout(700);
      const s = await state();
      const log = await page.evaluate(() => document.getElementById('log').textContent);
      const said = await page.evaluate(() => window.said.join(' | '));
      check(name, `fill accident ${tag}: « ${label} » keeps the block of 6 while the pretend server answers, then the application clears it; logged « ${ar ? 'أُرسل التحديد ثم مُسح' : 'Sélection envoyée puis effacée'} (6 …) », the grid says nothing`, label === (ar ? 'إرسال التحديد (محاكاة)' : 'Envoyer la sélection (simulé)') && n0 === 6 && mid === 6 && s.n === 0 && log.includes(ar ? 'أُرسل التحديد ثم مُسح (6' : 'Sélection envoyée puis effacée (6') && !/Sélection effacée|أُلغي التحديد/.test(said), { label, n0, mid, s, log, said });
    }
    // 4 bis. The block changed while the pretend server answers: the application leaves it alone.
    {
      const a = await cell('O-0002', 'qty');
      const z = await cell('O-0003', 'amount');
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(z.x, z.y, { steps: 6 });
      await page.mouse.up();
      await frames(page, 2);
      await page.locator('#send-block').click();
      await page.evaluate(() => document.querySelector('.dzg-cell[tabindex="0"]')?.focus());
      await page.keyboard.press('Shift+ArrowDown');
      await page.waitForTimeout(900);
      const s = await state();
      const log = await page.evaluate(() => document.getElementById('log').textContent);
      check(name, `fill accident ${tag}: a block changed during the pretend send (Shift+↓) is kept (6 cells), logged « ${ar ? 'تغيّر التحديد أثناء الإرسال' : 'Sélection modifiée pendant l’envoi'} »`, s.n === 6 && log.includes(ar ? 'تغيّر التحديد أثناء الإرسال' : 'Sélection modifiée pendant l\u2019envoi'), { s, log });
      await page.keyboard.press('Escape');
    }
    check(name, `fill accident ${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
