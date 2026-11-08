/**
 * The automated accessibility checks of Phase 11 L4a (docs/phase-11-plan.md L4; results in docs/a11y/acr-results.md):
 * `node scripts/browser-a11y.mjs` (`--only flat|tree|grouping|pivot|dock|filters|rowdrag|infinite`, `--check
 * axe|status|focus|targets|spacing|reflow|forced|motion`, `--engine chrome|firefox|webkit`, default chrome).
 * Every page of `PAGES`, in French and Arabic, light and dark (Firefox / WebKit: French light and Arabic dark only):
 * - axe 0 (Chrome only: the other lines measure what engines lay out differently);
 * - status messages (4.1.3): every live region in the accessibility tree from the first paint, none put in with its
 *   text already inside; a sort by the keys (↑ to the header, Enter) said in one of them;
 * - focus not obscured (2.4.11): a walk of the keys (↓ ×8, PageDown ×2, ↑ ×6, → ×8, End, Ctrl+End, PageUp, Home,
 *   Ctrl+Home; ← for → in Arabic) and of Tab (40 presses): the focused element never entirely under a sticky header,
 *   pinned row or column, sticky parent, dock, bar, nor outside the window (a 3 × 3 grid of points, `elementFromPoint`);
 *   at 1 200 px and again at 320 px, where pinned columns wider than the view get a line of their own (released
 *   while too wide, pinned-columns.md); pinned rows: scripts/browser-pinned-rows.mjs (the playground's page);
 * - target size (2.5.8): every control and row-move grip 24 × 24 CSS px at least, or spaced (the 24 px circle of the rule);
 * - text spacing (1.4.12): line height 1.5, paragraphs 2 em, letters 0.12 em, words 0.16 em injected; no text newly
 *   cut by an `overflow: hidden` box. Text newly ending in « … » (a cell, a header's name, a dock tab or title) is
 *   listed, not failed: the full text stays the element's accessible name and the user widens the column or the area;
 * - reflow (1.4.10): 320 × 256 CSS px (1 280 px at 400 %), the test page's host made fluid (an app's layout, not the
 *   grid's): the page never scrolls sideways, every control outside a scroller inside the view — the rows themselves
 *   scroll in two directions, a data table's right (said in the ACR);
 * - forced colours (Chrome / Edge only — no other engine emulates `forced-colors: active`): the focused cell keeps a
 *   visible outline, a selected row differs from the others, screenshots to packages/dom/test/browser/results/a11y/;
 * - reduced motion: under `prefers-reduced-motion: reduce`, no transition or animation of more than 50 ms ran.
 * One browser at a time, closed in finally; one page at a time.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve, browser } from '../spikes/kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}packages/dom/test/browser/results/a11y`;
mkdirSync(OUT, { recursive: true });
const opt = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const ONLY = opt('--only')?.split(',') ?? null;
const CHECK = opt('--check')?.split(',') ?? null;
const ENGINE = opt('--engine') ?? 'chrome';
const want = (c) => !CHECK || CHECK.includes(c);

/** The pages: the existing browser-suite pages, one new (`pivot.html`). Rows kept small: the checks read the DOM. */
export const PAGES = {
  flat: 'index.html?rows=2000&filters=1&popup=1&floating=1&pin=1&box=1',
  tree: 'tree.html?rows=2000&pin=1',
  grouping: 'grouping.html?pin=1',
  pivot: 'pivot.html',
  dock: 'dock.html?open=columns:end',
  filters: 'dock.html?open=filters:end',
  rowdrag: 'row-drag.html?rows=500',
  infinite: 'infinite.html?latency=0',
};
const COMBOS = ENGINE === 'chrome'
  ? [['fr-FR', 'light'], ['fr-FR', 'dark'], ['ar-DZ', 'light'], ['ar-DZ', 'dark']]
  : [['fr-FR', 'light'], ['ar-DZ', 'dark']];

