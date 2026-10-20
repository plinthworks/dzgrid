// A random walk over the filter popup (step 13) together with the floating row: opening by the
// button, Alt+ArrowDown (header and floating cell), openFilter and the floating summary; closing
// by Apply, Enter, Escape, the button again, closeFilter; operator, values (en, fr, ar, Arabic-Indic
// digits, between), radios, Clear, a pointer down outside; the floating box typed on the same
// column; the host's filter.column / filter.set / query.set; hiding, redefining, changing kind,
// scrolling a column out; direction and locale; a server answering late or failing; destroy.
// Seeded: a failure prints its seed and the steps that led there.
import { describe, it, afterEach, expect, vi } from 'vitest';
import { localeCtx, makeQuery, readNumber, type ColumnOrGroup, type LocaleCtx } from '@dzgrid/core';
import { canonical } from '@dzgrid/core/internal';
import { definePart, type SlotContext } from '../src/part.js';
import { filters } from '../src/filters.js';
import { textForm, numberForm, booleanForm } from '../src/filters/forms.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import type { Part } from '../src/part.js';
import { cleanup, make, MESSAGES, type R } from './support-filters.js';

afterEach(cleanup);
const SEEDS = Number(process.env['WALK_SEEDS'] ?? 120);
/** One seed alone (`WALK_SEED=465`), to replay a failure. */
const ONLY = process.env['WALK_SEED'] ? Number(process.env['WALK_SEED']) : 0;
type FC = SlotContext['filter'];
type Lang = { readonly locale: string; readonly numerals: 'latn' | 'locale'; readonly messages: { text: Record<string, string> } };
const LANGS: Lang[] = [
  { locale: 'en-US', numerals: 'latn', messages: MESSAGES as never },
  { locale: 'fr-FR', numerals: 'latn', messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } } as never },
  { locale: 'ar-DZ', numerals: 'latn', messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } } as never },
  { locale: 'ar-SA', numerals: 'locale', messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } } as never },
];
const AI = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + Number(d)));
const TEXTS = ['', 'b', 'bob1', 'ann', 'zz', ' '];
const NUMS = ['', '-', '1', '12', '1,5', '1.5', '-5', '12%', '1 234', '1.234', 'abc', AI('7'), AI('1') + '٫' + AI('5'), '5x'];
const TOPS = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank'];
const NOPS = ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank'];
const COLS = ['name', 'n', 'b'] as const;
type Col = (typeof COLS)[number];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

/** Wraps a built-in form to count mounts and destroys. */
function counted(p: Part<FC>, n: { mounts: number; destroys: number }): Part<FC> {
  return {
    mount(host, c) {
      n.mounts++;
      const h = p.mount(host, c);
      return { ...h, destroy() { n.destroys++; h?.destroy?.(); } };
    },
  };
}

