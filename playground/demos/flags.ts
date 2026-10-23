// Flags for the HR demo (demos-plan.md §3): our own simple drawings, inline SVG, 3:2, never mirrored in
// right-to-left. Decorative (`aria-hidden`): the country's name is the cell's text. No emoji (regional
// indicators show two letters on Windows), no image, no network. Colours are the flags' own, fixed.

export const COUNTRIES = ['DZ', 'FR', 'MA', 'TN', 'SN', 'ES', 'DE', 'CA'] as const;
export type Country = (typeof COUNTRIES)[number];

const star = (cx: number, cy: number, r: number): string => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.4 : r;
    p.push(`${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`);
  }
  return p.join(' ');
};

const BODY: Readonly<Record<Country, string>> = {
  DZ: `<rect width="15" height="20" fill="#006233"/><rect x="15" width="15" height="20" fill="#fff"/><path d="M10,10 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 M11.9,10 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0" fill="#d21034" fill-rule="evenodd"/><polygon points="${star(17.1, 10, 2)}" fill="#d21034"/>`,
  FR: `<rect width="10" height="20" fill="#002395"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ed2939"/>`,
  MA: `<rect width="30" height="20" fill="#c1272d"/><polygon points="${star(15, 10.4, 5)}" fill="none" stroke="#006233" stroke-width="1"/>`,
  TN: `<rect width="30" height="20" fill="#e70013"/><circle cx="15" cy="10" r="5.5" fill="#fff"/><circle cx="15.4" cy="10" r="3.8" fill="#e70013"/><circle cx="16.4" cy="10" r="3.1" fill="#fff"/><polygon points="${star(16.6, 10, 2.1)}" fill="#e70013"/>`,
  SN: `<rect width="10" height="20" fill="#00853f"/><rect x="10" width="10" height="20" fill="#fdef42"/><rect x="20" width="10" height="20" fill="#e31b23"/><polygon points="${star(15, 10.3, 3)}" fill="#00853f"/>`,
  ES: `<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>`,
  DE: `<rect width="30" height="7" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/>`,
  CA: `<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d80621"/><rect x="22.5" width="7.5" height="20" fill="#d80621"/><polygon points="15,4 16.2,7 18.2,6.2 17.4,10 19.6,9.2 19,11.2 16,12.6 16.3,15 13.7,15 14,12.6 11,11.2 10.4,9.2 12.6,10 11.8,6.2 13.8,7" fill="#d80621"/>`,
};

/** A flag's SVG, 21 × 14 px, with a thin frame (white flags stay visible on a white row). */
export function flagSvg(doc: Document, c: Country): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 30 20');
  svg.setAttribute('width', '21');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'demo-flag');
  svg.dataset['country'] = c;
  svg.innerHTML = `${BODY[c]}<rect width="30" height="20" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/>`;
  return svg;
}
