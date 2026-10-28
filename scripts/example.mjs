/**
 * The Angular example (step 23, docs/behaviors/angular-example.md; plan
 * docs/phase-3-steps/step23-example-blueprint.md, decisions step23-decisions.md).
 *
 *   node scripts/example.mjs build [--no-pack] [--if-stale]   pack the tarballs, install them into
 *       examples/angular-audit (copies, not links), ng build default, zone and baseline; `--if-stale`: only when
 *       the stamp does not match the packages (release:check)
 *   node scripts/example.mjs csv                  the Arabic CSV sample → examples/angular-audit/out/audit-ar.csv
 *   node scripts/example.mjs ssr [--lang ar] [--screen stock] [--json] [--dir <example>]   renderApplication on the server build
 *   node scripts/example.mjs bytes                K.8 from the real build (default less baseline)
 *   node scripts/example.mjs browser              headless Chrome: the client builds (default, zone), fr and ar, the zone demo
 *   node scripts/example.mjs smoke <19|22> [--keep]   by hand: a copy in a scratch folder on that major, build + SSR
 *
 * The example is not a workspace member: its node_modules are its own (gitignored).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dropStamp, forgetLocalPacks, indexOf, measureExample, measureLazy, stampProblem, writeStamp } from './example-lib.mjs';
import { measureSplit } from './size-split.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLE = join(ROOT, 'examples/angular-audit');
const K8 = 95_000; // owner 2026-10-28 (Phase 6 step 12, decisions.md « Real Angular example line »: measured 94 596; the build had been broken since 1.0.0); owner S12-Q10 92 500 (2026-10-26: the stock screen's blocks and fill, measured 92 059); S9-Q7 92 000 (the on-demand stock screen splits the build); Q17a 90 000, Q14 87 000, before it 85 000
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ENV = { ...process.env, NG_CLI_ANALYTICS: 'false', NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' };

/** A command; its output printed, and returned. Throws on a non-zero exit unless `allowFail`. */
function sh(cmd, argv, cwd, { allowFail = false, env = ENV } = {}) {
  console.log(`$ ${cmd} ${argv.join(' ')}   (in ${cwd.slice(ROOT.length) || '.'})`);
  const r = spawnSync(cmd, argv, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  if (!allowFail && r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}`);
  return { status: r.status, out };
}

const ng = (dir, argv, opts) => sh(process.execPath, [join(dir, 'node_modules/@angular/cli/bin/ng.js'), ...argv], dir, opts);

/** An ng build's output must say nothing worrying: no warning (partial declarations, the linker, templates), no error. */
function quiet(out) {
  return out.split('\n').filter((l) => /\bwarning\b|\berror\b|▲|✘|partial|linker/i.test(l) && !/^\s*$/.test(l));
}

function installed(dir) {
  const bad = [];
  for (const p of ['core', 'dom', 'angular', 'theme']) {
    const at = join(dir, 'node_modules/@dzgrid', p);
    if (!existsSync(at)) bad.push(`@dzgrid/${p} is not installed`);
    else if (lstatSync(at).isSymbolicLink()) bad.push(`@dzgrid/${p} is a link, not a copy`);
  }
  return bad;
}

function build() {
  // `--if-stale` (release:check, Phase 6 close): a build stamped from the packages as they are now is kept.
  if (flag('if-stale') && !stampProblem(EXAMPLE, ROOT)) return void console.log('example build: fresh (its stamp matches the packages), kept');
  // No stamp until every build is clean (owner, 2026-10-28): a failed install or build leaves an old dist unmeasurable.
  dropStamp(EXAMPLE);
  if (!flag('no-pack')) sh('npm', ['run', 'pack:local'], ROOT);
  // The same version on every pack (0.3.0 until a release): npm would keep the old copy. Removed, then installed again.
  rmSync(join(EXAMPLE, 'node_modules/@dzgrid'), { recursive: true, force: true });
  // Their lock entries too: the old tarball's integrity made npm reinstall its cached copy (step 11).
  const lockFile = join(EXAMPLE, 'package-lock.json');
  if (existsSync(lockFile)) writeFileSync(lockFile, JSON.stringify(forgetLocalPacks(JSON.parse(readFileSync(lockFile, 'utf8'))), null, 2) + '\n');
  // The manifest names the release tarballs (`packed/dzgrid-*-1.1.0.tgz`, `pack:release`); `pack:local` stamps its own
  // version (1.1.1-local.<time>): npm is pointed at the tarballs packed, the manifest given back as it was after.
  const manifest = join(EXAMPLE, 'package.json');
  const kept = readFileSync(manifest, 'utf8');
  const packs = readdirSync(join(ROOT, 'packed'));
  writeFileSync(manifest, kept.replace(/file:\.\.\/\.\.\/packed\/dzgrid-(core|dom|angular|theme)-[^"]+\.tgz/g, (all, p) => {
    const f = packs.find((x) => x.startsWith(`dzgrid-${p}-`) && x.endsWith('.tgz'));
    return f ? `file:../../packed/${f}` : all;
  }));
  try {
    sh('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], EXAMPLE);
  } finally {
    writeFileSync(manifest, kept);
  }
  const bad = installed(EXAMPLE);
  if (bad.length) throw new Error(bad.join('; '));
  const runs = [
    ['default', ['build', '--stats-json']],
    ['zone', ['build', '-c', 'production,zone']],
    ['baseline', ['build', '-c', 'production,baseline', '--stats-json']],
  ];
  const report = [];
  for (const [name, argv] of runs) {
    const { out } = ng(EXAMPLE, argv);
    const noisy = quiet(out);
    report.push({ name, ok: noisy.length === 0, noisy });
  }
  console.log('\nexample build (Angular 21):');
  for (const r of report) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.noisy.length ? `: ${r.noisy.join(' | ')}` : ''}`);
  console.log(`  installed @dzgrid/* as copies: ${installed(EXAMPLE).length === 0 ? 'yes' : 'no'}`);
  if (report.every((r) => r.ok)) writeStamp(EXAMPLE, ROOT);
  else process.exitCode = 1;
}