function walk(seed: number, server: boolean, steps = 70) {
  const r = rng(seed);
  const log: string[] = [];
  let lang = LANGS[0]!;
  let ctx: LocaleCtx = localeCtx(lang);
  const n = { mounts: 0, destroys: 0 };
  const feature = filters({ floating: true }) as ReturnType<typeof filters>;
  let kindSwap = false;
  let hidden = false;
  let rtl = false;
  const columns = (): ColumnOrGroup<R>[] => [
    { id: 'name', header: 'Name', width: 100, hidden, ...(kindSwap && { type: 'number' }) },
    { id: 'n', header: 'N', type: 'number', width: 100 },
    { id: 'b', header: 'B', type: 'boolean', width: 100, value: (row: R) => row.n % 2 === 0 },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100, filter: false as const })),
  ];
  const t = make({
    server, inline: 400, columns: columns(), features: [feature],
    settings: { parts: { 'filter.text': definePart('filter', counted(textForm, n)), 'filter.number': definePart('filter', counted(numberForm, n)), 'filter.boolean': definePart('filter', counted(booleanForm, n)) } },
  });
  if (server) t.f.answer(['a', 'b'], { total: 2 });
  let answered = t.f.calls.length;
  // The column the popup is open on (as the walk believes), and whether the box wrote last.
  let openOn: Col | null = null;
  let boxLast = false;
  /** The locale each popup field was typed or written in (the form reads it in that one, B4). */
  let fctx = { a: ctx, b: ctx };
  /** The last form change was Clear or a radio: a null draft removes the filter; else it keeps it (L1). */
  let clearedLast = false;
  // Scrolled out (all three filterable columns out of the column window), or home. Read from the
  // grid: closing the popup gives the focus back, which may scroll its column into view again.
  const far = () => t.box.scrollInline >= 700;
  const home = () => t.box.scrollInline === 0;
  let now = 0;
  let boxAt = -1e9;
  const fail = (msg: string) => { throw new Error(`seed ${seed} ${server ? 'server' : 'browser'}: ${msg}\n  ${log.join('\n  ')}`); };
  const model = () => t.g.kernel.query.filter as Record<string, unknown>;
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const header = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${c}"]`);
  const kindOf = (c: Col) => (c === 'b' ? 'boolean' : c === 'n' || kindSwap ? 'number' : 'text');

  /** What the popup's form says, read as the user means it now: a filter, null, 'bad', or 'summary'. */
  const read = (c: Col): unknown => {
    if (!q('.dzg-fop') && !q('[role=radiogroup]')) return 'summary';
    if (!q<HTMLElement>('.dzg-fop')?.isConnected && !q('[role=radiogroup]')?.isConnected) return 'summary';
    if (kindOf(c) === 'boolean') {
      const i = [...popup()!.querySelectorAll<HTMLInputElement>('input[type=radio]')].findIndex((x) => x.checked);
      return i > 0 ? { type: 'boolean', value: i === 1 } : null;
    }
    const op = q<HTMLSelectElement>('.dzg-fop')!.value;
    const a = q<HTMLInputElement>('.dzg-fval')!.value;
    const b = q<HTMLInputElement>('.dzg-fto')!.value;
    const type = kindOf(c);
    if (op === 'blank' || op === 'notBlank') return { type, op };
    if (type === 'text') return a ? { type, op, value: a } : null;
    const rd = (s: string, at: LocaleCtx) => (s.trim() ? readNumber(s, at) : undefined);
    const x = rd(a, fctx.a);
    const y = op === 'between' ? rd(b, fctx.b) : 0;
    if (x === null || y === null) return 'bad';
    if (x === undefined || y === undefined) return null;
    return op === 'between' ? { type, op, value: x, valueTo: y } : { type, op, value: x };
  };
  const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null);

  const check = (what: string) => {
    log.push(what);
    const m = model();
    // Never an inactive filter stored.
    for (const [c, v] of Object.entries(m) as [string, { type: string; op?: string; value?: unknown; valueTo?: unknown }][]) {
      if (v.type === 'text' && v.op !== 'blank' && v.op !== 'notBlank' && !v.value) fail(`${what}: empty text filter on ${c}`);
      if (v.type === 'number' && v.op !== 'blank' && v.op !== 'notBlank' && (!Number.isFinite(v.value) || (v.op === 'between' && !Number.isFinite(v.valueTo)))) fail(`${what}: inactive number filter on ${c} ${JSON.stringify(v)}`);
      if (v.type === 'boolean' && typeof v.value !== 'boolean') fail(`${what}: boolean filter without a value`);
    }
    // One popup at most; its parts mounted once.
    const pops = t.host.querySelectorAll('.dzg-popup').length;
    if (pops > 1) fail(`${what}: ${pops} popups`);
    if (n.mounts - n.destroys !== pops) fail(`${what}: mounts ${n.mounts}, destroys ${n.destroys}, popups ${pops}`);
    if (!pops) openOn = null;
    // aria-expanded: true only on the open column's openers; its header button says so.
    for (const e of t.host.querySelectorAll<HTMLElement>('[aria-expanded=true]')) {
      const c = e.closest<HTMLElement>('[data-col]')?.dataset['col'];
      if (!pops || c !== openOn) fail(`${what}: aria-expanded true on ${c} (open on ${openOn})`);
    }
    if (pops && openOn) {
      const b = header(openOn)?.querySelector(':scope > .dzg-fbtn');
      if (b && b.getAttribute('aria-expanded') !== 'true') fail(`${what}: ${openOn}'s button not expanded`);
      if (!popup()!.contains(document.activeElement)) fail(`${what}: focus outside the open popup (${document.activeElement?.className})`);
    }
    // The header's mark and name follow the model.
    const tmpl = lang.messages.text['header.withFilter']!.replace('{header}', '');
    for (const c of COLS) {
      const h = header(c);
      if (!h) continue;
      const on = c in m;
      if (h.hasAttribute('data-dzg-filtered') !== on) fail(`${what}: ${c} mark ${!on}, model ${on}`);
      if ((h.getAttribute('aria-label') ?? '').includes(tmpl) !== on) fail(`${what}: ${c} name "${h.getAttribute('aria-label')}", filtered ${on}`);
      if ((h.getAttribute('aria-label') ?? '').split(tmpl).length > 2) fail(`${what}: ${c} name wrapped twice`);
    }
  };

  /** The popup's values as shown: a change not typed by the walk is a write, in the locale of now. */
  const values = () => [q<HTMLInputElement>('.dzg-fval')?.value, q<HTMLInputElement>('.dzg-fto')?.value].join('|');
  /** Runs `act`; a popup that closed leaves the focus in the grid, never on the body. */
  const step = (what: string, act: () => void, o: { quiet?: boolean; typing?: boolean } = {}) => {
    const was = !!popup();
    const shown = values();
    const calls = t.f.calls.length;
    act();
    if (!o.typing && popup() && values() !== shown) fctx = { a: ctx, b: ctx };
    if (server && o.quiet && t.f.calls.length !== calls) fail(`${what}: ${t.f.calls.length - calls} request(s) without Apply`);
    if (was && !popup()) {
      if (document.activeElement === document.body || !t.host.contains(document.activeElement)) fail(`${what}: focus lost to ${document.activeElement?.tagName}`);
    }
    check(what);
  };

  const opened = (c: Col, how: string) => {
    if (popup()) {
      openOn = c;
      if (popup()!.getAttribute('aria-label') !== lang.messages.text['filter.popupLabel']!.replace('{column}', c === 'name' ? 'Name' : c.toUpperCase())) fail(`${how}: popup named "${popup()!.getAttribute('aria-label')}"`);
      boxLast = false;
      fctx = { a: ctx, b: ctx };
      clearedLast = false;
    }
  };

  for (let i = 0; i < steps; i++) {
    const k = r.int(100);
    const c = r.pick(COLS);
    const open = popup();
    if (!open && k < 25) {
      const how = r.pick(['button', 'altHeader', 'altFloating', 'api', 'summary'] as const);
      const opener = how === 'button' ? header(c)?.querySelector(':scope > .dzg-fbtn') : how === 'api' ? header(c) : how === 'summary' ? t.cell(c)?.querySelector('button.dzg-fsum') : how === 'altHeader' ? header(c) : t.cell(c);
      step(`open ${c} by ${how}`, () => {
        if (how === 'button') header(c)?.querySelector<HTMLButtonElement>(':scope > .dzg-fbtn')?.click();
        else if (how === 'api') feature.openFilter(c);
        else if (how === 'summary') t.cell(c)?.querySelector<HTMLButtonElement>('button.dzg-fsum')?.click();
        else {
          const at = how === 'altHeader' ? header(c) : t.cell(c);
          if (!at) return;
          at.focus();
          t.key(at, 'ArrowDown', { altKey: true });
        }
        opened(c, how);
      });
      // Every opener there opens (each of the three columns has a popup); none does while the
      // columns are scrolled out (D6: a focused header kept out of view leaves the key alone).
      if (opener && home() && !popup()) fail(`open ${c} by ${how}: nothing opened`);
      if (far() && popup()) fail(`open ${c} by ${how}: opened out of the column window`);
      if (far() && opener && how.startsWith('alt') && document.activeElement !== opener) fail(`open ${c} by ${how}: the focus left the cell`);
    } else if (open && openOn && k < 45) {
      // Inside the form.
      const col = openOn;
      const kind = kindOf(col);
      const sel = q<HTMLSelectElement>('.dzg-fop');
      const what = kind === 'boolean' ? r.pick(['radio', 'clear'] as const) : r.pick(['op', 'value', 'value', 'to', 'clear'] as const);
      step(`${what} in ${col}`, () => {
        clearedLast = what === 'clear' || what === 'radio';
        if (what === 'clear') return q<HTMLButtonElement>('.dzg-fclr')!.click();
        if (what === 'radio') {
          const rs = [...popup()!.querySelectorAll<HTMLInputElement>('input[type=radio]')];
          if (!rs.length) return;
          const x = rs[r.int(3)]!;
          x.checked = true;
          x.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        if (!sel?.isConnected) return;
        if (what === 'op') {
          sel.value = r.pick(kind === 'number' ? NOPS : TOPS);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const f = q<HTMLInputElement>(what === 'to' ? '.dzg-fto' : '.dzg-fval')!;
        f.value = kind === 'number' ? r.pick(NUMS) : r.pick(TEXTS);
        log.push(`  text ${JSON.stringify(f.value)}`);
        f.dispatchEvent(new InputEvent('input', { bubbles: true }));
        fctx = { ...fctx, [what === 'to' ? 'b' : 'a']: ctx };
        // In the browser the popup's edit replaces the box's pending one when it sends one (a text
        // that filters, other than the filter in force); else it drops only its own. On a server it is a draft.
        const w = read(col);
        if (!server && w !== null && w !== 'bad' && w !== 'summary' && !same(w, model()[col])) boxLast = false;
      }, { quiet: true, typing: true });
    } else if (open && openOn && k < 60) {
      const col = openOn;
      const how = r.pick(['apply', 'enter', 'escape', 'button', 'closeFilter', 'outside'] as const);
      const before = model()[col];
      const want = read(col);
      const calls = t.f.calls.length;
      step(`${how} on ${col} (form ${JSON.stringify(want)})`, () => {
        if (how === 'apply') q<HTMLButtonElement>('.dzg-fapply')!.click();
        else if (how === 'enter') {
          const at = q<HTMLElement>('.dzg-fval') ?? q<HTMLElement>('input[type=radio]');
          if (at?.isConnected && !at.closest('[hidden]')) t.key(at, 'Enter'); else q<HTMLButtonElement>('.dzg-fapply')!.click();
        } else if (how === 'escape') t.key(popup()!.contains(document.activeElement) ? (document.activeElement as HTMLElement) : popup()!, 'Escape');
        else if (how === 'button') header(col)?.querySelector<HTMLButtonElement>(':scope > .dzg-fbtn')?.click();
        else if (how === 'closeFilter') feature.closeFilter();
        else {
          // Nothing focusable pressed: the focus goes back to the anchor once the press is over (Q4).
          document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          vi.advanceTimersByTime(0);
        }
      }, { quiet: how !== 'apply' && how !== 'enter' && !boxLast });
      const sent = t.f.calls.length - calls;
      // A pointer down outside closes it as Escape does (owner Q4, step 18).
      const commits = how === 'apply' || how === 'enter';
      if (commits && want === 'bad') {
        if (!popup()) fail(`${how}: an unreadable number closed it`);
        if (!same(model()[col], before)) fail(`${how}: an unreadable number changed the model`);
        if (sent) fail(`${how}: an unreadable number was sent`);
        if (!popup()!.querySelector('[aria-invalid=true]')?.contains(document.activeElement)) fail(`${how}: focus not on the unreadable field`);
        continue;
      }
      if (popup()) fail(`${how}: still open`);
      // L1: a null draft not from Clear or a radio cannot filter yet: the filter in force stays.
      const kept = want === null && !clearedLast;
      const expected = kept ? before : want;
      if (commits && want !== 'summary' && !(kept && boxLast)) {
        if (!same(model()[col], expected)) fail(`${how}: model ${JSON.stringify(model()[col])}, form said ${JSON.stringify(want)}${kept ? ' (kept)' : ''}`);
        // A filter of another kind than the column's (its kind swapped) is not on the wire: removing it asks nothing.
        const wired = !before || (before as { type: string }).type === kindOf(col);
        if (server && wired && sent !== (same(before, expected) ? 0 : 1)) fail(`${how}: ${sent} requests (before ${JSON.stringify(before)})`);
      }
      if (!commits && server && !boxLast && !same(model()[col], before)) fail(`${how}: a server draft closed without Apply changed the model`);
      if (!commits && !server && !boxLast && want !== 'summary' && !same(model()[col], want === 'bad' ? before : expected)) fail(`${how}: closing in the browser left ${JSON.stringify(model()[col])}, form said ${JSON.stringify(want)}${kept ? ' (kept)' : ''}`);
      if (commits && want === 'summary' && !same(model()[col], before)) fail(`${how}: Apply on the summary changed the model`);
    } else if (k < 62 && !open) {
      // A floating summary's Clear.
      step(`summary clear ${c}`, () => t.cell(c)?.querySelector<HTMLButtonElement>('.dzg-fclear')?.click());
    } else if (k < 70) {
      // The floating box, possibly on the popup's column (the box is behind a modal: a script types).
      const box = t.input(c);
      if (!box) continue;
      step(`box ${c}`, () => {
        box.value = c === 'name' ? r.pick(TEXTS) : r.pick(NUMS);
        log.push(`  text ${JSON.stringify(box.value)}`);
        box.dispatchEvent(new InputEvent('input', { bubbles: true }));
        if (c === openOn) boxLast = true, boxAt = now;
      });
    } else if (k < 80) {
      const ms = r.pick([10, 150, 151, 300, 1000]);
      step(`advance ${ms}`, () => vi.advanceTimersByTime(ms));
      now += ms;
      if (now - boxAt >= (server ? 300 : 150)) boxLast = false;
    } else if (k < 86) {
      const which = r.int(5);
      step(`host ${which}`, () => {
        if (which === 0) t.g.kernel.dispatch({ type: 'filter.set', filter: {} }, 'api');
        else if (which === 1 && !kindSwap) t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: r.pick(TOPS.slice(0, 6)) as never, value: r.pick(['bob', 'a', 'zz']) } }, 'api');
        else if (which === 2) t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: r.pick([{ type: 'number', op: 'equals', value: 4 }, { type: 'number', op: 'between', value: -1.25, valueTo: 1234.5 }]) }, 'api');
        else if (which === 3) t.g.kernel.dispatch({ type: 'filter.column', column: 'b', filter: { type: 'boolean', value: r.int(2) === 0 } }, 'api');
        else t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: t.g.kernel.query.sort }) }, 'api');
      });
    } else if (k < 92) {
      const which = r.int(5);
      step(`columns ${which}`, () => {
        if (which === 0) hidden = !hidden;
        else if (which === 1) kindSwap = !kindSwap;
        else if (which === 2) return t.scrollInline(home() ? 700 : 0);
        else if (which === 3) { rtl = !rtl; t.g.update({ direction: rtl ? 'rtl' : 'ltr' } as never); return; }
        t.g.update({ columns: columns() } as never);
      });
      if ((which === 1 || which === 0) && popup() && openOn === 'name') fail('the popup stayed open on a column hidden or of another kind');
      if (which === 3 && popup()) fail('the popup stayed open across a direction change');
    } else if (k < 96) {
      lang = r.pick(LANGS);
      ctx = localeCtx(lang);
      step(`locale ${lang.locale}`, () => t.g.update({ locale: lang.locale, numerals: lang.numerals, messages: lang.messages } as never));
      if (popup() && openOn && popup()!.getAttribute('aria-label') !== lang.messages.text['filter.popupLabel']!.replace('{column}', openOn === 'name' ? 'Name' : (openOn as Col).toUpperCase())) fail('popup not renamed after a locale change');
    } else if (server && t.f.calls.length > answered) {
      answered = t.f.calls.length;
      const bad = r.int(4) === 0;
      step(bad ? 'fail' : 'answer', () => (bad ? t.f.fail(new Error('down')) : t.f.answer(['a'], { total: 1 })));
    }
  }
  // Destroy with the popup possibly open and edits pending: nothing dispatched or asked after.
  const spy = vi.spyOn(t.g.kernel, 'dispatch');
  const calls = t.f.calls.length;
  t.g.destroy();
  vi.advanceTimersByTime(5000);
  // Nothing at all: not even the focus going back to a header as the popup closes with the grid.
  if (spy.mock.calls.length) fail('dispatch at or after destroy: ' + JSON.stringify(spy.mock.calls));
  if (t.f.calls.length !== calls) fail('request after destroy');
  if (n.mounts !== n.destroys) fail(`after destroy: mounts ${n.mounts}, destroys ${n.destroys}`);
  if (t.host.querySelector('.dzg-popup')) fail('a popup survived destroy');
}

