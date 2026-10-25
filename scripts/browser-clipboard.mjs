/**
 * Phase 5 step 11b in real browsers (docs/phase-5-steps/step11b-plan.md « Browser checks »), called by
 * scripts/browser.mjs (`-- --only clipboard`, and the full run). `clipboardChecks` on
 * packages/dom/test/browser/clipboard.html:
 * - Chrome, the real clipboard (a context granted `clipboard-read` / `clipboard-write`): real ControlOrMeta+C / V / X /
 *   Z; our exact TSV and `<table dir>` read back by `navigator.clipboard.read()`; our own copy pasted back (one request,
 *   one undo, the joined sentence); an Excel-shaped TSV with a refused cell; an HTML-only LibreOffice payload (the
 *   reader's chunk loaded on demand); hostile HTML-only payloads (no request to their host, by `page.on('request')`
 *   and CDP `Network.requestWillBeSent`; nothing added to the page; no handler run); 5 MB ignored; a field open keeps
 *   Ctrl+V; a page text selection with no block copies the page's text; the macOS clipboard untouched (`pbpaste`,
 *   read only, before and after). An insecure context (`http://dzg.test:<port>`, mapped to 127.0.0.1 by the Chrome
 *   launch's `--host-resolver-rules`): `isSecureContext` false, no `navigator.clipboard`, the keyboard copy and paste
 *   still work.
 * - Firefox and WebKit (`--engine`, no read permission): through the events — the grid's copy pasted into a page
 *   `<textarea>` (TSV and our HTML); a paste from an element whose own `copy` handler writes a payload; hostile HTML.
 * - Arabic (every engine): `ar-DZ`, dark Midnight: `1,5` copied, `dir="rtl"`, `١٢٫٥` and Intl's Algerian text pasted, the
 *   sentence in Arabic.
 * `playgroundClipboardChecks` (Chrome): the REAL playground `orders-edit.html` on 127.0.0.1:4700 (or DZG_PLAYGROUND),
 * fr and ar: copy a block of « Qté », paste it on another block (one request), Ctrl+Z gives every cell back; a TSV
 * text into « Montant »; a refused cell counted; cut; Delete on a block; Ctrl+V in an open editor is the field's.
 * Screenshots docs/screenshots/step11b-*.png.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOTS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const FIX = fileURLToPath(new URL('../spikes/s7-clipboard/fixtures/', import.meta.url));
const NN = ' ';
const RLM = '‏';
const EVIL = 'evil.dzg.invalid';
const HOSTILE = `<img src="http://${EVIL}/x.png" onerror="window.__pwned=1"><iframe src="http://${EVIL}/f"></iframe><link rel="stylesheet" href="http://${EVIL}/s.css"><style>@import url(http://${EVIL}/i.css);</style><table><tr><td style="background:url(http://${EVIL}/b.png)"><script>window.__pwned=2</script>ok<svg onload="window.__pwned=3"><image href="http://${EVIL}/i.png"/></svg></td></tr></table>`;

/** The macOS clipboard, read only (S7: a headless browser never touches it). */
const pb = () => { try { return createHash('sha256').update(execFileSync('pbpaste', { timeout: 5000 })).digest('hex'); } catch { return 'n/a'; } };

