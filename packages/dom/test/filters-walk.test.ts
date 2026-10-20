// A random walk over the floating row (step 12): typing with pauses of random length, Enter,
// Escape, leaving the box, the host's filter.set / filter.column / query.set, sort, hiding and
// showing a column, a locale switch, a server answering late or failing, then destroy.
// Seeded: a failure prints its seed and the steps that led there.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { localeCtx, makeQuery, readNumber, type ColumnOrGroup, type LocaleCtx } from '@dzgrid/core';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, make, MESSAGES, type R } from './support-filters.js';

afterEach(cleanup);

type Lang = { readonly locale: string; readonly numerals: 'latn' | 'locale'; readonly messages: unknown };
const LANGS: Lang[] = [
  { locale: 'en-US', numerals: 'latn', messages: MESSAGES },
  { locale: 'fr-FR', numerals: 'latn', messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } },
  { locale: 'ar-DZ', numerals: 'latn', messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } } },
  { locale: 'ar-SA', numerals: 'locale', messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } } },
];
const AI = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + Number(d)));
const TEXTS = ['', 'b', 'bo', 'bob1', 'ann', 'zz', ' ', 'B'];
const NUMS = ['', '-', '1', '12', '1,5', '1.5', '-5', '12%', '1 234', '1.234', '1,234', 'abc', AI('7'), AI('1') + '\u066B' + AI('5'), '\u2212' + '3', '+4', '5x'];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

/** What the user means by a box text: a filter, null (empty) or 'bad' (unreadable). */
function meaning(col: 'name' | 'n', text: string, ctx: LocaleCtx): object | null | 'bad' {
  if (col === 'name') return text ? { type: 'text', op: 'contains', value: text } : null;
  if (!text.trim()) return null;
  const v = readNumber(text, ctx);
  return v === null ? 'bad' : { type: 'number', op: 'equals', value: v };
}

const COLS = (hidden: boolean): ColumnOrGroup<R>[] => [
  { id: 'name', header: 'Name', hidden },
  { id: 'n', header: 'N', type: 'number' },
];

