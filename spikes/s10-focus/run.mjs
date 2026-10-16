// S10 — focus and inline editing against row recycling, in Chrome, Firefox and WebKit.
// Contract grid (retained row) vs naive recycling, plus DOM primitives (move / hide a focused node).
import { serve, browser, record } from '../kit.mjs';
import { cdpView } from '../s4-a11y/ax.mjs';

const site = await serve(import.meta.url);
const open_browsers = new Set();
const checks = [], observations = [], evidence = {};
const check = (engine, label, ok, detail) => { checks.push({ engine, label, ok: !!ok, ...(ok ? {} : { detail }) }); if (!ok) console.error('FAIL', engine, label, JSON.stringify(detail)); };
const observe = (engine, label, value) => observations.push({ engine, label, value });
const HUMAN_PAUSE = Number(process.env.HUMAN_PAUSE ?? 300);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(ctx, qs = '') {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url('index.html?' + qs));
  await page.waitForFunction(() => window.ready);
  return { page, errors };
}
const state = (page) => page.evaluate(() => {
  const g = window.grid, a = document.activeElement;
  const rows = g.domRows();
  const inputs = [...document.querySelectorAll('.g-body input')].map((i) => window.describe(i));
  return {
    active: window.describe(a), same: a === window.__mark, connected: !!window.__mark?.isConnected,
    value: a?.tagName === 'INPUT' ? a.value : null, caret: a?.tagName === 'INPUT' ? [a.selectionStart, a.selectionEnd] : null,
    editor: g.editor, focus: g.focus, scrollTop: Math.round(g.viewport.scrollTop),
    retained: rows.filter((r) => r[2]).map((r) => r[0]), orderOk: rows.every((r, i) => i === 0 || r[1] > rows[i - 1][1]),
    rowindexOf42: Number(document.querySelector('[data-key="r42"]')?.getAttribute('aria-rowindex')) || null,
    expectedRowindexOf42: g.indexOf('r42') + 2,
    inputs, events: window.events.slice(),
  };
});
const mark = (page) => page.evaluate(() => { window.__mark = document.activeElement; window.events.length = 0; });
const blurs = (s) => s.events.filter((e) => e.startsWith('blur') || e.startsWith('focusout'));
const scrollTo = async (page, i) => { await page.evaluate((i) => window.grid.scrollToIndex(i), i); await settle(page); };

