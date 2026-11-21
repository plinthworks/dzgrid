/**
 * 1.17.0 in real browsers (owner 2026-11-21 « on passe au filtre avancé… en autonome »): the advanced filter's builder
 * (docs/behaviors/advanced-filter.md 9–17) on `playground/v1-17.html` (not committed). Its own Vite on 127.0.0.1:4717
 * from this tree (never the owner's 4700), or DZG_PLAYGROUND. Chrome, Firefox and WebKit one after another, each closed
 * in a `finally`; French light and Arabic dark right to left. `--engine chrome|firefox|webkit`.
 *
 * Per engine and language:
 * - the page's button says it opens a dialog; Enter on it opens the builder, a modal dialog in the window, the focus on
 *   the first column list; the owner's example set by the api, `(Statut = Erreur OU Statut = Alerte) ET Jour ≥
 *   2026-11-01`, shown back in the forms (the lists, the ticks, the day's field); 14 rows of 40;
 * - the keys: Alt+ArrowDown to the next condition's list, Tab to « + Condition » and Enter (said « Condition ajoutée »,
 *   the focus on the new list), a column and an operator chosen, a number typed, Enter applies: 4 rows;
 * - Escape drops a draft and gives the focus back to the button; « Supprimer la condition » by Enter moves the focus;
 * - the look: the root group's line on its inline start (right in Arabic), in the accent; Apply in the accent; the dialog
 *   carries the grid's direction; axe 0 with the dialog open; no page error.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4717;
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const engines = arg('--engine') ? [arg('--engine')] : ['chrome', 'firefox', 'webkit'];
let fails = 0;
let passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : ` — ${JSON.stringify(detail)}`}`); };
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function serve() {
  if (process.env.DZG_PLAYGROUND) return { base: process.env.DZG_PLAYGROUND, stop: async () => {} };
  const vite = spawn(process.execPath, [`${ROOT}node_modules/vite/bin/vite.js`, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; ; i++) {
    if (vite.exitCode !== null) throw new Error(`vite on ${PORT} did not start: ${log}`);
    try { if ((await fetch(`${base}/v1-17.html`)).ok) break; } catch { /* not yet */ }
    if (i > 120) throw new Error(`vite on ${PORT}: no answer after 30 s`);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, stop: () => new Promise((r) => (vite.once('exit', r), vite.kill('SIGTERM'), setTimeout(() => (vite.kill('SIGKILL'), r()), 3000))) };
}

const EXAMPLE = (S) => ({
  join: 'and',
  items: [
    { join: 'or', items: [{ column: 'status', filter: { type: 'set', include: [S[0], S[1]] } }] },
    { column: 'day', filter: { type: 'day', op: 'gte', value: '2026-11-01' } },
  ],
});

