# Ready cell parts: badge and yes/no (`@dzgrid/dom/parts`, step 20)

Plan: `docs/phase-3-steps/step20-parts-blueprint.md`; decisions: `step20-decisions.md` (Q1, Q2).

## What the user does
Reads a status column ("Done", "Late", "On hold") and a yes/no column, scrolls, sorts, filters and searches them, in French, English or Arabic, light or dark, with more contrast or forced colours.

## What they observe
- **A status as a small label with a frame:** the value's label inside a rounded frame tinted by its tone. Five tones: neutral, info, success, warning, danger. Besides the colour, each tone but neutral carries a small shape before the label: ✓ success, ! warning, ✕ danger, i info. Colour is never the only sign; the shape and the label are enough in grey.
- **A screen reader reads the label only** ("Late"): the shape is hidden from it, and the tone is never said (the label already says it).
- **A yes/no cell reads "✓ Yes" or "✗ No"** in the grid's language (Oui / Non, نعم / لا), with no tone colour: a "no" is not an error. An empty value shows nothing. A screen reader reads "Yes" or "No".
- **Right to left:** the shape stays at the start of the label (on its right in Arabic); nothing is mirrored; an Arabic or Latin label reads in its own direction.
- **Sorting, filters, quick search and CSV** treat these columns exactly as plain text columns: the label is what is searched and written; the drawing changes nothing.
- **A selected or hovered row** keeps the badges readable: the frame has its own surface.
- **Forced colours (Windows):** the frame is drawn in the text colour, on the system's surface, in a selected row too; the shapes stay.

## What DzGrid does
- **`badge({ tones?, fallback? })`** returns a cell part the host registers by name: `parts: { statusBadge: badge({ tones: { done: 'success', late: 'danger' } }) }`, used through `ui.cell: 'statusBadge'`. One `badge()` per mapping: several columns may share it or each have their own.
- **`classes`** (showcase themes step 6, owner T5): the host's classes per tone, put beside `dzg-badge`
  (`badge({ tones, classes: { danger: 'bg-red-50 text-red-900' } })`): a framework's utilities restyle a pill
  by its tone (the fallback tone's class for a value the map does not name); the tone's `data-tone` and
  shape stay, a tone `classes` does not name keeps the badge's own class only, and `dzg-` names are ignored. The theme's look is in the cascade layer `dzgrid`, so these classes win without `!important`.
- **The label is the cell's `text`**, what the grid would show (an enum's label; an unknown value shows the value). **The tone is `tones[String(value)]`**, else `fallback` (default `neutral`). A null or blank value leaves the cell empty.
- **`cellBoolean`** is a cell part registered as `'cell.boolean'`: every boolean column takes it (the type's default name, `parts.md`). True: `✓` and `msg('cell.yes')`; false: `✗` and `msg('cell.no')`; null: empty. The codec's own text (`true` / `false`) is not used: it is not translated.
- **Their DOM:** `<span class="dzg-badge" data-tone="success"><span class="dzg-glyph" aria-hidden="true">✓</span><span dir="auto">Done</span></span>` (no glyph span for neutral); a yes/no cell: `<span class="dzg-bool"><span class="dzg-glyph" aria-hidden="true">✓</span><span dir="auto">Yes</span></span>` (one drawing for both). Nothing focusable: the cell keeps the grid's keys.
- **Pooled cells:** each part mounts once in a pooled cell and updates on rebinding: the same elements, new text and tone; a value going to null empties the host and back to a value draws again. An update with nothing changed writes nothing.
- **A part that throws** (a `tones` object that throws when read, a bundle without `cell.yes`) follows the parts rule: that cell is empty, the error goes to `reportError` once, the part is not tried again on that row until its data changes.
- **Texts:** `cell.yes`, `cell.no`, in their own bundles `@dzgrid/dom/locales/{en,fr,ar}-parts` (`EN_PARTS`, `FR_PARTS`, `AR_PARTS`), spread by the host into its messages; `PARTS_KEYS` lists them. Not the filters' `filter.yes` / `filter.no`: a grid may have yes/no cells and no filters.
- **No feature, no setup:** `@dzgrid/dom/parts` exports parts only; it injects no style and reaches no internal module. Colours, frame and spacing are the theme's (`@dzgrid/theme`): `.dzg-badge`, `[data-tone]`, `.dzg-glyph`, `.dzg-bool`, logical sides only.
- **Theme:** a tenth palette colour `--tz-success` (green, light `#15803d`, dark `#4ade80`). Tone colours: neutral `--tz-fg-muted`, info `--tz-accent`, success, warning and danger their palette colours. The frame is the tone colour; the surface the tone mixed at 12 % into `--tz-bg`; the label `--tz-fg`; the shape the tone colour. Contrast checked per tone (`contrast-pairs.json`): the tone on the page and on the badge surface at 3:1, the label on the badge surface at 4.5:1, the tone on a selected row at 3:1.

## Not done here
- A class per cell from the host: `ui.cellClass`, done at step 26 (owner Q3); a class per tone: `classes`, showcase themes step 6.
- `filter.yes` / `filter.no` stay the filters'.

## Tests
`packages/dom/test/parts-cells.test.ts`, `parts-guards.test.ts`, `class-hooks.test.ts` (`classes`), the browser checks of `scripts/browser.mjs` (`parts=1`), the theme's contrast pairs. Worked example 2 (the between filter with two sliders, plugins §B2.8): `packages/dom/test/example-between.test.ts` with its fixture `test/fixtures/between-slider.ts`.

## Step 20 review (2026-10-20)
- A value whose text is only spaces is a blank: no badge frame is drawn.
- A tone entry set to `undefined` falls back (`fallback`, then neutral), so a pooled cell never keeps the previous row's tone; only real tones have a glyph.
- The yes/no drawing changes nothing else: quick search does not search boolean columns, and the CSV writes the codec's own text (`true` / `false`).
