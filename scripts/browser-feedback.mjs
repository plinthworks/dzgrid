/**
 * The feedback pass in a real browser (docs/phase-6-steps/feedback-plan.md; the page's `fb=1`): B one operator, no
 * « Condition »; C the set filter's rows as pills (a `filterOption` part); H the popup's content says its column and
 * kind (a global rule reaches it); I a header search over the column's filter; J the footer on one line under a long
 * column name; K the period form in the popup itself (FROM, TO, one month), no second panel, inside the window.
 */
const QS = 'rows=4000&filters=1&popup=1&dates=1&sets=1&fb=1&clock=2026-10-19T10:00:00Z';

async function open(ctx, h, qs, size = { width: 1000, height: 760 }) {
  const page = await ctx.newPage();
  await page.setViewportSize(size);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(h.site.root(`packages/dom/test/browser/index.html?${qs}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await h.frames(page, 3);
  return { page, errors };
}
/** The column brought into the column window (its cell focused), then its popup opened. */
const popupOn = async (page, h, col) => {
  await page.evaluate((c) => window.t.grid.api.focusCell(window.t.key(0), c), col);
  await h.frames(page, 3);
  await page.evaluate((c) => window.t.filters.openFilter(c), col);
  await h.frames(page, 2);
};

/** B, C, H, I, J (Chrome). */
export async function feedbackFilterChecks(name, ctx, h) {
  const { check, frames, axe } = h;
  for (const [lang, rtl] of [['locale=fr-FR&theme=light', false], ['locale=ar-DZ&dir=rtl&theme=dark', true]]) {
    const { page, errors } = await open(ctx, h, `${lang}&${QS}`);
    const tag = `feedback ${rtl ? 'ar rtl dark' : 'fr ltr light'}`;
    // B: « Rendez-vous » offers one operator: no « Condition », the period form; Enter in FROM applies.
    await popupOn(page, h, 'at');
    await page.waitForSelector('.dzg-popup .dzg-fperiod', { timeout: 15000 });
    await page.evaluate(() => window.t.filters.closeFilter());
    await popupOn(page, h, 'at');
    await page.waitForSelector('.dzg-popup .dzg-fperiod');
    await frames(page, 2);
    const b = await page.evaluate(() => {
      const s = document.querySelector('.dzg-popup select.dzg-fop');
      return { hidden: !s || !!s.closest('[hidden]'), shown: !!s?.offsetParent, focus: document.activeElement?.className ?? '', inFrom: !!document.activeElement?.closest('.dzg-fends') };
    });
    check(name, `${tag}: B one operator: no « Condition », the focus in FROM`, b.hidden && !b.shown && b.inFrom, b);
    await page.keyboard.type('05/10/2026');
    await page.keyboard.press('Tab');
    await page.keyboard.type('07/10/2026');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const k = await page.evaluate(() => ({ f: window.t.grid.kernel.query.filter['at'] ?? null, open: !!document.querySelector('.dzg-popup') }));
    check(name, `${tag}: B/K FROM, Tab, TO, Enter: the period stored, the popup closed`, k.f?.op === 'betweenDays' && k.f.day === '2026-10-05' && k.f.dayTo === '2026-10-07' && !k.open, k);
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'at', filter: null }, 'api'));

    // J: a 44-character column name: the footer on one line, nothing overflows; Clear shows the short word.
    await popupOn(page, h, 'day');
    await page.waitForSelector('.dzg-popup .dzg-fapply');
    const j = await page.evaluate(() => {
      const pop = document.querySelector('.dzg-popup');
      const [c, a] = document.querySelectorAll('.dzg-popup .dzg-ffoot button');
      const rc = c.getBoundingClientRect(), ra = a.getBoundingClientRect();
      return { text: c.textContent, name: c.getAttribute('aria-label'), sameLine: Math.abs(rc.top - ra.top) < 1 && rc.height < 48, over: pop.scrollWidth - pop.clientWidth, popW: pop.getBoundingClientRect().width };
    });
    check(name, `${tag}: J the footer on one line (« ${j.text} »), the column in the name only, no overflow`, j.sameLine && j.over <= 0 && j.name.startsWith(j.text) && j.name.length > j.text.length + 20, j);
    // H: the popup's content carries its column and kind; a global rule paints that popup only.
    await page.addStyleTag({ content: '.dzg-fpop[data-column="day"] { outline: 3px solid rgb(255, 0, 0); }' });
    const hDay = await page.evaluate(() => { const c = document.querySelector('.dzg-popup .dzg-fpop'); return { col: c.dataset.column, kind: c.dataset.kind, outline: getComputedStyle(c).outlineColor }; });
    await page.keyboard.press('Escape');
    await popupOn(page, h, 'amount');
    const hAmount = await page.evaluate(() => { const c = document.querySelector('.dzg-popup .dzg-fpop'); return { col: c.dataset.column, kind: c.dataset.kind, outline: getComputedStyle(c).outlineColor }; });
    check(name, `${tag}: H data-column / data-kind (${hDay.col}/${hDay.kind}, ${hAmount.col}/${hAmount.kind}); a global rule paints that popup only`, hDay.col === 'day' && hDay.kind === 'day' && hDay.outline === 'rgb(255, 0, 0)' && hAmount.kind === 'number' && hAmount.outline !== 'rgb(255, 0, 0)', { hDay, hAmount });
    await page.keyboard.press('Escape');

    // C: the set filter's rows as pills; two clicks, Apply; scrolled to the end, only the window's rows have a part.
    await popupOn(page, h, 'commune');
    await page.waitForSelector('.dzg-popup .dzg-fopt[data-part] .fb-pill', { timeout: 15000 });
    let v = await axe(page);
    const c0 = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.dzg-popup .dzg-fopt')];
      return { n: opts.length, parts: document.querySelectorAll('.dzg-popup .fb-pill').length, name: opts[1]?.getAttribute('aria-label'), pill: opts[1]?.querySelector('.fb-pill')?.textContent, def: getComputedStyle(opts[1].querySelector('.dzg-fname')).display };
    });
    check(name, `${tag}: C pills drawn by the part (${c0.parts} for ${c0.n} rows), the grid's own content hidden, the option named « ${c0.name} »; axe 0`, c0.parts === c0.n && c0.def === 'none' && c0.name?.startsWith(c0.pill) && /[,،]/.test(c0.name) && v.length === 0, { c0, v });
    await page.click('.dzg-popup .dzg-fopt >> nth=2');
    await page.click('.dzg-popup .dzg-fopt >> nth=3');
    await page.click('.dzg-popup .dzg-fapply');
    await frames(page, 2);
    const cf = await page.evaluate(() => window.t.grid.kernel.query.filter['commune'] ?? null);
    check(name, `${tag}: C two pills clicked off, Apply: the set filter stored (${cf?.exclude?.length} excluded)`, cf?.type === 'set' && cf.exclude?.length === 2, cf);
    await popupOn(page, h, 'commune');
    await page.waitForSelector('.dzg-popup .dzg-fopt[data-part]');
    await page.evaluate(() => { const l = document.querySelector('.dzg-popup .dzg-flist'); l.scrollTop = l.scrollHeight; l.dispatchEvent(new Event('scroll')); });
    await frames(page, 3);
    const c1 = await page.evaluate(() => ({ n: document.querySelectorAll('.dzg-popup .dzg-fopt').length, parts: document.querySelectorAll('.dzg-popup .fb-pill').length, last: document.querySelector('.dzg-popup .dzg-fopt:last-of-type')?.getAttribute('aria-posinset') }));
    check(name, `${tag}: C scrolled to the end of about 2 000 values: ${c1.n} rows drawn, as many pills`, c1.n < 40 && c1.parts === c1.n, c1);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.t.grid.kernel.dispatch({ type: 'filter.column', column: 'commune', filter: null }, 'api'));

    // I: the header search: typed, the rows filter after the pause; Space types a space and never sorts; the label sorts.
    await page.click('.dzg-hcell[data-col="name"] .fb-hsearch');
    await page.keyboard.type(rtl ? 'مريض 1' : 'Patient 1');
    await page.waitForTimeout(400);
    await frames(page, 2);
    const i0 = await page.evaluate(() => ({ f: window.t.grid.kernel.query.filter['name'] ?? null, n: window.t.grid.kernel.rows.displayed.count, mark: document.querySelector('.dzg-hcell[data-col="name"]').hasAttribute('data-dzg-filtered'), sort: window.t.grid.kernel.query.sort.length, value: document.querySelector('.fb-hsearch').value }));
    check(name, `${tag}: I typing in the header filters after the pause (${i0.n} rows), the header marked, no sort; Space typed into the box`, i0.f?.op === 'contains' && i0.n < 4000 && i0.mark && i0.sort === 0 && / /.test(i0.value), i0);
    await page.click('.dzg-hcell[data-col="name"] .dzg-hlabel > span:first-child');
    await frames(page, 2);
    const sorted = await page.evaluate(() => window.t.grid.kernel.query.sort[0]?.column ?? null);
    check(name, `${tag}: I a click on the header's name still sorts`, sorted === 'name', sorted);
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}

/** K in each engine (`--engine`): the period form in the popup on the last columns, inside the window, no panel. */
export async function periodChecks(name, ctx, h) {
  const { check, frames, axe } = h;
  // ar-EG with the locale's digits: tzslot 2.4.0 writes the calendar's day numbers in Latin digits while it names
  // the days through Intl (Arabic-Indic): axe's label-content-name-mismatch on the day cells (T4, fixed on tzslot's
  // main, unreleased). Recorded as it is, so this check fails, and is updated, the day tzslot ships it.
  for (const [lang, rtl, digits, t4] of [['locale=fr-FR&theme=light', false, /[0-9]/, false], ['locale=ar-DZ&dir=rtl&theme=dark', true, /[0-9]/, false], ['locale=ar-EG&dir=rtl&numerals=locale', true, /^[0-9 ]+$/, true]]) {
    const { page, errors } = await open(ctx, h, `${lang}&${QS}`, { width: 640, height: 760 });
    const tag = `period ${lang}`;
    await page.evaluate(() => { document.getElementById('host').style.inlineSize = '100%'; });
    await frames(page, 2);
    // The instant column brought in from beyond the end edge: its header the last one seen.
    await popupOn(page, h, 'at');
    await page.waitForSelector('.dzg-popup .dzg-fperiod', { timeout: 15000 });
    await frames(page, 3);
    const s = await page.evaluate(() => {
      const pop = document.querySelector('.dzg-popup');
      const r = pop.getBoundingClientRect();
      return { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, panels: document.querySelectorAll('.tz-field__panel').length, months: pop.querySelectorAll('.tz-range__month').length, over: pop.scrollWidth - pop.clientWidth, days: [...pop.querySelectorAll('.tz-range__day')].slice(10, 12).map((d) => d.textContent).join(' '), dir: getComputedStyle(pop.querySelector('.dzg-fcal')).direction };
    });
    const all = await axe(page);
    const v = t4 ? all.filter((x) => !/^label-content-name-mismatch: .*button\[data-date=/.test(x)) : all;
    check(name, `${tag}: one month in the popup itself, no second panel, inside the window (${Math.round(s.l)}–${Math.round(s.r)} of ${s.w}), ${rtl ? 'right to left' : 'left to right'}, ${t4 ? 'Latin day numbers (T4 open in tzslot 2.4.0)' : "the grid's digits"} (${s.days}); axe 0${t4 ? " but T4's day names" : ''}`, s.panels === 0 && s.months === 1 && s.l >= 0 && s.r <= s.w + 0.5 && s.b <= s.h && s.over <= 0 && s.dir === (rtl ? 'rtl' : 'ltr') && digits.test(s.days) && v.length === 0 && (!t4 || all.length === 1), { s, all });
    // The keyboard alone: FROM by typing is the other check; here the calendar: Tab to a day, Enter twice, Apply.
    const fromCal = await page.evaluate(() => { const d = document.querySelector('.dzg-popup .tz-range__day[data-date="2026-10-12"]'); d.focus(); return document.activeElement === d; });
    await page.keyboard.press('Enter');
    await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press(rtl ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press('Enter');
    await frames(page, 2);
    const f = await page.evaluate(() => window.t.grid.kernel.query.filter['at'] ?? null);
    check(name, `${tag}: the calendar by keys: Enter, two days on, Enter: 12 to 14 October`, fromCal && f?.day === '2026-10-12' && f?.dayTo === '2026-10-14', f);
    await page.keyboard.press('Escape');
    await frames(page, 2);
    const closed = await page.evaluate(() => !document.querySelector('.dzg-popup'));
    check(name, `${tag}: one Escape closes the popup (no panel to close first)`, closed, closed);
    check(name, `${tag}: no page error`, errors.length === 0, errors);
    await page.close();
  }
}
