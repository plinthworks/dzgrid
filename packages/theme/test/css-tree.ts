// A small reader of the theme's own CSS, for the tests (not a CSS parser for the world): comments
// dropped, statements (`@layer a, b;`) and blocks split at their own depth, strings respected. Each
// style rule comes with the `@layer` and other at-rules around it.

export type Rule = { selector: string; body: string; layers: string[]; at: string[] };
export type Sheet = { statements: string[]; rules: Rule[]; first: string | null };

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The index of the `}` closing the block opened just before `from`. */
function close(css: string, from: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = from; i < css.length; i++) {
    const c = css[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('unclosed block');
}

function walk(css: string, layers: string[], at: string[], out: Sheet, top: boolean): void {
  let i = 0;
  while (i < css.length) {
    const rest = css.slice(i);
    const lead = /^\s*/.exec(rest)![0].length;
    i += lead;
    if (i >= css.length) break;
    let j = i;
    let quote: string | null = null;
    for (; j < css.length; j++) {
      const c = css[j]!;
      if (quote) {
        if (c === '\\') j++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{' || c === ';') break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length) break;
    // `@charset` (Sass writes it for the glyphs) must come first in a file; it is not a rule.
    if (top && out.first === null && !prelude.startsWith('@charset')) out.first = css[j] === ';' ? `${prelude};` : prelude;
    if (css[j] === ';') {
      if (top) out.statements.push(prelude);
      i = j + 1;
      continue;
    }
    const end = close(css, j + 1);
    const body = css.slice(j + 1, end);
    const layer = /^@layer\s+(.+)$/.exec(prelude);
    if (layer) walk(body, [...layers, layer[1]!.trim()], at, out, false);
    else if (prelude.startsWith('@')) walk(body, layers, [...at, prelude], out, false);
    else out.rules.push({ selector: prelude.replace(/\s+/g, ' '), body: body.trim().replace(/\s+/g, ' '), layers, at });
    i = end + 1;
  }
}

export function sheet(css: string): Sheet {
  const out: Sheet = { statements: [], rules: [], first: null };
  walk(strip(css), [], [], out, true);
  return out;
}

/** The order statement every theme file opens with (themes-plan §2, T1). */
export const ORDER = '@layer dzgrid.layout, dzgrid.theme, dzgrid.skin, dzgrid.bridge, dzgrid.contrast';

/** A rule as text, without its layers: what an unlayered copy must hold the same. */
export const flat = (r: Rule) => `${r.at.join(' ')} ${r.selector} { ${r.body} }`;
