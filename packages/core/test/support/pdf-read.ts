import { inflateSync } from 'node:zlib';

/**
 * A small PDF reader for the tests only (docs/behaviors/pdf-export.md « Tests »), written from ISO 32000-1: it checks the
 * file's frame — the header, every in-use object where the cross-reference table says, `startxref` on the table — and
 * reads back each page's text runs (position, font, size, text) through WinAnsi or the font's ToUnicode map. It reads
 * what our writer writes (one classic xref table, direct objects), not any PDF.
 */
export interface Run {
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly size: number;
  readonly text: string;
  readonly width?: number;
}
export interface ReadPdf {
  readonly version: string;
  readonly objects: Map<number, { dict: string; stream: Uint8Array | null }>;
  readonly pages: { readonly box: number[]; readonly runs: Run[]; readonly ops: string }[];
  readonly trailer: string;
  /** Every problem with the frame: an object not at its offset, a bad startxref, a missing EOF. */
  readonly errors: string[];
}

const HIGH = [0x20ac, 0, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0, 0x17e, 0x178];
const fromWinAnsi = (b: number) => String.fromCodePoint(b >= 128 && b < 160 ? HIGH[b - 128]! : b);

export const joinParts = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let k = 0;
  for (const p of parts) out.set(p, k), (k += p.length);
  return out;
};

/** A literal string's bytes, escapes undone. */
const literal = (s: string): number[] => {
  const out: number[] = [];
  for (let k = 0; k < s.length; k++) {
    const c = s[k]!;
    if (c !== '\\') {
      out.push(c.charCodeAt(0));
      continue;
    }
    const d = s[++k]!;
    if (/[0-7]/.test(d)) {
      let o = d;
      while (o.length < 3 && /[0-7]/.test(s[k + 1] ?? '')) o += s[++k];
      out.push(parseInt(o, 8));
    } else out.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[d] ?? d.charCodeAt(0));
  }
  return out;
};

