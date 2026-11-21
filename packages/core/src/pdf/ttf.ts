/**
 * An application's TrueType font (pdf-export.md 13), read from the public TrueType tables: `head` (units per em, box,
 * `loca`'s format), `hhea` and `hmtx` (advances), `maxp` (glyph count), `cmap` (formats 4 and 12: character → glyph),
 * `loca` and `glyf` (outlines, for the subset), `OS/2` (cap height). Only glyf-outlined fonts (`.ttf`); a CFF font
 * (`OTTO`), a collection (`ttcf`) or a damaged file: null. Never throws.
 */
export interface TrueType {
  readonly upm: number;
  readonly box: readonly [number, number, number, number];
  readonly ascent: number;
  readonly descent: number;
  readonly cap: number;
  /** A character's glyph, 0 when the font has none. */
  glyph(cp: number): number;
  /** A glyph's advance in thousandths of the size. */
  advance(g: number): number;
  /** The font file with only `used` glyphs (and the components they need) kept, the others emptied; glyph ids unchanged. */
  subset(used: ReadonlySet<number>): Uint8Array;
}

/** The tables a PDF viewer needs to draw an embedded TrueType font by glyph id (the rest — layout, kerning, signatures — left out). */
const KEEP = new Set(['head', 'hhea', 'hmtx', 'maxp', 'loca', 'glyf', 'cvt ', 'fpgm', 'prep', 'cmap', 'OS/2', 'post', 'name']);

