/**
 * The `theme` and `icons` settings' types (docs/behaviors/presentation-settings.md 17–22, 1.9.0, owner B and Q7). Types
 * only: the base carries no code for them; `theming()` (`@dzgrid/dom/theme`) writes them.
 */

/** A variable's value: a CSS value (no `;`, `{`, `}`, `<`, `\`, `!`, `url(`, `image(`, `image-set(`, `src(`), or a number written as is (`600`). */
export type ThemeValue = string | number;

/**
 * Each key is one CSS variable, written on the grid's root: the palette's `--tz-*` (`bgRaised` → `--tz-bg-raised`), the
 * rest `--dzg-*` in camel case (`rowOddBg` → `--dzg-row-odd-bg`). The variables of `@dzgrid/theme/variables.css` need
 * that sheet; the guide (theming-rtl.md) lists every one with its default.
 */
export interface GridTheme {
  // The palette (shared with tzslot), each usually a `light-dark()` pair.
  readonly bg?: ThemeValue; readonly bgRaised?: ThemeValue; readonly fg?: ThemeValue; readonly fgMuted?: ThemeValue; readonly border?: ThemeValue;
  readonly accent?: ThemeValue; readonly accentFg?: ThemeValue; readonly danger?: ThemeValue; readonly warning?: ThemeValue; readonly success?: ThemeValue;
  // Shape and type.
  readonly font?: ThemeValue; readonly radius?: ThemeValue; readonly line?: ThemeValue; readonly pillRadius?: ThemeValue; readonly cellPaddingInline?: ThemeValue;
  readonly cellPaddingBlock?: ThemeValue; readonly space?: ThemeValue; readonly targetMin?: ThemeValue; readonly cellFontSize?: ThemeValue; readonly numFigures?: ThemeValue;
  readonly cellAlignBlock?: ThemeValue;
  // Header.
  readonly headerBg?: ThemeValue; readonly headerFg?: ThemeValue; readonly headerSize?: ThemeValue; readonly headerWeight?: ThemeValue; readonly headerFontFamily?: ThemeValue;
  readonly headerTracking?: ThemeValue; readonly headerCase?: ThemeValue; readonly headerAlignBlock?: ThemeValue; readonly headerHoverBg?: ThemeValue;
  // Lines.
  readonly frame?: ThemeValue; readonly frameRadius?: ThemeValue; readonly rowLine?: ThemeValue; readonly columnLine?: ThemeValue; readonly headerLine?: ThemeValue;
  readonly headerSeparator?: ThemeValue; readonly headerSeparatorSize?: ThemeValue; readonly headerSeparatorHeight?: ThemeValue; readonly pinnedColumnLine?: ThemeValue;
  readonly pinnedShadow?: ThemeValue; readonly detailLine?: ThemeValue;
  // Rows and cells.
  readonly rowOddBg?: ThemeValue; readonly rowHoverBg?: ThemeValue; readonly rowSelectedBg?: ThemeValue; readonly rowActiveBg?: ThemeValue; readonly cellActiveBg?: ThemeValue;
  /** The hovered column's tint, drawn by `columnHover()`; unset, nothing is drawn. */
  readonly columnHoverBg?: ThemeValue;
  readonly focusRing?: ThemeValue; readonly focusWidth?: ThemeValue; readonly selectBar?: ThemeValue; readonly staleFg?: ThemeValue; readonly contextFg?: ThemeValue;
  readonly toggleFg?: ThemeValue; readonly detailBg?: ThemeValue; readonly groupRowBg?: ThemeValue; readonly pinnedBg?: ThemeValue; readonly pinnedLine?: ThemeValue;
  // States and marks.
  readonly busyBar?: ThemeValue; readonly flashColor?: ThemeValue; readonly freshColor?: ThemeValue; readonly freshBg?: ThemeValue; readonly freshBar?: ThemeValue;
  readonly savingColor?: ThemeValue; readonly savedColor?: ThemeValue; readonly refusedColor?: ThemeValue; readonly refusedBg?: ThemeValue; readonly editorBorder?: ThemeValue;
  readonly rangeBg?: ThemeValue; readonly rangeEdge?: ThemeValue; readonly fillHandle?: ThemeValue; readonly moveBar?: ThemeValue; readonly resizeMode?: ThemeValue;
  readonly searchMark?: ThemeValue; readonly findColor?: ThemeValue; readonly findBg?: ThemeValue; readonly findCurrentBg?: ThemeValue; readonly findMark?: ThemeValue;
  readonly findMarkCurrent?: ThemeValue;
  // Controls, popups, panels.
  readonly boxSize?: ThemeValue; readonly boxRadius?: ThemeValue; readonly boxOnBg?: ThemeValue; readonly boxEdge?: ThemeValue; readonly iconSize?: ThemeValue;
  readonly popupBg?: ThemeValue; readonly popupShadow?: ThemeValue; readonly tooltipBg?: ThemeValue; readonly tooltipFg?: ThemeValue; readonly inputBg?: ThemeValue;
  readonly inputBorder?: ThemeValue; readonly buttonBg?: ThemeValue; readonly buttonBorder?: ThemeValue; readonly menuItemHeight?: ThemeValue; readonly menuDisabled?: ThemeValue;
  readonly panelBg?: ThemeValue; readonly chipBg?: ThemeValue; readonly chipHoverBg?: ThemeValue; readonly controlActiveBg?: ThemeValue; readonly scrollbar?: ThemeValue;
  readonly scrollbarThumb?: ThemeValue; readonly scrollbarThumbActive?: ThemeValue;
  // Rows' text (1.12.0): unset, the row's colour.
  readonly rowHoverFg?: ThemeValue; readonly rowSelectedFg?: ThemeValue; readonly rowActiveFg?: ThemeValue;
  // A mark between columns (a colour; size, height), the last row's and last column's lines, the resize mark after the last column.
  readonly columnSeparator?: ThemeValue; readonly columnSeparatorSize?: ThemeValue; readonly columnSeparatorHeight?: ThemeValue; readonly lastRowLine?: ThemeValue; readonly lastColumnLine?: ThemeValue;
  readonly headerSeparatorEnd?: ThemeValue;
  // Header: side padding, buttons' colours, a group's end line, the sort marks.
  readonly headerPaddingInline?: ThemeValue; readonly headerButtonFg?: ThemeValue; readonly headerButtonActiveFg?: ThemeValue; readonly headerGroupLine?: ThemeValue; readonly sortFg?: ThemeValue;
  // Inputs, buttons, popups, a set filter's ticked value.
  readonly inputFg?: ThemeValue; readonly inputRadius?: ThemeValue; readonly buttonFg?: ThemeValue; readonly buttonRadius?: ThemeValue; readonly popupRadius?: ThemeValue;
  readonly popupBorder?: ThemeValue; readonly popupPadding?: ThemeValue; readonly optionSelectedBg?: ThemeValue;
  // The tooltip and its arrow (`tooltipArrowSize: 0` turns it off).
  readonly tooltipFontSize?: ThemeValue; readonly tooltipFontFamily?: ThemeValue; readonly tooltipFontWeight?: ThemeValue; readonly tooltipLineHeight?: ThemeValue; readonly tooltipMaxWidth?: ThemeValue;
  readonly tooltipPaddingBlock?: ThemeValue; readonly tooltipPaddingInline?: ThemeValue; readonly tooltipRadius?: ThemeValue; readonly tooltipWhiteSpace?: ThemeValue; readonly tooltipArrowSize?: ThemeValue;
  readonly tooltipArrowColor?: ThemeValue;
  // Overlay and pager footer.
  readonly overlayFg?: ThemeValue; readonly overlayBg?: ThemeValue; readonly footerBg?: ThemeValue; readonly footerFg?: ThemeValue;
  /** The unsorted mark's colour (`icons.sortNone`); the sorted one's by default. */
  readonly sortNoneFg?: ThemeValue;
  // The popups' buttons (`@dzgrid/theme/buttons.css`): weight, side padding, height; under the pointer and pressed (unset: no
  // change); the primary one (Apply) and its states.
  readonly buttonFontWeight?: ThemeValue; readonly buttonPaddingInline?: ThemeValue; readonly buttonHeight?: ThemeValue; readonly buttonHoverBg?: ThemeValue;
  readonly buttonHoverFg?: ThemeValue; readonly buttonActiveBg?: ThemeValue; readonly buttonPrimaryBg?: ThemeValue; readonly buttonPrimaryFg?: ThemeValue;
  readonly buttonPrimaryBorder?: ThemeValue; readonly buttonPrimaryHoverBg?: ThemeValue; readonly buttonPrimaryHoverFg?: ThemeValue; readonly buttonPrimaryActiveBg?: ThemeValue;
  /** The popups' buttons' and the overlay's Retry's text size (`1em`: their popup's); the pager's too unless `--dzg-pager-button-font-size` (a CSS variable) is set. */
  readonly buttonFontSize?: ThemeValue;
  /** The set filter's list: at least (14rem) and at most (`min(32rem, 90vw)`) as wide as its longest value needs. */
  readonly setListMinWidth?: ThemeValue; readonly setListMaxWidth?: ThemeValue;
}