export async function clipboardChecks(name, ctx, h) {
  const { check, frames, site } = h;
  mkdirSync(SHOTS, { recursive: true });
  const chrome = name === 'chrome';
  const pb0 = chrome ? pb() : null;
  const c = chrome ? await ctx.browser().newContext() : ctx;
  if (chrome) await c.grantPermissions(['clipboard-read', 'clipboard-write']);
  const open = async (qs, url = site.root(`packages/dom/test/browser/clipboard.html?${qs}`)) => {
    const page = await c.newPage();
    await page.setViewportSize({ width: 1000, height: 820 });
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(url);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await frames(page, 3);
    return { page, errors, requests };
  };
  const mod = 'ControlOrMeta';
  const click = async (page, id, col) => {
    // Always into the grid's view first: a mounted row may still be scrolled out of it.
    await page.evaluate(([id, col]) => window.t.show(id, col), [id, col]);
    await frames(page, 3);
    const r = await page.evaluate(([id, col]) => { const e = window.t.cell(id, col); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, [id, col]);
    await page.mouse.click(r.x, r.y);
    await frames(page, 2);
  };
  const press = async (page, key) => { await page.keyboard.press(key); await frames(page, 2); };
  /** Waits for the saves, the chunk and the sentences (the region speaks 50 ms after the last). */
  const rest = (page) => page.waitForTimeout(300);
  const st = (page) => page.evaluate(() => ({ changes: window.t.changes(), requests: window.t.requests.length, origins: window.t.requests.map((r) => r.origin), said: [...window.t.said], block: window.t.block(), brought: [...window.t.brought], pwned: window.__pwned ?? null }));
  const reset = (page) => page.evaluate(() => { window.t.requests.length = 0; window.t.said.length = 0; });
  /** A payload put on the clipboard by the source element's own copy handler (events only: every engine). */
  const viaSource = async (page, payload) => {
    await page.evaluate((p) => { window.t.next = p; }, payload);
    await page.focus('#src');
    await press(page, `${mod}+c`);
  };

  // ---- fr light Clinic ----
  {
    const { page, errors, requests } = await open('locale=fr-FR&theme=light&skin=clinic');
    // Copy a 2 × 2 block by the real keys.
    await click(page, 'r1', 'name');
    await press(page, 'Shift+ArrowDown');
    await press(page, 'Shift+ArrowRight');
    await press(page, `${mod}+c`);
    await rest(page);
    const TSV = 'Commande 1\t1\r\nCommande 2\t2\r\n';
    let s = await st(page);
    if (chrome) {
      const got = await page.evaluate(async () => { const out = {}; for (const it of await navigator.clipboard.read()) for (const ty of it.types) out[ty] = await (await it.getType(ty)).text(); return out; });
      check(name, 'clipboard fr: a 2 × 2 block, real Ctrl+C: navigator.clipboard.read() gives our exact TSV and our <table dir="ltr">', got['text/plain'] === TSV && /<table dir="ltr"><tbody><tr><td>Commande 1<\/td><td>1<\/td><\/tr><tr><td>Commande 2<\/td><td>2<\/td><\/tr><\/tbody><\/table>/.test(got['text/html'] ?? ''), got);
    } else {
      await page.focus('#ta');
      await press(page, `${mod}+v`);
      const got = await page.evaluate(() => ({ text: document.getElementById('ta').value, html: window.t.pastedHtml }));
      check(name, 'clipboard fr: a 2 × 2 block, real Cmd+C, pasted into a page textarea: our TSV (its line breaks the field\'s) and our <table dir="ltr">', got.text.replace(/\r\n/g, '\n') === TSV.replace(/\r\n/g, '\n') && /<table dir="ltr"><tbody><tr><td>Commande 1<\/td><td>1<\/td>/.test(got.html), got);
    }
    check(name, 'clipboard fr: « Cellules copiées : 4 » said', s.said.includes(`Cellules copiées${NN}: 4`), s.said);
    // Our own copy pasted back: one request, the block written, the joined sentence; one Ctrl+Z gives it back.
    await reset(page);
    await click(page, 'r10', 'name');
    if (!chrome) { await viaSource(page, { 'text/plain': TSV }); await click(page, 'r10', 'name'); }
    await press(page, `${mod}+v`);
    await rest(page);
    s = await st(page);
    check(name, 'clipboard fr: Ctrl+V on r10: four cells in ONE request (origin paste), the block written selected, « Cellules collées : 4. Enregistrement en cours » said once',
      JSON.stringify(s.changes) === JSON.stringify(['r10/name="Commande 1"', 'r10/qty=1', 'r11/name="Commande 2"', 'r11/qty=2']) && s.requests === 1 && s.origins[0] === 'paste' && s.block === 'r10/name:r11/qty' && s.said.filter((x) => x.startsWith('Cellules collées')).length === 1 && s.said.includes(`Cellules collées${NN}: 4. Enregistrement en cours`), s);
    await press(page, `${mod}+z`);
    await rest(page);
    const back = await page.evaluate(() => [window.t.value('r10', 'name'), window.t.value('r10', 'qty'), window.t.value('r11', 'name'), window.t.value('r11', 'qty')]);
    check(name, 'clipboard fr: one Ctrl+Z gives every pasted cell back', JSON.stringify(back) === JSON.stringify(['Commande 10', '10', 'Commande 11', '11']), back);
    // An Excel-shaped TSV with a cell the column refuses: counted, the others written.
    await reset(page);
    const excel = 'Nom A\t5\t1 234,50 €\r\nNom B\tabc\t7\r\n';
    if (chrome) await page.evaluate((t) => navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([t], { type: 'text/plain' }) })]), excel);
    else await viaSource(page, { 'text/plain': excel });
    await click(page, 'r20', 'name');
    await press(page, `${mod}+v`);
    await rest(page);
    s = await st(page);
    check(name, 'clipboard fr: an Excel-shaped TSV (« 1 234,50 € », « abc » in Qté): five cells in one request, « refusées : 1 » said',
      JSON.stringify(s.changes) === JSON.stringify(['r20/name="Nom A"', 'r20/qty=5', 'r20/price=1234.5', 'r21/name="Nom B"', 'r21/price=7']) && s.requests === 1 && s.said.some((x) => x.startsWith(`Cellules collées${NN}: 5${NN}; refusées${NN}: 1`)), s);
    // HTML only (LibreOffice-shaped): read by the chunk loaded on demand.
    await reset(page);
    const lo = readFileSync(`${FIX}libreoffice.html`, 'utf8');
    if (chrome) await page.evaluate((t) => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([t], { type: 'text/html' }) })]), lo);
    else await viaSource(page, { 'text/html': lo });
    await click(page, 'r30', 'name');
    await press(page, `${mod}+v`);
    await rest(page);
    s = await st(page);
    check(name, 'clipboard fr: an HTML-only LibreOffice payload: « Alger », 3 415 811 written (the reader loaded on demand); « Population » and « 50% » refused',
      s.changes.includes('r31/name="Alger"') && s.changes.includes('r31/qty=3415811') && !s.changes.some((x) => x.startsWith('r30/qty')) && s.requests === 1, s);
    // Hostile HTML only: text only, nothing fetched, nothing added, no handler run.
    await reset(page);
    requests.length = 0;
    const cdp = chrome ? await c.newCDPSession(page) : null;
    const net = [];
    if (cdp) { await cdp.send('Network.enable'); cdp.on('Network.requestWillBeSent', (e) => net.push(e.request.url)); }
    if (chrome) await page.evaluate((t) => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([t], { type: 'text/html' }) })]), HOSTILE);
    else await viaSource(page, { 'text/html': HOSTILE });
    await click(page, 'r40', 'name');
    await press(page, `${mod}+v`);
    await page.waitForTimeout(800);
    s = await st(page);
    const evil = [...requests, ...net].filter((u) => u.includes(EVIL));
    check(name, `clipboard fr: hostile HTML only: « ok » alone written; 0 request to its host (page${cdp ? ' and CDP' : ''}); nothing it holds added to the page; no handler run`,
      JSON.stringify(s.changes) === JSON.stringify(['r40/name="ok"']) && evil.length === 0 && s.brought.length === 0 && s.pwned === null, { s, evil });
    if (cdp) await cdp.detach();
    if (chrome) {
      // 5 MB of HTML: ignored, nothing pasted, no long task.
      await reset(page);
      await page.evaluate((t) => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([t], { type: 'text/html' }) })]), `<table><tr><td>big</td></tr></table>${' '.repeat(5 << 20)}`);
      await click(page, 'r41', 'name');
      await page.evaluate(() => { window.long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); });
      await press(page, `${mod}+v`);
      await page.waitForTimeout(600);
      s = await st(page);
      const long = await page.evaluate(() => window.long);
      check(name, 'clipboard fr: 5 MB of HTML ignored (nothing pasted, nothing said), no task over 200 ms', s.requests === 0 && s.said.length === 0 && long.every((d) => d < 200), { s, long });
      // A field open: Ctrl+V is the field's.
      await page.evaluate(() => navigator.clipboard.writeText('zzz'));
      await click(page, 'r45', 'name');
      await press(page, 'F2');
      await press(page, `${mod}+v`);
      const f = await page.evaluate(() => document.querySelector('.dzg-field')?.value ?? null);
      await press(page, 'Escape');
      s = await st(page);
      check(name, 'clipboard fr: an editor open: Ctrl+V lands in its field, the grid writes nothing', f !== null && f.endsWith('zzz') && s.requests === 0, { f, s });
      // Review 5: a paragraph selected elsewhere, the focus on a cell, no block: Ctrl+C copies the cell; a selection INSIDE
      // the grid (a cell's text) with no block: the browser copies that text.
      await click(page, 'r46', 'qty');
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('para')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
      await press(page, `${mod}+c`);
      const txt = await page.evaluate(() => navigator.clipboard.readText());
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(window.t.cell('r46', 'name')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
      await press(page, `${mod}+c`);
      const inside = await page.evaluate(() => navigator.clipboard.readText());
      check(name, 'clipboard fr: a paragraph selected elsewhere, the focus on a cell: Ctrl+C copies the cell; a selection inside the grid: the browser copies that text', txt === '46\r\n' && inside === 'Commande 46', { txt, inside });
    }
    // Cut, then Ctrl+Z.
    await reset(page);
    await click(page, 'r50', 'price');
    await press(page, 'Shift+ArrowDown');
    await press(page, `${mod}+x`);
    await rest(page);
    s = await st(page);
    const cut = await page.evaluate(() => [window.t.value('r50', 'price'), window.t.value('r51', 'price')]);
    check(name, 'clipboard fr: Ctrl+X on two cells: cleared at once in one request (origin cut), « Cellules coupées : 2 » said', s.origins.join() === 'cut' && cut.join('|') === '|' && s.said.some((x) => x.startsWith(`Cellules coupées${NN}: 2`)), { s, cut });
    await press(page, `${mod}+z`);
    const unc = await page.evaluate(() => [window.t.value('r50', 'price'), window.t.value('r51', 'price')]);
    check(name, 'clipboard fr: Ctrl+Z after the cut gives both back', unc.join('|') === '50,5|51,5', unc);
    if (chrome) await page.screenshot({ path: `${SHOTS}step11b-clipboard-fr.png` });
    check(name, 'clipboard fr: no page error', errors.length === 0, errors);
    await page.close();
  }

  // ---- ar-DZ dark Midnight (every engine, through the events) ----
  {
    const { page, errors } = await open('locale=ar-DZ&theme=dark&skin=midnight');
    await click(page, 'r1', 'price');
    await press(page, `${mod}+c`);
    await page.focus('#ta');
    await press(page, `${mod}+v`);
    const got = await page.evaluate(() => ({ text: document.getElementById('ta').value, html: window.t.pastedHtml }));
    check(name, 'clipboard ar: 1.5 copied as « 1,5 » (Latin digits, a comma), the table dir="rtl"', got.text.replace(/\r?\n$/, '') === '1,5' && /<table dir="rtl">/.test(got.html), got);
    await reset(page);
    await viaSource(page, { 'text/plain': `١٢٫٥\r\n${RLM}-1.234,50 د.ج.${RLM}\r\n` });
    await click(page, 'r3', 'price');
    await press(page, `${mod}+v`);
    await rest(page);
    const s = await st(page);
    check(name, 'clipboard ar: « ١٢٫٥ » and Intl\'s « ‏-1.234,50 د.ج.‏ » pasted: 12.5 and −1234.5, the sentence in Arabic', JSON.stringify(s.changes) === JSON.stringify(['r3/price=12.5', 'r4/price=-1234.5']) && s.said.some((x) => x.startsWith('اللصق: 2')), s);
    if (chrome) await page.screenshot({ path: `${SHOTS}step11b-clipboard-ar.png` });
    check(name, 'clipboard ar: no page error', errors.length === 0, errors);
    await page.close();
  }

  // ---- Chrome: the grid inside an open shadow root (review 1): the real keys copy and paste ----
  if (chrome) {
    const { page, errors } = await open('locale=fr-FR&shadow=1');
    const inShadow = await page.evaluate(() => !!document.getElementById('host').shadowRoot?.querySelector('.dzg'));
    await click(page, 'r1', 'qty');
    await press(page, `${mod}+c`);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    await click(page, 'r5', 'qty');
    await press(page, `${mod}+v`);
    await rest(page);
    const s = await st(page);
    check(name, 'clipboard shadow root: the grid inside an open shadow root — real Ctrl+C writes the cell, Ctrl+V pastes it', inShadow && txt === '1\r\n' && JSON.stringify(s.changes) === JSON.stringify(['r5/qty=1']), { inShadow, txt, s });
    check(name, 'clipboard shadow root: no page error', errors.length === 0, errors);
    await page.close();
  }

  // ---- Chrome: an insecure context (no navigator.clipboard), the keys still copy and paste ----
  if (chrome) {
    const ic = await ctx.browser().newContext();
    const url = site.root('packages/dom/test/browser/clipboard.html?locale=fr-FR').replace('127.0.0.1', 'dzg.test');
    const page = await ic.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await frames(page, 3);
    const env = await page.evaluate(() => ({ secure: isSecureContext, api: typeof navigator.clipboard }));
    await click(page, 'r1', 'qty');
    await press(page, `${mod}+c`);
    await click(page, 'r5', 'qty');
    await press(page, `${mod}+v`);
    await rest(page);
    const s = await st(page);
    check(name, 'clipboard insecure context (http://dzg.test): isSecureContext false, no navigator.clipboard, the real Ctrl+C / Ctrl+V still work', env.secure === false && env.api === 'undefined' && JSON.stringify(s.changes) === JSON.stringify(['r5/qty=1']), { env, s });
    await page.close();
    await ic.close();
    await c.close();
    const pb1 = pb();
    check(name, 'clipboard: the macOS clipboard untouched by the headless runs (pbpaste before = after, read only)', pb0 === pb1, { pb0, pb1 });
  }
}