function csv() {
  const r = sh(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--project', 'tools', 'perf/test/example-csv.test.ts'], ROOT, { allowFail: true, env: { ...ENV, EXAMPLE_CSV_WRITE: '1' } });
  const file = join(EXAMPLE, 'out/audit-ar.csv');
  if (r.status !== 0 || !existsSync(file)) {
    console.log('FAIL the Arabic sample was not written');
    process.exitCode = 1;
    return;
  }
  const bytes = readFileSync(file);
  console.log(`\nwritten: ${file} (${bytes.length} bytes; starts ${[...bytes.subarray(0, 3)].map((b) => b.toString(16).toUpperCase()).join(' ')})`);
  console.log('first lines:');
  for (const line of bytes.toString('utf8').replace(/^﻿/, '').split('\r\n').slice(0, 4)) console.log(`  ${line}`);
}

async function ssr() {
  const dir = option('dir', EXAMPLE);
  const lang = option('lang', 'fr');
  // Phase 5 step 9: the editable « stock » screen (?screen=stock), its own bootstrap.
  const screen = option('screen', 'audit');
  const stock = screen === 'stock';
  // Phase 6 step 12 (Q12-3): the audit screen with its layout in the address, a grid=1.… parameter given.
  const url = screen === 'audit-url';
  const server = join(dir, 'dist/audit/server');
  const count = (types) => types.filter((t) => t === 'Timeout' || t === 'Immediate').length;
  const before = count(process.getActiveResourcesInfo());
  const errors = [];
  const warnings = [];
  const keep = { error: console.error, warn: console.warn };
  console.error = (...a) => void errors.push(a.map(String).join(' '));
  console.warn = (...a) => void warnings.push(a.map(String).join(' '));
  let html = '';
  let probe = null;
  try {
    const mod = await import(pathToFileURL(join(server, 'main.server.mjs')).href);
    probe = mod.newProbe();
    const document = readFileSync(join(server, 'index.server.html'), 'utf8');
    html = await mod.renderApplication(stock ? mod.bootstrapStock : url ? mod.bootstrapAuditUrl : mod.default, {
      document, url: `/?${stock ? 'screen=stock&' : url ? 'screen=audit-url&grid=1.eyJ2IjoxLCJzb3J0IjpbXX0&' : ''}${lang === 'ar' ? 'lang=ar' : ''}`, platformProviders: [{ provide: mod.AUDIT_PROBE, useValue: probe }],
    });
  } catch (e) {
    errors.push(String(e?.stack ?? e));
  } finally {
    Object.assign(console, keep);
  }
  await new Promise((r) => setImmediate(r));
  const left = count(process.getActiveResourcesInfo()) - before;
  const k = probe?.kernel;
  const result = {
    lang,
    screen,
    // The screen asked for is the one rendered (review of step 9): its own marker in the server's HTML.
    marker: html.includes(stock ? 'stock-saved' : 'audit-count'),
    host: /<dz-grid\b/.test(html),
    // In class attributes only: a screen whose component styles are rendered (the stock screen's edit.css) names .dzg-row in CSS.
    rows: (html.match(/class="[^"]*\bdzg-row\b/g) ?? []).length,
    // The grid's own class, `dzg` as a whole word anywhere in the list (not dzg-row, dzg-viewport…).
    grids: (html.match(/class="[^"]*\bdzg\b(?!-)/g) ?? []).length,
    dir: /<html[^>]*\bdir="([^"]+)"/.exec(html)?.[1] ?? null,
    errors,
    warnings,
    kernel: k === null ? null : k === undefined ? 'no controller found' : typeof k,
    ready: probe?.ready ?? null,
    gridReady: probe?.gridReady ?? null,
    timers: left > 0 ? [`${left} timer(s) or immediate(s) left open`] : [],
    bytes: html.length,
  };
  const ok = result.marker && result.host && result.rows === 0 && result.grids === 0 && !errors.length && result.kernel === null && result.ready === false && !result.timers.length;
  if (flag('json')) console.log(JSON.stringify(result));
  else {
    console.log(`server render (${stock ? 'stock, ' : ''}${lang}): ${ok ? 'ok' : 'FAIL'}`);
    console.log(JSON.stringify(result, null, 2));
  }
  if (!ok) process.exitCode = 1;
}

