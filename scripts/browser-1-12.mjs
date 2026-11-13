/**
 * 1.12.0 looks in real browsers (docs/behaviors/presentation-settings.md 24–33, owner 2026-11-13 « toujours laisser le
 * choix »): `node scripts/browser-1-12.mjs`. Page `packages/dom/test/browser/v1-12.html`. The matrix: Chrome, Firefox,
 * WebKit × the layered sheets and the `*.unlayered.css` copies × light and dark × French and Arabic (right to left) ×
 * without and with Tailwind 3's preflight (an unlayered reset, as a real app has). One browser at a time, closed in
 * finally. `SHOTS=dir` keeps a screenshot per run; `--only=chrome` (or firefox, webkit) runs one browser.
 *
 * Each run: (1) every variable's default is today's look — the computed styles with variables.css equal those without
 * it — and setting it changes the computed style (table-driven, VARS); (2) the app's icons are never clipped nor
 * overdrawn by a default mark, sortNone on sortable unsorted columns only, the default marks back without icons;
 * (3) a hovered / selected / focused row's text colour, an app's own coloured content kept; (4) the column separator's
 * size and height; (5) the input edge on, recoloured, `none`; (6) the tooltip's arrow on each side, over its cell's
 * middle, mirrored in Arabic; (7) the last row and last column lines through scroll and sort; (8) axe finds nothing.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serve, browser } from '../spikes/kit.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (label, ok, detail) => {
  results.push(!!ok);
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}  ${ok ? '' : JSON.stringify(detail ?? null).slice(0, 900)}`);
};
const site = await serve(new URL('../packages/dom/test/browser/v1-12.html', import.meta.url).href);
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const RED = 'rgb(255, 0, 0)';

/**
 * Every variable an app sets (presentation-settings.md 26–33), where it shows: `at` an element the page has (or `make`,
 * markup put into the grid's root for a part it does not show here), `pseudo`, the property read, the value set, and
 * what the property must then be (`want`, the same as `value` when absent).
 */
