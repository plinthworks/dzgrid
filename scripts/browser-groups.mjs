/**
 * Phase 6 step 7 in real browsers (docs/phase-6-steps/step08-plan.md §5; `-- --only groups`): the REAL playground page
 * `spans.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — section 4, « Patient » collapsible (Nom pinned at
 * the start by default, so the group is split by the pin).
 * Chrome, fr light and ar dark: the 24 × 24 button at the group header's inline end; a real click closes (Prénom, Âge
 * go; the band narrows) and does not take the focus (a focused Âge header goes to « Patient »); every group cell aligned
 * to 1 px with the column headers under it, after each toggle and scrolled sideways; widths back on open; Enter / Space
 * on the focused group header; the chevron's angle (down open, toward the inline end closed, mirrored in Arabic);
 * forced colours: `ButtonText`; no page error. Firefox and WebKit (`--engine`): the keys, the RTL chevron, the alignment.
 */
export async function groupsChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  for (const lang of ['fr', 'ar']) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 1000 });
    if (lang === 'ar') await page.emulateMedia({ colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/spans.html`);
    await page.waitForSelector('#groups .dzg-hgroup');
    if (lang === 'ar') {
      await page.selectOption('select[name=lang]', 'ar');
      await page.waitForFunction(() => document.querySelector('#groups')?.dir === 'rtl' && document.querySelector('#groups .dzg-gtoggle'));
    }
    await page.locator('#groups').scrollIntoViewIfNeeded();
    await frames(page, 3);
    const tag = `${name} ${lang}`;
    const rtl = lang === 'ar';
    /** The groups grid as seen: shown columns, Patient's buttons and cells, alignment of every group cell. */
    const seen = () => page.evaluate(() => {
      const host = document.getElementById('groups');
      const r = (el) => el.getBoundingClientRect();
      const hc = [...host.querySelectorAll('.dzg-header .dzg-hcell[data-col]:not(.dzg-hgroup)')];
      const heads = new Map(hc.map((c) => [c.dataset.col, r(c)]));
      const order = window.spansDemo[2].context.columns.visible().map((c) => c.id);
      // A group cell spans its first column and `aria-colspan` columns after it, in the visible order.
      const misaligned = [...host.querySelectorAll('.dzg-hgroup')].flatMap((g) => {
        const i = order.indexOf(g.dataset.col);
        const cols = order.slice(i, i + Number(g.getAttribute('aria-colspan'))).map((id) => heads.get(id)).filter(Boolean);
        if (!cols.length) return [];
        const lo = Math.min(...cols.map((c) => c.left));
        const hi = Math.max(...cols.map((c) => c.right));
        const b = r(g);
        return Math.abs(b.left - lo) > 1 || Math.abs(b.right - hi) > 1 ? [`${g.firstChild.textContent}@${g.dataset.col}: ${b.left}-${b.right} vs ${lo}-${hi}`] : [];
      });
      const cells = [...host.querySelectorAll('.dzg-hgroup[data-g="g-patient"]')];
      const btns = cells.map((c) => c.querySelector('.dzg-gtoggle')).filter(Boolean);
      const b = btns[0];
      const before = b && getComputedStyle(b, '::before');
      return {
        order, misaligned, pieces: cells.length, buttons: btns.length,
        box: b && { w: Math.round(r(b).width), h: Math.round(r(b).height), atEnd: getComputedStyle(host.querySelector('.dzg')).direction === 'rtl' ? Math.abs(r(b).left - r(b.parentElement).left) <= 1 : Math.abs(r(b).right - r(b.parentElement).right) <= 1 },
        expanded: b?.getAttribute('aria-expanded'), label: b?.getAttribute('aria-label'), name: cells[0]?.getAttribute('aria-label'),
        rotate: before?.rotate, active: document.activeElement?.classList.contains('dzg-hgroup') ? `group:${document.activeElement.dataset.g}` : document.activeElement?.dataset?.col ?? null,
        widths: Object.fromEntries([...heads].map(([k, v]) => [k, Math.round(v.width)])),
        said: document.querySelector('#groups .dzg-live')?.textContent ?? '',
      };
    });
    const btnOf = () => page.locator('#groups .dzg-hgroup[data-g="g-patient"] .dzg-gtoggle').first();

    let s = await seen();
    check(name, `${tag}: « Patient » split by the pin, a button on each piece, 24 × 24 at the inline end, open (aria-expanded), named; cells aligned`,
      s.pieces === 2 && s.buttons === 2 && s.box.w === 24 && s.box.h === 24 && s.box.atEnd && s.expanded === 'true' && !!s.label && !!s.name && s.misaligned.length === 0, s);
    check(name, `${tag}: chevron (a character) open turned down (${rtl ? '-90deg' : '90deg'})`, s.rotate === (rtl ? '-90deg' : '90deg'), s.rotate);
    const open = s;

    // A real click on the button while Âge's header has the focus: closed, the focus goes to « Patient ».
    await page.locator('#groups .dzg-header .dzg-hcell[data-col="age"]').click();
    await btnOf().click();
    // The polite region is emptied, then written after a pause.
    await page.waitForFunction(() => document.querySelector('#groups .dzg-live')?.textContent, null, { timeout: 3000 }).catch(() => {});
    await frames(page, 2);
    s = await seen();
    check(name, `${tag}: a click closes « Patient »: Prénom and Âge gone, one piece left, aligned; the focus from Âge to « Patient »`,
      !s.order.includes('prenom') && !s.order.includes('age') && s.order.includes('nom') && s.pieces === 1 && s.expanded === 'false' && s.misaligned.length === 0 && s.active === 'group:g-patient', s);
    check(name, `${tag}: chevron closed unturned, toward the inline end (0deg; mirrored right to left by the character)`, s.rotate === '0deg', s.rotate);
    check(name, `${tag}: the sentence said, with the count of columns shown (1)`, s.said === (rtl ? 'طُويت المريض، الأعمدة الظاهرة: 1' : 'Patient fermé, colonnes affichées : 1'), s.said);

    // Scrolled sideways, still aligned.
    await page.evaluate(() => { const v = document.querySelector('#groups .dzg-viewport'); v.scrollLeft = (getComputedStyle(v).direction === 'rtl' ? -1 : 1) * 200; v.dispatchEvent(new Event('scroll')); });
    await frames(page, 3);
    s = await seen();
    check(name, `${tag}: scrolled sideways with « Patient » closed: group cells aligned`, s.misaligned.length === 0, s.misaligned);
    await page.evaluate(() => { const v = document.querySelector('#groups .dzg-viewport'); v.scrollLeft = 0; v.dispatchEvent(new Event('scroll')); });
    await frames(page, 2);

    // Keys on the focused group header: Enter opens, Space closes, Enter opens again; the focus stays on it.
    await page.keyboard.press('Enter');
    await frames(page, 2);
    s = await seen();
    const enter = s.expanded === 'true' && s.order.includes('age') && s.active === 'group:g-patient';
    await page.keyboard.press(' ');
    await frames(page, 2);
    const space = (await seen()).expanded === 'false';
    await page.keyboard.press('Enter');
    await frames(page, 2);
    s = await seen();
    check(name, `${tag}: Enter and Space on the focused group header toggle it, the focus stays there`, enter && space && s.expanded === 'true' && s.active === 'group:g-patient', { enter, space, s });
    check(name, `${tag}: opened again, widths as before, aligned`, JSON.stringify(s.widths) === JSON.stringify(open.widths) && s.misaligned.length === 0, { before: open.widths, after: s.widths });

    if (name === 'chrome') {
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => {
        const b = document.querySelector('#groups .dzg-gtoggle');
        const probe = document.body.appendChild(Object.assign(document.createElement('span'), { style: 'color: ButtonText' }));
        const out = { button: getComputedStyle(b).color, before: getComputedStyle(b, '::before').color, ButtonText: getComputedStyle(probe).color };
        probe.remove();
        return out;
      });
      check(name, `${tag}: forced colours: the chevron in ButtonText`, fc.button === fc.ButtonText && fc.before === fc.ButtonText, fc);
      await page.emulateMedia({ forcedColors: 'none' });
      await page.screenshot({ path: `${h.OUT}/${name}-groups-${lang}.png`, clip: { x: 0, y: 0, width: 1280, height: 1000 }, fullPage: false }).catch(() => {});
    }
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
