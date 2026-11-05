/**
 * Phase 7 steps 5–6 in real browsers (`npm run test:browser -- --only grouping`, `--engine firefox|webkit` for the other
 * engines): the page packages/dom/test/browser/grouping.html (made-up shops grouped by region then fruit, footers, the
 * band, the column menu).
 * Every engine: the group column's keys in French and Arabic (forward opens, back closes, mirrored), Enter on a group row;
 * the band's arrows mirrored and Ctrl+Shift+arrows; a chip dragged by the mouse in both directions; no page error.
 * Chrome: axe 0 in fr / ar, light / dark, a group open with its footer; 24 px targets (chevron, chip, ×); totals cells
 * aligned with their column's header, pinned columns included; forced colours; a header dropped onto the band; the
 * column menu's « Regrouper par cette colonne »; the exit criterion — a group of 10 000 rows opened to the next frame
 * (median of 6) ≤ 30 ms; screenshots fr and ar dark in packages/dom/test/browser/results/.
 */
export async function groupingChecks(name, ctx, h) {
  const { check, frames, site, axe, OUT } = h;
  const open = async (qs, scheme = 'light') => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site.root(`packages/dom/test/browser/grouping.html?${qs}`));
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
    await frames(page, 3);
    return { page, errors };
  };
  const by = (page) => page.evaluate(() => [...window.t.api().by()]);
  const expanded = (page, i) => page.evaluate((i) => document.querySelector(`.dzg-layer > .dzg-row[aria-level="1"][aria-posinset="${i}"]`)?.getAttribute('aria-expanded'), i);
  const focusGroup = (page, i, col = 'shop') => page.evaluate(([i, col]) => {
    const { grid, groupKey, regions } = window.t;
    const sorted = [...regions].sort((a, b) => a.localeCompare(b, document.documentElement.lang));
    grid.api.focusCell(groupKey(['region', `t${sorted[i - 1]}`]), col);
  }, [i, col]);

  for (const lang of ['fr', 'ar']) {
    const rtl = lang === 'ar';
    const tag = `${name} ${lang}`;
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const { page, errors } = await open(`locale=${rtl ? 'ar-DZ' : 'fr-FR'}`);
    try {
      // ---- the group column's keys (tree-keys.md « On a grouped grid »), real key presses ----
      await focusGroup(page, 2);
      await frames(page);
      const was = await expanded(page, 2);
      await page.keyboard.press(fwd);
      await frames(page);
      const opened = await expanded(page, 2);
      await page.keyboard.press(back);
      await frames(page);
      const closed = await expanded(page, 2);
      await page.keyboard.press('Enter');
      await frames(page);
      const entered = await expanded(page, 2);
      await page.keyboard.press('Enter');
      await frames(page);
      check(name, `grouping ${lang}: ${fwd} opens a group, ${back} closes it, Enter opens and closes it`, was === 'false' && opened === 'true' && closed === 'false' && entered === 'true' && (await expanded(page, 2)) === 'false', { was, opened, closed, entered });

      // ---- the band (APG toolbar): arrows mirrored, Ctrl+Shift+arrows move a chip ----
      await page.focus('.dzg-gzone .dzg-chip');
      await page.keyboard.press(fwd);
      const onX = await page.evaluate(() => document.activeElement?.classList.contains('dzg-chip-x'));
      await page.keyboard.press(fwd);
      const second = await page.evaluate(() => document.activeElement?.textContent);
      await page.keyboard.press(`Control+Shift+${back}`);
      await frames(page);
      const moved = await by(page);
      const still = await page.evaluate(() => document.activeElement?.textContent);
      check(name, `grouping band ${lang}: ${fwd} goes chip → × → next chip; Ctrl+Shift+${back} moves it first, the focus with it`, onX && moved.join() === 'fruit,region' && still === second, { onX, second, moved, still });
      await page.evaluate(() => window.t.api().setBy(['region', 'fruit']));
      await frames(page);

      // ---- a chip dragged by the mouse past the next one (logically): moved; the gap marked meanwhile ----
      const boxes = await page.evaluate(() => [...document.querySelectorAll('.dzg-gchip')].map((c) => { const r = c.querySelector('.dzg-chip').getBoundingClientRect(); const o = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: o.left, r: o.right }; }));
      const [a, b] = boxes;
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      const past = rtl ? b.l - 4 : b.r + 4;
      await page.mouse.move((a.x + past) / 2, a.y, { steps: 4 });
      await page.mouse.move(past, a.y, { steps: 4 });
      await frames(page);
      const gap = await page.evaluate(() => document.querySelector('[data-dzg-gap]')?.getAttribute('data-dzg-gap'));
      await page.mouse.up();
      await frames(page);
      const dragged = await by(page);
      check(name, `grouping band ${lang}: a chip dragged past the next one moves after it (gap « after » shown)`, gap === 'after' && dragged.join() === 'fruit,region', { gap, dragged, boxes });
      await page.evaluate(() => window.t.api().setBy(['region', 'fruit']));
      await frames(page);

      if (name === 'chrome') {
        // ---- targets of 24 px at least (WCAG 2.5.8) ----
        const sizes = await page.evaluate(() => {
          const s = (el) => el && { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) };
          return { toggle: s(document.querySelector('.dzg-layer .dzg-row[data-kind=group] .dzg-toggle')), chip: s(document.querySelector('.dzg-chip')), x: s(document.querySelector('.dzg-chip-x')) };
        });
        check(name, `grouping ${lang}: chevron, chip and × are 24 px targets at least`, ['toggle', 'chip', 'x'].every((k) => sizes[k] && sizes[k].h >= 24 && sizes[k].w >= 24), sizes);

        // ---- totals under their columns' headers; the label in the group column ----
        await page.evaluate(() => window.t.api().expandAll(1));
        await frames(page, 3);
        const aligned = await page.evaluate(() => {
          const row = document.querySelector('.dzg-layer .dzg-row[data-kind=group]');
          return ['qty', 'price', 'day'].map((c) => {
            const cell = row.querySelector(`.dzg-cell[data-col="${c}"]`).getBoundingClientRect();
            const head = document.querySelector(`.dzg-header .dzg-hcell[data-col="${c}"]`).getBoundingClientRect();
            return { c, dx: Math.abs(cell.left - head.left) + Math.abs(cell.right - head.right), text: row.querySelector(`.dzg-cell[data-col="${c}"]`).textContent };
          });
        });
        check(name, `grouping ${lang}: each total written under its column's header (to 1 px), none empty`, aligned.every((x) => x.dx <= 1 && x.text), aligned);
      }
      check(name, `grouping ${lang}: no page error`, errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }
  if (name !== 'chrome') return;

  // ---- axe, fr / ar, light / dark, a group open with its footer, the grand total, the band with chips ----
  for (const [qs, scheme] of [['locale=fr-FR', 'light'], ['locale=ar-DZ', 'dark'], ['locale=fr-FR&pin=1', 'dark'], ['locale=ar-DZ&pin=1', 'light']]) {
    const { page, errors } = await open(qs, scheme);
    try {
      await page.evaluate(() => window.t.api().expandAll(2));
      await frames(page, 3);
      const v = await axe(page);
      check(name, `grouping axe ${qs} ${scheme}: 0 violations, groups open, footers, the band`, v.length === 0, v);
      if (qs.endsWith('pin=1')) {
        // Pinned columns: a group row's totals in the pinned end column too, aligned with its header.
        const pinned = await page.evaluate(() => {
          const row = document.querySelector('.dzg-layer .dzg-row[data-kind=group]');
          const cell = row.querySelector('.dzg-cell[data-col="price"]');
          const head = document.querySelector('.dzg-header .dzg-hcell[data-col="price"]').getBoundingClientRect();
          const r = cell.getBoundingClientRect();
          return { dx: Math.abs(r.left - head.left) + Math.abs(r.right - head.right), text: cell.textContent, label: row.querySelector('.dzg-cell[data-col="shop"] .dzg-label')?.textContent };
        });
        check(name, `grouping ${qs}: the pinned end column's total aligned, the label in the pinned start column`, pinned.dx <= 1 && pinned.text && pinned.label, pinned);
      }
      if (qs === 'locale=ar-DZ' || qs === 'locale=fr-FR&pin=1') await page.screenshot({ path: `${OUT}/grouping-${qs.replace(/[^a-z0-9]+/gi, '-')}-${scheme}.png` });
      check(name, `grouping axe ${qs} ${scheme}: no page error`, errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }

  // ---- forced colours: system colours on group rows and chips ----
  {
    const { page, errors } = await open('locale=fr-FR');
    try {
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 2);
      const fc = await page.evaluate(() => {
        const probe = document.body.appendChild(Object.assign(document.createElement('span'), { style: 'color: CanvasText; background: Canvas' }));
        const want = getComputedStyle(probe).color;
        const cell = getComputedStyle(document.querySelector('.dzg-layer .dzg-row[data-kind=group] .dzg-cell'));
        const chip = getComputedStyle(document.querySelector('.dzg-gchip'));
        probe.remove();
        return { want, cell: cell.color, chip: chip.borderTopColor, chipStyle: chip.borderTopStyle };
      });
      check(name, 'grouping forced colours: group row text and chip outline in CanvasText', fc.cell === fc.want && fc.chip === fc.want && fc.chipStyle === 'solid', fc);
      check(name, 'grouping forced colours: no page error', errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }

  // ---- a header dropped onto the band; the column menu's item (the way without dragging) ----
  {
    const { page, errors } = await open('locale=fr-FR');
    try {
      await page.evaluate(() => window.t.api().setBy(['region']));
      await frames(page);
      const head = await page.locator('.dzg-header .dzg-hcell[data-col="day"]').boundingBox();
      const zone = await page.locator('.dzg-gzone').boundingBox();
      await page.mouse.move(head.x + 30, head.y + head.height / 2);
      await page.mouse.down();
      await page.mouse.move(head.x + 60, head.y + head.height / 2, { steps: 4 });
      await page.mouse.move(zone.x + zone.width - 40, zone.y + zone.height / 2, { steps: 8 });
      await frames(page);
      const over = await page.evaluate(() => document.querySelector('.dzg-gzone').getAttribute('data-dzg-drop'));
      await page.mouse.up();
      await frames(page, 2);
      const dropped = await by(page);
      const shown = await page.evaluate(() => window.t.grid.context.columns.visible().map((c) => c.id));
      check(name, 'grouping: a header dragged onto the band groups by it (marked « over » meanwhile), the column still shown, said', over === 'over' && dropped.join() === 'region,day' && shown.includes('day'), { over, dropped, shown });
      await page.evaluate(() => window.t.api().setBy(['region']));
      await frames(page);
      await page.evaluate(() => window.t.grid.api.focusHeader?.('fruit') ?? window.t.grid.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'fruit' } }, 'user'));
      await page.evaluate(() => window.t.grid.context.restoreFocus());
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('[role=menu] [data-id="group.by"]');
      const item = await page.evaluate(() => document.querySelector('[role=menu] [data-id="group.by"]').textContent);
      await page.click('[role=menu] [data-id="group.by"]');
      await frames(page, 2);
      const menued = await by(page);
      const said = await page.waitForFunction(() => [...document.querySelectorAll('.dzg-live')].map((l) => l.textContent).join(' ').includes('Regroupé par Fruit'), null, { timeout: 3000 }).then(() => 'Regroupé par Fruit', () => page.evaluate(() => [...document.querySelectorAll('.dzg-live')].map((l) => l.textContent).join(' | ')));
      check(name, 'grouping: the column menu\'s « Regrouper par cette colonne » groups, said', item.includes('Regrouper par cette colonne') && menued.join() === 'region,fruit' && said.includes('Regroupé par Fruit'), { item, menued, said });
      check(name, 'grouping drop and menu: no page error', errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }

  // ---- the exit criterion: a group of 10 000 rows opened to the next frame (median of 6) ----
  {
    const { page, errors } = await open('locale=fr-FR&big=1');
    try {
      const r = await page.evaluate(async () => {
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        const { grid, groupKey } = window.t;
        const key = groupKey(['region', 'tNord']);
        const ms = [];
        const script = [];
        for (let k = 0; k < 6; k++) {
          for (const expanded of [true, false]) {
            await raf();
            const t0 = performance.now();
            grid.kernel.dispatch({ type: 'rows.expand', rows: [key], expanded }, 'user');
            if (expanded) script.push(performance.now() - t0);
            await raf();
            if (expanded) ms.push(performance.now() - t0);
          }
        }
        const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
        grid.kernel.dispatch({ type: 'rows.expand', rows: [key], expanded: true }, 'user');
        await raf();
        return { ms: med(ms), script: med(script), all: ms.map((x) => Math.round(x * 10) / 10), count: grid.kernel.rows.displayed.count };
      });
      console.log(`     grouping: a group of 10 000 opened: ${r.ms.toFixed(1)} ms to the next frame (model and events ${r.script.toFixed(1)} ms), runs ${r.all.join(' ')}`);
      check(name, `grouping exit criterion: a group of 10 000 rows opened to the next frame ≤ 30 ms (median of 6: ${r.ms.toFixed(1)} ms)`, r.ms <= 30 && r.count === 10_002, r);
      check(name, 'grouping 10 000: no page error', errors.length === 0, errors);
    } finally {
      await page.close();
    }
  }
}