export async function playgroundClipboardChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const c = await ctx.browser().newContext();
  await c.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await c.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    await page.evaluate(() => {
      window.said = [];
      for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) window.said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true });
      window.edited = [];
      window.demo.grid.kernel.subscribe((e) => { if (e.type === 'cellEdited') window.edited.push({ ref: window.demo.grid.kernel.rows.row(e.key).data.ref, column: e.column, value: e.value, origin: e.origin, g: window.demo.grid.context.edit.api.state(e.key, e.column)?.generation }); });
    });
    const at = (ref, col) => page.evaluate(([ref, col]) => {
      const e = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: e.textContent };
    }, [ref, col]);
    const click = async (ref, col) => { const p = await at(ref, col); await page.mouse.click(p.x, p.y); await frames(page, 2); };
    const press = async (k) => { await page.keyboard.press(k); await frames(page, 2); };
    const state = () => page.evaluate(() => ({ edited: window.edited.splice(0), said: window.said.splice(0) }));
    const value = (ref, col) => page.evaluate(([ref, col]) => window.demo.grid.kernel.rows.displayed && (() => { const k = window.demo.grid.kernel; const n = [...Array(k.rows.displayed.count).keys()].map((i) => k.rows.displayed.nodeAt(k.rows.displayed.index(i))).find((x) => x.data?.ref === ref); return window.demo.grid.context.edit.read(window.demo.grid.context.columns.get(col), n.data, n.key); })(), [ref, col]);
    const mod = 'ControlOrMeta';
    // Copy a block of « Qté » (two cells), paste it on another block of two (rows inside the 900 px window; the demo's
    // server refuses a value ending in 7: O-0003 / O-0004 hold 39 / 104).
    await click('O-0003', 'qty');
    await press('Shift+ArrowDown');
    await press(`${mod}+c`);
    const q2 = [await value('O-0003', 'qty'), await value('O-0004', 'qty')];
    await click('O-0005', 'qty');
    await press('Shift+ArrowDown');
    await state();
    await press(`${mod}+v`);
    await page.waitForTimeout(300);
    let s = await state();
    const sameGen = s.edited.length === 2 && s.edited[0].g === s.edited[1].g && s.edited.every((e) => e.origin === 'paste');
    check(name, `playground orders-edit (${tag}): Qté O-0003..4 copied, pasted on O-0005..6: both cells in ONE request (one generation), origin paste; the joined sentence`,
      sameGen && JSON.stringify(s.edited.map((e) => e.value)) === JSON.stringify(q2) && s.said.some((x) => (ar ? /^اللصق: 2\. / : new RegExp(`^Cellules collées${NN}: 2\\. `)).test(x)), { s, q2 });
    await page.screenshot({ path: `${SHOTS}step11b-orders-edit-${tag}.png` });
    await page.waitForTimeout(900);
    await press(`${mod}+z`);
    await page.waitForTimeout(900);
    s = await state();
    check(name, `playground orders-edit (${tag}): one Ctrl+Z gives both cells back (origin undo, one gesture)`, s.edited.length === 2 && s.edited.every((e) => e.origin === 'undo'), s);
    // A TSV text into « Montant », and a refused cell counted (« abc » in Qté).
    await page.evaluate((t) => navigator.clipboard.writeText(t), ar ? '١٢٣٤\r\n' : '1 234,50 €\r\n');
    await click('O-0004', 'amount');
    await press(`${mod}+v`);
    await page.waitForTimeout(300);
    s = await state();
    check(name, `playground orders-edit (${tag}): « ${ar ? '١٢٣٤' : '1 234,50 €'} » pasted into Montant: ${ar ? 1234 : 1234.5}`, s.edited.length === 1 && s.edited[0].value === (ar ? 1234 : 1234.5), s);
    await page.evaluate(() => navigator.clipboard.writeText('5\r\nabc\r\n'));
    await click('O-0007', 'qty');
    await press(`${mod}+v`);
    await page.waitForTimeout(300);
    s = await state();
    check(name, `playground orders-edit (${tag}): « 5 / abc » on Qté: one written, the refused one counted in the sentence`, s.edited.length === 1 && s.said.some((x) => (ar ? /؛ مرفوضة: 1/ : new RegExp(`${NN}; refusées${NN}: 1`)).test(x)), s);
    // Cut two Montant cells, then Delete on a block.
    await page.waitForTimeout(800);
    await click('O-0005', 'amount');
    await press('Shift+ArrowDown');
    await press(`${mod}+x`);
    await page.waitForTimeout(300);
    s = await state();
    check(name, `playground orders-edit (${tag}): Ctrl+X on two Montant cells: cleared at once (origin cut), said`, s.edited.length === 2 && s.edited.every((e) => e.origin === 'cut' && e.value === null) && s.said.some((x) => (ar ? /^القص: 2/ : new RegExp(`^Cellules coupées${NN}: 2`)).test(x)), s);
    await page.waitForTimeout(800);
    await click('O-0008', 'amount');
    await press('Shift+ArrowDown');
    await press('Delete');
    await page.waitForTimeout(300);
    s = await state();
    check(name, `playground orders-edit (${tag}): Delete on a block of two: both cleared in one gesture (origin edit), « effacées » said`, s.edited.length === 2 && s.edited.every((e) => e.origin === 'edit') && s.edited[0].g === s.edited[1].g && s.said.some((x) => (ar ? /^المسح: 2/ : new RegExp(`^Cellules effacées${NN}: 2`)).test(x)), s);
    // Ctrl+V in an open editor is the field's.
    await page.evaluate(() => navigator.clipboard.writeText('Zed'));
    await click('O-0009', 'client');
    await press('F2');
    await press(`${mod}+v`);
    const f = await page.evaluate(() => document.querySelector('.dzg-field')?.value ?? null);
    await press('Escape');
    s = await state();
    check(name, `playground orders-edit (${tag}): an editor open: Ctrl+V lands in its field, nothing written by the grid`, f !== null && f.endsWith('Zed') && s.edited.length === 0, { f, s });
    check(name, `playground orders-edit clipboard (${tag}): no page error`, errors.length === 0, errors);
    await page.close();
  }
  await c.close();
}