const server = await serve();
try {
  for (const name of engines) {
    const B = await browser(name);
    try {
      for (const [lang, dark] of [['fr', false], ['ar', true]]) {
        const tag = `${name} ${lang} ${dark ? 'dark' : 'light'}`;
        const ctx = await B.newContext({ viewport: { width: 1040, height: 720 } });
        try {
          const page = await ctx.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`${server.base}/v1-17.html?${lang === 'ar' ? 'lang=ar' : ''}${dark ? '&dark' : ''}`);
          await page.waitForSelector('.dzg-row');
          const count = () => page.evaluate(() => window.grid.kernel.rows.displayed.count);
          const S = await page.evaluate(() => window.S);
          const btn = page.locator('#adv');
          check(`${tag}: the button says it opens a dialog, closed`, (await btn.getAttribute('aria-haspopup')) === 'dialog' && (await btn.getAttribute('aria-expanded')) === 'false');

          // The owner's example, set by the api, then opened by the keyboard.
          await page.evaluate((e) => window.adv.set(e), EXAMPLE(S));
          check(`${tag}: the example filters 14 rows of 40`, (await count()) === 14, await count());
          await btn.focus();
          await page.keyboard.press('Enter');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-c');
          // The set list and the day form load on demand.
          await page.waitForSelector('.dzg-adv-pop [role=option]');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-form[data-kind=day] .tz-field__trigger');
          await frames(page);
          const open = await page.evaluate(() => {
            const d = document.querySelector('.dzg-adv-pop');
            const r = d.getBoundingClientRect();
            const sels = [...d.querySelectorAll('.dzg-adv-col select')];
            const ticked = [...d.querySelectorAll('.dzg-adv-form[data-kind=set] [role=option][aria-selected=true]')].map((o) => o.textContent);
            const day = d.querySelector('.dzg-adv-form[data-kind=day] .tz-field__trigger')?.getAttribute('aria-label') ?? '';
            return {
              role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), title: document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
              inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, dir: d.dir,
              focus: document.activeElement === sels[0], cols: sels.map((s) => s.value), ticked, day,
              expanded: document.getElementById('adv').getAttribute('aria-expanded'),
            };
          });
          check(`${tag}: Enter on the button opens a modal dialog named by its title, in the window, the focus on the first column`,
            open.role === 'dialog' && open.modal === 'true' && !!open.title && open.inside && open.focus && open.expanded === 'true', open);
          check(`${tag}: the dialog carries the grid's direction`, open.dir === (lang === 'ar' ? 'rtl' : 'ltr'), open.dir);
          // A long expression: the groups scroll, Apply stays in the window.
          for (let i = 0; i < 2; i++) await page.evaluate(() => document.querySelector('.dzg-adv-root > .dzg-adv-g > .dzg-adv-acts > .dzg-adv-add').click());
          await frames(page);
          const fit = await page.evaluate(() => {
            const a = document.querySelector('.dzg-adv-apply').getBoundingClientRect();
            const t = document.querySelector('.dzg-adv-tree');
            return { apply: a.top >= 0 && a.bottom <= innerHeight, scrolls: t.scrollHeight > t.clientHeight };
          });
          check(`${tag}: a long expression scrolls between the title and the buttons, Apply in the window`, fit.apply, fit);
          // The two empty conditions added are left out at Apply; removed now to keep the walk below.
          for (let i = 0; i < 2; i++) await page.evaluate(() => [...document.querySelectorAll('.dzg-adv-pop .dzg-adv-rm')].at(-1).click());
          await page.locator('.dzg-adv-pop .dzg-adv-col select').first().focus();
          check(`${tag}: the expression in force shown back: the columns, the ticks, the day`,
            open.cols.join() === 'status,day' && open.ticked.some((t) => t.includes(S[0])) && open.ticked.some((t) => t.includes(S[1])) && !open.ticked.some((t) => t.includes(S[2])) && /2026|٢٠٢٦/.test(open.day), open);

          // The look: the root line on the inline start in the accent, Apply in the accent.
          const look = await page.evaluate((rtl) => {
            const g = document.querySelector('.dzg-adv-root > .dzg-adv-g');
            const cs = getComputedStyle(g);
            const probe = document.createElement('span');
            probe.style.color = 'var(--tz-accent)';
            g.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            const ap = getComputedStyle(document.querySelector('.dzg-adv-apply'));
            return { start: rtl ? cs.borderRightWidth : cs.borderLeftWidth, startColor: rtl ? cs.borderRightColor : cs.borderLeftColor, accent, apply: ap.backgroundColor };
          }, lang === 'ar');
          check(`${tag}: the root group's line on its inline start, in the accent; Apply in the accent`, look.start === '3px' && look.startColor === look.accent && look.apply === look.accent, look);

          // axe with the dialog open.
          await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
          const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
          check(`${tag}: axe 0 with the dialog open`, v.length === 0, v);

          // Keys: Alt+ArrowDown to the next list; then « + Condition » of the root by Tab and Enter.
          await page.keyboard.press('Alt+ArrowDown');
          check(`${tag}: Alt+ArrowDown goes to the next condition's list`, await page.evaluate(() => document.activeElement === document.querySelectorAll('.dzg-adv-pop .dzg-adv-col select')[1]));
          await page.locator('.dzg-adv-root > .dzg-adv-g > .dzg-adv-acts > .dzg-adv-add').focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(120);
          const added = await page.evaluate(() => {
            const sels = document.querySelectorAll('.dzg-adv-pop .dzg-adv-col select');
            return { n: sels.length, focus: document.activeElement === sels[sels.length - 1], said: document.querySelector('.dzg [aria-live=polite]')?.textContent ?? '' };
          });
          check(`${tag}: Enter on « + Condition » adds one, focused, said`, added.n === 3 && added.focus && added.said === (lang === 'ar' ? 'أُضيف شرط' : 'Condition ajoutée'), added);
          await page.locator('.dzg-adv-pop .dzg-adv-col select').nth(2).selectOption('n');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-c >> nth=2 >> select.dzg-fop');
          await page.locator('.dzg-adv-pop .dzg-adv-c').nth(2).locator('select.dzg-fop').selectOption('gt');
          const val = page.locator('.dzg-adv-pop .dzg-adv-c').nth(2).locator('input.dzg-fval');
          await val.focus();
          await page.keyboard.type('30');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(50);
          const applied = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-adv-pop'), focus: document.activeElement?.id, n: window.grid.kernel.rows.displayed.count, items: window.adv.get()?.items?.length }));
          check(`${tag}: typed « 30 », Enter applies the whole draft: 4 rows, the focus back on the button`, !applied.open && applied.n === 4 && applied.items === 3 && applied.focus === 'adv', applied);

          // Escape drops a draft; Enter on « Supprimer la condition » moves the focus.
          await btn.focus();
          await page.keyboard.press('Enter');
          await page.waitForSelector('.dzg-adv-pop .dzg-adv-rm');
          await page.locator('.dzg-adv-pop .dzg-adv-rm').last().focus();
          await page.keyboard.press('Enter');
          const rm = await page.evaluate(() => ({ n: document.querySelectorAll('.dzg-adv-pop .dzg-adv-c').length, tag: document.activeElement?.tagName, inDialog: !!document.activeElement?.closest('.dzg-adv-pop') }));
          check(`${tag}: Enter on « Supprimer la condition » removes it, the focus on the item before`, rm.n === 2 && rm.tag === 'SELECT' && rm.inDialog, rm);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(30);
          const esc = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-adv-pop'), focus: document.activeElement?.id, n: window.grid.kernel.rows.displayed.count }));
          check(`${tag}: Escape drops the draft (4 rows still), the focus back on the button`, !esc.open && esc.focus === 'adv' && esc.n === 4, esc);
          check(`${tag}: no page error`, errors.length === 0, errors);
        } finally {
          await ctx.close();
        }
      }
    } finally {
      await B.close();
    }
  }
} finally {
  await server.stop();
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