function walk(seed: number, server: boolean, steps = 60) {
  const r = rng(seed);
  const log: string[] = [];
  let lang = LANGS[0]!;
  let ctx = localeCtx(lang);
  const t = make({ server, columns: COLS(false) });
  if (server) t.f.answer(['a', 'b'], { total: 2 });
  const PAUSE = server ? 300 : 150;
  let hidden = false;
  // Per column: what the user typed and not yet applied, read when typed (once, in the locale of
  // the moment), and when the pause ends. An unreadable text applies nothing; one that reads as
  // the filter in force has nothing to apply, and is not pending.
  const pending: Record<string, { want: object | null | 'bad'; at: number } | null> = { name: null, n: null };
  let now = 0;
  let answered = 0;
  const fail = (msg: string) => { throw new Error(`seed ${seed} ${server ? 'server' : 'browser'}: ${msg}\n  ${log.join('\n  ')}`); };
  const model = (col: string) => t.g.kernel.query.filter[col] ?? null;

  /** The user's pending text for `col` applies now; returns what the model must hold after. */
  const commit = (col: 'name' | 'n') => {
    const p = pending[col];
    if (!p) return;
    pending[col] = null;
    const before = model(col);
    const want = p.want === 'bad' ? before : p.want;
    return { before, want };
  };

  const check = (what: string, expected?: Record<string, object | null>) => {
    const f = t.g.kernel.query.filter;
    for (const [col, v] of Object.entries(f)) {
      // Never an inactive filter stored by the boxes.
      if (v && (v as { type: string }).type === 'text' && !(v as { value: string }).value) fail(`${what}: empty text filter on ${col}`);
      if (v && (v as { type: string }).type === 'number' && !Number.isFinite((v as { value: number }).value)) fail(`${what}: non-finite number on ${col}`);
    }
    if (expected) for (const [col, v] of Object.entries(expected)) {
      if (JSON.stringify(model(col)) !== JSON.stringify(v)) fail(`${what}: ${col} is ${JSON.stringify(model(col))}, want ${JSON.stringify(v)}`);
    }
    for (const col of ['name', 'n'] as const) {
      const box = t.input(col);
      if (!box) continue;
      // The box's text reads as the model unless the user typed and it is not applied yet; or it
      // is unreadable, and marked so.
      if (!pending[col]) {
        const m = meaning(col, box.value, ctx);
        if (m === 'bad' ? box.getAttribute('aria-invalid') !== 'true' : JSON.stringify(m) !== JSON.stringify(model(col))) fail(`${what}: ${col} box "${box.value}" reads ${JSON.stringify(m)}, model ${JSON.stringify(model(col))}`);
      }
      // aria-invalid: never while a pause runs.
      if (pending[col] && box.getAttribute('aria-invalid') === 'true') fail(`${what}: ${col} marked invalid during the pause`);
      if (!pending[col] && box.getAttribute('aria-invalid') === 'true' && meaning(col, box.value, ctx) !== 'bad') fail(`${what}: ${col} marked invalid but "${box.value}" reads`);
    }
  };

  /** Focus `col`'s box; the focus leaving the other box applies its pending edit. */
  const focusBox = (col: 'name' | 'n') => {
    const other = col === 'name' ? 'n' : 'name';
    const ob = t.input(other);
    const w = ob && t.g && document.activeElement === ob ? commit(other) : undefined;
    t.input(col)!.focus();
    if (w) check(`focus leaves ${other}`, { [other]: w.want });
  };

  const advance = (ms: number) => {
    const end = now + ms;
    const due = (['name', 'n'] as const).filter((c) => pending[c] && pending[c]!.at <= end).sort((a, b) => pending[a]!.at - pending[b]!.at);
    const want: Record<string, object | null> = {};
    const calls = t.f.calls.length;
    for (const c of due) {
      want[c] = commit(c)!.want;
    }
    const held = Object.fromEntries((['name', 'n'] as const).filter((c) => pending[c]).map((c) => [c, model(c)]));
    vi.advanceTimersByTime(ms);
    now = end;
    log.push(`advance ${ms}`);
    if (server && t.f.calls.length - calls > due.length) fail(`advance: ${t.f.calls.length - calls} requests for ${due.length} pauses`);
    // A column whose pause has not ended is untouched.
    check(`advance ${ms}`, { ...held, ...want });
    for (const c of due) {
      const box = t.input(c);
      if (box && meaning(c, box.value, ctx) === 'bad' && box.getAttribute('aria-invalid') !== 'true') fail(`advance: ${c} "${box.value}" unreadable after its pause, not marked`);
    }
  };

  for (let i = 0; i < steps; i++) {
    const k = r.int(100);
    const col = r.pick(['name', 'n'] as const);
    const box = t.input(col);
    if (k < 35 && box) {
      const text = col === 'name' ? r.pick(TEXTS) : r.pick(NUMS);
      log.push(`type ${col} ${JSON.stringify(text)}`);
      focusBox(col);
      t.type(col, text);
      const m = meaning(col, text, ctx);
      pending[col] = JSON.stringify(m) === JSON.stringify(model(col)) ? null : { want: m, at: now + PAUSE };
      check(`type ${col}`);
      if (box.getAttribute('aria-invalid') === 'true') fail(`type: marked while typing`);
    } else if (k < 55) advance(r.pick([10, 50, 149, 150, 151, 299, 300, 400, 1000]));
    else if (k < 65 && box && pending[col]) {
      const how = r.pick(['Enter', 'Escape', 'blur'] as const);
      log.push(`${how} ${col}`);
      focusBox(col);
      const w = commit(col)!;
      const calls = t.f.calls.length;
      if (how === 'blur') box.blur(); else t.key(box, how);
      if (server && t.f.calls.length - calls > 1) fail(`${how}: ${t.f.calls.length - calls} requests`);
      check(how, { [col]: w.want });
      if (col === 'n' && meaning(col, box.value, ctx) === 'bad' && box.getAttribute('aria-invalid') !== 'true') fail(`${how}: unreadable "${box.value}" not marked`);
    } else if (k < 75) {
      // The host. An unreadable number pending applies nothing after it.
      const which = r.int(4);
            if (which === 0) t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
      else if (which === 1) t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: r.pick(['bob', 'a', 'zz']) } }, 'api');
      else if (which === 2) t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: r.pick([4, -1.25, 1234.5, 0.5]) } }, 'api');
      else t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'api');
      // Every filter written at once (filter.set, query.set: a clear) drops what waits (step 21
      // review); an unreadable number has nothing waiting (its text stays, judged as before).
      if (which === 0 || which === 3) for (const c of ['name', 'n'] as const) if (pending[c]?.want !== 'bad') pending[c] = null;
      log.push(`host ${which}`);
      check(`host ${which}`);
    } else if (k < 80) {
      t.g.kernel.dispatch({ type: 'sort.toggle', column: r.pick(['name', 'n']), multi: false }, 'user');
      log.push('sort');
      check('sort');
    } else if (k < 86) {
      // Hiding a column takes its cell away: its pending edit applies.
      hidden = !hidden;
      log.push(hidden ? 'hide name' : 'show name');
      const w = hidden ? commit('name') : undefined;
      t.g.update({ columns: COLS(hidden) } as never);
      check('hide/show', w ? { name: w.want } : undefined);
    } else if (k < 90) {
      // A locale switch: a pending text stays read in the language it was typed in; the boxes
      // with nothing pending show the filter in the new one.
      lang = r.pick(LANGS);
      ctx = localeCtx(lang);
      t.g.update({ locale: lang.locale, numerals: lang.numerals, messages: lang.messages } as never);
      log.push(`locale ${lang.locale}`);
      check('locale');
    } else if (server && k < 97 && t.f.calls.length > answered) {
      answered = t.f.calls.length;
      if (r.int(4) === 0) { t.f.fail(new Error('down')); log.push('fail'); }
      else { t.f.answer(['a'], { total: 1 }); log.push('answer'); }
      check('answer');
    }
  }
  // Destroy with anything pending: nothing dispatched after, no request after.
  const spy = vi.spyOn(t.g.kernel, 'dispatch');
  const calls = t.f.calls.length;
  t.g.destroy();
  vi.advanceTimersByTime(5000);
  if (spy.mock.calls.length) fail('dispatch after destroy');
  if (t.f.calls.length !== calls) fail('request after destroy');
}

describe('a random walk over the floating row', () => {
  it('in the browser, 150 seeds', () => {
    vi.useFakeTimers();
    for (let s = 1; s <= 150; s++) {
      walk(s, false);
      cleanup();
      vi.useFakeTimers();
    }
  });
  it('on a server answering late or failing, 150 seeds', () => {
    vi.useFakeTimers();
    for (let s = 1; s <= 150; s++) {
      walk(s, true);
      cleanup();
      vi.useFakeTimers();
    }
  });
});