describe('a random walk over the filter popup and the floating row', () => {
  it(`in the browser, ${SEEDS} seeds`, () => {
    for (let s = ONLY || 1; s <= (ONLY || SEEDS); s++) {
      vi.useFakeTimers();
      walk(s, false);
      cleanup();
    }
  }, 60_000);
  it(`on a server answering late or failing, ${SEEDS} seeds`, () => {
    for (let s = ONLY || 1; s <= (ONLY || SEEDS); s++) {
      vi.useFakeTimers();
      walk(s, true);
      cleanup();
    }
  }, 60_000);
});

// ---- Step 14 part B: the date forms on tzslot, walked ----
// A day column and an instant column, a relative state, a spy on tzslot's three constructors
// capturing each widget's options; actions: open, close (Apply, Enter on a typed moment, Escape,
// closeFilter), the operator, a pick through the captured onChange (real Temporal values), half a
// period, a cleared moment, a shortcut, the zone switched, the clock stepped (midnight included),
// the host's filter.set. Invariants: the rows are an oracle's (zoneDayBounds, relativeDays), never
// an inactive filter stored, a server asked only at Apply/Enter or a midnight, the wire's resolved
// bounds the oracle's, no echo, the first/last rule, no panel left behind.
const tz = vi.hoisted(() => ({ last: null as null | { kind: string; o: Record<string, any> } }));
vi.mock('@tzslot/dom', async (orig) => {
  const m = await orig<typeof import('@tzslot/dom')>();
  const wrap = <F extends (h: HTMLElement, o?: any) => any>(kind: string, f: F) => ((h: HTMLElement, o: Record<string, any> = {}) => {
    const w = f(h, o);
    const rec = { kind, o: { ...o } };
    tz.last = rec;
    const update = w.update.bind(w);
    w.update = (s: Record<string, unknown>) => (Object.assign(rec.o, s), update(s));
    const destroy = w.destroy.bind(w);
    w.destroy = () => (tz.last === rec && (tz.last = null), destroy());
    return w;
  }) as unknown as F;
  return { ...m, createDateField: wrap('date', m.createDateField), createRangeField: wrap('range', m.createRangeField), createDateTimeField: wrap('moment', m.createDateTimeField) };
});