async function bytes() {
  // A missing, failed or stale build is an error, never a skip nor an old number (owner, 2026-10-28).
  const stale = stampProblem(EXAMPLE, ROOT);
  if (stale) {
    console.log(`FAIL ${stale}`);
    process.exitCode = 1;
    return;
  }
  const m = measureExample(EXAMPLE);
  const budget = JSON.parse(readFileSync(join(ROOT, 'size-budget.json'), 'utf8')).entries['profile: audit screen (K.8)'];
  const estimate = await measureSplit(budget, ROOT);
  const row = (name, b) => console.log(`  ${name}: ${b.total} B gz (js ${b.js}, css ${b.css}; ${b.files.length} files)`);
  console.log('K.8 from the real ng build (Angular 21, production, gzip level 9, initial files: the page and its static imports in stats.json):');
  row('default (DzGrid audit screen)', m.audit);
  row('baseline (same shell, plain table)', m.baseline);
  console.log(`  (1) DzGrid + theme + wrapper, real build: ${m.share} B gz — K.8 ${K8}: ${m.share <= K8 ? 'within' : 'OVER'}; esbuild profile (check:size): ${estimate.initialGzip} B gz (${m.share - estimate.initialGzip >= 0 ? '+' : ''}${m.share - estimate.initialGzip})`);
  console.log(`  (2) Angular runtime and the shell (baseline): ${m.baseline.total} B gz`);
  console.log(`  (3) @dzgrid/angular in the initial JS: ${m.wrapper.min} B min, ~${m.wrapper.gz} B gz (estimated from the build stats)`);
  // Phase 5 step 9 (owner S9-Q4): the « stock » screen, loaded on demand, measured apart (no ceiling set).
  const lazy = measureLazy(join(EXAMPLE, 'dist/audit'), /src\/app\/stock\.component/);
  console.log(`  (4) the « stock » screen, loaded on demand (?screen=stock): ${lazy.total} B gz in ${lazy.files.length} files (${lazy.files.map((f) => `${f.file} ${f.gz}`).join(', ')}); not in (1)`);
  // Phase 6 step 12 (owner Q12-3): the audit screen with its layout in the address, on demand, measured apart (no ceiling set).
  const addr = measureLazy(join(EXAMPLE, 'dist/audit'), /src\/app\/audit-url\.ts/);
  console.log(`  (5) the « audit-url » screen, loaded on demand (?screen=audit-url): ${addr.total} B gz in ${addr.files.length} files (${addr.files.map((f) => `${f.file} ${f.gz}`).join(', ')}); not in (1)`);
  if (m.share > K8) {
    console.log(`STOP: the DzGrid share of the real build is over ${K8} B: ask the owner.`);
    process.exitCode = 1;
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon' };

/** A static server for one build's browser folder; unknown paths get the page (index.html or index.csr.html). */
async function serveDir(dir) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = indexOf(dir);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: (p) => `http://127.0.0.1:${server.address().port}${p}`, close: () => new Promise((r) => server.close(r)) };
}

