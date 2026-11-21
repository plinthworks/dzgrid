/**
 * 1.15.0's `sortMark: 'always'` in real browsers (owner 2026-11-21 « ★ partout »; presentation-settings.md 49): the
 * playground page `v1-15.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND), never restarted — a search box as a header part
 * on « shop », the kept mark without a part on « town », a plain column « sales ». Chrome, Firefox and WebKit one after
 * another, each closed in a `finally`; French left to right and Arabic right to left. `--engine chrome|firefox|webkit`.
 * - one mark beside the part: a button, 24 px at least, inside its header and clear of the resize grip, its arrow drawn, named in the page's
 *   language; the plain column shows none until sorted;
 * - a real click on it sorts ascending, descending, none, `aria-sort` on the header; typing in the part does not sort;
 * - keys: Enter into the part, Tab to the button (its ring drawn), Enter and Space sort, Escape back to the header,
 *   Shift+Enter on the header adds to the sort (Shift+click on the button too);
 * - right to left: the button on the part's left, left to right on its right.
 *
 * Form editing (owner 2026-11-21 « fais-les tous »; edit-batch.md, edit-row.md, editors.md 23–29), the page
 * `v1-15-forms.html` (`?mode=batch|row|cell`), French and Arabic, light and dark — `--only batch|row|search` (or `forms`):
 * - batch: a kept field sends nothing, its cell marked (the triangle at the inline-start corner, the tint, « Non
 *   enregistré » read), Ctrl/Cmd+Z takes it back, saveAll sends one request and the marks go;
 * - row: F2 opens every editable cell (its yes/no a checkbox), the row outlined, Tab / Shift+Tab move in reading order
 *   (right to left in Arabic), Escape gives it up, Enter keeps it as one request (origin row), a refused field stays;
 * - search: typing asks after the pause, the list under the field (never over it), Down and Enter keep the option,
 *   « Aucun résultat » for nothing found.
 */
import { browser } from '../spikes/kit.mjs';

const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
const only = arg('--only');
const wants = (x) => !only || only === x || (only === 'forms' && x !== 'sort');
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const HEAD = (c) => `.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`;
const HEADS = { shop: HEAD('shop'), town: HEAD('town'), sales: HEAD('sales') };
const sortOf = (page) => page.evaluate(() => JSON.stringify(window.grid.context.kernel.query.sort.map((s) => `${s.column}:${s.dir}`)));

