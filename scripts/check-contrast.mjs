/**
 * Checks every text and part the theme draws (packages/theme/contrast-pairs.json)
 * against its minimum — 4.5:1 for text, 3:1 for parts — for each palette, in
 * light and in dark.
 *
 *   npm run check:contrast                                   # the shipped palette
 *   npm run check:contrast -- --palette palettes.json        # each palette in a file
 *
 * A palette file: { "palettes": [ { "name": "…", "light": { "accent": "#…", … },
 * "dark": { … } } ] } — keys are the --tz-* names without the prefix; a key left
 * out keeps the theme's value. Exits 1 when any pair falls short.
 *
 * Colours are resolved the way the browser would for these rules: var() with
 * fallbacks, light-dark() by scheme, color-mix(in srgb, a p%, b), alpha
 * composited on the surface.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

/** [r, g, b, a] from #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() or a few names. */
export function parseColor(text) {
  const s = text.trim().toLowerCase();
  if (NAMED[s]) return [...NAMED[s]];
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  throw new Error(`cannot read colour "${text}"`);
}

/** Splits a function's arguments at top-level commas. */
function args(inner) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const fn = (s, name) => {
  const t = s.trim();
  return t.startsWith(`${name}(`) && t.endsWith(')') ? args(t.slice(name.length + 1, -1)) : null;
};

/** A colour expression to [r, g, b, a] under `vars`, in `scheme`. */
export function resolveColor(expr, vars, scheme, depth = 0) {
  if (depth > 20) throw new Error(`var() cycle in "${expr}"`);
  const s = expr.trim();
  let a = fn(s, 'var');
  if (a) {
    const v = vars[a[0]];
    if (v !== undefined) return resolveColor(v, vars, scheme, depth + 1);
    if (a.length > 1) return resolveColor(a.slice(1).join(', '), vars, scheme, depth + 1);
    throw new Error(`${a[0]} is not defined`);
  }
  a = fn(s, 'light-dark');
  if (a) return resolveColor(a[scheme === 'dark' ? 1 : 0], vars, scheme, depth + 1);
  a = fn(s, 'color-mix');
  if (a) {
    if (!/^in srgb$/i.test(a[0])) throw new Error(`only sRGB mixing is read: ${s}`);
    const part = (p) => {
      const m = /^(.*?)\s+([\d.]+)%$/.exec(p);
      return m ? { c: m[1], p: Number(m[2]) / 100 } : { c: p, p: null };
    };
    const x = part(a[1]);
    const y = part(a[2]);
    const px = x.p ?? (y.p === null ? 0.5 : 1 - y.p);
    const cx = resolveColor(x.c, vars, scheme, depth + 1);
    const cy = resolveColor(y.c, vars, scheme, depth + 1);
    // Premultiplied, as CSS mixes colours with alpha.
    const alpha = cx[3] * px + cy[3] * (1 - px);
    const ch = (i) => (alpha === 0 ? 0 : (cx[i] * cx[3] * px + cy[i] * cy[3] * (1 - px)) / alpha);
    return [ch(0), ch(1), ch(2), alpha];
  }
  return parseColor(s);
}

const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** On `under`, what a colour with alpha looks like. */
const over = (c, under) => [0, 1, 2].map((i) => c[i] * c[3] + under[i] * (1 - c[3])).concat(1);

export function contrast(fg, bg) {
  const b = bg[3] < 1 ? over(bg, [255, 255, 255, 1]) : bg;
  const f = fg[3] < 1 ? over(fg, b) : fg;
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The custom properties of the first :root block. */
export function paletteFromCss(css) {
  const block = /:root\s*\{([^}]*)\}/.exec(css);
  const vars = {};
  if (!block) return vars;
  for (const m of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

/** Every pair under `vars` in `scheme`: the ratios and the failures. */
export function check(vars, spec, scheme) {
  const all = { ...spec.derived, ...vars };
  const results = spec.pairs.map((p) => {
    const bg = resolveColor(`var(${p.bg})`, all, scheme);
    const fg = resolveColor(`var(${p.fg})`, all, scheme);
    return { ...p, ratio: contrast(fg, bg) };
  });
  return { results, failures: results.filter((r) => r.ratio + 1e-9 < r.min) };
}

function main(argv) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const css = readFileSync(`${root}packages/theme/dzgrid.css`, 'utf8');
  const spec = JSON.parse(readFileSync(`${root}packages/theme/contrast-pairs.json`, 'utf8'));
  const base = paletteFromCss(css);
  const at = argv.indexOf('--palette');
  const palettes = at === -1 ? [{ name: 'tzslot default', light: {}, dark: {} }] : JSON.parse(readFileSync(argv[at + 1], 'utf8')).palettes;
  let failed = 0;
  let checked = 0;
  for (const pal of palettes) {
    for (const scheme of ['light', 'dark']) {
      const vars = { ...base };
      for (const [k, v] of Object.entries(pal[scheme] ?? {})) vars[`--tz-${k}`] = v;
      const { results, failures } = check(vars, spec, scheme);
      checked += results.length;
      for (const f of failures) {
        failed++;
        console.error(`FAIL ${pal.name} ${scheme}: ${f.what} (${f.fg} on ${f.bg}) ${f.ratio.toFixed(2)}:1 < ${f.min}:1`);
      }
      const worst = results.filter((r) => r.min >= 3).sort((x, y) => x.ratio / x.min - y.ratio / y.min)[0];
      console.log(`${failures.length ? 'FAIL' : 'ok  '} ${pal.name}, ${scheme}: ${results.length} pairs, closest ${worst.what} ${worst.ratio.toFixed(2)}:1 (min ${worst.min})`);
    }
  }
  console.log(`check-contrast: ${checked} pairs, ${failed} below their minimum`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
