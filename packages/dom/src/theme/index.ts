import { problem, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { GridIcons, GridTheme } from '../look.js';
import { setAttr } from '../render/write.js';
import { cleanIcon, ICONS, injectIconStyles } from './icons.js';

/** Every key of `GridTheme`, one variable each, in one string (the smallest to ship); the type below holds the list complete both ways. */
const WORDS = 'bg bgRaised fg fgMuted border accent accentFg danger warning success font radius line pillRadius cellPaddingInline cellPaddingBlock space targetMin cellFontSize numFigures cellAlignBlock headerBg headerFg headerSize headerWeight headerFontFamily headerTracking headerCase headerAlignBlock headerHoverBg frame frameRadius rowLine columnLine headerLine headerSeparator headerSeparatorSize headerSeparatorHeight pinnedColumnLine pinnedShadow detailLine rowOddBg rowHoverBg rowSelectedBg rowActiveBg cellActiveBg columnHoverBg focusRing focusWidth selectBar staleFg contextFg toggleFg detailBg groupRowBg pinnedBg pinnedLine busyBar flashColor freshColor freshBg freshBar savingColor savedColor refusedColor refusedBg editorBorder rangeBg rangeEdge fillHandle moveBar resizeMode searchMark findColor findBg findCurrentBg findMark findMarkCurrent boxSize boxRadius boxOnBg boxEdge iconSize popupBg popupShadow tooltipBg tooltipFg inputBg inputBorder buttonBg buttonBorder menuItemHeight menuDisabled panelBg chipBg chipHoverBg controlActiveBg scrollbar scrollbarThumb scrollbarThumbActive rowHoverFg rowSelectedFg rowActiveFg columnSeparator columnSeparatorSize columnSeparatorHeight lastRowLine lastColumnLine headerSeparatorEnd headerPaddingInline headerButtonFg headerButtonActiveFg headerGroupLine sortFg inputFg inputRadius buttonFg buttonRadius popupRadius popupBorder popupPadding optionSelectedBg tooltipFontSize tooltipFontFamily tooltipFontWeight tooltipLineHeight tooltipMaxWidth tooltipPaddingBlock tooltipPaddingInline tooltipRadius tooltipWhiteSpace tooltipArrowSize tooltipArrowColor overlayFg overlayBg footerBg footerFg sortNoneFg buttonFontWeight buttonPaddingInline buttonHeight buttonHoverBg buttonHoverFg buttonActiveBg buttonPrimaryBg buttonPrimaryFg buttonPrimaryBorder buttonPrimaryHoverBg buttonPrimaryHoverFg buttonPrimaryActiveBg setListMinWidth setListMaxWidth';
/** The `theme` setting's keys (the guide's table lists the same). */
export const THEME_KEYS = WORDS.split(' ') as readonly (keyof GridTheme)[];
const K = new Set<string>(THEME_KEYS);
// Each key of the type in the string and nothing else: a key missing either way is a type error.
type Words<S extends string, A = never> = S extends `${infer W} ${infer R}` ? Words<R, A | W> : A | S;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const complete: Same<Words<typeof WORDS>, keyof GridTheme> = true;
void complete;
/** The palette's keys: `--tz-*`, shared with tzslot. */
const TZ = new Set(THEME_KEYS.slice(0, 10));
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** What could break out of a declaration or load something (21): `url(`, and an image's other spellings. */
const BAD = /[;{}<\\!]|(url|src|image(-set)?)\(/i;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * `theming()` (docs/behaviors/presentation-settings.md 16–23, 1.9.0): writes `settings.theme` as CSS variables on the
 * grid's root and draws `settings.icons` over the grid's marks, both live; a bad key, value or icon is told
 * (`invalid-setting`) and skipped, never thrown. Its own entry, so a grid without them carries none of it.
 *
 * ```ts
 * import { theming } from '@dzgrid/dom/theme';
 * import '@dzgrid/theme/variables.css'; // the knobs beyond the base's
 * createGrid(host, { …, theme: { rowOddBg: 'light-dark(#f8fafc, #1f1f23)', headerWeight: 500 }, icons: { sortAsc: '<svg …>' }, features: [theming()] });
 * ```
 */
export function theming(): GridFeature {
  return {
    id: 'theme',
    setup(x) {
      const g = x as GridContext<unknown>;
      const root = g.el.root;
      const style = root.style;
      if (g.settings.injectStyles !== false) {
        const at = root.getRootNode();
        injectIconStyles(at.nodeType === 11 ? (at as ShadowRoot) : g.doc, g.settings.nonce);
      }
      let theme: GridTheme | undefined;
      let icons: GridIcons | undefined;
      let vars: string[] = [];
      let marks: string[] = [];
      /** Writes `next` (name → value), takes away what the last call wrote and this one does not. */
      const write = (last: string[], next: [string, string][]): string[] => {
        for (const [n, v] of next) style.setProperty(n, v);
        const names = next.map(([n]) => n);
        for (const n of last) if (!names.includes(n)) style.removeProperty(n);
        return names;
      };
      const apply = (): void => {
        const s = g.settings;
        const told: Problem[] = [];
        const bad = (path: string, detail: string) => told.push(problem('invalid-setting', 'warning', path, detail));
        if (s.theme !== theme) {
          theme = s.theme;
          const next: [string, string][] = [];
          for (const [k, v] of Object.entries(theme ?? {})) {
            if (K.has(k) && (typeof v == 'number' ? Number.isFinite(v) : typeof v == 'string' && !BAD.test(v))) next.push([(TZ.has(k as never) ? '--tz-' : '--dzg-') + kebab(k), String(v)]);
            else bad(`settings.theme.${k}`, String(v).slice(0, 80));
          }
          vars = write(vars, next);
        }
        if (s.icons !== icons) {
          icons = s.icons;
          const next: [string, string][] = [];
          for (const [k, v] of Object.entries(icons ?? {})) {
            if (!own(ICONS, k)) {
              bad(`settings.icons.${k}`, 'unknown');
              continue;
            }
            const r = cleanIcon(v);
            if ('refused' in r) bad(`settings.icons.${k}`, r.refused);
            else next.push([`--dzg-icon-${kebab(k)}`, `url("data:image/svg+xml,${encodeURIComponent(r.ok)}")`]);
          }
          marks = write(marks, next);
          setAttr(root, 'data-dzg-icons', marks.map((n) => n.slice(11)).join(' ') || null);
        }
        if (told.length) emit(g.kernel, { type: 'problems', source: 'host', problems: told });
      };
      apply();
      return {
        beforeRows: apply,
        destroy() {
          vars = write(vars, []);
          marks = write(marks, []);
        },
      };
    },
  };
}
