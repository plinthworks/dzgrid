/**
 * Phase 6 step 9 in real browsers (docs/phase-6-steps/step09-plan.md §6, docs/behaviors/auto-height.md; `-- --only
 * auto-height`): the REAL playground page `auto-height.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted —
 * patients whose « Remarques » column wraps, « Patient 0 » open with a 120 px panel.
 * Chrome, fr and ar: every wrapped cell's text fits its row (no clip, no sideways overflow), short rows at 32 px, the panel
 * right under its measured master; S3's four scenarios at 10 000 rows (down by 40 then 400 px; jump to the middle then up;
 * jump to the end then up; a fresh page, jump to row 300 then up to 0): the largest move on screen of any row seen in two
 * frames in a row, beyond the user's own scroll, 0 px (0.5 px tolerance); the « Remarques » column narrowed and widened
 * and the density changed: the row at the top holds still; the focus walked down by the keys stays whole in the view
 * (2.4.11); axe 0. A million rows: the warning `auto-height-large` once, the same no-jump check driven by the wheel
 * (scaled scrolling), the last row reached by Ctrl+End. Firefox and WebKit (`--engine`), Arabic: the wrapping (fits, no
 * sideways overflow, `overflow-wrap: anywhere`) and the 10 000-row scenarios; Firefox also 100 000 rows (≤ 1.5 px, S3).
 */