/** An icon: an SVG's text, or an `SVGElement` (copied). Drawn in the mark's colour and size; cleaned, else refused (the default kept). */
export type GridIcon = string | SVGElement;

/** The grid's marks an application may draw itself (presentation-settings.md 17). */
export interface GridIcons {
  readonly sortAsc?: GridIcon;
  readonly sortDesc?: GridIcon;
  /** A sortable column that is not sorted (1.12.0): not given, such a column shows no mark. Decorative (hidden from screen readers). */
  readonly sortNone?: GridIcon;
  /** The header's filter button. */
  readonly filter?: GridIcon;
  /** A filtered column's filter button; `filter` (in the accent) otherwise. */
  readonly filterActive?: GridIcon;
  /** The column menu's button. */
  readonly menu?: GridIcon;
  /** A tree's, a detail's and a header group's toggle, pointing to the inline end when closed (turned and mirrored as the default). */
  readonly chevron?: GridIcon;
  /** A menu item's submenu mark (mirrored in right to left). */
  readonly submenu?: GridIcon;
  /** The handle a row is moved by. */
  readonly grip?: GridIcon;
  /**
   * The pager's first, previous, next and last marks (1.12.0, presentation-settings.md 41): each drawn only when given
   * (the « « ‹ › » » characters otherwise), in the pager button's colour, at its text size or `--dzg-icon-size`; drawn
   * as for left to right and mirrored in right to left (previous points to the line's start). Names unchanged.
   */
  readonly pagerFirst?: GridIcon;
  readonly pagerPrevious?: GridIcon;
  readonly pagerNext?: GridIcon;
  readonly pagerLast?: GridIcon;
}
