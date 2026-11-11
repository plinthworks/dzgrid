import { problem, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { GridFeature } from '../features.js';
import type { GridIcons, GridTheme } from '../look.js';
import { setAttr } from '../render/write.js';
import { cleanIcon, ICONS, injectIconStyles } from './icons.js';

/** Every key of `GridTheme`, one variable each (the type holds the list complete both ways). */
const K: Record<keyof GridTheme, 0> = {
  bg: 0, bgRaised: 0, fg: 0, fgMuted: 0, border: 0, accent: 0, accentFg: 0, danger: 0, warning: 0, success: 0,
  font: 0, radius: 0, line: 0, pillRadius: 0, cellPaddingInline: 0, cellPaddingBlock: 0, space: 0, targetMin: 0, cellFontSize: 0, numFigures: 0, cellAlignBlock: 0,
  headerBg: 0, headerFg: 0, headerSize: 0, headerWeight: 0, headerFontFamily: 0, headerTracking: 0, headerCase: 0, headerAlignBlock: 0, headerHoverBg: 0,
  frame: 0, frameRadius: 0, rowLine: 0, columnLine: 0, headerLine: 0, headerSeparator: 0, headerSeparatorSize: 0, headerSeparatorHeight: 0, pinnedColumnLine: 0, pinnedShadow: 0, detailLine: 0,
  rowOddBg: 0, rowHoverBg: 0, rowSelectedBg: 0, rowActiveBg: 0, cellActiveBg: 0, columnHoverBg: 0, focusRing: 0, focusWidth: 0, selectBar: 0, staleFg: 0, contextFg: 0,
  toggleFg: 0, detailBg: 0, groupRowBg: 0, pinnedBg: 0, pinnedLine: 0,
  busyBar: 0, flashColor: 0, freshColor: 0, freshBg: 0, freshBar: 0, savingColor: 0, savedColor: 0, refusedColor: 0, refusedBg: 0, editorBorder: 0,
  rangeBg: 0, rangeEdge: 0, fillHandle: 0, moveBar: 0, resizeMode: 0, searchMark: 0, findColor: 0, findBg: 0, findCurrentBg: 0, findMark: 0, findMarkCurrent: 0,
  boxSize: 0, boxRadius: 0, boxOnBg: 0, boxEdge: 0, iconSize: 0, popupBg: 0, popupShadow: 0, tooltipBg: 0, tooltipFg: 0, inputBg: 0,
  inputBorder: 0, buttonBg: 0, buttonBorder: 0, menuItemHeight: 0, menuDisabled: 0, panelBg: 0, chipBg: 0, chipHoverBg: 0, controlActiveBg: 0, scrollbar: 0,
  scrollbarThumb: 0, scrollbarThumbActive: 0,
};
/** The `theme` setting's keys (the guide's table lists the same). */
export const THEME_KEYS = Object.keys(K) as readonly (keyof GridTheme)[];
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
            if (own(K, k) && (typeof v == 'number' ? Number.isFinite(v) : typeof v == 'string' && !BAD.test(v))) next.push([(TZ.has(k as never) ? '--tz-' : '--dzg-') + kebab(k), String(v)]);
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
