// The save marks of `@dzgrid/dom/edit` (Phase 5 step 4; edit-save.md 6–16, edit-validation.md 2–2b;
// owner Q9 « Mixte », Q10 amended): classes from the controller's states and the DOM's clocks, written
// at each paint on the mounted cells; descriptions; the save and refusal sentences.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { edit, type EditApi } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { cleanup, emake, join, k, rowsOf, type R } from './support-edit.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true, edit: { min: 5 } },
  { id: 'q', header: 'Q', type: 'number', width: 80, editable: true },
];

interface Held { req: SaveRequest<R>; signal: { aborted: boolean }; ok(): void; no(err: unknown): void }

function mk(o: { save?: boolean; border?: boolean; lang?: 'en' | 'fr'; rows?: number } = {}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  const held: Held[] = [];
  const save = (req: SaveRequest<R>, signal: { aborted: boolean }) => new Promise<void>((ok, no) => held.push({ req, signal, ok: () => ok(), no }));
  const f = edit<R>({ ...(o.save !== false && { save }), ...(o.border === false && { savingBorder: false }) });
  const messages = o.lang === 'fr' ? join(FR, FR_EDIT) : join(EN, EN_EDIT);
  const m = emake({ columns: COLS, rows: rowsOf(o.rows ?? 200), settings: { features: [f], messages } });
  const api = f.api(m.g)! as EditApi<R>;
  const announce = vi.spyOn(m.ctx.live, 'announce');
  const cls = (id: string, col = 'n') => [...(m.cell(id, col)?.classList ?? [])].filter((c) => c.startsWith('dzg-cell--')).sort().join(' ');
  const descOf = (id: string, col = 'n') => (m.cell(id, col)?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)?.textContent).join('|');
  const loud = () => m.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent;
  const put = (id: string, text: string, col = 'n') => api.commit([{ key: k(id), column: col, input: { text } }]);
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { ...m, f, api, held, announce, cls, descOf, loud, put, settle };
}

describe('saving: pending, saving, saved', () => {
  it('a kept value saves: the running border and its description, one polite sentence per gesture', async () => {
    const t = mk();
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '12' } }, { key: k('r1'), column: 'q', input: { text: '13' } }]);
    expect(t.cell('r1', 'n')!.textContent).toBe('12');
    expect(t.cls('r1')).toBe('dzg-cell--saving');
    expect(t.cls('r1', 'q')).toBe('dzg-cell--saving');
    expect(t.descOf('r1')).toBe('Saving');
    await t.settle();
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual(['Saving']);
    // A second gesture on the same cell waits for the first: pending (a dot), no new sentence yet.
    t.put('r1', '20');
    expect(t.cls('r1')).toBe('dzg-cell--pending');
    expect(t.descOf('r1')).toBe('');
    t.held[0]!.ok();
    await t.settle();
    // The first answered: the second goes, a new gesture said once.
    expect(t.cls('r1')).toBe('dzg-cell--saving');
    expect(t.cls('r1', 'q')).toBe('dzg-cell--saved');
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual(['Saving', 'Saving']);
    t.held[1]!.ok();
    await t.settle();
    expect(t.cls('r1')).toBe('dzg-cell--saved');
    expect(t.descOf('r1')).toBe('');
    vi.advanceTimersByTime(1499);
    expect(t.cls('r1')).toBe('dzg-cell--saved');
    vi.advanceTimersByTime(1);
    expect(t.cls('r1')).toBe('');
    expect(t.cls('r1', 'q')).toBe('');
  });

  it('without a save: saved at once, no border, nothing said', async () => {
    const t = mk({ save: false });
    t.put('r2', '40');
    expect(t.cell('r2', 'n')!.textContent).toBe('40');
    expect(t.cls('r2')).toBe('dzg-cell--saved');
    await t.settle();
    expect(t.announce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(t.cls('r2')).toBe('');
    expect(t.cell('r2', 'n')!.textContent).toBe('40');
  });

  it('the border stands still after 5 s of saving, or from the start with savingBorder: false', async () => {
    const t = mk();
    t.put('r1', '12');
    vi.advanceTimersByTime(4999);
    expect(t.cls('r1')).toBe('dzg-cell--saving');
    vi.advanceTimersByTime(1);
    expect(t.cls('r1')).toBe('dzg-cell--saving dzg-cell--still');
    cleanup();
    const s = mk({ border: false });
    s.put('r1', '12');
    expect(s.cls('r1')).toBe('dzg-cell--saving dzg-cell--still');
  });
});

