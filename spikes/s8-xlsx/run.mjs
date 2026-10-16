// S8 — hand-written XLSX: build 10 000 × 10 in node and in each browser, check
// the zip with `unzip -t`, the XML with xmllint, read it back, and open it with
// what macOS has without a window (Quick Look's converter, `soffice --headless`).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 as zcrc } from 'node:zlib';
import { build } from 'esbuild';
import { serve, browser, record, ROOT } from '../kit.mjs';
import { writeXlsx, daySerial } from './xlsx.js';
import { crc32 } from './zip.js';
import { COLUMNS, makeRows, REMARKS } from './data.js';
import { unzipEntries, readSheet } from './readback.mjs';

const RES = fileURLToPath(new URL('results', import.meta.url));
mkdirSync(RES, { recursive: true });
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout ?? 60_000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), timedOut: r.error?.code === 'ETIMEDOUT' };
};
const result = {};

// ---- CRC32 against zlib ------------------------------------------------------
{
  const bufs = [new Uint8Array(0), new TextEncoder().encode('123456789'), new Uint8Array(1_000_003).map((_, i) => (i * 2654435761) >>> 24)];
  result.crc32 = bufs.map((b) => crc32(b) === (zcrc(b) >>> 0));
  result.crc32Check = crc32(new TextEncoder().encode('123456789')).toString(16); // cbf43926 by definition
  const big = new Uint8Array(3_000_000).map((_, i) => i & 0xff);
  const t0 = performance.now(); crc32(big); result.crc32MBperS = Math.round(3 / ((performance.now() - t0) / 1000));
}

// ---- node --------------------------------------------------------------------
const coreSrc = await build({ entryPoints: [join(ROOT, 'packages/core/src/index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const core = await import('data:text/javascript;base64,' + Buffer.from(coreSrc.outputFiles[0].text).toString('base64'));
const rows = makeRows();
const offsetAt = (ms) => core.offsetAt(ms, 'Africa/Algiers');
const VARIANTS = {
  sharedDeflate: { strings: 'shared', method: 'deflate', rtl: true },
  sharedStore: { strings: 'shared', method: 'store', rtl: true },
  inlineDeflate: { strings: 'inline', method: 'deflate', rtl: true },
  ltrDeflate: { strings: 'shared', method: 'deflate', rtl: false },
};
result.node = {};
const files = {};
for (const [name, opts] of Object.entries(VARIANTS)) {
  const ts = [];
  let res;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    res = await writeXlsx({ sheetName: 'تصدير', columns: COLUMNS, rows, offsetAt, ...opts });
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  const file = join(RES, `node-${name}.xlsx`);
  writeFileSync(file, res.bytes);
  files[name] = file;
  result.node[name] = { ms: Math.round(ts[1]), bytes: res.bytes.length, sheetXmlBytes: res.sheetXmlBytes, deflated: res.deflated, problems: res.problems };
}
// A tiny file for opening by hand: every kind of cell once, right-to-left.
{
  const res = await writeXlsx({ sheetName: 'عينة', columns: COLUMNS, rows: rows.slice(0, REMARKS.length), offsetAt, rtl: true });
  writeFileSync(join(RES, 'sample-rtl.xlsx'), res.bytes);
  files.sample = join(RES, 'sample-rtl.xlsx');
}

// ---- unzip -t and xmllint ------------------------------------------------------
result.unzipT = {};
for (const [k, f] of Object.entries(files)) {
  const r = sh('unzip', ['-t', f]);
  result.unzipT[k] = r.code === 0 ? /No errors detected/.test(r.out) : r.out.slice(-300);
}
const ex = join(RES, 'extract');
rmSync(ex, { recursive: true, force: true });
sh('unzip', ['-q', '-o', files.sharedDeflate, '-d', ex]);
const xmls = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else xmls.push(p); } };
walk(ex);
result.xmllint = Object.fromEntries(xmls.map((p) => { const r = sh('xmllint', ['--noout', p]); return [p.slice(ex.length + 1), r.code === 0 ? true : r.out.slice(0, 300)]; }));

// ---- read back -----------------------------------------------------------------
function expectedCell(col, v) {
  if (v === null || v === undefined || v === '') return undefined;
  switch (col.type) {
    case 'day': return daySerial(v);
    case 'instant': return Math.round(((v + offsetAt(v)) / 86_400_000 + 25569) * 1e9) / 1e9;
    case 'text': return String(v).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
    default: return v;
  }
}
result.readBack = {};
for (const k of ['sharedDeflate', 'inlineDeflate', 'sharedStore']) {
  const entries = unzipEntries(readFileSync(files[k]));
  const back = readSheet(entries);
  let bad = 0;
  const firstBad = [];
  if (JSON.stringify(back[0]) !== JSON.stringify(COLUMNS.map((c) => c.header))) { bad++; firstBad.push({ header: back[0] }); }
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < COLUMNS.length; j++) {
      const want = expectedCell(COLUMNS[j], rows[i][j]);
      const got = back[i + 1]?.[j];
      if (want !== got) { bad++; if (firstBad.length < 5) firstBad.push({ row: i + 2, col: j, want, got }); }
    }
  }
  result.readBack[k] = { crcOk: Object.values(entries).every((e) => e.crcOk), methods: Object.fromEntries(Object.entries(entries).map(([n, e]) => [n, e.method])), cellsWrong: bad, firstBad };
}

