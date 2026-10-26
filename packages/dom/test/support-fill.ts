// Shared fixtures for `@dzgrid/dom/fill` (Phase 5 step 12, docs/behaviors/fill.md, docs/phase-5-steps/step12-plan.md):
// the clipboard's grid (`cmake`: `range()`, `edit()` with a recording save, every type of column) with `fill(range)`
// after it (or before it, `order: 'before'`), the fill texts joined; the handle found, pressed, dragged, clicked.
import type { GridFeature } from '../src/features.js';
import { fill, type FillFeature, type FillFeatureOptions } from '../src/fill.js';
import { range } from '../src/range.js';
import { EN_FILL } from '../src/locales/en-fill.js';
import { FR_FILL } from '../src/locales/fr-fill.js';
import { AR_FILL } from '../src/locales/ar-fill.js';
import { CMSG, cmake, crows, join, type C, type CMake } from './support-clip.js';

export { cleanup, flush, key, crows, CCOLS, CMSG, join, clip, type C } from './support-clip.js';

/** The clipboard's rows with a quantity that is no series (`i² mod 11`: 0, 1, 4, 9, 5, 3, 3, 5, 9, 4, 1, 0, …), so a fill changes them. */
export const frows = (n: number): C[] => crows(n).map((r, i) => ({ ...r, qty: (i * i) % 11 }));

export const FMSG = { en: join(CMSG.en, EN_FILL), fr: join(CMSG.fr, FR_FILL), ar: join(CMSG.ar, AR_FILL) } as const;

export interface FMake extends CMake {
  /** `fill()` listed before `range()` (default after). */
  readonly order?: 'before' | 'after';
  readonly fill?: FillFeatureOptions;
  /** No `fill()` on the grid. */
  readonly noFill?: boolean;
  /** Bundles joined after the fill texts (tree, detail, pagination). */
  readonly more?: readonly { readonly locale: string; readonly text: object }[];
  /** Features after `fill()` (tree, detail, pagination). */
  readonly after?: readonly GridFeature[];
}

/** A grid with `range()`, `fill(range)`, `edit()` (a recording save) and, when asked, `editors()`. */
export function fmake(o: FMake = {}) {
  const r = o.feature ?? range(o.range);
  const f: FillFeature | null = o.noFill ? null : fill(r, o.fill);
  const lang = o.lang ?? 'en';
  const messages = o.more?.length ? join(FMSG[lang], ...o.more) : FMSG[lang];
  const t = cmake({
    rows: frows(30),
    ...o, feature: r,
    ...(f && o.order === 'before' ? { pre: [f] } : {}),
    extra: [...(f && o.order !== 'before' ? [f] : []), ...(o.after ?? []), ...(o.extra ?? [])],
    settings: { messages, ...o.settings } as never,
  });
  const fapi = () => f!.api(t.g)!;
  const handles = () => [...t.host.querySelectorAll<HTMLElement>('.dzg-fill')];
  const handle = () => handles()[0] ?? null;
  /** The cell holding the handle, as `row/col`. */
  const handleAt = (): string | null => {
    const h = handle();
    const c = h?.parentElement?.closest<HTMLElement>('.dzg-cell');
    const row = c?.closest('.dzg-row');
    return c && row ? `${String(t.ctx.rowRenderer.keyOf(row)).replace(/^d:\d+:/, '')}/${c.dataset['col']}` : null;
  };
  /** The cells outlined as the fill's target, as `row/col`, sorted. */
  const target = () => [...t.ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-cell.dzg-cell--fill')].map((c) => `${String(t.ctx.rowRenderer.keyOf(c.closest('.dzg-row')!)).replace(/^d:\d+:/, '')}/${c.dataset['col']}`).sort();
  /** A drag of the handle from its cell to a cell (mouse unless `type`), released there with `ctrl`/`meta` held, then the browser's click. */
  const dragTo = (id: string, col: string, m: { ctrl?: boolean; meta?: boolean; type?: string; noUp?: boolean } = {}) => {
    const h = handle()!;
    const from = t.pt(...(handleAt()!.split('/') as [string, string]));
    const init = { pointerType: m.type ?? 'mouse' };
    const p = t.down(h, from, init);
    t.move(t.pt(id, col), init);
    if (m.noUp) return p;
    t.up(t.pt(id, col), document, { ...init, ctrlKey: !!m.ctrl, metaKey: !!m.meta });
    t.click(t.cell(id, col) ?? t.ctx.el.body, { ctrlKey: !!m.ctrl, metaKey: !!m.meta });
    return p;
  };
  /** The no-drag way (WCAG 2.5.7): a click on the handle, then a click on a cell (`ctrl`/`meta` held there). */
  const pickTo = (id: string, col: string, m: { ctrl?: boolean; meta?: boolean } = {}) => {
    t.click(handle()!);
    const pt = t.pt(id, col);
    const at = t.cell(id, col) ?? t.rowEl(id) ?? t.ctx.el.body;
    const init = { ...pt, ctrlKey: !!m.ctrl, metaKey: !!m.meta };
    const p = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init });
    at.dispatchEvent(p);
    if (!p.defaultPrevented) at.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));
    t.up(pt, at, { ctrlKey: !!m.ctrl, metaKey: !!m.meta });
    t.click(at, init);
  };
  const field = () => t.host.querySelector<HTMLInputElement>('.dzg-field');
  /** The field's text, as typing would leave it. */
  const type = (text: string) => {
    const x = field()!;
    x.value = text;
    x.setSelectionRange(text.length, text.length);
    x.dispatchEvent(new Event('input', { bubbles: true }));
  };
  /** The kernel's focus, as `row/col`. */
  const focusAt = () => {
    const x = t.g.kernel.focus;
    return x?.kind === 'cell' ? `${String(x.row).replace(/^d:\d+:/, '')}/${x.column}` : null;
  };
  return { ...t, f, fapi, handle, handles, handleAt, target, dragTo, pickTo, field, type, focusAt };
}