export function readPdf(bytes: Uint8Array): ReadPdf {
  const s = Buffer.from(bytes).toString('latin1');
  const errors: string[] = [];
  const version = /^%PDF-(\d\.\d)/.exec(s)?.[1] ?? '';
  if (!version) errors.push('no header');
  if (!/%%EOF\n?$/.test(s)) errors.push('no %%EOF at the end');
  const sx = /startxref\n(\d+)\n%%EOF\n?$/.exec(s);
  if (!sx) errors.push('no startxref');
  const at = sx ? +sx[1]! : -1;
  if (s.slice(at, at + 4) !== 'xref') errors.push(`startxref ${at} is not on the xref table`);
  const xm = /^xref\n0 (\d+)\n/.exec(s.slice(at));
  const size = xm ? +xm[1]! : 0;
  const objects = new Map<number, { dict: string; stream: Uint8Array | null }>();
  let p = at + (xm?.[0].length ?? 0);
  for (let id = 0; id < size; id++, p += 20) {
    const e = s.slice(p, p + 20);
    if (!/^\d{10} \d{5} [nf] \n$/.test(e)) errors.push(`xref entry ${id} malformed: ${JSON.stringify(e)}`);
    if (e[17] !== 'n') continue;
    const off = +e.slice(0, 10);
    const head = `${id} 0 obj\n`;
    if (s.slice(off, off + head.length) !== head) {
      errors.push(`object ${id} not at ${off}`);
      continue;
    }
    const body = off + head.length;
    // The dictionary: balanced << >>.
    let depth = 0;
    let k = body;
    do {
      if (s.startsWith('<<', k)) (depth++, (k += 2));
      else if (s.startsWith('>>', k)) (depth--, (k += 2));
      else k++;
    } while (depth > 0 && k < s.length);
    const dict = s.slice(body, k);
    let stream: Uint8Array | null = null;
    if (s.startsWith('\nstream\n', k)) {
      const len = +(/\/Length (\d+)/.exec(dict)?.[1] ?? -1);
      const from = k + 8;
      let raw = bytes.subarray(from, from + len);
      if (s.slice(from + len, from + len + 18) !== '\nendstream\nendobj\n') errors.push(`object ${id}: /Length ${len} does not reach endstream`);
      if (/\/Filter \/FlateDecode/.test(dict)) raw = new Uint8Array(inflateSync(raw));
      stream = raw;
    } else if (!s.startsWith('\nendobj\n', k)) errors.push(`object ${id}: no endobj`);
    objects.set(id, { dict, stream });
  }
  const trailer = /trailer\n(<<[^]*?>>)\nstartxref/.exec(s)?.[1] ?? '';
  if (!new RegExp(`/Size ${size}\\b`).test(trailer)) errors.push('trailer /Size differs from the xref');
  const ref = (d: string, key: string) => +(new RegExp(`/${key} (\\d+) 0 R`).exec(d)?.[1] ?? -1);
  const root = objects.get(ref(trailer, 'Root'));
  const pagesObj = root && objects.get(ref(root.dict, 'Pages'));
  const kids = [...(/\/Kids \[([^\]]*)\]/.exec(pagesObj?.dict ?? '')?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => +m[1]!);
  if (pagesObj && +(/\/Count (\d+)/.exec(pagesObj.dict)?.[1] ?? -1) !== kids.length) errors.push('/Count differs from /Kids');

  // The fonts: by resource name, WinAnsi or a ToUnicode map.
  const fontsOf = (page: string): Map<string, (hexOrBytes: number[], hex: boolean) => string> => {
    const res = objects.get(ref(page, 'Resources'))?.dict ?? '';
    const m = new Map<string, (b: number[], hex: boolean) => string>();
    for (const [, name, id] of res.matchAll(/\/(F\d) (\d+) 0 R/g)) {
      const f = objects.get(+id!)!.dict;
      const tu = objects.get(ref(f, 'ToUnicode'))?.stream;
      if (!tu) {
        m.set(name!, (b) => b.map(fromWinAnsi).join(''));
        continue;
      }
      const map = new Map<number, string>();
      for (const [, g, u] of Buffer.from(tu).toString('latin1').matchAll(/<([0-9a-fA-F]{4})> <([0-9a-fA-F]+)>/g)) {
        const units = u!.match(/.{4}/g)!.map((h) => parseInt(h, 16));
        map.set(parseInt(g!, 16), String.fromCharCode(...units));
      }
      m.set(name!, (b) => {
        let t = '';
        for (let k = 0; k + 1 < b.length; k += 2) t += map.get((b[k]! << 8) | b[k + 1]!) ?? '�';
        return t;
      });
    }
    return m;
  };
  const pages = kids.map((id) => {
    const pg = objects.get(id)?.dict ?? '';
    const box = (/\/MediaBox \[([^\]]*)\]/.exec(pg)?.[1] ?? '').trim().split(/\s+/).map(Number);
    const ops = Buffer.from(objects.get(ref(pg, 'Contents'))?.stream ?? new Uint8Array()).toString('latin1');
    const fonts = fontsOf(pg);
    const runs: Run[] = [];
    let font = '';
    let size = 0;
    let x = 0;
    let y = 0;
    for (const m of ops.matchAll(/\/(F\d) ([\d.]+) Tf|1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm|\(((?:\\.|[^\\)])*)\) Tj|<([0-9a-fA-F]*)> Tj/g)) {
      if (m[1]) (font = m[1]), (size = +m[2]!);
      else if (m[3] !== undefined) (x = +m[3]), (y = +m[4]!);
      else {
        const hex = m[6] !== undefined;
        const b = hex ? (m[6]!.match(/../g) ?? []).map((h) => parseInt(h, 16)) : literal(m[5]!);
        runs.push({ x, y, font, size, text: fonts.get(font)?.(b, hex) ?? '' });
      }
    }
    return { box, runs, ops };
  });
  return { version, objects, pages, trailer, errors };
}

/** The texts of a page's runs, in order. */
export const texts = (p: ReadPdf['pages'][number]): string[] => p.runs.map((r) => r.text);