const results = [];
const check = (label, ok, detail) => {
  results.push({ label, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${ENGINE}: ${label}${ok && !detail ? '' : `  ${JSON.stringify(detail ?? null).slice(0, 900)}`}`);
};
const note = (label, detail) => console.log(`     ${ENGINE}: ${label}  ${JSON.stringify(detail).slice(0, 600)}`);
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** In the page: the measures, as `window.__a11y`. */
const LIB = String.raw`
(() => {
  const TARGETS = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=option], [role=radio], [role=slider], [role=separator][tabindex], [role=combobox], [role=spinbutton], .dzg-grip';
  /** The test page's own fixtures, never the grid's. */
  const FIXTURE = '#before, #after, #app, .mark, #zone';
  const shown = (el) => {
    if (el.closest('[hidden], [inert]')) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) => {
    const t = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
    return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '') + (t ? ' «' + t + '»' : '');
  };
  /** The box a click reaches: a control inside its label counts the label's box. */
  const box = (el) => {
    const label = el.closest('label');
    const r = (label && label.contains(el) && !label.matches(FIXTURE) ? label : el).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };
  const targets = () => [...document.querySelectorAll(TARGETS)].filter((el) => !el.matches(FIXTURE) && !el.closest(FIXTURE) && shown(el) && !el.closest('[role=gridcell] [role=option]'));
  /** 2.5.8: 24 × 24, or the 24 px circle centred on an undersized target meets no other target nor another such circle. */
  function targetSize() {
    const all = targets().map((el) => ({ el, b: box(el) }));
    const seen = new Set();
    const uniq = all.filter((t) => { const k = [t.b.x, t.b.y, t.b.w, t.b.h].map(Math.round).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    const small = (t) => t.b.w < 23.5 || t.b.h < 23.5;
    const bad = [];
    for (const a of uniq) {
      if (!small(a)) continue;
      const near = uniq.find((b) => {
        if (b === a || b.el.contains(a.el) || a.el.contains(b.el)) return false;
        if (small(b)) return Math.hypot(a.b.cx - b.b.cx, a.b.cy - b.b.cy) < 24;
        const dx = Math.max(b.b.x - a.b.cx, 0, a.b.cx - (b.b.x + b.b.w));
        const dy = Math.max(b.b.y - a.b.cy, 0, a.b.cy - (b.b.y + b.b.h));
        return Math.hypot(dx, dy) < 12;
      });
      if (near) bad.push(name(a.el) + ' ' + Math.round(a.b.w) + '×' + Math.round(a.b.h) + ' near ' + name(near.el));
    }
    return { measured: uniq.length, small: uniq.filter(small).length, bad: [...new Set(bad)] };
  }
  /** 2.4.11: none of a 3 × 3 grid of points of the focused element shows it (or the view does not hold it). */
  function obscured() {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const r = el.getBoundingClientRect();
    let seen = 0;
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.2, 0.5, 0.8]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) seen++;
    }
    // Hidden by the pinned columns (the start or end segment over a centre cell), or by anything else.
    const mid = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
    const seg = (e) => e?.closest('.dzg-seg-start, .dzg-seg-end');
    const pinned = seen === 0 && (!!seg(mid) && seg(mid) !== seg(el) || (r.right > innerWidth || r.left < 0) && !seg(el) && !!el.closest('.dzg') && !!document.querySelector('.dzg-seg-start .dzg-cell, .dzg-seg-end .dzg-cell'));
    return { name: name(el), seen, hidden: seen === 0, pinned, part: seen > 0 && seen < 9, by: seen === 0 ? (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth ? 'outside the window' : (() => { const t = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1)); return t ? name(t) : 'outside the view'; })()) : null };
  }
  /** Text cut by an overflow: hidden / clip ancestor (a scroller loses nothing): one signature per text-bearing element. */
  function clipped() {
    const out = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.data.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest(FIXTURE) || el.closest('.dzg-live, [aria-live], .dzg-sr, [hidden]') || !shown(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const t = range.getBoundingClientRect();
      if (!t.width || !t.height) continue;
      // Visually hidden text (a 1 px clip) is for readers: not text on screen.
      if (el.getBoundingClientRect().width <= 1) continue;
      let cutX = false, cutY = false, ellipsis = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const hx = cs.overflowX === 'hidden' || cs.overflowX === 'clip', hy = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
        if (!hx && !hy) continue;
        const b = a.getBoundingClientRect();
        if (b.width <= 1 || b.height <= 1) break;
        if (hx && (t.left < b.left - 1 || t.right > b.right + 1)) { cutX = true; if (cs.textOverflow === 'ellipsis' || getComputedStyle(el).textOverflow === 'ellipsis') ellipsis = true; }
        if (hy && (t.top < b.top - 1.5 || t.bottom > b.bottom + 1.5)) cutY = true;
        if (cutX || cutY) break;
      }
      if (!cutX && !cutY) continue;
      const row = el.closest('[aria-rowindex]')?.getAttribute('aria-rowindex') ?? '';
      const col = el.closest('[data-col]')?.getAttribute('data-col') ?? '';
      const inCell = !!el.closest('[role=gridcell], [role=rowheader]');
      out.set(row + '|' + col + '|' + name(el) + '|' + n.data.trim().slice(0, 20), { x: cutX, y: cutY, ellipsis, inCell, what: name(el) });
    }
    return out;
  }
  let before = null;
  const SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-block-end: 2em !important; }';
  function spacingOn() { before = clipped(); const s = document.createElement('style'); s.id = '__spacing'; s.textContent = SPACING; document.head.append(s); }
  function spacingResult() {
    const after = clipped();
    document.getElementById('__spacing')?.remove();
    const fresh = [...after].filter(([k]) => !before.has(k)).map(([k, v]) => ({ k, ...v }));
    // Cut sideways with « … » (a cell, a header's name, a tab or a title in a narrow box): the full text stays the
    // element's accessible name, and the user widens the column or the area — listed for the ACR, not failed.
    const dots = (f) => f.x && !f.y && f.ellipsis;
    return { bad: fresh.filter((f) => !dots(f)).map((f) => f.what + (f.y ? ' (block)' : ' (inline)') + ' ' + f.k), cellEllipsis: fresh.filter((f) => dots(f) && f.inCell).length, otherEllipsis: [...new Set(fresh.filter((f) => dots(f) && !f.inCell).map((f) => f.what))] };
  }
  /** 1.4.10: the page never scrolls sideways; a control outside any scroller stays inside the view. */
  function reflow() {
    const doc = document.scrollingElement;
    const out = [];
    for (const el of targets()) {
      let scrolled = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/auto|scroll/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1) { scrolled = true; break; }
      }
      if (scrolled) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) out.push(name(el) + ' ' + Math.round(r.left) + '→' + Math.round(r.right));
    }
    return { pageWidth: doc.scrollWidth, view: innerWidth, outside: out };
  }
  /** 4.1.3: live regions shown to readers; additions that came with their text; every text said. */
  const live = '[aria-live], [role=status], [role=alert], [role=log]';
  const born = [];
  const said = [];
  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) for (const r of [n, ...n.querySelectorAll(live)]) if (r.matches(live) && r.textContent.trim() && !r.matches('[role=alert]')) born.push(name(r));
      const r = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest(live);
      if (r && r.textContent.trim()) said.push(r.textContent.trim().slice(0, 60));
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  function regions() {
    return [...document.querySelectorAll(live)].map((r) => {
      let gone = null;
      // The region itself out of the tree (an empty one hidden until it speaks); a whole panel hidden (an inactive tab)
      // takes its region with it, and shows it before it speaks: not counted.
      const cs = getComputedStyle(r);
      if (cs.display === 'none') gone = 'display none';
      else if (cs.visibility === 'hidden') gone = 'visibility hidden';
      else if (r.closest('[aria-hidden=true]')) gone = 'aria-hidden';
      return { name: name(r), gone };
    });
  }
  /** Motion that ran under reduce. */
  const moved = [];
  const long = (v) => Math.max(0, ...v.split(',').map((s) => parseFloat(s) * (s.trim().endsWith('ms') ? 1 : 1000)));
  document.addEventListener('transitionrun', (e) => { const cs = getComputedStyle(e.target); if (long(cs.transitionDuration) > 50) moved.push('transition ' + e.propertyName + ' ' + name(e.target)); }, true);
  document.addEventListener('animationstart', (e) => { const cs = getComputedStyle(e.target); if (long(cs.animationDuration) > 50) moved.push('animation ' + e.animationName + ' ' + name(e.target)); }, true);
  /** Forced colours: the focused cell's outline, a selected row against another. */
  function forced() {
    const el = document.activeElement;
    const cs = el ? getComputedStyle(el) : null;
    const after = el ? getComputedStyle(el, '::after') : null;
    const before = el ? getComputedStyle(el, '::before') : null;
    const ring = (s) => s && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1 ? 'outline ' + s.outlineStyle + ' ' + s.outlineColor : s && s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) >= 1 && s.content !== 'none' ? 'pseudo border ' + s.borderTopColor : null;
    const focus = ring(cs) ?? ring(after) ?? ring(before);
    const sel = document.querySelector('[role=row][aria-selected=true] [role=gridcell]:not([aria-colindex="1"])') ?? document.querySelector('[role=row][aria-selected=true] [role=gridcell]');
    const rowOf = sel?.closest('[role=row]');
    const other = [...document.querySelectorAll('[role=row]:not([aria-selected=true]) [role=gridcell]')].find((c) => c.getAttribute('aria-colindex') === sel?.getAttribute('aria-colindex') && c.closest('[role=row]') !== rowOf && !c.closest('[role=row]').contains(document.activeElement));
    const look = (c) => { if (!c) return null; const parts = []; for (const e of [c, c.closest('[role=row]'), c.closest('[role=row]').querySelector(':scope > .dzg-seg-start')].filter(Boolean)) for (const p of [null, '::before', '::after']) { const s = getComputedStyle(e, p); parts.push([s.backgroundColor, s.color, s.outlineStyle, s.outlineColor, s.borderTopStyle + s.borderTopColor, s.borderInlineStartStyle + s.borderInlineStartColor, s.textDecorationLine, s.fontWeight, p ? s.content : ''].join(' ')); } return parts.join(' / '); };
    return { focus: focus ?? null, focusName: el ? name(el) : null, selected: !!sel, differs: sel && other ? look(sel) !== look(other) : null, sel: look(sel)?.slice(0, 200), other: look(other)?.slice(0, 200) };
  }
  window.__a11y = { targetSize, obscured, spacingOn, spacingResult, reflow, regions, born, said, moved, forced };
})();
`;

const site = await serve(import.meta.url);
async function open(ctx, path, locale, theme, width = 1200, height = 800) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(LIB);
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(site.root(`packages/dom/test/browser/${path}${sep}locale=${locale}&theme=${theme}`));
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await page.waitForSelector('[role=gridcell]', { timeout: 15000 });
  await frames(page, 4);
  return { page, errors };
}
/** The first body cell, focused as a click would (no click: a click selects, may start a drag). */
async function focusCell(page) {
  await page.evaluate(() => {
    const c = document.querySelector('.dzg-row .dzg-cell[data-col]');
    (c?.querySelector('[tabindex]') ?? c)?.focus();
  });
  await frames(page);
  const on = await page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName);
  if (on !== 'gridcell' && on !== 'rowheader') {
    // The grid gives its roving focus on its own entry: Tab from the page's start until a cell holds it.
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (['gridcell', 'rowheader'].includes(await page.evaluate(() => document.activeElement?.getAttribute('role')))) break; }
  }
}
const KEYS = [...Array(8).fill('ArrowDown'), 'PageDown', 'PageDown', ...Array(6).fill('ArrowUp'), ...Array(8).fill('ArrowRight'), 'End', 'Control+End', 'PageUp', 'Home', 'Control+Home'];
/** In Arabic the next column is ←: the walk goes the same logical way. */
async function walkKeys(page, rtl) {
  const hidden = [], part = [], pinned = [];
  await focusCell(page);
  for (const k of KEYS.map((x) => (rtl && x === 'ArrowRight' ? 'ArrowLeft' : x))) {
    await page.keyboard.press(k);
    await frames(page, 2);
    const o = await page.evaluate(() => window.__a11y.obscured());
    if (o?.hidden) (o.pinned ? pinned : hidden).push(`${k}: ${o.name} under ${o.by}`);
    else if (o?.part) part.push(`${k}: ${o.name} ${o.seen}/9`);
  }
  return { hidden, part, pinned };
}
async function walkTab(page) {
  const hidden = [];
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    await frames(page, 1);
    const o = await page.evaluate(() => window.__a11y.obscured());
    if (o?.hidden) hidden.push(`Tab ${i + 1}: ${o.name} under ${o.by}`);
  }
  return hidden;
}

const b = await browser(ENGINE);
try {
  const ctx = await b.newContext();
  for (const [key, path] of Object.entries(PAGES)) {
    if (ONLY && !ONLY.includes(key)) continue;
    for (const [locale, theme] of COMBOS) {
      const tag = `${key} ${locale.slice(0, 2)} ${theme}`;
      const { page, errors } = await open(ctx, path, locale, theme);
      try {
        if (ENGINE === 'chrome' && want('axe')) {
          await page.addScriptTag({ path: `${ROOT}node_modules/axe-core/axe.min.js` });
          const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes[0]?.target?.join(' ')})`));
          check(`${tag}: axe 0`, v.length === 0, v.length ? v : undefined);
        }
        if (want('status')) {
          const regions = await page.evaluate(() => window.__a11y.regions());
          const gone = regions.filter((r) => r.gone);
          check(`${tag}: 4.1.3 every live region in the accessibility tree (${regions.length})`, regions.length > 0 && gone.length === 0, gone.length ? gone : undefined);
          await focusCell(page);
          const n0 = await page.evaluate(() => window.__a11y.said.length);
          let onHeader = null;
          // ↑ to the header row (past a floating filter row).
          for (let i = 0; i < 3 && onHeader !== 'columnheader'; i++) {
            await page.keyboard.press('ArrowUp');
            await frames(page);
            onHeader = await page.evaluate(() => document.activeElement?.getAttribute('role'));
          }
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
          const said = await page.evaluate((n0) => window.__a11y.said.slice(n0), n0);
          // A pivot's or a group's header may not sort; the line says what was focused.
          if (onHeader === 'columnheader') check(`${tag}: 4.1.3 a sort by the keys is said in a live region`, said.length > 0, said.slice(-1));
          else note(`${tag}: 4.1.3 ↑ from the first cell reached ${onHeader}, no sort tried`, said.slice(-1));
          await page.keyboard.press('Enter'); // the sort put back to none takes two more presses at most; the walk does not care
          const born = await page.evaluate(() => window.__a11y.born);
          check(`${tag}: 4.1.3 no live region put in with its text already inside`, born.length === 0, born.length ? born : undefined);
        }
        if (want('focus')) {
          const w = await walkKeys(page, locale.startsWith('ar'));
          check(`${tag}: 2.4.11 the focused cell never entirely hidden, keys (${KEYS.length})`, w.hidden.length + w.pinned.length === 0, w.hidden.length + w.pinned.length ? [...w.hidden, ...w.pinned] : w.part.length ? { partly: w.part.length } : undefined);
          const t = await walkTab(page);
          check(`${tag}: 2.4.11 the focused control never entirely hidden, Tab ×40`, t.length === 0, t.length ? t : undefined);
        }
        if (want('targets')) {
          const s = await page.evaluate(() => window.__a11y.targetSize());
          check(`${tag}: 2.5.8 every control 24 × 24 or spaced (${s.measured} measured, ${s.small} under 24 and spaced)`, s.bad.length === 0, s.bad.length ? s.bad : undefined);
        }
        if (want('spacing')) {
          await page.evaluate(() => window.__a11y.spacingOn());
          await frames(page, 4);
          await page.waitForTimeout(100);
          const s = await page.evaluate(() => window.__a11y.spacingResult());
          await frames(page, 2);
          check(`${tag}: 1.4.12 no text newly cut with the four spacings (« … » added: ${s.cellEllipsis} cells, ${s.otherEllipsis.length} other)`, s.bad.length === 0, s.bad.length ? s.bad : s.otherEllipsis.length ? s.otherEllipsis : undefined);
        }
        if (want('motion')) {
          const m = await page.evaluate(() => window.__a11y.moved);
          check(`${tag}: reduced motion, no transition or animation over 50 ms`, m.length === 0, m.length ? [...new Set(m)] : undefined);
        }
        if (ENGINE === 'chrome' && want('forced')) {
          await page.emulateMedia({ forcedColors: 'active', colorScheme: theme, reducedMotion: 'reduce' });
          await focusCell(page);
          await page.keyboard.press('Space');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');
          await frames(page, 3);
          const f = await page.evaluate(() => window.__a11y.forced());
          await page.screenshot({ path: `${OUT}/forced-${key}-${locale.slice(0, 2)}-${theme}.png` });
          check(`${tag}: forced colours, the focused cell keeps an outline (${f.focus})`, !!f.focus, f.focus ? undefined : f);
          if (f.selected) check(`${tag}: forced colours, a selected row differs from another`, f.differs === true, f.differs ? undefined : f);
          else note(`${tag}: forced colours, Space selected no row on this page`, f.focusName);
          await page.emulateMedia({ forcedColors: 'none', colorScheme: theme, reducedMotion: 'reduce' });
        }
        if (want('reflow')) {
          await page.addStyleTag({ content: '#host, #zone { inline-size: auto !important; max-inline-size: 100% !important; }' });
          await page.setViewportSize({ width: 320, height: 256 });
          await frames(page, 4);
          await page.waitForTimeout(150);
          const r = await page.evaluate(() => window.__a11y.reflow());
          await page.screenshot({ path: `${OUT}/reflow-${key}-${locale.slice(0, 2)}-${theme}-${ENGINE}.png` });
          check(`${tag}: 1.4.10 at 320 × 256 the page does not scroll sideways (${r.pageWidth} / ${r.view}), controls in view`, r.pageWidth <= r.view + 1 && r.outside.length === 0, r.pageWidth > r.view + 1 || r.outside.length ? r : undefined);
          if (want('focus')) {
            const w = await walkKeys(page, locale.startsWith('ar'));
            check(`${tag}: 2.4.11 at 320 px, the focused cell never entirely hidden (but by pinned columns)`, w.hidden.length === 0, w.hidden.length ? w.hidden : undefined);
            // Pinned columns wider than the view leave the centre no room: released (pinned-columns.md, owner A).
            check(`${tag}: 2.4.11 at 320 px, pinned columns leave the centre room for the focused cell`, w.pinned.length === 0, w.pinned.length ? w.pinned : undefined);
          }
        }
        check(`${tag}: no page error`, errors.length === 0, errors.length ? errors : undefined);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await b.close();
  await site.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} ok (${ENGINE})`);
process.exit(failed.length ? 1 : 0);