// ---- browsers --------------------------------------------------------------------
const site = await serve(import.meta.url);
result.browsers = {};
const nodeStore = readFileSync(files.sharedStore);
const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox', 'webkit'];
for (const name of engines) {
  // One browser at a time, always closed: the machine is shared.
  const b = await browser(name);
  let r;
  const version = b.version();
  try {
    const page = await b.newPage();
    await page.goto(site.url());
    await page.waitForFunction(() => window.ready);
    r = await page.evaluate(() => window.run());
  } finally {
    await b.close();
  }
  const res = { version, canDeflate: r.canDeflate };
  for (const [k, v] of Object.entries(r.variants)) {
    res[k] = { ms: v.ms, runs: v.runs, bytes: v.bytes, deflated: v.deflated, problems: v.problems };
    if (v.base64) {
      const bytes = Buffer.from(v.base64, 'base64');
      const f = join(RES, `${name}-${k}.xlsx`);
      writeFileSync(f, bytes);
      const t = sh('unzip', ['-t', f]);
      res[k].unzipT = t.code === 0 && /No errors detected/.test(t.out);
      if (k === 'sharedStore') res[k].identicalToNode = Buffer.compare(bytes, nodeStore) === 0;
      if (k === 'sharedDeflate') {
        // Different deflaters give different bytes; the content must still be the same.
        const a = unzipEntries(bytes);
        const n = unzipEntries(readFileSync(files.sharedDeflate));
        res[k].sameContentAsNode = Object.keys(n).every((e) => a[e] && Buffer.compare(a[e].data, n[e].data) === 0);
      }
    }
  }
  result.browsers[name] = res;
  console.error(`${name} done`);
}
await site.close();

// ---- what macOS can open ------------------------------------------------------------
result.apps = { installed: readdirSync('/Applications').filter((a) => /excel|numbers|libreoffice|openoffice/i.test(a)) };
// Quick Look was used here once; its Office importer may come from Numbers.app,
// which the owner saw appear. Removed: the fidelity check is done by hand.
result.apps.quickLook = 'removed (owner checks by hand)';

/** Cell texts of Quick Look's table, against what each cell should display. */
function compareQuickLook(html) {
  const dec = (t) => t.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const table = [];
  for (const tr of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) table.push([...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => dec(m[1])));
  const pad = (n) => String(n).padStart(2, '0');
  const wall = (ms) => {
    const w = ms + offsetAt(ms);
    const day = core.epochDayToDay(Math.floor(w / 86_400_000));
    const t = w - Math.floor(w / 86_400_000) * 86_400_000;
    return `${day} ${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)}`;
  };
  const mismatches = [];
  const booleans = [];
  const sample = rows.slice(0, REMARKS.length);
  if (JSON.stringify(table[0]) !== JSON.stringify(COLUMNS.map((c) => c.header))) mismatches.push({ header: table[0] });
  sample.forEach((row, i) => {
    row.forEach((v, j) => {
      const got = table[i + 1]?.[j];
      const t = COLUMNS[j].type;
      let want;
      if (t === 'day') want = v;
      else if (t === 'instant') want = wall(v);
      else if (t === 'money') want = v.toFixed(2);
      else if (t === 'number') want = String(v);
      else if (t === 'boolean') { booleans.push(got); return; }
      else want = expectedCell(COLUMNS[j], v) ?? '';
      let norm = got;
      if (t === 'money' && got !== undefined) norm = got.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
      // HTML cannot show a tab or a run of spaces: compare text with whitespace runs collapsed.
      if (t === 'text' && got !== undefined) { norm = got.replace(/[ \t]+/g, ' '); want = want.replace(/[ \t]+/g, ' '); }
      if (norm !== want) mismatches.push({ row: i + 2, col: j, type: t, want, got });
    });
  });
  return { rows: table.length, mismatches, booleansShownAs: [...new Set(booleans)] };
}
// No GUI application is launched (Numbers, Excel, LibreOffice with a window):
// it would appear on the owner's screen. Only `soffice --headless`, if present.
{
  const soffice = ['/Applications/LibreOffice.app/Contents/MacOS/soffice'].find((p) => existsSync(p));
  if (soffice) {
    const r = sh(soffice, ['--headless', '--convert-to', 'csv', '--outdir', RES, files.sample], { timeout: 120_000 });
    result.apps.soffice = { code: r.code, out: r.out.slice(0, 300) };
  } else result.apps.soffice = 'not installed';
}
record(import.meta.url, result);
