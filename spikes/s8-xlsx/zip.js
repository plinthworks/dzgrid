/**
 * A minimal ZIP writer (PKWARE APPNOTE 6.3.x, §4.3): local headers, central
 * directory, end record. No ZIP64 (every size and offset must fit in 32 bits),
 * no data descriptors (sizes are known before a header is written), names in
 * UTF-8 (general purpose bit 11). Entries are stored (method 0) or deflated
 * (method 8, raw RFC 1951 stream from CompressionStream('deflate-raw')).
 *
 * The timestamp is fixed at 1980-01-01 00:00, the DOS epoch: no clock is read,
 * and the same input gives the same bytes.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256 * 8);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  // Slicing-by-8 tables: eight bytes per step.
  for (let n = 0; n < 256; n++) {
    let c = t[n];
    for (let k = 1; k < 8; k++) {
      c = t[c & 0xff] ^ (c >>> 8);
      t[k * 256 + n] = c >>> 0;
    }
  }
  return t;
})();

/** CRC-32 (ISO 3309 / ITU-T V.42 polynomial, reflected), as ZIP uses it. */
export function crc32(bytes) {
  const T = CRC_TABLE;
  let c = 0xffffffff;
  let i = 0;
  const n = bytes.length;
  for (; i + 8 <= n; i += 8) {
    c ^= bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    const hi = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    c = T[1792 + (c & 0xff)] ^ T[1536 + ((c >>> 8) & 0xff)] ^ T[1280 + ((c >>> 16) & 0xff)] ^ T[1024 + (c >>> 24)] ^
      T[768 + (hi & 0xff)] ^ T[512 + ((hi >>> 8) & 0xff)] ^ T[256 + ((hi >>> 16) & 0xff)] ^ T[hi >>> 24];
  }
  for (; i < n; i++) c = T[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const canDeflate = () => {
  try {
    if (typeof CompressionStream !== 'function') return false;
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
};

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

/**
 * entries: [{ name, data: Uint8Array }]; method: 'store' | 'deflate'.
 * Deflate falls back to store per entry when it would not save space.
 */
export async function zip(entries, { method = 'deflate' } = {}) {
  const enc = new TextEncoder();
  const deflate = method === 'deflate' && canDeflate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    let body = e.data;
    let m = 0;
    if (deflate) {
      const d = await deflateRaw(e.data);
      if (d.length < e.data.length) { body = d; m = 8; }
    }
    if (body.length > 0xffffffff || e.data.length > 0xffffffff || offset > 0xffffffff) throw new RangeError('zip64 needed');
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);       // version needed: 2.0 (deflate)
    h.setUint16(6, 0x0800, true);   // bit 11: names are UTF-8
    h.setUint16(8, m, true);
    h.setUint16(10, DOS_TIME, true);
    h.setUint16(12, DOS_DATE, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, e.data.length, true);
    h.setUint16(26, name.length, true);
    h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);       // made by: MS-DOS / FAT, 2.0
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, m, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    // extra, comment, disk start, internal attrs: 0; external attrs: 0
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return { bytes: out, deflated: deflate };
}
