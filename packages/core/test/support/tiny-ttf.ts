/**
 * A tiny TrueType font built by hand for the PDF tests (docs/behaviors/pdf-export.md 13), from the public table layouts:
 * `head`, `hhea`, `maxp` 1.0, `hmtx`, `cmap` (one format-4 subtable, a segment per character), `loca` (short), `glyf`
 * (each glyph a rectangle of its own size), `post` 3.0. Glyph 0 is .notdef; `chars` maps each character to the next ids.
 */
export function tinyTtf(
  chars: readonly string[],
  advance = (k: number) => 500 + k * 10,
  /** A glyph's own bytes (a composite one, a damaged one) in place of its rectangle (1.17.0 review). */
  glyph?: (g: number) => number[] | undefined,
): { bytes: Uint8Array; glyphOf: Map<string, number> } {
  const glyphOf = new Map<string, number>();
  chars.forEach((c, k) => glyphOf.set(c, k + 1));
  const N = chars.length + 1;
  const u16 = (v: number) => [(v >> 8) & 255, v & 255];
  const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const head = [...u32(0x10000), ...u32(0x10000), ...u32(0), ...u32(0x5f0f3cf5), ...u16(0), ...u16(1000), ...new Array(16).fill(0), ...u16(0), ...u16(-200 & 0xffff), ...u16(1000), ...u16(800), ...u16(0), ...u16(8), ...u16(2), ...u16(0), ...u16(0)];
  const hhea = [...u32(0x10000), ...u16(800), ...u16(-200 & 0xffff), ...u16(0), ...u16(1000), ...new Array(22).fill(0), ...u16(N)];
  const maxp = [...u32(0x10000), ...u16(N), ...u16(4), ...u16(1), ...u16(0), ...u16(0), ...u16(2), ...new Array(18).fill(0)];
  const hmtx = Array.from({ length: N }, (_, g) => [...u16(g ? advance(g) : 600), ...u16(0)]).flat();
  // A rectangle glyph: one contour of four on-curve points (2-byte coordinates, deltas).
  const rect = (w: number, h: number) => [...u16(1), ...u16(0), ...u16(0), ...u16(w), ...u16(h), ...u16(3), ...u16(0), 1, 1, 1, 1, ...u16(0), ...u16(w), ...u16(0), ...u16(-w & 0xffff), ...u16(0), ...u16(0), ...u16(h), ...u16(0)];
  const glyphs = Array.from({ length: N }, (_, g) => glyph?.(g) ?? (chars[g - 1] === ' ' ? [] : rect(100 + g * 7, 600 + g)));
  const glyf: number[] = [];
  const loca: number[] = [];
  for (const g of glyphs) loca.push(...u16(glyf.length / 2)), glyf.push(...g, ...(g.length % 2 ? [0] : []));
  loca.push(...u16(glyf.length / 2));
  const segs = [...glyphOf].map(([c, g]) => [c.codePointAt(0)!, g] as const).sort((a, b) => a[0] - b[0]);
  segs.push([0xffff, 1]);
  const n = segs.length;
  const e = Math.floor(Math.log2(n));
  const f4 = [
    ...u16(4), ...u16(16 + n * 8), ...u16(0), ...u16(n * 2), ...u16(2 << e), ...u16(e), ...u16(n * 2 - (2 << e)),
    ...segs.flatMap(([c]) => u16(c)), ...u16(0), ...segs.flatMap(([c]) => u16(c)), ...segs.flatMap(([c, g]) => u16((g - c) & 0xffff)), ...segs.flatMap(() => u16(0)),
  ];
  const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...f4];
  const post = [...u32(0x30000), ...new Array(28).fill(0)];
  const tables: [string, number[]][] = [['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', loca], ['maxp', maxp], ['post', post]];
  const out: number[] = [...u32(0x10000), ...u16(tables.length), ...u16(128), ...u16(3), ...u16(tables.length * 16 - 128)];
  let off = 12 + tables.length * 16;
  const body: number[] = [];
  for (const [tag, d] of tables) {
    out.push(...[...tag].map((c) => c.charCodeAt(0)), ...u32(0), ...u32(off), ...u32(d.length));
    const padded = [...d, ...new Array((4 - (d.length % 4)) % 4).fill(0)];
    body.push(...padded);
    off += padded.length;
  }
  return { bytes: Uint8Array.from([...out, ...body]), glyphOf };
}
