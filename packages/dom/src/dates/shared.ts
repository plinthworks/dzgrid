import { zoneDayBounds } from '@dzgrid/core';
import { intlTag } from '@dzgrid/core/internal';
import { Temporal, type PlainDate } from '@tzslot/core';
import { AR, EN, FR, type TzslotMessages } from '@tzslot/dom';
import type { LocaleCtx } from '@dzgrid/core';

/**
 * The lazy date chunks' shared helpers (moved from `filters/dates/shared.ts` at Phase 5 step 6, owner S6-O6:
 * shared by the filters' kits and the editors' calendar, not copied). Imported only by `filters/dates/*` and
 * `editors/dates/*`, each reached by `import()`: tzslot never comes with the eager code.
 */

/** What a widget is told: the grid's locale, digits and zone, today, its name, tzslot's words by language. */
export interface DateSettings {
  readonly ctx: LocaleCtx;
  readonly today: string;
  readonly label: string;
  readonly messages?: Readonly<Record<string, object>>;
}

/** Where tzslot's sheets go: the grid's root node, when DzGrid injects them, with its nonce. */
export interface SheetHost {
  readonly grid: HTMLElement;
  readonly inject: boolean;
  readonly nonce?: string;
}

/** The only place DzGrid touches Temporal: tzslot's (native, or its polyfill), behind `import()` (K.2 amended). */
export const T = Temporal;
export const day = (d: string): PlainDate => T.PlainDate.from(d);
const OWN: Readonly<Record<string, TzslotMessages>> = { en: EN, fr: FR, ar: AR };

/** What every widget is given (docs/behaviors/filter-date-picker.md): the grid's locale and today, its words, the field's name. */
export const base = (s: DateSettings) => ({
  locale: intlTag(s.ctx),
  today: day(s.today),
  messages: { ...EN, ...OWN[lang(s)], ...s.messages?.[lang(s)] } as TzslotMessages,
  ariaLabel: s.label,
  placeholder: '',
  min: day('0001-01-01'),
  max: day('9999-12-31'),
});

const lang = (s: DateSettings): string => s.ctx.locale.split('-')[0]!;

/** A day the zone never had (Samoa, 2011-12-30): tzslot 2.2.0 would read its times as repeated (T7). */
export const lost = (zone: string) => (d: PlainDate): boolean => {
  const b = zoneDayBounds(d.toString() as never, zone);
  return b.from === b.to;
};

/**
 * tzslot's sheets, injected by DzGrid before the widget (`injectStyles: false` does not stop the
 * panels' own: spike S13), once per document or shadow root, each marked `data-tzslot` as tzslot
 * marks them (so it adds none) and carrying the grid's nonce.
 */
export function styles(a: SheetHost, sheets: readonly (readonly [string, string])[]): void {
  if (!a.inject) return;
  const root = a.grid.getRootNode() as Document | ShadowRoot;
  const doc = a.grid.ownerDocument;
  const at = root.nodeType === 11 ? (root as ShadowRoot) : doc.head;
  for (const [id, css] of sheets) {
    if (at.querySelector(`style[data-tzslot="${id}"]`)) continue;
    const s = doc.createElement('style');
    s.dataset['tzslot'] = id;
    if (a.nonce) s.setAttribute('nonce', a.nonce);
    s.textContent = css;
    at.prepend(s);
  }
}

/** A write that tzslot must not report back: `onChange` is muted around it. */
export function muter(): { readonly on: boolean; run(f: () => void): void } {
  let n = 0;
  return {
    get on() {
      return n > 0;
    },
    run(f) {
      n++;
      try {
        f();
      } finally {
        n--;
      }
    },
  };
}

/**
 * Each named button of the widget and its panel also says what it shows (WCAG 2.5.3, label in
 * name): tzslot names a date field's trigger by its subject only (T1), and its month title by
 * its action (T9). Kept up as tzslot repaints.
 */
export function named(...roots: HTMLElement[]): () => void {
  const fix = (): void => {
    for (const r of roots)
      for (const b of r.querySelectorAll<HTMLElement>('button[aria-label]')) {
        const text = b.textContent!.trim();
        const label = b.getAttribute('aria-label')!;
        // A day cell is named by its date already (its number may be Latin, its name in the locale's digits).
        if (/[\p{L}\p{N}]/u.test(text) && !b.dataset['date'] && !label.includes(text)) b.setAttribute('aria-label', `${label}, ${text}`);
      }
  };
  const Watch = roots[0]!.ownerDocument.defaultView?.MutationObserver;
  const mo = Watch && new Watch(fix);
  for (const r of roots) mo?.observe(r, { attributes: true, attributeFilter: ['aria-label'], subtree: true, childList: true, characterData: true });
  fix();
  return () => mo?.disconnect();
}
