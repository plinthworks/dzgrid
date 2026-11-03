import { problem, type Problem } from '../problems.js';

/**
 * A ZIP written by hand (PKWARE APPNOTE 6.3, §4.3; the S8 spike's method): one local header before each entry's data,
 * the central directory, the end record. Each header is written once the entry's CRC and sizes are known, in front of
 * its data (no data descriptor); names in UTF-8 (bit 11); the time fixed at 1980-01-01 00:00, so the same entries give
 * the same bytes. No ZIP64: past 4 GB, a problem and no file.
 */

const T = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  T[n] = c;
}

/** CRC-32 (ISO 3309, reflected), as ZIP uses it; `crc` carries a previous result on, so an entry is checked piece by piece. */
export function crc32(b: Uint8Array, crc = 0): number {
  let c = ~crc;
  for (const x of b) c = T[(c ^ x) & 255]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** UTF-8 by hand (the core has no TextEncoder); a lone surrogate becomes U+FFFD, as TextEncoder does. */
export function utf8(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 3);
  let p = 0;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out[p++] = c;
      continue;
    }
    if (c < 0x800) {
      out[p++] = 0xc0 | (c >> 6);
      out[p++] = 0x80 | (c & 63);
      continue;
    }
    if (c >= 0xd800 && c < 0xe000) {
      const d = s.charCodeAt(i + 1);
      if (c < 0xdc00 && d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
        out[p++] = 0xf0 | (c >> 18);
        out[p++] = 0x80 | ((c >> 12) & 63);
        out[p++] = 0x80 | ((c >> 6) & 63);
        out[p++] = 0x80 | (c & 63);
        continue;
      }
      c = 0xfffd;
    }
    out[p++] = 0xe0 | (c >> 12);
    out[p++] = 0x80 | ((c >> 6) & 63);
    out[p++] = 0x80 | (c & 63);
  }
  return out.subarray(0, p);
}

/** One entry, its data already compressed (`method` 8, raw deflate) or not (0); `crc` and `size` of the data before. */
export interface ZipEntry {
  readonly name: string;
  readonly crc: number;
  readonly size: number;
  readonly method: 0 | 8;
  readonly data: readonly Uint8Array[];
}

const MAX = 0xffffffff;

/**
 * The file's bytes, in pieces (for a Blob, or `Buffer.concat`): each entry's header then its data, the central
 * directory, the end record. Past 4 GB or 65 535 entries: no pieces and a problem `xlsx-too-large` (no ZIP64).
 */
export function zipFile(entries: readonly ZipEntry[]): { readonly parts: Uint8Array[]; readonly problems: Problem[] } {
  const parts: Uint8Array[] = [];
  const dir: Uint8Array[] = [];
  let at = 0;
  let size = 0;
  const head = (sig: number, e: ZipEntry, name: Uint8Array, csize: number, central: boolean): Uint8Array => {
    const b = new Uint8Array((central ? 46 : 30) + name.length);
    const v = new DataView(b.buffer);
    const o = central ? 2 : 0;
    v.setUint32(0, sig, true);
    if (central) v.setUint16(4, 20, true);
    v.setUint16(4 + o, 20, true);
    v.setUint16(6 + o, 0x0800, true);
    v.setUint16(8 + o, e.method, true);
    // time 00:00 (0), date 1980-01-01: (0 << 9) | (1 << 5) | 1
    v.setUint16(12 + o, 33, true);
    v.setUint32(14 + o, e.crc, true);
    v.setUint32(18 + o, csize, true);
    v.setUint32(22 + o, e.size, true);
    v.setUint16(26 + o, name.length, true);
    if (central) v.setUint32(42, at, true);
    b.set(name, central ? 46 : 30);
    return b;
  };
  for (const e of entries) {
    const name = utf8(e.name);
    let csize = 0;
    for (const d of e.data) csize += d.length;
    if (csize > MAX || e.size > MAX || at > MAX) return { parts: [], problems: [problem('xlsx-too-large', 'error', 'xlsx')] };
    const h = head(0x04034b50, e, name, csize, false);
    parts.push(h, ...e.data);
    dir.push(head(0x02014b50, e, name, csize, true));
    at += h.length + csize;
  }
  for (const d of dir) size += d.length;
  if (at > MAX || entries.length > 0xffff) return { parts: [], problems: [problem('xlsx-too-large', 'error', 'xlsx')] };
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, at, true);
  return { parts: [...parts, ...dir, end], problems: [] };
}