describe('refused by the server (Q9)', () => {
  it('the refused value shows 0.5 s, blinking; then the last saved value, the error mark and its reason', async () => {
    const t = mk();
    // 7 passes the local rule (min 5); the server has a rule of its own and answers with the code.
    t.put('r3', '7');
    t.held[0]!.no({ code: 'min' });
    await t.settle();
    expect(t.cell('r3', 'n')!.textContent).toBe('7');
    expect(t.cls('r3')).toBe('dzg-cell--blink-a dzg-cell--refused');
    vi.advanceTimersByTime(50);
    expect(t.loud()).toBe('Stock: not saved, at least 5. Previous value restored.');
    vi.advanceTimersByTime(449);
    expect(t.cell('r3', 'n')!.textContent).toBe('7');
    vi.advanceTimersByTime(1);
    expect(t.cell('r3', 'n')!.textContent).toBe('3');
    expect(t.cls('r3')).toBe('dzg-cell--failed');
    expect(t.descOf('r3')).toBe('Not saved: at least 5');
  });

  it('the reason: the host’s text, a code’s text in the grid’s language, else the generic one', async () => {
    const t = mk({ lang: 'fr' });
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '9' } }]);
    t.held[0]!.no({ reason: 'Stock verrouillé' });
    t.put('r2', '9');
    t.held[1]!.no(new Error('network'));
    t.put('r4', '6');
    t.held[2]!.no({ code: 'min' });
    await t.settle();
    vi.advanceTimersByTime(500);
    expect(t.descOf('r1')).toBe('Non enregistré : Stock verrouillé');
    expect(t.descOf('r2')).toBe('Non enregistré : refusé par le serveur');
    expect(t.descOf('r4')).toBe('Non enregistré : au moins 5');
  });

  it('a code without a text: the generic validation text', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({ code: 'host-own' });
    await t.settle();
    vi.advanceTimersByTime(500);
    expect(t.descOf('r1')).toBe('Not saved: invalid value');
  });

  it('one assertive sentence per refused gesture, the first cell’s column', async () => {
    const t = mk();
    t.api.commit([{ key: k('r1'), column: 'q', input: { text: '9' } }, { key: k('r2'), column: 'n', input: { text: '9' } }]);
    const shown = vi.fn();
    new MutationObserver(() => shown(t.loud())).observe(t.host.querySelector('.dzg-live[aria-live="assertive"]')!, { childList: true, characterData: true, subtree: true });
    t.held[0]!.no({ reason: 'locked' });
    await t.settle();
    vi.advanceTimersByTime(100);
    await t.settle();
    expect(shown.mock.calls.map((c) => c[0]).filter(Boolean)).toEqual(['Q: not saved, locked. Previous value restored.']);
  });

  it('the error mark stays until saved again, undone, or the row changes', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    vi.advanceTimersByTime(500);
    expect(t.cls('r1')).toBe('dzg-cell--failed');
    vi.advanceTimersByTime(60_000);
    expect(t.cls('r1')).toBe('dzg-cell--failed');
    t.put('r1', '11');
    expect(t.cls('r1')).toBe('dzg-cell--saving');
    t.held[1]!.ok();
    await t.settle();
    expect(t.cls('r1')).toBe('dzg-cell--saved');
    // The row replaced by the host: what the mark was about is gone.
    t.put('r5', '9');
    t.held[2]!.no({});
    await t.settle();
    vi.advanceTimersByTime(500);
    expect(t.cls('r5')).toBe('dzg-cell--failed');
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'r5', name: 'x', n: 77, s: '', q: 1 }] });
    expect(t.cls('r5')).toBe('');
    expect(t.cell('r5', 'n')!.textContent).toBe('77');
  });

  it('a commit during the hold ends it at once', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    expect(t.cls('r1')).toContain('dzg-cell--refused');
    t.put('r1', '33');
    expect(t.cls('r1')).toBe('dzg-cell--saving');
    expect(t.cell('r1', 'n')!.textContent).toBe('33');
  });
});

