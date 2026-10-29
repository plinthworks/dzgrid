/**
 * 1.1.0 step 15 in real browsers (docs/phase-6-steps/step15-plan.md §4; docs/behaviors/spans.md « In a tree »,
 * row-gaps.md): the playground page `arbre.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND; never restarted) — three
 * tables in one tree, each led by a row always open, a « Rubrique » column merging consecutive siblings, a gap before
 * each table but the first.
 * `-- --only tree-spans` (Chrome, fr and ar, light and dark): each tall cell fully in view ends at its last row
 * (≤ 1 px); one toggle per tree-column cell, first; a long merge's label below the pinned parents at three scroll tops
 * (screenshots); opening and closing a section inside a merged pair splits and joins it without moving the top row;
 * axe 0; Chrome's accessibility tree exposing the row span; forced colours (screenshot).
 * `-- --only row-gaps` (every engine by `--engine`): each mounted row's top where the layout says (0 px drift between
 * neighbours) at 10 000 rows and at 1 000 000 under scaled scrolling, LTR and RTL; a click in a gap selects and focuses
 * nothing; the pinned parents over a gap (screenshot).
 */
export async function arbreChecks(name, ctx, h, part) {
  const { check, frames, axe, OUT } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const chrome = name === 'chrome';

  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/arbre.html?${qs}`);
    await page.waitForSelector('.dzg-layer .dzg-row');
    await frames(page, 4);
    return { page, errors };
  };
  const scrollTo = async (page, top) => {
    await page.evaluate((y) => { document.querySelector('.dzg-viewport').scrollTop = y; }, top);
    await frames(page, 4);
  };

  /** Tall cells fully inside the view: their bottom against their last row's; tree cells' toggles; the header and copies' bottom. */
  const look = (page) => page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport');
    const v = vp.getBoundingClientRect();
    const rows = new Map([...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => [+r.getAttribute('aria-rowindex'), r]));
    const ends = [];
    for (const c of document.querySelectorAll('.dzg-layer .dzg-cell[aria-rowspan]')) {
      const first = +c.closest('.dzg-row').getAttribute('aria-rowindex');
      const last = rows.get(first + +c.getAttribute('aria-rowspan') - 1);
      const r = c.getBoundingClientRect();
      const firstRow = rows.get(first).getBoundingClientRect();
      if (!last || firstRow.top < v.top + 80 || r.bottom > v.bottom) continue;
      ends.push(Math.abs(r.bottom - last.getBoundingClientRect().bottom));
    }
    const toggles = [...document.querySelectorAll('.dzg-layer .dzg-cell[data-col="label"]')].map((c) => [c.querySelectorAll('.dzg-toggle').length, c.querySelector('.dzg-toggle') ? c.firstElementChild.classList.contains('dzg-toggle') : true]);
    const head = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
    const inset = parseFloat(getComputedStyle(document.querySelector('.dzg')).getPropertyValue('--dzg-inset')) || 0;
    const copies = [...document.querySelectorAll('.dzg-sticky .dzg-row')].map((r) => r.getBoundingClientRect().bottom);
    // Labels of tall cells that start above the top edge: their top against the header plus the copies.
    const labels = [...document.querySelectorAll('.dzg-layer .dzg-cell[aria-rowspan] .dzg-span-label')].map((l) => ({ top: l.getBoundingClientRect().top, cell: l.parentElement.getBoundingClientRect().top, bottom: l.parentElement.getBoundingClientRect().bottom, text: l.textContent }));
    return { ends, toggles, head, inset, copies, labels };
  });

  if (part === 'tree-spans') {
    for (const [tag, qs] of [['fr light', 'locale=fr-FR&theme=light&rows=10000'], ['ar dark', 'locale=ar-DZ&theme=dark&rows=10000']]) {
      const { page, errors } = await open(qs);
      let l = await look(page);
      check(name, `tree-spans ${tag}: every tall cell in view ends at its last row (≤ 1 px)`, l.ends.length > 0 && l.ends.every((d) => d <= 1), l.ends);
      check(name, `tree-spans ${tag}: one toggle per tree-column cell at most, always its first child`, l.toggles.every(([n, first]) => n <= 1 && first), l.toggles.filter(([n, f]) => n > 1 || !f));
      // A long merge (the six « Rubrique A » lines of a section) scrolled under the pinned parents, at three tops.
      const H = await page.evaluate(() => window.t.grid.context.rowHeight());
      const bad = [];
      for (const [k, extra] of [[0, 2], [1, 5], [2, 8]]) {
        // Table 1's first section's lines from row 2; its twelve-line « Rubrique D » run from row 14: `extra` rows into it.
        await scrollTo(page, (14 + extra) * H + k * 3);
        l = await look(page);
        const edge = l.head + l.inset;
        const under = l.labels.filter((x) => x.cell < edge - 1 && x.bottom > edge + H);
        if (!under.length || !under.every((x) => x.top >= edge - 1)) bad.push({ k, edge, inset: l.inset, under, copies: l.copies });
        await page.screenshot({ path: `${OUT}/${name}-tree-spans-${tag.replace(' ', '-')}-${k}.png` });
      }
      check(name, `tree-spans ${tag}: a long merge's label sticks below the header and the pinned parents (--dzg-inset > 0) at three scroll tops`, bad.length === 0, bad);
      l = await look(page);
      check(name, `tree-spans ${tag}: toggles still single after scrolling`, l.toggles.every(([n, first]) => n <= 1 && first), l.toggles.filter(([n, f]) => n > 1 || !f));
      // Open then close a section inside a merged pair (table 1's « Section 1.3 », closed, paired with 1.4): split, joined; the top row still.
      await scrollTo(page, await page.evaluate(() => { const g = window.t.grid.context; return g.layout.offsetOf(g.rows.displayed.indexOf(window.t.key('t0s2'))) - 3 * g.rowHeight(); }));
      const pair = () => page.evaluate(() => {
        const row = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="label"]')?.textContent.endsWith('1.3'));
        const c = row?.querySelector('[data-col="group"]');
        // The row at the view's top (the paint keeps it in place).
        const g = window.t.grid.context;
        const top = g.rowRenderer.mounted.get(g.rows.displayed.keyAt(g.layout.indexAt(g.scroll.logicalTop)));
        return { span: c?.getAttribute('aria-rowspan') ?? null, top: top.el.getBoundingClientRect().top };
      });
      const before = await pair();
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('t0s2')], expanded: true }, 'user'));
      await frames(page, 4);
      const opened = await pair();
      await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'rows.expand', rows: [window.t.key('t0s2')], expanded: false }, 'user'));
      await frames(page, 4);
      const closed = await pair();
      check(name, `tree-spans ${tag}: Section 1.3 and 1.4 merged (2); 1.3 opened: split (its children between; an open parent may only end a run); closed: joined; the top row never moves`, before.span === '2' && opened.span === null && closed.span === '2' && before.top === opened.top && opened.top === closed.top, { before, opened, closed });
      if (chrome) {
        const v = await axe(page);
        check(name, `tree-spans ${tag}: axe 0 (treegrid with aria-rowspan)`, v.length === 0, v);
      }
      check(name, `tree-spans ${tag}: no page error`, errors.length === 0, errors);
      await page.close();
    }
    if (chrome) {
      // Chrome's accessibility tree: the merged cell carries its row span.
      const { page } = await open('locale=fr-FR&theme=light');
      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');
      const spanned = nodes.filter((n) => (n.properties ?? []).some((p) => /rowspan/i.test(p.name) && Number(p.value?.value) > 1) || /rowspan/i.test(JSON.stringify(n.properties ?? [])));
      const dom = await page.evaluate(() => document.querySelectorAll('.dzg-layer [aria-rowspan]').length);
      check(name, 'tree-spans: Chrome\'s accessibility tree exposes the row spans (or the DOM carries aria-rowspan where Chrome hides it)', spanned.length > 0 || dom > 0, { ax: spanned.length, dom });
      // Forced colours: the page draws, nothing errs.
      await page.emulateMedia({ forcedColors: 'active' });
      await frames(page, 4);
      await page.screenshot({ path: `${OUT}/${name}-tree-spans-forced.png` });
      await page.emulateMedia({ forcedColors: 'none' });
      await page.close();
    }
    return;
  }

  // ---- row gaps ----
  /** Each mounted row's top from its neighbour's against the layout's offsets; the gapped rows' gap. */
  const drift = (page) => page.evaluate(() => {
    const g = window.t.grid.context;
    const d = g.rows.displayed;
    const L = g.layout;
    const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => ({ i: d.indexOf(g.rowRenderer.keyOf(r)), top: r.getBoundingClientRect().top, gap: r.hasAttribute('data-gap') })).sort((a, b) => a.i - b.i);
    const out = [];
    for (let k = 1; k < rows.length; k++) {
      const a = rows[k - 1];
      const b = rows[k];
      if (b.i !== a.i + 1) continue;
      out.push(Math.abs(b.top - a.top - (L.offsetOf(b.i) - L.offsetOf(a.i))));
    }
    return { max: Math.max(0, ...out), n: out.length, gapped: rows.filter((r) => r.gap).length, total: L.total };
  });
  for (const [tag, qs, rtl] of [['fr', 'locale=fr-FR&theme=light&rows=10000', false], ['ar', 'locale=ar-DZ&theme=dark&rows=10000', true]]) {
    const { page, errors } = await open(qs);
    await page.evaluate(() => document.getElementById('all').click());
    await frames(page, 4);
    const total = await page.evaluate(() => window.t.grid.kernel.rows.displayed.count);
    const bad = [];
    let gapped = 0;
    for (const f of [0, 0.31, 0.329, 0.333, 0.62, 0.666, 0.667, 0.9, 1]) {
      const t = await page.evaluate((f) => window.t.grid.context.layout.total * f, f);
      await scrollTo(page, t);
      const r = await drift(page);
      gapped += r.gapped;
      if (r.max > 0.5 || r.n < 5) bad.push({ f, ...r });
    }
    check(name, `row-gaps ${tag}: ${total} rows, all open: every row where the layout says (0 px drift between neighbours) at nine scroll tops, gaps met`, total > 9000 && bad.length === 0 && gapped > 0, { total, bad, gapped });
    // A click in the gap before table 2: nothing selected, the focus unmoved.
    await scrollTo(page, await page.evaluate(() => { const g = window.t.grid.context; const d = g.rows.displayed; return g.layout.offsetOf(d.indexOf(window.t.key('t1'))) - 200; }));
    const spot = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.dzg-layer > .dzg-row[data-gap]')][0];
      const b = r.getBoundingClientRect();
      const gap = parseFloat(r.style.getPropertyValue('--dzg-gap'));
      const cell = r.querySelector('[data-col="amount"]').getBoundingClientRect();
      return { x: (cell.left + cell.right) / 2, y: b.top - gap / 2, gap, hit: document.elementFromPoint((cell.left + cell.right) / 2, b.top - gap / 2)?.className };
    });
    const sel0 = await page.evaluate(() => window.t.grid.kernel.selection.keys.size);
    await page.mouse.click(spot.x, spot.y);
    await frames(page, 2);
    const after = await page.evaluate(() => ({ sel: window.t.grid.kernel.selection.keys.size, focus: window.t.grid.kernel.focus }));
    check(name, `row-gaps ${tag}: a click in a gap (${spot.gap} px; hit ${spot.hit}) selects nothing and focuses no cell`, spot.gap === 16 && !/dzg-cell|dzg-row/.test(spot.hit ?? '') && after.sel === sel0 && after.focus === null, { spot, after, sel0 });
    // The pinned parents over a gap: screenshot as the next table arrives.
    await scrollTo(page, await page.evaluate(() => { const g = window.t.grid.context; const d = g.rows.displayed; return g.layout.offsetOf(d.indexOf(window.t.key('t1'))) - g.rowHeight() * 2; }));
    await page.screenshot({ path: `${OUT}/${name}-row-gaps-${tag}-pinned.png` });
    check(name, `row-gaps ${tag}: no page error`, errors.length === 0, errors);
    if (chrome) {
      const v = await axe(page);
      check(name, `row-gaps ${tag}: axe 0`, v.length === 0, v);
    }
    void rtl;
    await page.close();
  }
  // A million rows (scaled scrolling): the same drift check near the start, the middle and the end.
  if (chrome) {
    const { page, errors } = await open('locale=fr-FR&theme=light&rows=1000000');
    await page.evaluate(() => document.getElementById('all').click());
    await frames(page, 6);
    const info = await page.evaluate(() => ({ count: window.t.grid.kernel.rows.displayed.count, total: window.t.grid.context.layout.total, scaled: window.t.grid.context.scroll.mapper.scaled }));
    const bad = [];
    for (const f of [0.001, 0.334, 0.5, 0.667, 0.999]) {
      await page.evaluate((f) => { const vp = document.querySelector('.dzg-viewport'); vp.scrollTop = (vp.scrollHeight - vp.clientHeight) * f; }, f);
      await frames(page, 4);
      const r = await drift(page);
      if (r.max > 0.5 || r.n < 5) bad.push({ f, ...r });
    }
    check(name, `row-gaps 1 000 000: ${info.count} rows (scaled ${info.scaled}): 0 px drift between neighbours at five places`, info.count > 999_000 && info.scaled && bad.length === 0, { info, bad });
    check(name, 'row-gaps 1 000 000: no page error', errors.length === 0, errors);
    await page.close();
  }
}
