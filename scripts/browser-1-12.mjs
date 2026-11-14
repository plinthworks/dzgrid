/**
 * 1.12.0 looks in real browsers (docs/behaviors/presentation-settings.md 24–33, owner 2026-11-13 « toujours laisser le
 * choix »): `node scripts/browser-1-12.mjs`. Page `packages/dom/test/browser/v1-12.html`. The matrix: Chrome, Firefox,
 * WebKit × the layered sheets and the `*.unlayered.css` copies × light and dark × French and Arabic (right to left) ×
 * without and with Tailwind 3's preflight (an unlayered reset, as a real app has). One browser at a time, closed in
 * finally. `SHOTS=dir` keeps a screenshot per run; `--only=chrome` (or firefox, webkit) runs one browser;
 * `--match=preflight` (any part of a run's name) only the runs that hold it.
 *
 * Each run: (1) every variable's default is today's look — the computed styles with variables.css equal those without
 * it — and setting it changes the computed style (table-driven, VARS); (2) the app's icons are never clipped nor
 * overdrawn by a default mark, sortNone on sortable unsorted columns only, the default marks back without icons;
 * (3) a hovered / selected / focused row's text colour, an app's own coloured content kept; (4) the column separator's
 * size and height; (5) the input edge on, recoloured, `none`; (6) the tooltip's arrow on each side, over its cell's
 * middle, mirrored in Arabic; (7) the last row and last column lines through scroll and sort; (8) axe finds nothing;
 * (9) a header's title, sort mark and filter button in place, start- and end-aligned, whatever the reset; (10) the set
 * filter's list as wide as its longest value; and the 1.12.0 corrections' variables (buttons.css, the unsorted mark,
 * a row's text forced under `data-dzg-row-fg="force"`, `--dzg-row-state-fg`); and (39–40) the pagination bar: the popups'
 * button variables leave the pager's buttons and select as they are, the pager's own change the pager only, each bar
 * variable's default and effect, the text sizes (a menu item untouched); (11) tooltips and popovers (tipsChecks).
 * `--tips` runs (11) alone.
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
/** A filter popup's footer, as the grid draws it (made in the grid's root: the popup itself is not open here). */
const FOOT = '<div class="dzg-ffoot"><button type="button" class="dzg-fclr">Effacer</button><button type="button" class="dzg-fapply">Appliquer</button></div>';
/** The overlay's Retry and a menu item, made in the grid's root (not shown here); the pager's controls, drawn by pagination(). */
const RETRY = '<button type="button" class="dzg-retry">Réessayer</button>';
const MENU = '<div class="dzg-menu" role="menu"><div role="menuitem">Trier</div></div>';
const NEXT = '.dzg-footer .dzg-pbtn[data-go=next]';
const FIRST = '.dzg-footer .dzg-pbtn[data-go=first]';
const CLEAR = '.dzg-footer .dzg-pbtn[data-act=clear]';
/** The selection's part, hidden while nothing is selected. */
const SEL = '.dzg-psel, .dzg-psel [hidden]';
const SELECT = '.dzg-footer select';
/** `want` for a variable that must leave this element as it is (39: the popups' and the pager's apart). */
const SAME = (x, d) => x === d;

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
  { v: '--dzg-button-fg', reset: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'color', value: RED },
  { v: '--dzg-button-radius', make: FOOT, at: '[data-made] .dzg-fclr', p: 'border-start-start-radius', value: '7px' },
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
  // buttons.css (presentation-settings.md 36): a filter popup's footer, Clear and Apply; under the pointer (`hover`), pressed (`press`).
  { v: '--dzg-button-font-weight', reset: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'font-weight', value: '700' },
  { v: '--dzg-button-padding-inline', reset: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'padding-inline-start', value: '13px' },
  { v: '--dzg-button-height', make: FOOT, at: '[data-made] .dzg-fclr', p: 'min-block-size', value: '41px' },
  { v: '--dzg-button-hover-bg', reset: true, hover: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'background-color', value: RED },
  { v: '--dzg-button-hover-fg', reset: true, hover: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'color', value: RED },
  { v: '--dzg-button-active-bg', reset: true, press: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'background-color', value: RED },
  { v: '--dzg-button-primary-bg', reset: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'background-color', value: RED },
  { v: '--dzg-button-primary-fg', reset: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'color', value: RED },
  { v: '--dzg-button-primary-border', reset: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'border-inline-start-color', value: RED },
  { v: '--dzg-button-primary-hover-bg', reset: true, hover: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'background-color', value: RED },
  { v: '--dzg-button-primary-hover-fg', reset: true, hover: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'color', value: RED },
  { v: '--dzg-button-primary-active-bg', reset: true, press: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'background-color', value: RED },
  // The secondary's hover leaves Apply as it is (its own variables).
  { v: '--dzg-button-hover-bg', reset: true, hover: true, make: FOOT, at: '[data-made] .dzg-fapply', p: 'background-color', value: RED, want: (x, d) => x === d },
  // 39: the text size of the popups' buttons and Retry; the pager's buttons and select follow it (asked); a menu item not.
  { v: '--dzg-button-font-size', reset: true, make: FOOT, at: '[data-made] .dzg-fclr', p: 'font-size', value: '21px' },
  { v: '--dzg-button-font-size', reset: true, make: RETRY, at: '[data-made] .dzg-retry', p: 'font-size', value: '21px' },
  { v: '--dzg-button-font-size', reset: true, at: NEXT, p: 'font-size', value: '21px' },
  { v: '--dzg-button-font-size', reset: true, at: SELECT, p: 'font-size', value: '21px' },
  { v: '--dzg-button-font-size', make: MENU, at: '[data-made] [role=menuitem]', p: 'font-size', value: '21px', want: SAME },
  // 39: the popups' button variables leave the pager's buttons and its select as they are.
  { v: '--dzg-button-bg', at: NEXT, p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-button-border', at: NEXT, p: 'border-inline-start-color', value: RED, want: SAME },
  { v: '--dzg-button-fg', at: NEXT, p: 'color', value: RED, want: SAME },
  { v: '--dzg-button-radius', at: NEXT, p: 'border-start-start-radius', value: '7px', want: SAME },
  { v: '--dzg-button-font-weight', at: NEXT, p: 'font-weight', value: '700', want: SAME },
  { v: '--dzg-button-height', at: NEXT, p: 'min-block-size', value: '41px', want: SAME },
  { v: '--dzg-button-padding-inline', show: SEL, at: CLEAR, p: 'padding-inline-start', value: '13px', want: SAME },
  { v: '--dzg-button-hover-bg', hover: true, at: NEXT, p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-button-bg', at: SELECT, p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-button-border', at: SELECT, p: 'border-inline-start-color', value: RED, want: SAME },
  { v: '--dzg-button-fg', at: SELECT, p: 'color', value: RED, want: SAME },
  { v: '--dzg-button-radius', at: SELECT, p: 'border-start-start-radius', value: '7px', want: SAME },
  // 40: the strip (the status bar's too) and the pager's place.
  { v: '--dzg-footer-line', reset: true, at: '.dzg-footer', p: 'border-block-start-style', value: '3px dashed red', want: 'dashed' },
  { v: '--dzg-footer-padding-block', at: '.dzg-footer', p: 'padding-block-start', value: '9px' },
  { v: '--dzg-footer-padding-inline', at: '.dzg-footer', p: 'padding-inline-start', value: '11px' },
  { v: '--dzg-footer-height', at: '.dzg-footer', p: 'min-block-size', value: '77px' },
  { v: '--dzg-footer-gap', at: '.dzg-footer', p: 'column-gap', value: '3px 5px', want: '5px' },
  { v: '--dzg-footer-font-size', at: '.dzg-footer', p: 'font-size', value: '21px' },
  { v: '--dzg-footer-justify', at: '.dzg-footer', p: 'justify-content', value: 'center' },
  { v: '--dzg-footer-align', at: '.dzg-footer', p: 'align-items', value: 'flex-end' },
  { v: '--dzg-pager-margin-inline-start', at: '.dzg-footer > nav', p: 'margin-inline-start', value: '0px' },
  // 40: the texts.
  ...[['count', '.dzg-pcount'], ['page', '.dzg-ppage'], ['label', '.dzg-psize > span'], ['selected', '.dzg-pseltext']].flatMap(([n, at]) => [
    { v: `--dzg-pager-${n}-fg`, show: SEL, at, p: 'color', value: RED },
    { v: `--dzg-pager-${n}-font-weight`, show: SEL, at, p: 'font-weight', value: '700' },
    { v: `--dzg-pager-${n}-font-size`, show: SEL, at, p: 'font-size', value: '21px' },
  ]),
  // 39–40: the pager's buttons, their own variables; the popups' buttons left as they are.
  { v: '--dzg-pager-button-bg', reset: true, at: NEXT, p: 'background-color', value: RED },
  { v: '--dzg-pager-button-fg', reset: true, at: NEXT, p: 'color', value: RED },
  { v: '--dzg-pager-button-border', reset: true, at: NEXT, p: 'border-inline-start-color', value: RED },
  { v: '--dzg-pager-button-radius', at: NEXT, p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-pager-button-font-size', reset: true, at: NEXT, p: 'font-size', value: '21px' },
  { v: '--dzg-pager-button-font-weight', reset: true, at: NEXT, p: 'font-weight', value: '700' },
  { v: '--dzg-pager-button-size', at: NEXT, p: 'min-block-size', value: '41px' },
  { v: '--dzg-pager-button-size', at: NEXT, p: 'inline-size', value: '41px', want: (x) => Math.abs(parseFloat(x) - 41) < 3 },
  { v: '--dzg-pager-button-padding-inline', reset: true, show: SEL, at: CLEAR, p: 'padding-inline-start', value: '13px' },
  { v: '--dzg-pager-button-padding-inline', at: NEXT, p: 'padding-inline-start', value: '13px', want: SAME },
  { v: '--dzg-pager-button-hover-bg', reset: true, hover: true, at: NEXT, p: 'background-color', value: RED },
  { v: '--dzg-pager-button-hover-fg', reset: true, hover: true, at: NEXT, p: 'color', value: RED },
  { v: '--dzg-pager-button-active-bg', reset: true, press: true, at: NEXT, p: 'background-color', value: RED },
  { v: '--dzg-pager-button-hover-bg', hover: true, at: FIRST, p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-pager-button-disabled-fg', reset: true, at: FIRST, p: 'color', value: RED },
  { v: '--dzg-pager-button-disabled-bg', reset: true, at: FIRST, p: 'background-color', value: RED },
  { v: '--dzg-pager-button-bg', make: FOOT, at: '[data-made] .dzg-fclr', p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-pager-button-font-size', make: FOOT, at: '[data-made] .dzg-fclr', p: 'font-size', value: '21px', want: SAME },
  // 40: the select, its own and the pager buttons' (followed); the ring.
  { v: '--dzg-pager-select-bg', reset: true, at: SELECT, p: 'background-color', value: RED },
  { v: '--dzg-pager-select-fg', reset: true, at: SELECT, p: 'color', value: RED },
  { v: '--dzg-pager-select-border', reset: true, at: SELECT, p: 'border-inline-start-color', value: RED },
  { v: '--dzg-pager-select-radius', native: true, at: SELECT, p: 'border-start-start-radius', value: '7px' },
  { v: '--dzg-pager-select-padding-inline', native: true, reset: true, at: SELECT, p: 'padding-inline-start', value: '13px' },
  { v: '--dzg-pager-select-height', native: true, at: SELECT, p: 'min-block-size', value: '41px' },
  { v: '--dzg-pager-select-font-size', reset: true, at: SELECT, p: 'font-size', value: '21px' },
  { v: '--dzg-pager-select-font-weight', reset: true, at: SELECT, p: 'font-weight', value: '700' },
  { v: '--dzg-pager-button-bg', reset: true, at: SELECT, p: 'background-color', value: RED },
  { v: '--dzg-pager-button-border', reset: true, at: SELECT, p: 'border-inline-start-color', value: RED },
  { v: '--dzg-pager-select-bg', at: NEXT, p: 'background-color', value: RED, want: SAME },
  { v: '--dzg-pager-focus-ring', reset: true, focus: '.dzg-footer .dzg-pbtn[data-go=prev]', at: NEXT, p: 'outline-style', value: '3px dashed red', want: 'dashed' },
  { v: '--dzg-pager-focus-ring', reset: true, focus: '.dzg-footer .dzg-pbtn[data-go=last]', at: SELECT, p: 'outline-color', value: '3px dashed red', want: RED },
];

// `reset`: a border, or a button's or an input's colour, which an unlayered reset (Tailwind 3's preflight) takes from the
// layered sheets by design (theming.md: such an app loads the `*.unlayered.css` copies); checked in every other run.

/** Puts the page in the state an entry needs: the tooltip shown, the body at its last row, the markup made. */
async function stage(page, e) {
  await page.evaluate(() => { document.querySelectorAll('[data-made]').forEach((x) => x.remove()); document.querySelectorAll('[data-shown]').forEach((x) => { x.hidden = true; delete x.dataset.shown; }); });
  // A part hidden while nothing is selected, shown for the read (WebKit keeps a stale style under display: none).
  if (e.show) await page.evaluate((sel) => document.querySelectorAll(sel).forEach((x) => { if (x.hidden) { x.hidden = false; x.dataset.shown = ''; } }), e.show);
  if (e.make) await page.evaluate((html) => { const d = document.createElement('div'); d.dataset.made = ''; d.innerHTML = html; document.querySelector('.dzg').append(d); }, e.make);
  await page.evaluate((bottom) => { document.activeElement?.blur?.(); const v = document.querySelector('.dzg-viewport'); v.scrollTop = bottom ? v.scrollHeight : 0; }, !!e.bottom);
  await frames(page);
  // Focused from the keyboard (`:focus-visible`): a key, then the focus.
  // Tab from the control before it (Firefox ignores a modifier key after a pointer press); where Tab skips buttons
  // (WebKit), a key then the focus.
  if (e.focus) {
    await page.evaluate((from) => document.querySelector(from).focus(), e.focus);
    await page.keyboard.press('Tab');
    if (!(await page.evaluate((at) => document.activeElement === document.querySelector(at), e.at))) {
      await page.keyboard.press('Shift');
      await page.evaluate((at) => document.querySelector(at).focus(), e.at);
    }
    await frames(page);
  }
  // Under the pointer, or pressed (released after the read: `release`).
  if (e.hover || e.press) {
    await page.mouse.move(0, 0);
    await page.hover(e.at);
    if (e.press) await page.mouse.down();
    await frames(page);
  }
  // The pointer moved off and back (twice at most): a hover the browser coalesced shows nothing.
  for (let i = 0; e.tip && i < 2; i++) {
    await page.mouse.move(0, 0);
    await frames(page);
    await page.hover('.dzg-layer .dzg-row[aria-rowindex="4"] .dzg-cell[data-col=grams]');
    if (await page.waitForFunction(() => !document.querySelector('.dzg-tooltip').hidden, null, { timeout: 3000 }).then(() => true, () => false)) break;
  }
}

/** Released away from the button pressed: no click (a pager button would turn the page). */
const release = async (page) => {
  await page.mouse.move(0, 0);
  await page.mouse.up();
};

const read = (page, { at, pseudo, p }) => page.evaluate(({ at, pseudo, p }) => {
  const el = document.querySelector(at);
  return el ? getComputedStyle(el, pseudo ?? null).getPropertyValue(p) : null;
}, { at, pseudo, p });

/** Relative luminance of a computed colour (`rgb()` or `color(srgb …)`), for the tones' contrast. */
const lum = (c) => {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/) ?? c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  const k = c.startsWith('color(') ? 1 : 255;
  const [r, g, b] = [1, 2, 3].map((i) => { const v = Number(m[i]) / k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/**
 * (11) Tooltips and popovers (docs/behaviors/tooltips-popovers.md; owner 2026-11-13 and Q-T1 B, 2026-11-14), page
 * v1-12-tips.html: every tone readable (4.5:1 measured), each animation preset's transitions (opacity, translate, scale
 * only; the richer `pop` and `rise`), none under reduced motion and a fade only with `reducedMotion: 'fade'`, no layout
 * while it runs (Chrome's layout count), the 12 placements on the screen's or the line's sides with their alignment and
 * the arrow over the anchor, a flip at each edge (and none with `flip: false`), the popover by click, Escape, a press
 * outside, Tab past its end and code, its focus in and back, nested; cleaned HTML that ran nothing; the grid's header
 * button and HTML tooltips with `tooltips()`, a cell's popover; axe with both open.
 */
async function tipsChecks(page, tag, cfg, name) {
  const { css, dark, lang, preflight } = cfg;
  const rtl = lang === 'ar';
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(site.url(`v1-12-tips.html?lang=${lang}&css=${css}${dark ? '&dark=1' : ''}${preflight ? '&preflight=1' : ''}`));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  await frames(page);
  const B = '.dzg-tooltip.dzg-float';
  const settle = () => page.waitForTimeout(450);

  // Tones: text 4.5:1 on its background, the arrow in the background's colour.
  for (const tone of ['info', 'neutral', 'success', 'warning', 'danger']) {
    const t = await page.evaluate(({ tone, B }) => {
      window.tip('c', { tone, animation: 'none' });
      const el = document.querySelector(B);
      const s = getComputedStyle(el);
      return { fg: s.color, bg: s.backgroundColor, arrow: getComputedStyle(el, '::before').backgroundColor, tone: el.dataset.tone };
    }, { tone, B });
    check(`${tag}: tone ${tone}: its text ${ratio(t.fg, t.bg).toFixed(2)}:1 on its background, the arrow its colour`, t.tone === tone && ratio(t.fg, t.bg) >= 4.5 && t.arrow === t.bg, t);
  }

  // Presets: what each transition moves, on opening.
  const PRESETS = { fade: ['opacity'], scale: ['opacity', 'scale'], slide: ['opacity', 'translate'], pop: ['opacity', 'scale'], rise: ['opacity', 'translate'], none: [] };
  // Hidden, drawn hidden (a frame), then shown: the opening runs from its starting style.
  const anims = async (animation, extra = {}) => {
    await page.evaluate(() => window.tips.get('c')?.destroy());
    await settle();
    return page.evaluate(({ animation, extra, B }) => {
    window.tip('c', { animation, ...extra });
    const el = document.querySelector(B);
    return el.getAnimations().map((a) => ({ p: a.transitionProperty, d: a.effect.getTiming().duration })).filter((a) => a.p !== 'display' && a.p !== 'overlay');
  }, { animation, extra, B });
  };
  for (const [preset, want] of Object.entries(PRESETS)) {
    const a = await anims(preset);
    const props = [...new Set(a.map((x) => x.p))].sort();
    check(`${tag}: preset ${preset}: ${want.join(', ') || 'nothing'} moves`, JSON.stringify(props) === JSON.stringify([...want].sort()), a);
    if (preset === 'pop' || preset === 'rise') check(`${tag}: preset ${preset}: the richer, longer opening`, a.every((x) => x.d === (preset === 'pop' ? 260 : 320)), a);
    await settle();
  }
  // Closing: short, then hidden and out of the window's way.
  await anims('slide');
  await settle();
  const closing = await page.evaluate((B) => { window.tips.get('c').hide(); return document.querySelector(B).getAnimations().filter((a) => a.transitionProperty === 'opacity').map((a) => a.effect.getTiming().duration); }, B);
  check(`${tag}: a closing fades in 100 ms`, closing.length === 1 && closing[0] === 100, closing);
  await settle();
  // No layout while it runs (Chrome: the layout count over the animation's frames).
  if (name === 'chrome') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const count = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount').value;
    // Layouts while each preset runs a whole second (its duration set long by its variable), against the same second with
    // the bubble still: at most one more (the moving box's overflow settled once, at its end) — never one per frame.
    const over = async (animation) => {
      await page.evaluate(() => window.tips.get('c')?.destroy());
      await settle();
      await page.evaluate((animation) => {
        for (const v of ['--dzg-tooltip-open-duration', '--dzg-tooltip-pop-duration', '--dzg-tooltip-rise-duration']) document.documentElement.style.setProperty(v, '1000ms');
        window.tip('c', { animation });
      }, animation);
      await frames(page);
      const l0 = await count();
      await page.waitForTimeout(1100);
      const n = (await count()) - l0;
      await page.evaluate(() => document.documentElement.removeAttribute('style'));
      return n;
    };
    const still = await over('none');
    for (const preset of ['fade', 'scale', 'slide', 'pop', 'rise']) {
      const moving = await over(preset);
      check(`${tag}: ${preset}: no layout per frame while it runs a second (${moving} against ${still} still)`, moving <= still + 1, { moving, still });
    }
    await cdp.detach();
    await settle();
  }
  // Reduced motion: nothing; with reducedMotion 'fade', the opacity only.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await anims('pop');
  check(`${tag}: reduced motion: no animation`, still.length === 0, still);
  const faded = await anims('pop', { reducedMotion: 'fade' });
  check(`${tag}: reduced motion with reducedMotion 'fade': a short fade, opacity only`, faded.length === 1 && faded[0].p === 'opacity' && faded[0].d === 120, faded);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await settle();

  // The 12 placements on the centred button, still (animation none): the side on screen, the alignment, the arrow.
  const geo = (id, o) => page.evaluate(({ id, o, B }) => {
    window.tip(id, { animation: 'none', ...o });
    const el = document.querySelector(B);
    const r = (x) => { const b = x.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const arrow = getComputedStyle(el, '::before');
    const a = r(document.getElementById(id));
    const t = r(el);
    // The arrow's middle on screen: its box measured through a probe at its place.
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;inset-inline-start:${arrow.insetInlineStart};inset-block-start:${arrow.insetBlockStart};inset-inline-end:${arrow.insetInlineEnd};inset-block-end:${arrow.insetBlockEnd};inline-size:${arrow.inlineSize};block-size:${arrow.blockSize}`;
    el.append(probe);
    const p = r(probe);
    probe.remove();
    return { side: el.dataset.side, a, t, p, win: { w: innerWidth, h: innerHeight } };
  }, { id, o, B });
  const near = (x, y) => Math.abs(x - y) < 1.5;
  const SIDES = rtl ? { left: 'inline-end', right: 'inline-start', start: 'inline-start', end: 'inline-end' } : { left: 'inline-start', right: 'inline-end', start: 'inline-start', end: 'inline-end' };
  for (const side of ['top', 'bottom', 'left', 'right', 'start', 'end']) for (const al of ['', '-start', '-end']) {
    if ((side === 'start' || side === 'end') && al) continue; // the line's sides: their alignments are the left / right ones'
    const g = await geo('c', { placement: `${side}${al}` });
    // Physical side on screen: start/end through the direction.
    const phys = side === 'start' ? (rtl ? 'right' : 'left') : side === 'end' ? (rtl ? 'left' : 'right') : side;
    const sideOk = { top: g.t.b <= g.a.t, bottom: g.t.t >= g.a.b, left: g.t.r <= g.a.l, right: g.t.l >= g.a.r }[phys];
    const logical = { top: 'block-start', bottom: 'block-end', ...SIDES }[side];
    let alignOk;
    if (phys === 'top' || phys === 'bottom') {
      // -start / -end: the line's start and end (left / right in French, right / left in Arabic).
      const st = rtl ? near(g.t.r, g.a.r) : near(g.t.l, g.a.l);
      const en = rtl ? near(g.t.l, g.a.l) : near(g.t.r, g.a.r);
      alignOk = al === '-start' ? st : al === '-end' ? en : near((g.t.l + g.t.r) / 2, (g.a.l + g.a.r) / 2);
    } else alignOk = al === '-start' ? near(g.t.t, g.a.t) : al === '-end' ? near(g.t.b, g.a.b) : near((g.t.t + g.t.b) / 2, (g.a.t + g.a.b) / 2);
    // The arrow points at the anchor: its middle over the anchor along the other axis.
    const arrowOk = phys === 'top' || phys === 'bottom' ? (g.p.l + g.p.r) / 2 >= g.a.l && (g.p.l + g.p.r) / 2 <= g.a.r : (g.p.t + g.p.b) / 2 >= g.a.t && (g.p.t + g.p.b) / 2 <= g.a.b;
    check(`${tag}: placement ${side}${al}: on the ${phys}, aligned, the arrow at the anchor`, g.side === logical && sideOk && alignOk && arrowOk, g);
  }
  // A flip at each edge, and none with flip: false; kept inside the window.
  const inside = (g) => g.t.l >= -0.5 && g.t.r <= g.win.w + 0.5 && g.t.t >= -0.5 && g.t.b <= g.win.h + 0.5;
  for (const [id, placement, want] of [['top', 'top', 'block-end'], ['bottom', 'bottom', 'block-start'], ['lft', 'left', rtl ? 'inline-start' : 'inline-end'], ['rgt', 'right', rtl ? 'inline-end' : 'inline-start']]) {
    const g = await geo(id, { placement });
    check(`${tag}: at the ${id} edge, ${placement} flips to ${want}, inside the window`, g.side === want && inside(g), g);
    const kept = await geo(id, { placement, flip: false });
    check(`${tag}: at the ${id} edge, flip: false keeps ${placement}`, kept.side !== want, kept);
  }
  await page.evaluate(() => { for (const h of window.tips.values()) h.destroy(); });

  // The app's own animation through the hook (CSS keyframes by the Web Animations API), with an app shape: told open then
  // close, the bubble kept drawn until its closing animation has finished; the shape drawn, no box, no arrow.
  const hooked = await page.evaluate(async (B) => {
    const phases = [];
    window.tip('c', {
      shape: 'M0 0 H100 V80 H60 L50 100 L40 80 H0 Z',
      animate: (el, phase, info) => {
        phases.push(`${phase}:${info.side}:${info.reduced}:${!!info.shape}`);
        const k = [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1' }];
        return el.animate(phase === 'open' ? k : k.reverse(), { duration: 200, easing: 'ease-out' }).finished;
      },
    });
    const el = document.querySelector(B);
    await new Promise((r) => setTimeout(r, 300));
    // The shape's box stretched over the bubble (the path's own box may count its stroke's corners: Firefox).
    const svg = el.querySelector(':scope > svg.dzg-tip-shape').getBoundingClientRect();
    const path = el.querySelector(':scope > svg.dzg-tip-shape > path').getBoundingClientRect();
    const look = { bg: getComputedStyle(el).backgroundColor, arrow: getComputedStyle(el, '::before').display, fill: getComputedStyle(el.querySelector('svg path')).fill, w: svg.width, pw: path.width, h: path.height, box: el.getBoundingClientRect().width };
    window.tips.get('c').hide();
    await new Promise((r) => setTimeout(r, 100));
    const mid = !el.hidden;
    await new Promise((r) => setTimeout(r, 250));
    return { phases, look, mid, end: el.hidden };
  }, B);
  check(`${tag}: the app's keyframes through animate(): told open and close, kept drawn until its closing ends`, hooked.phases.length === 2 && hooked.phases[0].startsWith('open:') && hooked.phases[1].startsWith('close:') && hooked.mid && hooked.end, hooked);
  check(`${tag}: an app shape drawn over the bubble, no box, no arrow`, hooked.look.bg === 'rgba(0, 0, 0, 0)' && hooked.look.arrow === 'none' && hooked.look.fill !== 'none' && Math.abs(hooked.look.w - hooked.look.box) < 2 && hooked.look.h > 10, hooked.look);
  await page.evaluate(() => window.tips.get('c').destroy());

  // Cleaned HTML: the bold kept, no image, nothing ran.
  const h = await page.evaluate((B) => { window.tip('html', { content: { html: '<b>ok</b><img src="x" onerror="window.__hit=1"><script>window.__hit=1</script><a href="javascript:window.__hit=1">x</a>' } }); return document.querySelector(B).innerHTML; }, B);
  await page.waitForTimeout(100);
  check(`${tag}: HTML cleaned: the bold kept, no image, script or link, nothing ran`, h === '<b>ok</b>' && (await page.evaluate(() => window.__hit)) === undefined, h);
  await page.evaluate(() => window.tips.get('html').destroy());

  // The popover: click, the focus in; Escape, the focus back; a press outside; code; Tab past its end; nested.
  await page.evaluate(() => { window.pop('pop', { content: window.form, label: 'Note' }); window.pop('pop2', { content: 'Autre' }); });
  await page.click('#pop');
  const o1 = await page.evaluate(() => ({ dlg: document.querySelector('.dzg-popover')?.getAttribute('role'), exp: document.getElementById('pop').getAttribute('aria-expanded'), ctl: document.getElementById('pop').getAttribute('aria-controls') === document.querySelector('.dzg-popover')?.id, focus: document.activeElement?.className }));
  check(`${tag}: popover by click: a dialog, expanded, controlled, the focus in its field`, o1.dlg === 'dialog' && o1.exp === 'true' && o1.ctl && o1.focus === 'note', o1);
  await page.keyboard.press('Escape');
  const o2 = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-popover:not([hidden])'), exp: document.getElementById('pop').getAttribute('aria-expanded'), focus: document.activeElement?.id }));
  check(`${tag}: Escape closes it, the focus back on its trigger`, !o2.open && o2.exp === 'false' && o2.focus === 'pop', o2);
  await settle();
  await page.click('#pop');
  await page.mouse.click(5, 690);
  check(`${tag}: a press outside closes it`, !(await page.evaluate(() => window.pops.get('pop').isOpen)));
  await page.evaluate(() => window.pops.get('pop').open());
  const byCode = await page.evaluate(() => { const was = window.pops.get('pop').isOpen; window.pops.get('pop').close(); return { was, now: window.pops.get('pop').isOpen, focus: document.activeElement?.id }; });
  check(`${tag}: open() and close() by code, the focus back from inside`, byCode.was && !byCode.now && byCode.focus === 'pop', byCode);
  await settle();
  // From its last control (WebKit's Tab skips buttons: the focus put there), Tab: on to what follows the trigger.
  await page.click('#pop');
  await page.evaluate(() => document.querySelector('.dzg-popover .ok').focus());
  await page.keyboard.press('Tab');
  const tabbed = await page.evaluate(() => ({ open: window.pops.get('pop').isOpen, focus: document.activeElement?.id || document.activeElement?.className }));
  check(`${tag}: Tab past its last control closes it, the focus on what follows its trigger`, !tabbed.open && tabbed.focus === 'pop2', tabbed);
  await page.click('#pop');
  await page.keyboard.press('Shift+Tab');
  const back = await page.evaluate(() => ({ open: window.pops.get('pop').isOpen, focus: document.activeElement?.id }));
  check(`${tag}: Shift+Tab before its first control closes it, the focus on its trigger`, !back.open && back.focus === 'pop', back);
  await settle();
  await page.evaluate(() => window.pops.get('pop').open());
  const nested = await page.evaluate(() => {
    const inner = document.querySelector('.dzg-popover .inner');
    const h = window.popover(inner, { content: 'Encore', group: 'default' });
    h.open();
    const both = window.pops.get('pop').isOpen && h.isOpen;
    window.pops.get('pop2').open();
    const r = { both, after: window.pops.get('pop').isOpen || h.isOpen, other: window.pops.get('pop2').isOpen };
    window.pops.get('pop2').close();
    return r;
  });
  check(`${tag}: a popover nested in another keeps it; another in the group closes both`, nested.both && !nested.after && nested.other, nested);
  await settle();

  // The grid with tooltips(): a header button names itself, a cell's HTML cleaned, a cell's popover about its row.
  const head = await page.evaluate(() => {
    const b = document.querySelector('.dzg-hcell[data-col=seed] .dzg-fbtn');
    b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    const t = document.querySelector('.dzg .dzg-tooltip');
    return { shown: !t.hidden, text: t.textContent, label: b.getAttribute('aria-label') };
  });
  check(`${tag}: in the grid, the filter button's tooltip is its name`, head.shown && head.text === head.label, head);
  const cellHtml = await page.evaluate(() => {
    const c = document.querySelector('.dzg-layer .dzg-row[aria-rowindex="3"] .dzg-cell[data-col=seed]');
    c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    return document.querySelector('.dzg .dzg-tooltip').innerHTML;
  });
  check(`${tag}: in the grid, a cell's HTML tooltip cleaned`, /^<b>[^<]+<\/b>$/.test(cellHtml) && (await page.evaluate(() => window.__hit)) === undefined, cellHtml);
  await page.click('.dzg-layer .dzg-row[aria-rowindex="4"] .act');
  const about = await page.evaluate(() => ({ text: document.querySelector('.dzg-popover .about')?.textContent, seed: window.grid.api.rowAt?.(2)?.seed }));
  check(`${tag}: a cell's action icon opens a popover about its row`, /2$/.test(about.text ?? ''), about);

  // axe with a tooltip and a popover open.
  if (name === 'chrome') {
    await page.evaluate(() => window.tip('c', { animation: 'none' }));
    await settle();
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document.body, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target).join(' ')}`));
    check(`${tag}: tooltips and popovers, axe finds nothing`, v.length === 0, v);
  }
  check(`${tag}: tooltips page: nothing told`, (await page.evaluate(() => window.told.length)) === 0, await page.evaluate(() => window.told));
}

/**
 * (11b) The Angular directives in a real build (packages/angular/browser, `?page=tips`: ngc, the linker, esbuild, as an
 * app ships): a template with its context and a component with its inputs in tooltips, cleaned HTML (Angular's
 * sanitizer, then DzGrid's), a popover holding a template whose `close()` closes it, a component in a popover, and a
 * grid cell's component opening a popover about its row. Once per browser and language.
 */
async function angularTips(name, lang) {
  const tag = `${name} angular ${lang}`;
  const b = await browser(name);
  try {
    const page = await b.newPage();
    await page.setViewportSize({ width: 900, height: 700 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.root(`packages/angular/browser/build/index.html?page=tips${lang === 'ar' ? '&lang=ar' : ''}`));
    await page.waitForFunction(() => window.fxReady === true || window.fxError, null, { timeout: 30000 });
    check(`${tag}: the fixture runs`, !(await page.evaluate(() => window.fxError)), await page.evaluate(() => window.fxError));
    const B = '.dzg-tooltip.dzg-float';
    // Away first (a tooltip the pointer rests on stays: it may cover the next button), past the grace and the fade.
    const hover = async (sel) => { await page.mouse.move(890, 690); await page.waitForTimeout(400); await page.hover(sel); await page.waitForFunction((B) => { const t = document.querySelector(B); return t && !t.hidden; }, B, { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(350); };
    await hover('.fx-t1');
    const t1 = await page.evaluate((B) => { const t = document.querySelector(B); return { text: t.querySelector('.fx-in')?.textContent, tone: t.dataset.tone, anim: t.dataset.animation, op: getComputedStyle(t).opacity }; }, B);
    check(`${tag}: a template in a tooltip, its context drawn, toned, popped in`, t1.text === 'Ann' && t1.tone === 'success' && t1.anim === 'pop' && t1.op === '1', t1);
    await hover('.fx-t2');
    const t2 = await page.evaluate((B) => { const t = document.querySelector(B); const a = document.querySelector('.fx-t2').getBoundingClientRect(); const r = t.getBoundingClientRect(); return { text: t.querySelector('.fx-card')?.textContent, side: t.dataset.side, right: r.left >= a.right, made: window.fx.tipStats.made }; }, B);
    check(`${tag}: a component in a tooltip with its inputs, on the right`, t2.text === 'Ann · 3' && t2.right, t2);
    await hover('.fx-t3');
    await page.waitForTimeout(400);
    const t3 = await page.evaluate((B) => ({ html: document.querySelector(B).innerHTML, gone: window.fx.tipStats.gone, hit: window.__hit }), B);
    check(`${tag}: HTML through Angular's sanitizer and DzGrid's: the bold only, nothing ran; the component destroyed`, t3.html === '<b>Bold</b>' && t3.hit === undefined && t3.gone >= 1, t3);
    await page.mouse.move(890, 690);
    await page.click('.fx-p1');
    const p1 = await page.evaluate(() => ({ dlg: document.querySelector('.dzg-popover')?.getAttribute('aria-label'), focus: document.activeElement?.className }));
    check(`${tag}: a popover holding a template, named, the focus in its field`, p1.dlg === 'Note' && p1.focus === 'fx-note', p1);
    await page.click('.dzg-popover .fx-done');
    const p2 = await page.evaluate(() => ({ open: !!document.querySelector('.dzg-popover:not([data-closing])'), focus: document.activeElement?.className, closed: window.fx.tipStats.closed }));
    check(`${tag}: its template's close() closes it, the focus back on the trigger`, !p2.open && p2.focus === 'fx-p1' && p2.closed.at(-1) === 'code', p2);
    await page.waitForTimeout(300);
    await page.click('.fx-p2');
    check(`${tag}: a component in a popover`, (await page.evaluate(() => document.querySelector('.dzg-popover .fx-card')?.textContent)) === 'Bob · 7');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('.dzg-layer .dzg-row[aria-rowindex="4"] .fx-act');
    check(`${tag}: a grid cell's component opens a popover about its row`, (await page.evaluate(() => document.querySelector('.dzg-popover .fx-about')?.textContent)) === 'Seed 2');
    await page.evaluate(() => { const v = document.querySelector('.dzg-viewport'); v.scrollTop = 3000; });
    await page.waitForTimeout(300);
    check(`${tag}: scrolled until its row is recycled, that popover closes`, !(await page.evaluate(() => document.querySelector('.dzg-popover:not([data-closing])'))));
    check(`${tag}: no page error`, errors.length === 0, errors);
  } finally {
    await b.close().catch(() => {});
  }
}

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
    if (process.argv.includes('--tips')) {
      await tipsChecks(page, tag, cfg, name);
      check(`${tag}: tooltips page: no page error`, errors.length === 0, errors);
      return;
    }
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
      await release(page);
    }
    const baseInput = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.dzg-finput')); return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset }; });
    check(`${tag}: the filter box edged by default (a line a reset cannot erase)`, baseInput.style === 'solid' && baseInput.width === '1px' && baseInput.offset === '-1px', baseInput);
    await open('');
    for (const [i, e] of VARS.entries()) {
      await stage(page, e);
      const now = await read(page, dflt(e));
      await release(page);
      // The arrow is new (owner 5, decided): its default is checked, not compared with 1.11 (which had none).
      if (e.was === 'tooltip') check(`${tag}: ${e.v} unset: the tooltip's background`, now === (await page.evaluate(() => getComputedStyle(document.querySelector('.dzg-tooltip')).backgroundColor)), now);
      else if (e.was) check(`${tag}: ${e.v} unset: ${e.was}`, now === e.was, now);
      else check(`${tag}: ${e.v} unset leaves today's look`, now === before[i], { now, before: before[i] });
      // Focused from the keyboard indeed: the browser's own ring shows (none would make the comparison empty).
      if (e.focus) {
        await stage(page, e);
        const ring = await read(page, { at: e.at, p: 'outline-style' });
        check(`${tag}: ${e.at} focused from the keyboard shows the browser's ring by default`, ring !== 'none', ring);
      }
      await page.evaluate(({ v, value, more }) => { const r = document.querySelector('.dzg'); for (const [k, x] of Object.entries(more ?? {})) r.style.setProperty(k, x); r.style.setProperty(v, value); }, { v: e.v, value: e.value, more: e.with });
      await frames(page);
      await stage(page, e);
      const set = await read(page, e);
      await release(page);
      const want = e.want ?? e.value;
      // `native`: WebKit draws its select natively (its corners, padding, height its own — the base's do not reach it today
      // either); checked in the two others.
      if (!(e.reset && css === 'layered' && preflight) && !(e.native && name === 'webkit')) check(`${tag}: ${e.v} set changes the look${e.want?.length === 2 ? ' (not this one)' : ''}`, typeof want == 'function' ? want(set, now) : set === want, { set, want: String(want), at: e.at });
      await page.evaluate(({ v, more }) => { const r = document.querySelector('.dzg'); for (const k of [v, ...Object.keys(more ?? {})]) r.style.removeProperty(k); }, { v: e.v, more: e.with });
      await page.mouse.move(0, 0);
    }
    await page.evaluate(() => { document.querySelectorAll('[data-made]').forEach((x) => x.remove()); document.querySelectorAll('[data-shown]').forEach((x) => { x.hidden = true; delete x.dataset.shown; }); document.querySelector('.dzg-viewport').scrollTop = 0; });
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
    // (3b) An app's part that follows `--dzg-row-state-fg` (37) takes the row's colour without the switch; with
    // `data-dzg-row-fg="force"` on the host, everything in a hovered or selected row does, the coloured mark included.
    const parts = async (attr) => {
      await page.evaluate((attr) => {
        const host = document.querySelector('#host');
        if (attr) host.setAttribute('data-dzg-row-fg', 'force');
        else host.removeAttribute('data-dzg-row-fg');
        const c = document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"] .dzg-cell[data-col=note]');
        if (!c.querySelector('.app-led')) {
          const led = document.createElement('span');
          led.className = 'app-led';
          led.textContent = '●';
          const follow = document.createElement('span');
          follow.className = 'app-follow';
          follow.textContent = '◆';
          c.append(led, follow);
        }
      }, attr);
      await frames(page);
      return page.evaluate(() => {
        const c = document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"] .dzg-cell[data-col=note]');
        return { led: getComputedStyle(c.querySelector('.app-led')).color, follow: getComputedStyle(c.querySelector('.app-follow')).color };
      });
    };
    const selNoForce = await parts(false);
    check(`${tag}: selected, no switch: the app's mark keeps its colour, a part reading --dzg-row-state-fg follows`, selNoForce.led === 'rgb(0, 128, 0)' && selNoForce.follow === RED, selNoForce);
    const selForce = await parts(true);
    check(`${tag}: selected, data-dzg-row-fg=force: the app's coloured mark takes the row's colour`, selForce.led === RED && selForce.follow === RED, selForce);
    await page.evaluate(() => document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"]').removeAttribute('aria-selected'));
    const restForce = await parts(true);
    check(`${tag}: at rest, even with the switch, the app's colours stay`, restForce.led === 'rgb(0, 128, 0)' && restForce.follow === 'rgb(0, 128, 0)', restForce);
    await page.hover('.dzg-layer .dzg-row[aria-rowindex="6"] .dzg-cell[data-col=note]');
    await frames(page);
    const hovForce = await parts(true);
    check(`${tag}: hovered, data-dzg-row-fg=force: the app's coloured mark takes the hover colour`, hovForce.led === RED && hovForce.follow === RED, hovForce);
    await page.mouse.move(0, 0);
    await page.evaluate(() => { document.querySelector('#host').removeAttribute('data-dzg-row-fg'); document.querySelectorAll('.dzg-layer .dzg-row[aria-rowindex="6"] :is(.app-led, .app-follow)').forEach((x) => x.remove()); });
    await page.evaluate(() => { document.querySelector('.dzg-layer .dzg-row[aria-rowindex="6"]').setAttribute('aria-selected', 'true'); });
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
      // The pointer moved off and back (twice at most): a hover the browser coalesced shows nothing.
      for (let i = 0; i < 2; i++) {
        await page.mouse.move(0, 0);
        await page.waitForFunction(() => document.querySelector('.dzg-tooltip').hidden, null, { timeout: 3000 }).catch(() => {});
        await frames(page);
        await page.hover(`.dzg-layer .dzg-row[aria-rowindex="${row}"] .dzg-cell[data-col=grams]`);
        if (await page.waitForFunction(() => !document.querySelector('.dzg-tooltip').hidden, null, { timeout: 3000 }).then(() => true, () => i === 1 && Promise.reject(new Error('no tooltip')))) break;
      }
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
    // At the window's edges the arrow counts too (review 1.12.0): room below for the box and its 4 px gap but not the
    // arrow — it goes above, inside the window; then no room below and just room above, the arrow counted — above, inside.
    const h = below.box[3] - below.box[2];
    await page.setViewportSize({ width: 900, height: Math.round(below.cell[3] + 4 + h + 3) });
    const edgeLow = await tipAt(3);
    const winLow = await page.evaluate(() => innerHeight);
    check(`${tag}: near the window's bottom, the tooltip and its arrow inside the window`, edgeLow.box[3] <= winLow + 0.5 && edgeLow.box[2] >= -0.5, { ...edgeLow, winLow });
    await page.setViewportSize({ width: 900, height: Math.round(2 * h + 44) });
    await page.evaluate(({ want }) => { const c = document.querySelector('.dzg-layer .dzg-row[aria-rowindex="3"] .dzg-cell[data-col=grams]').getBoundingClientRect(); scrollBy(0, c.top - want); }, { want: 4 + 6 + h + 1 });
    const edgeHigh = await tipAt(3);
    const winHigh = await page.evaluate(() => innerHeight);
    check(`${tag}: near the window's top, the tooltip and its arrow inside the window`, edgeHigh.box[2] >= -0.5 && edgeHigh.box[3] <= winHigh + 0.5, { ...edgeHigh, winHigh });
    await page.evaluate(() => scrollTo(0, 0));
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

    // (9) A header with its title, its sort mark and the filter button (owner 2026-11-13: under Tailwind 3's preflight the
    // three went to the column's end — the reset's `button { margin: 0 }` took the buttons' auto margin). A start-aligned
    // column: the title at the cell's start, the sort mark right after it; an end-aligned one: the title at its label's
    // end, the mark after it; in both the buttons at the end, before the grip's gap. Mirrored in Arabic.
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'seed', dir: 'asc' }, { column: 'grams', dir: 'desc' }, { column: 'note', dir: 'asc' }] }, 'host'));
    await frames(page);
    const hdr = await page.evaluate((rtl) => {
      const out = {};
      for (const col of ['seed', 'grams', 'note']) {
        const c = document.querySelector(`.dzg-hrow .dzg-hcell[data-col=${col}]`);
        const r = c.getBoundingClientRect();
        const s = (x) => (rtl ? r.right - x.right : x.left - r.left);
        const e = (x) => (rtl ? r.right - x.left : x.right - r.left);
        const label = c.querySelector(':scope > .dzg-hlabel');
        const range = document.createRange();
        range.selectNodeContents(label);
        const text = range.getBoundingClientRect();
        const cs = getComputedStyle(c);
        const btns = [...c.querySelectorAll(':scope > button')].map((b) => b.getBoundingClientRect());
        const pad = (x) => Math.round(parseFloat(x) * 10) / 10;
        out[col] = { width: r.width, padStart: pad(cs.paddingInlineStart), padEnd: pad(cs.paddingInlineEnd), after: parseFloat(getComputedStyle(c, '::after').width) || 0, gap: parseFloat(cs.columnGap) || 0, textStart: s(text), textEnd: e(text), labelEnd: e(label.getBoundingClientRect()), sortStart: s(c.querySelector(':scope > .dzg-sort').getBoundingClientRect()), fbtnStart: s(c.querySelector(':scope > .dzg-fbtn').getBoundingClientRect()), lastEnd: Math.max(...btns.map(e)), align: c.dataset.align ?? null };
      }
      return out;
    }, rtl);
    const near = (a, b) => Math.abs(a - b) < 1.5;
    // The last button, then the gap, then the grip's room (the cell's `::after`), then the padding.
    const atEnd = (h) => near(h.lastEnd, h.width - h.padEnd - h.after - h.gap);
    const sd = hdr.seed;
    check(`${tag}: a start-aligned header with a filter button: the title at the start, the sort mark after it, the buttons at the end`, sd.align === null && near(sd.textStart, sd.padStart) && sd.sortStart >= sd.textEnd - 0.5 && sd.sortStart - sd.textEnd < 10 && sd.fbtnStart > sd.sortStart + 8 && atEnd(sd), sd);
    // Without the column menu: the filters' layout alone places the filter button, with either copy of the sheets.
    const nt = hdr.note;
    check(`${tag}: a start-aligned header with a filter button and no menu: the title at the start, the buttons at the end`, nt.align === null && near(nt.textStart, nt.padStart) && nt.sortStart >= nt.textEnd - 0.5 && nt.sortStart - nt.textEnd < 10 && nt.fbtnStart > nt.sortStart + 8 && atEnd(nt), nt);
    const gr = hdr.grams;
    check(`${tag}: an end-aligned header with a filter button: the title at its label's end, the sort mark after it, the buttons at the end`, gr.align === 'end' && near(gr.textEnd, gr.labelEnd) && gr.textStart > gr.padStart + 8 && gr.sortStart >= gr.labelEnd - 0.5 && gr.sortStart - gr.labelEnd < 10 && atEnd(gr), gr);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-header.png`, clip: { x: 0, y: 0, width: 900, height: 160 } });
    await page.evaluate(() => window.grid.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'jan', dir: 'asc' }] }, 'host'));
    await frames(page);

    // (2) Without icons: the default marks.
    const marks =() => page.evaluate(() => {
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

    // (10) The set filter's list as wide as its longest value (filter-set.md « The list's width »): no label cut, wider than
    // the 14rem minimum, the popup inside the window; a search does not move it; past --dzg-set-list-max-width the long
    // value is cut and keeps its full text as its title.
    const openSet = async () => {
      await page.click('.dzg-hcell[data-col=note] > .dzg-fbtn');
      await page.waitForFunction(() => document.querySelectorAll('.dzg-popup .dzg-fopt').length >= 4, null, { timeout: 10000 });
      await frames(page);
    };
    const setLook = () => page.evaluate(() => {
      const w = document.querySelector('.dzg-popup .dzg-flistw').getBoundingClientRect();
      const p = document.querySelector('.dzg-popup').getBoundingClientRect();
      const names = [...document.querySelectorAll('.dzg-popup .dzg-fname')].map((n) => ({ text: n.textContent, cut: n.scrollWidth > n.clientWidth + 1, title: n.title }));
      return { w: w.width, rem: parseFloat(getComputedStyle(document.documentElement).fontSize), box: [p.left, p.right], win: document.documentElement.clientWidth, names };
    });
    await openSet();
    const sw = await setLook();
    const long = await page.evaluate(() => window.notes[3]);
    check(`${tag}: the set list as wide as its longest value: none cut, wider than 14rem, inside the window`, sw.names.length >= 4 && sw.names.every((n) => !n.cut) && sw.w > 14 * sw.rem + 8 && sw.w < 32 * sw.rem && sw.box[0] >= 0 && sw.box[1] <= sw.win + 0.5, sw);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-set-list.png` });
    await page.fill('.dzg-popup .dzg-fsearch', (await page.evaluate(() => window.notes[1])).slice(0, 2));
    await page.waitForFunction(() => document.querySelectorAll('.dzg-popup .dzg-fopt').length < 4, null, { timeout: 5000 });
    await frames(page);
    const narrowed = await setLook();
    check(`${tag}: a search narrowing the set list does not move its width`, Math.abs(narrowed.w - sw.w) < 0.5 && narrowed.names.length < 4, { narrowed, w: sw.w });
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('.dzg').style.setProperty('--dzg-set-list-max-width', '15rem'));
    await openSet();
    const capped = await setLook();
    const cut = capped.names.find((n) => n.text === long);
    check(`${tag}: past --dzg-set-list-max-width the long value is cut, its full text its title`, Math.abs(capped.w - 15 * capped.rem) < 0.5 && cut?.cut === true && cut.title === long && capped.names.filter((n) => n.text !== long).every((n) => !n.cut), capped);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('.dzg').style.removeProperty('--dzg-set-list-max-width'));
    await frames(page);

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
    // (2b) The unsorted mark's own colour (35): the mark's colour by default; `--dzg-sort-none-fg` changes it, not the sorted one's.
    const noneFg = () => page.evaluate(() => {
      const n = document.querySelector('.dzg-hcell[data-col=seed] > .dzg-sort[data-dir=none]');
      const a = document.querySelector('.dzg-hcell[data-col=jan] > .dzg-sort[data-dir=asc]');
      return { none: getComputedStyle(n, '::before').backgroundColor, noneColor: getComputedStyle(n).color, asc: getComputedStyle(a, '::before').backgroundColor };
    });
    const nf0 = await noneFg();
    await page.evaluate((RED) => document.querySelector('.dzg').style.setProperty('--dzg-sort-none-fg', RED), RED);
    const nf1 = await noneFg();
    await page.evaluate(() => document.querySelector('.dzg').style.removeProperty('--dzg-sort-none-fg'));
    check(`${tag}: the unsorted mark in the mark's colour by default, --dzg-sort-none-fg recolours it alone`, nf0.none === nf0.noneColor && nf1.none === RED && nf1.asc === nf0.asc && nf0.asc !== RED, { nf0, nf1 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-12-${name}-${css}-${lang}${dark ? '-dark' : ''}${preflight ? '-pf' : ''}-icons.png`, clip: { x: 0, y: 0, width: 900, height: 200 } });
    if (name === 'chrome') {
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('#host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length}`));
      check(`${tag}: with icons, axe finds nothing`, v.length === 0, v);
    }
    check(`${tag}: no page error, nothing told`, errors.length === 0 && (await page.evaluate(() => window.told.length)) === 0, { errors, told: await page.evaluate(() => window.told) });
    await tipsChecks(page, tag, cfg, name);
    check(`${tag}: tooltips page: no page error`, errors.length === 0, errors);
    await page.close();
  } finally {
    await b.close().catch(() => {});
  }
  console.log(`done ${tag}: ${results.filter(Boolean).length} / ${results.length} so far`);
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
try {
  // The Angular fixture, built once (needs `npm run build`).
  const { buildFixture } = await import('../packages/angular/browser/build.mjs');
  await buildFixture();
  for (const name of ['chrome', 'firefox', 'webkit']) {
    if (only && only !== name) continue;
    for (const lang of ['fr', 'ar']) if (!process.argv.includes('--first') || lang === 'fr') await angularTips(name, lang);
    for (const css of ['layered', 'unlayered']) for (const dark of [false, true]) for (const lang of ['fr', 'ar']) for (const preflight of [false, true]) {
      // `--first`: one run per browser (layered, light, French), while working.
      if (process.argv.includes('--first') && (css !== 'layered' || dark || lang !== 'fr' || preflight)) continue;
      // `--match=preflight`: only the runs whose tag holds it (while working).
      const match = process.argv.find((a) => a.startsWith('--match='))?.slice(8);
      if (match && !`${css}${dark ? ' dark' : ''} ${lang}${preflight ? ' preflight' : ''}`.includes(match)) continue;
      await run(name, { css, dark, lang, preflight });
    }
  }
} finally {
  await site.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} / ${results.length}`);
process.exit(failed ? 1 : 0);