/**
 * `playgroundFocusChecks` (Chrome; owner « je ne trouve aucun exemple pour la sélection »): the REAL playground
 * `orders-edit.html?focus=range` on 127.0.0.1:4700 (or DZG_PLAYGROUND), fr and ar: the selection title and its
 * bullets at the top (the editing steps gone), the menu's two entries, the plain page's hint link; Shift+ArrowDown
 * makes a block (aria-selected cells); Ctrl+C there, Ctrl+V on another cell changes its values.
 */
export async function playgroundFocusChecks(name, ctx, h) {
  const { check, frames } = h;
  const base = process.env.DZG_PLAYGROUND ?? 'http://127.0.0.1:4700';
  const c = await ctx.browser().newContext();
  await c.grantPermissions(['clipboard-read', 'clipboard-write']);
  {
    const page = await c.newPage();
    await page.goto(`${base}/index.html`);
    const links = await page.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => /focus=range/.test(a.getAttribute('href'))).map((a) => [a.getAttribute('href'), a.textContent]));
    check(name, 'playground menu: two entries open orders-edit.html?focus=range (fr, and ar dark)', links.length === 2 && links.every(([u]) => u.startsWith('./orders-edit.html')) && /Sélection de cellules et copier-coller/.test(links[0][1]) && /locale=ar-DZ/.test(links[1][0]), links);
    await page.goto(`${base}/orders-edit.html?locale=fr-FR&theme=light&skin=clinic`);
    await page.waitForSelector('#steps li', { timeout: 30000 });
    const hint = await page.evaluate(() => { const a = document.querySelector('#hint a'); const s = document.getElementById('steps'); return a ? { href: a.getAttribute('href'), text: document.getElementById('hint').textContent, above: !!(a.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING), steps: s.children.length } : null; });
    check(name, 'playground orders-edit (plain): « Astuce : sélection de blocs et copier-coller » links to ?focus=range above the editing steps', !!hint && /focus=range/.test(hint.href) && /Astuce/.test(hint.text) && hint.above && hint.steps >= 8, hint);
    await page.close();
  }
  for (const [tag, qs, ar] of [['fr', 'locale=fr-FR&theme=light&skin=clinic', false], ['ar', 'locale=ar-DZ&theme=dark&skin=midnight', true]]) {
    const page = await c.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/orders-edit.html?${qs}&focus=range`);
    await page.waitForSelector('.dzg-layer > .dzg-row .dzg-cell[data-col="qty"]', { timeout: 30000 });
    await frames(page, 3);
    const top = await page.evaluate(() => ({ title: document.getElementById('title').textContent, bullets: [...document.querySelectorAll('#steps li')].map((l) => l.textContent), gridTop: document.getElementById('host').getBoundingClientRect().top }));
    const words = ar ? [/Shift\+/, /Ctrl\+C/, /Ctrl\+Z/, /١٢٣٤/] : [/Maj\+/, /Ctrl\+C/, /Ctrl\+Z/, /1 234,50 €/];
    check(name, `playground orders-edit?focus=range (${tag}): the selection title and 4–5 bullets at the top (keys, copy/paste, one Ctrl+Z, the Montant paste to try)`,
      (ar ? /تحديد/ : /Sélection/).test(top.title) && top.bullets.length >= 4 && top.bullets.length <= 5 && words.every((w) => top.bullets.some((b) => w.test(b))) && top.gridTop < 400, top);
    const at = (ref, col) => page.evaluate(([ref, col]) => {
      const e = [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => r.querySelector('[data-col="ref"]')?.textContent === ref)?.querySelector(`[data-col="${col}"]`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: e.textContent, sel: e.getAttribute('aria-selected') };
    }, [ref, col]);
    const click = async (ref, col) => { const p = await at(ref, col); await page.mouse.click(p.x, p.y); await frames(page, 2); };
    const press = async (k) => { await page.keyboard.press(k); await frames(page, 2); };
    const mod = 'ControlOrMeta';
    await click('O-0003', 'qty');
    await press('Shift+ArrowDown');
    const block = [await at('O-0003', 'qty'), await at('O-0004', 'qty')];
    check(name, `playground orders-edit?focus=range (${tag}): Shift+ArrowDown makes a block of two (aria-selected cells)`, block.every((b) => b?.sel === 'true'), block);
    await press(`${mod}+c`);
    const before = [await at('O-0005', 'qty'), await at('O-0006', 'qty')].map((b) => b.text);
    await click('O-0005', 'qty');
    await press(`${mod}+v`);
    await page.waitForTimeout(1200);
    const after = [await at('O-0005', 'qty'), await at('O-0006', 'qty')].map((b) => b.text);
    check(name, `playground orders-edit?focus=range (${tag}): Ctrl+C, then Ctrl+V on another cell writes the block there`, after[0] === block[0].text && after[1] === block[1].text && after.join() !== before.join(), { block, before, after });
    check(name, `playground orders-edit?focus=range (${tag}): no page error`, errors.length === 0, errors);
    await page.close();
  }
  await c.close();
}