export function readTrueType(src: ArrayBuffer | Uint8Array): TrueType | null {
  try {
    const b = src instanceof Uint8Array ? src : new Uint8Array(src);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u16 = (o: number) => v.getUint16(o);
    const i16 = (o: number) => v.getInt16(o);
    const u32 = (o: number) => v.getUint32(o);
    const tag = u32(0);
    if (tag !== 0x10000 && tag !== 0x74727565) return null;
    const tables = new Map<string, [number, number]>();
    for (let k = 0, n = u16(4); k < n; k++) {
      const r = 12 + k * 16;
      const o = u32(r + 8);
      const len = u32(r + 12);
      if (o + len > b.length) return null;
      tables.set(String.fromCharCode(b[r]!, b[r + 1]!, b[r + 2]!, b[r + 3]!), [o, len]);
    }
    const at = (t: string): number => {
      const x = tables.get(t);
      if (!x) throw 0;
      return x[0];
    };
    const head = at('head');
    const hhea = at('hhea');
    const hmtx = at('hmtx');
    const loca = at('loca');
    const glyf = at('glyf');
    const upm = u16(head + 18);
    const long = i16(head + 50) === 1;
    const glyphs = u16(at('maxp') + 4);
    const metrics = u16(hhea + 34);
    if (!upm || !metrics || !glyphs) return null;
    const os2 = tables.get('OS/2');
    const scale = (x: number) => Math.round((x * 1000) / upm);
    const ascent = scale(i16(hhea + 4));
    const descent = scale(i16(hhea + 6));
    const cap = os2 && u16(os2[0]) >= 2 && os2[1] >= 90 ? scale(i16(os2[0] + 88)) : Math.round(ascent * 0.7);

    // cmap: a Unicode subtable, format 12 (all planes) before format 4 (the first plane).
    const cmap = at('cmap');
    let f4 = -1;
    let f12 = -1;
    for (let k = 0, n = u16(cmap + 2); k < n; k++) {
      const r = cmap + 4 + k * 8;
      const p = u16(r);
      const e = u16(r + 2);
      const o = cmap + u32(r + 4);
      const f = u16(o);
      if ((p === 3 && e === 10) || (p === 0 && e >= 4)) f === 12 && (f12 = o);
      if (p === 3 && e === 1) f === 4 && (f4 = o);
      if (p === 0 && e < 4 && f === 4 && f4 < 0) f4 = o;
    }
    if (f4 < 0 && f12 < 0) return null;
    const look = (cp: number): number => {
      if (f12 >= 0) {
        let lo = 0;
        let hi = u32(f12 + 12) - 1;
        while (lo <= hi) {
          const m = (lo + hi) >> 1;
          const g = f12 + 16 + m * 12;
          if (cp < u32(g)) hi = m - 1;
          else if (cp > u32(g + 4)) lo = m + 1;
          else return u32(g + 8) + cp - u32(g);
        }
        return 0;
      }
      if (cp > 0xffff) return 0;
      const seg = u16(f4 + 6) >> 1;
      const ends = f4 + 14;
      for (let k = 0; k < seg; k++) {
        if (u16(ends + k * 2) < cp) continue;
        const start = u16(ends + seg * 2 + 2 + k * 2);
        if (start > cp) return 0;
        const delta = i16(ends + seg * 4 + 2 + k * 2);
        const ro = ends + seg * 6 + 2 + k * 2;
        const off = u16(ro);
        if (!off) return (cp + delta) & 0xffff;
        const g = u16(ro + off + (cp - start) * 2);
        return g ? (g + delta) & 0xffff : 0;
      }
      return 0;
    };
    const cache = new Map<number, number>();
    const glyph = (cp: number): number => {
      let g = cache.get(cp);
      if (g === undefined) {
        try {
          g = look(cp);
        } catch {
          g = 0;
        }
        cache.set(cp, (g = g < glyphs ? g : 0));
      }
      return g;
    };
    const advance = (g: number): number => scale(u16(hmtx + Math.min(g, metrics - 1) * 4));
    const off = (g: number): number => (long ? u32(loca + g * 4) : u16(loca + g * 2) * 2);

    const subset = (used: ReadonlySet<number>): Uint8Array => {
      // The glyphs kept: .notdef, the used ones, and every component of a composite one.
      const keep = new Set<number>([0]);
      const add = (g: number): void => {
        if (keep.has(g) || g >= glyphs) return;
        keep.add(g);
        const s = glyf + off(g);
        if (off(g + 1) > off(g) && i16(s) < 0) {
          for (let p = s + 10, more = true; more; ) {
            const flags = u16(p);
            add(u16(p + 2));
            p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
            more = !!(flags & 0x20);
          }
        }
      };
      used.forEach(add);
      const pad = (n: number) => (n + 3) & ~3;
      let size = 0;
      for (const g of keep) size += pad(off(g + 1) - off(g));
      const G = new Uint8Array(size);
      const L = new Uint8Array((glyphs + 1) * 4);
      const lv = new DataView(L.buffer);
      let p = 0;
      for (let g = 0; g < glyphs; g++) {
        lv.setUint32(g * 4, p);
        if (keep.has(g)) {
          const s = off(g);
          const e = off(g + 1);
          G.set(b.subarray(glyf + s, glyf + e), p);
          p += pad(e - s);
        }
      }
      lv.setUint32(glyphs * 4, p);
      const out = new Map<string, Uint8Array>();
      for (const [t, [o, len]] of tables) if (KEEP.has(t)) out.set(t, b.slice(o, o + len));
      out.set('glyf', G);
      out.set('loca', L);
      // `head`: long offsets now, the whole-file checksum left to the reader (0).
      const h = out.get('head')!;
      const hv = new DataView(h.buffer);
      hv.setUint32(8, 0);
      hv.setInt16(50, 1);
      return sfnt(out);
    };
    return { upm, box: [scale(i16(head + 36)), scale(i16(head + 38)), scale(i16(head + 40)), scale(i16(head + 42))], ascent, descent, cap, glyph, advance, subset };
  } catch {
    return null;
  }
}

/** A font file from its tables: the directory sorted by tag, each table padded to 4 bytes and summed. */
function sfnt(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let size = 12 + n * 16;
  for (const t of tags) size += (tables.get(t)!.length + 3) & ~3;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  const e = Math.floor(Math.log2(n));
  v.setUint32(0, 0x10000);
  v.setUint16(4, n);
  v.setUint16(6, 16 << e);
  v.setUint16(8, e);
  v.setUint16(10, n * 16 - (16 << e));
  let p = 12 + n * 16;
  tags.forEach((t, k) => {
    const d = tables.get(t)!;
    const r = 12 + k * 16;
    for (let i = 0; i < 4; i++) out[r + i] = t.charCodeAt(i);
    out.set(d, p);
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum = (sum + v.getUint32(p + i)) >>> 0;
    v.setUint32(r + 4, sum);
    v.setUint32(r + 8, p);
    v.setUint32(r + 12, d.length);
    p += (d.length + 3) & ~3;
  });
  return out;
}