for (const name of wants('sort') ? engines : []) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      const tag = `${name} ${lang}`;
      const ctx = await B.newContext({ viewport: { width: 1000, height: 640 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${base}/v1-15.html${lang === 'ar' ? '?lang=ar' : ''}`);
      await page.waitForSelector(`${HEAD('shop')} input.search`);
      await frames(page);

      const facts = await page.evaluate((sel) => {
        const head = document.querySelector(sel.shop);
        const marks = head.querySelectorAll(':scope > .dzg-sort');
        const b = marks[0];
        const r = b?.getBoundingClientRect(), h = head.getBoundingClientRect(), i = head.querySelector('input').getBoundingClientRect();
        return {
          count: marks.length, tag: b?.tagName, type: b?.type, name: b?.getAttribute('aria-label'), tab: b?.tabIndex,
          w: r?.width, hgt: r?.height, inside: r && r.left >= h.left - 0.5 && r.right <= h.right + 0.5,
          arrow: b && getComputedStyle(b, '::before').content, grip: (() => { const g = head.querySelector(':scope > .dzg-resize').getBoundingClientRect(); return r && (r.right <= g.left + 0.5 || r.left >= g.right - 0.5); })(), beforeInput: r && r.right <= i.left + 0.5, afterInput: r && r.left >= i.right - 0.5,
          town: document.querySelector(sel.town).querySelectorAll(':scope > button.dzg-sort').length,
          sales: document.querySelector(sel.sales).querySelectorAll(':scope > .dzg-sort').length,
        };
      }, HEADS);
      check(`${tag}: one mark beside the part, a button`, facts.count === 1 && facts.tag === 'BUTTON' && facts.type === 'button', JSON.stringify(facts));
      check(`${tag}: named in the page's language`, facts.name === (lang === 'ar' ? 'الترتيب حسب متجر' : 'Trier par Boutique'), facts.name);
      check(`${tag}: out of the Tab order at rest`, facts.tab === -1);
      check(`${tag}: a 24 px target, inside its header`, facts.w >= 23.5 && facts.hgt >= 23.5 && facts.inside, `${facts.w}×${facts.hgt}`);
      check(`${tag}: clear of the resize grip`, facts.grip);
      check(`${tag}: the two-way arrow drawn unsorted`, /⇅/.test(facts.arrow ?? ''), facts.arrow);
      check(`${tag}: at the header's logical end`, lang === 'ar' ? facts.beforeInput : facts.afterInput);
      check(`${tag}: the kept mark without a part, a button too; none on the plain column`, facts.town === 1 && facts.sales === 0);

      // A real click, three times; aria-sort on the header.
      const button = page.locator(`${HEAD('shop')} > button.dzg-sort`);
      const ariaSort = () => page.locator(HEAD('shop')).getAttribute('aria-sort');
      await button.click();
      await frames(page);
      const s1 = await sortOf(page), a1 = await ariaSort();
      await button.click();
      await frames(page);
      const s2 = await sortOf(page), a2 = await ariaSort();
      await button.click();
      await frames(page);
      const s3 = await sortOf(page), a3 = await ariaSort();
      check(`${tag}: a click sorts ascending, descending, none`, s1 === '["shop:asc"]' && s2 === '["shop:desc"]' && s3 === '[]', `${s1} ${s2} ${s3}`);
      check(`${tag}: aria-sort on the header follows`, a1 === 'ascending' && a2 === 'descending' && a3 === null, `${a1} ${a2} ${a3}`);
      await page.locator(`${HEAD('shop')} input.search`).click();
      await page.keyboard.type('1');
      await page.waitForTimeout(400);
      check(`${tag}: typing in the part filters, never sorts`, (await sortOf(page)) === '[]');
      await page.locator(`${HEAD('shop')} input.search`).fill('');
      await page.waitForTimeout(400);

      // Keys: from the header, Enter into the part, Tab to the button, Enter / Space / Shift+Enter, Escape out.
      await page.evaluate((sel) => {
        const g = window.grid.context;
        g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'shop' } }, 'user');
        document.querySelector(sel.shop).focus();
      }, HEADS);
      await frames(page);
      await page.keyboard.press('Enter');
      const inInput = await page.evaluate(() => document.activeElement?.classList.contains('search'));
      await page.keyboard.press('Tab');
      const onButton = await page.evaluate(() => document.activeElement?.matches('button.dzg-sort'));
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
      check(`${tag}: Enter into the part, Tab to the button`, inInput && onButton, `${inInput} ${onButton}`);
      check(`${tag}: its focus ring drawn`, /^solid 2px$/.test(ring), ring);
      await page.keyboard.press('Enter');
      await frames(page);
      const k1 = await sortOf(page);
      await page.keyboard.press('Space');
      await frames(page);
      const k2 = await sortOf(page);
      check(`${tag}: Enter then Space on it sort, once each`, k1 === '["shop:asc"]' && k2 === '["shop:desc"]', `${k1} ${k2}`);
      const still = await page.evaluate(() => document.activeElement?.matches('button.dzg-sort'));
      check(`${tag}: the focus stays on the button after a sort`, still);
      await page.keyboard.press('Escape');
      const back = await page.evaluate((sel) => document.activeElement === document.querySelector(sel.shop), HEADS);
      const tabOut = await button.evaluate((b) => b.tabIndex);
      check(`${tag}: Escape back to the header, the button out of the Tab order again`, back && tabOut === -1, `${back} ${tabOut}`);
      // Adding to the sort by keyboard: Shift+Enter on the header (a part's header too); Shift+click on the button.
      await page.evaluate(() => window.grid.context.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'sales', dir: 'asc' }] }, 'api'));
      await frames(page);
      await page.keyboard.press('Shift+Enter');
      await frames(page);
      const k3 = await sortOf(page);
      const num = await button.textContent();
      check(`${tag}: Shift+Enter on the header adds to the sort, its precedence shown`, k3 === '["sales:asc","shop:asc"]' && num.length > 0, `${k3} «${num}»`);
      await button.click({ modifiers: ['Shift'] });
      await frames(page);
      check(`${tag}: Shift+click on the button turns its part of the sort`, (await sortOf(page)) === '["sales:asc","shop:desc"]', await sortOf(page));
      check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
      await page.close();
      await ctx.close();
    }
  } finally {
    await B.close();
  }
}
// ── Form editing (1.15.0) ─────────────────────────────────────────────────────────────────────────────────────────────
const MOD = (name) => (name === 'webkit' ? 'Meta' : process.platform === 'darwin' ? 'Meta' : 'Control');
const cellSel = (row, col) => `.dzg-layer > .dzg-row[aria-rowindex="${row + 2}"] .dzg-cell[data-col="${col}"]`;
const open = async (page, mode, lang, dark) => {
  await page.goto(`${base}/v1-15-forms.html?mode=${mode}${lang === 'ar' ? '&lang=ar' : ''}${dark ? '&dark' : ''}`);
  await page.waitForSelector(cellSel(1, 'qty'));
  await frames(page);
};
const focusCell = async (page, row, col) => {
  await page.locator(cellSel(row, col)).click();
  await frames(page);
};
for (const name of engines.filter(() => ['batch', 'row', 'search'].some(wants))) {
  const B = await browser(name);
  try {
    for (const lang of ['fr', 'ar']) {
      for (const dark of [false, true]) {
        const tag = `${name} ${lang} ${dark ? 'dark' : 'light'}`;
        const ctx = await B.newContext({ viewport: { width: 1000, height: 640 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        try {
          if (wants('batch')) {
            await open(page, 'batch', lang, dark);
            await focusCell(page, 1, 'qty');
            await page.keyboard.press('F2');
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('42');
            await page.keyboard.press('Enter');
            await frames(page);
            const m = await page.evaluate((sel) => {
              const c = document.querySelector(sel);
              const ids = (c.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
              return { cls: c.classList.contains('dzg-cell--unsaved'), bg: getComputedStyle(c).backgroundImage, desc: ids.map((i) => document.getElementById(i)?.textContent).join('|'), text: c.textContent, saves: window.saves.length, count: window.batch().count };
            }, cellSel(1, 'qty'));
            check(`${tag} batch: kept, nothing sent, the cell marked`, m.cls && m.saves === 0 && m.count === 1 && m.text.includes('42'), JSON.stringify(m));
            check(`${tag} batch: the triangle from the inline-start corner, over a tint`, (lang === 'ar' ? /225deg/ : /135deg/).test(m.bg) && (m.bg.match(/linear-gradient/g) ?? []).length === 2, m.bg.slice(0, 80));
            check(`${tag} batch: described « not saved »`, m.desc.includes(lang === 'ar' ? 'غير محفوظ' : 'Non enregistré'), m.desc);
            await page.keyboard.press(`${name === 'webkit' || process.platform === 'darwin' ? 'Meta' : 'Control'}+z`);
            await frames(page);
            const u = await page.evaluate((sel) => ({ count: window.batch().count, cls: document.querySelector(sel).classList.contains('dzg-cell--unsaved') }), cellSel(1, 'qty'));
            check(`${tag} batch: Ctrl/Cmd+Z takes the pending change back`, u.count === 0 && !u.cls, JSON.stringify(u));
            for (const r of [2, 3]) {
              await focusCell(page, r, 'qty');
              await page.keyboard.press('F2');
              await page.keyboard.press(`${MOD(name)}+A`);
              await page.keyboard.type(String(100 + r));
              await page.keyboard.press('Enter');
            }
            const res = await page.evaluate(() => window.batch().saveAll());
            await frames(page);
            const after = await page.evaluate((sel) => ({ saves: window.saves.map((s) => `${s.origin}:${s.changes.length}`), marks: document.querySelectorAll('.dzg-cell--unsaved').length }), cellSel(2, 'qty'));
            check(`${tag} batch: saveAll sends one request with both, the marks go`, res.sent === 2 && after.saves.join() === 'batch:2' && after.marks === 0, JSON.stringify({ res, after }));
          }

          if (wants('row')) {
            await open(page, 'row', lang, dark);
            await focusCell(page, 1, 'qty');
            await page.keyboard.press('F2');
            await frames(page);
            const o = await page.evaluate((sel) => {
              const row = document.querySelector(sel).closest('.dzg-row');
              const fields = [...row.querySelectorAll('[data-dzg-owner=editor]')];
              const st = getComputedStyle(row, '::after');
              return {
                cols: fields.map((f) => f.closest('.dzg-cell').dataset.col), focus: document.activeElement.closest('.dzg-cell')?.dataset.col,
                check: row.querySelector('.dzg-yesno > input')?.type, outline: `${st.borderTopStyle} ${st.borderTopWidth}`, xs: fields.map((f) => Math.round(f.getBoundingClientRect().left)),
              };
            }, cellSel(1, 'qty'));
            check(`${tag} row: every editable cell a field, the focus where it started`, o.cols.join() === 'name,qty,city,ok' && o.focus === 'qty', JSON.stringify(o));
            check(`${tag} row: its yes/no a checkbox, the row outlined`, o.check === 'checkbox' && o.outline === 'solid 2px', `${o.check} ${o.outline}`);
            check(`${tag} row: the fields in reading order`, lang === 'ar' ? o.xs.every((x, i) => !i || x < o.xs[i - 1]) : o.xs.every((x, i) => !i || x > o.xs[i - 1]), o.xs.join());
            await page.keyboard.press('Tab');
            const t1 = await page.evaluate(() => document.activeElement.closest('.dzg-cell')?.dataset.col);
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.press('Shift+Tab');
            const t2 = await page.evaluate(() => document.activeElement.closest('.dzg-cell')?.dataset.col);
            check(`${tag} row: Tab and Shift+Tab move between the fields`, t1 === 'city' && t2 === 'name', `${t1} ${t2}`);
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('Neuf');
            await page.keyboard.press('Escape');
            await frames(page);
            const e1 = await page.evaluate((sel) => ({ fields: document.querySelectorAll('[data-dzg-owner=editor]').length, text: document.querySelector(sel).textContent, saves: window.saves.length }), cellSel(1, 'name'));
            check(`${tag} row: Escape gives the row up`, e1.fields === 0 && !e1.text.includes('Neuf') && e1.saves === 0, JSON.stringify(e1));
            await focusCell(page, 1, 'name');
            await page.keyboard.press('F2');
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('Neuf');
            await page.keyboard.press('Tab');
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('-5');
            await page.keyboard.press('Enter');
            await frames(page);
            const bad = await page.evaluate(() => ({ invalid: document.activeElement.getAttribute('aria-invalid'), col: document.activeElement.closest('.dzg-cell')?.dataset.col, saves: window.saves.length, bubble: [...document.querySelectorAll('.dzg-bubble')].some((b) => !b.hidden) }));
            check(`${tag} row: a refused field keeps nothing, invalid, focused, the bubble`, bad.invalid === 'true' && bad.col === 'qty' && bad.saves === 0 && bad.bubble, JSON.stringify(bad));
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('7');
            await page.keyboard.press('Enter');
            await frames(page);
            const k = await page.evaluate(() => window.saves.map((s) => `${s.origin}:${s.changes.map((c) => `${c.column}=${c.value}`).join('+')}`));
            check(`${tag} row: Enter keeps the row as one request`, k.join() === 'row:name=Neuf+qty=7', k.join());
          }

          if (wants('search')) {
            await open(page, 'cell', lang, dark);
            await focusCell(page, 1, 'city');
            await page.keyboard.press('F2');
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type(lang === 'ar' ? 'عنابة 2' : 'Annaba 2');
            await page.waitForTimeout(600);
            const s = await page.evaluate(() => {
              const f = document.activeElement;
              const lb = document.getElementById(f.getAttribute('aria-controls'));
              const fr = f.getBoundingClientRect(), lr = lb.getBoundingClientRect();
              return { role: f.getAttribute('role'), expanded: f.getAttribute('aria-expanded'), n: lb.querySelectorAll('[role=option]').length, clear: lr.top >= fr.bottom - 1 || lr.bottom <= fr.top + 1, last: window.asks.at(-1) };
            });
            check(`${tag} search: asked after the pause, options listed`, s.role === 'combobox' && s.expanded === 'true' && s.n > 0 && s.last === (lang === 'ar' ? 'عنابة 2' : 'Annaba 2'), JSON.stringify(s));
            check(`${tag} search: the list never over the field`, s.clear);
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
            await frames(page);
            const kept = await page.evaluate((sel) => ({ text: document.querySelector(sel).textContent, v: window.saves.at(-1)?.changes[0]?.value }), cellSel(1, 'city'));
            check(`${tag} search: Down and Enter keep the option`, /2/.test(kept.text) && kept.v === kept.text.trim(), JSON.stringify(kept));
            await page.keyboard.press('F2');
            await page.keyboard.press(`${MOD(name)}+A`);
            await page.keyboard.type('zzz');
            await page.waitForTimeout(600);
            const none = await page.evaluate(() => document.querySelector('.dzg-search-note')?.textContent);
            check(`${tag} search: no result said`, none === (lang === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'), none);
            await page.keyboard.press('Escape');
            await page.keyboard.press('Escape');
          }
          check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
        } finally {
          await page.close();
          await ctx.close();
        }
      }
    }
  } finally {
    await B.close();
  }
}
console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