const VARS = [
  { v: '--dzg-sort-fg', at: '.dzg-hcell[data-col=jan] > .dzg-sort', p: 'color', value: RED },
  { v: '--dzg-header-button-fg', reset: true, at: '.dzg-hcell[data-col=seed] > .dzg-mbtn', p: 'color', value: RED },
  { v: '--dzg-header-button-active-fg', reset: true, make: '<div class="dzg-hcell" data-dzg-filtered><button class="dzg-fbtn">x</button></div>', at: '[data-dzg-filtered] > .dzg-fbtn', p: 'color', value: RED },
  { v: '--dzg-header-padding-inline', at: '.dzg-hrow .dzg-hcell[data-col=jan]', p: 'padding-inline-start', value: '13px' },
  { v: '--dzg-header-separator-end', at: '.dzg-hrow .dzg-hcell[data-last-col] > .dzg-resize', pseudo: '::after', p: 'background-color', value: RED },
  { v: '--dzg-header-group-line', reset: true, make: '<div class="dzg-hcell dzg-hgroup">g</div>', at: '.dzg-hgroup', p: 'border-inline-end-width', value: '3px solid red', want: '3px' },
  { v: '--dzg-column-separator', at: '.dzg-layer .dzg-cell[data-col=jan]', p: 'background-image', value: RED, want: (x) => x.includes(RED) },
  { v: '--dzg-column-separator-size', with: { '--dzg-column-separator': RED }, at: '.dzg-layer .dzg-cell[data-col=jan]', p: 'background-size', value: '3px', want: '3px 100%', dp: 'background-image' },
  { v: '--dzg-column-separator-height', with: { '--dzg-column-separator': RED }, at: '.dzg-layer .dzg-cell[data-col=jan]', p: 'background-size', value: '50%', want: '1px 50%', dp: 'background-image' },
  { v: '--dzg-last-column-line', reset: true, at: '.dzg-layer .dzg-cell[data-last-col]', p: 'border-inline-end-width', value: '3px solid red', want: '3px' },
  { v: '--dzg-last-row-line', reset: true, bottom: true, at: '.dzg-layer .dzg-row[data-last-row] .dzg-cell[data-col=jan]', p: 'border-block-end-style', value: '3px dashed red', want: 'dashed' },
  { v: '--dzg-input-border', at: '.dzg-finput', p: 'outline-color', value: RED },
  { v: '--dzg-input-bg', at: '.dzg-finput', p: 'background-color', value: RED },
  { v: '--dzg-input-fg', reset: true, at: '.dzg-finput', p: 'color', value: RED },
  { v: '--dzg-input-radius', at: '.dzg-finput', p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-button-fg', reset: true, at: '.dzg-pbtn[data-go=next]', p: 'color', value: RED },
  { v: '--dzg-button-radius', at: '.dzg-pbtn[data-go=next]', p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-footer-fg', at: '.dzg-footer', p: 'color', value: RED },
  { v: '--dzg-footer-bg', at: '.dzg-footer', p: 'background-color', value: RED },
  { v: '--dzg-overlay-fg', at: '.dzg-overlay', p: 'color', value: RED },
  { v: '--dzg-overlay-bg', at: '.dzg-overlay', p: 'background-color', value: RED },
  { v: '--dzg-popup-radius', make: '<div class="dzg-popup">p</div>', at: '.dzg-popup', p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-popup-border', reset: true, make: '<div class="dzg-popup">p</div>', at: '.dzg-popup', p: 'border-block-start-style', value: '3px dashed red', want: 'dashed' },
  { v: '--dzg-popup-padding', make: '<div class="dzg-popup">p</div>', at: '.dzg-popup', p: 'padding-inline-start', value: '9px' },
  { v: '--dzg-option-selected-bg', make: '<div class="dzg-fopt" aria-selected="true">o</div>', at: '.dzg-fopt', p: 'background-color', value: RED },
  { v: '--dzg-tooltip-font-size', tip: true, at: '.dzg-tooltip', p: 'font-size', value: '21px' },
  { v: '--dzg-tooltip-font-family', tip: true, at: '.dzg-tooltip', p: 'font-family', value: 'serif' },
  { v: '--dzg-tooltip-font-weight', tip: true, at: '.dzg-tooltip', p: 'font-weight', value: '700' },
  { v: '--dzg-tooltip-line-height', tip: true, at: '.dzg-tooltip', p: 'line-height', value: '30px' },
  { v: '--dzg-tooltip-max-width', tip: true, at: '.dzg-tooltip', p: 'max-inline-size', value: '99px' },
  { v: '--dzg-tooltip-padding-block', tip: true, at: '.dzg-tooltip', p: 'padding-block-start', value: '9px' },
  { v: '--dzg-tooltip-padding-inline', tip: true, at: '.dzg-tooltip', p: 'padding-inline-start', value: '11px' },
  { v: '--dzg-tooltip-radius', tip: true, at: '.dzg-tooltip', p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-tooltip-white-space', tip: true, at: '.dzg-tooltip', p: 'white-space', value: 'pre-line' },
  { v: '--dzg-tooltip-bg', tip: true, at: '.dzg-tooltip', p: 'background-color', value: RED },
  { v: '--dzg-tooltip-fg', tip: true, at: '.dzg-tooltip', p: 'color', value: RED },
  { v: '--dzg-tooltip-arrow-size', tip: true, at: '.dzg-tooltip', pseudo: '::before', p: 'block-size', value: '10px', was: '6px' },
  { v: '--dzg-tooltip-arrow-color', tip: true, at: '.dzg-tooltip', pseudo: '::before', p: 'background-color', value: RED, was: 'tooltip' },
];

// `reset`: a border, or a button's or an input's colour, which an unlayered reset (Tailwind 3's preflight) takes from the
// layered sheets by design (theming.md: such an app loads the `*.unlayered.css` copies); checked in every other run.

/** Puts the page in the state an entry needs: the tooltip shown, the body at its last row, the markup made. */
async function stage(page, e) {
  await page.evaluate(() => { document.querySelectorAll('[data-made]').forEach((x) => x.remove()); });
  if (e.make) await page.evaluate((html) => { const d = document.createElement('div'); d.dataset.made = ''; d.innerHTML = html; document.querySelector('.dzg').append(d); }, e.make);
  await page.evaluate((bottom) => { const v = document.querySelector('.dzg-viewport'); v.scrollTop = bottom ? v.scrollHeight : 0; }, !!e.bottom);
  await frames(page);
  // The pointer moved off and back (twice at most): a hover the browser coalesced shows nothing.
  for (let i = 0; e.tip && i < 2; i++) {
    await page.mouse.move(0, 0);
    await frames(page);
    await page.hover('.dzg-layer .dzg-row[aria-rowindex="4"] .dzg-cell[data-col=grams]');
    if (await page.waitForFunction(() => !document.querySelector('.dzg-tooltip').hidden, null, { timeout: 3000 }).then(() => true, () => false)) break;
  }
}

const read = (page, { at, pseudo, p }) => page.evaluate(({ at, pseudo, p }) => {
  const el = document.querySelector(at);
  return el ? getComputedStyle(el, pseudo ?? null).getPropertyValue(p) : null;
}, { at, pseudo, p });

async function run(name, cfg) {
  const { css, dark, lang, preflight } = cfg;
  const tag = `${name} ${css}${dark ? ' dark' : ''} ${lang}${preflight ? ' preflight' : ''}`;
  const rtl = lang === 'ar';
  const url = (more) => site.url(`v1-12.html?lang=${lang}&css=${css}${dark ? '&dark=1' : ''}${preflight ? '&preflight=1' : ''}${more}`);
  const b = await browser(name);
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 900, height: 700 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const open = async (more) => {
      await page.goto(url(more));
      await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
      await frames(page);
    };

    // (1) Defaults: without variables.css, then with it — the same computed look.
    await open('&vars=0');
    const pf = await page.evaluate(() => [...document.styleSheets].some((x) => x.href?.includes('preflight') && x.cssRules.length > 10));
    check(`${tag}: the preflight ${preflight ? 'loaded' : 'absent'}`, pf === preflight, pf);
    const before = [];
    // A separator's size or height with no separator draws nothing: its default is read on the image (`dp`).
    const dflt = (e) => (e.dp ? { ...e, p: e.dp } : e);
    for (const e of VARS) {
      await stage(page, e);
      before.push(await read(page, dflt(e)));
    }
    const baseInput = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.dzg-finput')); return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset }; });
    check(`${tag}: the filter box edged by default (a line a reset cannot erase)`, baseInput.style === 'solid' && baseInput.width === '1px' && baseInput.offset === '-1px', baseInput);
    await open('');
    for (const [i, e] of VARS.entries()) {
      await stage(page, e);
      const now = await read(page, dflt(e));
      // The arrow is new (owner 5, decided): its default is checked, not compared with 1.11 (which had none).
      if (e.was === 'tooltip') check(`${tag}: ${e.v} unset: the tooltip's background`, now === (await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-tooltip')).backgroundColor)), now);
      else if (e.was) check(`${tag}: ${e.v} unset: ${e.was}`, now === e.was, now);
      else check(`${tag}: ${e.v} unset leaves today's look`, now === before[i], { now, before: before[i] });
      await page.evaluate(({ v, value, more }) => { const r = document.querySelector('.dzg'); for (const [k, x] of Object.entries(more ?? {})) r.style.setProperty(k, x); r.style.setProperty(v, value); }, { v: e.v, value: e.value, more: e.with });
      await frames(page);
      await stage(page, e);
      const set = await read(page, e);
      const want = e.want ?? e.value;
      if (!(e.reset && css === 'layered' && preflight)) check(`${tag}: ${e.v} set changes the look`, typeof want == 'function' ? want(set) : set === want, { set, want: String(want) });
      await page.evaluate(({ v, more }) => { const r = document.querySelector('.dzg'); for (const k of [v, ...Object.keys(more ?? {})]) r.style.removeProperty(k); }, { v: e.v, more: e.with });
      await page.mouse.move(0, 0);
    }
    await page.evaluate(() => { document.querySelectorAll('[data-made]').forEach((x) => x.remove()); document.querySelector('.dzg-viewport').scrollTop = 0; });
    await frames(page);

    // (5) The input edge: `none` takes it away, whatever the reset.
    const edge = await page.evaluate(() => { const r = document.querySelector('.dzg'); r.style.setProperty('--dzg-input-border', 'none'); const s = getComputedStyle(document.querySelector('.dzg-finput')).outlineStyle; r.style.removeProperty('--dzg-input-border'); return s; });
    check(`${tag}: --dzg-input-border: none just works`, edge === 'none', edge);

    // (3) A row's text when hovered, selected, focused; an app's own coloured content keeps its colour.
    const fg = await page.evaluate(async (RED) => {
      const r = document.querySelector('.dzg');
      const cell = (i) => document.querySelector(`.dzg-layer .dzg-row[aria-rowindex="${i}"] .dzg-cell[data-col=note]`);
      const rest = getComputedStyle(cell(5)).color;
      for (const v of ['--dzg-row-hover-fg', '--dzg-row-selected-fg', '--dzg-row-active-fg']) r.style.setProperty(v, RED);
      const led = document.createElement('span');
      led.className = 'app-led';
      led.textContent = '●';
      cell(4).append(led);
      return { rest, ledAtRest: getComputedStyle(led).color };
    }, RED);
    await page.hover('.dzg-layer .dzg-row[aria-rowindex="4"] .dzg-cell[data-col=note]');
    const hovered = await page.evaluate(() => {
      const c = document.querySelector('.dzg-layer .dzg-row[aria-rowindex="4"] .dzg-cell[data-col=note]');
      return { cell: getComputedStyle(c).color, led: getComputedStyle(c.querySelector('.app-led')).color, other: getComputedStyle(document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"] .dzg-cell[data-col=note]')).color };
    });
    check(`${tag}: the hovered row's text takes --dzg-row-hover-fg, the others not, an app's coloured content keeps its own`, hovered.cell === RED && hovered.other === fg.rest && hovered.led === 'rgb(0, 128, 0)', { ...hovered, ...fg });
    await page.mouse.move(0, 0);
    await page.evaluate(() => { document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"]').setAttribute('aria-selected', 'true'); });
    const sel = await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"] .dzg-cell[data-col=note]')).color);
    check(`${tag}: a selected row's text takes --dzg-row-selected-fg`, sel === RED, sel);
    await page.evaluate(() => { document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"]').removeAttribute('aria-selected'); const r = document.querySelector('.dzg'); for (const v of ['--dzg-row-hover-fg', '--dzg-row-selected-fg', '--dzg-row-active-fg']) r.style.removeProperty(v); });

    // (4) The separator: a 2 px mark, 60 % of the row's height, at the inline end; none after the last column nor
    // after a pinned part's last cell.
    const sep = await page.evaluate((rtl) => {
      const r = document.querySelector('.dzg');
      r.style.setProperty('--dzg-column-separator', 'rgb(255, 0, 0)');
      r.style.setProperty('--dzg-column-separator-size', '2px');
      r.style.setProperty('--dzg-column-separator-height', '60%');
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const mid = cs('.dzg-layer .dzg-row .dzg-cell[data-col=jan]');
      const out = { size: mid.backgroundSize, pos: mid.backgroundPosition, last: cs('.dzg-layer .dzg-row .dzg-cell[data-last-col]').backgroundImage, pinnedLast: cs('.dzg-layer .dzg-row .dzg-seg-start > .dzg-cell:last-child').backgroundImage, rtl };
      return out;
    }, rtl);
    check(`${tag}: the column separator 2 px by 60 %, at the inline end; none after the last column or a pinned part`, sep.size === '2px 60%' && (rtl ? ['0% 50%', '0px 50%'].includes(sep.pos) : sep.pos === '100% 50%') && sep.last === 'none' && sep.pinnedLast === 'none', sep);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-separators.png` });
    await page.evaluate(() => { const r = document.querySelector('.dzg'); for (const v of ['--dzg-column-separator', '--dzg-column-separator-size', '--dzg-column-separator-height']) r.style.removeProperty(v); });

    // (6) The tooltip's arrow: below a cell (block-end), then above one near the window's bottom (block-start); its middle
    // over the cell's middle (inside the cell), mirrored in Arabic.
    const tipAt = async (row) => {
      await page.mouse.move(0, 0);
      await page.hover(`.dzg-layer .dzg-row[aria-rowindex="${row}"] .dzg-cell[data-col=grams]`);
      await page.waitForFunction(() => !document.querySelector('.dzg-tooltip').hidden, null, { timeout: 5000 });
      await frames(page);
      return page.evaluate(({ row, rtl }) => {
        const t = document.querySelector('.dzg-tooltip');
        const c = document.querySelector(`.dzg-layer .dzg-row[aria-rowindex="${row}"] .dzg-cell[data-col=grams]`).getBoundingClientRect();
        const b = t.getBoundingClientRect();
        const at = parseFloat(t.style.getPropertyValue('--dzg-tip-at'));
        const x = rtl ? b.right - at : b.left + at;
        const a = getComputedStyle(t, '::before');
        return { side: t.dataset.side, x, cell: [c.left, c.right, c.top, c.bottom], box: [b.left, b.right, b.top, b.bottom], rotate: a.rotate, h: a.blockSize, bg: a.backgroundColor, tipBg: getComputedStyle(t).backgroundColor };
      }, { row, rtl });
    };
    const below = await tipAt(3);
    // The arrow as near the cell's middle as the tooltip allows (12 px inside its edges), inside the cell.
    const aimed = (t) => Math.abs(t.x - Math.min(Math.max((t.cell[0] + t.cell[1]) / 2, t.box[0] + 12), t.box[1] - 12)) < 2 && t.x > t.cell[0] && t.x < t.cell[1];
    check(`${tag}: below its cell, block-end, the arrow toward the cell's middle, the tooltip's colour`, below.side === 'block-end' && below.box[2] >= below.cell[3] + 6 && aimed(below) && below.h === '6px' && below.bg === below.tipBg && (below.rotate === 'none' || below.rotate === '0deg'), below);
    const hostBottom = await page.evaluate(() => Math.round(document.querySelector('.dzg-layer .dzg-row[aria-rowindex="9"]').getBoundingClientRect().bottom));
    await page.setViewportSize({ width: 900, height: hostBottom + 4 });
    const above = await tipAt(9);
    check(`${tag}: no room below: above its cell, block-start, the arrow turned toward it`, above.side === 'block-start' && above.box[3] <= above.cell[2] - 6 && aimed(above) && above.rotate === '180deg', above);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-tooltip-above.png` });
    await page.setViewportSize({ width: 900, height: 700 });
    const off = await page.evaluate(() => { const t = document.querySelector('.dzg-tooltip'); t.style.setProperty('--dzg-tooltip-arrow-size', '0'); const h = getComputedStyle(t, '::before').blockSize; t.style.removeProperty('--dzg-tooltip-arrow-size'); return h; });
    check(`${tag}: --dzg-tooltip-arrow-size: 0 turns the arrow off`, off === '0px', off);
    await page.mouse.move(0, 0);

    // (7) The last row and the last column through scroll and sort.
    const last = async () => page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dzg-layer > .dzg-row')];
      const marked = rows.filter((r) => r.hasAttribute('data-last-row'));
      const max = Math.max(...rows.map((r) => Number(r.getAttribute('aria-rowindex'))));
      const w = (r) => getComputedStyle(r.querySelector('.dzg-cell[data-col=jan]')).borderBlockEndWidth;
      return { marked: marked.map((r) => Number(r.getAttribute('aria-rowindex'))), max, width: marked[0] && w(marked[0]), other: w(rows.find((r) => !r.hasAttribute('data-last-row'))), col: [...new Set([...document.querySelectorAll('[data-last-col]')].map((c) => c.dataset.col))] };
    });
    await page.evaluate(() => { const r = document.querySelector('.dzg'); r.style.setProperty('--dzg-last-row-line', '3px solid rgb(255, 0, 0)'); const v = document.querySelector('.dzg-viewport'); v.scrollTop = v.scrollHeight; });
    await frames(page);
    let l = await last();
    check(`${tag}: scrolled to the end, the last row alone marked, its line 3 px; the last column mar`, l.marked.length === 1 && l.marked[0] === l.max && (css === 'layered' && preflight ? true : l.width === '3px' && l.other === '1px') && l.col.length === 1 && l.col[0] === 'mar', l);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-last-row.png` });
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'grams', dir: 'desc' }] }, 'host'));
    await frames(page);
    l = await last();
    check(`${tag}: after a sort, still the last row shown alone`, l.marked.length === 1 && l.marked[0] === l.max && (css === 'layered' && preflight ? true : l.width === '3px'), l);
    await page.evaluate(() => { document.querySelector('.dzg').style.removeProperty('--dzg-last-row-line'); document.querySelector('.dzg-viewport').scrollTop = 0; window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'jan', dir: 'asc' }] }, 'host'); });
    await frames(page);

    // (2) Without icons: the default marks.
    const marks = () => page.evaluate(() => {
      const d = document.createElement('span');
      d.className = 'dzg-msub';
      d.dataset.made = '';
      document.querySelector('.dzg').append(d);
      const cs = (sel, ps) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, ps ?? null) : null; };
      const f = cs('.dzg-hcell[data-col=seed] > .dzg-fbtn', '::before');
      const fa = cs('.dzg-hcell[data-col=seed] > .dzg-fbtn', '::after');
      const s = cs('.dzg-hcell[data-col=grams] > .dzg-sort[data-dir]', '::before');
      const m = cs('.dzg-hcell[data-col=seed] > .dzg-mbtn', '::before');
      const sub = cs('.dzg-msub');
      const btn = document.querySelector('.dzg-hcell[data-col=seed] > .dzg-fbtn').getBoundingClientRect();
      const out = {
        funnel: { clip: f.clipPath, mask: f.maskImage || f.webkitMaskImage, inset: [f.top, f.left], btn: [btn.width, btn.height], content: f.content, w: parseFloat(f.width), h: parseFloat(f.height) }, hollow: fa.content,
        sort: s && { content: s.content, mask: s.maskImage || s.webkitMaskImage }, sortDir: document.querySelector('.dzg-hcell[data-col=grams] > .dzg-sort')?.dataset.dir ?? null,
        unsortable: !!document.querySelector('.dzg-hcell[data-col=feb] > .dzg-sort'), asc: cs('.dzg-hcell[data-col=jan] > .dzg-sort', '::before').content,
        menu: { clip: m.clipPath, mask: m.maskImage || m.webkitMaskImage, content: m.content, w: parseFloat(m.width), h: parseFloat(m.height) }, sub: { clip: sub.clipPath, mask: sub.maskImage || sub.webkitMaskImage, bg: sub.backgroundColor },
      };
      d.remove();
      return out;
    });
    const dm = await marks();
    check(`${tag}: no app icon: the default funnel, its hollow, the triangles, the ⋮ and the submenu arrow`, dm.funnel.clip.startsWith('polygon') && dm.hollow === '""' && dm.sort === null && dm.asc.includes('▲') && dm.menu.clip.startsWith('path') && dm.sub.clip.startsWith('path'), dm);

    if (process.argv.includes('--axe') || name === 'chrome') {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(`${tag}: axe finds nothing`, v.length === 0, v);
    }

    // (2) With the app's icons: never clipped, never overdrawn, at the button's full box; sortNone on sortable unsorted
    // columns only.
    await open('&icons=1');
    const im = await marks();
    const isIcon = (x) => /data:image\/svg\+xml/.test(x.mask ?? '') && (x.clip === 'none' || x.clip === undefined);
    // Drawn at all, and over the button's whole box (24 px), not shrunk by a default mark's insets.
    const full = (x) => x.content === '""' && x.w >= 20 && x.h >= 20;
    check(`${tag}: the app's funnel full size, unclipped, no hollow drawn over it`, isIcon(im.funnel) && full(im.funnel) && im.funnel.inset.every((x) => x === '0px') && im.hollow === 'none', im.funnel);
    check(`${tag}: the app's ⋮ and submenu arrow unclipped, in the mark's colour`, isIcon(im.menu) && full(im.menu) && isIcon(im.sub) && im.sub.bg !== 'rgba(0, 0, 0, 0)', { menu: im.menu, sub: im.sub });
    check(`${tag}: sortNone on a sortable unsorted column, none on an unsortable one; the sorted one its own`, im.sortDir === 'none' && /data:image\/svg\+xml/.test(im.sort?.mask ?? '') && im.sort.content === '""' && !im.unsortable && im.asc === '""', im);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-icons.png`, clip: { x: 0, y: 0, width: 900, height: 200 } });
    if (name === 'chrome') {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(`${tag}: with icons, axe finds nothing`, v.length === 0, v);
    }
    check(`${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
    await page.close();
  } finally {
    await b.close().catch(() => {});
  }
  console.log(`done ${tag}: ${results.filter(Boolean).length} / ${results.length} so far`);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
try {
  for (const name of ['chrome', 'firefox', 'webkit']) {
    if (only && only !== name) continue;
    for (const css of ['layered', 'unlayered']) for (const dark of [false, true]) for (const lang of ['fr', 'ar']) for (const preflight of [false, true]) {
      // `--first`: one run per browser (layered, light, French), while working.
      if (process.argv.includes('--first') && (css !== 'layered' || dark || lang !== 'fr' || preflight)) continue;
      await run(name, { css, dark, lang, preflight });
    }
  }
} finally {
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
