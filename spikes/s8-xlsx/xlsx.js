/**
 * A minimal SpreadsheetML writer (ECMA-376 Part 1, §18; packaging per Part 2,
 * OPC): one sheet, typed cells, a few styles, optional right-to-left view.
 *
 *   const { bytes } = await writeXlsx({ sheetName, columns, rows, rtl, strings, method, offsetAt });
 *
 * columns: [{ header, type: 'text'|'number'|'money'|'day'|'instant'|'boolean', width? }]
 * rows:    arrays of raw values — text as string, number as number, day as
 *          'YYYY-MM-DD', instant as epoch ms, boolean as boolean; null/undefined → no cell.
 * offsetAt(ms) → the zone's offset in ms at that instant (the core's offsetAt,
 *          bound to the export zone): instants are written as the wall time
 *          the user sees, since a spreadsheet date has no zone.
 * strings: 'shared' (sharedStrings.xml, deduplicated) or 'inline' (t="inlineStr").
 *
 * Cells are never formulas: text is written as a string cell, so `=1+1` stays text.
 * Problems (truncated text, non-finite numbers, bad days) are returned, not thrown.
 */
import { zip } from './zip.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH_OFFSET = 25569; // serial of 1970-01-01 in the 1900 date system
const MAX_TEXT = 32767;

// Style indices in cellXfs, below.
const S = { default: 0, header: 1, day: 2, instant: 3, money: 4, wrap: 5 };

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Days since 1970-01-01 of a civil date (proleptic Gregorian), no Date. */
function civilToEpochDay(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}

/**
 * Excel serial for a day. The 1900 system counts a 1900-02-29 that never was,
 * so serials are only right from 1900-03-01 on; earlier days are refused.
 */
export function daySerial(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const n = civilToEpochDay(+m[1], +m[2], +m[3]);
  const serial = n + EXCEL_EPOCH_OFFSET;
  return serial >= 61 ? serial : null;
}

const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Text for an ST_Xstring element: XML-escaped, with characters XML 1.0 cannot
 * carry written as `_xHHHH_` (ECMA-376 Part 1, §22.9.2.19), and a literal
 * `_xHHHH_` already in the text protected by escaping its underscore.
 */
