// S7 — Clipboard in Chrome, Firefox, WebKit: copy/cut/paste events with
// clipboardData from real key presses, navigator.clipboard with and without a
// gesture and with granted permissions, parsing of spreadsheet-shaped HTML
// fixtures, and a TSV codec that must round-trip.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { serve, browser, record } from '../kit.mjs';
import * as tsv from './tsv.js';

const pbpaste = () => { try { return execFileSync('pbpaste', { encoding: 'utf8' }); } catch { return null; } };
const pbcopy = (s) => { try { execFileSync('pbcopy', { input: s }); } catch {} };
const systemBefore = pbpaste();

const expected = JSON.parse(readFileSync(new URL('./fixtures/expected.json', import.meta.url), 'utf8'));
const FIXTURES = Object.keys(expected);

function checkFixture(name, got) {
  const want = expected[name];
  const issues = [];
  if (!got) return ['no table found'];
  if (JSON.stringify(got.values) !== JSON.stringify(want.values)) issues.push({ values: got.values });
  if (JSON.stringify(got.merges) !== JSON.stringify(want.merges)) issues.push({ merges: got.merges });
  for (const [rc, hint] of Object.entries(want.meta)) {
    const [r, c] = rc.split(',').map(Number);
    const g = got.meta[r]?.[c] ?? {};
    for (const [k, v] of Object.entries(hint)) if (g[k] !== v) issues.push({ meta: rc, key: k, got: g[k], want: v });
  }
  return issues;
}

const site = await serve(import.meta.url);
const only = process.argv.slice(2);
const engines = only.length ? only : ['chrome', 'firefox', 'webkit'];
const out = { node: { roundTrip: tsv.roundTrip(20000), decodeCases: tsv.decodeCases().filter((c) => !c.ok) } };
// A large paste: 10 000 rows × 30 columns, some cells quoted.
{
  const m = Array.from({ length: 10_000 }, (_, i) => Array.from({ length: 30 }, (_, j) => (j === 5 ? `note ${i}\nsuite` : j === 7 ? `"q" ${i}` : `v${i}-${j}`)));
  const text = tsv.encodeTsv(m);
  const t0 = performance.now();
  const back = tsv.decodeTsv(text);
  const t1 = performance.now();
  tsv.encodeTsv(m);
  const t2 = performance.now();
  out.node.large = { bytes: text.length, decodeMs: Math.round(t1 - t0), encodeMs: Math.round(t2 - t1), same: JSON.stringify(back) === JSON.stringify(m) };
}

async function probe(ctx, label) {
  const page = await ctx.newPage();
  await page.goto(site.url());
  await page.waitForFunction(() => window.ready);
  const r = { label };
  const take = () => page.evaluate(() => window.log.splice(0));
  const key = async (sel, combo) => { await page.focus(sel); await page.keyboard.press(combo); await page.waitForTimeout(150); return take(); };

  r.features = await page.evaluate(() => window.features());
  await take();

  r.keyboardCopyOnGrid = await key('#grid', 'ControlOrMeta+C');
  r.keyboardPasteOnGrid = await key('#grid', 'ControlOrMeta+V');
  r.keyboardPasteOnTextarea = await key('#ta', 'ControlOrMeta+V');
  r.keyboardCutOnGrid = await key('#grid', 'ControlOrMeta+X');
  r.keyboardPasteAfterCut = await key('#grid', 'ControlOrMeta+V');

  const gesture = async (name) => {
    const p = page.evaluate((n) => window.inGesture(n), name);
    await page.waitForFunction((n) => window.pendingAction === n, name);
    await page.click('#btn');
    const v = await p;
    await page.evaluate(() => { window.pendingAction = null; });
    return v;
  };
  r.noGesture = {};
  for (const a of ['writeText', 'readText']) r.noGesture[a] = await page.evaluate((n) => window.noGesture(n), a);
  r.gesture = {};
  r.gesture.execCopy = await gesture('execCopy');
  r.gesture.execPaste = await gesture('execPaste');
  r.gesture.writeText = await gesture('writeText');
  r.pasteAfterWriteText = (await key('#grid', 'ControlOrMeta+V')).map((e) => ({ types: e.types, plain: e.plain }));
  r.gesture.readText = await gesture('readText');
  r.gesture.writeHtml = await gesture('writeHtml');
  r.pasteAfterWriteHtml = (await key('#grid', 'ControlOrMeta+V')).map((e) => ({ types: e.types, plain: e.plain, html: e.html, htmlParsed: e.htmlParsed }));
  r.gesture.read = await gesture('read');
  await take();
  await page.close();
  return r;
}

for (const name of engines) {
  // One browser at a time, always closed: the machine is shared.
  const b = await browser(name);
  const res = {};
  try {
    res.version = b.version();
    // Default context: no permission granted.
    const plain = await b.newContext();
    res.default = await probe(plain, 'default');
    {
      const page = await plain.newPage();
      await page.goto(site.url());
      await page.waitForFunction(() => window.ready);
      const parsed = await page.evaluate((n) => window.parseFixtures(n), FIXTURES);
      res.fixtures = Object.fromEntries(FIXTURES.map((f) => [f, checkFixture(f, parsed[f])]));
      res.fixturesParsed = parsed;
      res.roundTrip = await page.evaluate(() => window.tsv.roundTrip(20000));
      res.decodeCasesFailed = (await page.evaluate(() => window.tsv.decodeCases())).filter((c) => !c.ok);
      res.large = await page.evaluate(() => window.large());
    }
    await plain.close();
    // Granted context, where Playwright knows the permission names.
    try {
      const granted = await b.newContext();
      await granted.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(site.url()).origin });
      res.granted = await probe(granted, 'granted');
      await granted.close();
    } catch (e) {
      res.granted = { grantError: String(e.message).split('\n')[0] };
    }
  } finally {
    await b.close();
  }
  out[name] = res;
  console.error(`${name} done`);
}
await site.close();

const systemAfter = pbpaste();
out.systemClipboardTouched = systemBefore !== systemAfter ? { after: systemAfter?.slice(0, 80) } : false;
if (out.systemClipboardTouched && systemBefore !== null) pbcopy(systemBefore);
record(import.meta.url, out);