describe('marks follow the rows, not the elements', () => {
  it('a pooled cell showing another row carries no mark; back on its row it has it', async () => {
    const t = mk({ rows: 2000 });
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    vi.advanceTimersByTime(500);
    const el = t.cell('r1', 'n')!;
    expect(t.cls('r1')).toBe('dzg-cell--failed');
    t.scroll(32 * 1000);
    expect(t.cell('r1', 'n')).toBeNull();
    // Whatever row the element shows now, it has no mark of r1's.
    expect([...el.classList].filter((c) => c.startsWith('dzg-cell--'))).toEqual([]);
    expect(el.getAttribute('aria-describedby')).toBeNull();
    expect(t.host.querySelectorAll('[class*="dzg-cell--"]').length).toBe(0);
    t.scroll(0);
    expect(t.cls('r1')).toBe('dzg-cell--failed');
  });
});

describe('the blink limiter (edit-validation.md 2b, WCAG 2.3.1)', () => {
  it('refusals at 0, 0.3, 0.9, 1.0 and 1.05 s blink at 0 and 1.0 only, alternating keyframes; one animation at a time', () => {
    const t = mk();
    const seen: string[] = [];
    let now = 0;
    for (const at of [0, 300, 900, 1000, 1050]) {
      vi.advanceTimersByTime(at - now);
      now = at;
      t.api.refuse(k('r1'), 'n');
      seen.push(t.cls('r1'));
    }
    expect(seen).toEqual([
      'dzg-cell--blink-a dzg-cell--refused',
      'dzg-cell--refused',
      'dzg-cell--refused',
      'dzg-cell--blink-b dzg-cell--refused',
      'dzg-cell--refused',
    ]);
    // Flashes: 2 per blink (the keyframes); in any second, at most 3.
    const starts = [0, 1000];
    for (let w = 0; w <= 1100; w += 10) {
      const n = starts.reduce((s, b) => s + [b, b + 250].filter((f) => f >= w && f < w + 1000).length, 0);
      expect(n).toBeLessThanOrEqual(3);
    }
    vi.advanceTimersByTime(500);
    expect(t.cls('r1')).toBe('');
  });
});

