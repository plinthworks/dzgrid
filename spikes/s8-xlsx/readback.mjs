/**
 * Reads our own XLSX back, for checking only: walks the central directory,
 * inflates with node's zlib, pulls cell values out of sheet1.xml with regular
 * expressions. Knows only what writeXlsx writes; not a general reader.
 */
import { inflateRawSync, crc32 as zcrc } from 'node:zlib';

export function unzipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lnl = dv.getUint16(off + 26, true);
    const lex = dv.getUint16(off + 28, true);
    const body = buf.subarray(off + 30 + lnl + lex, off + 30 + lnl + lex + csize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    out[name] = { method, data, crcOk: (zcrc(data) >>> 0) === crc };
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

const unx = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** Matrix of raw values: strings for t="s"/inlineStr, numbers for <v>, booleans for t="b". */
export function readSheet(entries) {
  const sst = [];
  const s = entries['xl/sharedStrings.xml']?.data.toString('utf8');
  if (s) for (const m of s.matchAll(/<si><t(?: xml:space="preserve")?>([\s\S]*?)<\/t><\/si>/g)) sst.push(unx(m[1]));
  const xml = entries['xl/worksheets/sheet1.xml'].data.toString('utf8');
  const rows = [];
  for (const rm of xml.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g)) {
    const r = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      let col = 0;
      for (const ch of cm[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
      const at = cm[2];
      let v;
      if (/t="s"/.test(at)) v = sst[Number(/<v>(\d+)<\/v>/.exec(cm[3])[1])];
      else if (/t="inlineStr"/.test(at)) v = unx(/<t(?: xml:space="preserve")?>([\s\S]*?)<\/t>/.exec(cm[3])[1]);
      else if (/t="b"/.test(at)) v = /<v>1<\/v>/.test(cm[3]);
      else v = Number(/<v>([^<]*)<\/v>/.exec(cm[3])[1]);
      r[col - 1] = v;
    }
    rows[Number(rm[1]) - 1] = r;
  }
  return rows;
}
