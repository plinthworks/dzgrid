/**
 * Phase 6 step 5 in a real browser (docs/phase-6-steps/step05-plan.md §5; `-- --only state`, Chrome): the REAL playground
 * page `state.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — a server grid (a fake one in the page that
 * counts its requests) with `gridState({ persist })`.
 * 1. fr: move, resize, hide, pin at the start, sort (a real click), filter, search (typed), page size and page, density
 *    (the ⋮ menu); reload: the same grid (header order, widths ±0 px, row height, sort mark, page, search text, the state's
 *    text) after ONE request.
 * 2. ar (right to left), the same storage: the same state text; the start-pinned column now on the right.
 * 3. The address: without the box, no filter nor search in it (decoded in the page); opened alone (storage cleared):
 *    columns, sort and page back; with the box: filter and search in it; one character edited: the grid as defined,
 *    `state-version` shown.
 * 4. A stale state (a column gone): loads, the rest applied, the problem listed once, no console error; a state hiding
 *    every column: one shown.
 * 5. A restore while the first request is slow: only the restore's rows land.
 * 6. axe 0; the focus not moved by setState (the same element).
 */
export async function stateChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ready = async () => {
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell', { timeout: 30000 });
    await page.waitForFunction(() => window.demo?.grid.kernel.rows.status.phase === 'idle');
    await frames(page, 3);
  };
  const open = async (qs = '') => {
    await page.goto(`${base}/state.html${qs}`);
    await ready();
  };
  /** What a user sees: header order, widths, row height, sort marks, page, search text, the state's text, requests. */
  const seen = () => page.evaluate(() => {
    const hc = [...document.querySelectorAll('.dzg-header .dzg-hcell[data-col]:not(.dzg-hgroup):not(.dzg-hextra)')];
    const row = document.querySelector('.dzg-layer > .dzg-row');
    const d = window.demo;
    return {
      order: hc.map((c) => c.dataset.col),
      widths: hc.map((c) => Math.round(c.getBoundingClientRect().width)),
      rowHeight: Math.round(row.getBoundingClientRect().height),
      sorted: hc.filter((c) => c.getAttribute('aria-sort') && c.getAttribute('aria-sort') !== 'none').map((c) => `${c.dataset.col}:${c.getAttribute('aria-sort')}`),
      page: d.grid.kernel.rows.page.index,
      size: d.grid.kernel.rows.page.size,
      search: document.getElementById('search').value,
      text: JSON.stringify(d.api.state()),
      requests: d.requests(),
      first: row.querySelector('.dzg-cell[data-col="name"]')?.textContent,
    };
  });
  const settle = async () => {
    await page.waitForTimeout(450);
    await page.waitForFunction(() => window.demo.grid.kernel.rows.status.phase === 'idle');
    await frames(page, 2);
  };

  // 1. fr: arrange, then reload.
  await page.goto(`${base}/state.html`);
  await page.evaluate(() => localStorage.clear());
  await open();
  check(name, 'state fr: a fresh page asks the server once', (await seen()).requests === 1, await seen());
  await page.evaluate(() => {
    const k = window.demo.grid.kernel;
    k.dispatch({ type: 'column.resize', column: 'name', width: 230, finished: true }, 'user');
    k.dispatch({ type: 'column.state', patch: [{ id: 'ward', hidden: true }] }, 'user');
    k.dispatch({ type: 'column.state', patch: [{ id: 'city', pinned: 'start' }] }, 'user');
    k.dispatch({ type: 'column.state', patch: [{ id: 'day', order: -1 }] }, 'user');
    k.dispatch({ type: 'filter.column', column: 'city', filter: { type: 'text', op: 'contains', value: 'o' } }, 'user');
  });
  const ageHeader = await page.evaluate(() => { const r = document.querySelector('.dzg-header .dzg-hcell[data-col="age"] .dzg-hlabel, .dzg-header .dzg-hcell[data-col="age"]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await page.mouse.click(ageHeader.x, ageHeader.y);
  await settle();
  await page.click('#search');
  await page.keyboard.type('1', { delay: 30 });
  await settle();
  await page.evaluate(() => {
    const k = window.demo.grid.kernel;
    k.dispatch({ type: 'page.size', size: 10 }, 'user');
    k.dispatch({ type: 'page.go', index: 2 }, 'user');
  });
  await settle();
  // Density by the ⋮ menu: a right-click on a header, the « Aérée » radio.
  const nameHeader = await page.evaluate(() => { const r = document.querySelector('.dzg-header .dzg-hcell[data-col="name"]').getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; });
  await page.mouse.click(nameHeader.x, nameHeader.y, { button: 'right' });
  await frames(page, 3);
  await page.click('.dzg-popup [role^=menuitem][data-id="density.spacious"]');
  await settle();
  const before = await seen();
  const saved = await page.evaluate(() => localStorage.getItem(window.demo.key));
  check(name, 'state fr: arranged (moved, sized, hidden, pinned, sorted, filtered, searched, page 3 of size 10, spacious) and saved',
    before.order[0] === 'city' && !before.order.includes('ward') && before.sorted.length === 1 && before.page === 2 && before.size === 10 && before.search === '1' && before.rowHeight >= 40 && !!saved && JSON.parse(saved).density === 'spacious', { before, saved });
  await page.reload();
  await ready();
  await settle();
  const after = await seen();
  check(name, 'state fr: after a reload the same grid — header order, widths ±0 px, row height, sort mark, page, search, the state\'s text — and ONE server request',
    JSON.stringify({ ...after, requests: 0, first: 0 }) === JSON.stringify({ ...before, requests: 0, first: 0 }) && after.requests === 1 && after.first === before.first, { before, after });

  // 2. ar, same storage.
  await open('?lang=ar');
  await settle();
  const ar = await seen();
  const sides = await page.evaluate(() => {
    const vp = document.querySelector('.dzg-viewport').getBoundingClientRect();
    const c = document.querySelector('.dzg-header .dzg-hcell[data-col="city"]').getBoundingClientRect();
    return { right: Math.round(vp.right - c.right), dir: getComputedStyle(document.querySelector('.dzg')).direction };
  });
  check(name, 'state ar: the same state text as in French (string compare); the start-pinned column on the right; one request', ar.text === before.text && sides.dir === 'rtl' && sides.right <= 20 && ar.requests === 1, { ar: ar.text, fr: before.text, sides, requests: ar.requests });

  // 6. axe 0; setState moves no focus.
  await open();
  const v = await h.axe(page);
  check(name, 'state: axe 0', v.length === 0, v);
  await page.click('.dzg-layer > .dzg-row .dzg-cell[data-col="age"]');
  await frames(page, 2);
  const focus = await page.evaluate(() => {
    const a = document.activeElement;
    window.demo.api.setState({ v: 1, sort: [{ column: 'name', dir: 'asc' }] });
    return a === document.activeElement && !!a?.closest('.dzg');
  });
  check(name, 'state: setState leaves the focus where it was', focus, focus);
  await settle();

  // 3. The address.
  await page.click('#copy');
  const plain = await page.evaluate(() => document.getElementById('address').value);
  const decoded = (url) => page.evaluate((url) => {
    const v = new URL(url).searchParams.get('grid');
    const bin = atob(v.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  }, url);
  const p1 = await decoded(plain);
  check(name, 'state address: one `grid=1.…` parameter; without the box no typed filter nor search in it', /\?grid=1\.[\w-]+$/.test(plain) && p1.filter === undefined && p1.quick === undefined && Array.isArray(p1.columns), { plain, p1 });
  await page.click('#with');
  await page.click('#copy');
  const full = await page.evaluate(() => document.getElementById('address').value);
  const p2 = await decoded(full);
  check(name, 'state address: with the box, the filter and the search in it', !!p2.filter?.city && p2.quick === '1', p2);
  const alone = await ctx.newPage();
  await alone.goto(`${base}/state.html`);
  await alone.evaluate(() => localStorage.clear());
  await alone.goto(plain);
  await alone.waitForFunction(() => window.demo?.grid.kernel.rows.status.phase === 'idle');
  const got = await alone.evaluate(() => { const s = window.demo.api.state(); return { sort: s.sort, page: s.page, size: s.pageSize, columns: s.columns.map((c) => c.id).join(), quick: s.quick, filter: Object.keys(s.filter) }; });
  check(name, 'state address opened alone (no storage): columns, sort and page back; the typed filter and search not there',
    got.columns === p1.columns.map((c) => c.id).join() && JSON.stringify(got.sort) === JSON.stringify(p1.sort) && got.page === p1.page && got.size === p1.pageSize && got.quick === '' && got.filter.length === 0, { got, p1 });
  const tampered = plain.replace(/.(?=.{6}$)/, (c) => (c === 'A' ? 'B' : 'A')).replace('grid=1.', 'grid=1.%21');
  await alone.evaluate(() => localStorage.clear());
  await alone.goto(tampered);
  await alone.waitForFunction(() => window.demo?.grid.kernel.rows.status.phase === 'idle');
  const t = await alone.evaluate(() => ({ problems: document.getElementById('problems').textContent, sort: window.demo.grid.kernel.query.sort.length }));
  check(name, 'state address edited by hand: the grid as defined, `state-version` listed', t.problems.includes('state-version') && t.sort === 0, t);
  await alone.close();

  // 4. A stale state, then every column hidden.
  await page.evaluate(() => localStorage.setItem(window.demo.key, JSON.stringify({ v: 1, columns: [{ id: 'gone', pinned: null, order: 0 }, { id: 'age', pinned: 'end', order: 1 }], sort: [{ column: 'gone', dir: 'asc' }] })));
  errors.length = 0;
  await open();
  const stale = await page.evaluate(() => ({ problems: [...window.demo.problems], end: window.demo.grid.kernel.columns.layout.end.columns.map((c) => c.id) }));
  check(name, 'state stale (a column gone): loads, the rest applied, each problem listed once, no console error',
    stale.end.join() === 'age' && stale.problems.join('|') === 'state-column columns.0|state-column sort.0' && errors.length === 0, { stale, errors });
  await page.evaluate(() => localStorage.setItem(window.demo.key, JSON.stringify({ v: 1, columns: ['name', 'age', 'city', 'ward', 'day'].map((id, order) => ({ id, hidden: true, pinned: null, order })) })));
  await open();
  const shown = await page.evaluate(() => [...document.querySelectorAll('.dzg-header .dzg-hcell[data-col]:not(.dzg-hgroup):not(.dzg-hextra)')].map((c) => c.dataset.col));
  check(name, 'state hiding every column: one shown (the first)', shown.join() === 'name', shown);

  // 5. A restore while the first request is slow.
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/state.html?delay=1200`);
  await page.waitForFunction(() => !!window.demo);
  await page.evaluate(() => window.demo.api.setState({ v: 1, sort: [{ column: 'name', dir: 'desc' }] }));
  await page.waitForFunction(() => window.demo.grid.kernel.rows.status.phase === 'idle', null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  const slow = await page.evaluate(() => {
    const d = window.demo.grid.kernel.rows.displayed;
    const names = Array.from({ length: Math.min(5, d.count) }, (_, i) => d.nodeAt(d.index(i)).data.name);
    return { names, sorted: names.every((n, i) => i === 0 || names[i - 1].localeCompare(n) >= 0 || names[i - 1] >= n), requests: window.demo.requests() };
  });
  check(name, 'state: a restore while the first request is slow — the restore\'s rows land (sorted by name, descending), two requests', slow.requests === 2 && slow.sorted, slow);
  await page.evaluate(() => localStorage.clear());
  await page.close();
}
