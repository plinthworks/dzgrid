/** A ZIP entry: its method (0 stored, 8 deflated), its bytes as they lie in the file, its size once read. */
export interface ZipEntry {
  readonly method: number;
  readonly data: Uint8Array;
  readonly size: number;
}

/**
 * A ZIP file's entries by name, from its central directory (APPNOTE 4.3; file-import.md 6); null when the bytes are not a
 * ZIP, are cut, or hold an encrypted entry. The checksums are not checked: the inflater refuses broken data.
 */
export function zipEntries(b: Uint8Array): Map<string, ZipEntry> | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (i: number): number => v.getUint16(i, true);
  const u32 = (i: number): number => v.getUint32(i, true);
  // The end of the central directory: its signature, from the end, past a comment of 64 KiB at most.
  let e = b.length - 22;
  while (e >= 0 && e >= b.length - 65_557 && u32(e) !== 0x06054b50) e--;
  if (e < 0 || e < b.length - 65_557) return null;
  const out = new Map<string, ZipEntry>();
  try {
    for (let i = 0, p = u32(e + 16); i < u16(e + 10); i++) {
      if (u32(p) !== 0x02014b50 || u16(p + 8) & 1) return null;
      const n = u16(p + 28);
      const at = u32(p + 42);
      const comp = u32(p + 20);
      if (u32(at) !== 0x04034b50) return null;
      const start = at + 30 + u16(at + 26) + u16(at + 28);
      if (start + comp > b.length) return null;
      // The name's bytes as characters: a workbook's part names are ASCII.
      out.set(String.fromCharCode(...b.subarray(p + 46, p + 46 + n)), { method: u16(p + 10), data: b.subarray(start, start + comp), size: u32(p + 24) });
      p += 46 + n + u16(p + 30) + u16(p + 32);
    }
  } catch {
    // Read past the end (a RangeError): cut.
    return null;
  }
  return out;
}