export async function autoHeightChecks(name, ctx, h) {
  const { check, frames, axe } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const chrome = name === 'chrome';

  const open = async (qs) => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1000, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/auto-height.html?${qs}`);
    await page.waitForSelector('.dzg-layer .dzg-row');
    await frames(page, 4);
    return { page, errors };
  };

  /** What the rows look like: wrapped cells that clip or overflow sideways, short rows' heights, the panel under its master. */
  const look = (page) => page.evaluate(() => {
    const clipped = [];
    const sideways = [];
    const heights = { short: new Set(), tall: 0 };
    for (const row of document.querySelectorAll('.dzg-layer > .dzg-row:not([data-kind])')) {
      const rh = row.getBoundingClientRect().height;
      const cell = row.querySelector('.dzg-cell[data-wrap]');
      if (!cell) continue;
      // The content's own height: the cell is the row's height, its text inside.
      if (cell.scrollHeight > cell.clientHeight + 1) clipped.push(`${row.getAttribute('aria-rowindex')}: ${cell.scrollHeight} > ${cell.clientHeight}`);
      if (cell.scrollWidth > cell.clientWidth + 1) sideways.push(row.getAttribute('aria-rowindex'));
      if (cell.textContent === '') heights.short.add(Math.round(rh));
      else heights.tall = Math.max(heights.tall, rh);
    }
    const detail = document.querySelector('.dzg-layer > .dzg-row[data-kind=detail]');
    const master = detail && [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => +r.getAttribute('aria-rowindex') === +detail.getAttribute('aria-rowindex') - 1);
    const gap = detail && master ? Math.abs(detail.getBoundingClientRect().top - master.getBoundingClientRect().bottom) : null;
    const panel = detail ? Math.round(detail.getBoundingClientRect().height) : null;
    const wrap = document.querySelector('.dzg-body .dzg-cell[data-wrap]');
    const cs = wrap && getComputedStyle(wrap);
    return { clipped, sideways, short: [...heights.short], tall: heights.tall, gap, panel, style: cs && `${cs.whiteSpace} ${cs.overflowWrap}` };
  });

  /**
   * S3's driver: at the start of each frame (what was painted), the rows seen (by aria-rowindex) and their screen tops. A step
   * scrolls (`by`: px; `to`: a jump), then three frames are sampled: each row seen in two frames in a row moved by the
   * user's own scroll and nothing more. Scaled scrolling (a million rows): the wheel, the user's scroll read logically.
   */
  const drive = (page, steps) => page.evaluate(async (steps) => {
    const vp = document.querySelector('.dzg-viewport');
    const g = window.grid;
    const scaled = g.context.scroll.mapper.scaled;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const head = () => document.querySelector('.dzg-header').getBoundingClientRect().bottom;
    const snap = () => {
      const v = vp.getBoundingClientRect();
      const top = head();
      const m = new Map();
      for (const r of document.querySelectorAll('.dzg-layer > .dzg-row')) {
        const b = r.getBoundingClientRect();
        if (b.bottom > top + 1 && b.top < v.bottom - 1) m.set(r.getAttribute('aria-rowindex'), b.top);
      }
      return m;
    };
    let max = 0;
    let worst = null;
    let compared = 0;
    const cmp = (a, b, expect, at) => {
      for (const [k, y] of b) {
        if (!a.has(k)) continue;
        compared++;
        const j = Math.abs(y - a.get(k) - expect);
        if (j > max) (max = j), (worst = { at, row: k, j });
      }
    };
    await raf();
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const s0 = snap();
      let eff = 0;
      if ('to' in s) vp.scrollTop = s.to;
      else if (scaled) {
        const l0 = g.context.scroll.logicalTop;
        vp.dispatchEvent(new WheelEvent('wheel', { deltaY: s.by, deltaMode: 0, bubbles: true, cancelable: true }));
        eff = g.context.scroll.logicalTop - l0;
      } else {
        const t0 = vp.scrollTop;
        vp.scrollTop = t0 + s.by;
        eff = vp.scrollTop - t0;
      }
      await raf();
      const s1 = snap();
      if (!('to' in s)) cmp(s0, s1, -eff, `${i} scroll`);
      await raf();
      const s2 = snap();
      cmp(s1, s2, 0, `${i} paint`);
      await raf();
      cmp(s2, snap(), 0, `${i} after`);
    }
    return { max: Math.round(max * 100) / 100, worst, compared, top: vp.scrollTop, end: Math.abs(vp.scrollTop + vp.clientHeight - vp.scrollHeight) <= 1 };
  }, steps);
  const rep = (n, by) => Array.from({ length: n }, () => ({ by }));

  /** S3's four scenarios on a page already open at its top; a fresh page for the fourth. */
  const scenarios = async (page, tag, limit, qs) => {
    const sh = () => page.evaluate(() => document.querySelector('.dzg-viewport').scrollHeight);
    let r = await drive(page, [...rep(120, 40), ...rep(40, 400)]);
    check(name, `auto-height ${tag}: top to bottom, 120 × 40 px then 40 × 400 px: no row moves beyond the scroll (≤ ${limit} px)`, r.max <= limit && r.compared > 1000, r);
    r = await drive(page, [{ to: Math.round((await sh()) / 2) }, ...rep(120, -40), ...rep(40, -400)]);
    check(name, `auto-height ${tag}: jumped to the middle, then up over rows never measured: ≤ ${limit} px`, r.max <= limit && r.compared > 1000, r);
    r = await drive(page, [{ to: 1e9 }, ...rep(100, -120)]);
    check(name, `auto-height ${tag}: jumped to the end, then up: ≤ ${limit} px`, r.max <= limit && r.compared > 500, r);
    const fresh = await open(qs);
    r = await drive(fresh.page, [{ to: 300 * 32 }, ...rep(400, -100)]);
    check(name, `auto-height ${tag}: a fresh page jumped to row 300, then up to the top: ≤ ${limit} px, at the top`, r.max <= limit && r.top === 0 && r.compared > 1000, r);
    check(name, `auto-height ${tag}: no page error (fresh page)`, fresh.errors.length === 0, fresh.errors);
    await fresh.page.close();
  };

  for (const lang of chrome ? ['fr', 'ar'] : ['ar']) {
    const qs = `rows=10000&lang=${lang}${lang === 'ar' ? '&theme=dark' : ''}`;
    const { page, errors } = await open(qs);
    const tag = `${name} ${lang}`;
    let l = await look(page);
    check(name, `auto-height ${tag}: every wrapped cell's text fits its row (no clip, no sideways overflow), short rows 32 px, long ones taller; wraps anywhere`, l.clipped.length === 0 && l.sideways.length === 0 && l.short.length === 1 && l.short[0] === 32 && l.tall > 60 && l.style === 'normal anywhere', l);
    check(name, `auto-height ${tag}: the detail panel (120 px) right under its measured master`, l.gap !== null && l.gap <= 0.5 && l.panel === 120, l);
    if (chrome) {
      // The « Remarques » column narrowed, then widened, then the density: the row at the top holds still (its distance into
      // it kept, at most its new height: S3's anchor); rows grow and shrink.
      const hold = (fn) => page.evaluate(async (fn) => {
        const vp = document.querySelector('.dzg-viewport');
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
        const firstRow = () => [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => [r, r.getBoundingClientRect()]).filter(([, b]) => b.bottom > top + 1).sort((a, b) => a[1].top - b[1].top)[0];
        vp.scrollTop = 5000;
        await raf(); await raf(); await raf();
        // 10 px into the row at the top (never on a row's edge).
        vp.scrollTop += firstRow()[1].top - top + 10;
        await raf(); await raf(); await raf();
        const [el, b] = firstRow();
        const key = el.getAttribute('aria-rowindex');
        new Function('g', fn)(window.grid);
        await raf(); await raf(); await raf();
        const same = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.getAttribute('aria-rowindex') === key);
        const b2 = same?.getBoundingClientRect();
        const first = [...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => [r.getAttribute('aria-rowindex'), r.getBoundingClientRect()]).filter(([, x]) => x.bottom > top + 1).sort((a, c) => a[1].top - c[1].top)[0][0];
        return { key, into: Math.round(top - b.top), into2: b2 ? Math.round(top - b2.top) : null, height: b.height, height2: b2?.height ?? null, first };
      }, fn);
      const kept = (r) => r.into2 !== null && Math.abs(r.into2 - Math.min(r.into, r.height2)) <= 0.5;
      let r = await hold("g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'remarks', width: 180 }] }, 'user')");
      check(name, `auto-height ${tag}: « Remarques » narrowed to 180 px: the row at the top holds still, it grows or stays`, kept(r) && r.height2 >= r.height, r);
      l = await look(page);
      check(name, `auto-height ${tag}: narrowed: every wrapped cell still fits`, l.clipped.length === 0 && l.sideways.length === 0, l);
      r = await hold("g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'remarks', width: 520 }] }, 'user')");
      check(name, `auto-height ${tag}: widened to 520 px: the row at the top holds still (at most its new height into it), it shrinks or stays`, kept(r) && r.height2 <= r.height, r);
      r = await hold("g.update({ density: 'spacious' })");
      l = await look(page);
      // A new row height: the rows measured again; the same row stays at the view's top.
      check(name, `auto-height ${tag}: density spacious: the same row at the top, short rows 40 px, every cell fits`, r.first === r.key && l.short.length === 1 && l.short[0] === 40 && l.clipped.length === 0, { r, l });
      await page.evaluate(() => { window.grid.update({ density: 'comfortable' }); window.grid.kernel.dispatch({ type: 'column.state', patch: [{ id: 'remarks', width: 320 }] }, 'user'); document.querySelector('.dzg-viewport').scrollTop = 0; });
      await frames(page, 4);
      // The keys: 40 × Down from the first row; the focused cell whole in the view after each (under the header).
      const keys = await page.evaluate(async () => {
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        window.grid.api.focusCell(window.grid.kernel.rows.displayed.keyAt(0), 'remarks');
        await raf(); await raf();
        const bad = [];
        for (let i = 0; i < 40; i++) {
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
          await raf(); await raf();
          const c = document.activeElement.getBoundingClientRect();
          const v = document.querySelector('.dzg-viewport').getBoundingClientRect();
          const top = document.querySelector('.dzg-header').getBoundingClientRect().bottom;
          if (c.top < top - 0.5 || (c.bottom > v.bottom + 0.5 && c.height < v.bottom - top)) bad.push({ i, top: c.top, bottom: c.bottom, head: top, end: v.bottom });
        }
        return { bad, at: document.activeElement.closest('.dzg-row')?.getAttribute('aria-rowindex') };
      });
      check(name, `auto-height ${tag}: 40 × Down: the focused cell whole in the view after each measure (2.4.11)`, keys.bad.length === 0 && +keys.at > 40, keys);
      await page.evaluate(() => { document.querySelector('.dzg-viewport').scrollTop = 0; });
      await frames(page, 4);
      const v = await axe(page);
      check(name, `auto-height ${tag}: axe 0 violations`, v.length === 0, v);
    }
    await scenarios(page, `${tag} 10 000`, 0.5, qs);
    check(name, `auto-height ${tag}: no page error`, errors.length === 0, errors);
    await page.screenshot({ path: `${h.OUT}/${name}-auto-height-${lang}.png` });
    await page.close();
  }

  // Firefox at 100 000 rows (S3's figure: ≤ 1.5 px).
  if (name === 'firefox') {
    const { page, errors } = await open('lang=ar&rows=100000');
    await scenarios(page, `${name} ar 100 000`, 1.5, 'lang=ar&rows=100000');
    check(name, 'auto-height 100 000: no page error', errors.length === 0, errors);
    await page.close();
  }

  // A million rows (the exit criterion): the warning once, no jump (the wheel, scaled), the end reached.
  if (chrome) {
    const { page, errors } = await open('rows=1000000');
    const warn = () => page.evaluate(() => document.getElementById('log').textContent.split('\n').filter((x) => x.includes('auto-height-large')));
    const r = await drive(page, [...rep(60, 40), { to: 2e6 }, ...rep(60, -40), ...rep(30, -400), ...rep(30, 400)]);
    check(name, 'auto-height 1 000 000: the wheel down, a jump, the wheel up over rows never measured: no row moves beyond the scroll (≤ 0.5 px), scaled', r.max <= 0.5 && r.compared > 1000, r);
    const end = await page.evaluate(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      const g = window.grid;
      const k5 = g.kernel.rows.displayed.keyAt(5);
      g.api.focusCell(k5, 'name');
      await raf(); await raf();
      g.context.rowRenderer.cell(k5, 'name').focus();
      const mac = /mac/i.test(navigator.platform);
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true }));
      for (let i = 0; i < 6; i++) await raf();
      const c = document.activeElement.getBoundingClientRect();
      const v = document.querySelector('.dzg-viewport').getBoundingClientRect();
      return { text: document.activeElement.closest('.dzg-row')?.querySelector('[data-col=name]')?.textContent, inView: c.bottom <= v.bottom + 0.5 && c.top >= v.top, scaled: g.context.scroll.mapper.scaled };
    });
    check(name, 'auto-height 1 000 000: Ctrl+End reaches « Patient 999999 », seen whole', end.text === 'Patient 999999' && end.inView && end.scaled, end);
    const w = await warn();
    check(name, 'auto-height 1 000 000: one developer warning auto-height-large columns.remarks.wrap', w.length === 1 && w[0].includes('columns.remarks.wrap'), w);
    check(name, 'auto-height 1 000 000: no page error', errors.length === 0, errors);
    await page.close();
    // 5 000 patients: no warning.
    const ten = await open('');
    const none = await ten.page.evaluate(() => document.getElementById('log').textContent);
    check(name, 'auto-height 5 000: no developer warning', !none.includes('auto-height-large'), none);
    await ten.page.close();
  }
}