async function runEngine(name) {
  const b = await browser(name);
  open_browsers.add(b);
  const ctx = await b.newContext();
  const ev = (evidence[name] = {});

  // ---------------- contract grid ----------------
  {
    const { page, errors } = await open(ctx);
    const C = (s) => `contract: ${s}`;
    // A. focused cell, scrolled far out and back
    await page.evaluate(() => window.grid.focusCell('r42', 'city'));
    await mark(page);
    const start = await page.evaluate(() => window.grid.viewport.scrollTop);
    const a = [];
    for (const i of [5000, 9999]) { await scrollTo(page, i); a.push(await state(page)); }
    await page.evaluate((y) => { window.grid.viewport.scrollTop = y; }, start); await settle(page);
    a.push(await state(page));
    ev.focusScroll = a.map((s) => ({ active: s.active, same: s.same, retained: s.retained, scrollTop: s.scrollTop, blurs: blurs(s).length }));
    check(name, C('focused cell survives scroll to 5000, 9999 and back to its place: same node, no blur'), a.every((s) => s.same && s.active === 'div r42/city' && blurs(s).length === 0), ev.focusScroll);
    check(name, C('while out of the window the row is retained, DOM order sane'), a[0].retained[0] === 'r42' && a[1].retained[0] === 'r42' && a[2].retained.length === 0 && a.every((s) => s.orderOk), a.map((s) => s.retained));

    // B. inline editor: typed text and caret survive scrolling; typing while off screen
    await page.evaluate(() => window.grid.startEdit('r42', 'note'));
    await page.keyboard.type('Bonjour');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(HUMAN_PAUSE);   // a person does not scroll within 1 ms of a key press
    await mark(page);
    await scrollTo(page, 5000);
    let s = await state(page);
    check(name, C('editor scrolled out: same input, "Bonjour", caret 4, no blur'), s.same && s.value === 'Bonjour' && s.caret.join() === '4,4' && blurs(s).length === 0 && s.retained[0] === 'r42', s);
    const before = s.scrollTop;
    await page.keyboard.type('!');
    await settle(page);
    s = await state(page);
    ev.typeOffscreen = { scrollTopBefore: before, scrollTopAfter: s.scrollTop, value: s.value, caret: s.caret };
    observe(name, 'typing in an off-screen editor: does the engine scroll it into view?', ev.typeOffscreen);
    check(name, C('typing in the off-screen editor works ("Bonj!our", caret 5)'), s.value === 'Bonj!our' && s.caret.join() === '5,5' && blurs(s).length === 0, s);
    await scrollTo(page, 9999); await scrollTo(page, 0);
    s = await state(page);
    check(name, C('editor back in view: same input, text and caret intact, one input in the body'), s.same && s.value === 'Bonj!our' && s.caret.join() === '5,5' && s.inputs.length === 1 && blurs(s).length === 0, s);

    // C. sort while editing (from the API: the keyboard belongs to the editor)
    await page.evaluate(() => window.grid.setSort('age', 'descending'));
    await settle(page);
    s = await state(page);
    ev.editSort = { rowindexOf42: s.rowindexOf42, expected: s.expectedRowindexOf42, retained: s.retained, value: s.value, caret: s.caret, blurs: blurs(s) };
    check(name, C('sort while editing: same input, text, caret; r42 at its new aria-rowindex; DOM order sane; no blur'),
      s.same && s.value === 'Bonj!our' && s.caret.join() === '5,5' && s.rowindexOf42 === s.expectedRowindexOf42 && s.orderOk && blurs(s).length === 0, ev.editSort);

    // D. data update while editing (city of every row, and the edited field itself from the "server")
    await page.evaluate(() => window.grid.update((r) => ({ ...r, city: r.city + '*', note: 'serveur' })));
    await settle(page);
    s = await state(page);
    const city42 = await page.evaluate(() => document.querySelector('[data-key="r42"] [data-col="city"]').textContent);
    check(name, C('update while editing: editor keeps "Bonj!our" and caret, sibling cell updated, no blur'),
      s.same && s.value === 'Bonj!our' && s.caret.join() === '5,5' && city42.endsWith('*') && blurs(s).length === 0, { s, city42 });

    // E. Enter commits, focus back on the cell
    await page.keyboard.press('Enter');
    await settle(page);
    s = await state(page);
    const text42 = await page.evaluate(() => document.querySelector('[data-key="r42"] [data-col="note"]').textContent);
    ev.enterClose = { active: s.active, events: s.events, text42 };
    check(name, C('Enter: editor closed, value committed, focus on cell r42/note, only the intended blur of the input'),
      !s.editor && s.active === 'div r42/note' && text42 === 'Bonj!our' && blurs(s).filter((e) => e.includes('input')).length === 2 && blurs(s).length === 2, ev.enterClose);

    // F. Escape cancels, focus back on the cell
    await page.keyboard.press('F2');
    await page.keyboard.type('zzz');
    await page.waitForTimeout(HUMAN_PAUSE);
    await scrollTo(page, 8000);
    await page.keyboard.press('Escape');
    await settle(page);
    s = await state(page);
    const text42b = await page.evaluate(() => document.querySelector('[data-key="r42"] [data-col="note"]').textContent);
    check(name, C('Escape (editor scrolled out): cancelled, focus on cell r42/note, still retained'), !s.editor && s.active === 'div r42/note' && text42b === 'Bonj!our' && s.retained[0] === 'r42', { s, text42b });

    // G. Tab order: a retained cell is the grid's only tab stop
    await page.keyboard.press('Tab');
    s = await state(page);
    const outTo = s.active;
    await page.keyboard.press('Shift+Tab');
    await settle(page);
    s = await state(page);
    ev.tabRetained = { outTo, back: s.active, scrollTopAfterShiftTab: s.scrollTop, retained: s.retained };
    check(name, C('Tab from retained cell leaves the grid; Shift+Tab returns to r42/note'), outTo === 'input#after' && s.active === 'div r42/note', ev.tabRetained);
    observe(name, 'Shift+Tab onto a retained off-screen cell: scrollTop after (engine scrolls it into view?)', { scrollTopAfterShiftTab: s.scrollTop, retainedAfter: s.retained });
    await page.focus('#before'); await page.keyboard.press('Tab'); await settle(page);
    s = await state(page);
    check(name, C('Tab from the field before the grid lands on r42/note'), s.active === 'div r42/note', s.active);

    // H. Tab out of an open editor: leaves the grid, blur commits (intended)
    await page.keyboard.press('Enter');
    await page.keyboard.press('End');
    await page.keyboard.type('+');
    await page.keyboard.press('Tab');
    await settle(page);
    s = await state(page);
    const text42c = await page.evaluate(() => document.querySelector('[data-key="r42"] [data-col="note"]').textContent);
    check(name, C('Tab out of the editor: focus leaves, blur commits "Bonj!our+", editor closed'), s.active === 'input#after' && !s.editor && text42c === 'Bonj!our+', { s, text42c });

    // I. the focused row is filtered out: focus goes to the nearest row at that instant (intended move)
    await page.evaluate(() => { window.grid.setSort('age', null); window.grid.focusCell('r42', 'city'); });
    await page.evaluate(() => window.grid.setFilter((r) => r.id !== 'r42'));
    await settle(page);
    s = await state(page);
    check(name, C('focused row filtered out: focus on the row now at its index (r43/city)'), s.active === 'div r43/city', s.active);
    check(name, C('no page errors'), errors.length === 0, errors);
    await page.close();
  }

  // ---------------- naive recycling (no retained row) ----------------
  {
    const { page, errors } = await open(ctx, 'retain=0');
    await page.evaluate(() => window.grid.focusCell('r42', 'city'));
    await mark(page);
    await scrollTo(page, 5000);
    let s = await state(page);
    await scrollTo(page, 0);
    const back = await state(page);
    ev.naiveFocus = { away: { active: s.active, events: s.events }, back: { active: back.active, same: back.same } };
    observe(name, 'naive: focused cell recycled — activeElement and events away, and after scrolling back', ev.naiveFocus);
    check(name, 'naive: focus is lost when the row is recycled (the bug the contract prevents)', s.active.startsWith('body') || !s.same, ev.naiveFocus);
    await page.evaluate(() => window.grid.startEdit('r42', 'note'));
    await page.keyboard.type('Bonjour');
    await mark(page);
    await scrollTo(page, 5000);
    s = await state(page);
    await scrollTo(page, 0);
    const back2 = await state(page);
    ev.naiveEdit = { away: { active: s.active, events: s.events, inputs: s.inputs }, back: { active: back2.active, inputs: back2.inputs, editor: back2.editor } };
    observe(name, 'naive: editor row recycled — where the input ends up', ev.naiveEdit);
    check(name, 'naive: the editor loses focus when its row is recycled', !s.same || s.active.startsWith('body'), ev.naiveEdit);
    observe(name, 'naive: page errors', errors);
    await page.close();
  }

  // ---------------- DOM primitives ----------------
  {
    const page = await ctx.newPage();
    await page.goto(site.url('dom-probe.html'));
    await page.waitForFunction(() => window.ready);
    const ops = ['insertBefore', 'appendChild', 'moveBefore', 'removeThenInsert', 'translateFarAway', 'rebindSiblingsAround',
      'displayNone', 'visibilityHidden', 'contentVisibilityHidden', 'contentVisibilityAuto', 'inert', 'ariaHidden'];
    const out = {};
    for (const op of ops) for (const withInput of [false, true]) {
      const r = await page.evaluate(([op, w]) => window.probe(op, w), [op, withInput]);
      if (name === 'chrome' && !withInput && r.result !== 'unsupported') r.ax = (await cdpView(page, '#row1')).target;
      out[`${op}${withInput ? '+input' : ''}`] = r;
    }
    ev.primitives = out;
    const kept = (k) => out[k].focusable;
    check(name, 'primitive: translating the focused row far away keeps focus (cell and input+caret)', kept('translateFarAway') && kept('translateFarAway+input') && out['translateFarAway+input'].caret.join() === '4,4', [out.translateFarAway, out['translateFarAway+input']]);
    check(name, 'primitive: moving the siblings around the focused row keeps focus', kept('rebindSiblingsAround') && kept('rebindSiblingsAround+input'), out.rebindSiblingsAround);
    check(name, 'primitive: display:none on the focused row loses focus', !kept('displayNone'), out.displayNone);
    await page.close();
  }
  await b.close(); open_browsers.delete(b);
}

const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox', 'webkit'];
// One browser at a time, closed even on failure (runEngine closes it on success; this catches throws).
try { for (const e of engines) await runEngine(e); } finally { for (const b of open_browsers) await b.close().catch(() => {}); await site.close(); }
const failed = checks.filter((c) => !c.ok);
record(import.meta.url, { spike: 'S10', engines, passed: checks.length - failed.length, failed: failed.length, checks, observations, evidence });
process.exit(failed.length ? 1 : 0);
