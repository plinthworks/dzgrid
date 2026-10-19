// A random walk over the filter popup (step 13) together with the floating row: opening by the
// button, Alt+ArrowDown (header and floating cell), openFilter and the floating summary; closing
// by Apply, Enter, Escape, the button again, closeFilter; operator, values (en, fr, ar, Arabic-Indic
// digits, between), radios, Clear, a pointer down outside; the floating box typed on the same
// column; the host's filter.column / filter.set / query.set; hiding, redefining, changing kind,
// scrolling a column out; direction and locale; a server answering late or failing; destroy.
// Seeded: a failure prints its seed and the steps that led there.
import { describe, it, afterEach, vi } from 'vitest';
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
        else document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }, { quiet: how !== 'apply' && how !== 'enter' && !(how !== 'outside' && boxLast) });
      const sent = t.f.calls.length - calls;
      if (how === 'outside') {
        if (!popup()) fail('a pointer down outside closed it');
        continue;
      }
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