async function browserCheck() {
  const { browser } = await import('../spikes/kit.mjs');
  const chrome = await browser('chrome');
  const results = [];
  try {
    for (const build of ['audit', 'zone']) {
      const site = await serveDir(join(EXAMPLE, 'dist', build, 'browser'));
      try {
        for (const lang of ['fr', 'ar']) {
          const page = await chrome.newPage({ viewport: { width: 1280, height: 800 } });
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
          await page.goto(site.url(`/?probe=1${lang === 'ar' ? '&lang=ar' : ''}`));
          await page.waitForSelector('.dzg-layer .audit-actor', { timeout: 15_000 });
          const frames = (n) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
          await frames(2);
          const first = await page.evaluate(() => ({
            dir: document.documentElement.dir, rows: document.querySelectorAll('.dzg-layer .dzg-row').length,
            zone: typeof (globalThis).Zone !== 'undefined', grids: document.querySelectorAll('.dzg').length,
          }));
          // Scroll steps inside the page of 50 rows: Angular's checks per step.
          const vp = '.dzg-viewport';
          const c0 = await page.evaluate(() => window.auditProbe.checks);
          const steps = 20;
          for (let i = 1; i <= steps; i++) {
            await page.evaluate(([sel, px]) => { const v = document.querySelector(sel); v.scrollTop = px; v.dispatchEvent(new Event('scroll')); }, [vp, i * 36]);
            await frames(2);
          }
          const c1 = await page.evaluate(() => window.auditProbe.checks);
          // A pooled cell (its row reused by the scroll): its emit reaches the host's handler.
          const button = page.locator('.dzg-layer .audit-actor').nth(3);
          const label = (await button.textContent())?.trim();
          await button.click();
          await frames(2);
          const after = await page.evaluate(() => ({
            count: document.querySelector('.audit-count')?.textContent?.trim(), last: document.querySelector('.audit-last')?.textContent?.trim(),
            actions: window.auditProbe.actions, inZone: window.auditProbe.inZone, gridReady: window.auditProbe.gridReady, problems: window.auditProbe.problems,
          }));
          const perStep = (c1 - c0) / steps;
          const ok = first.rows > 0 && first.grids === 1 && first.dir === (lang === 'ar' ? 'rtl' : 'ltr') && first.zone === (build === 'zone')
            && after.count === '1' && after.last === label && after.actions === 1 && (build !== 'zone' || after.inZone === true)
            && perStep <= 2 && after.gridReady && errors.length === 0;
          results.push({ build, lang, ok, rows: first.rows, dir: first.dir, zone: first.zone, checksPerScrollStep: perStep, ...after, errors });
          await page.close();
        }
        // Phase 5 step 9 (S9-Q4): the « stock » screen, loaded on demand: open, type, Enter, the fake save → saved;
        // a refused save (S-0005) → the value back, the error mark, (saveFailed) inside the zone; checks per keystroke.
        for (const lang of ['fr', 'ar']) {
          const page = await chrome.newPage({ viewport: { width: 1280, height: 800 } });
          const errors = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
          await page.goto(site.url(`/?probe=1&screen=stock${lang === 'ar' ? '&lang=ar' : ''}`));
          await page.waitForSelector('.dzg-layer .dzg-row', { timeout: 15_000 });
          const frames = (n) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
          await frames(2);
          const cell = (row, col) => `.dzg-layer .dzg-row[aria-rowindex="${row + 2}"] .dzg-cell[data-col="${col}"]`;
          const read = (row, col) => page.evaluate((s) => { const c = document.querySelector(s); return { text: c?.textContent, cls: c?.className ?? '' }; }, cell(row, col));
          const dir = await page.evaluate(() => document.querySelector('.dzg')?.getAttribute('dir'));
          await page.click(cell(2, 'stock'));
          await page.keyboard.press('F2');
          await page.keyboard.press('ControlOrMeta+a');
          const c0 = await page.evaluate(() => window.auditProbe.checks);
          await page.keyboard.type('123');
          const c1 = await page.evaluate(() => window.auditProbe.checks);
          await page.keyboard.press('Enter');
          // Review of step 9 (6): « Enregistrés » counts answered saves, not edits: nothing yet while the save runs.
          const pending = await page.evaluate(() => document.querySelector('.stock-saved')?.textContent?.trim());
          await page.waitForTimeout(400);
          await frames(2);
          const saved = await read(2, 'stock');
          const savedCount = await page.evaluate(() => document.querySelector('.stock-saved')?.textContent?.trim());
          const before = await read(5, 'stock');
          await page.click(cell(5, 'stock'));
          await page.keyboard.press('F2');
          await page.keyboard.press('ControlOrMeta+a');
          await page.keyboard.type('9');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(1000);
          await frames(2);
          const refused = await read(5, 'stock');
          const failed = await page.evaluate(() => ({ count: document.querySelector('.stock-failed')?.textContent?.trim(), inZone: window.auditProbe.inZone }));
          // Phase 5 step 12: the fill handle dragged (rows 10, 11: 370, 407 → 444, 481) and Ctrl+Enter on a block (rows 20–22).
          await page.click(cell(10, 'stock'));
          await page.keyboard.press('Shift+ArrowDown');
          await frames(2);
          const hb = await page.evaluate(() => { const h = document.querySelector('.dzg-fill'); const r = h?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
          const to = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cell(13, 'stock'));
          if (hb) {
            await page.mouse.move(hb.x, hb.y);
            await page.mouse.down();
            await page.mouse.move(to.x, to.y, { steps: 8 });
            await page.mouse.up();
          }
          await frames(2);
          const filled = [(await read(12, 'stock')).text, (await read(13, 'stock')).text];
          await page.click(cell(20, 'stock'));
          await page.keyboard.press('Shift+ArrowDown');
          await page.keyboard.press('Shift+ArrowDown');
          await page.keyboard.press('F2');
          await page.keyboard.press('ControlOrMeta+a');
          await page.keyboard.type('5');
          await page.keyboard.press('ControlOrMeta+Enter');
          await frames(2);
          const bulk = [20, 21, 22].map((r) => r);
          const bulked = [];
          for (const r of bulk) bulked.push((await read(r, 'stock')).text);
          const fillOk = !!hb && filled[0] === '444' && filled[1] === '481' && bulked.every((t) => t === '5');
          const perKey = (c1 - c0) / 3;
          const ok = dir === (lang === 'ar' ? 'rtl' : 'ltr') && pending === '0' && saved.text === '123' && savedCount === '1' && refused.text === before.text && /dzg-cell--failed/.test(refused.cls)
            && failed.count === '1' && (build !== 'zone' || failed.inZone === true) && perKey <= 2 && fillOk && errors.length === 0;
          results.push({ build, lang, screen: 'stock', ok, dir, pending, saved, savedCount, refused, before, failed, checksPerKeystroke: perKey, filled, bulked, errors });
          await page.close();
        }
      } finally {
        await site.close();
      }
    }
  } finally {
    await chrome.close();
  }
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(r)}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

const OFFLINE = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|ECONNRESET|network/i;
const COMPAT_19 = `/**
 * Angular 19 (written by scripts/example.mjs smoke 19): zoneless was experimental. (19.2 takes
 * the server's BootstrapContext too: it was backported.)
 */
import { provideExperimentalZonelessChangeDetection, type EnvironmentProviders } from '@angular/core';
import type { BootstrapContext } from '@angular/platform-browser';

export type ServerContext = BootstrapContext;
export const zoneless = (): EnvironmentProviders => provideExperimentalZonelessChangeDetection();
`;

function smoke() {
  const major = Number(args[1]);
  if (![19, 22].includes(major)) throw new Error('smoke: 19 or 22');
  const dir = join(process.env.DZG_SMOKE_DIR ?? tmpdir(), `dzgrid-smoke-${major}`);
  rmSync(dir, { recursive: true, force: true });
  // From here the folder is ours: whatever happens, the verdict is printed and the folder deleted.
  let verdict = 'not run';
  let why = '';
  try {
    mkdirSync(dir, { recursive: true });
    cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !/[/\\](node_modules|dist|\.angular|out|package-lock\.json)([/\\]|$)/.test(src.slice(EXAMPLE.length)) });
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    for (const deps of [pkg.dependencies, pkg.devDependencies]) {
      for (const name of Object.keys(deps)) {
        if (name.startsWith('@angular/')) deps[name] = `^${major}.0.0`;
        if (deps[name].startsWith('file:')) deps[name] = `file:${join(EXAMPLE, deps[name].slice(5))}`;
      }
    }
    pkg.devDependencies.typescript = { 19: '~5.8.0', 22: '~6.0.0' }[major];
    if (major === 19) pkg.dependencies['zone.js'] = '~0.15.0';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    if (major === 19) writeFileSync(join(dir, 'src/app/compat.ts'), COMPAT_19);
    // The copy resolves peers strictly: a peer range the major does not meet must fail here, not
    // pass quietly (the example's own .npmrc allows legacy peers; its links setting is kept).
    const npmrc = join(dir, '.npmrc');
    if (existsSync(npmrc)) writeFileSync(npmrc, readFileSync(npmrc, 'utf8').split('\n').filter((l) => !/^\s*legacy-peer-deps\s*=/.test(l)).join('\n'));
    const install = sh('npm', ['install', '--no-audit', '--no-fund'], dir, { allowFail: true });
    if (install.status !== 0) {
      verdict = OFFLINE.test(install.out) ? 'not run' : 'failed';
      why = OFFLINE.test(install.out) ? 'offline: npm install could not reach the registry' : `npm install failed: ${install.out.trim().split('\n').slice(-3).join(' | ')}`;
      return;
    }
    const versions = ['core', 'build'].map((p) => `${p} ${JSON.parse(readFileSync(join(dir, `node_modules/@angular/${p}/package.json`), 'utf8')).version}`).join(', ');
    const b = ng(dir, ['build'], { allowFail: true });
    if (b.status !== 0) {
      // Not DzGrid's: this Node is older than the CLI accepts. Run again with a newer Node.
      const node = /requires a minimum Node\.js version of ([^\n]+)/.exec(b.out);
      verdict = node ? 'not run' : 'failed';
      why = node ? `Node ${process.version} is older than Angular ${major}'s CLI accepts (${node[1].trim()}); run it with a newer Node` : `ng build exited ${b.status} (${versions})`;
      return;
    }
    const noisy = quiet(b.out);
    const s = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'ssr', '--json', '--dir', dir], { encoding: 'utf8', timeout: 60_000 });
    const res = s.status === 0 ? JSON.parse(s.stdout.trim().split('\n').at(-1)) : null;
    verdict = res ? 'passed' : 'failed';
    why = `${versions}; build ${noisy.length ? `with notes: ${noisy.join(' | ')}` : 'clean'}; SSR ${res ? 'host only, no rows, no error, no timer' : `failed: ${(s.stdout + s.stderr).slice(-600)}`}`;
  } catch (e) {
    // A real failure (a copy, a write, a parse, a throw): never "not run".
    verdict = 'failed';
    why = String(e?.message ?? e);
  } finally {
    console.log(`\nsmoke Angular ${major}: ${verdict}${why ? ` — ${why}` : ''}`);
    if (!flag('keep')) rmSync(dir, { recursive: true, force: true });
    if (verdict === 'failed') process.exitCode = 1;
  }
}

const commands = { build, csv, ssr, bytes, browser: browserCheck, smoke };
const run = commands[args[0]];
if (!run) {
  console.error(`usage: node scripts/example.mjs ${Object.keys(commands).join('|')}`);
  process.exitCode = 2;
} else {
  await run();
}
