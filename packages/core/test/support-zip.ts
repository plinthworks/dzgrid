// ZIP files made by hand for the import tests (file-import.md 6): entries stored (method 0) or deflated (method 8, by
// node's zlib), CRCs left at 0 (the reader does not check them); `flags` set on the first entry (1: encrypted).
import { deflateRawSync } from 'node:zlib';

export function storedZip(files: Record<string, string>, flags = 0, method: 0 | 8 = 0): Uint8Array {
  const enc = new TextEncoder();
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 255, (v >> 8) & 255);
  const u32 = (a: number[], v: number) => (u16(a, v & 0xffff), u16(a, v >>> 16));
  let first = true;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const raw = enc.encode(text);
    const d = method ? deflateRawSync(raw) : raw;
    const f = first ? flags : 0;
    const at = parts.length;
    u32(parts, 0x04034b50); u16(parts, 20); u16(parts, f); u16(parts, method); u16(parts, 0); u16(parts, 0); u32(parts, 0); u32(parts, d.length); u32(parts, raw.length); u16(parts, n.length); u16(parts, 0);
    parts.push(...n, ...d);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, f); u16(central, method); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, d.length); u32(central, raw.length); u16(central, n.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, at);
    central.push(...n);
    first = false;
  }
  const end: number[] = [];
  const k = Object.keys(files).length;
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, k); u16(end, k); u32(end, central.length); u32(end, parts.length); u16(end, 0);
  return Uint8Array.from([...parts, ...central, ...end]);
}