export function xstr(s) {
  return s
    .replace(LONE_SURROGATE, '\uFFFD')
    .replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1')
    .replace(XML_BAD, (c) => '_x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '_')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
const attr = (s) => xstr(String(s)).replace(/"/g, '&quot;');
const tEl = (s) => (/^\s|\s$|\n/.test(s) ? `<t xml:space="preserve">${xstr(s)}</t>` : `<t>${xstr(s)}</t>`);

/** Sheet names: ≤ 31 characters, none of []:*?/\, no leading or trailing apostrophe. */
export function safeSheetName(name) {
  let s = String(name ?? 'Sheet1').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').slice(0, 31).trim();
  return s || 'Sheet1';
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}">
<numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function writeXlsx({
  sheetName = 'Sheet1', columns, rows, rtl = false, strings = 'shared', method = 'deflate',
  offsetAt = () => 0, freezeHeader = true, autoFilter = true,
}) {
  const problems = [];
  const name = safeSheetName(sheetName);
  const sst = new Map();
  const sstList = [];
  let sstCount = 0;
  const ncols = columns.length;
  const nrows = rows.length + 1;
  const lastRef = `${colName(ncols - 1)}${nrows}`;
  const refs = columns.map((_, j) => colName(j));

  const textCell = (ref, s, styleIndex) => {
    if (s.length > MAX_TEXT) { problems.push({ code: 'text-truncated', ref }); s = s.slice(0, MAX_TEXT); }
    const si = styleIndex ?? (s.includes('\n') ? S.wrap : S.default);
    const style = si ? ` s="${si}"` : '';
    if (strings === 'inline') return `<c r="${ref}"${style} t="inlineStr"><is>${tEl(s)}</is></c>`;
    let k = sst.get(s);
    if (k === undefined) { k = sstList.length; sst.set(s, k); sstList.push(s); }
    sstCount++;
    return `<c r="${ref}"${style} t="s"><v>${k}</v></c>`;
  };

  const out = [];
  out.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS}" xmlns:r="${NS_R}">`);
  out.push(`<dimension ref="A1:${lastRef}"/>`);
  out.push(`<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}>`);
  if (freezeHeader) out.push('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>');
  out.push('</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>');
  columns.forEach((c, j) => out.push(`<col min="${j + 1}" max="${j + 1}" width="${c.width ?? 14}" customWidth="1"/>`));
  out.push('</cols><sheetData>');
  // Header row.
  let row = `<row r="1">`;
  columns.forEach((c, j) => { row += textCell(`${refs[j]}1`, String(c.header), S.header); });
  out.push(row + '</row>');
  for (let i = 0; i < rows.length; i++) {
    const r = i + 2;
    let x = `<row r="${r}">`;
    const vals = rows[i];
    for (let j = 0; j < ncols; j++) {
      const v = vals[j];
      if (v === null || v === undefined || v === '') continue;
      const ref = refs[j] + r;
      switch (columns[j].type) {
        case 'number':
        case 'money':
          if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push({ code: 'not-a-number', ref }); break; }
          x += `<c r="${ref}"${columns[j].type === 'money' ? ` s="${S.money}"` : ''}><v>${Object.is(v, -0) ? 0 : v}</v></c>`;
          break;
        case 'day': {
          const s = daySerial(v);
          if (s === null) { problems.push({ code: 'day-out-of-range', ref }); x += textCell(ref, String(v)); break; }
          x += `<c r="${ref}" s="${S.day}"><v>${s}</v></c>`;
          break;
        }
        case 'instant': {
          if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push({ code: 'not-an-instant', ref }); break; }
          const wall = v + offsetAt(v);
          const serial = wall / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
          // Rounded to the millisecond's worth of a day, so 10:00 does not print as 09:59:59.
          x += `<c r="${ref}" s="${S.instant}"><v>${Math.round(serial * 1e9) / 1e9}</v></c>`;
          break;
        }
        case 'boolean':
          x += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
          break;
        default:
          x += textCell(ref, String(v));
      }
    }
    out.push(x + '</row>');
  }
  out.push('</sheetData>');
  if (autoFilter) out.push(`<autoFilter ref="A1:${lastRef}"/>`);
  out.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>');

  const enc = new TextEncoder();
  const files = [];
  const add = (n, s) => files.push({ name: n, data: enc.encode(s) });
  const hasSst = strings === 'shared';
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hasSst ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : ''}</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PR}"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets><sheet name="${attr(name)}" sheetId="1" r:id="rId1"/></sheets>${autoFilter ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xstr(name.replace(/'/g, "''"))}'!$A$1:$${colName(ncols - 1)}$${nrows}</definedName></definedNames>` : ''}</workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PR}"><Relationship Id="rId1" Type="${NS_R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS_R}/styles" Target="styles.xml"/>${hasSst ? `<Relationship Id="rId3" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>` : ''}</Relationships>`);
  add('xl/styles.xml', STYLES);
  files.push({ name: 'xl/worksheets/sheet1.xml', data: enc.encode(out.join('')) });
  if (hasSst) {
    const parts = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${NS}" count="${sstCount}" uniqueCount="${sstList.length}">`];
    for (const s of sstList) parts.push(`<si>${tEl(s)}</si>`);
    parts.push('</sst>');
    add('xl/sharedStrings.xml', parts.join(''));
  }
  const z = await zip(files, { method });
  return { bytes: z.bytes, deflated: z.deflated, problems, sheetXmlBytes: files.find((f) => f.name.endsWith('sheet1.xml')).data.length };
}
