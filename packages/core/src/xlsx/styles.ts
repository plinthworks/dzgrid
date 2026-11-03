import { esc } from './xml.js';

/** What a cell's style is made of: a number format (built-in id or code), the font, a fill, the header's border, alignment. */
export interface CellLook {
  readonly fmt?: string | number | undefined;
  readonly bold?: boolean | undefined;
  readonly italic?: boolean | undefined;
  /** `FFRRGGBB`. */
  readonly color?: string | undefined;
  readonly fill?: string | undefined;
  readonly border?: boolean | undefined;
  readonly center?: boolean | undefined;
  readonly indent?: number | undefined;
}

/**
 * The workbook's styles, shared: each distinct look one `cellXfs` entry (index 0 the plain cell), fonts, fills and
 * number formats de-duplicated. `xf(look, cap)` gives its index, or -1 when it is new and `cap` entries exist already.
 */
export function styleBook() {
  const plain = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  const xfs = new Map<string, number>([[plain, 0]]);
  const xml = [plain];
  const fonts = new Map<string, number>([['', 0]]);
  const fills = new Map<string, number>([['', 0], ['g', 1]]);
  const fmts = new Map<string, number>();
  const id = (m: Map<string, number>, k: string): number => m.get(k) ?? (m.set(k, m.size), m.size - 1);
  return {
    xf(l: CellLook, cap = Infinity): number {
      const font = id(fonts, (l.bold ? 'b' : '') + (l.italic ? 'i' : '') + (l.color ?? ''));
      const fill = l.fill ? id(fills, l.fill) : 0;
      const f = l.fmt ?? 0;
      const fmt = typeof f === 'number' ? f : id(fmts, f) + 164;
      const align = l.center || l.indent ? `<alignment${l.center ? ' horizontal="center"' : ''}${l.indent ? ` indent="${l.indent}"` : ''}/>` : '';
      const x = `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${l.border ? 1 : 0}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${l.border ? ' applyBorder="1"' : ''}${align ? ` applyAlignment="1">${align}</xf>` : '/>'}`;
      let i = xfs.get(x);
      if (i === undefined) {
        if (xml.length >= cap) return -1;
        xfs.set(x, (i = xml.length));
        xml.push(x);
      }
      return i;
    },
    get size() {
      return xml.length;
    },
    /** `xl/styles.xml`. */
    text(): string {
      const list = <K>(tag: string, m: Map<K, number>, item: (k: K) => string) => `<${tag} count="${m.size}">${[...m.keys()].map(item).join('')}</${tag}>`;
      return `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.size ? list('numFmts', fmts, (k) => `<numFmt numFmtId="${fmts.get(k)! + 164}" formatCode="${esc(k)}"/>`) : ''}${list('fonts', fonts, (k) =>
        `<font>${k.includes('b') ? '<b/>' : ''}${k.includes('i') ? '<i/>' : ''}<sz val="11"/>${k.length > 2 && /[0-9A-F]{8}$/.test(k) ? `<color rgb="${k.slice(-8)}"/>` : ''}<name val="Calibri"/><family val="2"/></font>`)}${list('fills', fills, (k) =>
        `<fill><patternFill patternType="${k === '' ? 'none' : k === 'g' ? 'gray125' : `solid"><fgColor rgb="${k}"/><bgColor indexed="64"/></patternFill></fill>`}${k.length > 1 ? '' : '"/></fill>'}`)}<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xml.length}">${xml.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    },
  };
}
