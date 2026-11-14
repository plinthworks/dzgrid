/**
 * The application's icons (docs/behaviors/presentation-settings.md 16–19, owner Q7): an SVG cleaned, then drawn as a
 * mask image (`data:` URL) over the mark's `currentColor`, so it takes the mark's colour and size and nothing in it can
 * run. The grid's own marks (characters and clipped shapes) stay the defaults.
 */
const SVG = 'http://www.w3.org/2000/svg';
/** Shapes, groups, definitions, gradients, inner links: nothing that runs, styles or loads. */
const ALLOWED = new Set('svg g path circle ellipse line polyline polygon rect title desc defs symbol use clipPath mask linearGradient radialGradient stop'.split(' '));
const MAX = 20000;

/** Why an icon is refused (a Problem's detail: never the SVG itself). */
export type IconRefusal = 'type' | 'size' | 'parse' | 'root' | 'element' | 'attribute' | 'link';

/** `url(` not followed by `#` (an inner reference), a script scheme, and a CSS escape (which could spell either past this check). */
const outward = (v: string): boolean => /javascript:|\\/i.test(v) || [...v.matchAll(/url\(\s*['"]?\s*([^)'"\s])/gi)].some((m) => m[1] !== '#');

/** An icon's SVG text once cleaned, or why it is refused. A string or an `SVGElement` (copied: never moved, never changed). */
export function cleanIcon(input: string | SVGElement): { ok: string } | { refused: IconRefusal } {
  let text: string;
  if (typeof input == 'string') text = input;
  else if (input && typeof input == 'object' && (input as Node).nodeType === 1 && (input as Element).namespaceURI === SVG) text = new XMLSerializer().serializeToString(input.cloneNode(true));
  else return { refused: 'type' };
  if (text.length > MAX) return { refused: 'size' };
  // A DOCTYPE declares entities (an expansion bomb, an outside one): none in an icon.
  if (/<!DOCTYPE/i.test(text)) return { refused: 'parse' };
  // An SVG written inline in HTML often has no namespace: given its own.
  if (!/^\s*<svg\b[^>]*\sxmlns=/.test(text)) text = text.replace(/^\s*<svg\b/, `<svg xmlns="${SVG}"`);
  let root: Element | null;
  try {
    // An XML document is inert: nothing in it runs, nothing loads (guards: the one other `parseFromString` of the base).
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) return { refused: 'parse' };
    root = doc.documentElement;
  } catch {
    return { refused: 'parse' };
  }
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG) return { refused: 'root' };
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.namespaceURI !== SVG || !ALLOWED.has(el.localName)) return { refused: 'element' };
    for (const a of el.attributes) {
      if (a.localName.toLowerCase().startsWith('on')) return { refused: 'attribute' };
      if ((a.localName === 'href' && !a.value.trim().startsWith('#')) || outward(a.value)) return { refused: 'link' };
    }
  }
  return { ok: new XMLSerializer().serializeToString(root) };
}

/** The icons' names (the setting's keys). The pager's are drawn by pagination()'s own CSS (pagination/styles.ts). */
export const ICONS = { sortAsc: 0, sortDesc: 0, sortNone: 0, filter: 0, filterActive: 0, menu: 0, chevron: 0, submenu: 0, grip: 0, pagerFirst: 0, pagerPrevious: 0, pagerNext: 0, pagerLast: 0 } as const;

const on = (name: string, sel: string) => `[data-dzg-icons~=${name}] ${sel}`;
/** Marks drawn in the text (a `::before` of their own size). */
const INLINE = [on('sort-asc', '.dzg-sort[data-dir=asc]::before'), on('sort-desc', '.dzg-sort[data-dir=desc]::before'), on('sort-none', '.dzg-sort[data-dir=none]::before'), on('chevron', ':is(.dzg-toggle,.dzg-gtoggle)::before'), on('grip', '.dzg-grip::before')];
/** Marks filling a 24 px button (the icon at `--dzg-icon-size`, 1rem by default). */
const BOX = [on('filter', '.dzg-fbtn::before'), on('filter-active', '[data-dzg-filtered]>.dzg-fbtn::before'), on('menu', '.dzg-mbtn::before')];
const SUB = on('submenu', '.dzg-msub');
const VAR = ['sort-asc', 'sort-desc', 'sort-none', 'chevron', 'grip', 'filter', 'filter-active', 'menu', 'submenu'];
const mask = (size: string) => `-webkit-mask:var(--dzg-i) center/${size} no-repeat;mask:var(--dzg-i) center/${size} no-repeat`;

/**
 * What draws them, injected once per document or shadow root by `theming()` (or loaded by an app with
 * `injectStyles: false`). In its own layer after the grid's others (`dzgrid.icons`): it wins over the theme's marks
 * and every showcase theme; the application's own CSS still wins over it.
 */
export const ICONS_CSS =
  '@layer dzgrid.layout,dzgrid.theme,dzgrid.skin,dzgrid.bridge,dzgrid.contrast,dzgrid.icons;@layer dzgrid.icons{' +
  [...INLINE, ...BOX, SUB].map((s, i) => `${s}{--dzg-i:var(--dzg-icon-${VAR[i]})}`).join('') +
  `${INLINE.join(',')}{content:"";display:inline-block;inline-size:1em;block-size:1em;vertical-align:-.125em;background:currentColor;${mask('contain')}}` +
  // The unsorted mark's own colour (presentation-settings.md 35): the sorted one's (the mark's colour) by default. On the
  // drawing, which no theme sheet colours, so the unlayered copies cannot hide it.
  `${INLINE[2]}{background:var(--dzg-sort-none-fg,currentColor)}` +
  `${BOX.join(',')}{content:"";position:absolute;inset:0;clip-path:none;background:currentColor;${mask('var(--dzg-icon-size,1rem)')}}` +
  `${on('filter', '.dzg-fbtn::after')}{content:none}` +
  `${SUB}{clip-path:none;background:currentColor;${mask('contain')}}` +
  // Mirrored in right to left, as the default chevron (the submenu's is, by the menu's own rule).
  `[data-dzg-icons~=chevron]:dir(rtl) :is(.dzg-toggle,.dzg-gtoggle)::before{scale:-1 1}` +
  `@media (forced-colors:active){${[...INLINE, ...BOX, SUB].join(',')}{forced-color-adjust:none;background:CanvasText}}` +
  '}';

/** Once per document or shadow root; a host with a strict CSP passes its nonce, or loads `ICONS_CSS` itself. */
export function injectIconStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-icons]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-icons', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = ICONS_CSS;
  ('head' in target ? target.head : target).append(style);
}