type DRow = R & { t: string };
const DZONES = ['Europe/Paris', 'Africa/Algiers', 'America/Sao_Paulo', 'UTC'];
const DDAYS = ['2026-10-01', '2026-10-05', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31', '2026-11-02'];
const RANGES = ['today', 'yesterday', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth'] as const;
const DOPS = ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between', 'blank', 'notBlank'];
const IOPS = ['onDay', 'betweenDays', 'before', 'after', 'between', 'blank', 'notBlank'];
const D_ROWS: DRow[] = Array.from({ length: 48 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-${String(20 + (i % 12)).padStart(2, '0')}`.replace('2026-10-31', '2026-11-01'), t: new Date(Date.UTC(2026, 9, 20) + i * 5 * 3_600_000 + 1_800_000).toISOString() }));

/** What the walks did, summed: a walk that never reaches a widget proves nothing. */
const did = { opens: 0, widgets: 0, picks: 0, stored: 0, relative: 0, ticks: 0 };
async function walkDates(seed: number, server: boolean, steps = 45) {
  const { Temporal } = await import('@tzslot/core');
  const core = await import('@dzgrid/core');
  const KITS = { date: await import('../src/filters/dates/date.js'), range: await import('../src/filters/dates/range.js'), moment: await import('../src/filters/dates/moment.js') };
  const r = rng(seed);
  const log: string[] = [];
  let zone = 'Europe/Paris';
  let now = Date.UTC(2026, 9, 24, 21, 0);
  const feature = filters({ loadDates: (k) => Promise.resolve(KITS[k]) as never });
  const t = make({
    server, columns: [{ id: 'name', header: 'Name' }, { id: 'd', header: 'D', type: 'day' }, { id: 't', header: 'T', type: 'instant' }] as never,
    rows: D_ROWS, features: [feature], settings: { timeZone: zone, clock: () => now } as never,
  });
  if (server) t.f.answer([]);
  const fail = (msg: string) => { throw new Error(`dates seed ${seed} ${server ? 'server' : 'browser'}: ${msg}\n  ${log.join('\n  ')}`); };
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const op = () => popup()?.querySelector<HTMLSelectElement>('select.dzg-fop') ?? null;
  const model = () => t.g.kernel.query.filter as Record<string, any>;
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let openOn: 'd' | 't' | null = null;

  /** The oracle: does this row pass the column's filter now? */
  const keeps = (c: 'd' | 't', f: any, row: DRow): boolean => {
    if (c === 'd') {
      const v = row.d!;
      if (f.op === 'blank') return false;
      if (f.op === 'notBlank') return true;
      let lo = f.value, hi = f.valueTo;
      if (f.op === 'relative') {
        const today = core.dayAt(now, zone)!.day;
        const d = core.relativeDays(f.range, today)!;
        lo = d.from; hi = d.to;
      }
      if (f.op === 'between' || f.op === 'relative') return v >= (lo < hi ? lo : hi) && v <= (lo < hi ? hi : lo);
      return { equals: v === lo, notEqual: v !== lo, lt: v < lo, lte: v <= lo, gt: v > lo, gte: v >= lo }[f.op as 'equals'];
    }
    const ms = Date.parse(row.t);
    if (f.op === 'blank') return false;
    if (f.op === 'notBlank') return true;
    const span = range(f)!;
    return (span.from === null || ms >= span.from) && (span.to === null || ms < span.to);
  };
  const range = (f: any): { from: number | null; to: number | null } | null => {
    const b = (d: string) => core.zoneDayBounds(d as never, zone);
    if (f.op === 'onDay') return { from: b(f.day).from, to: b(f.day).to };
    if (f.op === 'betweenDays' || f.op === 'relative') {
      let lo = f.day, hi = f.dayTo;
      if (f.op === 'relative') ({ from: lo, to: hi } = core.relativeDays(f.range, core.dayAt(now, zone)!.day)!);
      if (lo > hi) [lo, hi] = [hi, lo];
      return { from: b(lo).from, to: b(hi).to };
    }
    if (f.op === 'before') return { from: null, to: Date.parse(f.at) };
    if (f.op === 'after') return { from: Date.parse(f.at) + 1, to: null };
    if (f.op === 'between') { const a = Date.parse(f.at), z = Date.parse(f.atTo); return { from: Math.min(a, z), to: Math.max(a, z) }; }
    return null;
  };
  const active = (c: 'd' | 't', f: any): boolean => {
    if (f.op === 'blank' || f.op === 'notBlank') return true;
    if (f.op === 'relative') return (RANGES as readonly string[]).includes(f.range);
    if (c === 'd') return !!core.parseDay(f.value) && (f.op !== 'between' || !!core.parseDay(f.valueTo));
    if (f.op === 'onDay') return !!core.parseDay(f.day);
    if (f.op === 'betweenDays') return !!core.parseDay(f.day) && !!core.parseDay(f.dayTo);
    if (f.op === 'between') return typeof f.at === 'string' && typeof f.atTo === 'string' && f.at.length === 24 && f.atTo.length === 24;
    return typeof f.at === 'string' && f.at.length === 24;
  };

  const check = (what: string) => {
    log.push(what);
    const m = model();
    for (const c of ['d', 't'] as const) if (m[c] && !active(c, m[c])) fail(`${what}: inactive ${c} filter stored ${JSON.stringify(m[c])}`);
    if (!server) {
      const want = D_ROWS.filter((row) => (['d', 't'] as const).every((c) => !m[c] || keeps(c, m[c], row))).map((x) => x.id);
      const got = t.ids();
      if (want.join() !== got.join()) fail(`${what}: rows ${got.join()} oracle ${want.join()} (model ${JSON.stringify(m)}, now ${new Date(now).toISOString()}, ${zone})`);
    } else if (t.f.calls.length) {
      const sent = (t.f.calls.at(-1)!.req as any).query?.filter?.['t'] ?? (t.f.calls.at(-1)!.req as any).filter?.['t'];
      if (sent?.resolved && m['t']) {
        const o = range(m['t'])!;
        const iso = (x: number | null) => (x === null ? null : new Date(x).toISOString());
        if (sent.zone === zone && (sent.resolved.from !== iso(o.from) || sent.resolved.to !== iso(o.to))) fail(`${what}: wire resolved ${JSON.stringify(sent.resolved)}, oracle ${iso(o.from)}..${iso(o.to)}`);
      }
    }
    const p = popup();
    if (p) {
      const items = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.closest('[hidden]'));
      if (items.length && (items[0] !== op() && !p.querySelector('.dzg-fsum') || items.at(-1) !== p.querySelector('.dzg-fapply'))) fail(`${what}: first/last ${items[0]?.className} / ${items.at(-1)?.className}`);
    } else if (document.querySelector('.tz-field__panel, .tz-field')) fail(`${what}: a tzslot widget left behind`);
  };
  const step = async (what: string, act: () => unknown, o: { quiet?: boolean } = {}) => {
    const calls = t.f.calls.length;
    await act();
    await settle();
    if (server && o.quiet && t.f.calls.length !== calls) fail(`${what}: ${t.f.calls.length - calls} request(s) without Apply`);
    check(what);
  };
  const instant = (day: string, hm: number) => Temporal.PlainDate.from(day).toZonedDateTime({ timeZone: tz.last?.o['timeZone'] ?? zone, plainTime: new Temporal.PlainTime(Math.floor(hm / 60), hm % 60) }).toInstant();

  for (let i = 0; i < steps; i++) {
    const k = r.int(100);
    if (!popup() && k < 30) {
      const c = r.pick(['d', 't'] as const);
      await step(`open ${c}`, () => feature.openFilter(c));
      openOn = popup() ? c : null;
      did.opens++;
      // Opening never stores anything (the echo is muted).
      continue;
    }
    if (popup() && openOn && k < 55) {
      const c = openOn;
      const what = r.pick(['op', 'pick', 'pick', 'half', 'clear', 'preset'] as const);
      await step(`${what} in ${c}`, () => {
        const s = op();
        if (what === 'clear') return popup()!.querySelector<HTMLButtonElement>('.dzg-fclr')!.click();
        if (!s?.isConnected || s.closest('[hidden]')) return;
        if (what === 'op') {
          s.value = r.pick(c === 'd' ? DOPS : IOPS);
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const w = tz.last;
        if (!w || !popup()!.contains(document.querySelector('.dzg-fdate .tz-field'))) return;
        did.widgets++;
        const was = JSON.stringify(model()[c]);
        queueMicrotask(() => { if (JSON.stringify(model()[c]) !== was) did.stored++, model()[c]?.op === 'relative' && did.relative++; });
        did.picks++;
        const d1 = r.pick(DDAYS), d2 = r.pick(DDAYS);
        log.push(`  ${w.kind} ${d1} ${d2}`);
        if (w.kind === 'date') return w.o['onChange']?.(Temporal.PlainDate.from(d1));
        if (w.kind === 'moment') return w.o['onChange']?.(what === 'half' ? null : instant(d1, r.int(1440)));
        if (what === 'preset' && w.o['showPresets'] !== false) return w.o['onChange']?.({ start: instant(d1, 0), end: instant(d2, 0) }, { preset: r.pick(RANGES) });
        const end = what === 'half' ? null : w.o['showTime'] ? instant(d2, r.int(1440)) : instant(d2 < d1 ? d1 : d2, 0).toZonedDateTimeISO(w.o['timeZone']).add({ days: 1 }).startOfDay().toInstant();
        return w.o['onChange']?.({ start: instant(d1, w.o['showTime'] ? r.int(1440) : 0), end }, { preset: null });
      }, { quiet: true });
      continue;
    }
    if (popup() && openOn && k < 70) {
      const how = r.pick(['apply', 'escape', 'closeFilter', 'enter'] as const);
      const before = model()[openOn];
      const calls = t.f.calls.length;
      await step(`${how} on ${openOn}`, () => {
        if (how === 'apply' || how === 'enter') return popup()!.querySelector<HTMLButtonElement>('.dzg-fapply')!.click();
        if (how === 'escape') return t.key(popup()!, 'Escape');
        feature.closeFilter();
      }, { quiet: how !== 'apply' && how !== 'enter' });
      if (popup()) fail(`${how}: still open`);
      if (server && (how === 'escape' || how === 'closeFilter') && JSON.stringify(model()[openOn]) !== JSON.stringify(before)) fail(`${how}: a server draft closed without Apply changed the model`);
      if (server && t.f.calls.length - calls > 1) fail(`${how}: ${t.f.calls.length - calls} requests`);
      openOn = null;
      continue;
    }
    if (k < 78) {
      const ms = r.pick([1, 150, 300, 3_600_000, 2 * 3_600_000, 86_400_000]);
      const ticks = vi.spyOn(t.g.kernel, 'tick');
      await step(`clock +${ms}`, () => { now += ms; vi.advanceTimersByTime(ms); }, { quiet: !model()['d'] && !model()['t'] ? true : false });
      did.ticks += ticks.mock.calls.length;
      ticks.mockRestore();
      continue;
    }
    if (k < 84) {
      zone = r.pick(DZONES);
      await step(`zone ${zone}`, () => t.g.update({ timeZone: zone } as never));
      continue;
    }
    if (k < 92) {
      const c = r.pick(['d', 't'] as const);
      const f = c === 'd'
        ? r.pick([{ type: 'day', op: 'relative', range: r.pick(RANGES) }, { type: 'day', op: 'between', value: r.pick(DDAYS), valueTo: r.pick(DDAYS) }, { type: 'day', op: 'gte', value: r.pick(DDAYS) }, null])
        : r.pick([{ type: 'instant', op: 'relative', range: r.pick(RANGES) }, { type: 'instant', op: 'onDay', day: r.pick(DDAYS) }, { type: 'instant', op: 'after', at: '2026-10-25T00:30:00.000Z' }, null]);
      await step(`host ${c} ${JSON.stringify(f)}`, () => t.g.kernel.dispatch({ type: 'filter.column', column: c, filter: f as never }, 'api'));
      continue;
    }
    if (server && t.f.calls.length) await step('answer', () => t.f.answer([]));
  }
  t.g.destroy();
  if (document.querySelector('.tz-field__panel, .tz-field')) fail('a tzslot widget survived destroy');
}

describe('a random walk over the date forms (step 14 part B)', () => {
  const N = Math.max(10, Math.floor(SEEDS / 4));
  it(`in the browser, ${N} seeds`, async () => {
    for (let s = ONLY || 1; s <= (ONLY || N); s++) {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      await walkDates(s, false);
      cleanup();
    }
  }, 120_000);
  it(`on a server, ${N} seeds`, async () => {
    for (let s = ONLY || 1; s <= (ONLY || N); s++) {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      await walkDates(s, true);
      cleanup();
    }
  }, 120_000);
  it('reached the widgets: opens, picks that stored a filter, shortcuts, midnights', () => {
    if (ONLY) return;
    expect(did.opens).toBeGreaterThan(50);
    expect(did.widgets).toBeGreaterThan(50);
    expect(did.stored).toBeGreaterThan(10);
    expect(did.relative).toBeGreaterThan(2);
    expect(did.ticks).toBeGreaterThan(2);
  });
});