describe('the grid going', () => {
  it('destroy: the request aborted, the timers cleared, the descriptions gone, the API null', async () => {
    const t = mk();
    t.put('r1', '12');
    expect(t.held[0]!.signal.aborted).toBe(false);
    t.g.destroy();
    expect(t.held[0]!.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector('.dzg-desc')).toBeNull();
    expect(t.f.api(t.g)).toBeNull();
  });

  it('one feature, two grids: each its own edits and marks', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const f = edit<R>();
    const a = emake({ columns: COLS, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    const b = emake({ columns: COLS, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    expect(f.api(a.g)).not.toBe(f.api(b.g));
    f.api(a.g)!.commit([{ key: k('r1'), column: 'n', input: { text: '50' } }]);
    expect(a.cell('r1', 'n')!.textContent).toBe('50');
    expect(b.cell('r1', 'n')!.textContent).toBe('1');
    expect(b.host.querySelectorAll('[class*="dzg-cell--"]').length).toBe(0);
  });

  it('a bundle without the editing texts is refused at setup, naming them', () => {
    expect(() => emake({ columns: COLS, settings: { features: [edit()], messages: EN } })).toThrow(/edit: missing edit\.saving/);
  });
});

describe('review and test gaps (step 4 review)', () => {
  it('clocks: 300 cells saving, then saved, keep a bounded number of timers (one queue per duration; review 1)', async () => {
    const t = mk({ rows: 2000 });
    t.api.commit(Array.from({ length: 300 }, (_, i) => ({ key: k(`r${i}`), column: 'n', input: { text: String(100 + i) } })));
    expect(vi.getTimerCount()).toBeLessThanOrEqual(6);
    t.held[0]!.ok();
    await t.settle();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(6);
    vi.advanceTimersByTime(1500);
    expect(t.host.querySelectorAll('.dzg-cell--saved').length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('two gestures refused in the same task: two sentences (review 2), the region atomic, [s, "", s] for one sentence twice (gap 7)', async () => {
    const t = mk();
    const region = t.host.querySelector('.dzg-live[aria-live="assertive"]')!;
    expect(region.getAttribute('aria-atomic')).toBe('true');
    const seen: string[] = [];
    new MutationObserver(() => seen.push(region.textContent ?? '')).observe(region, { childList: true, characterData: true, subtree: true });
    t.put('r1', '9');
    t.put('r2', '9');
    t.held[0]!.no({ reason: 'locked' });
    t.held[1]!.no({ reason: 'locked' });
    await t.settle();
    for (let i = 0; i < 6; i++) vi.advanceTimersByTime(50), await t.settle();
    const s = 'Stock: not saved, locked. Previous value restored.';
    expect(seen).toEqual([s, '', s]);
  });

  it('a gesture waiting behind another still says « Saving » when it goes (review 3)', async () => {
    const t = mk();
    t.put('r1', '10');
    t.put('r1', '11');
    t.put('r2', '12');
    await t.settle();
    t.held[0]!.ok();
    await t.settle();
    expect(t.held.length).toBe(3);
    // r1's first gesture and r2's started in one task: one sentence; r1's second when it goes: one more.
    expect(t.announce.mock.calls.map((c) => c[0])).toEqual(['Saving', 'Saving']);
  });

  it('the only mark of a row replaced by the host is cleared (gap 1)', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    vi.advanceTimersByTime(500);
    expect(t.cls('r1')).toBe('dzg-cell--failed');
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'r1', name: 'x', n: 40, s: '', q: 1 }] });
    expect(t.host.querySelectorAll('[class*="dzg-cell--"]').length).toBe(0);
  });

  it('a failed cell whose column is hidden: the detached element keeps no mark (gap 2)', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    vi.advanceTimersByTime(500);
    const el = t.cell('r1', 'n')!;
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'api');
    expect(el.isConnected).toBe(false);
    expect([...el.classList].filter((c) => c.startsWith('dzg-cell--'))).toEqual([]);
  });

  it('a save answered, 1.5 s later: no timer left (gap 3)', async () => {
    const t = mk();
    t.put('r1', '12');
    t.held[0]!.ok();
    await t.settle();
    vi.advanceTimersByTime(1500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a refusal, then the grid destroyed before 50 ms: no timer left (gap 4)', async () => {
    const t = mk();
    t.put('r1', '9');
    t.held[0]!.no({});
    await t.settle();
    vi.advanceTimersByTime(10);
    t.g.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limiter boundaries: refusals at 0 and 999 ms, the second still; at 1 000 ms, blink-b (gap 5)', () => {
    const t = mk();
    t.api.refuse(k('r1'), 'n');
    vi.advanceTimersByTime(999);
    t.api.refuse(k('r1'), 'n');
    expect(t.cls('r1')).toBe('dzg-cell--refused');
    vi.advanceTimersByTime(1);
    t.api.refuse(k('r1'), 'n');
    expect(t.cls('r1')).toBe('dzg-cell--blink-b dzg-cell--refused');
  });

  it('two grids saving: their descriptions have their own ids (gap 8)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const f = edit<R>({ save: () => new Promise<void>(() => {}) });
    const a = emake({ columns: COLS, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    const b = emake({ columns: COLS, settings: { features: [f], messages: join(EN, EN_EDIT) } });
    f.api(a.g)!.commit([{ key: k('r1'), column: 'n', input: { text: '50' } }]);
    f.api(b.g)!.commit([{ key: k('r1'), column: 'n', input: { text: '50' } }]);
    const ia = a.cell('r1', 'n')!.getAttribute('aria-describedby');
    const ib = b.cell('r1', 'n')!.getAttribute('aria-describedby');
    expect(ia && ib && ia !== ib).toBe(true);
    expect(document.querySelectorAll(`[id="${ia}"]`).length).toBe(1);
  });
});
