/**
 * Checks every text and part the theme draws (packages/theme/contrast-pairs.json)
 * against its minimum — 4.5:1 for text, 3:1 for parts — for each palette, in
 * light and in dark.
 *
 *   npm run check:contrast                                   # the shipped palette and showcase themes
 *   npm run check:contrast -- --palette palettes.json        # each palette in a file
 *
 * A palette file: { "palettes": [ { "name": "…", "light": { "accent": "#…", … },
 * "dark": { … } } ] } — keys are the --tz-* names without the prefix; a key left
 * out keeps the theme's value. Exits 1 when any pair falls short.
 *
 * Colours are resolved the way the browser would for these rules: var() with
 * fallbacks, light-dark() by scheme, color-mix(in srgb, a p%, b), alpha
 * composited on the surface; hex, rgb() and oklch() read.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

// A number has at least one digit (« . » alone is not one: review of part 1, R6).
const N = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
const RGB = new RegExp(String.raw`^rgba?\(\s*(${N})[\s,]+(${N})[\s,]+(${N})(?:[\s,/]+(${N}%?))?\s*\)$`);
// Hue in degrees only (a bare number or deg); turn, rad and grad are refused, not misread.
const OKLCH = new RegExp(String.raw`^oklch\(\s*(${N}%?|none)\s+(${N}%?|none)\s+(${N}(?:deg)?|none)\s*(?:\/\s*(${N}%?)\s*)?\)$`);

/** [r, g, b, a] from #rgb, #rrggbb, #rrggbbaa, rgb()/rgba(), oklch() or a few names. */
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
  m = RGB.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  m = OKLCH.exec(s);
  if (m) {
    const num = (x, scale) => (x === 'none' ? 0 : x.endsWith('%') ? (parseFloat(x) / 100) * scale : parseFloat(x));
    const a = m[4] === undefined ? 1 : num(m[4], 1);
    return [...oklchToRgb(num(m[1], 1), num(m[2], 0.4), num(m[3], 1)), a];
  }
  throw new Error(`cannot read colour "${text}"`);
}

/**
 * oklch() to sRGB 0..255, clipped (CSS Color 4, §9 « OKLab and OKLCH », its published matrices):
 * Tailwind 4 writes its default colours this way (showcase themes, step 2).
 */
function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const gamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return lin.map((x) => Math.min(1, Math.max(0, gamma(x))) * 255);
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

/**
 * A showcase theme's colours (`packages/theme/<name>.css`, showcase themes steps 3–4): its block on
 * `:root, [data-dzg-skin="<name>"]`, the --tz-* ones as a palette `{ name, light, dark }` whose values
 * stay light-dark() pairs (resolved per scheme).
 */
export function skinFromCss(css) {
  const block = /\[data-dzg-skin="?([a-z-]+)"?\]\s*\{([^}]*)\}/.exec(css);
  if (!block) return null;
  const vars = {};
  for (const m of block[2].matchAll(/--tz-([a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return { name: block[1], light: vars, dark: vars };
}

/** Every pair under `vars` in `scheme`: the ratios and the failures. */
export function check(vars, spec, scheme) {
  const all = { ...spec.derived, ...vars };
  const results = spec.pairs.map((p) => {
    const bg = resolveColor(`var(${p.bg})`, all, scheme);
    const fg = resolveColor(`var(${p.fg})`, all, scheme);
    return { ...p, ratio: contrast(fg, bg) };
  });
  // A ratio that is not a finite number (a colour read wrongly) is a failure, never a pass (R6).
  return { results, failures: results.filter((r) => !Number.isFinite(r.ratio) || r.ratio + 1e-9 < r.min) };
}

function main(argv) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const css = readFileSync(`${root}packages/theme/dzgrid.css`, 'utf8');
  const spec = JSON.parse(readFileSync(`${root}packages/theme/contrast-pairs.json`, 'utf8'));
  const base = paletteFromCss(css);
  const at = argv.indexOf('--palette');
  // By default: the base palette and each showcase theme as shipped, read from its own CSS.
  const skins = ['midnight', 'clinic'].filter((n) => existsSync(`${root}packages/theme/${n}.css`)).map((n) => skinFromCss(readFileSync(`${root}packages/theme/${n}.css`, 'utf8')));
  const palettes = at === -1 ? [{ name: 'tzslot default', light: {}, dark: {} }, ...skins] : JSON.parse(readFileSync(argv[at + 1], 'utf8')).palettes;
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

// Compared as real paths: run through a symbolic link (macOS's /tmp, /var), it must still run (it used to
// exit 0 silently: found by the planted-theme test, review of part 1).
const real = (f) => { try { return realpathSync(f); } catch { return f; } };
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) main(process.argv.slice(2));
